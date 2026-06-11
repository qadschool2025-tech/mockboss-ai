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
// PANEL INTEGRATION:
// - Accepts an OPTIONAL `panelMember`. Nothing passes this field until engine.ts
//   is updated in Commit 2.
// - When present, a protected "panel" layer is injected.
// - The panel layer only presents the already resolved active member.
// - No rotation, plan, scoring, report, UI, voice, Supabase, or trigger logic lives here.
// - Weight 90 keeps Director at weight 95 as the final tactical instruction.
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

// Constants

const SYSTEM_PROMPT_CHAR_LIMIT = 12_000

const PROTECTED_LAYER_LABELS = new Set([
  'identity',
  'response_style',
  'language',
  'scoring',
  'director',
  'panel',
])

// Input Types

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

// Main Builder

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

  const allLayers: SystemLayer[] = [
    buildIdentityLayer(),
    buildResponseStyleLayer(),
    buildSessionContextLayer(config),

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
  ]

  if (panelMember) {
    allLayers.push(buildPanelLayer(panelMember))
  }

  if (directorDecision) {
    allLayers.push(buildDirectorLayer(directorDecision))
  }

  const sorted = [...allLayers].sort((a, b) => a.weight - b.weight)

  const skippedLayers: string[] = []
  const activeLayers = sorted.filter(layer => {
    if (layer.content.trim() === '') {
      skippedLayers.push(layer.label)
      return false
    }
    return true
  })

  const { layers: budgetedLayers, truncated } = enforceBudget(
    activeLayers,
    SYSTEM_PROMPT_CHAR_LIMIT
  )

  const systemPrompt = budgetedLayers
    .map(l => l.content.trim())
    .join('\n\n')

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

// Panel Layer

function buildPanelLayer(member: ResolvedPanelMember): SystemLayer {
  return {
    label: 'panel',
    weight: 90,
    content:
      'INTERVIEW PANEL - ACTIVE MEMBER (mandatory)\n' +
      'You are currently speaking as the following panel member. Every question and remark on your next turn must come from this member, strictly within their mandate.\n' +
      `Member: ${member.displayTitle}\n` +
      `Mandate (hard constraints, never ask or evaluate outside them):\n${member.mandate}\n` +
      `Pressure style:\n${member.pressureStyle}\n` +
      'Never mention the panel mechanics, the rotation, or that other members exist unless a handover line is explicitly directed. Never reveal any verdict or score.',
  }
}

// Director Layer

function buildDirectorLayer(decision: DirectorDecision): SystemLayer {
  if (decision.intent === 'FINAL_QUESTION') {
    return {
      label:  'director',
      weight: 95,
      content:
        'INTERVIEW DIRECTOR - FINAL QUESTION (mandatory)\n' +
        'The interview is in its final stretch.\n' +
        'Do NOT open a new topic, competency, contradiction, or pressure line.\n' +
        'Ask ONE last consolidating question, in a single concise sentence, that lets the candidate add the single most important thing still missing. Then stop.',
    }
  }

  if (decision.intent === 'INVITE_QUESTIONS') {
    return {
      label:  'director',
      weight: 95,
      content:
        'INTERVIEW DIRECTOR - PREPARE TO CLOSE (mandatory)\n' +
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
      'INTERVIEW DIRECTOR - NEXT MOVE (mandatory)\n' +
      'Execute exactly this move on your next turn. Do not choose a different direction.\n' +
      `Move: ${decision.intent}\n` +
      `${directive}${target}`,
  }
}

// Opening Message

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

// Budget Enforcement

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

  const protectedLayers = layers.filter(l => PROTECTED_LAYER_LABELS.has(l.label))
  const unprotectedLayers = layers.filter(l => !PROTECTED_LAYER_LABELS.has(l.label))

  for (const l of protectedLayers) {
    result.push(l)
    remaining -= l.content.length
  }

  for (const l of unprotectedLayers) {
    if (remaining <= 0) {
      skippedInTruncation(l.label)
      truncated = true
      continue
    }

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
  }

  result.sort((a, b) => a.weight - b.weight)

  return { layers: result, truncated }
}

function skippedInTruncation(label: string): void {
  console.warn(`[prompt-builder] Layer "${label}" skipped due to budget overflow.`)
}

// Debug Helper

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
