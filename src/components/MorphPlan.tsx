import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import type { Rect, Zone } from '../data/demo'
import type { Result } from '../logic/evaluate'
import { Cite } from './Cite'

const OUTLINE: Rect = { x: 20, y: 20, w: 560, h: 340 }
const EASE = [0.65, 0, 0.35, 1] as const

function zoneClass(z: Zone) {
  return `zone zone-${z.role}`
}

// Conceptual reuse plan. The existing floor (from the interior scan) morphs
// into proposed zones. Areas are estimates from the sketch, never measurements.
export function MorphPlan({ result, closed }: { result: Result; closed: string[] }) {
  const p = result.property
  const [concept, setConcept] = useState(false)
  const canMorph = result.status === 'pass' && p.zones.length > 0
  const scale = p.sqft / (OUTLINE.w * OUTLINE.h)

  useEffect(() => {
    setConcept(false)
    if (!canMorph) return
    const t = setTimeout(() => setConcept(true), 900)
    return () => clearTimeout(t)
  }, [p.id, canMorph])

  const show = concept && canMorph
  const dur = 1.1

  return (
    <figure className="plan">
      <div className="plan-head">
        <div>
          <span className="label">Fig. 02 · Morph plan · {p.name}</span>
          <p className="small plan-sub">Conceptual layout, not an architectural drawing. Areas are estimates.</p>
        </div>
        {canMorph && (
          <div className="seg" role="group" aria-label="Plan view">
            <button type="button" aria-pressed={!show} onClick={() => setConcept(false)}>
              Today
            </button>
            <button type="button" aria-pressed={show} onClick={() => setConcept(true)}>
              Proposed
            </button>
          </div>
        )}
      </div>

      <div className="plan-canvas">
        <svg viewBox="0 0 600 380" role="img" aria-label={`${show ? 'Proposed' : 'Existing'} floor plan of ${p.name}`}>
          <defs>
            <pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="8" className="hatch-line" />
            </pattern>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M20 0H0V20" className="grid-line" />
            </pattern>
          </defs>

          <rect x="0" y="0" width="600" height="380" fill="url(#grid)" />
          <rect {...xywh(OUTLINE)} className="slab" />

          {p.fixtures.map((f, i) => (
            <motion.rect
              key={`f${i}`}
              {...xywh(f)}
              className="fixture"
              animate={{ opacity: show ? 0 : 1 }}
              transition={{ duration: 0.5, delay: show ? 0 : dur * 0.6 }}
            />
          ))}

          {p.zones.map((z, i) => {
            const r = show ? z.to : z.from
            return (
              <motion.rect
                key={z.id}
                className={zoneClass(z)}
                initial={false}
                animate={{ x: r.x, y: r.y, width: r.w, height: r.h, opacity: show ? 1 : 0 }}
                transition={{ duration: dur, ease: EASE, delay: show ? 0.25 + i * 0.08 : 0 }}
              />
            )
          })}

          {p.existing.map((room) => (
            <motion.rect
              key={room.id}
              {...xywh(room.rect)}
              className="wall"
              animate={{ opacity: show ? 0.35 : 1 }}
              transition={{ duration: 0.6 }}
              strokeDasharray={show ? '4 6' : '0'}
            />
          ))}

          {show &&
            p.zones.map((z, i) => (
              <motion.rect
                key={`w-${z.id}`}
                {...xywh(z.to)}
                className="wall wall-new"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.9, delay: 0.7 + i * 0.08, ease: EASE }}
              />
            ))}

          {(show ? p.zones.map((z) => ({ id: z.id, name: z.name, rect: z.to, big: z.role === 'activity' })) : p.existing.map((e) => ({ ...e, big: false }))).map(
            (l) =>
              l.rect.h >= 40 && (
                <motion.g
                  key={`${show ? 'z' : 'e'}-${l.id}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: show ? 1.2 : 0.1 }}
                >
                  <text x={l.rect.x + 12} y={l.rect.y + 24} className={`plan-name${l.big ? ' is-big' : ''}`}>
                    {l.name}
                  </text>
                  <text x={l.rect.x + 12} y={l.rect.y + 42} className="plan-area">
                    ≈ {Math.round((l.rect.w * l.rect.h * scale) / 10) * 10} sq ft est.
                  </text>
                </motion.g>
              ),
          )}

          {p.entrances.map((e) => {
            const isClosed = closed.includes(e.id)
            const horizontal = e.at.side === 'top' || e.at.side === 'bottom'
            return (
              <g key={e.id} className={`door${e.stepFree && !isClosed ? ' is-ok' : ' is-no'}`}>
                <rect
                  x={horizontal ? e.at.x - 22 : e.at.x - 5}
                  y={horizontal ? e.at.y - 5 : e.at.y - 22}
                  width={horizontal ? 44 : 10}
                  height={horizontal ? 10 : 44}
                  className="door-gap"
                />
                <circle cx={e.at.x} cy={e.at.y + (e.at.side === 'bottom' ? 16 : e.at.side === 'top' ? -14 : 0)} r="9" className="door-dot" transform={!horizontal ? `translate(${e.at.side === 'right' ? 16 : -16} 0)` : undefined} />
              </g>
            )
          })}
        </svg>

        {result.status !== 'pass' && (
          <motion.div className="plan-stamp" initial={{ opacity: 0, scale: 1.08, rotate: -6 }} animate={{ opacity: 1, scale: 1, rotate: -4 }} transition={{ duration: 0.5, delay: 0.3 }}>
            <span className="label">{result.status === 'rejected' ? 'Set aside by you' : 'Does not fit'}</span>
            <span className="plan-stamp-why">{result.checks.find((c) => !c.pass)?.label ?? 'Removed from the shortlist'}</span>
          </motion.div>
        )}
      </div>

      <figcaption className="plan-legend">
        {p.entrances.map((e) => (
          <span key={e.id} className={`legend-door${e.stepFree && !closed.includes(e.id) ? ' is-ok' : ' is-no'}`}>
            <i aria-hidden="true" />
            {e.name}
            {closed.includes(e.id) ? ' (unavailable)' : ''} <Cite id={e.ev} />
          </span>
        ))}
      </figcaption>
    </figure>
  )
}

function xywh(r: Rect) {
  return { x: r.x, y: r.y, width: r.w, height: r.h }
}
