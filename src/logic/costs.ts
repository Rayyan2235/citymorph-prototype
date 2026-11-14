// Work list for one design. Quantities come from the concept plan (wall
// lengths, room counts, doors); unit costs come from COSTS in config. Every
// figure is a planning estimate (evidence A3), never a quote.

import { COSTS, FACILITIES, type DesignOpts, type FacilityId } from '../data/config'
import type { Candidate } from '../data/candidates'
import type { Layout } from './layout'

export interface Task {
  id: string
  name: string
  cost: number
  core: boolean
  ev: string
}

const round = (n: number) => Math.round(n / 500) * 500

export function workList(c: Candidate, facility: FacilityId, opts: DesignOpts, plan: Layout, conditional: boolean): Task[] {
  const f = FACILITIES[facility]
  const t: Task[] = []
  const add = (id: string, name: string, cost: number, core: boolean, ev: string) => cost > 0 && t.push({ id, name, cost: round(cost), core, ev })
  const primary = plan.zones.filter((z) => z.kind === 'primary')

  const targetGroup = f.occupancy[0]
  if (c.occupancy !== targetGroup) add('use', `Change of use, ${c.use.toLowerCase()} to ${f.label}: exits and fire review`, COSTS.changeOfUse, true, 'A4')
  if (conditional) add('cup', 'Conditional use permit for this zone', 15000, true, 'Z1')
  add('walls', `New partitions, about ${plan.newWallFt} ft`, plan.newWallFt * COSTS.newWallPerFt, true, `${c.id}:scan`)
  add('demo', `Remove old partitions, about ${plan.removedWallFt} ft`, plan.removedWallFt * COSTS.removeWallPerFt, true, `${c.id}:scan`)
  add('hvac', `Air and heat zones for ${primary.length} main room${primary.length === 1 ? '' : 's'}`, primary.length * COSTS.hvacPerPrimaryRoom, true, 'A3')

  const needRestrooms = plan.occupants > 50 ? 2 : 1
  if (!c.accessibleRestroom) add('wcA', 'Make one restroom accessible', COSTS.restroomUpgrade, true, `${c.id}:scan`)
  if (needRestrooms > c.restrooms) add('wcN', 'Add a second restroom', COSTS.newRestroom * (needRestrooms - c.restrooms), true, 'A7')

  if (plan.door?.lip) add('ramp', `Short ramp at the ${plan.door.name.toLowerCase()}`, COSTS.rampLip, true, plan.door.ev)
  const exit2 = plan.entrances.find((e) => e.isNew)
  if (exit2) add('exit', `Second exit door for ${plan.occupants} occupants`, COSTS.secondExit, true, 'A7')
  if (opts.accessFirst) add('wide', 'Wider corridor, lever handles and accessible signage', COSTS.wideHall, true, 'U5')

  if (facility === 'childcare') add('kids', `Child-height sinks and toilets in ${primary.length} classroom${primary.length === 1 ? '' : 's'}`, primary.length * COSTS.childFixturesPerRoom, true, 'A5')
  if (facility === 'clinic') add('sinks', `Hand sinks in ${primary.length} exam rooms`, primary.length * COSTS.examSink, true, 'A6')
  if (plan.outdoor?.lot) add('play', `Fence and safety surface for ${plan.outdoor.lot.sqft.toLocaleString('en-US')} sq ft of play yard`, plan.outdoor.lot.sqft * COSTS.outdoorPlayPerSqft, true, `${c.id}:aerial`)

  for (const k of c.condition) add(k.id, k.name, k.cost, k.core, `${c.id}:scan`)

  add('floor', 'New flooring throughout', plan.roomSqft * COSTS.flooringPerSqft, false, 'A3')
  add('acoustic', 'Acoustic panels between rooms', COSTS.acoustic, false, 'A3')
  add('sign', 'Wayfinding and signage', COSTS.signage, false, 'A3')
  return t
}

// Core work always stays; optional work is added cheapest-first while it fits.
export function fitBudget(tasks: Task[], budget: number) {
  const core = tasks.filter((x) => x.core)
  const coreCost = core.reduce((s, x) => s + x.cost, 0)
  const selected = [...core]
  let cost = coreCost
  for (const x of tasks.filter((y) => !y.core).sort((a, b) => a.cost - b.cost))
    if (cost + x.cost <= budget) {
      selected.push(x)
      cost += x.cost
    }
  return { selected, dropped: tasks.filter((x) => !selected.includes(x)), cost, coreCost }
}
