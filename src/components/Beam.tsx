import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { motion } from 'motion/react'

// Port of Magic UI's AnimatedBeam (MIT, magicui.design/docs/components/animated-beam).
// Same behaviour: measure two elements inside a container and draw a quadratic
// path between their centres, re-measured on resize. Kiln changes: no colour
// gradient. The pulse is a short solid dash that runs along the path, once per
// entry in `pulses` (seconds from mount), so every pulse matches a real event.

export interface BeamPulse {
  at: number
  tone?: 'accent' | 'ink'
}

interface Props {
  containerRef: RefObject<HTMLElement | null>
  fromRef: RefObject<HTMLElement | null>
  toRef: RefObject<HTMLElement | null>
  curvature?: number
  pulses?: BeamPulse[]
  duration?: number
  active?: boolean
  fromAnchor?: 'center' | 'bottom' | 'right'
  toAnchor?: 'center' | 'top' | 'left'
  vertical?: boolean
  shown?: boolean // draw the track at rest; otherwise only while active
}

export function Beam({ containerRef, fromRef, toRef, curvature = 0, pulses = [], duration = 0.7, active = false, fromAnchor = 'center', toAnchor = 'center', vertical = false, shown = true }: Props) {
  const [d, setD] = useState('')
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [len, setLen] = useState(0)
  const pathRef = useRef<SVGPathElement>(null)

  // Passive effect on purpose: a child's layout effect runs before the parent
  // container's ref is attached, so measuring there finds nothing.
  useEffect(() => {
    const update = () => {
      const c = containerRef.current
      const a = fromRef.current
      const b = toRef.current
      if (!c || !a || !b) return
      const cr = c.getBoundingClientRect()
      const ar = a.getBoundingClientRect()
      const br = b.getBoundingClientRect()
      const sx = ar.left - cr.left + (fromAnchor === 'right' ? ar.width : ar.width / 2)
      const sy = ar.top - cr.top + (fromAnchor === 'bottom' ? ar.height : ar.height / 2)
      const ex = br.left - cr.left + (toAnchor === 'left' ? 0 : br.width / 2)
      const ey = br.top - cr.top + (toAnchor === 'top' ? 0 : br.height / 2)
      setSize({ w: cr.width, h: cr.height })
      // vertical: a cubic S-curve that leaves and lands straight down, for
      // source chips stacked above the things they feed.
      const my = (sy + ey) / 2
      setD(vertical ? `M ${sx},${sy} C ${sx},${my} ${ex},${my} ${ex},${ey}` : `M ${sx},${sy} Q ${(sx + ex) / 2},${sy - curvature} ${ex},${ey}`)
    }
    const ro = new ResizeObserver(update)
    if (containerRef.current) ro.observe(containerRef.current)
    update()
    return () => ro.disconnect()
  }, [containerRef, fromRef, toRef, curvature, fromAnchor, toAnchor, vertical])

  useLayoutEffect(() => {
    if (pathRef.current && d) setLen(pathRef.current.getTotalLength())
  }, [d])

  const dash = Math.max(18, len * 0.35)
  return (
    <svg className={`beam${active ? ' is-active' : ''}${shown ? ' is-shown' : ''}`} width={size.w} height={size.h} viewBox={`0 0 ${size.w} ${size.h}`} aria-hidden="true">
      <path ref={pathRef} d={d} className="beam-track" />
      {len > 0 &&
        pulses.map((p, i) => (
          <motion.path
            key={i}
            d={d}
            className={`beam-pulse is-${p.tone ?? 'accent'}`}
            strokeDasharray={`${dash} ${len + dash}`}
            initial={{ strokeDashoffset: dash, opacity: 0 }}
            animate={{ strokeDashoffset: -len, opacity: [0, 1, 1, 0] }}
            transition={{ delay: p.at, duration, ease: [0.65, 0, 0.35, 1], opacity: { delay: p.at, duration, times: [0, 0.1, 0.85, 1] } }}
          />
        ))}
    </svg>
  )
}
