// lib/barbaros/prompt/prompt-builder.ts
// Assembles the final system prompt from ordered layers.
// Consumed by: engine.ts, passes result to claude-client.ts.
//
// Rules:
// - Orchestrator only. Zero business logic.
// - Skips empty layers, content === ''.
// - Sorts by weight before assembly.
// - Token budget enforced. Logs warning if over limit, truncates gracefully.
// - Opening message built separately. Injected as first user turn, not system prompt.
//
// DIRECTOR INTEGRATION:
// - Accepts an OPTIONAL `directorDecision`. When present, a protected
//   "director" directive layer is injected instructing the LLM to EXECUTE the
//   chosen tactical move rather than pick its own. The intent to instruction
//   mapping below is the Language Layer, presentation of an already-made
//   decision, not decision-making. It can later move to system-layers.ts.
//
// PANEL INTEGRATION (Step 3, Commit 1 — INERT until engine.ts passes it):
// - Accepts an OPTIONAL `panelMember` (ResolvedPanelMember). When present, a
//   protected "panel" persona layer is injected: the active member's display
//   title, their mandate as HARD constraints, and their pressure style.
//   Same presentation-only pattern as the Director layer — the rotation
//   decision is made by panel-rotation.ts, never here.
// - Weight 90, just below the Director layer (95): the member persona frames
//   WHO is speaking; the Director directive remains the final, most salient
//   instruction on WHAT move to execute.
// - Nobody passes this field yet. Behavior is unchanged until Commit 2.
//
// CLOSING WINDOW, layer 3, graceful wind-down:
// - The Director now signals the close with two dedicated session-level intents:
//     FINAL_QUESTION   -> one last consolidating question. Do NOT open a new topic.
//     INVITE_QUESTIONS -> no new evaluation question. Invite the candidate's own
//                         final question and prepare to close.
//   The actual farewell + report handoff is owned by the engine
//   buildEndOfSessionOutput and page.tsx.

import type { InterviewConfig }        from '../types'
import type { SessionState }           from '../state/session-state'
import type { TrackedWeakness }        from '../longitudinal/weakness-tracker'
import type { TrackedGrowth }          from '../longitudinal/growth-tracker'
import type { DirectorDecision, DirectorIntent } from '../director'
import type { ResolvedPanelMember }    from '../panel/panel-roles'
import {
buildIdentityLayer,
buildResponseStyleLayer,
buildSessionContextLayer,
buildCvJobContextLayer,
buildLanguageLayer,
buildStructureLayer,
buildPressureLayer,
buildWeaknessLayer,
buildGrowthLayer,
buildScoringLayer,
buildTimeLayer,
type SystemLayer,
} from './system-layers'
import { BARBAROS_OPENING_TEMPLATES } from './personality'

// ─── Constants ────────────────────────────────────────────────────────────────

// Approximate token budget for system prompt.
// claude-sonnet context is large, but we want the system prompt lean.
// 1 token ≈ 4 chars. 3000 tokens ≈ 12000 chars.
const SYSTEM_PROMPT_CHAR_LIMIT = 12_000

// Layers that must never be truncated even if over budget.
const PROTECTED_LAYER_LABELS = new Set([
'identity',
'response_style',
'language',
'scoring',
'director',
'panel',
])

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface PromptBuilderInput {
config:         InterviewConfig
state:          SessionState
weaknesses:     TrackedWeakness[]
growthSignals:  TrackedGrowth[]
elapsedMinutes: number
totalMinutes:   number
isFirstSession: boolean
directorDecision?: DirectorDecision
panelMember?:      ResolvedPanelMember
}

export interface BuiltPrompt {
systemPrompt:   string
openingMessage: string | null
layerCount:     number
charCount:      number
truncated:      boolean
skippedLayers:  string[]
}

// ─── Main Builder ─────────────────────────────────────────────────────────────

