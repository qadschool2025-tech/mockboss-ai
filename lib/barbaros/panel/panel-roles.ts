// lib/barbaros/panel/panel-roles.ts
// Barbaros Panel — Role Definitions (Step 1 of the three-member panel).
//
// lib/barbaros/panel/panel-roles.ts
// Barbaros Panel — Role Definitions (Step 1 of the three-member panel).
//
// SAFETY: This module is standalone. Nothing imports it yet, so adding it
// cannot break any existing build path. Integration happens in later steps.
//
// DESIGN CONTRACT (anti-decoration guarantee):
// Each panel role OWNS an exclusive set of assessment axes and an exclusive
// questioning mandate. A role may only ask within its mandate, and may only
// evaluate its own axes. This is enforced structurally in later steps by
// feeding role mandates into the Director and prompt layers — the difference
// between members is imposed by architecture, not by phrasing.
//
// PLAN GATING: The panel exists ONLY for 'professional' and 'executive'.
// 'essential' (and any unknown plan) remains the single-interviewer Barbaros
// experience, untouched.

import type { EssentialAxis } from '../scoring/coverage-resolver'

// ─── Role identity ────────────────────────────────────────────────────────────

export type PanelRoleId = 'hr' | 'domain_expert' | 'direct_manager'

export const PANEL_ROLE_ORDER: readonly PanelRoleId[] = [
  'hr',
  'domain_expert',
  'direct_manager',
] as const

export interface PanelRole {
  id: PanelRoleId

  // Display titles. {sector}/{jobTitle} placeholders are resolved by
  // resolvePanelForConfig() so titles feel native to the candidate's world.
  title: { en: string; ar: string }

  // Exclusive assessment axes this role owns. No overlap between roles.
  ownedAxes: readonly EssentialAxis[]

  // Questioning mandate injected into the prompt when this role speaks.
  // Written as hard constraints, not suggestions.
  mandate: { en: string; ar: string }

  // Pressure style: how this role escalates when answers are weak.
  pressureStyle: { en: string; ar: string }
}

// ─── Role definitions ─────────────────────────────────────────────────────────
// Axis ownership map (exclusive, covers all six EssentialAxis values):
//   hr             → role_fit, communication_clarity
//   domain_expert  → domain_expertise, job_requirement_match
//   direct_manager → ownership_level, cv_consistency

