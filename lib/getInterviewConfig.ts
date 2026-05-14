// lib/getInterviewConfig.ts

export interface InterviewConfig {
  candidateName: string
  jobTitle: string
  institution: string
  country: string
  sector: string
  yearsExperience: string
  targetRoleLevel: 'entry' | 'mid' | 'senior' | 'lead' | 'executive'
  language: 'en' | 'ar'
  jobRequirements: string
  cvText: string
  plan: 'go' | 'pro' | 'expert'
}

export const DEFAULT_CONFIG: InterviewConfig = {
  candidateName: 'Candidate',
  jobTitle: 'Professional',
  institution: 'Company',
  country: '',
  sector: 'General',
  yearsExperience: '1–3 years',
  targetRoleLevel: 'mid',
  language: 'en',
  jobRequirements: '',
  cvText: '',
  plan: 'go',
}

export function deriveRoleLevel(years: string): InterviewConfig['targetRoleLevel'] {
  const n = parseInt(years)
  if (isNaN(n)) return 'mid'
  if (n <= 2) return 'entry'
  if (n <= 5) return 'mid'
  if (n <= 9) return 'senior'
  if (n <= 14) return 'lead'
  return 'executive'
}

const STORAGE_KEY = 'barbaros_config'

export function saveConfig(config: InterviewConfig): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(config))
  } catch {}
}

export function loadConfig(): InterviewConfig {
  if (typeof window === 'undefined') return { ...DEFAULT_CONFIG }
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (!parsed.targetRoleLevel) {
        parsed.targetRoleLevel = deriveRoleLevel(parsed.yearsExperience ?? '3')
      }
      return { ...DEFAULT_CONFIG, ...parsed }
    }
  } catch {}
  return { ...DEFAULT_CONFIG }
}

export function clearConfig(): void {
  if (typeof window === 'undefined') return
  try { sessionStorage.removeItem(STORAGE_KEY) } catch {}
}
