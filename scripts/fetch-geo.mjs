// Fetch real geography for each candidate site and bake it into the repo.
//
// Sources (all public, no keys):
// - OpenStreetMap via the Overpass API (ODbL): building footprint, walkable
//   street graph, transit stops, parks, and existing facilities by type.
// - US Census geocoder + ACS 5-year API: tract population and children under 5.
//
// Output:
// - src/data/geo/candidates.json  small summary per site, bundled with the app
// - public/geo/<id>.json          street graph + POIs per site, fetched on demand
//
// Usage: node scripts/fetch-geo.mjs [siteId ...]
// Property attributes (vacancy, interiors, costs) are NOT fetched: they stay
// simulated and labelled in src/data.

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const UA = 'citymorph-prototype/0.2 (hackathon demo; OSM data use)'
const OVERPASS = 'https://overpass-api.de/api/interpreter'
const GRAPH_R = 1300 // metres of street network kept around each site
const FAC_R = 2600 // metres searched for existing facilities

// Seeds: a point on a commercial corridor in each neighborhood. The script
// snaps each seed to the nearest mid-size commercial building in OSM.
const SITES = [
  { id: 'hou-bellaire', city: 'houston', area: 'Gulfton', street: 'Bellaire Blvd', at: [-95.4838, 29.7058] },
  { id: 'hou-fulton', city: 'houston', area: 'Near Northside', street: 'Fulton St', at: [-95.3601, 29.7907] },
  { id: 'hou-navigation', city: 'houston', area: 'East End', street: 'Navigation Blvd', at: [-95.3334, 29.7541] },
  { id: 'hou-sharpstown', city: 'houston', area: 'Sharpstown', street: 'Bellaire Blvd', at: [-95.5188, 29.7055] },
  { id: 'hou-sunnyside', city: 'houston', area: 'Sunnyside', street: 'Cullen Blvd', at: [-95.3567, 29.6615] },
  { id: 'la-boyle', city: 'la', area: 'Boyle Heights', street: 'E Cesar E Chavez Ave', at: [-118.2087, 34.0447] },
  { id: 'la-vermont', city: 'la', area: 'South LA', street: 'S Vermont Ave', at: [-118.2915, 33.96] },
  { id: 'la-westlake', city: 'la', area: 'Westlake', street: 'S Alvarado St', at: [-118.2789, 34.057] },
  { id: 'la-pacoima', city: 'la', area: 'Pacoima', street: 'Van Nuys Blvd', at: [-118.4247, 34.2577] },
  { id: 'la-highland', city: 'la', area: 'Highland Park', street: 'N Figueroa St', at: [-118.1908, 34.1102] },
]

const FACILITY_QUERY = {
  learning: '["amenity"~"^(library|community_centre|college|language_school|training)$"]',
  childcare: '["amenity"~"^(childcare|kindergarten)$"]',
  clinic: '["amenity"~"^(clinic|doctors|hospital)$"]',
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Public Overpass instances; rotate when one is overloaded.
// private.coffee and kumi.systems were timing out on 2026-11-14; add them back if they recover.
const MIRRORS = ['https://maps.mail.ru/osm/tools/overpass/api/interpreter', OVERPASS]
let mirror = 0

async function overpass(q, tries = 8) {
  for (let i = 0; i < tries; i++) {
    const url = MIRRORS[mirror % MIRRORS.length]
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(`[out:json][timeout:90];${q}`),
        signal: AbortSignal.timeout(180000),
      })
      if (res.ok) {
        const j = await res.json()
        if (!j.remark?.includes('runtime error')) return j.elements
      }
      console.warn(`  ${new URL(url).host} ${res.status}`)
    } catch (e) {
      console.warn(`  ${new URL(url).host} ${e.name}`)
    }
    mirror++
    await sleep(3000)
  }
  throw new Error('overpass failed')
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

// Metres between two lon/lat points, and polygon area in m², both on a local
// equirectangular projection (fine at neighborhood scale).
const R = 6371008.8
function metres([lo1, la1], [lo2, la2]) {
  const x = ((lo2 - lo1) * Math.PI) / 180 * Math.cos((((la1 + la2) / 2) * Math.PI) / 180)
  const y = ((la2 - la1) * Math.PI) / 180
  return Math.hypot(x, y) * R
}
function areaM2(ring) {
  const lat0 = (ring[0][1] * Math.PI) / 180
  let a = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = [((ring[i][0] * Math.PI) / 180) * Math.cos(lat0) * R, ((ring[i][1] * Math.PI) / 180) * R]
    const [x2, y2] = [((ring[i + 1][0] * Math.PI) / 180) * Math.cos(lat0) * R, ((ring[i + 1][1] * Math.PI) / 180) * R]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a) / 2
}
const centroid = (ring) => [ring.reduce((s, c) => s + c[0], 0) / ring.length, ring.reduce((s, c) => s + c[1], 0) / ring.length]
const r6 = (n) => Math.round(n * 1e6) / 1e6