export const PANEL_ROLES: Record<PanelRoleId, PanelRole> = {
  hr: {
    id: 'hr',
    title: {
      en: 'HR Talent Assessor',
      ar: 'مُقيِّم الموارد البشرية',
    },
    ownedAxes: ['role_fit', 'communication_clarity'],
    mandate: {
      en: [
        'You assess ONLY: motivation, role fit, communication clarity, and professional composure.',
        'You MUST NOT ask technical or specialist questions — those belong to the domain expert.',
        'Probe why the candidate wants THIS role at THIS institution, and how clearly they express themselves.',
      ].join(' '),
      ar: [
        'تُقيِّم فقط: الدافع، والملاءمة للدور، ووضوح التواصل، والاتزان المهني.',
        'يُمنع عليك طرح أسئلة تقنية أو تخصصية — فهي من اختصاص خبير التخصص.',
        'استقصِ لماذا يريد المرشح هذا الدور تحديداً في هذه الجهة، ومدى وضوح تعبيره.',
      ].join(' '),
    },
    pressureStyle: {
      en: 'Pressure through precision: when answers are generic, ask for the specific personal reason behind them.',
      ar: 'الضغط بالدقة: عندما تكون الإجابة عامة، اطلب السبب الشخصي المحدد خلفها.',
    },
  },

  domain_expert: {
    id: 'domain_expert',
    title: {
      en: 'Senior {sector} Specialist',
      ar: 'كبير مختصّي {sector}',
    },
    ownedAxes: ['domain_expertise', 'job_requirement_match'],
    mandate: {
      en: [
        'You assess ONLY: depth of professional knowledge, correctness of claimed experience, and match to the stated job requirements.',
        'You MUST NOT ask about motivation or culture fit — those belong to HR.',
        'Every question must be specific to {jobTitle} work. Demand concrete methods, real numbers, and named tools.',
      ].join(' '),
      ar: [
        'تُقيِّم فقط: عمق المعرفة المهنية، وصحة الخبرة المُدّعاة، ومطابقة متطلبات الوظيفة المعلنة.',
        'يُمنع عليك السؤال عن الدافع أو الملاءمة الثقافية — فهي من اختصاص الموارد البشرية.',
        'كل سؤال يجب أن يكون محدداً بعمل {jobTitle}. اطلب أساليب ملموسة وأرقاماً حقيقية وأدوات بأسمائها.',
      ].join(' '),
    },
    pressureStyle: {
      en: 'Pressure through depth: follow every claim with "walk me through exactly how" until evidence appears or collapses.',
      ar: 'الضغط بالعمق: اتبع كل ادّعاء بـ«اشرح لي خطوة بخطوة كيف فعلت ذلك» حتى يظهر الدليل أو ينهار.',
    },
  },

  direct_manager: {
    id: 'direct_manager',
    title: {
      en: 'Hiring Manager',
      ar: 'المدير المباشر',
    },
    ownedAxes: ['ownership_level', 'cv_consistency'],
    mandate: {
      en: [
        'You assess ONLY: behavior under pressure, ownership and decision-making, and consistency between the CV story and live answers.',
        'You MUST NOT re-test technical knowledge — that belongs to the specialist.',
        'Use real workplace scenarios. If the candidate contradicts their CV or an earlier answer, confront it directly.',
      ].join(' '),
      ar: [
        'تُقيِّم فقط: السلوك تحت الضغط، وتحمّل المسؤولية واتخاذ القرار، واتساق قصة السيرة الذاتية مع الإجابات الحية.',
        'يُمنع عليك إعادة اختبار المعرفة التقنية — فهي من اختصاص المختص.',
        'استخدم سيناريوهات عمل واقعية. وإن ناقض المرشح سيرته أو إجابة سابقة، واجِهه بذلك مباشرة.',
      ].join(' '),
    },
    pressureStyle: {
      en: 'Pressure through scenarios: raise the stakes mid-question ("now your deadline is cut in half — what changes?").',
      ar: 'الضغط بالسيناريوهات: ارفع الرهان في منتصف السؤال («الآن قُلّصت مهلتك إلى النصف — ماذا يتغير؟»).',
    },
  },
} as const

// ─── Sector-aware title resolution ────────────────────────────────────────────

interface PanelConfigLike {
  jobTitle: string
  sector: string
  language: string
  plan: string
}

// Well-known sector titles make the panel feel real, not templated.
// Patterns are matched case-insensitively against sector + jobTitle combined.
const SECTOR_MANAGER_TITLES: Array<{
  match: RegExp
  en: string
  ar: string
}> = [
  { match: /educat|school|teach|تعليم|مدرس|معلم/i, en: 'School Principal',        ar: 'مدير المدرسة' },
  { match: /health|medic|hospital|صح|طب/i,     en: 'Medical Director',        ar: 'المدير الطبي' },
  { match: /engineer|construct|هندس/i,         en: 'Engineering Manager',     ar: 'مدير الهندسة' },
  { match: /tech|software|it\b|تقني|برمج/i,    en: 'Engineering Manager',     ar: 'مدير القسم التقني' },
  { match: /financ|bank|account|مالي|مصرف/i,   en: 'Finance Director',        ar: 'المدير المالي' },
  { match: /sales|retail|مبيعات|تجزئة/i,       en: 'Sales Director',          ar: 'مدير المبيعات' },
]

const SECTOR_EXPERT_TITLES: Array<{
  match: RegExp
  en: string
  ar: string
}> = [
  { match: /educat|school|teach|تعليم|مدرس|معلم/i, en: 'Head of Department',          ar: 'رئيس القسم' },
  { match: /health|medic|hospital|صح|طب/i,     en: 'Senior Consultant',           ar: 'الاستشاري الأول' },
  { match: /engineer|construct|هندس/i,         en: 'Principal Engineer',          ar: 'كبير المهندسين' },
  { match: /tech|software|it\b|تقني|برمج/i,    en: 'Principal Engineer',          ar: 'كبير المهندسين' },
  { match: /financ|bank|account|مالي|مصرف/i,   en: 'Senior Financial Analyst',    ar: 'كبير المحللين الماليين' },
  { match: /sales|retail|مبيعات|تجزئة/i,       en: 'Senior Sales Strategist',     ar: 'كبير استراتيجيي المبيعات' },
]

