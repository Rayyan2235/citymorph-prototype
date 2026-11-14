// One source of truth for every planning number. Each value names the evidence
// id that explains it, so the UI can cite it. None of these are codes, quotes
// or verified data: they are labelled assumptions a planner would replace.

export type CityId = 'houston' | 'la'
export type FacilityId = 'learning' | 'childcare' | 'clinic'
export type RoomRole = 'primary' | 'reception' | 'support' | 'wet' | 'flex' | 'hall'

export interface City {
  id: CityId
  name: string
  center: [number, number]
  zoom: number
  bbox: [number, number, number, number] // west, south, east, north (search bounds)
  zoning: 'none' | 'zoned'
  permitOffice: string
  zoningLookup: string
}

export const CITIES: Record<CityId, City> = {
  houston: {
    id: 'houston',
    name: 'Houston',
    center: [-95.405, 29.752],
    zoom: 10.4,
    bbox: [-95.8, 29.5, -95.0, 30.1],
    zoning: 'none',
    permitOffice: 'City of Houston Permitting Center',
    zoningLookup: 'Houston has no zoning ordinance. Check deed restrictions and Chapter 42 rules.',
  },
  la: {
    id: 'la',
    name: 'Los Angeles',
    center: [-118.3, 34.08],
    zoom: 9.6,
    bbox: [-118.67, 33.7, -118.15, 34.34],
    zoning: 'zoned',
    permitOffice: 'LA Department of Building and Safety',
    zoningLookup: 'Confirm the zone on ZIMAS (zimas.lacity.org).',
  },
}

export interface RoomSpec {
  key: string
  name: string
  role: RoomRole
  // Area in sq ft for one room. `perSeat` scales with the seats the room holds.
  area: (capacity: number, opts: DesignOpts) => number
  count: (capacity: number, opts: DesignOpts) => number
  seats?: (capacity: number, count: number) => number // people drawn in each room
  purpose: string
}

export interface DesignOpts {
  outdoorPlay: boolean
  accessFirst: boolean
}

export interface Facility {
  id: FacilityId
  label: string // "learning center"
  noun: string // what capacity counts: "people", "children", "visits a day"
  capacity: { default: number; min: number; max: number; step: number }
  budget: number // starting budget when this facility type is picked
  sqftPerSeat: number // indoor planning ratio, cited by evidence `ratioEv`
  ratioEv: string
  needsOutdoor: boolean // outdoor play is part of the program, not an option
  outdoorPerSeat: number // sq ft of outdoor play per seat, when outdoor applies
  occupancy: string // building-code occupancy group, for change-of-use checks
  newBuildPerSqft: number // new construction planning cost, evidence I1
  rooms: RoomSpec[]
  servesTract: 'pop' | 'under5' // which tract count the impact simulator uses
}

const ceil = Math.ceil

