// Deterministic evaluator. Code decides pass, fail, rank and every warning;
// no model is involved. Changing any input reruns this and changes the answer.

import { CITIES, FACILITIES, PLANNING, SCORE_WEIGHTS, type CityId, type DesignOpts, type FacilityId } from '../data/config'
import { byCity, type Candidate } from '../data/candidates'
import { makeLayout, type Layout, type Variant } from './layout'
import { fitBudget, workList, type Task } from './costs'

export interface Request {
  city: CityId
  facility: FacilityId
  capacity: number
  budget: number
  opts: DesignOpts
  variant: Variant
}

export type CheckId = 'access' | 'space' | 'level' | 'budget' | 'zoning' | 'outdoor'

export interface Check {
  id: CheckId
  label: string
  fail: string
  pass: boolean
  required: string
  observed: string
  ev: string[]
}

export type CriterionId = keyof typeof SCORE_WEIGHTS

export interface Criterion {
  id: CriterionId
  label: string
  value: number // 0..1
  weight: number
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
  const W = SCORE_WEIGHTS
  const criteria: Criterion[] = [
    { id: 'space', label: 'Room to grow', value: clamp(((plan.achieved / req.capacity) * plan.squeeze - 0.9) / 0.6), weight: W.space, note: plan.squeeze < 1 ? `Rooms squeezed to ${Math.round(plan.squeeze * 100)}%` : `Room for ${plan.achieved}`, ev: ['P1', f.ratioEv] },
    { id: 'access', label: 'Accessibility', value: door ? clamp(0.6 + (door.lip ? 0 : 0.2) + (plan.entrances.filter((e) => !e.isNew).length > 1 ? 0.2 : 0)) : 0, weight: W.access, note: door ? `${door.name}${plan.entrances.length > 1 ? `, ${plan.entrances.length} exits` : ''}` : 'Steps at every door', ev: [`${c.id}:scan`] },
    { id: 'transit', label: 'Transit access', value: clamp(1 - (stopM - 150) / 1050 + (m.rail && m.rail.m <= 800 ? 0.15 : 0)), weight: W.transit, note: m.stop ? `${m.stop.kind === 'bus' ? 'Bus stop' : 'Rail station'} ${walkMin(m.stop.m)} min walk${m.rail && m.rail.m <= 800 ? `, rail ${walkMin(m.rail.m)} min` : ''}` : 'No stop mapped in OSM within 1.3 km', ev: [`${c.id}:osmwalk`] },
    { id: 'outdoor', label: 'Outdoor space', value: outdoorValue, weight: W.outdoor, note: c.lotOutdoorSqft ? `${sqft(c.lotOutdoorSqft)} yard` : m.park ? `${m.park.name ?? 'Park'}, ${walkMin(m.park.m)} min walk` : 'None nearby', ev: [`${c.id}:aerial`, `${c.id}:osmwalk`] },
    { id: 'cost', label: 'Budget left', value: clamp((req.budget - cost) / req.budget / 0.6), weight: W.cost, note: `${k(cost)} of ${k(req.budget)}`, ev: ['A3'] },
    { id: 'zoning', label: 'Zoning', value: zone === 'allowed' ? 1 : zone === 'conditional' ? 0.45 : zone === 'not allowed' ? 0 : 0.8, weight: W.zoning, note: zone ? `${c.zone}: ${zone}` : 'No zoning ordinance; deed restrictions unchecked', ev: zone ? ['Z1'] : ['Z2'] },
    { id: 'evidence', label: 'Ready and known', value: clamp(c.confidence * (c.vacant ? 1 : 0.7)), weight: W.evidence, note: c.vacancy, ev: [`${c.id}:listing`] },
  ]
  const score = pass ? Math.round(100 * criteria.reduce((t, x) => t + x.value * x.weight, 0)) : 0

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

  return { property: c, status: pass ? 'pass' : 'fail', score, criteria, checks, plan, tasks, selected, dropped, cost, coreCost, maxCapacity, conditional }
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