export interface ResolvedPanelMember {
  id: PanelRoleId
  displayTitle: string
  ownedAxes: readonly EssentialAxis[]
  mandate: string
  pressureStyle: string
}

export interface ResolvedPanel {
  enabled: boolean
  members: ResolvedPanelMember[]
}

export function isPanelPlan(plan: string): boolean {
  const p = (plan || '').toLowerCase()
  return p.includes('professional') || p.includes('executive') || p === 'pro'
}

/**
 * resolvePanelForConfig
 * Returns the fully-resolved three-member panel for panel plans, or a
 * disabled panel for everything else. Pure function, no side effects.
 */
export function resolvePanelForConfig(config: PanelConfigLike): ResolvedPanel {
  if (!isPanelPlan(config.plan)) {
    return { enabled: false, members: [] }
  }

  const lang: 'en' | 'ar' = config.language === 'ar' ? 'ar' : 'en'
  const sector = config.sector || ''

  // Sector matching reads sector AND jobTitle together. Users often leave
  // sector empty or generic while jobTitle carries the real signal
  // ("Teacher", "معلم") — the combined haystack catches both.
  const sectorHaystack = `${sector} ${config.jobTitle || ''}`.trim()

  const managerTitle =
    SECTOR_MANAGER_TITLES.find(t => t.match.test(sectorHaystack))?.[lang] ??
    PANEL_ROLES.direct_manager.title[lang]

  const expertTitle = (
    SECTOR_EXPERT_TITLES.find(t => t.match.test(sectorHaystack))?.[lang] ??
    PANEL_ROLES.domain_expert.title[lang]
  )
    .replace('{sector}', sector || (lang === 'ar' ? 'التخصص' : 'the field'))

  const fill = (text: string) =>
    text
      .replace(/\{jobTitle\}/g, config.jobTitle)
      .replace(/\{sector\}/g, sector || (lang === 'ar' ? 'التخصص' : 'the field'))

  const members: ResolvedPanelMember[] = PANEL_ROLE_ORDER.map(id => {
    const role = PANEL_ROLES[id]

    const displayTitle =
      id === 'direct_manager' ? managerTitle :
      id === 'domain_expert'  ? expertTitle :
      role.title[lang]

    return {
      id,
      displayTitle,
      ownedAxes: role.ownedAxes,
      mandate: fill(role.mandate[lang]),
      pressureStyle: role.pressureStyle[lang],
    }
  })

  return { enabled: true, members }
}
// DESIGN CONTRACT (anti-decoration guarantee):
// Each panel role OWNS an exclusive set of assessment axes and an exclusive
// questioning mandate. A role may only ask within its mandate, and may only
// evaluate its own axes. This is enforced structurally in later steps by
// feeding role mandates into the Director and prompt layers — the difference
// between members is imposed by architecture, not by phrasing.
//
// PLAN GATING: The panel exists ONLY for 'professional' and 'executive'.
// 'essential' (and any unknown plan) remains the single-interviewer Barbaros
// experience, untouched.

import type { EssentialAxis } from '../scoring/coverage-resolver'

// ─── Role identity ────────────────────────────────────────────────────────────

export type PanelRoleId = 'hr' | 'domain_expert' | 'direct_manager'

export const PANEL_ROLE_ORDER: readonly PanelRoleId[] = [
  'hr',
  'domain_expert',
  'direct_manager',
] as const

export interface PanelRole {
  id: PanelRoleId

  // Display titles. {sector}/{jobTitle} placeholders are resolved by
  // resolvePanelForConfig() so titles feel native to the candidate's world.
  title: { en: string; ar: string }

  // Exclusive assessment axes this role owns. No overlap between roles.
  ownedAxes: readonly EssentialAxis[]

  // Questioning mandate injected into the prompt when this role speaks.
  // Written as hard constraints, not suggestions.
  mandate: { en: string; ar: string }

  // Pressure style: how this role escalates when answers are weak.
  pressureStyle: { en: string; ar: string }
}

// ─── Role definitions ─────────────────────────────────────────────────────────
// Axis ownership map (exclusive, covers all six EssentialAxis values):
//   hr             → role_fit, communication_clarity
//   domain_expert  → domain_expertise, job_requirement_match
//   direct_manager → ownership_level, cv_consistency

