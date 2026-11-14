// Concept floorplans. The interior box has the real OSM footprint's
// proportions and area; the rooms inside are generated from the facility
// program, so changing capacity, facility type or options redraws the plan.
// Walls have no thickness, so real rooms come out about 5 to 10% smaller.

import { FACILITIES, PLANNING, type DesignOpts, type FacilityId, type RoomRole } from '../data/config'
import type { Candidate, Entrance, LayoutKind } from '../data/candidates'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}
export type ZoneRole = 'activity' | 'reception' | 'support' | 'flex'

export interface PlanZone {
  id: string
  name: string
  role: ZoneRole
  kind: RoomRole
  seats: number
  sqft: number
  target: number // sq ft the program asked for
  purpose: string
  from: Rect
  to: Rect
}

export interface PlanEntrance extends Entrance {
  at: { x: number; y: number; side: Entrance['side'] }
  isNew?: boolean
}

export interface Outdoor {
  need: number
  lot: { rect: Rect; sqft: number } | null
  park: { name: string; m: number } | null
  short: number // sq ft still missing after the lot and any park
}

export type Variant = 'A' | 'B'

export interface Layout {
  box: Rect
  scale: number
  existing: { id: string; name: string; rect: Rect }[]
  fixtures: Rect[]
  zones: PlanZone[]
  entrances: PlanEntrance[]
  door: PlanEntrance | null
  hall: Rect
  route: { x: number; y: number }[]
  outdoor: Outdoor | null
  requested: number
  achieved: number
  occupants: number
  needSqft: number
  roomSqft: number
  squeeze: number // 1 when the program fits; below 1 when rooms had to shrink
  segs: { kept: Seg[]; gone: Seg[]; added: Seg[] }
  newWallFt: number
  removedWallFt: number
}

// ---------- walls ----------

export type Seg = { x1: number; y1: number; x2: number; y2: number }
export const segKey = (s: Seg) => `${s.x1},${s.y1},${s.x2},${s.y2}`
const r1 = (n: number) => Math.round(n * 10) / 10

function edges(r: Rect): Seg[] {
  const [x1, y1, x2, y2] = [r1(r.x), r1(r.y), r1(r.x + r.w), r1(r.y + r.h)]
  return [
    { x1, y1, x2, y2: y1 },
    { x1, y1: y2, x2, y2 },
    { x1, y1, x2: x1, y2 },
    { x1: x2, y1, x2, y2 },
  ]
}

function interior(rects: Rect[], box: Rect): Seg[] {
  const out: Seg[] = []
  const [bx1, by1, bx2, by2] = [r1(box.x), r1(box.y), r1(box.x + box.w), r1(box.y + box.h)]
  for (const r of rects)
    for (const s of edges(r)) {
      const onEdge = (s.y1 === s.y2 && (s.y1 === by1 || s.y1 === by2)) || (s.x1 === s.x2 && (s.x1 === bx1 || s.x1 === bx2))
      if (!onEdge && (s.x2 - s.x1 > 2 || s.y2 - s.y1 > 2)) out.push(s)
    }
  return out
}

// Split every segment at every breakpoint on its line, so old and new walls
// that share a stretch match exactly and that stretch never drops and rises.
function atomize(segs: Seg[], cuts: Seg[]): Seg[] {
  const out = new Map<string, Seg>()
  for (const s of segs) {
    const horiz = s.y1 === s.y2
    const pts = new Set<number>([horiz ? s.x1 : s.y1, horiz ? s.x2 : s.y2])
    for (const c of cuts) {
      if (horiz && c.y1 === c.y2 && c.y1 === s.y1) [c.x1, c.x2].forEach((v) => v > s.x1 && v < s.x2 && pts.add(v))
      if (!horiz && c.x1 === c.x2 && c.x1 === s.x1) [c.y1, c.y2].forEach((v) => v > s.y1 && v < s.y2 && pts.add(v))
    }
    const sorted = [...pts].sort((a, b) => a - b)
    for (let i = 0; i < sorted.length - 1; i++) {
      const [a, b] = [sorted[i], sorted[i + 1]]
      const piece = horiz ? { x1: a, y1: s.y1, x2: b, y2: s.y1 } : { x1: s.x1, y1: a, x2: s.x1, y2: b }
      out.set(segKey(piece), piece)
    }
  }
  return [...out.values()]
}

const segLen = (s: Seg) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1)

// ---------- today's interior, by building kind (sample interior scan) ----------

