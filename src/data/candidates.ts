// Candidate buildings. Geography is real (OpenStreetMap footprint, Census
// tract, walking network); everything a property listing or an interior scan
// would supply is SAMPLE data, written here by hand and labelled in the UI.

import geo from './geo/candidates.json'
import { CITIES, type CityId, type FacilityId } from './config'
import { footprintBox, type LngLat } from '../logic/geo'

export type LayoutKind = 'retail-open' | 'office-cellular' | 'office-open' | 'storefront-split' | 'warehouse'
export type ZoneFit = 'allowed' | 'conditional' | 'not allowed'

export interface Entrance {
  id: string
  name: string
  stepFree: boolean
  lip?: boolean // level door with a small threshold that needs a short ramp
  side: 'top' | 'bottom' | 'left' | 'right'
  t: number // position along that side, 0 to 1
  ev: string
}

export interface CondTask {
  id: string
  name: string
  cost: number
  core: boolean
}

interface Sample {
  use: string
  occupancy: 'M' | 'B' | 'S' | 'A' // current code group: mercantile, business, storage, assembly
  kind: LayoutKind
  floors: number // used only when OSM has no building:levels tag
  elevator: boolean
  vacancy: string
  vacant: boolean
  restrooms: number
  accessibleRestroom: boolean
  entrances: Omit<Entrance, 'ev'>[]
  zone?: string // LA zone code (simulated)
  lotOutdoorSqft: number // fenceable open lot next to the building (from the aerial sample)
  generator: 'none' | 'life' | 'full' // backup power: none, life-safety lights and alarms only, or sized to run cooling
  condition: CondTask[]
  confidence: number
  notes: { scan: string; aerial: string }
}

// Simulated reading of what each LA zone allows. Not a ZIMAS lookup.
export const ZONE_USES: Record<string, Record<FacilityId, ZoneFit>> = {
  C2: { carehome: 'allowed', learning: 'allowed', childcare: 'allowed', clinic: 'allowed' },
  C4: { carehome: 'allowed', learning: 'allowed', childcare: 'allowed', clinic: 'allowed' },
  CR: { carehome: 'conditional', learning: 'allowed', childcare: 'conditional', clinic: 'allowed' },
  M1: { carehome: 'not allowed', learning: 'conditional', childcare: 'not allowed', clinic: 'conditional' },
}

