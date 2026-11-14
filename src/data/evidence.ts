// The evidence trail. Every number on screen cites one of these. Kinds:
// - osm, census: real public data, fetched by scripts/fetch-geo.mjs
// - costar, matterport, vexcel: SAMPLE records standing in for those APIs
// - user: what you asked for; assumption: our planning figures

import { CITIES, FACILITIES, PLANNING, type CityId, type FacilityId } from './config'
import { CANDIDATES, type Candidate } from './candidates'

export type SourceKind = 'user' | 'osm' | 'census' | 'costar' | 'matterport' | 'vexcel' | 'assumption'

export interface Evidence {
  id: string
  kind: SourceKind
  claim: string
  detail: string
  confidence: 'observed' | 'measured' | 'estimated' | 'assumed' | 'stated' | 'sample'
  verify: boolean
  propertyId?: string
}

export const SOURCE_LABEL: Record<SourceKind, string> = {
  user: 'You said',
  osm: 'OpenStreetMap',
  census: 'US Census',
  costar: 'Sample listing',
  matterport: 'Sample interior scan',
  vexcel: 'Sample aerial',
  assumption: 'Assumption',
}

export const KIND_ORDER: SourceKind[] = ['user', 'osm', 'census', 'costar', 'matterport', 'vexcel', 'assumption']

export function userEvidence(city: CityId, facility: FacilityId, capacity: number, budget: number, outdoor: boolean, accessFirst: boolean): Evidence[] {
  const f = FACILITIES[facility]
  return [
    { id: 'U1', kind: 'user', claim: `A ${f.label} for ${capacity} ${f.noun} in ${CITIES[city].name}`, detail: 'A target you set. It is not a licensed or certified capacity.', confidence: 'stated', verify: false },
    { id: 'U3', kind: 'user', claim: 'Step free entry is required', detail: 'Hard rule. A building with steps at every door is rejected.', confidence: 'stated', verify: false },
    { id: 'U4', kind: 'user', claim: `Adaptation budget $${Math.round(budget / 1000)}k`, detail: 'Hard rule. Core work must fit inside it; optional work is added while it fits.', confidence: 'stated', verify: false },
    ...(outdoor && !f.needsOutdoor ? [{ id: 'U2', kind: 'user' as const, claim: 'Add an outdoor playground', detail: 'Turns outdoor play into a hard rule for this design.', confidence: 'stated' as const, verify: false }] : []),
    ...(accessFirst ? [{ id: 'U5', kind: 'user' as const, claim: 'Wheelchair accessibility comes first', detail: 'Wider corridor, larger accessible restrooms and accessibility weighted in the plan.', confidence: 'stated' as const, verify: false }] : []),
  ]
}

const pct = (n: number) => `${Math.round(n * 100)}%`