export const PANEL_ROLES: Record<PanelRoleId, PanelRole> = {
  hr: {
    id: 'hr',
    title: {
      en: 'HR Talent Assessor',
      ar: 'مُقيِّم الموارد البشرية',
    },
    ownedAxes: ['role_fit', 'communication_clarity'],
    mandate: {
      en: [
        'You assess ONLY: motivation, role fit, communication clarity, and professional composure.',
        'You MUST NOT ask technical or specialist questions — those belong to the domain expert.',
        'Probe why the candidate wants THIS role at THIS institution, and how clearly they express themselves.',
      ].join(' '),
      ar: [
        'تُقيِّم فقط: الدافع، والملاءمة للدور، ووضوح التواصل، والاتزان المهني.',
        'يُمنع عليك طرح أسئلة تقنية أو تخصصية — فهي من اختصاص خبير التخصص.',
        'استقصِ لماذا يريد المرشح هذا الدور تحديداً في هذه الجهة، ومدى وضوح تعبيره.',
      ].join(' '),
    },
    pressureStyle: {
      en: 'Pressure through precision: when answers are generic, ask for the specific personal reason behind them.',
      ar: 'الضغط بالدقة: عندما تكون الإجابة عامة، اطلب السبب الشخصي المحدد خلفها.',
    },
  },

  domain_expert: {
    id: 'domain_expert',
    title: {
      en: 'Senior {sector} Specialist',
      ar: 'كبير مختصّي {sector}',
    },
    ownedAxes: ['domain_expertise', 'job_requirement_match'],
    mandate: {
      en: [
        'You assess ONLY: depth of professional knowledge, correctness of claimed experience, and match to the stated job requirements.',
        'You MUST NOT ask about motivation or culture fit — those belong to HR.',
        'Every question must be specific to {jobTitle} work. Demand concrete methods, real numbers, and named tools.',
      ].join(' '),
      ar: [
        'تُقيِّم فقط: عمق المعرفة المهنية، وصحة الخبرة المُدّعاة، ومطابقة متطلبات الوظيفة المعلنة.',
        'يُمنع عليك السؤال عن الدافع أو الملاءمة الثقافية — فهي من اختصاص الموارد البشرية.',
        'كل سؤال يجب أن يكون محدداً بعمل {jobTitle}. اطلب أساليب ملموسة وأرقاماً حقيقية وأدوات بأسمائها.',
      ].join(' '),
    },
    pressureStyle: {
      en: 'Pressure through depth: follow every claim with "walk me through exactly how" until evidence appears or collapses.',
      ar: 'الضغط بالعمق: اتبع كل ادّعاء بـ«اشرح لي خطوة بخطوة كيف فعلت ذلك» حتى يظهر الدليل أو ينهار.',
    },
  },

  direct_manager: {
    id: 'direct_manager',
    title: {
      en: 'Hiring Manager',
      ar: 'المدير المباشر',
    },
    ownedAxes: ['ownership_level', 'cv_consistency'],
    mandate: {
      en: [
        'You assess ONLY: behavior under pressure, ownership and decision-making, and consistency between the CV story and live answers.',
        'You MUST NOT re-test technical knowledge — that belongs to the specialist.',
        'Use real workplace scenarios. If the candidate contradicts their CV or an earlier answer, confront it directly.',
      ].join(' '),
      ar: [
        'تُقيِّم فقط: السلوك تحت الضغط، وتحمّل المسؤولية واتخاذ القرار، واتساق قصة السيرة الذاتية مع الإجابات الحية.',
        'يُمنع عليك إعادة اختبار المعرفة التقنية — فهي من اختصاص المختص.',
        'استخدم سيناريوهات عمل واقعية. وإن ناقض المرشح سيرته أو إجابة سابقة، واجِهه بذلك مباشرة.',
      ].join(' '),
    },
    pressureStyle: {
      en: 'Pressure through scenarios: raise the stakes mid-question ("now your deadline is cut in half — what changes?").',
      ar: 'الضغط بالسيناريوهات: ارفع الرهان في منتصف السؤال («الآن قُلّصت مهلتك إلى النصف — ماذا يتغير؟»).',
    },
  },
} as const

// ─── Sector-aware title resolution ────────────────────────────────────────────

interface PanelConfigLike {
  jobTitle: string
  sector: string
  language: string
  plan: string
}