/**

* buildPrompt
*
* Assembles all layers into a final system prompt.
* Pure function. No side effects, no LLM calls.
*
* @param input - all context needed to build the prompt
* @param isFirstMessage - true only on the very first message of the session
  */
  export function buildPrompt(
  input:          PromptBuilderInput,
  isFirstMessage: boolean
  ): BuiltPrompt {
  const {
  config,
  state,
  weaknesses,
  growthSignals,
  elapsedMinutes,
  totalMinutes,
  isFirstSession,
  directorDecision,
  panelMember,
  } = input

// Build all layers.
const allLayers: SystemLayer[] = [
buildIdentityLayer(),
buildResponseStyleLayer(),
buildSessionContextLayer(config),

```
// CV source context only.
// This gives Barbaros access to CV facts and job requirements,
// without changing his identity, tone, pressure style, voice, or closing flow.
buildCvJobContextLayer(config),

buildLanguageLayer(config.language),
buildStructureLayer(state.phase),
buildPressureLayer(state),
buildWeaknessLayer(weaknesses, isFirstSession),
buildGrowthLayer(growthSignals, isFirstSession),
buildScoringLayer(),
buildTimeLayer(elapsedMinutes, totalMinutes),
```

]

// Panel member persona. Only when the engine supplies an active member.
// Inert until engine.ts (Commit 2) passes it for panel plans.
if (panelMember) {
allLayers.push(buildPanelLayer(panelMember))
}

// Director directive. Only when a decision is supplied, never on first turn.
if (directorDecision) {
allLayers.push(buildDirectorLayer(directorDecision))
}

// Sort by weight, ascending.
const sorted = [...allLayers].sort((a, b) => a.weight - b.weight)

// Separate empty layers.
const skippedLayers: string[] = []
const activeLayers = sorted.filter(layer => {
if (layer.content.trim() === '') {
skippedLayers.push(layer.label)
return false
}
return true
})

// Enforce token budget. Truncate non-protected layers if over limit.
const { layers: budgetedLayers, truncated } = enforceBudget(
activeLayers,
SYSTEM_PROMPT_CHAR_LIMIT
)

// Assemble layers with double newlines for readability.
const systemPrompt = budgetedLayers
.map(l => l.content.trim())
.join('\n\n')

// Opening message. Injected only on first message of session.
const openingMessage = isFirstMessage
? buildOpeningMessage(config)
: null

return {
systemPrompt,
openingMessage,
layerCount:    budgetedLayers.length,
charCount:     systemPrompt.length,
truncated,
skippedLayers,
}
}

// ─── Panel Layer, Language Layer ──────────────────────────────────────────────

/**

* buildPanelLayer
* Translates an already-resolved active panel member into a mandatory persona
* instruction for the LLM. This is presentation of a rotation decision made by
* panel-rotation.ts, not decision-making. Weight 90: below the Director (95)
* so the tactical move remains the final salient instruction, executed in this
* member's persona. Protected so the mandate is never truncated — it is a
* structural constraint, not flavor text.
*
* `mandate` and `pressureStyle` arrive already resolved to the session
* language by resolvePanelForConfig(), so they are injected verbatim.
  */
  function buildPanelLayer(member: ResolvedPanelMember): SystemLayer {
  return {
  label:  'panel',
  weight: 90,
  content:
  'INTERVIEW PANEL — ACTIVE MEMBER (mandatory)\n' +
  'You are currently speaking as the following panel member. Every question and remark on your next turn must come from this member, strictly within their mandate.\n' +
  `Member: ${member.displayTitle}\n` +
  `Mandate (hard constraints — never ask or evaluate outside them):\n${member.mandate}\n` +
  `Pressure style:\n${member.pressureStyle}\n` +
  'Never mention the panel mechanics, the rotation, or that other members exist unless a handover line is explicitly directed. Never reveal any verdict or score.',
  }
  }

// ─── Director Layer, Language Layer ───────────────────────────────────────────

/**

* buildDirectorLayer
* Translates an already-made DirectorDecision into a mandatory instruction for
* the LLM. This is presentation of a decision, not decision-making. The choice
* was made by decide-next-move.ts. High weight so it reads as the final, most
* salient instruction. Protected so it is never truncated.
  */
  function buildDirectorLayer(decision: DirectorDecision): SystemLayer {
  // CLOSING WINDOW, FINAL CONSOLIDATING QUESTION.
  if (decision.intent === 'FINAL_QUESTION') {
  return {
  label:  'director',
  weight: 95,
  content:
  'INTERVIEW DIRECTOR — FINAL QUESTION (mandatory)\n' +
  'The interview is in its final stretch.\n' +
  'Do NOT open a new topic, competency, contradiction, or pressure line.\n' +
  'Ask ONE last consolidating question, in a single concise sentence, that lets the candidate add the single most important thing still missing. Then stop.',
  }
  }

// CLOSING WINDOW, INVITE CANDIDATE QUESTIONS / PREPARE TO CLOSE.
if (decision.intent === 'INVITE_QUESTIONS') {
return {
label:  'director',
weight: 95,
content:
'INTERVIEW DIRECTOR — PREPARE TO CLOSE (mandatory)\n' +
'The interview is nearly out of time.\n' +
'Do NOT ask any new evaluation question, and do NOT open a new topic, challenge, contradiction, or follow-up.\n' +
'In one concise sentence, invite the candidate to ask any final question (for example: "Before we close, do you have any questions about the role or Organisation?"), then prepare to close.\n' +
'Do NOT reveal any verdict, score, or assessment.',
}
}

const directives: Record<DirectorIntent, string> = {
OPEN_NEW_TOPIC:
'Move the interview to a new topic or competency that has not yet been explored. Do not linger on the previous topic.',
GO_DEEPER:
'Stay on the current topic and probe one level deeper. Ask a sharper follow-up that forces more specificity than the candidate has given so far.',
REQUEST_EXAMPLE:
'Ask for one concrete, specific example. Reject generalities. Require an actual situation, the action taken, and the result.',
CHALLENGE:
"Push back on the candidate's last answer. Name the weakness, vagueness, or gap directly and require them to defend or sharpen it. Stay professional, never hostile.",
RAISE_DIFFICULTY:
'The candidate is comfortable. Raise the difficulty: pose a harder, more demanding question within the current topic that tests depth, trade-offs, or edge cases.',
RETURN_TO_PREVIOUS:
'Return to an earlier point the candidate left unresolved or contradicted. Quote back what they said earlier and ask them to reconcile it. Do not let them avoid it.',
CLOSE_TOPIC:
'Wrap up the current topic cleanly. Do not open a major new line of questioning.',
FINAL_QUESTION:
'Ask one last consolidating question. Do not open a new topic. Keep it to a single sentence.',
INVITE_QUESTIONS:
'Do not ask a new evaluation question. Invite the candidate to ask any final question, then prepare to close. Reveal no verdict or score.',
}

const directive = directives[decision.intent]
const target = decision.targetRef ? `\nFocus target: ${decision.targetRef}` : ''

return {
label:   'director',
weight:  95,
content:
'INTERVIEW DIRECTOR — NEXT MOVE (mandatory)\n' +
'Execute exactly this move on your next turn. Do not choose a different direction.\n' +
`Move: ${decision.intent}\n` +
`${directive}${target}`,
}
}

