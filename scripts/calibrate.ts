// Print what the evaluator decides for each city and facility, so the demo
// story can be checked without a browser. Usage: npx tsx scripts/calibrate.ts
import { evaluate, type Request } from '../src/logic/evaluate'
import { FACILITIES, type CityId, type FacilityId } from '../src/data/config'

const base = { opts: { outdoorPlay: false, accessFirst: false }, variant: 'A' as const }
const cases: [CityId, FacilityId, number][] = [
  ['houston', 'learning', 150000],
  ['houston', 'learning', 90000],
  ['houston', 'childcare', 150000],
  ['houston', 'clinic', 150000],
  ['la', 'learning', 150000],
  ['la', 'learning', 90000],
  ['la', 'childcare', 150000],
  ['la', 'clinic', 150000],
]
for (const [city, facility, budget] of cases) {
  const req: Request = { city, facility, capacity: FACILITIES[facility].capacity.default, budget, ...base }
  console.log(`\n${city} ${facility} ${req.capacity} @ $${budget / 1000}k`)
  for (const r of evaluate(req)) {
    const p = r.property
    const fail = r.checks.filter((c) => !c.pass).map((c) => c.fail)
    console.log(
      `  ${r.status === 'pass' ? 'PASS' : 'fail'} ${p.name.padEnd(22)} fit ${String(r.score).padStart(3)} core $${Math.round(r.coreCost / 1000)}k total $${Math.round(r.cost / 1000)}k seats ${r.plan.achieved}/${req.capacity} sq ${p.footprintSqft} sq${Math.round(r.plan.squeeze * 100)} walls ${r.plan.newWallFt}ft max ${r.maxCapacity} ${fail.join(', ')}`,
    )
  }
}
