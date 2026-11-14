// Bake FEMA National Flood Hazard Layer zones around each site (public ArcGIS
// service, no key). Adds to public/geo/<id>.json:
//   flood: { z100: ring[][], z500: ring[][] }   (100-year = SFHA, 500-year = 0.2% chance)
// and to src/data/geo/candidates.json the zone at the building itself.
// Usage: node scripts/fetch-flood.mjs [siteId ...]

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const NFHL = 'https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer/28/query'
const R_DEG = 0.013 // about 1.3 km box, matching the street graph
const summaryFile = join(root, 'src/data/geo/candidates.json')
const summary = JSON.parse(readFileSync(summaryFile, 'utf8'))
const only = process.argv.slice(2)
const r6 = (n) => Math.round(n * 1e6) / 1e6

async function q(params) {
  const url = `${NFHL}?${new URLSearchParams({ f: 'json', inSR: '4326', outSR: '4326', ...params })}`
  for (let i = 0; i < 4; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(90000), headers: { 'User-Agent': 'citymorph-prototype/0.3 (hackathon demo)' } })
      const j = await res.json()
      if (j.features) return j.features
      console.warn('  nfhl error', JSON.stringify(j.error ?? j).slice(0, 200))
    } catch (e) {
      console.warn('  nfhl', e.name)
    }
    await new Promise((r) => setTimeout(r, 4000))
  }
  throw new Error('nfhl failed')
}

for (const [id, s] of Object.entries(summary)) {
  if (only.length && !only.includes(id)) continue
  const [lon, lat] = s.building.center
  const at = await q({ geometry: `${lon},${lat}`, geometryType: 'esriGeometryPoint', spatialRel: 'esriSpatialRelIntersects', outFields: 'FLD_ZONE,ZONE_SUBTY,SFHA_TF', returnGeometry: 'false' })
  const a = at[0]?.attributes
  const zone = a ? (a.SFHA_TF === 'T' ? '100' : /0\.2 PCT/.test(a.ZONE_SUBTY ?? '') ? '500' : 'minimal') : 'unmapped'
  const env = `${lon - R_DEG},${lat - R_DEG},${lon + R_DEG},${lat + R_DEG}`
  const polys = await q({
    geometry: env,
    geometryType: 'esriGeometryEnvelope',
    spatialRel: 'esriSpatialRelIntersects',
    where: "SFHA_TF = 'T' OR ZONE_SUBTY LIKE '0.2 PCT%'",
    outFields: 'FLD_ZONE,ZONE_SUBTY,SFHA_TF',
    returnGeometry: 'true',
    maxAllowableOffset: '0.00004',
    geometryPrecision: '6',
  })
  const flood = { z100: [], z500: [] }
  for (const f of polys) {
    const key = f.attributes.SFHA_TF === 'T' ? 'z100' : 'z500'
    for (const ring of f.geometry?.rings ?? []) if (ring.length > 3) flood[key].push(ring.map(([x, y]) => [r6(x), r6(y)]))
  }
  const file = join(root, 'public/geo', `${id}.json`)
  const g = JSON.parse(readFileSync(file, 'utf8'))
  g.flood = flood
  writeFileSync(file, JSON.stringify(g))
  summary[id].flood = { zone, fldZone: a?.FLD_ZONE ?? null, subtype: a?.ZONE_SUBTY ?? null, source: 'FEMA National Flood Hazard Layer', fetched: new Date().toISOString().slice(0, 10) }
  writeFileSync(summaryFile, JSON.stringify(summary, null, 1))
  console.log(id, zone, a?.FLD_ZONE, 'rings 100:', flood.z100.length, '500:', flood.z500.length)
}