export const FACILITIES: Record<FacilityId, Facility> = {
  learning: {
    id: 'learning',
    label: 'learning center',
    noun: 'people',
    capacity: { default: 40, min: 10, max: 120, step: 5 },
    budget: 150000,
    sqftPerSeat: 35,
    ratioEv: 'A1',
    needsOutdoor: false,
    outdoorPerSeat: 40,
    occupancy: 'B (adult education)',
    newBuildPerSqft: 380,
    servesTract: 'pop',
    rooms: [
      { key: 'rec', name: 'Reception', role: 'reception', area: (c) => Math.max(320, c * 7), count: () => 1, seats: (c) => Math.min(8, Math.round(c * 0.15)), purpose: 'Check-in, waiting and the step free arrival point.' },
      { key: 'act', name: 'Activity room', role: 'primary', area: (c) => (c * 35) / ceil(c / 24), count: (c) => ceil(c / 24), seats: (c, n) => Math.ceil((c - Math.min(8, Math.round(c * 0.15))) / n), purpose: 'Classes and workshops. Flexible seating, one teaching wall.' },
      { key: 'staff', name: 'Staff office', role: 'support', area: () => 160, count: () => 1, purpose: 'Two desks and secure files.' },
      { key: 'store', name: 'Storage', role: 'support', area: (c) => Math.max(120, c * 3), count: () => 1, purpose: 'Tables, chairs and course materials.' },
      { key: 'wc', name: 'Restrooms', role: 'wet', area: (c, o) => (c > 50 ? 2 : 1) * (o.accessFirst ? 90 : 70), count: () => 1, purpose: 'Accessible restrooms; count scales with occupancy.' },
    ],
  },
  childcare: {
    id: 'childcare',
    label: 'childcare center',
    noun: 'children',
    capacity: { default: 32, min: 8, max: 96, step: 4 },
    budget: 220000,
    sqftPerSeat: 35,
    ratioEv: 'A5',
    needsOutdoor: true,
    outdoorPerSeat: 75,
    occupancy: 'E / I-4 (day care)',
    newBuildPerSqft: 420,
    servesTract: 'under5',
    rooms: [
      { key: 'rec', name: 'Reception and cubbies', role: 'reception', area: (c) => Math.max(260, c * 5), count: () => 1, seats: () => 2, purpose: 'Sign-in, parent drop-off and cubbies by the step free door.' },
      { key: 'cls', name: 'Classroom', role: 'primary', area: (c) => (c * 35) / ceil(c / 16), count: (c) => ceil(c / 16), seats: (c, n) => Math.ceil(c / n), purpose: 'Up to 16 children with two teachers. Child-height sinks and storage.' },
      { key: 'nap', name: 'Nap room', role: 'support', area: (c) => Math.max(180, c * 4), count: () => 1, purpose: 'Quiet room for cots, visible from the hall.' },
      { key: 'kit', name: 'Kitchen and prep', role: 'wet', area: () => 140, count: () => 1, purpose: 'Snack and bottle prep. Not a full commercial kitchen.' },
      { key: 'staff', name: 'Staff room', role: 'support', area: () => 120, count: () => 1, purpose: 'Breaks, files and a first-aid kit.' },
      { key: 'wc', name: 'Child restrooms', role: 'wet', area: (c, o) => (c > 40 ? 2 : 1) * (o.accessFirst ? 110 : 90), count: () => 1, purpose: 'Child-height toilets plus one accessible adult restroom.' },
    ],
  },
  clinic: {
    id: 'clinic',
    label: 'pediatric clinic',
    noun: 'visits a day',
    capacity: { default: 48, min: 16, max: 160, step: 8 },
    budget: 180000,
    sqftPerSeat: 0, // clinics size by exam room, not by seat
    ratioEv: 'A6',
    needsOutdoor: false,
    outdoorPerSeat: 0,
    occupancy: 'B (outpatient clinic)',
    newBuildPerSqft: 520,
    servesTract: 'under5',
    rooms: [
      { key: 'wait', name: 'Waiting and check-in', role: 'reception', area: (c) => Math.max(300, c * 6), count: () => 1, seats: (c) => Math.max(4, Math.round(c / 8)), purpose: 'Family seating, check-in desk and stroller parking.' },
      { key: 'exam', name: 'Exam room', role: 'primary', area: () => 110, count: (c) => ceil(c / 16), seats: () => 2, purpose: 'One child and a parent. Sink, exam table, about 16 visits a day.' },
      { key: 'nurse', name: 'Nurse station', role: 'support', area: () => 140, count: () => 1, purpose: 'Triage, charting and sightlines to the exam rooms.' },
      { key: 'med', name: 'Lab and medicine', role: 'wet', area: () => 120, count: () => 1, purpose: 'Vaccines fridge, samples and a hand sink.' },
      { key: 'staff', name: 'Staff office', role: 'support', area: () => 140, count: () => 1, purpose: 'Doctor desk and break space.' },
      { key: 'wc', name: 'Restrooms', role: 'wet', area: (_c, o) => 2 * (o.accessFirst ? 90 : 70), count: () => 1, purpose: 'Two restrooms, one with a changing table.' },
    ],
  },
}

export const PLANNING = {
  usableShare: 0.78, // share of the ground floor left after walls and service space (A2)
  hallShare: 0.07, // corridor depth as a share of the floor depth
  hallShareAccess: 0.1, // wider corridor when accessibility comes first
  costSpread: 0.2, // costs shown as a plus or minus 20% range (A3)
  secondExitAt: 50, // occupants at which a second exit is planned (A7)
  parkWalkM: 400, // a public park this close can stand in for an outdoor play area (A8)
  walkMinutes: 10,
  walkSpeedMpm: 80, // metres per minute, so a 10 minute walk is 800 m (I2)
}

// Unit costs for the work list. Planning figures, not quotes (A3).
export const COSTS = {
  newWallPerFt: 130,
  removeWallPerFt: 28,
  changeOfUse: 26000,
  hvacPerPrimaryRoom: 5200,
  restroomUpgrade: 24000,
  newRestroom: 36000,
  rampLip: 4000,
  rampSteps: 28000,
  secondExit: 18000,
  wideHall: 7000,
  childFixturesPerRoom: 6500,
  outdoorPlayPerSqft: 22,
  examSink: 3800,
  flooringPerSqft: 5.5,
  signage: 6000,
  acoustic: 8500,
}

// Explainable feasibility score. Weights add up to 1.
export const SCORE_WEIGHTS = {
  space: 0.22,
  access: 0.14,
  transit: 0.16,
  outdoor: 0.1,
  cost: 0.2,
  zoning: 0.1,
  evidence: 0.08,
}

export const IMPACT = {
  reuseMonthsBase: 3, // permits and design for a reuse project (I3)
  reuseMonthsPer100k: 2,
  newBuildMonths: 24, // land, design, permits and construction (I3)
}