const SAMPLES: Record<string, Sample> = {
  'hou-bellaire': {
    use: 'Retail, one storey',
    occupancy: 'M',
    kind: 'retail-open',
    floors: 1,
    elevator: false,
    vacancy: 'Vacant, listed for lease',
    vacant: true,
    restrooms: 1,
    accessibleRestroom: false,
    entrances: [
      { id: 'front', name: 'Front storefront door', stepFree: true, side: 'bottom', t: 0.18 },
      { id: 'rear', name: 'Rear door onto a raised dock', stepFree: false, side: 'top', t: 0.62 },
    ],
    lotOutdoorSqft: 1400,
    generator: 'none',
    condition: [{ id: 'hvac', name: 'Split the single retail HVAC unit into room zones', cost: 30000, core: true }],
    confidence: 0.8,
    notes: { scan: 'Open sales floor with shelving; back room and one restroom.', aerial: 'Surface lot in front; flat roof with one rooftop unit.' },
  },
  'hou-fulton': {
    use: 'Office, two storeys',
    occupancy: 'B',
    kind: 'office-cellular',
    floors: 2,
    elevator: false,
    vacancy: 'Available January 2027',
    vacant: false,
    restrooms: 2,
    accessibleRestroom: false,
    entrances: [{ id: 'front', name: 'Front door, 3 steps up', stepFree: false, side: 'bottom', t: 0.5 }],
    lotOutdoorSqft: 0,
    generator: 'life',
    condition: [{ id: 'open', name: 'Open up small ground floor offices', cost: 46000, core: true }],
    confidence: 0.7,
    notes: { scan: 'Small offices on both floors; stair only.', aerial: 'No off-street lot.' },
  },
  'hou-navigation': {
    use: 'Office, one storey',
    occupancy: 'B',
    kind: 'office-open',
    floors: 1,
    elevator: false,
    vacancy: 'Vacant, listed for lease',
    vacant: true,
    restrooms: 1,
    accessibleRestroom: true,
    entrances: [
      { id: 'side', name: 'Side door from the parking lot', stepFree: true, lip: true, side: 'right', t: 0.7 },
      { id: 'front', name: 'Front door, 1 step up', stepFree: false, side: 'bottom', t: 0.3 },
    ],
    lotOutdoorSqft: 900,
    generator: 'none',
    condition: [{ id: 'wc', name: 'Refresh the existing restroom', cost: 12000, core: true }],
    confidence: 0.7,
    notes: { scan: 'Open office, two private offices and one accessible restroom.', aerial: 'Side lot with about 10 stalls.' },
  },
  'hou-sharpstown': {
    use: 'Retail, two storefronts',
    occupancy: 'M',
    kind: 'storefront-split',
    floors: 1,
    elevator: false,
    vacancy: 'One unit vacant; one leased until March 2027',
    vacant: false,
    restrooms: 2,
    accessibleRestroom: false,
    entrances: [
      { id: 'left', name: 'Left storefront door', stepFree: true, side: 'bottom', t: 0.25 },
      { id: 'right', name: 'Right storefront door', stepFree: true, side: 'bottom', t: 0.75 },
    ],
    lotOutdoorSqft: 600,
    generator: 'none',
    condition: [{ id: 'demise', name: 'Open the demising wall between the two units', cost: 22000, core: true }],
    confidence: 0.6,
    notes: { scan: 'Two mirrored storefronts, each with a back room.', aerial: 'Shared strip-center lot.' },
  },
  'hou-sunnyside': {
    use: 'Light industrial, one storey',
    occupancy: 'S',
    kind: 'warehouse',
    floors: 1,
    elevator: false,
    vacancy: 'Vacant, owner open to lease',
    vacant: true,
    restrooms: 1,
    accessibleRestroom: false,
    entrances: [
      { id: 'office', name: 'Office door at grade', stepFree: true, side: 'bottom', t: 0.8 },
      { id: 'dock', name: 'Roll-up door at a loading dock', stepFree: false, side: 'left', t: 0.5 },
    ],
    lotOutdoorSqft: 4200,
    generator: 'life',
    condition: [
      { id: 'insulate', name: 'Insulate and air-condition the warehouse floor', cost: 52000, core: true },
      { id: 'ceiling', name: 'Drop ceiling over the program rooms', cost: 21000, core: true },
    ],
    confidence: 0.6,
    notes: { scan: 'Open warehouse floor with a small office corner.', aerial: 'Large paved yard behind the building.' },
  },
  'hou-meyerland': {
    use: 'Medical office, one storey',
    occupancy: 'B',
    kind: 'office-cellular',
    floors: 1,
    elevator: false,
    vacancy: 'Vacant, listed for lease',
    vacant: true,
    restrooms: 4,
    accessibleRestroom: true,
    entrances: [
      { id: 'front', name: 'Front door at grade', stepFree: true, side: 'bottom', t: 0.3 },
      { id: 'rear', name: 'Rear door to the parking lot', stepFree: true, side: 'top', t: 0.75 },
    ],
    lotOutdoorSqft: 1200,
    generator: 'full',
    condition: [{ id: 'open', name: 'Open up small exam rooms into bedrooms', cost: 38000, core: true }],
    confidence: 0.7,
    notes: { scan: 'Exam rooms off a central corridor; four restrooms; ceiling-mounted generator panel.', aerial: 'Rear lot; generator pad beside the building.' },
  },
  'hou-kashmere': {
    use: 'Retail, one storey',
    occupancy: 'M',
    kind: 'retail-open',
    floors: 1,
    elevator: false,
    vacancy: 'Vacant, listed for lease',
    vacant: true,
    restrooms: 1,
    accessibleRestroom: false,
    entrances: [{ id: 'front', name: 'Front storefront door', stepFree: true, side: 'bottom', t: 0.5 }],
    lotOutdoorSqft: 800,
    generator: 'none',
    condition: [{ id: 'roof', name: 'Repair the roof over the sales floor', cost: 24000, core: true }],
    confidence: 0.6,
    notes: { scan: 'Open sales floor, back room, one restroom.', aerial: 'Front lot; low ground toward the bayou behind.' },
  },
  'hou-greenspoint': {
    use: 'Office, one storey',
    occupancy: 'B',
    kind: 'office-open',
    floors: 1,
    elevator: false,
    vacancy: 'Vacant, listed for lease',
    vacant: true,
    restrooms: 2,
    accessibleRestroom: true,
    entrances: [
      { id: 'front', name: 'Front door at grade', stepFree: true, side: 'bottom', t: 0.25 },
      { id: 'side', name: 'Side door to the lot', stepFree: true, side: 'right', t: 0.5 },
    ],
    lotOutdoorSqft: 2000,
    generator: 'full',
    condition: [{ id: 'hvac', name: 'Replace two failed rooftop units', cost: 28000, core: true }],
    confidence: 0.7,
    notes: { scan: 'Open office floor with private offices; two accessible restrooms.', aerial: 'Large lot; generator on a pad by the side door.' },
  },
  'hou-alief': {
    use: 'Retail, two storefronts',
    occupancy: 'M',
    kind: 'storefront-split',
    floors: 1,
    elevator: false,
    vacancy: 'Vacant, listed for lease',
    vacant: true,
    restrooms: 2,
    accessibleRestroom: false,
    entrances: [
      { id: 'left', name: 'Left storefront door', stepFree: true, side: 'bottom', t: 0.25 },
      { id: 'right', name: 'Right storefront door', stepFree: true, side: 'bottom', t: 0.75 },
    ],
    lotOutdoorSqft: 600,
    generator: 'life',
    condition: [{ id: 'demise', name: 'Open the demising wall between the two units', cost: 22000, core: true }],
    confidence: 0.6,
    notes: { scan: 'Two storefronts with back rooms; emergency lights on a small generator.', aerial: 'Shared strip-center lot.' },
  },
  'hou-heights': {
    use: 'Office, one storey',
    occupancy: 'B',
    kind: 'office-open',
    floors: 1,
    elevator: false,
    vacancy: 'Vacant, listed for lease',
    vacant: true,
    restrooms: 1,
    accessibleRestroom: true,
    entrances: [{ id: 'front', name: 'Front door, 1 step up', stepFree: false, side: 'bottom', t: 0.4 }, { id: 'side', name: 'Side door at grade', stepFree: true, lip: true, side: 'right', t: 0.6 }],
    lotOutdoorSqft: 900,
    generator: 'none',
    condition: [{ id: 'wc', name: 'Refresh the existing restroom', cost: 12000, core: true }],
    confidence: 0.7,
    notes: { scan: 'Open office and three private offices; one accessible restroom.', aerial: 'Side lot with about 12 stalls.' },
  },
  'la-boyle': {
    use: 'Retail, two storefronts',
    occupancy: 'M',
    kind: 'storefront-split',
    floors: 1,
    elevator: false,
    vacancy: 'Vacant, listed for lease',
    vacant: true,
    restrooms: 2,
    accessibleRestroom: false,
    entrances: [
      { id: 'left', name: 'Left storefront door', stepFree: true, side: 'bottom', t: 0.25 },
      { id: 'right', name: 'Right storefront door', stepFree: true, side: 'bottom', t: 0.75 },
    ],
    zone: 'C2',
    lotOutdoorSqft: 500,
    generator: 'none',
    condition: [
      { id: 'demise', name: 'Open the demising wall between the two units', cost: 22000, core: true },
      { id: 'seismic', name: 'Seismic anchoring check for unreinforced walls', cost: 18000, core: true },
    ],
    confidence: 0.7,
    notes: { scan: 'Two storefronts with back rooms; one restroom each.', aerial: 'Small rear yard off the alley.' },
  },
  'la-vermont': {
    use: 'Retail, one storey',
    occupancy: 'M',
    kind: 'retail-open',
    floors: 1,
    elevator: false,
    vacancy: 'Vacant, listed for lease',
    vacant: true,
    restrooms: 1,
    accessibleRestroom: false,
    entrances: [
      { id: 'front', name: 'Front storefront door', stepFree: true, side: 'bottom', t: 0.5 },
      { id: 'side', name: 'Side door to the lot', stepFree: true, side: 'right', t: 0.35 },
    ],
    zone: 'C2',
    lotOutdoorSqft: 1600,
    generator: 'none',
    condition: [{ id: 'hvac', name: 'Replace the failed rooftop unit', cost: 26000, core: true }],
    confidence: 0.8,
    notes: { scan: 'Open retail floor, back room and one restroom.', aerial: 'Side lot that could be fenced.' },
  },
  'la-westlake': {
    use: 'Office, two storeys with elevator',
    occupancy: 'B',
    kind: 'office-cellular',
    floors: 2,
    elevator: true,
    vacancy: 'Ground floor vacant',
    vacant: true,
    restrooms: 2,
    accessibleRestroom: true,
    entrances: [{ id: 'front', name: 'Front door at grade', stepFree: true, side: 'bottom', t: 0.4 }],
    zone: 'CR',
    lotOutdoorSqft: 0,
    generator: 'full',
    condition: [{ id: 'open', name: 'Open up ground floor offices', cost: 34000, core: true }],
    confidence: 0.7,
    notes: { scan: 'Cellular offices; elevator to the second floor.', aerial: 'No yard; the building fills its lot.' },
  },
  'la-pacoima': {
    use: 'Light industrial, one storey',
    occupancy: 'S',
    kind: 'warehouse',
    floors: 1,
    elevator: false,
    vacancy: 'Vacant, owner open to lease',
    vacant: true,
    restrooms: 1,
    accessibleRestroom: false,
    entrances: [
      { id: 'office', name: 'Office door at grade', stepFree: true, side: 'bottom', t: 0.2 },
      { id: 'dock', name: 'Roll-up door at a loading dock', stepFree: false, side: 'right', t: 0.5 },
    ],
    zone: 'M1',
    lotOutdoorSqft: 3500,
    generator: 'life',
    condition: [{ id: 'insulate', name: 'Insulate and air-condition the warehouse floor', cost: 44000, core: true }],
    confidence: 0.6,
    notes: { scan: 'Open warehouse with an office corner.', aerial: 'Paved yard on the street side.' },
  },
  'la-highland': {
    use: 'Retail, historic storefront',
    occupancy: 'M',
    kind: 'storefront-split',
    floors: 1,
    elevator: false,
    vacancy: 'Vacant, listed for lease',
    vacant: true,
    restrooms: 1,
    accessibleRestroom: false,
    entrances: [
      { id: 'left', name: 'Recessed door, 2 steps up', stepFree: false, side: 'bottom', t: 0.3 },
      { id: 'right', name: 'Second door, 2 steps up', stepFree: false, side: 'bottom', t: 0.7 },
    ],
    zone: 'C2',
    lotOutdoorSqft: 0,
    generator: 'none',
    condition: [{ id: 'seismic', name: 'Seismic retrofit of the brick facade', cost: 38000, core: true }],
    confidence: 0.6,
    notes: { scan: 'Two narrow storefronts, raised floor above the sidewalk.', aerial: 'No yard.' },
  },
}

