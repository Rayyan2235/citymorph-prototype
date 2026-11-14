// Geometry and walking-network maths on real OSM data. No imports, so the
// Node derive script can run this file directly (type stripping).

export type LngLat = [number, number]

export interface SiteGeo {
  center: LngLat
  nodes: LngLat[]
  edges: [number, number, number, number][] // a, b, metres, major road
  stops: { name: string | null; kind: string; lon: number; lat: number }[]
  parks: { name: string | null; kind: string; lon: number; lat: number; areaM2: number; ring: LngLat[] }[]
  facilities: Record<string, { name: string | null; kind: string; lon: number; lat: number }[]>
  flood?: { z100: LngLat[][]; z500: LngLat[][] } // FEMA NFHL rings
}

const R = 6371008.8
const rad = (d: number) => (d * Math.PI) / 180

export function metres(a: LngLat, b: LngLat) {
  const x = rad(b[0] - a[0]) * Math.cos(rad((a[1] + b[1]) / 2))
  const y = rad(b[1] - a[1])
  return Math.hypot(x, y) * R
}

// Local planar metres around an origin, for shape maths at building scale.
export function toLocal(origin: LngLat, p: LngLat): [number, number] {
  return [rad(p[0] - origin[0]) * Math.cos(rad(origin[1])) * R, rad(p[1] - origin[1]) * R]
}

export function ringArea(ring: LngLat[]) {
  const o = ring[0]
  let a = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = toLocal(o, ring[i])
    const [x2, y2] = toLocal(o, ring[i + 1])
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a) / 2
}

function hull(pts: [number, number][]) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lo: [number, number][] = []
  for (const q of p) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop()
    lo.push(q)
  }
  const up: [number, number][] = []
  for (const q of [...p].reverse()) {
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop()
    up.push(q)
  }
  return lo.slice(0, -1).concat(up.slice(0, -1))
}

// Minimum-area bounding rectangle of a footprint: its long and short sides in
// metres and the long side's bearing. Used to give the plan real proportions.
export function footprintBox(ring: LngLat[]) {
  const o = ring[0]
  const h = hull(ring.map((p) => toLocal(o, p)))
  let best = { area: Infinity, long: 0, short: 0, angle: 0 }
  for (let i = 0; i < h.length; i++) {
    const [x1, y1] = h[i]
    const [x2, y2] = h[(i + 1) % h.length]
    const ang = Math.atan2(y2 - y1, x2 - x1)
    const c = Math.cos(-ang)
    const s = Math.sin(-ang)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const [x, y] of h) {
      const rx = x * c - y * s
      const ry = x * s + y * c
      minX = Math.min(minX, rx); maxX = Math.max(maxX, rx)
      minY = Math.min(minY, ry); maxY = Math.max(maxY, ry)
    }
    const w = maxX - minX
    const d = maxY - minY
    if (w * d < best.area) best = { area: w * d, long: Math.max(w, d), short: Math.min(w, d), angle: ang }
  }
  return best
}

export function hullArea(points: LngLat[]) {
  if (points.length < 3) return 0
  const o = points[0]
  const h = hull(points.map((p) => toLocal(o, p)))
  let a = 0
  for (let i = 0; i < h.length; i++) {
    const [x1, y1] = h[i]
    const [x2, y2] = h[(i + 1) % h.length]
    a += x1 * y2 - x2 * y1
  }
  return Math.abs(a) / 2
}

export function hullRing(points: LngLat[]): LngLat[] {
  if (points.length < 3) return []
  const o = points[0]
  const cosO = Math.cos(rad(o[1]))
  const h = hull(points.map((p) => toLocal(o, p)))
  const back = ([x, y]: [number, number]): LngLat => [o[0] + (x / (R * cosO)) * (180 / Math.PI), o[1] + (y / R) * (180 / Math.PI)]
  const ring = h.map(back)
  return [...ring, ring[0]]
}

export interface Graph {
  nodes: LngLat[]
  adj: { to: number; m: number; e: number }[][]
}