export const ASSUMPTIONS: Evidence[] = [
  { id: 'A1', kind: 'assumption', claim: 'Learning center rooms at 35 sq ft per person', detail: 'Our assumption for sketching rooms, not taken from a building code or study. Not a legal occupancy limit. Replace with the architect\'s ratio.', confidence: 'assumed', verify: true },
  { id: 'A5', kind: 'assumption', claim: 'Childcare: 35 sq ft indoors and 75 sq ft outdoors per child; 16 children per classroom', detail: 'Planning figures only. Licensing rules differ by state and age group: confirm with Texas HHSC or California Community Care Licensing.', confidence: 'assumed', verify: true },
  { id: 'A6', kind: 'assumption', claim: 'Clinic: one 110 sq ft exam room per 16 visits a day', detail: 'Planning ratio for sketching. Real clinics size by provider schedule.', confidence: 'assumed', verify: true },
  { id: 'A3', kind: 'assumption', claim: `Costs are planning ranges of plus or minus ${pct(PLANNING.costSpread)}, not quotes`, detail: 'Unit costs (partitions per foot, restrooms, ramps, HVAC zones) are round planning figures. Get contractor quotes before committing.', confidence: 'assumed', verify: true },
  { id: 'A4', kind: 'assumption', claim: 'A different code occupancy group means a change of use', detail: 'Usually triggers an exits, restroom and fire review. Confirm with the city permitting office.', confidence: 'assumed', verify: true },
  { id: 'A7', kind: 'assumption', claim: `${PLANNING.secondExitAt} or more occupants: plan a second exit and second restroom`, detail: 'A common building-code threshold used here as a rule of thumb. Confirm with the code official.', confidence: 'assumed', verify: true },
  { id: 'A8', kind: 'assumption', claim: `A public park within ${PLANNING.parkWalkM} m can stand in for outdoor play`, detail: 'Some licensing agencies allow off-site play with conditions; some do not.', confidence: 'assumed', verify: true },
  { id: 'P1', kind: 'assumption', claim: 'Room areas measured on a concept plan drawn to the OSM footprint', detail: 'The plan is a rectangle with the footprint\'s proportions and area. Walls have no thickness, so real rooms are about 5 to 10% smaller. Interior layout is generated, not surveyed.', confidence: 'estimated', verify: true },
  { id: 'Z1', kind: 'assumption', claim: 'LA zone permissions are a simulated reading', detail: 'Zone codes and what they allow are sample data, not a ZIMAS lookup. A conditional use adds about 4 months and $15k here.', confidence: 'sample', verify: true },
  { id: 'Z2', kind: 'assumption', claim: 'Houston has no zoning ordinance', detail: 'Land use is shaped by deed restrictions and Chapter 42 rules instead. Deed restrictions were not checked.', confidence: 'observed', verify: true },
  { id: 'I1', kind: 'assumption', claim: 'New construction: learning $380, childcare $420, clinic $520 per sq ft', detail: 'Round planning figures for comparison only, land not included. Replace with local cost data.', confidence: 'assumed', verify: true },
  { id: 'I2', kind: 'assumption', claim: `Walking at ${PLANNING.walkSpeedMpm} m a minute, so 10 minutes is about 800 m`, detail: 'Measured along OSM streets and paths, not as the crow flies. Real walks are slower with children and crossings.', confidence: 'assumed', verify: false },
  { id: 'I3', kind: 'assumption', claim: 'Reuse: about 3 months plus 2 per $100k of work; new build about 24 months', detail: 'Planning figures for comparison. Permits, financing and contractor availability move both.', confidence: 'assumed', verify: true },
  { id: 'I4', kind: 'assumption', claim: 'People served assumes tract population is spread evenly', detail: 'Census tract density times the walk catchment area. Real population is uneven across a tract.', confidence: 'assumed', verify: true },
]

function siteEvidence(c: Candidate): Evidence[] {
  const t = c.tract
  const m = c.metrics
  return [
    { id: `${c.id}:osm`, kind: 'osm', propertyId: c.id, claim: `Footprint ${c.footprintSqft.toLocaleString('en-US')} sq ft, about ${c.long} by ${c.short} ft${c.floorsFrom === 'osm' ? `, ${c.floors} levels` : ''}`, detail: `OSM way ${c.osmId}. Measured from the mapped outline; OSM outlines can be off by a metre or two.`, confidence: 'measured', verify: false },
    { id: `${c.id}:osmwalk`, kind: 'osm', propertyId: c.id, claim: m.stop ? `Nearest stop ${m.stop.name ?? m.stop.kind}, ${m.stop.m} m walk; ${m.stopsIn10} stops within 10 minutes` : 'No transit stop within 1.3 km in OSM', detail: `Walking distances along OSM streets and paths.${m.park ? ` Nearest park: ${m.park.name ?? m.park.kind}, ${m.park.m} m.` : ''}`, confidence: 'measured', verify: false },
    { id: `${c.id}:tract`, kind: 'census', propertyId: c.id, claim: `${t.name}: ${t.pop.toLocaleString('en-US')} people, ${t.under5.toLocaleString('en-US')} under 5`, detail: `${t.source}. Tract land area ${(t.landM2 / 1e6).toFixed(2)} km².`, confidence: 'measured', verify: false },
    { id: `${c.id}:listing`, kind: 'costar', propertyId: c.id, claim: `${c.use}; ${c.vacancy.toLowerCase()}${c.zone ? `; zone ${c.zone}` : ''}${c.floorsFrom === 'sample' ? `; ${c.floors} storey${c.floors > 1 ? 's' : ''}` : ''}`, detail: 'Sample record standing in for the CoStar property API. Vacancy, use and storeys are simulated.', confidence: 'sample', verify: true },
    { id: `${c.id}:scan`, kind: 'matterport', propertyId: c.id, claim: c.notes.scan, detail: `Sample interior. Doors: ${c.entrances.map((e) => e.name.toLowerCase()).join('; ')}. Simulated, not a Matterport capture.`, confidence: 'sample', verify: true },
    { id: `${c.id}:aerial`, kind: 'vexcel', propertyId: c.id, claim: c.notes.aerial, detail: `Sample reading of the aerial view${c.lotOutdoorSqft ? `: about ${c.lotOutdoorSqft.toLocaleString('en-US')} sq ft of fenceable yard` : ''}. Not a Vexcel result.`, confidence: 'sample', verify: true },
  ]
}

export const SITE_EVIDENCE: Evidence[] = CANDIDATES.flatMap(siteEvidence)