interface GeoSummary {
  id: string
  city: CityId
  area: string
  street: string
  at: LngLat
  building: { osmId: number; tags: Record<string, string>; ring: LngLat[]; areaM2: number; center: LngLat }
  tract: { geoid: string; name: string; landM2: number; pop: number | null; under5: number | null; over65?: number | null; over80?: number | null; source: string }
  flood?: { zone: '100' | '500' | 'minimal' | 'unmapped'; fldZone: string | null; subtype: string | null; source: string }
  metrics?: {
    stop: { name: string | null; kind: string; m: number } | null
    rail: { name: string | null; kind: string; m: number } | null
    stopsIn10: number
    park: { name: string | null; kind: string; areaM2: number; m: number } | null
    nearestExisting: Record<string, { name: string | null; m: number } | null>
    hospital?: { name: string | null; m: number; walked: boolean } | null
    flood?: FloodMetrics
  }
  fetched: string
}

// Precomputed by scripts/derive-geo.ts from the FEMA zones and the OSM street graph.
export interface FloodMetrics {
  to100: number | null // metres from the building to the nearest 100-year zone
  to500: number | null
  routeOut: { normal: number | null; z100: number | null; z500: number | null } // metres to leave the area by road
}

export interface Candidate extends Omit<Sample, 'entrances' | 'floors'> {
  id: string
  city: CityId
  name: string
  area: string
  lngLat: LngLat
  ring: LngLat[]
  osmId: number
  osmName: string | null
  floors: number
  floorsFrom: 'osm' | 'sample'
  footprintSqft: number
  sqft: number // gross: footprint times floors
  long: number // footprint long side, ft
  short: number // footprint short side, ft
  bearing: number // long side bearing, degrees
  plan: { x: number; y: number; w: number; h: number } // interior box in plan units
  scale: number // ft per plan unit
  entrances: Entrance[]
  tract: GeoSummary['tract']
  flood: NonNullable<GeoSummary['flood']>
  metrics: NonNullable<GeoSummary['metrics']>
  zoneFit: (f: FacilityId) => ZoneFit | null
  ev: string[]
}

