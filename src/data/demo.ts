// Sample records for the prototype. None of this is live CoStar, Matterport or
// Vexcel data. Every number on screen is a user input, a labelled assumption,
// or a sample record that the live build replaces with API data.

export type SourceKind = 'costar' | 'matterport' | 'vexcel' | 'user' | 'assumption'

export interface Evidence {
  id: string
  kind: SourceKind
  claim: string
  detail: string
  confidence: 'observed' | 'estimated' | 'assumed' | 'stated'
  verify: boolean
  propertyId?: PropertyId
}

export type PropertyId = 'A' | 'B' | 'C'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Zone {
  id: string
  name: string
  role: 'activity' | 'reception' | 'support' | 'flex'
  from: Rect
  to: Rect
}

export interface Entrance {
  id: string
  name: string
  stepFree: boolean
  ev: string
  at: { x: number; y: number; side: 'top' | 'bottom' | 'left' | 'right' }
}

export interface Task {
  id: string
  name: string
  cost: number
  core: boolean
  ev: string
}

export interface Property {
  id: PropertyId
  name: string
  area: string
  lngLat: [number, number]
  use: string
  sqft: number
  floors: number
  parking: string
  activityZoneFit: number // 0..1, how well the rooms suit two activity rooms
  confidence: number // 0..1, share of claims backed by observed evidence
  entrances: Entrance[]
  tasks: Task[]
  existing: { id: string; name: string; rect: Rect }[]
  fixtures: Rect[]
  zones: Zone[]
  ev: string[]
}

export const SOURCE_LABEL: Record<SourceKind, string> = {
  costar: 'CoStar record',
  matterport: 'Interior scan',
  vexcel: 'Aerial',
  user: 'You said',
  assumption: 'Assumption',
}

export const PLANNING = {
  sqftPerPerson: 35,
  supportSqft: 500,
  usableShare: 0.7,
  costSpread: 0.2, // costs shown as a range of plus or minus 20%
}

