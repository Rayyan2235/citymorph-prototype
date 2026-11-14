// Add people 65+ and 80+ to each site's Census tract (ACS 5-year B01001, via
// Census Reporter). Sites fetched after this was added already have it.
// Usage: node scripts/fetch-seniors.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const file = join(root, 'src/data/geo/candidates.json')
const summary = JSON.parse(readFileSync(file, 'utf8'))
const UA = 'citymorph-prototype/0.3 (HackPrinceton 2026 student demo)'
const line = (e, n) => e[`B01001${String(n).padStart(3, '0')}`]

for (const [id, s] of Object.entries(summary)) {
  if (s.tract.over65 != null && s.tract.pop != null) continue
  const geo = `14000US${s.tract.geoid}`
  let j = null
  for (let i = 0; i < 5 && !j; i++) {
    const res = await fetch(`https://api.censusreporter.org/1.0/data/show/latest?table_ids=B01001&geo_ids=${geo}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(60000) }).catch(() => null)
    if (res?.ok) j = await res.json()
    else await new Promise((r) => setTimeout(r, 4000 * (i + 1)))
  }
  if (!j) {
    console.log(id, 'failed')
    continue
  }
  const e = j.data[geo].B01001.estimate
  s.tract.pop = e.B01001001
  s.tract.under5 = e.B01001003 + e.B01001027
  if (!s.tract.source || s.tract.source.includes('unavailable')) s.tract.source = `ACS 5-year table B01001 via Census Reporter; tract land area from the Census geocoder`
  s.tract.over65 = [20, 21, 22, 23, 24, 25, 44, 45, 46, 47, 48, 49].reduce((t, n) => t + line(e, n), 0)
  s.tract.over80 = [24, 25, 48, 49].reduce((t, n) => t + line(e, n), 0)
  console.log(id, s.tract.over65, s.tract.over80)
  writeFileSync(file, JSON.stringify(summary, null, 1))
}