export function buildGraph(g: SiteGeo): Graph {
  const adj: Graph['adj'] = g.nodes.map(() => [])
  g.edges.forEach(([a, b, m], e) => {
    adj[a].push({ to: b, m, e })
    adj[b].push({ to: a, m, e })
  })
  return { nodes: g.nodes, adj }
}

// Nearest graph node by straight line, plus the off-network gap in metres.
export function nearestNode(graph: Graph, p: LngLat) {
  let best = -1
  let bd = Infinity
  for (let i = 0; i < graph.nodes.length; i++) {
    if (!graph.adj[i].length) continue
    const d = metres(p, graph.nodes[i])
    if (d < bd) {
      bd = d
      best = i
    }
  }
  return { node: best, gap: bd }
}

// Multi-source Dijkstra over the walking network. Each source starts at its
// off-network gap. Returns metres to the nearest source and the previous node.
export function dijkstra(graph: Graph, sources: { node: number; start: number }[]) {
  const n = graph.nodes.length
  const dist = new Float64Array(n).fill(Infinity)
  const prev = new Int32Array(n).fill(-1)
  const heap: [number, number][] = []
  const push = (d: number, v: number) => {
    heap.push([d, v])
    let i = heap.length - 1
    while (i > 0) {
      const p = (i - 1) >> 1
      if (heap[p][0] <= heap[i][0]) break
      ;[heap[p], heap[i]] = [heap[i], heap[p]]
      i = p
    }
  }
  const pop = () => {
    const top = heap[0]
    const last = heap.pop()!
    if (heap.length) {
      heap[0] = last
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = l + 1
        let m = i
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r
        if (m === i) break
        ;[heap[m], heap[i]] = [heap[i], heap[m]]
        i = m
      }
    }
    return top
  }
  for (const s of sources) {
    if (s.node < 0) continue
    if (s.start < dist[s.node]) {
      dist[s.node] = s.start
      push(s.start, s.node)
    }
  }
  while (heap.length) {
    const [d, v] = pop()
    if (d > dist[v]) continue
    for (const { to, m } of graph.adj[v]) {
      const nd = d + m
      if (nd < dist[to]) {
        dist[to] = nd
        prev[to] = v
        push(nd, to)
      }
    }
  }
  return { dist, prev }
}

export function pathTo(prev: Int32Array, nodes: LngLat[], target: number): LngLat[] {
  const out: LngLat[] = []
  for (let v = target; v >= 0; v = prev[v]) out.push(nodes[v])
  return out
}

// Walking access to the nearest stop, park and existing facility of each type,
// measured on the street network from the site. Used for ranking.
export function siteMetrics(g: SiteGeo) {
  const graph = buildGraph(g)
  const site = nearestNode(graph, g.center)
  const { dist } = dijkstra(graph, [{ node: site.node, start: site.gap }])
  const walk = (p: LngLat) => {
    const n = nearestNode(graph, p)
    return n.node < 0 ? Infinity : dist[n.node] + n.gap
  }
  const stops = g.stops.map((s) => ({ ...s, m: walk([s.lon, s.lat]) })).sort((a, b) => a.m - b.m)
  const parks = g.parks.map((p) => ({ name: p.name, kind: p.kind, areaM2: p.areaM2, m: walk([p.lon, p.lat]) })).sort((a, b) => a.m - b.m)
  const facilities = Object.fromEntries(
    Object.entries(g.facilities).map(([k, list]) => [k, list.map((f) => ({ name: f.name, m: walk([f.lon, f.lat]) })).sort((a, b) => a.m - b.m)[0] ?? null]),
  )
  const rail = stops.find((s) => s.kind !== 'bus')
  return {
    stop: stops[0] ? { name: stops[0].name, kind: stops[0].kind, m: Math.round(stops[0].m), at: [stops[0].lon, stops[0].lat] as LngLat } : null,
    rail: rail ? { name: rail.name, kind: rail.kind, m: Math.round(rail.m), at: [rail.lon, rail.lat] as LngLat } : null,
    stopsIn10: stops.filter((s) => s.m <= 800).length,
    park: parks[0] ? { name: parks[0].name, kind: parks[0].kind, areaM2: parks[0].areaM2, m: Math.round(parks[0].m) } : null,
    nearestExisting: Object.fromEntries(Object.entries(facilities).map(([k, f]) => [k, f && Number.isFinite(f.m) ? { name: f.name, m: Math.round(f.m) } : null])),
  }
}