const FT2 = 10.7639
const FT = 3.28084
const PLAN_LONG = 560

function build(g: GeoSummary): Candidate | null {
  const s = SAMPLES[g.id]
  if (!s) return null
  const levels = Number(g.building.tags['building:levels'])
  const floors = Number.isFinite(levels) && levels > 0 ? levels : s.floors
  const box = footprintBox(g.building.ring)
  const footprintSqft = Math.round((g.building.areaM2 * FT2) / 10) * 10
  // Plan box keeps the footprint's proportions, clamped so very long, thin
  // footprints still read. Scale makes the box area equal the footprint area.
  const aspect = Math.max(0.36, box.short / box.long)
  const w = PLAN_LONG
  const h = Math.round(PLAN_LONG * aspect)
  const scale = Math.sqrt(footprintSqft / (w * h))
  const m = g.metrics ?? { stop: null, rail: null, stopsIn10: 0, park: null, nearestExisting: {} }
  return {
    ...s,
    id: g.id,
    city: g.city,
    name: g.street,
    area: g.area,
    lngLat: g.building.center,
    ring: g.building.ring,
    osmId: g.building.osmId,
    osmName: g.building.tags.name ?? null,
    floors,
    floorsFrom: Number.isFinite(levels) && levels > 0 ? 'osm' : 'sample',
    footprintSqft,
    sqft: footprintSqft * floors,
    long: Math.round(box.long * FT),
    short: Math.round(box.short * FT),
    bearing: Math.round((box.angle * 180) / Math.PI),
    plan: { x: 20, y: 20, w, h },
    scale,
    entrances: s.entrances.map((e) => ({ ...e, id: `${g.id}-${e.id}`, ev: `${g.id}:scan` })),
    tract: g.tract,
    flood: g.flood ?? { zone: 'unmapped', fldZone: null, subtype: null, source: 'FEMA National Flood Hazard Layer' },
    metrics: m,
    zoneFit: (f) => (CITIES[g.city].zoning === 'none' ? null : s.zone ? (ZONE_USES[s.zone]?.[f] ?? 'conditional') : null),
    ev: [`${g.id}:osm`, `${g.id}:listing`, `${g.id}:scan`, `${g.id}:aerial`, `${g.id}:tract`],
  }
}

export const CANDIDATES: Candidate[] = Object.values(geo as unknown as Record<string, GeoSummary>)
  .map(build)
  .filter((c): c is Candidate => c !== null)

// Two sites on the same street get their neighborhood added to the name.
for (const c of CANDIDATES) {
  const twins = CANDIDATES.filter((o) => o.city === c.city && o.name.split(',')[0] === c.name.split(',')[0])
  if (twins.length > 1 && twins.indexOf(c) > 0) c.name = `${c.name}, ${c.area}`
}

export const byCity = (city: CityId) => CANDIDATES.filter((c) => c.city === city)
