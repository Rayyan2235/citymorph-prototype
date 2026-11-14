import type { CityId } from './config'

// Opening hook on the intro screen, one per city. Every figure is public and
// sourced. Houston's vacant square footage is derived (rate × inventory), so
// its source line shows the inputs instead of claiming a published total.
export interface HookCopy {
  value: number
  prefix: string
  suffix: string
  line: string
  source: string
}

export const HOOKS: Record<CityId, HookCopy> = {
  houston: {
    value: 57, // 24.0% total vacancy × 237,945,787 sq ft inventory
    prefix: '≈',
    suffix: 'M sq ft',
    line: 'of Houston office space sits empty. Owners have started tearing buildings down.',
    source: 'Lee & Associates, Houston office Q3 2026: 24.0% of 237.9M sq ft vacant · CRE Daily, Jul 2026',
  },
  la: {
    value: 40,
    prefix: '',
    suffix: ' child care sites',
    line: 'burned in the Jan 2025 LA fires, and 240 more closed. Licensing and zoning kept them out of standing buildings until an emergency order allowed 180 day permits.',
    source: 'CA Dept. of Social Services via KQED · Gov. EO N-3-25, Jan 8 2025 · LA Mayor EEO No. 4, Feb 4 2025',
  },
}
