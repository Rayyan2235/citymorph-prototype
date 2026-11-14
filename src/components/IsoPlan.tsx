import { useEffect, useMemo, useRef, useState } from 'react'
import { animate, useMotionValue, useMotionValueEvent } from 'motion/react'
import { Minus, Plus, Scan } from 'lucide-react'
import { segKey, type Layout, type PlanZone, type Rect, type Seg } from '../logic/layout'

// Isometric cutaway of one building. One progress value t (0 = today, 1 =
// proposed) drives everything: old fixtures sink, old partitions lower, rooms
// slide to their new places, new walls rise, then people walk in through the
// step free door. Rooms are clickable hotspots; the drawing zooms and pans.

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
const quad = (r: Rect, inset = 0, z = 0) => poly([pt(r.x + inset, r.y + inset, z), pt(r.x + r.w - inset, r.y + inset, z), pt(r.x + r.w - inset, r.y + r.h - inset, z), pt(r.x + inset, r.y + r.h - inset, z)])
const wall = (s: Seg, h: number) => poly([pt(s.x1, s.y1), pt(s.x2, s.y2), pt(s.x2, s.y2, h), pt(s.x1, s.y1, h)])

function seatsIn(zones: PlanZone[]) {
  const out: { x: number; y: number }[] = []
  for (const z of zones) {
    const n = z.seats
    if (!n) continue
    const r = z.to
    const cols = Math.max(1, Math.ceil(Math.sqrt((n * r.w) / r.h)))
    const rows = Math.ceil(n / cols)
    const pad = Math.min(18, r.w * 0.12)
    const top = Math.min(48, r.h * 0.38) // keep the back strip clear for the room label
    for (let i = 0; i < n; i++) {
      const c = i % cols
      const rr = Math.floor(i / cols)
      out.push({ x: r.x + pad + ((r.w - 2 * pad) * (c + 0.5)) / cols, y: r.y + top + ((r.h - top - pad) * (rr + 0.5)) / rows })
    }
  }
  return out
}

// How many people are seated at progress t (the walk in runs from 0.7 to 1).
export const seatedAt = (t: number, people: number) => Math.round(clamp((t - 0.7) / 0.3) * people)
export const seatCount = (plan: Layout) => plan.zones.reduce((s, z) => s + z.seats, 0)

interface Props {
  plan: Layout
  name: string
  playKey: string
  over?: boolean
  onT?: (t: number) => void
  scrub?: number | null
  corner?: React.ReactNode
  interactive?: boolean
  room?: string | null
  onRoom?: (id: string | null) => void
  showRoute?: boolean
}

