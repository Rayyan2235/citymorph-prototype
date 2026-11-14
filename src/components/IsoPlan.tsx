import { useEffect, useMemo, useRef, useState } from 'react'
import { animate, useMotionValue, useMotionValueEvent } from 'motion/react'
import type { Property, Rect, Zone } from '../data/demo'

// Isometric cutaway of one building. One progress value t (0 = today, 1 =
// proposed) drives everything: retail fixtures sink, old partitions lower,
// zones slide to their new rooms, new walls rise, then people walk in through
// the step free door and take a seat. Conceptual layout only.

const C = Math.cos(Math.PI / 6)
const S = 0.5
const H = 30 // back wall height
const H_FRONT = 6 // front walls are cut low so you can see in
const H_PART = 26 // partition height

const clamp = (v: number) => Math.min(1, Math.max(0, v))
const phase = (t: number, a: number, b: number) => clamp((t - a) / (b - a))
const ease = (v: number) => (v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2)
const lerp = (a: number, b: number, v: number) => a + (b - a) * v

const pt = (x: number, y: number, z = 0) => [(x - y) * C, (x + y) * S - z] as const
const poly = (pts: (readonly [number, number])[]) => pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')

type Seg = { x1: number; y1: number; x2: number; y2: number }
const key = (s: Seg) => `${s.x1},${s.y1},${s.x2},${s.y2}`

function edges(r: Rect): Seg[] {
  return [
    { x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y },
    { x1: r.x, y1: r.y + r.h, x2: r.x + r.w, y2: r.y + r.h },
    { x1: r.x, y1: r.y, x2: r.x, y2: r.y + r.h },
    { x1: r.x + r.w, y1: r.y, x2: r.x + r.w, y2: r.y + r.h },
  ]
}

function interior(rects: Rect[], box: Rect): Seg[] {
  const out: Seg[] = []
  for (const r of rects)
    for (const s of edges(r)) {
      const onEdge =
        (s.y1 === s.y2 && (s.y1 === box.y || s.y1 === box.y + box.h)) || (s.x1 === s.x2 && (s.x1 === box.x || s.x1 === box.x + box.w))
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
      const a = sorted[i]
      const b = sorted[i + 1]
      const piece = horiz ? { x1: a, y1: s.y1, x2: b, y2: s.y1 } : { x1: s.x1, y1: a, x2: s.x1, y2: b }
      out.set(key(piece), piece)
    }
  }
  return [...out.values()]
}

// A wall is a vertical quad from z0 to z1 along a segment.
function wall(s: Seg, h: number, th = 0) {
  return poly([pt(s.x1, s.y1, th), pt(s.x2, s.y2, th), pt(s.x2, s.y2, th + h), pt(s.x1, s.y1, th + h)])
}

function seats(zones: Zone[], people: number) {
  const act = zones.filter((z) => z.role === 'activity')
  const rec = zones.filter((z) => z.role === 'reception')
  const recCount = rec.length ? Math.min(8, Math.round(people * 0.2)) : 0
  const per = act.length ? Math.ceil((people - recCount) / act.length) : 0
  const out: { x: number; y: number }[] = []
  const fill = (r: Rect, n: number) => {
    const cols = Math.ceil(Math.sqrt((n * r.w) / r.h))
    const rows = Math.ceil(n / cols)
    const pad = 20
    const top = 52 // keep the back strip clear for the room label
    for (let i = 0; i < n; i++) {
      const c = i % cols
      const rr = Math.floor(i / cols)
      out.push({ x: r.x + pad + ((r.w - 2 * pad) * (c + 0.5)) / cols, y: r.y + top + ((r.h - top - pad) * (rr + 0.5)) / rows })
    }
  }
  act.forEach((z) => fill(z.to, per))
  rec.forEach((z) => fill(z.to, recCount))
  return out.slice(0, people)
}

// How many people are seated at progress t (the walk in runs from 0.7 to 1).
export const seatedAt = (t: number, people: number) => Math.round(clamp((t - 0.7) / 0.3) * people)

interface Props {
  property: Property
  people: number
  playKey: string
  over?: boolean
  onT?: (t: number) => void
  scrub?: number | null
  corner?: React.ReactNode
}