// ---------- flood scenarios (FEMA NFHL rings on the OSM street graph) ----------

export type FloodScenario = 'z100' | 'z500'

interface Ring {
  pts: LngLat[]
  box: [number, number, number, number]
}

export function rings(g: SiteGeo, scenario: FloodScenario): Ring[] {
  const list = scenario === 'z100' ? (g.flood?.z100 ?? []) : [...(g.flood?.z100 ?? []), ...(g.flood?.z500 ?? [])]
  return list.map((pts) => {
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    return { pts, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }
  })
}

// Even-odd point in polygon. FEMA holes come as separate rings, so a point
// inside an odd number of rings is in the zone.
export function inFlood(rs: Ring[], p: LngLat) {
  let inside = false
  for (const r of rs) {
    if (p[0] < r.box[0] || p[0] > r.box[2] || p[1] < r.box[1] || p[1] > r.box[3]) continue
    const pts = r.pts
    let hit = false
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i]
      const [xj, yj] = pts[j]
      if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit
    }
    if (hit) inside = !inside
  }
  return inside
}

// Metres from a point to the nearest zone edge (0 when inside).
export function distToFlood(rs: Ring[], p: LngLat) {
  if (!rs.length) return null
  if (inFlood(rs, p)) return 0
  const o = p
  let best = Infinity
  for (const r of rs) {
    const pts = r.pts
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = toLocal(o, pts[i])
      const [bx, by] = toLocal(o, pts[i + 1])
      const dx = bx - ax
      const dy = by - ay
      const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)))
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy))
    }
  }
  return Math.round(best)
}

export const EXIT_R = 1100 // metres: reaching this far from the site by road counts as leaving the area

// Shortest road out of the area with flooded street segments removed. Returns
// metres, the path and which edges were cut; null metres when cut off.
export function routeOut(g: SiteGeo, site: LngLat, scenario: FloodScenario | null) {
  const rs = scenario ? rings(g, scenario) : []
  const wet = g.nodes.map((n) => (rs.length ? inFlood(rs, n) : false))
  const cut = g.edges.map(([a, b]) => wet[a] || wet[b])
  const adj: Graph['adj'] = g.nodes.map(() => [])
  g.edges.forEach(([a, b, m], e) => {
    if (cut[e]) return
    adj[a].push({ to: b, m, e })
    adj[b].push({ to: a, m, e })
  })
  const graph: Graph = { nodes: g.nodes, adj }
  const doorWet = rs.length ? inFlood(rs, site) : false
  const start = nearestNode(graph, site)
  if (doorWet || start.node < 0) return { m: null, path: [] as LngLat[], cut, doorWet }
  const { dist, prev } = dijkstra(graph, [{ node: start.node, start: start.gap }])
  let best = -1
  for (let i = 0; i < g.nodes.length; i++) if (Number.isFinite(dist[i]) && metres(site, g.nodes[i]) >= EXIT_R && (best < 0 || dist[i] < dist[best])) best = i
  if (best < 0) return { m: null, path: [], cut, doorWet }
  return { m: Math.round(dist[best]), path: [site, ...pathTo(prev, g.nodes, best).reverse()], cut, doorWet }
}

export function floodMetrics(g: SiteGeo, site: LngLat) {
  return {
    to100: distToFlood(rings(g, 'z100'), site),
    to500: distToFlood(rings(g, 'z500'), site),
    routeOut: { normal: routeOut(g, site, null).m, z100: routeOut(g, site, 'z100').m, z500: routeOut(g, site, 'z500').m },
  }
}

export function nearestHospital(g: SiteGeo, site: LngLat) {
  const list = (g.facilities.clinic ?? []).filter((f) => f.kind === 'hospital')
  if (!list.length) return null
  const best = list.map((h) => ({ name: h.name, m: Math.round(metres(site, [h.lon, h.lat])) })).sort((a, b) => a.m - b.m)[0]
  return { ...best, walked: false }
}