export function IsoPlan({ plan, name, playKey, over = false, onT, scrub = null, corner, interactive = false, room = null, onRoom, showRoute = true }: Props) {
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
    const c = animate(mv, 1, { duration: reduce ? 0.01 : 4.6, ease: 'linear', delay: first.current ? 1.2 : 0.2 })
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

  const { box, segs } = plan
  const seats = useMemo(() => seatsIn(plan.zones), [plan])
  const door = plan.door ?? plan.entrances[0]

  const fixturesT = 1 - ease(phase(t, 0.02, 0.28))
  const goneT = 1 - ease(phase(t, 0.1, 0.36))
  const zoneT = ease(phase(t, 0.24, 0.58))
  const wallT = ease(phase(t, 0.42, 0.72))
  const labelT = phase(t, 0.68, 0.84)
  const peopleT = phase(t, 0.7, 1)

  // Painter order: segments further back (smaller x + y) first.
  const depth = (s: Seg) => (s.x1 + s.x2 + s.y1 + s.y2) / 4
  const parts = [
    ...segs.kept.map((s) => ({ s, h: H_PART, cls: 'iso-wall' })),
    ...segs.gone.map((s) => ({ s, h: H_PART * goneT, cls: 'iso-wall is-old' })),
    ...segs.added.map((s) => ({ s, h: H_PART * wallT, cls: 'iso-wall is-new' })),
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
  const lot = plan.outdoor?.lot?.rect

  const base = useMemo(() => {
    const right = lot ? lot.x + lot.w : box.x + box.w
    const xs = [pt(box.x, box.y + box.h)[0], pt(right, box.y)[0]]
    const top = pt(box.x, box.y, H)[1]
    const bottom = pt(right, box.y + box.h)[1]
    const pad = 56
    return { x: xs[0] - pad, y: top - pad, w: xs[1] - xs[0] + pad * 2, h: bottom - top + pad * 2 }
  }, [box, lot])

  // Zoom and pan: a camera over the base viewBox. In a building much bigger
  // than the program, start framed on the rooms rather than the spare space.
  const fit = useMemo(() => {
    const used = plan.zones.filter((z) => !z.id.startsWith('spare'))
    if (used.length === plan.zones.length || !interactive) return { k: 1, x: 0, y: 0 }
    const pts = used.flatMap((z) => [pt(z.to.x, z.to.y, H), pt(z.to.x + z.to.w, z.to.y + z.to.h), pt(z.to.x, z.to.y + z.to.h), pt(z.to.x + z.to.w, z.to.y)])
    const xs = pts.map((p) => p[0])
    const ys = pts.map((p) => p[1])
    const w = Math.max(...xs) - Math.min(...xs)
    const h = Math.max(...ys) - Math.min(...ys)
    const k = Math.min(1.25, Math.max(1, Math.min(base.w / (w * 1.3), base.h / (h * 1.4))))
    const cx = (Math.max(...xs) + Math.min(...xs)) / 2 - (base.x + base.w / 2)
    const cy = (Math.max(...ys) + Math.min(...ys)) / 2 - (base.y + base.h / 2)
    // Keep the camera inside the drawing so the frame never shows empty paper.
    const maxX = (base.w - base.w / k) / 2
    const maxY = (base.h - base.h / k) / 2
    return { k, x: Math.max(-maxX, Math.min(maxX, cx)), y: Math.max(-maxY, Math.min(maxY, cy)) }
  }, [plan, base, interactive])
  const [cam, setCam] = useState(fit)
  useEffect(() => setCam(fit), [fit])
  const vb = { w: base.w / cam.k, h: base.h / cam.k, x: base.x + base.w / 2 - base.w / cam.k / 2 + cam.x, y: base.y + base.h / 2 - base.h / cam.k / 2 + cam.y }
  const svgRef = useRef<SVGSVGElement>(null)
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null)
  useEffect(() => {
    const el = svgRef.current
    if (!el || !interactive) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      setCam((c) => ({ ...c, k: Math.min(4, Math.max(1, c.k * (e.deltaY < 0 ? 1.15 : 1 / 1.15))) }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [interactive])
  const zoom = (f: number) => setCam((c) => ({ ...c, k: Math.min(4, Math.max(1, c.k * f)) }))
  const onDown = (e: React.PointerEvent) => {
    if (!interactive) return
    drag.current = { x: e.clientX, y: e.clientY, cx: cam.x, cy: cam.y, moved: false }
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    const el = svgRef.current
    if (!d || !el) return
    const px = vb.w / el.clientWidth
    const dx = e.clientX - d.x
    const dy = e.clientY - d.y
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true
    if (d.moved) setCam((c) => ({ ...c, x: d.cx - dx * px, y: d.cy - dy * px }))
  }
  const onUp = () => {
    setTimeout(() => (drag.current = null), 0)
  }
  const pick = (id: string | null) => {
    if (drag.current?.moved) return
    onRoom?.(id)
  }

  const inward = (side: string) => (side === 'bottom' ? [0, -28] : side === 'top' ? [0, 28] : side === 'right' ? [-28, 0] : [28, 0])
  const outward = (side: string) => (side === 'bottom' ? [0, 60] : side === 'top' ? [0, -60] : side === 'right' ? [60, 0] : [-60, 0])
  const [ix, iy] = door ? inward(door.at.side) : [0, 0]
  const [ox, oy] = door ? outward(door.at.side) : [0, 0]
  const doorIn = door ? { x: door.at.x + ix, y: door.at.y + iy } : { x: box.x, y: box.y }
  const doorOut = door ? { x: door.at.x + ox, y: door.at.y + oy } : { x: box.x, y: box.y }
  const area = (z: PlanZone) => Math.round(z.sqft / 10) * 10

  return (
    <div className={`iso${over ? ' is-over' : ''}${interactive ? ' is-interactive' : ''}`}>
      <svg
        ref={svgRef}
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        role="img"
        aria-label={`Isometric concept plan of ${name}, ${t > 0.5 ? 'proposed rooms' : 'as it is today'}`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
        onClick={() => pick(null)}
      >
        <defs>
          <pattern id="iso-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="6" className="iso-hatch-line" />
          </pattern>
          <pattern id="iso-dots" width="14" height="14" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.7" className="iso-dot" />
          </pattern>
          <pattern id="iso-play" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
            <circle cx="2" cy="2" r="1" className="iso-play-dot" />
          </pattern>
        </defs>

        {/* drafting paper */}
        <rect x={base.x - base.w} y={base.y - base.h} width={base.w * 3} height={base.h * 3} fill="url(#iso-dots)" />

        {/* slab and ground shadow */}
        <polygon className="iso-ground" points={quad({ x: box.x - 18, y: box.y - 18, w: box.w + 36, h: box.h + 36 })} />
        <polygon className="iso-slab-side" points={poly([pt(box.x, box.y + box.h, 0), pt(box.x + box.w, box.y + box.h, 0), pt(box.x + box.w, box.y + box.h, -8), pt(box.x, box.y + box.h, -8)])} />
        <polygon className="iso-slab-side is-right" points={poly([pt(box.x + box.w, box.y, 0), pt(box.x + box.w, box.y + box.h, 0), pt(box.x + box.w, box.y + box.h, -8), pt(box.x + box.w, box.y, -8)])} />
        <polygon className="iso-floor" points={quad(box)} />

        {/* outdoor play yard beside the building, fenced, appears with the rooms */}
        {lot && (
          <g className="iso-yard" style={{ opacity: zoneT }}>
            <polygon className="iso-yard-floor" points={quad(lot)} />
            <polygon className="iso-yard-play" points={quad(lot, 6)} />
            {[0, 0.25, 0.5, 0.75, 1].flatMap((f) => [
              [lot.x + f * lot.w, lot.y],
              [lot.x + f * lot.w, lot.y + lot.h],
              [lot.x, lot.y + f * lot.h],
              [lot.x + lot.w, lot.y + f * lot.h],
            ]).map(([x, y], i) => {
              const [a, b] = pt(x, y)
              return <line key={i} x1={a} y1={b} x2={a} y2={b - 8 * zoneT} className="iso-fence" />
            })}
            <polyline className="iso-fence-rail" points={poly([pt(lot.x, lot.y + lot.h, 7 * zoneT), pt(lot.x + lot.w, lot.y + lot.h, 7 * zoneT), pt(lot.x + lot.w, lot.y, 7 * zoneT)])} />
            {(() => {
              const [lx, ly] = pt(lot.x + lot.w / 2, lot.y + lot.h / 2)
              return (
                <g transform={`translate(${lx} ${ly})`} style={{ opacity: labelT }}>
                  <text className="iso-label-name" textAnchor="middle">Outdoor play</text>
                  <text className="iso-label-area" textAnchor="middle" y={14}>≈ {plan.outdoor!.lot!.sqft.toLocaleString('en-US')} SQ FT YARD</text>
                </g>
              )
            })()}
          </g>
        )}

        {/* back walls */}
        {back.map((s) => (
          <polygon key={segKey(s)} className="iso-wall is-back" points={wall(s, H)} />
        ))}

        {/* today's rooms, faint */}
        {plan.existing.map((e) => (
          <polygon key={e.id} className="iso-room-old" style={{ opacity: 1 - zoneT }} points={quad(e.rect)} />
        ))}

        {/* proposed rooms slide from today's footprint to the new room; click for details */}
        {plan.zones.map((z) => {
          const r = { x: lerp(z.from.x, z.to.x, zoneT), y: lerp(z.from.y, z.to.y, zoneT), w: lerp(z.from.w, z.to.w, zoneT), h: lerp(z.from.h, z.to.h, zoneT) }
          return (
            <polygon
              key={z.id}
              className={`iso-zone is-${z.role}${room === z.id ? ' is-picked' : ''}${interactive && z.kind !== 'hall' ? ' is-hot' : ''}`}
              style={{ opacity: zoneT }}
              points={quad(r, 3)}
              onClick={(e) => {
                e.stopPropagation()
                if (z.kind !== 'hall') pick(z.id)
              }}
            >
              <title>{`${z.name}, about ${area(z).toLocaleString('en-US')} sq ft`}</title>
            </polygon>
          )
        })}

        {/* old fixtures sink away */}
        {fixturesT > 0.02 &&
          plan.fixtures.map((f, i) => {
            const h = 9 * fixturesT
            return (
              <g key={i} style={{ opacity: fixturesT }}>
                <polygon className="iso-fix-side" points={poly([pt(f.x, f.y + f.h), pt(f.x + f.w, f.y + f.h), pt(f.x + f.w, f.y + f.h, h), pt(f.x, f.y + f.h, h)])} />
                <polygon className="iso-fix-side is-right" points={poly([pt(f.x + f.w, f.y), pt(f.x + f.w, f.y + f.h), pt(f.x + f.w, f.y + f.h, h), pt(f.x + f.w, f.y, h)])} />
                <polygon className="iso-fix-top" points={quad(f, 0, h)} />
              </g>
            )
          })}

        {/* accessible route from the step free door along the hall */}
        {showRoute && plan.route.length > 1 && (
          <polyline className="iso-route" style={{ opacity: labelT }} points={poly(plan.route.map((p) => pt(p.x, p.y, 0.5)))} />
        )}

        {/* partitions */}
        {parts.map((w) => (
          <g key={w.cls + segKey(w.s)}>
            <polygon className={w.cls} points={wall(w.s, w.h)} />
            <line className="iso-wall-cap" x1={pt(w.s.x1, w.s.y1, w.h)[0]} y1={pt(w.s.x1, w.s.y1, w.h)[1]} x2={pt(w.s.x2, w.s.y2, w.h)[0]} y2={pt(w.s.x2, w.s.y2, w.h)[1]} />
          </g>
        ))}

        {/* people walk in through the step free door, then sit */}
        {seats.map((s, i) => {
          const local = clamp(peopleT * 1.6 - (i / seats.length) * 0.6)
          if (local <= 0) return null
          const e = ease(local)
          const x = local < 0.35 ? lerp(doorOut.x, doorIn.x, local / 0.35) : lerp(doorIn.x, s.x, ease((local - 0.35) / 0.65))
          const y = local < 0.35 ? lerp(doorOut.y, doorIn.y, local / 0.35) : lerp(doorIn.y, s.y, ease((local - 0.35) / 0.65))
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
          <polygon key={segKey(s)} className="iso-wall is-front" points={wall(s, H_FRONT)} />
        ))}

        {/* the one measured number: footprint area from OpenStreetMap */}
        <text
          transform={`translate(${(pt(box.x, box.y + box.h + 30)[0] + pt(box.x + box.w, box.y + box.h + 30)[0]) / 2} ${(pt(box.x, box.y + box.h + 30)[1] + pt(box.x + box.w, box.y + box.h + 30)[1]) / 2}) rotate(30)`}
          textAnchor="middle"
          className="iso-area-t"
        >
          {Math.round(box.w * box.h * plan.scale * plan.scale / 10) * 10 > 0 ? `${(Math.round((box.w * box.h * plan.scale * plan.scale) / 10) * 10).toLocaleString('en-US')} SQ FT FOOTPRINT · OSM` : ''}
        </text>

        {/* entrances and exits: tick = step free, cross = steps, orange = new */}
        {plan.entrances.map((e) => {
          const [ex, ey] = pt(e.at.x, e.at.y, e.at.side === 'top' || e.at.side === 'left' ? H + 4 : H_FRONT + 4)
          const show = e.isNew ? wallT : 1
          if (show < 0.05) return null
          return (
            <g key={e.id} className={`iso-door${e.stepFree ? ' is-ok' : ' is-no'}${e.isNew ? ' is-new' : ''}`} style={{ opacity: show }}>
              <title>{e.name}</title>
              <line x1={ex} y1={ey} x2={ex} y2={ey - 18} className="iso-door-stem" />
              <circle cx={ex} cy={ey - 24} r={7} className="iso-door-dot" />
              {e.stepFree ? <path d={`M${ex - 3} ${ey - 24} l2.2 2.4 l4 -4.6`} className="iso-door-glyph" /> : <path d={`M${ex - 2.6} ${ey - 26.6} l5.2 5.2 M${ex + 2.6} ${ey - 26.6} l-5.2 5.2`} className="iso-door-glyph" />}
              {e.isNew && (
                <text x={ex + 11} y={ey - 21} className="iso-door-t">
                  EXIT
                </text>
              )}
            </g>
          )
        })}

        {/* room labels */}
        {plan.zones
          .filter((z) => z.kind !== 'hall' && !z.id.startsWith('spare') && z.to.w > 60)
          .map((z) => {
            const seated = z.seats > 0
            const [lx, ly] = pt(z.to.x + z.to.w / 2, seated ? z.to.y + Math.min(24, z.to.h * 0.2) : z.to.y + z.to.h / 2, 0)
            return (
              <g key={z.id} className="iso-label" style={{ opacity: labelT }} transform={`translate(${lx} ${ly - 4 + (1 - labelT) * 6})`}>
                <text className="iso-label-name" textAnchor="middle">
                  {z.name}
                </text>
                <text className="iso-label-area" textAnchor="middle" y={14}>
                  ≈ {area(z).toLocaleString('en-US')} SQ FT
                </text>
              </g>
            )
          })}
      </svg>
      {corner && <div className="iso-count">{corner}</div>}
      {segs.added.length === 0 && labelT > 0 && (
        <span className="mono-label iso-note" style={{ opacity: labelT }}>
          No new walls · existing walls reused
        </span>
      )}
      {interactive && (
        <div className="iso-zoom" role="group" aria-label="Zoom the plan">
          <button type="button" className="icon-btn is-square" onClick={() => zoom(1.25)} aria-label="Zoom in">
            <Plus size={14} strokeWidth={1.8} />
          </button>
          <button type="button" className="icon-btn is-square" onClick={() => zoom(0.8)} aria-label="Zoom out">
            <Minus size={14} strokeWidth={1.8} />
          </button>
          <button type="button" className="icon-btn is-square" onClick={() => setCam(cam.k === fit.k && cam.x === fit.x ? { k: 1, x: 0, y: 0 } : fit)} aria-label="Reset view">
            <Scan size={14} strokeWidth={1.8} />
          </button>
        </div>
      )}
      {over && (
        <div className="iso-stamp" role="status">
          Over budget
        </div>
      )}
    </div>
  )
}
