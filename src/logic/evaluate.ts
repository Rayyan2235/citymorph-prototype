// Deterministic evaluator. Code decides pass, fail and rank; the agent only
// explains. Changing an input changes the computed recommendation.
import { PLANNING, type Property, type PropertyId, type Task } from '../data/demo'

export interface Request {
  people: number
  budget: number
  stepFree: boolean
}

export interface Shocks {
  rejected: PropertyId[]
  closedEntrances: string[]
}

export type CheckId = 'access' | 'space' | 'level' | 'budget'

export interface Check {
  id: CheckId
  label: string
  fail: string // short failure wording, e.g. "Over budget"
  pass: boolean
  required: string
  observed: string
  ev: string[]
}

export interface Result {
  property: Property
  status: 'pass' | 'fail' | 'rejected'
  score: number
  parts: { space: number; rooms: number; budget: number; evidence: number }
  checks: Check[]
  selected: Task[]
  dropped: Task[]
  cost: number
  coreCost: number
  usable: number
  need: number
}

const k = (n: number) => `$${Math.round(n / 1000)}k`
const sq = (n: number) => `${Math.round(n).toLocaleString('en-US')} sq ft`

export function evaluate(req: Request, props: Property[], shocks: Shocks): Result[] {
  const need = req.people * PLANNING.sqftPerPerson + PLANNING.supportSqft

  const results = props.map<Result>((p) => {
    const usable = p.sqft * PLANNING.usableShare
    const open = p.entrances.filter((e) => !shocks.closedEntrances.includes(e.id))
    const stepFree = open.find((e) => e.stepFree)

    const core = p.tasks.filter((t) => t.core)
    const coreCost = core.reduce((s, t) => s + t.cost, 0)
    const selected: Task[] = [...core]
    let cost = coreCost
    for (const t of p.tasks.filter((t) => !t.core)) {
      if (cost + t.cost <= req.budget) {
        selected.push(t)
        cost += t.cost
      }
    }
    const dropped = p.tasks.filter((t) => !selected.includes(t))

    const checks: Check[] = [
      {
        id: 'access',
        label: 'Step free entry',
        fail: 'No step free entry',
        pass: !req.stepFree || Boolean(stepFree),
        required: 'At least one step free entrance',
        observed: stepFree ? stepFree.name : open.length ? open.map((e) => e.name).join(', ') : 'No open entrance',
        ev: ['U3', ...(stepFree ? [stepFree.ev] : open.map((e) => e.ev))],
      },
      {
        id: 'space',
        label: 'Room for the program',
        fail: 'Too small',
        pass: usable >= need,
        required: `${sq(need)} planning area`,
        observed: `${sq(usable)} usable, est.`,
        ev: ['A1', 'A2', p.ev[0]],
      },
      {
        id: 'level',
        label: 'Rooms on one level',
        fail: 'Not on one level',
        pass: p.floors === 1,
        required: 'Reception and both rooms on one floor',
        observed: p.floors === 1 ? 'Single storey' : `${p.floors} storeys, no elevator listed`,
        ev: p.floors === 1 ? [p.ev[0]] : [p.ev[0], 'C3'],
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

    const rejected = shocks.rejected.includes(p.id)
    const pass = checks.every((c) => c.pass)
    const spaceFit = Math.min(usable / need, 2) / 2
    const headroom = Math.max(0, (req.budget - cost) / req.budget)
    const score = pass
      ? Math.round(100 * (0.35 * spaceFit + 0.25 * headroom + 0.2 * p.activityZoneFit + 0.2 * p.confidence))
      : 0

    return {
      property: p,
      status: rejected ? 'rejected' : pass ? 'pass' : 'fail',
      score: rejected ? 0 : score,
      parts: { space: spaceFit, rooms: p.activityZoneFit, budget: headroom, evidence: p.confidence },
      checks,
      selected,
      dropped,
      cost,
      coreCost,
      usable,
      need,
    }
  })

  const order = { pass: 0, fail: 1, rejected: 2 }
  return results.sort((a, b) => order[a.status] - order[b.status] || b.score - a.score)
}

export function money(n: number) {
  return `$${n.toLocaleString('en-US')}`
}

export { k as thousands, sq as sqft }