async function pickBuilding(site) {
  const [lon, lat] = site.at
  const els = await overpass(`way(around:260,${lat},${lon})["building"~"^(retail|commercial|office|yes|civic|industrial|warehouse|church|public)$"];out body geom;`)
  const prefer = { retail: 3, commercial: 3, office: 3, civic: 2, public: 2, yes: 1, industrial: 0, warehouse: 0, church: 0 }
  const cands = els
    .filter((e) => e.geometry?.length > 3)
    .map((e) => {
      const ring = e.geometry.map((g) => [r6(g.lon), r6(g.lat)])
      const a = areaM2(ring)
      const c = centroid(ring)
      return { e, ring, a, c, d: metres(site.at, c) }
    })
    // 300 to 1,100 m² is roughly 3,200 to 11,800 sq ft: a corner-store-to-small-office range
    .filter((x) => x.a >= 300 && x.a <= 1100)
  if (!cands.length) throw new Error(`no building near ${site.id}`)
  // Avoid named or amenity-tagged buildings: vacancy and interiors are simulated,
  // and pinning a fake "for lease" status on a real named business would mislead.
  const named = (t) => Boolean(t.name || t.amenity || t.brand || t.office || t.shop)
  const score = (x) => (prefer[x.e.tags.building] ?? 0) * 60 - (named(x.e.tags) ? 400 : 0) - x.d * 0.6
  cands.sort((a, b) => score(b) - score(a))
  const b = cands[0]
  const t = b.e.tags
  return {
    osmId: b.e.id,
    tags: Object.fromEntries(Object.entries(t).filter(([k]) => /^(building|building:levels|name|shop|amenity|office|addr:housenumber|addr:street|height)$/.test(k))),
    ring: b.ring,
    areaM2: Math.round(b.a),
    center: [r6(b.c[0]), r6(b.c[1])],
    distFromSeedM: Math.round(b.d),
  }
}

async function graphAndPois(center) {
  const [lon, lat] = center
  // One request per site: walkable ways, stops, parks and facilities together.
  const A = `(around:${GRAPH_R},${lat},${lon})`
  const F = `(around:${FAC_R},${lat},${lon})`
  const els = await overpass(
    `way${A}["highway"~"^(footway|pedestrian|path|living_street|residential|unclassified|tertiary|tertiary_link|secondary|secondary_link|primary|primary_link|service|steps|cycleway|track)$"]["access"!~"^(private|no)$"]["service"!~"^(parking_aisle|drive-through)$"];out body geom;` +
      `(node${A}["highway"="bus_stop"];node${A}["public_transport"="platform"];node${A}["railway"~"^(station|halt|tram_stop)$"];node${A}["public_transport"="station"];);out body;` +
      `way${A}["leisure"~"^(park|playground)$"];out body geom;` +
      Object.values(FACILITY_QUERY).map((q) => `nwr${F}${q};out center tags;`).join(''),
  )
  const ways = els.filter((e) => e.type === 'way' && e.tags?.highway)
  const stopEls = els.filter((e) => e.type === 'node' && (e.tags?.highway === 'bus_stop' || e.tags?.railway || e.tags?.public_transport === 'station' || e.tags?.public_transport === 'platform'))
  const parkEls = els.filter((e) => e.type === 'way' && /^(park|playground)$/.test(e.tags?.leisure ?? ''))
  const AMENITY = { learning: /^(library|community_centre|college|language_school|training)$/, childcare: /^(childcare|kindergarten)$/, clinic: /^(clinic|doctors|hospital)$/ }
  const facilities = {}
  for (const [type, re] of Object.entries(AMENITY)) {
    facilities[type] = els
      .filter((e) => re.test(e.tags?.amenity ?? '') && (e.lon ?? e.center?.lon))
      .map((e) => ({ name: e.tags?.name ?? null, kind: e.tags.amenity, lon: r6(e.lon ?? e.center.lon), lat: r6(e.lat ?? e.center.lat) }))
  }

  // Graph: OSM node ids -> compact indices; edges carry length in metres.
  const idx = new Map()
  const nodes = []
  const edges = []
  for (const w of ways) {
    if (!w.nodes || !w.geometry || w.nodes.length !== w.geometry.length) continue
    for (let i = 0; i < w.nodes.length; i++) {
      if (!idx.has(w.nodes[i])) {
        idx.set(w.nodes[i], nodes.length)
        nodes.push([r6(w.geometry[i].lon), r6(w.geometry[i].lat)])
      }
    }
    const major = /^(primary|secondary|tertiary)/.test(w.tags.highway) ? 1 : 0
    for (let i = 0; i < w.nodes.length - 1; i++) {
      const a = idx.get(w.nodes[i])
      const b = idx.get(w.nodes[i + 1])
      edges.push([a, b, Math.round(metres(nodes[a], nodes[b]) * 10) / 10, major])
    }
  }

  const stops = stopEls.map((e) => ({
    name: e.tags?.name ?? null,
    kind: e.tags?.railway || (e.tags?.public_transport === 'station' || e.tags?.train === 'yes' || e.tags?.subway === 'yes' || e.tags?.light_rail === 'yes' ? 'station' : 'bus'),
    lon: r6(e.lon),
    lat: r6(e.lat),
  }))
  const parks = parkEls
    .filter((e) => e.geometry?.length > 3)
    .map((e) => {
      const ring = e.geometry.map((g) => [r6(g.lon), r6(g.lat)])
      const c = centroid(ring)
      return { name: e.tags?.name ?? null, kind: e.tags.leisure, lon: r6(c[0]), lat: r6(c[1]), areaM2: Math.round(areaM2(ring)), ring }
    })
    .filter((p) => p.areaM2 > 150)
  return { nodes, edges, stops, parks, facilities }
}

