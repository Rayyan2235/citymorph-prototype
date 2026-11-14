// Deterministic evaluator. Code decides pass, fail, rank and every warning;
// no model is involved. Changing any input reruns this and changes the answer.

import { CARE, CARE_WEIGHTS, CITIES, FACILITIES, PLANNING, SCORE_WEIGHTS, type CityId, type DesignOpts, type FacilityId } from '../data/config'
import { byCity, type Candidate } from '../data/candidates'
import { makeLayout, type Layout, type Variant } from './layout'
import { fitBudget, workList, type Task } from './costs'
import { defaultNightStaff, evacuate, type Evac } from './evacuation'

export interface Request {
  city: CityId
  facility: FacilityId
  capacity: number
  budget: number
  opts: DesignOpts
  variant: Variant
}

export type CheckId = 'access' | 'space' | 'level' | 'budget' | 'zoning' | 'outdoor' | 'flood' | 'power'

export interface Check {
  id: CheckId
  label: string
  fail: string
  pass: boolean
  required: string
  observed: string
  ev: string[]
}

export type CriterionId = keyof typeof SCORE_WEIGHTS | keyof typeof CARE_WEIGHTS

export interface Criterion {
  id: CriterionId
  label: string
  value: number // 0..1
  weight: number
  points: number // value times weight, out of weight times 100
  note: string
  ev: string[]
}

export interface Conflict {
  check: CheckId | 'warn'
  text: string
  suggest: string | null
}

export interface Result {
  property: Candidate
  status: 'pass' | 'fail'
  score: number
  criteria: Criterion[]
  checks: Check[]
  plan: Layout
  tasks: Task[]
  selected: Task[]
  dropped: Task[]
  cost: number
  coreCost: number
  conflicts: Conflict[]
  maxCapacity: number
  conditional: boolean
  evac: Evac | null // night evacuation, old age homes only
}

export const k = (n: number) => `$${Math.round(n / 1000)}k`
export const sqft = (n: number) => `${Math.round(n).toLocaleString('en-US')} sq ft`
const clamp = (v: number) => Math.min(1, Math.max(0, v))
const walkMin = (m: number) => Math.max(1, Math.round(m / PLANNING.walkSpeedMpm))

function parkFor(c: Candidate) {
  const p = c.metrics.park
  return p && p.m <= PLANNING.parkWalkM ? { name: p.name ?? `a ${p.kind}`, m: p.m } : null
}