function existingRooms(kind: LayoutKind, b: Rect) {
  const { x, y, w, h } = b
  const R = (id: string, name: string, fx: number, fy: number, fw: number, fh: number) => ({ id, name, rect: { x: x + fx * w, y: y + fy * h, w: fw * w, h: fh * h } })
  const fixtures: Rect[] = []
  let rooms: ReturnType<typeof R>[] = []
  if (kind === 'retail-open') {
    rooms = [R('sales', 'Open sales floor', 0, 0.34, 1, 0.66), R('back', 'Back room', 0, 0, 0.72, 0.34), R('wc', 'Restroom', 0.72, 0, 0.28, 0.34)]
    for (const fy of [0.46, 0.6, 0.74]) for (const fx of [0.08, 0.55]) fixtures.push({ x: x + fx * w, y: y + fy * h, w: 0.36 * w, h: 0.035 * h })
  } else if (kind === 'office-cellular') {
    rooms = [R('o1', 'Office', 0, 0, 0.32, 0.46), R('o2', 'Office', 0.32, 0, 0.32, 0.46), R('o3', 'Office', 0.64, 0, 0.36, 0.46), R('lob', 'Lobby and stair', 0, 0.46, 0.45, 0.54), R('conf', 'Meeting room', 0.45, 0.46, 0.55, 0.54)]
    fixtures.push({ x: x + 0.56 * w, y: y + 0.62 * h, w: 0.3 * w, h: 0.16 * h })
  } else if (kind === 'office-open') {
    rooms = [R('off1', 'Front office', 0, 0, 0.38, 0.4), R('off2', 'Office', 0.38, 0, 0.28, 0.4), R('wc', 'Restroom', 0.66, 0, 0.34, 0.4), R('bay', 'Open office', 0, 0.4, 0.52, 0.6), R('pv', 'Two private offices', 0.52, 0.4, 0.48, 0.6)]
    for (const fy of [0.52, 0.74]) for (const fx of [0.07, 0.28]) fixtures.push({ x: x + fx * w, y: y + fy * h, w: 0.16 * w, h: 0.12 * h })
  } else if (kind === 'storefront-split') {
    rooms = [R('l', 'Left storefront', 0, 0.3, 0.5, 0.7), R('lb', 'Back room', 0, 0, 0.5, 0.3), R('r', 'Right storefront', 0.5, 0.3, 0.5, 0.7), R('rb', 'Back room', 0.5, 0, 0.5, 0.3)]
    for (const fx of [0.06, 0.56]) fixtures.push({ x: x + fx * w, y: y + 0.5 * h, w: 0.36 * w, h: 0.04 * h })
  } else {
    rooms = [R('floor', 'Warehouse floor', 0, 0, 0.68, 1), R('office', 'Office corner', 0.68, 0.55, 0.32, 0.45), R('wc', 'Restroom', 0.68, 0.32, 0.32, 0.23), R('store', 'Racking', 0.68, 0, 0.32, 0.32)]
    for (const fy of [0.15, 0.4, 0.65]) fixtures.push({ x: x + 0.08 * w, y: y + fy * h, w: 0.5 * w, h: 0.05 * h })
  }
  return { rooms, fixtures }
}

// ---------- the proposed program ----------

interface ProgRoom {
  key: string
  name: string
  kind: RoomRole
  sqft: number
  seats: number
  purpose: string
}

export function program(facility: FacilityId, capacity: number, opts: DesignOpts): ProgRoom[] {
  const f = FACILITIES[facility]
  const out: ProgRoom[] = []
  for (const r of f.rooms) {
    const n = r.count(capacity, opts)
    for (let i = 0; i < n; i++)
      out.push({
        key: n > 1 ? `${r.key}${i + 1}` : r.key,
        name: n > 1 ? `${r.name} ${i + 1}` : r.name,
        kind: r.role,
        sqft: Math.round(r.area(capacity, opts)),
        seats: r.seats ? r.seats(capacity, n) : 0,
        purpose: r.purpose,
      })
  }
  return out
}

const ROLE: Record<RoomRole, ZoneRole> = { primary: 'activity', reception: 'reception', support: 'support', wet: 'support', flex: 'flex', hall: 'flex' }

function place(e: Entrance, b: Rect): PlanEntrance {
  const at =
    e.side === 'bottom' ? { x: b.x + e.t * b.w, y: b.y + b.h }
    : e.side === 'top' ? { x: b.x + e.t * b.w, y: b.y }
    : e.side === 'left' ? { x: b.x, y: b.y + e.t * b.h }
    : { x: b.x + b.w, y: b.y + e.t * b.h }
  return { ...e, at: { ...at, side: e.side } }
}

function overlap(a: Rect, b: Rect) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  return w > 0 && h > 0 ? w * h : 0
}