export const PROPERTIES: Property[] = [
  {
    id: 'A',
    name: 'Bellaire Blvd retail flex',
    area: 'Gulfton',
    lngLat: [-95.4838, 29.7058],
    use: 'Retail flex, one storey',
    sqft: 6200,
    floors: 1,
    parking: 'Surface lot, about 24 stalls',
    activityZoneFit: 1,
    confidence: 0.8,
    entrances: [
      { id: 'A-front', name: 'Front storefront door', stepFree: true, ev: 'M1', at: { x: 100, y: 360, side: 'bottom' } },
      { id: 'A-rear', name: 'Rear door onto raised dock', stepFree: false, ev: 'M2', at: { x: 300, y: 20, side: 'top' } },
    ],
    tasks: [
      { id: 'a1', name: 'Restrooms and exits for change of use from retail', cost: 42000, core: true, ev: 'A4' },
      { id: 'a2', name: 'Partitions for two activity rooms', cost: 38000, core: true, ev: 'M3' },
      { id: 'a3', name: 'Split HVAC into room zones', cost: 30000, core: true, ev: 'A3' },
      { id: 'a4', name: 'Replace retail flooring', cost: 18000, core: false, ev: 'A3' },
      { id: 'a5', name: 'Wayfinding and signage', cost: 6000, core: false, ev: 'A3' },
    ],
    existing: [
      { id: 'sales', name: 'Open sales floor', rect: { x: 20, y: 140, w: 560, h: 220 } },
      { id: 'back', name: 'Back room', rect: { x: 20, y: 20, w: 400, h: 120 } },
      { id: 'wc', name: 'Restrooms', rect: { x: 420, y: 20, w: 160, h: 120 } },
    ],
    fixtures: [
      { x: 70, y: 180, w: 200, h: 12 },
      { x: 70, y: 230, w: 200, h: 12 },
      { x: 70, y: 280, w: 200, h: 12 },
      { x: 330, y: 180, w: 200, h: 12 },
      { x: 330, y: 230, w: 200, h: 12 },
      { x: 330, y: 280, w: 200, h: 12 },
    ],
    zones: [
      { id: 'rec', name: 'Reception', role: 'reception', from: { x: 20, y: 140, w: 560, h: 220 }, to: { x: 20, y: 160, w: 160, h: 200 } },
      { id: 'actA', name: 'Activity room 1', role: 'activity', from: { x: 20, y: 140, w: 560, h: 220 }, to: { x: 180, y: 160, w: 200, h: 200 } },
      { id: 'actB', name: 'Activity room 2', role: 'activity', from: { x: 20, y: 140, w: 560, h: 220 }, to: { x: 380, y: 160, w: 200, h: 200 } },
      { id: 'hall', name: 'Hall', role: 'flex', from: { x: 20, y: 140, w: 560, h: 220 }, to: { x: 20, y: 140, w: 560, h: 20 } },
      { id: 'store', name: 'Storage', role: 'support', from: { x: 20, y: 20, w: 400, h: 120 }, to: { x: 20, y: 20, w: 200, h: 120 } },
      { id: 'staff', name: 'Staff office', role: 'support', from: { x: 20, y: 20, w: 400, h: 120 }, to: { x: 220, y: 20, w: 200, h: 120 } },
      { id: 'wc', name: 'Restrooms', role: 'support', from: { x: 420, y: 20, w: 160, h: 120 }, to: { x: 420, y: 20, w: 160, h: 120 } },
    ],
    ev: ['C1', 'M1', 'M2', 'M3', 'V1', 'V2'],
  },
  {
    id: 'B',
    name: 'Fulton St two storey office',
    area: 'Near Northside',
    lngLat: [-95.3601, 29.7907],
    use: 'Office, two storeys',
    sqft: 4800,
    floors: 2,
    parking: 'Street parking only',
    activityZoneFit: 0.6,
    confidence: 0.7,
    entrances: [{ id: 'B-front', name: 'Front door, 3 steps up', stepFree: false, ev: 'M4', at: { x: 300, y: 360, side: 'bottom' } }],
    tasks: [
      { id: 'b1', name: 'Open up ground floor offices', cost: 46000, core: true, ev: 'M5' },
      { id: 'b2', name: 'Ramp and handrail at front steps', cost: 28000, core: true, ev: 'A3' },
    ],
    existing: [
      { id: 'o1', name: 'Office', rect: { x: 20, y: 20, w: 180, h: 160 } },
      { id: 'o2', name: 'Office', rect: { x: 200, y: 20, w: 180, h: 160 } },
      { id: 'o3', name: 'Office', rect: { x: 380, y: 20, w: 200, h: 160 } },
      { id: 'lob', name: 'Lobby and stair', rect: { x: 20, y: 180, w: 260, h: 180 } },
      { id: 'conf', name: 'Meeting room', rect: { x: 280, y: 180, w: 300, h: 180 } },
    ],
    fixtures: [],
    zones: [],
    ev: ['C2', 'C3', 'M4', 'M5', 'V3'],
  },
  {
    id: 'C',
    name: 'Navigation Blvd single storey office',
    area: 'East End',
    lngLat: [-95.3334, 29.7541],
    use: 'Office, one storey',
    sqft: 3900,
    floors: 1,
    parking: 'Side lot, about 10 stalls',
    activityZoneFit: 0.7,
    confidence: 0.7,
    entrances: [
      { id: 'C-side', name: 'Side door from the parking lot', stepFree: true, ev: 'M6', at: { x: 580, y: 260, side: 'right' } },
      { id: 'C-front', name: 'Front door, 1 step up', stepFree: false, ev: 'M6', at: { x: 160, y: 360, side: 'bottom' } },
    ],
    tasks: [
      { id: 'c1', name: 'Restroom refresh', cost: 16000, core: true, ev: 'M7' },
      { id: 'c2', name: 'Remove two office walls to open room 2', cost: 12000, core: true, ev: 'M7' },
      { id: 'c3', name: 'Threshold ramp at side door', cost: 4000, core: true, ev: 'M6' },
      { id: 'c4', name: 'Acoustic panels between rooms', cost: 9000, core: false, ev: 'A3' },
      { id: 'c5', name: 'New carpet tile', cost: 10000, core: false, ev: 'A3' },
    ],
    existing: [
      { id: 'off1', name: 'Front office', rect: { x: 20, y: 20, w: 220, h: 140 } },
      { id: 'off2', name: 'Office', rect: { x: 240, y: 20, w: 160, h: 140 } },
      { id: 'wc', name: 'Restroom', rect: { x: 400, y: 20, w: 180, h: 140 } },
      { id: 'bay', name: 'Open office', rect: { x: 20, y: 160, w: 300, h: 200 } },
      { id: 'pv', name: 'Two private offices', rect: { x: 320, y: 160, w: 260, h: 200 } },
    ],
    fixtures: [
      { x: 60, y: 220, w: 90, h: 44 },
      { x: 190, y: 220, w: 90, h: 44 },
      { x: 60, y: 290, w: 90, h: 44 },
      { x: 190, y: 290, w: 90, h: 44 },
      { x: 450, y: 160, w: 2, h: 200 },
    ],
    zones: [
      { id: 'rec', name: 'Reception', role: 'reception', from: { x: 20, y: 20, w: 220, h: 140 }, to: { x: 20, y: 20, w: 220, h: 140 } },
      { id: 'store', name: 'Storage', role: 'support', from: { x: 240, y: 20, w: 160, h: 140 }, to: { x: 240, y: 20, w: 160, h: 140 } },
      { id: 'wc', name: 'Restroom', role: 'support', from: { x: 400, y: 20, w: 180, h: 140 }, to: { x: 400, y: 20, w: 180, h: 140 } },
      { id: 'actA', name: 'Activity room 1', role: 'activity', from: { x: 20, y: 160, w: 300, h: 200 }, to: { x: 20, y: 160, w: 300, h: 200 } },
      { id: 'actB', name: 'Activity room 2', role: 'activity', from: { x: 320, y: 160, w: 260, h: 200 }, to: { x: 320, y: 160, w: 260, h: 200 } },
    ],
    ev: ['C4', 'M6', 'M7', 'V4'],
  },
]