function evaluateOne(c: Candidate, req: Request): Omit<Result, 'conflicts'> {
  const f = FACILITIES[req.facility]
  const plan = makeLayout(c, req.facility, req.capacity, req.opts, req.variant, parkFor(c))
  const zone = c.zoneFit(req.facility)
  const conditional = zone === 'conditional'
  const tasks = workList(c, req.facility, req.opts, plan, conditional)
  const { selected, dropped, cost, coreCost } = fitBudget(tasks, req.budget)
  const door = plan.door
  const needOutdoor = f.needsOutdoor || req.opts.outdoorPlay

  const checks: Check[] = [
    {
      id: 'access',
      label: 'Step free entry',
      fail: 'No step free entry',
      pass: Boolean(door),
      required: 'At least one step free entrance',
      observed: door ? door.name + (door.lip ? ' (small lip, short ramp added)' : '') : c.entrances.map((e) => e.name).join(', '),
      ev: ['U3', `${c.id}:scan`],
    },
    {
      id: 'space',
      label: 'Fits the program',
      fail: 'Too small',
      pass: plan.achieved >= req.capacity,
      required: `${req.capacity} ${f.noun}`,
      observed: plan.achieved >= req.capacity ? `${sqft(plan.roomSqft)} of rooms on the ground floor` : `Room for ${plan.achieved} of ${req.capacity} ${f.noun}`,
      ev: [f.ratioEv, `${c.id}:osm`, 'P1'],
    },
    {
      id: 'level',
      label: 'One level',
      fail: 'Not on one level',
      pass: c.floors === 1 || c.elevator,
      required: 'Every room reachable without stairs',
      observed: c.floors === 1 ? 'Single storey' : c.elevator ? `${c.floors} storeys with an elevator` : `${c.floors} storeys, no elevator listed`,
      ev: [c.floorsFrom === 'osm' ? `${c.id}:osm` : `${c.id}:listing`],
    },
    {
      id: 'budget',
      label: 'Core work fits budget',
      fail: 'Over budget',
      pass: coreCost <= req.budget,
      required: `${k(req.budget)} or less`,
      observed: `${k(coreCost)} core work`,
      ev: ['U4', 'A3'],
    },
  ]
  if (zone)
    checks.push({
      id: 'zoning',
      label: 'Zoning',
      fail: 'Zone does not allow it',
      pass: zone !== 'not allowed',
      required: `${f.label} allowed in the zone`,
      observed: `${c.zone}: ${zone}`,
      ev: [`${c.id}:listing`, 'Z1'],
    })
  if (needOutdoor)
    checks.push({
      id: 'outdoor',
      label: 'Outdoor play',
      fail: 'No outdoor play space',
      pass: (plan.outdoor?.short ?? 0) === 0,
      required: `${sqft(plan.outdoor?.need ?? 0)} outdoors`,
      observed: plan.outdoor?.park
        ? `${plan.outdoor.lot ? `${sqft(plan.outdoor.lot.sqft)} yard + ` : ''}${plan.outdoor.park.name}, ${walkMin(plan.outdoor.park.m)} min walk`
        : plan.outdoor?.lot
          ? `${sqft(plan.outdoor.lot.sqft)} fenced yard${plan.outdoor.short ? `, ${sqft(plan.outdoor.short)} short` : ''}`
          : 'No yard and no park within a 5 minute walk',
      ev: [`${c.id}:aerial`, 'A8', `${c.id}:osmwalk`],
    })

  const care = req.facility === 'carehome'
  if (care) {
    const fz = c.flood.zone
    checks.push({
      id: 'flood',
      label: 'Outside the 100-year floodplain',
      fail: 'In the 100-year floodplain',
      pass: fz !== '100',
      required: 'Building outside the FEMA 100-year flood zone',
      observed: fz === '100' ? `FEMA zone ${c.flood.fldZone}` : fz === '500' ? 'In the 500-year zone (0.2% a year)' : fz === 'minimal' ? `Minimal flood hazard (zone ${c.flood.fldZone ?? 'X'})` : 'Not mapped by FEMA',
      ev: [`${c.id}:fema`],
    })
    const hasPower = c.generator === 'full' || req.opts.generator
    checks.push({
      id: 'power',
      label: 'Backup cooling',
      fail: 'No backup cooling',
      pass: hasPower,
      required: 'Backup power that runs cooling and heating, so residents can stay in a blackout',
      observed: c.generator === 'full' ? 'Existing generator runs cooling' : req.opts.generator ? (c.generator === 'life' ? 'Generator upgrade in the plan' : 'New generator in the plan') : c.generator === 'life' ? 'Generator runs lights and alarms only' : 'No generator',
      ev: [`${c.id}:scan`, 'C4'],
    })
  }
  const pass = checks.every((x) => x.pass)
  const m = c.metrics
  const stopM = m.stop?.m ?? 2000
  const outdoorValue = plan.outdoor
    ? plan.outdoor.short
      ? 0
      : plan.outdoor.lot && !plan.outdoor.park
        ? 1
        : 0.7
    : c.lotOutdoorSqft > 0
      ? 0.8
      : m.park
        ? clamp(1 - m.park.m / 900)
        : 0
  // Largest capacity this building holds with the same options.
  let maxCapacity = plan.achieved >= req.capacity ? req.capacity : 0
  const step = f.capacity.step
  if (maxCapacity) {
    for (let cap = req.capacity + step; cap <= f.capacity.max; cap += step) {
      if (makeLayout(c, req.facility, cap, req.opts, req.variant, null).achieved >= cap) maxCapacity = cap
      else break
    }
  } else {
    for (let cap = req.capacity - step; cap >= f.capacity.min; cap -= step)
      if (makeLayout(c, req.facility, cap, req.opts, req.variant, null).achieved >= cap) {
        maxCapacity = cap
        break
      }
  }

  const W = SCORE_WEIGHTS
  let raw: Omit<Criterion, 'points'>[] = [
    // Spare capacity: full marks at 2.5 times what you asked for, zero when it only just fits.
    { id: 'space', label: 'Room to grow', value: plan.squeeze < 1 ? 0 : clamp((maxCapacity / req.capacity - 1) / 1.5), weight: W.space, note: plan.squeeze < 1 ? `Rooms squeezed to ${Math.round(plan.squeeze * 100)}%` : maxCapacity > req.capacity ? `Fits up to ${maxCapacity}${maxCapacity >= f.capacity.max ? '+' : ''}; you asked for ${req.capacity}` : `Only just fits ${req.capacity}`, ev: ['P1', f.ratioEv] },
    { id: 'access', label: 'Accessibility', value: door ? clamp(0.6 + (door.lip ? 0 : 0.2) + (plan.entrances.filter((e) => !e.isNew).length > 1 ? 0.2 : 0)) : 0, weight: W.access, note: door ? `${door.name}${plan.entrances.length > 1 ? `, ${plan.entrances.length} exits` : ''}` : 'Steps at every door', ev: [`${c.id}:scan`] },
    { id: 'transit', label: 'Transit access', value: clamp(1 - (stopM - 150) / 1050 + (m.rail && m.rail.m <= 800 ? 0.15 : 0)), weight: W.transit, note: m.stop ? `${m.stop.kind === 'bus' ? 'Bus stop' : 'Rail station'} ${walkMin(m.stop.m)} min walk${m.rail && m.rail.m <= 800 ? `, rail ${walkMin(m.rail.m)} min` : ''}` : 'No stop mapped in OSM within 1.3 km', ev: [`${c.id}:osmwalk`] },
    { id: 'outdoor', label: 'Outdoor space', value: outdoorValue, weight: W.outdoor, note: c.lotOutdoorSqft ? `${sqft(c.lotOutdoorSqft)} yard` : m.park ? `${m.park.name ?? 'Park'}, ${walkMin(m.park.m)} min walk` : 'None nearby', ev: [`${c.id}:aerial`, `${c.id}:osmwalk`] },
    { id: 'cost', label: 'Budget left', value: clamp((req.budget - cost) / req.budget / 0.6), weight: W.cost, note: `${k(cost)} of ${k(req.budget)}`, ev: ['A3'] },
    { id: 'zoning', label: 'Zoning', value: zone === 'allowed' ? 1 : zone === 'conditional' ? 0.45 : zone === 'not allowed' ? 0 : 0.8, weight: W.zoning, note: zone ? `${c.zone}: ${zone}` : 'No zoning ordinance; deed restrictions unchecked', ev: zone ? ['Z1'] : ['Z2'] },
    { id: 'evidence', label: 'Ready and known', value: clamp(c.confidence * (c.vacant ? 1 : 0.7)), weight: W.evidence, note: c.vacancy, ev: [`${c.id}:listing`] },
  ]
  // Points per item are rounded first, so the card's points add up to the fit score exactly.
  // Old age homes are scored on surviving a disaster, not on transit or zoning.
  const staff = req.opts.nightStaff || defaultNightStaff(req.capacity)
  const evac = care ? evacuate(plan, req.capacity, staff) : null
  if (care && evac) {
    const fl = m.flood
    const to100 = fl?.to100 ?? null
    const to500 = fl?.to500 ?? null
    const out = fl?.routeOut ?? { normal: null, z100: null, z500: null }
    const C = CARE_WEIGHTS
    const km = (n: number) => `${(n / 1000).toFixed(1)} km`
    const h = m.hospital
    raw = [
      { id: 'flood', label: 'Flood exposure', value: c.flood.zone === '100' ? 0 : clamp((to100 ?? CARE.floodSafeM) / CARE.floodSafeM) * 0.85 + (c.flood.zone === '500' || to500 === 0 ? 0 : 0.15), weight: C.flood, note: to100 === null ? 'No FEMA 100-year zone within 1.3 km' : to100 === 0 ? 'Inside the 100-year zone' : `${to100} m from the 100-year zone${to500 === 0 ? ', inside the 500-year zone' : to500 !== null ? `, ${to500} m from the 500-year zone` : ''}`, ev: [`${c.id}:fema`] },
      { id: 'route', label: 'Road out in a flood', value: out.z500 && out.normal ? clamp(1 - (out.z500 / out.normal - 1)) : out.z100 && out.normal ? 0.4 * clamp(1 - (out.z100 / out.normal - 1)) : 0, weight: C.route, note: out.z500 && out.normal ? `${km(out.z500)} out in a 500-year flood, normally ${km(out.normal)}` : out.z100 ? `Cut off in a 500-year flood; ${km(out.z100)} out in a 100-year flood` : 'Cut off by a 100-year flood', ev: [`${c.id}:fema`, `${c.id}:osmwalk`] },
      { id: 'evac', label: 'Night evacuation', value: clamp((CARE.badMin - evac.minutes) / (CARE.badMin - CARE.goodMin)), weight: C.evac, note: `${evac.minutes} min with ${evac.staff} night staff; ${evac.assisted} of ${evac.residents} need help`, ev: ['C1', 'C2', 'C3', 'P1'] },
      { id: 'power', label: 'Backup cooling', value: c.generator === 'full' ? 1 : req.opts.generator ? 0.7 : 0, weight: C.power, note: c.generator === 'full' ? 'Existing generator runs cooling' : req.opts.generator ? 'Added in the plan' : 'None', ev: [`${c.id}:scan`, 'C4'] },
      { id: 'access', label: 'Step free exits', value: door ? clamp(0.5 + (door.lip ? 0 : 0.2) + (evac.exits > 1 ? 0.3 : 0)) : 0, weight: C.access, note: `${evac.exits} step free exit${evac.exits === 1 ? '' : 's'}; furthest bed ${evac.farFt} ft from one`, ev: [`${c.id}:scan`, 'P1'] },
      { id: 'hospital', label: 'Hospital nearby', value: h ? clamp((CARE.hospitalBadM - h.m) / (CARE.hospitalBadM - CARE.hospitalGoodM)) : 0, weight: C.hospital, note: h ? `${h.name ?? 'Hospital'}, ${km(h.m)} straight line` : 'No hospital mapped within 2.6 km', ev: [`${c.id}:osmwalk`] },
      { id: 'cost', label: 'Budget left', value: clamp((req.budget - cost) / req.budget / 0.6), weight: C.cost, note: `${k(cost)} of ${k(req.budget)}`, ev: ['A3'] },
    ]
  }
  const criteria: Criterion[] = raw.map((x) => ({ ...x, points: Math.round(x.value * x.weight * 100) }))
  const score = pass ? criteria.reduce((t, x) => t + x.points, 0) : 0

  return { property: c, status: pass ? 'pass' : 'fail', score, criteria, checks, plan, tasks, selected, dropped, cost, coreCost, maxCapacity, conditional, evac }
}