export function makeLayout(c: Candidate, facility: FacilityId, capacity: number, opts: DesignOpts, variant: Variant, parkOk: { name: string; m: number } | null): Layout {
  const f = FACILITIES[facility]
  const box = c.plan
  const s2 = c.scale * c.scale
  const { rooms: existing, fixtures } = existingRooms(c.kind, box)
  const entrances = c.entrances.map((e) => place(e, box))
  const door = entrances.find((e) => e.stepFree) ?? null
  const prog = program(facility, capacity, opts)

  // Bands: rooms on the door side ("front"), corridor, rooms on the far side.
  const frontKinds: RoomRole[] = variant === 'A' ? ['reception', 'primary'] : ['reception', 'support', 'wet']
  const front = prog.filter((r) => frontKinds.includes(r.kind))
  const back = prog.filter((r) => !frontKinds.includes(r.kind))
  // Corridor width in feet: 6 ft, or 8 ft when accessibility comes first.
  const hallD = Math.min(box.h * 0.16, (opts.accessFirst ? 8 : 6) / c.scale)
  const area = (list: ProgRoom[]) => list.reduce((t, r) => t + r.sqft / s2, 0)
  const doorFromRight = door ? (door.side === 'right' ? true : door.side === 'left' ? false : door.at.x > box.x + box.w / 2) : false
  const doorTop = door?.side === 'top'
  // A building much larger than the program: use a block of about the right
  // size in the door's corner and leave the rest as spare space, instead of
  // stretching the rooms into long strips.
  const target = (area(prog) + hallD * Math.sqrt(area(prog) * 1.4)) * 1.3
  let useW = box.w
  let useH = box.h
  if (target < box.w * box.h * 0.8) {
    useH = Math.min(box.h, Math.sqrt(target / 1.5))
    useW = Math.min(box.w, target / useH)
    if (useW >= box.w) useH = Math.min(box.h, target / box.w)
  }
  const sx = doorFromRight ? box.x + box.w - useW : box.x
  const sy = doorTop ? box.y : box.y + box.h - useH
  const backD = Math.min(Math.max(area(back) / useW, useH * 0.25), useH - hallD - useH * 0.3)
  const frontD = useH - hallD - backD
  const yBack = doorTop ? sy + frontD + hallD : sy
  const yFront = doorTop ? sy : sy + backD + hallD
  const hall = { x: sx, y: doorTop ? sy + frontD : sy + backD, w: useW, h: hallD }

  let squeeze = 1
  const zones: PlanZone[] = []
  const pack = (list: ProgRoom[], y: number, d: number, isFront: boolean) => {
    if (!list.length) return
    const ordered = isFront ? [...list].sort((a, b) => (a.kind === 'reception' ? -1 : b.kind === 'reception' ? 1 : 0)) : list
    const want = ordered.map((r) => r.sqft / s2 / d)
    const total = want.reduce((a, b) => a + b, 0)
    const k = total > useW ? useW / total : 1
    squeeze = Math.min(squeeze, k)
    const widths = want.map((w) => w * k)
    const left = useW - widths.reduce((a, b) => a + b, 0)
    const flex = left > 24
    if (!flex && left > 0) {
      // A sliver is not a room: give it to the primary rooms in this band.
      const prim = ordered.map((r, i) => (r.kind === 'primary' ? i : -1)).filter((i) => i >= 0)
      const idx = prim.length ? prim : ordered.map((_, i) => i)
      idx.forEach((i) => (widths[i] += left / idx.length))
    }
    const items = ordered.map((r, i) => ({ r, w: widths[i] }))
    if (flex) items.push({ r: { key: `flex${isFront ? 'F' : 'B'}`, name: 'Flex space', kind: 'flex', sqft: Math.round(left * d * s2), seats: 0, purpose: 'Unassigned area for future growth or storage.' }, w: left })
    // Reception sits nearest the step free door.
    const seq = isFront && doorFromRight ? [...items].reverse() : items
    let x = sx
    for (const { r, w } of seq) {
      const to = { x, y, w, h: d }
      const sqft = Math.round((w * d * s2) / 10) * 10
      const perSeat = f.sqftPerSeat
      const seats = r.kind === 'primary' && perSeat > 0 ? Math.min(r.seats, Math.floor(sqft / perSeat)) : r.kind === 'primary' && sqft < 80 ? 0 : r.seats
      zones.push({ id: r.key, name: r.name, role: ROLE[r.kind], kind: r.kind, seats, sqft, target: r.sqft, purpose: r.purpose, from: to, to })
      x += w
    }
  }
  pack(front, yFront, frontD, true)
  pack(back, yBack, backD, false)
  zones.push({ id: 'hall', name: 'Hall', role: 'flex', kind: 'hall', seats: 0, sqft: Math.round(hall.w * hall.h * s2), target: 0, purpose: 'Step free corridor linking every room.', from: hall, to: hall })
  const spares: Rect[] = []
  if (useW < box.w - 1) spares.push({ x: doorFromRight ? box.x : box.x + useW, y: box.y, w: box.w - useW, h: box.h })
  if (useH < box.h - 1) spares.push({ x: sx, y: doorTop ? sy + useH : box.y, w: useW, h: box.h - useH })
  spares.forEach((spare, i) =>
    zones.push({ id: `spare${i}`, name: 'Spare space', role: 'flex', kind: 'flex', seats: 0, sqft: Math.round((spare.w * spare.h * s2) / 10) * 10, target: 0, purpose: 'Not needed for this program. Lease it out, or keep it for a later phase.', from: spare, to: spare }),
  )

  // Each new room grows out of the existing room it overlaps most.
  for (const z of zones) {
    let best = existing[0].rect
    let bo = -1
    for (const e of existing) {
      const o = overlap(e.rect, z.to)
      if (o > bo) {
        bo = o
        best = e.rect
      }
    }
    z.from = best
  }

  const achieved =
    facility === 'clinic'
      ? zones.filter((z) => z.kind === 'primary' && z.sqft >= 80).length * 16
      : zones.reduce((t, z) => t + (z.kind === 'primary' || z.kind === 'reception' ? z.seats : 0), 0)
  const staff = Math.ceil(capacity / 8)
  const occupants = (facility === 'clinic' ? Math.round(capacity / 4) : capacity) + staff

  // Exits: every door counts; a large occupant load gets a second exit.
  // Care homes always plan two step free exits; others add one at a high occupant load.
  const stepFree = entrances.filter((e) => e.stepFree).length
  if (facility === 'carehome' ? stepFree < 2 : occupants >= PLANNING.secondExitAt && entrances.length < 2) {
    entrances.push({ id: `${c.id}-exit2`, name: 'New second exit', stepFree: true, side: doorTop ? 'bottom' : 'top', t: doorFromRight ? 0.08 : 0.92, ev: 'A7', at: { x: doorFromRight ? box.x + 0.08 * box.w : box.x + 0.92 * box.w, y: doorTop ? box.y + box.h : box.y, side: doorTop ? 'bottom' : 'top' }, isNew: true })
  }

  // Accessible route: from the step free door into the hall, then along it.
  const route: { x: number; y: number }[] = []
  if (door) {
    const hy = hall.y + hall.h / 2
    route.push({ x: door.at.x, y: door.at.y })
    if (door.side === 'left' || door.side === 'right') {
      const inX = door.side === 'right' ? box.x + box.w - 18 : box.x + 18
      route.push({ x: inX, y: door.at.y }, { x: inX, y: hy })
    } else route.push({ x: Math.min(Math.max(door.at.x, sx + 10), sx + useW - 10), y: hy })
    route.push({ x: doorFromRight ? sx + 14 : sx + useW - 14, y: hy })
  }

  // Outdoor play: the fenceable lot first, then a nearby public park.
  let outdoor: Outdoor | null = null
  if (f.needsOutdoor || opts.outdoorPlay) {
    const need = Math.round(capacity * (f.outdoorPerSeat || 40))
    const lotSqft = Math.min(c.lotOutdoorSqft, need)
    let lot: Outdoor['lot'] = null
    if (lotSqft > 0) {
      const d = box.h
      const w = Math.min(box.w * 0.7, lotSqft / s2 / d)
      lot = { rect: { x: box.x + box.w + 26, y: box.y, w, h: d }, sqft: lotSqft }
    }
    const missing = need - lotSqft
    const park = missing > 0 && parkOk ? parkOk : null
    outdoor = { need, lot, park, short: park ? 0 : Math.max(0, missing) }
  }

  // Walls: what stays, what comes down, what goes up.
  const oldRaw = interior(existing.map((e) => e.rect), box)
  const newRaw = interior(zones.filter((z) => z.kind !== 'flex' || z.id.startsWith('spare')).map((z) => z.to), box)
  const oldSegs = atomize(oldRaw, [...oldRaw, ...newRaw])
  const newSegs = atomize(newRaw, [...oldRaw, ...newRaw])
  const oldKeys = new Set(oldSegs.map(segKey))
  const newKeys = new Set(newSegs.map(segKey))
  const segs = {
    kept: newSegs.filter((s) => oldKeys.has(segKey(s))),
    gone: oldSegs.filter((s) => !newKeys.has(segKey(s))),
    added: newSegs.filter((s) => !oldKeys.has(segKey(s))),
  }
  const ft = (list: Seg[]) => Math.round(list.reduce((t, s) => t + segLen(s), 0) * c.scale)

  return {
    box,
    scale: c.scale,
    existing,
    fixtures,
    zones,
    entrances,
    door,
    hall,
    route,
    outdoor,
    requested: capacity,
    achieved,
    occupants,
    needSqft: prog.reduce((t, r) => t + r.sqft, 0),
    roomSqft: zones.filter((z) => z.kind !== 'hall' && z.kind !== 'flex').reduce((t, z) => t + z.sqft, 0),
    squeeze,
    segs,
    newWallFt: ft(segs.added),
    removedWallFt: ft(segs.gone),
  }
}