async function census([lon, lat]) {
  const g = await getJson(
    `https://geocoding.geo.census.gov/geocoder/geographies/coordinates?x=${lon}&y=${lat}&benchmark=Public_AR_Current&vintage=Current_Current&layers=Census%20Tracts&format=json`,
  )
  const t = g.result.geographies['Census Tracts'][0]
  // api.census.gov now needs a key, so read the same ACS table through Census Reporter.
  const geo = `14000US${t.GEOID}`
  const cr = await getJson(`https://api.censusreporter.org/1.0/data/show/latest?table_ids=B01001&geo_ids=${geo}`)
  const e = cr.data[geo].B01001.estimate
  return {
    geoid: t.GEOID,
    name: t.NAME,
    landM2: Number(t.AREALAND),
    pop: e.B01001001,
    under5: e.B01001003 + e.B01001027,
    source: `${cr.release.name} table B01001 via Census Reporter; tract land area from the Census geocoder`,
  }
}

const outSummary = join(root, 'src/data/geo/candidates.json')
const outDir = join(root, 'public/geo')
mkdirSync(dirname(outSummary), { recursive: true })
mkdirSync(outDir, { recursive: true })
const summary = existsSync(outSummary) ? JSON.parse(readFileSync(outSummary, 'utf8')) : {}
const only = process.argv.slice(2)

for (const site of SITES) {
  if (only.length && !only.includes(site.id)) continue
  // Resume: skip sites already fetched unless named on the command line.
  if (!only.length && summary[site.id] && existsSync(join(outDir, `${site.id}.json`))) continue
  console.log(`${site.id}: building`)
  const b = await pickBuilding(site)
  await sleep(1500)
  console.log(`  ${b.tags.name ?? b.tags.building} ${b.areaM2} m², ${b.distFromSeedM} m from seed; graph`)
  const geo = await graphAndPois(b.center)
  console.log(`  ${geo.nodes.length} nodes, ${geo.edges.length} edges, ${geo.stops.length} stops, ${geo.parks.length} parks`)
  const tract = await census(b.center)
  console.log(`  tract ${tract.geoid}: pop ${tract.pop}, under 5 ${tract.under5}`)
  summary[site.id] = { ...site, building: b, tract, fetched: new Date().toISOString().slice(0, 10) }
  writeFileSync(join(outDir, `${site.id}.json`), JSON.stringify({ center: b.center, ...geo }))
  writeFileSync(outSummary, JSON.stringify(summary, null, 1))
  await sleep(2000)
}
console.log('done')