// Conflicts explain each failed rule and suggest the nearest fix: change the
// design, or move to a building that passes that rule.
function conflictsFor(r: Omit<Result, 'conflicts'>, all: Omit<Result, 'conflicts'>[], req: Request): Conflict[] {
  const f = FACILITIES[req.facility]
  // Only ever suggest a building that passes every rule.
  const alt = (_id: string) => all.filter((o) => o !== r && o.status === 'pass').sort((a, b) => b.score - a.score)[0]
  const name = (o?: Omit<Result, 'conflicts'>) => (o ? o.property.name : null)
  const out: Conflict[] = []
  for (const c of r.checks.filter((x) => !x.pass)) {
    const o = alt(c.id)
    if (c.id === 'space')
      out.push({
        check: 'space',
        text: `The program needs about ${sqft(r.plan.needSqft)}; the rooms here hold ${r.plan.achieved} of ${req.capacity} ${f.noun}.`,
        suggest: r.maxCapacity ? `Lower capacity to ${r.maxCapacity}${o ? `, or try ${name(o)}` : ''}.` : o ? `Try ${name(o)}.` : null,
      })
    if (c.id === 'budget') {
      const extra = r.tasks.filter((t) => t.core && (t.id === 'wide' || t.id === 'play' || t.id === 'cup'))
      out.push({
        check: 'budget',
        text: `Core work is ${k(r.coreCost)}, ${k(r.coreCost - req.budget)} over the ${k(req.budget)} budget.`,
        suggest: [extra.length ? `Dropping ${extra.map((t) => t.name.toLowerCase()).join(' and ')} saves ${k(extra.reduce((s, t) => s + t.cost, 0))}` : null, o ? `${name(o)} fits at ${k(o.cost)}` : null, `or raise the budget to ${k(Math.ceil(r.coreCost / 5000) * 5000)}`].filter(Boolean).join('; ') + '.',
      })
    }
    if (c.id === 'access') out.push({ check: 'access', text: `Every door has steps: ${c.observed}.`, suggest: `A ramp at the main door is about $28k and needs city approval${o ? `; ${name(o)} already has step free entry` : ''}.` })
    if (c.id === 'level') out.push({ check: 'level', text: `${c.observed}; some rooms would need the stairs.`, suggest: o ? `Choose a single-storey building such as ${name(o)}.` : 'An elevator or lift would be needed.' })
    if (c.id === 'zoning') out.push({ check: 'zoning', text: `Zone ${r.property.zone} does not allow a ${f.label} (simulated reading).`, suggest: o ? `Try ${name(o)}, or a different facility type.` : 'Try a different facility type.' })
    if (c.id === 'outdoor')
      out.push({
        check: 'outdoor',
        text: `Outdoor play needs ${sqft(r.plan.outdoor?.need ?? 0)}; this site is ${sqft(r.plan.outdoor?.short ?? 0)} short and has no park within a 5 minute walk.`,
        suggest: f.needsOutdoor ? (o ? `Try ${name(o)}, or lower capacity.` : 'Lower capacity.') : 'Turn off the outdoor playground, or choose a building with a yard.',
      })
  }
  for (const c of r.checks.filter((x) => !x.pass)) {
    const o = alt(c.id)
    if (c.id === 'flood') out.push({ check: 'flood', text: `The building sits in the FEMA 100-year floodplain (${c.observed}). Residents who cannot walk would need rescue by boat.`, suggest: o ? `Choose ${name(o)}, outside the floodplain.` : 'Look for a building outside the floodplain.' })
    if (c.id === 'power') out.push({ check: 'power', text: 'Without backup cooling, residents cannot stay through a summer blackout, and evacuating frail residents carries its own risk.', suggest: 'Turn on "Add backup cooling" to include a generator in the plan.' })
  }
  if (r.evac && r.evac.minutes > CARE.badMin * 0.75) out.push({ check: 'warn', text: `Night evacuation takes about ${r.evac.minutes} minutes with ${r.evac.staff} staff.`, suggest: `One more night staff member brings it to about ${Math.round(CARE.alarmMin + ((r.evac.minutes - CARE.alarmMin) * r.evac.staff) / (r.evac.staff + 1))} minutes.` })
  if (r.conditional) out.push({ check: 'warn', text: `Zone ${r.property.zone} needs a conditional use permit: about 4 more months and $15k.`, suggest: null })
  if (r.status === 'pass' && r.plan.squeeze < 1) out.push({ check: 'warn', text: `Rooms are squeezed to ${Math.round(r.plan.squeeze * 100)}% of the program size.`, suggest: `Lower capacity to ${r.maxCapacity} for full-size rooms.` })
  if (r.status === 'pass' && r.plan.entrances.some((e) => e.isNew)) out.push({ check: 'warn', text: `${r.plan.occupants} occupants need a second exit; one is added to the plan.`, suggest: null })
  if (r.status === 'pass' && r.plan.outdoor?.park) out.push({ check: 'warn', text: `Outdoor play relies on ${r.plan.outdoor.park.name}, a public park; licensing must approve off-site play.`, suggest: null })
  if (r.status === 'pass' && r.dropped.length) out.push({ check: 'warn', text: `Optional work that does not fit: ${r.dropped.map((t) => t.name.toLowerCase()).join(', ')}.`, suggest: null })
  return out
}

