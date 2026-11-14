// Night evacuation time for an old age home, from the concept plan.
//
// Most residents cannot walk out alone (C1), so staff move them one at a time:
// wake and transfer to a wheelchair, push to the nearest step free exit, come
// back for the next. Residents who can walk are guided out at the same time.
// Time = alarm delay + max(assisted work / staff on shift, slowest walker).
// Every rate is a labelled assumption (C2, C3); the operator can change staff.

import { CARE } from '../data/config'
import type { Layout, PlanZone } from './layout'

export interface Evac {
  minutes: number
  staff: number
  residents: number
  assisted: number
  exits: number
  avgFt: number // average bedroom-to-exit distance
  farFt: number
  perResidentMin: number
}

function centre(z: PlanZone) {
  return { x: z.to.x + z.to.w / 2, y: z.to.y + z.to.h / 2 }
}

export function evacuate(plan: Layout, residents: number, staff: number): Evac {
  const exits = plan.entrances.filter((e) => e.stepFree)
  const hy = plan.hall.y + plan.hall.h / 2
  const beds = plan.zones.filter((z) => z.kind === 'primary' && z.seats > 0)
  // Corridor distance: out of the room to the hall, along the hall, then to the door.
  const toExit = (z: PlanZone) => {
    const c = centre(z)
    const d = exits.map((e) => Math.abs(c.y - hy) + Math.abs(c.x - e.at.x) + Math.abs(hy - e.at.y))
    return (d.length ? Math.min(...d) : Infinity) * plan.scale
  }
  const people = beds.flatMap((z) => Array.from({ length: z.seats }, () => toExit(z)))
  const n = Math.min(residents, people.length) || residents
  const dists = people.length ? people.slice(0, n) : [Infinity]
  const avgFt = dists.reduce((a, b) => a + b, 0) / dists.length
  const farFt = Math.max(...dists)
  const assisted = Math.round(n * CARE.helpShare)
  const perResidentMin = CARE.transferMin + (2 * avgFt) / CARE.pushFtPerMin
  const assistedWork = assisted * perResidentMin
  const walkers = farFt / CARE.walkFtPerMin
  const s = Math.max(1, staff)
  const minutes = exits.length ? CARE.alarmMin + Math.max(assistedWork / s, walkers) : Infinity
  return { minutes: Math.round(minutes), staff: s, residents: n, assisted, exits: exits.length, avgFt: Math.round(avgFt), farFt: Math.round(farFt), perResidentMin: Math.round(perResidentMin * 10) / 10 }
}

export const defaultNightStaff = (residents: number) => Math.max(1, Math.ceil(residents / CARE.residentsPerNightStaff))
