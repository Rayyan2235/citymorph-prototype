// Walk the baked OSM street graph for each site and store ranking metrics
// (nearest stop, rail, park, existing facility of each type) in the summary.
// Usage: node scripts/derive-geo.ts   (Node 24 runs TypeScript directly)

import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { floodMetrics, nearestHospital, siteMetrics, type SiteGeo } from '../src/logic/geo.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const file = join(root, 'src/data/geo/candidates.json')
const summary = JSON.parse(readFileSync(file, 'utf8'))
for (const id of Object.keys(summary)) {
  const g: SiteGeo = JSON.parse(readFileSync(join(root, 'public/geo', `${id}.json`), 'utf8'))
  summary[id].metrics = { ...siteMetrics(g), hospital: nearestHospital(g, summary[id].building.center), flood: floodMetrics(g, summary[id].building.center) }
  const m = summary[id].metrics
  console.log(id, 'to100', m.flood.to100, 'to500', m.flood.to500, 'out', JSON.stringify(m.flood.routeOut), 'hosp', m.hospital?.m)
}
writeFileSync(file, JSON.stringify(summary, null, 1))