export function IsoPlan({ property: p, people, playKey, over = false, onT, scrub = null, corner }: Props) {
  const mv = useMotionValue(0)
  const [t, setT] = useState(0)
  useMotionValueEvent(mv, 'change', (v) => {
    setT(v)
    onT?.(v)
  })
  const reduce = typeof document !== 'undefined' && document.documentElement.dataset.motion === 'off'
  const first = useRef(true)
  const run = useRef<ReturnType<typeof animate> | null>(null)

  useEffect(() => {
    mv.set(0)
    const c = animate(mv, 1, { duration: reduce ? 0.01 : 4.6, ease: 'linear', delay: first.current ? 1.4 : 0.3 })
    run.current = c
    first.current = false
    return () => c.stop()
  }, [playKey, mv, reduce])

  // Dragging the scrubber takes over from the autoplay.
  useEffect(() => {
    if (scrub === null) return
    run.current?.stop()
    mv.set(scrub)
  }, [scrub, mv])

  const geo = useMemo(() => {
    const all = p.existing.map((e) => e.rect)
    const x0 = Math.min(...all.map((r) => r.x))
    const y0 = Math.min(...all.map((r) => r.y))
    const x1 = Math.max(...all.map((r) => r.x + r.w))
    const y1 = Math.max(...all.map((r) => r.y + r.h))
    const box = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
    const oldRaw = interior(all, box)
    const newRaw = interior(
      p.zones.filter((z) => z.role !== 'flex').map((z) => z.to),
      box,
    )
    const oldSegs = atomize(oldRaw, [...oldRaw, ...newRaw])
    const newSegs = atomize(newRaw, [...oldRaw, ...newRaw])
    const oldKeys = new Set(oldSegs.map(key))
    const newKeys = new Set(newSegs.map(key))
    const scale = p.sqft / (box.w * box.h)
    // Structural axes for the drafting layer: the box edges plus every line a
    // proposed wall sits on, like the column grid on a CAD sheet.
    // Axes closer than MIN apart would stack their bubbles, so keep the first.
    const MIN = 48
    const spaced = (vals: number[], end: number) => {
      const out: number[] = []
      for (const v of [...new Set(vals)].sort((a, b) => a - b)) if (!out.length || v - out[out.length - 1] >= MIN) out.push(v)
      if (out[out.length - 1] !== end) out[out.length - 1] = end
      return out
    }
    const axesX = spaced([box.x, box.x + box.w, ...newSegs.filter((s) => s.x1 === s.x2).map((s) => s.x1)], box.x + box.w).slice(0, 7)
    const axesY = spaced([box.y, box.y + box.h, ...newSegs.filter((s) => s.y1 === s.y2).map((s) => s.y1)], box.y + box.h).slice(0, 6)
    return {
      box,
      scale,
      ft: Math.sqrt(scale),
      axesX,
      axesY,
      kept: newSegs.filter((s) => oldKeys.has(key(s))),
      gone: oldSegs.filter((s) => !newKeys.has(key(s))),
      added: newSegs.filter((s) => !oldKeys.has(key(s))),
      seats: seats(p.zones, people),
      door: p.entrances.find((e) => e.stepFree) ?? p.entrances[0],
    }
  }, [p, people])

  const { box } = geo
  const fixturesT = 1 - ease(phase(t, 0.02, 0.28))
  const goneT = 1 - ease(phase(t, 0.1, 0.36))
  const zoneT = ease(phase(t, 0.24, 0.58))
  const wallT = ease(phase(t, 0.42, 0.72))
  const labelT = phase(t, 0.68, 0.84)
  const peopleT = phase(t, 0.7, 1)

  // Painter order: segments further back (smaller x + y) first.
  const depth = (s: Seg) => (s.x1 + s.x2 + s.y1 + s.y2) / 4
  const parts = [
    ...geo.kept.map((s) => ({ s, h: H_PART, cls: 'iso-wall' })),
    ...geo.gone.map((s) => ({ s, h: H_PART * goneT, cls: 'iso-wall is-old' })),
    ...geo.added.map((s) => ({ s, h: H_PART * wallT, cls: 'iso-wall is-new' })),
  ]
    .filter((w) => w.h > 0.4)
    .sort((a, b) => depth(a.s) - depth(b.s))

  const back: Seg[] = [
    { x1: box.x, y1: box.y, x2: box.x + box.w, y2: box.y },
    { x1: box.x, y1: box.y, x2: box.x, y2: box.y + box.h },
  ]
  const front: Seg[] = [
    { x1: box.x, y1: box.y + box.h, x2: box.x + box.w, y2: box.y + box.h },
    { x1: box.x + box.w, y1: box.y, x2: box.x + box.w, y2: box.y + box.h },
  ]

  const vb = (() => {
    const xs = [pt(box.x, box.y + box.h)[0], pt(box.x + box.w, box.y)[0]]
    const top = pt(box.x, box.y, H)[1]
    const bottom = pt(box.x + box.w, box.y + box.h)[1]
    const pad = 70
    return `${xs[0] - pad} ${top - pad} ${xs[1] - xs[0] + pad * 2} ${bottom - top + pad * 2}`
  })()
  const vbNums = vb.split(' ').map(Number)

  // Dimension lines on the two front edges, offset outward, with slash ticks.
  const DIM = 34
  const dims = [
    { a: [box.x, box.y + box.h + DIM], b: [box.x + box.w, box.y + box.h + DIM], ext: [[box.x, box.y + box.h], [box.x + box.w, box.y + box.h]], len: box.w, rot: 30 },
    { a: [box.x + box.w + DIM, box.y], b: [box.x + box.w + DIM, box.y + box.h], ext: [[box.x + box.w, box.y], [box.x + box.w, box.y + box.h]], len: box.h, rot: -30 },
  ]
  const letters = 'ABCDEFG'

  const door = geo.door
  const doorIn = door.at.side === 'bottom' ? { x: door.at.x, y: door.at.y - 28 } : door.at.side === 'right' ? { x: door.at.x - 28, y: door.at.y } : door.at.side === 'top' ? { x: door.at.x, y: door.at.y + 28 } : { x: door.at.x + 28, y: door.at.y }
  const doorOut = door.at.side === 'bottom' ? { x: door.at.x, y: door.at.y + 60 } : door.at.side === 'right' ? { x: door.at.x + 60, y: door.at.y } : door.at.side === 'top' ? { x: door.at.x, y: door.at.y - 60 } : { x: door.at.x - 60, y: door.at.y }

  return (
    <div className={`iso${over ? ' is-over' : ''}`}>
      <svg viewBox={vb} role="img" aria-label={`Isometric concept plan of ${p.name}, ${t > 0.5 ? 'proposed rooms' : 'as it is today'}`}>
        <defs>
          <pattern id="iso-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className="iso-hatch-line" />
          </pattern>
          <pattern id="iso-dots" width="14" height="14" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.7" className="iso-dot" />
          </pattern>
        </defs>

        {/* drafting paper */}
        <rect x={vbNums[0]} y={vbNums[1]} width={vbNums[2]} height={vbNums[3]} fill="url(#iso-dots)" />

        {/* slab and ground shadow */}
        <polygon className="iso-ground" points={poly([pt(box.x - 18, box.y - 18), pt(box.x + box.w + 18, box.y - 18), pt(box.x + box.w + 18, box.y + box.h + 18), pt(box.x - 18, box.y + box.h + 18)])} />
        <polygon className="iso-slab-side" points={poly([pt(box.x, box.y + box.h, 0), pt(box.x + box.w, box.y + box.h, 0), pt(box.x + box.w, box.y + box.h, -8), pt(box.x, box.y + box.h, -8)])} />
        <polygon className="iso-slab-side is-right" points={poly([pt(box.x + box.w, box.y, 0), pt(box.x + box.w, box.y + box.h, 0), pt(box.x + box.w, box.y + box.h, -8), pt(box.x + box.w, box.y, -8)])} />
        <polygon className="iso-floor" points={poly([pt(box.x, box.y), pt(box.x + box.w, box.y), pt(box.x + box.w, box.y + box.h), pt(box.x, box.y + box.h)])} />

        {/* back walls */}
        {back.map((s) => (
          <polygon key={key(s)} className="iso-wall is-back" points={wall(s, H)} />
        ))}

        {/* axis bubbles above the back walls, with leader lines down to the wall top */}
        <g className="iso-axes">
          {geo.axesX.map((x, i) => {
            const [bx, by] = pt(x, box.y - 36, H)
            const [fx, fy] = pt(x, box.y, H)
            return (
              <g key={'ax' + x}>
                <line x1={bx} y1={by} x2={fx} y2={fy} className="iso-axis-lead" />
                <circle cx={bx} cy={by} r={7.5} className="iso-bubble" />
                <text x={bx} y={by + 3} textAnchor="middle" className="iso-bubble-t">
                  {letters[i]}
                </text>
              </g>
            )
          })}
          {geo.axesY.map((y, i) => {
            const [bx, by] = pt(box.x - 36, y, H)
            const [fx, fy] = pt(box.x, y, H)
            return (
              <g key={'ay' + y}>
                <line x1={bx} y1={by} x2={fx} y2={fy} className="iso-axis-lead" />
                <circle cx={bx} cy={by} r={7.5} className="iso-bubble" />
                <text x={bx} y={by + 3} textAnchor="middle" className="iso-bubble-t">
                  {i + 1}
                </text>
              </g>
            )
          })}
        </g>

        {/* today's rooms, faint */}
        {p.existing.map((e) => (
          <polygon key={e.id} className="iso-room-old" style={{ opacity: 1 - zoneT }} points={poly([pt(e.rect.x, e.rect.y), pt(e.rect.x + e.rect.w, e.rect.y), pt(e.rect.x + e.rect.w, e.rect.y + e.rect.h), pt(e.rect.x, e.rect.y + e.rect.h)])} />
        ))}

        {/* proposed zones slide from today's footprint to the new room */}
        {p.zones.map((z) => {
          const r = {
            x: lerp(z.from.x, z.to.x, zoneT),
            y: lerp(z.from.y, z.to.y, zoneT),
            w: lerp(z.from.w, z.to.w, zoneT),
            h: lerp(z.from.h, z.to.h, zoneT),
          }
          const inset = 3
          return (
            <polygon
              key={z.id}
              className={`iso-zone is-${z.role}`}
              style={{ opacity: zoneT }}
              points={poly([pt(r.x + inset, r.y + inset), pt(r.x + r.w - inset, r.y + inset), pt(r.x + r.w - inset, r.y + r.h - inset), pt(r.x + inset, r.y + r.h - inset)])}
            />
          )
        })}

        {/* axis lines across the floor, under the walls */}
        <g className="iso-axis-floor">
          {geo.axesX.slice(1, -1).map((x) => {
            const [ax, ay] = pt(x, box.y)
            const [bx, by] = pt(x, box.y + box.h)
            return <line key={'fx' + x} x1={ax} y1={ay} x2={bx} y2={by} />
          })}
          {geo.axesY.slice(1, -1).map((y) => {
            const [ax, ay] = pt(box.x, y)
            const [bx, by] = pt(box.x + box.w, y)
            return <line key={'fy' + y} x1={ax} y1={ay} x2={bx} y2={by} />
          })}
        </g>

        {/* retail fixtures and old furniture sink away */}
        {fixturesT > 0.02 &&
          p.fixtures.map((f, i) => {
            const h = 9 * fixturesT
            return (
              <g key={i} style={{ opacity: fixturesT }}>
                <polygon className="iso-fix-side" points={poly([pt(f.x, f.y + f.h), pt(f.x + f.w, f.y + f.h), pt(f.x + f.w, f.y + f.h, h), pt(f.x, f.y + f.h, h)])} />
                <polygon className="iso-fix-side is-right" points={poly([pt(f.x + f.w, f.y), pt(f.x + f.w, f.y + f.h), pt(f.x + f.w, f.y + f.h, h), pt(f.x + f.w, f.y, h)])} />
                <polygon className="iso-fix-top" points={poly([pt(f.x, f.y, h), pt(f.x + f.w, f.y, h), pt(f.x + f.w, f.y + f.h, h), pt(f.x, f.y + f.h, h)])} />
              </g>
            )
          })}

        {/* partitions */}
        {parts.map((w) => (
          <g key={w.cls + key(w.s)}>
            <polygon className={w.cls} points={wall(w.s, w.h)} />
            <line className="iso-wall-cap" x1={pt(w.s.x1, w.s.y1, w.h)[0]} y1={pt(w.s.x1, w.s.y1, w.h)[1]} x2={pt(w.s.x2, w.s.y2, w.h)[0]} y2={pt(w.s.x2, w.s.y2, w.h)[1]} />
          </g>
        ))}

        {/* people walk in through the step free door, then sit */}
        {geo.seats.map((s, i) => {
          const local = clamp(peopleT * 1.6 - (i / geo.seats.length) * 0.6)
          if (local <= 0) return null
          const e = ease(local)
          const mid = local < 0.35 ? local / 0.35 : 1
          const x = local < 0.35 ? lerp(doorOut.x, doorIn.x, mid) : lerp(doorIn.x, s.x, ease((local - 0.35) / 0.65))
          const y = local < 0.35 ? lerp(doorOut.y, doorIn.y, mid) : lerp(doorIn.y, s.y, ease((local - 0.35) / 0.65))
          const [px, py] = pt(x, y, 0)
          return (
            <g key={i} className="iso-person" style={{ opacity: Math.min(1, e * 3) }}>
              <ellipse cx={px} cy={py} rx={4.2} ry={2.2} className="iso-person-shadow" />
              <rect x={px - 2.4} y={py - 9} width={4.8} height={7} rx={2.4} className="iso-person-body" />
              <circle cx={px} cy={py - 11.2} r={2.5} className="iso-person-head" />
            </g>
          )
        })}

        {/* front walls, cut low */}
        {front.map((s) => (
          <polygon key={key(s)} className="iso-wall is-front" points={wall(s, H_FRONT)} />
        ))}

        {/* overall dimensions, derived from the record's area: estimates, so ≈ */}
        <g className="iso-dims">
          {dims.map((d, i) => {
            const [ax, ay] = pt(d.a[0], d.a[1])
            const [bx, by] = pt(d.b[0], d.b[1])
            const [mx, my] = [(ax + bx) / 2, (ay + by) / 2]
            const tick = (x: number, y: number) => `M${x - 4} ${y + 4} L${x + 4} ${y - 4}`
            return (
              <g key={i}>
                {d.ext.map(([ex, ey], k) => {
                  const [x0, y0] = pt(ex, ey)
                  const [x1, y1] = k === 0 ? [ax, ay] : [bx, by]
                  return <line key={k} x1={x0} y1={y0} x2={x1} y2={y1} className="iso-dim-ext" />
                })}
                <line x1={ax} y1={ay} x2={bx} y2={by} className="iso-dim-line" />
                <path d={tick(ax, ay) + tick(bx, by)} className="iso-dim-tick" />
                <text transform={`translate(${mx} ${my}) rotate(${d.rot}) translate(0 -5)`} textAnchor="middle" className="iso-dim-t">
                  ≈ {Math.round((d.len * geo.ft) / 1).toLocaleString('en-US')} FT
                </text>
              </g>
            )
          })}
        </g>

        {/* entrances */}
        {p.entrances.map((e) => {
          const [ex, ey] = pt(e.at.x, e.at.y, e.at.side === 'top' ? H + 4 : H_FRONT + 4)
          return (
            <g key={e.id} className={`iso-door${e.stepFree ? ' is-ok' : ' is-no'}`}>
              <line x1={ex} y1={ey} x2={ex} y2={ey - 18} className="iso-door-stem" />
              <circle cx={ex} cy={ey - 24} r={7} className="iso-door-dot" />
              {e.stepFree ? (
                <path d={`M${ex - 3} ${ey - 24} l2.2 2.4 l4 -4.6`} className="iso-door-glyph" />
              ) : (
                <path d={`M${ex - 2.6} ${ey - 26.6} l5.2 5.2 M${ex + 2.6} ${ey - 26.6} l-5.2 5.2`} className="iso-door-glyph" />
              )}
            </g>
          )
        })}

        {/* room labels */}
        {p.zones
          .filter((z) => z.role !== 'flex')
          .map((z) => {
            const seated = z.role === 'activity' || z.role === 'reception'
            const [lx, ly] = pt(z.to.x + z.to.w / 2, seated ? z.to.y + 26 : z.to.y + z.to.h / 2, 0)
            const area = Math.round((z.to.w * z.to.h * geo.scale) / 10) * 10
            return (
              <g key={z.id} className="iso-label" style={{ opacity: labelT }} transform={`translate(${lx} ${ly - 4 + (1 - labelT) * 6})`}>
                <text className="iso-label-name" textAnchor="middle">
                  {z.name}
                </text>
                <text className="iso-label-area" textAnchor="middle" y={14}>
                  ≈ {area.toLocaleString('en-US')} SQ FT
                </text>
              </g>
            )
          })}
      </svg>
      {corner && <div className="iso-count">{corner}</div>}
      {over && (
        <div className="iso-stamp" role="status">
          Over budget
        </div>
      )}
    </div>
  )
}