// ─── Opening Message ──────────────────────────────────────────────────────────

/**

* buildOpeningMessage
* Fills the opening template with candidate-specific data.
* Injected as the assistant's first turn, not part of system prompt.
  */
  function buildOpeningMessage(config: InterviewConfig): string {
  const template =
  config.language === 'ar'
  ? BARBAROS_OPENING_TEMPLATES.ar
  : BARBAROS_OPENING_TEMPLATES.en

return template
.replace('{candidateName}', config.candidateName)
.replace('{jobTitle}',      config.jobTitle)
.replace('{institution}',   config.institution)
}

// ─── Budget Enforcement ───────────────────────────────────────────────────────

/**

* enforceBudget
*
* If total char count exceeds limit:
* 1. Protected layers are never touched.
* 2. Largest non-protected layer is truncated first.
* 3. Truncation appends [truncated] marker for debugging.
*
* This is a last-resort safeguard. In practice the prompt should stay well
* under limit. If this fires frequently, session_context or weakness layers
* need their own internal truncation.
  */
  function enforceBudget(
  layers: SystemLayer[],
  limit:  number
  ): { layers: SystemLayer[]; truncated: boolean } {
  const total = layers.reduce((sum, l) => sum + l.content.length, 0)

if (total <= limit) {
return { layers, truncated: false }
}

console.warn(
`[prompt-builder] System prompt over budget: ${total} chars > ${limit} limit. Truncating.`
)

let remaining = limit
const result: SystemLayer[] = []
let truncated = false

// Protected layers first. Guaranteed full.
const protected_  = layers.filter(l => PROTECTED_LAYER_LABELS.has(l.label))
const unprotected = layers.filter(l => !PROTECTED_LAYER_LABELS.has(l.label))

for (const l of protected_) {
result.push(l)
remaining -= l.content.length
}

for (const l of unprotected) {
if (remaining <= 0) {
skippedInTruncation(l.label)
truncated = true
continue
}

```
if (l.content.length <= remaining) {
  result.push(l)
  remaining -= l.content.length
} else {
  const allowedChars = Math.max(remaining - 20, 0)
  result.push({
    ...l,
    content: l.content.slice(0, allowedChars) + '\n[truncated]',
  })
  remaining = 0
  truncated = true
}
```

}

// Restore original weight order after budget pass.
result.sort((a, b) => a.weight - b.weight)

return { layers: result, truncated }
}

function skippedInTruncation(label: string): void {
console.warn(`[prompt-builder] Layer "${label}" skipped due to budget overflow.`)
}

// ─── Debug Helper ─────────────────────────────────────────────────────────────

/**

* describePrompt
* Returns a human-readable summary of what was built.
* Used in development/logging. Never injected into LLM.
  */
  export function describePrompt(built: BuiltPrompt): string {
  const lines = [
  `Layers: ${built.layerCount}`,
  `Chars:  ${built.charCount} / ${SYSTEM_PROMPT_CHAR_LIMIT}`,
  `Truncated: ${built.truncated}`,
  ]

if (built.skippedLayers.length > 0) {
lines.push(`Skipped (empty): ${built.skippedLayers.join(', ')}`)
}

if (built.openingMessage) {
lines.push(`Opening: "${built.openingMessage.slice(0, 60)}..."`)
}

return lines.join('\n')
}
