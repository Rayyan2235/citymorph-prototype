import type { CityId } from './config'

// Opening hook on the intro screen, one per city: what disasters do to old
// age homes there. Every figure is public and sourced on screen.
export interface HookCopy {
  value: number
  prefix: string
  suffix: string
  line: string
  source: string
}

export const HOOKS: Record<CityId, HookCopy> = {
  houston: {
    value: 245,
    prefix: '',
    suffix: ' nursing homes',
    line: 'in Texas lost power or water in Winter Storm Uri. Residents of those homes died at higher rates in the weeks after. Most residents cannot walk out on their own.',
    source: 'Winter Storm Uri nursing home cohort, 245 of 1,219 homes (PMC11979729) · KFF: 65% of residents chairbound',
  },
  la: {
    value: 2,
    prefix: '',
    suffix: ' senior homes',
    line: 'were cited for leaving residents behind as the Eaton fire reached Altadena. Evacuation orders came after 3:30 AM, when night staff are thinnest.',
    source: 'California state findings via Fire Engineering, Nov 2025 · Fox LA, Jan 2025',
  },
}
