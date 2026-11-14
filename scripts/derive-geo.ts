// Walk the baked OSM street graph for each site and store ranking metrics
// (nearest stop, rail, park, existing facility of each type) in the summary.
// Usage: node scripts/derive-geo.ts   (Node 24 runs TypeScript directly)

import { readFileSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { siteMetrics, type SiteGeo } from '../src/logic/geo.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const file = join(root, 'src/data/geo/candidates.json')
const summary = JSON.parse(readFileSync(file, 'utf8'))
for (const id of Object.keys(summary)) {
  const g: SiteGeo = JSON.parse(readFileSync(join(root, 'public/geo', `${id}.json`), 'utf8'))
  summary[id].metrics = siteMetrics(g)
  const m = summary[id].metrics
  console.log(id, 'stop', m.stop?.m, 'rail', m.rail?.m, 'park', m.park?.m, m.park?.name, 'in10', m.stopsIn10)
}
writeFileSync(file, JSON.stringify(summary, null, 1))
