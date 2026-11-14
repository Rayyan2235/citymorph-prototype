// Neighborhood impact on the real OSM walking network. Estimates, not
// outcomes: every output names the assumption it rests on (I1 to I4).

import { FACILITIES, IMPACT, PLANNING, type FacilityId } from '../data/config'
import { buildGraph, dijkstra, hullArea, hullRing, nearestNode, pathTo, type LngLat, type SiteGeo } from './geo'
import type { Result } from './evaluate'

export interface Impact {
  streets: GeoJSON.FeatureCollection<GeoJSON.LineString, { b: number; a: number; s: number; imp: number }>
  catchment: LngLat[]
  routes: { name: string; kind: string; m: number; path: LngLat[] }[]
  stops: { name: string | null; kind: string; at: LngLat; m: number }[]
  existing: { name: string | null; at: LngLat }[]
  catchmentKm2: number
  people: number
  children: number
  served: number // what the tract count the facility serves (people or under 5)
  capacity: number
  coverBefore: number // share of street nodes within a 10 minute walk of a facility
  coverAfter: number
  improvedShare: number
  minutesSaved: number // average, among street nodes that got closer
  reuseCost: number
  newCost: number
  reuseMonths: number
  newMonths: number
  maxS: number // farthest street distance from the site, for the reveal
}

const INF = 1e9

export function simulate(geo: SiteGeo, r: Result, facility: FacilityId): Impact {
  const f = FACILITIES[facility]
  const g = buildGraph(geo)
  const site = nearestNode(g, r.property.lngLat)
  const fromSite = dijkstra(g, [{ node: site.node, start: site.gap }])
  const sources = (geo.facilities[facility] ?? []).map((x) => {
    const n = nearestNode(g, [x.lon, x.lat])
    return { node: n.node, start: n.gap }
  })
  const before = sources.length ? dijkstra(g, sources).dist : new Float64Array(g.nodes.length).fill(INF)

  const walk = PLANNING.walkMinutes * PLANNING.walkSpeedMpm
  const reach: LngLat[] = []
  let n = 0
  let inBefore = 0
  let inAfter = 0
  let improved = 0
  let saved = 0
  for (let i = 0; i < g.nodes.length; i++) {
    if (!g.adj[i].length) continue
    n++
    const b = before[i]
    const s = fromSite.dist[i]
    const a = Math.min(b, s)
    if (s <= walk) reach.push(g.nodes[i])
    if (b <= walk) inBefore++
    if (a <= walk) inAfter++
    if (a < b - 40) {
      improved++
      saved += (Math.min(b, 2600) - a) / PLANNING.walkSpeedMpm
    }
  }

  let maxS = 0
  const features = geo.edges.map(([u, v]) => {
    const b = Math.min(before[u], before[v])
    const s = Math.min(fromSite.dist[u], fromSite.dist[v])
    const a = Math.min(b, s)
    if (Number.isFinite(s)) maxS = Math.max(maxS, s)
    return {
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: [geo.nodes[u], geo.nodes[v]] },
      properties: { b: Math.min(b, INF), a: Math.min(a, INF), s: Number.isFinite(s) ? s : INF, imp: a < b - 40 ? 1 : 0 },
    }
  })

  const stops = geo.stops
    .map((s) => {
      const nn = nearestNode(g, [s.lon, s.lat])
      return { name: s.name, kind: s.kind, at: [s.lon, s.lat] as LngLat, m: fromSite.dist[nn.node] + nn.gap, node: nn.node }
    })
    .filter((s) => Number.isFinite(s.m))
    .sort((a, b) => a.m - b.m)
  // Up to three distinct stops (bus stops come in pairs across a street).
  const picked: typeof stops = []
  for (const s of stops) {
    if (picked.length === 3 || s.m > 1300) break
    if (picked.some((p) => (p.name && p.name === s.name) || Math.abs(p.m - s.m) < 60)) continue
    picked.push(s)
  }
  const routes = picked.map((s) => ({ name: s.name ?? (s.kind === 'bus' ? 'Bus stop' : 'Station'), kind: s.kind, m: Math.round(s.m), path: [s.at, ...pathTo(fromSite.prev, g.nodes, s.node), r.property.lngLat] }))

  const km2 = hullArea(reach) / 1e6
  const t = r.property.tract
  const people = Math.round(((t.pop ?? 0) / t.landM2) * km2 * 1e6)
  const children = Math.round(((t.under5 ?? 0) / t.landM2) * km2 * 1e6)
  const newCost = Math.round(f.newBuildPerSqft * r.plan.needSqft)
  const reuseMonths = Math.round(IMPACT.reuseMonthsBase + (IMPACT.reuseMonthsPer100k * r.cost) / 100000 + (r.conditional ? 4 : 0))

  return {
    streets: { type: 'FeatureCollection', features },
    catchment: hullRing(reach),
    routes,
    stops: stops.slice(0, 12).map(({ name, kind, at, m }) => ({ name, kind, at, m: Math.round(m) })),
    existing: (geo.facilities[facility] ?? []).map((x) => ({ name: x.name, at: [x.lon, x.lat] as LngLat })),
    catchmentKm2: Math.round(km2 * 100) / 100,
    people,
    children,
    served: f.servesTract === 'under5' ? children : people,
    capacity: r.plan.achieved,
    coverBefore: n ? inBefore / n : 0,
    coverAfter: n ? inAfter / n : 0,
    improvedShare: n ? improved / n : 0,
    minutesSaved: improved ? Math.round((saved / improved) * 10) / 10 : 0,
    reuseCost: r.cost,
    newCost,
    reuseMonths,
    newMonths: IMPACT.newBuildMonths,
    maxS: Math.min(maxS, 1400),
  }
}

const cache = new Map<string, Promise<SiteGeo>>()
export function loadGeo(id: string) {
  if (!cache.has(id)) cache.set(id, fetch(`${import.meta.env.BASE_URL}geo/${id}.json`).then((r) => r.json()))
  return cache.get(id)!
}