// Well-known sector titles make the panel feel real, not templated.
// Patterns are matched case-insensitively against sector + jobTitle combined.
const SECTOR_MANAGER_TITLES: Array<{
  match: RegExp
  en: string
  ar: string
}> = [
  { match: /educat|school|teach|تعليم|مدرس|معلم/i, en: 'School Principal',        ar: 'مدير المدرسة' },
  { match: /health|medic|hospital|صح|طب/i,     en: 'Medical Director',        ar: 'المدير الطبي' },
  { match: /engineer|construct|هندس/i,         en: 'Engineering Manager',     ar: 'مدير الهندسة' },
  { match: /tech|software|it\b|تقني|برمج/i,    en: 'Engineering Manager',     ar: 'مدير القسم التقني' },
  { match: /financ|bank|account|مالي|مصرف/i,   en: 'Finance Director',        ar: 'المدير المالي' },
  { match: /sales|retail|مبيعات|تجزئة/i,       en: 'Sales Director',          ar: 'مدير المبيعات' },
]

const SECTOR_EXPERT_TITLES: Array<{
  match: RegExp
  en: string
  ar: string
}> = [
  { match: /educat|school|teach|تعليم|مدرس|معلم/i, en: 'Head of Department',          ar: 'رئيس القسم' },
  { match: /health|medic|hospital|صح|طب/i,     en: 'Senior Consultant',           ar: 'الاستشاري الأول' },
  { match: /engineer|construct|هندس/i,         en: 'Principal Engineer',          ar: 'كبير المهندسين' },
  { match: /tech|software|it\b|تقني|برمج/i,    en: 'Principal Engineer',          ar: 'كبير المهندسين' },
  { match: /financ|bank|account|مالي|مصرف/i,   en: 'Senior Financial Analyst',    ar: 'كبير المحللين الماليين' },
  { match: /sales|retail|مبيعات|تجزئة/i,       en: 'Senior Sales Strategist',     ar: 'كبير استراتيجيي المبيعات' },
]

export interface ResolvedPanelMember {
  id: PanelRoleId
  displayTitle: string
  ownedAxes: readonly EssentialAxis[]
  mandate: string
  pressureStyle: string
}

export interface ResolvedPanel {
  enabled: boolean
  members: ResolvedPanelMember[]
}

export function isPanelPlan(plan: string): boolean {
  const p = (plan || '').toLowerCase()
  return p.includes('professional') || p.includes('executive') || p === 'pro'
}

/**
 * resolvePanelForConfig
 * Returns the fully-resolved three-member panel for panel plans, or a
 * disabled panel for everything else. Pure function, no side effects.
 */
export function resolvePanelForConfig(config: PanelConfigLike): ResolvedPanel {
  if (!isPanelPlan(config.plan)) {
    return { enabled: false, members: [] }
  }

  const lang: 'en' | 'ar' = config.language === 'ar' ? 'ar' : 'en'
  const sector = config.sector || ''

  // Sector matching reads sector AND jobTitle together. Users often leave
  // sector empty or generic while jobTitle carries the real signal
  // ("Teacher", "معلم") — the combined haystack catches both.
  const sectorHaystack = `${sector} ${config.jobTitle || ''}`.trim()

  const managerTitle =
    SECTOR_MANAGER_TITLES.find(t => t.match.test(sectorHaystack))?.[lang] ??
    PANEL_ROLES.direct_manager.title[lang]

  const expertTitle = (
    SECTOR_EXPERT_TITLES.find(t => t.match.test(sectorHaystack))?.[lang] ??
    PANEL_ROLES.domain_expert.title[lang]
  )
    .replace('{sector}', sector || (lang === 'ar' ? 'التخصص' : 'the field'))

  const fill = (text: string) =>
    text
      .replace(/\{jobTitle\}/g, config.jobTitle)
      .replace(/\{sector\}/g, sector || (lang === 'ar' ? 'التخصص' : 'the field'))

  const members: ResolvedPanelMember[] = PANEL_ROLE_ORDER.map(id => {
    const role = PANEL_ROLES[id]

    const displayTitle =
      id === 'direct_manager' ? managerTitle :
      id === 'domain_expert'  ? expertTitle :
      role.title[lang]

    return {
      id,
      displayTitle,
      ownedAxes: role.ownedAxes,
      mandate: fill(role.mandate[lang]),
      pressureStyle: role.pressureStyle[lang],
    }
  })

  return { enabled: true, members }
}