export function evaluate(req: Request): Result[] {
  const list = byCity(req.city).map((c) => evaluateOne(c, req))
  const withConflicts: Result[] = list.map((r) => ({ ...r, conflicts: conflictsFor(r, list, req) }))
  return withConflicts.sort((a, b) => (a.status === b.status ? b.score - a.score : a.status === 'pass' ? -1 : 1))
}

// The order the Inspector checks buildings in: the order Scout found them.
export function inspectionOrder(req: Request): string[] {
  return byCity(req.city).map((c) => c.id)
}

export function cityName(id: CityId) {
  return CITIES[id].name
}

export { k as thousands }

export interface BudgetStep {
  id: string
  name: string
  budget: number
  extra: number
  gain: number
  from: { name: string; score: number; evac: number | null } | null
  to: { score: number; evac: number | null }
  reasons: string[]
}

export function budgetStep(req: Request, results: Result[], stretch = 0.15): BudgetStep | null {
  const best = results.find((r) => r.status === 'pass') ?? null
  let pick: BudgetStep | null = null
  for (const r of results) {
    if (r.status === 'pass') continue
    const onlyBudget = r.checks.every((c) => c.pass || c.id === 'budget')
    if (!onlyBudget || r.coreCost > req.budget * (1 + stretch)) continue
    const nb = Math.ceil(r.coreCost / 5000) * 5000
    const again = evaluate({ ...req, budget: nb }).find((x) => x.property.id === r.property.id)
    if (!again || again.status !== 'pass') continue
    const base = best ? evaluate({ ...req, budget: nb }).find((x) => x.property.id === best.property.id) : null
    const gain = again.score - (base?.score ?? 0)
    if (gain < 4) continue
    const reasons = base
      ? again.criteria
          .map((c) => ({ c, d: c.points - (base.criteria.find((x) => x.id === c.id)?.points ?? 0) }))
          .filter((x) => x.d >= 2 && x.c.id !== 'cost')
          .sort((a, b) => b.d - a.d)
          .slice(0, 3)
          .map((x) => `${x.c.label.toLowerCase()}: ${x.c.note.charAt(0).toLowerCase()}${x.c.note.slice(1)}`)
      : ['it is the only building that passes every other rule']
    if (!pick || gain / (nb - req.budget) > pick.gain / pick.extra)
      pick = { id: r.property.id, name: r.property.name, budget: nb, extra: nb - req.budget, gain, from: best ? { name: best.property.name, score: best.score, evac: best.evac?.minutes ?? null } : null, to: { score: again.score, evac: again.evac?.minutes ?? null }, reasons }
  }
  return pick
}