export function userEvidence(people: number, budget: number): Evidence[] {
  return [
    { id: 'U1', kind: 'user', claim: `A learning and training center for ${people} people`, detail: 'A target you set. It is not an occupancy certification.', confidence: 'stated', verify: false },
    { id: 'U2', kind: 'user', claim: 'A reception plus two activity rooms', detail: 'Room program from your request.', confidence: 'stated', verify: false },
    { id: 'U3', kind: 'user', claim: 'Step free entry is required', detail: 'Hard rule. A building without a step free entrance is rejected.', confidence: 'stated', verify: false },
    { id: 'U4', kind: 'user', claim: `Adaptation budget $${Math.round(budget / 1000)}k`, detail: 'Hard rule. Core work must fit inside it.', confidence: 'stated', verify: false },
  ]
}

export const EVIDENCE: Evidence[] = [
  { id: 'A1', kind: 'assumption', claim: '35 sq ft per person, plus 500 sq ft for support space', detail: 'Our assumption for sketching rooms, not taken from a building code or study. Not a legal occupancy limit. Replace with the architect\'s ratio.', confidence: 'assumed', verify: true },
  { id: 'A2', kind: 'assumption', claim: 'About 70% of gross area is usable', detail: 'Walls, columns and service space take the rest. Confirm on a measured plan.', confidence: 'assumed', verify: true },
  { id: 'A3', kind: 'assumption', claim: 'Costs are planning ranges of plus or minus 20%, not quotes', detail: 'Get contractor quotes before committing.', confidence: 'assumed', verify: true },
  { id: 'A4', kind: 'assumption', claim: 'Retail to adult training is a change of use', detail: 'Usually triggers a restroom and exit review. Adult training in an office stays the same use. Confirm with the City of Houston permitting office.', confidence: 'assumed', verify: true },

  { id: 'C1', kind: 'costar', propertyId: 'A', claim: 'Retail flex, 6,200 sq ft, one storey', detail: 'Sample record standing in for the CoStar property API.', confidence: 'observed', verify: false },
  { id: 'M1', kind: 'matterport', propertyId: 'A', claim: 'Front storefront door is level with the sidewalk', detail: 'Seen in the entry capture. Confirm threshold height on site.', confidence: 'observed', verify: true },
  { id: 'M2', kind: 'matterport', propertyId: 'A', claim: 'Rear door opens onto a raised loading dock', detail: 'Not usable as a step free entrance.', confidence: 'observed', verify: false },
  { id: 'M3', kind: 'matterport', propertyId: 'A', claim: 'Front two thirds is open floor with no fixed walls', detail: 'Room sizes are estimates until measured.', confidence: 'estimated', verify: false },
  { id: 'V1', kind: 'vexcel', propertyId: 'A', claim: 'Surface lot with about 24 stalls', detail: 'Counted from the aerial view.', confidence: 'estimated', verify: false },
  { id: 'V2', kind: 'vexcel', propertyId: 'A', claim: 'Flat roof with rooftop HVAC units', detail: 'Seen from above. Zoning the HVAC may reuse the units.', confidence: 'observed', verify: true },

  { id: 'C2', kind: 'costar', propertyId: 'B', claim: 'Office, 4,800 sq ft over two storeys', detail: 'Sample record standing in for the CoStar property API.', confidence: 'observed', verify: false },
  { id: 'C3', kind: 'costar', propertyId: 'B', claim: 'No elevator listed in the record', detail: 'The upper floor may not be reachable without stairs.', confidence: 'observed', verify: true },
  { id: 'M4', kind: 'matterport', propertyId: 'B', claim: 'Only entrance has 3 steps up; no ramp in the entry capture', detail: 'Fails the step free entry rule.', confidence: 'observed', verify: false },
  { id: 'M5', kind: 'matterport', propertyId: 'B', claim: 'Ground floor is split into small offices', detail: 'Two activity rooms would need walls removed.', confidence: 'estimated', verify: false },
  { id: 'V3', kind: 'vexcel', propertyId: 'B', claim: 'No off street parking on the lot', detail: 'Seen from above.', confidence: 'observed', verify: false },

  { id: 'C4', kind: 'costar', propertyId: 'C', claim: 'Office, 3,900 sq ft, one storey', detail: 'Sample record standing in for the CoStar property API.', confidence: 'observed', verify: false },
  { id: 'M6', kind: 'matterport', propertyId: 'C', claim: 'Side door is level with the parking lot; front door has 1 step', detail: 'A small threshold lip at the side door may need a ramp.', confidence: 'observed', verify: true },
  { id: 'M7', kind: 'matterport', propertyId: 'C', claim: 'Open office, two private offices and one restroom', detail: 'Two private office walls can come out to make room 2. Sizes are estimates.', confidence: 'estimated', verify: true },
  { id: 'V4', kind: 'vexcel', propertyId: 'C', claim: 'Side lot with about 10 stalls', detail: 'Counted from the aerial view.', confidence: 'estimated', verify: false },
]
