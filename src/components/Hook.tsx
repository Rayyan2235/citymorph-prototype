import { useEffect, useState } from 'react'
import NumberFlow from '@number-flow/react'
import { HOOK } from '../data/hook'

// The problem in one number, counted up before the need sentence lands.
export function Hook() {
  const [n, setN] = useState(0)
  useEffect(() => {
    const t = window.setTimeout(() => setN(HOOK.vacantMillionSqFt), 150)
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="hook">
      <p className="hook-stat">
        <span className="hook-n">
          <NumberFlow value={n} prefix="≈" suffix="M sq ft" />
        </span>{' '}
        <span className="hook-line">{HOOK.line}</span>
      </p>
      <span className="mono-label hook-src">{HOOK.source}</span>
    </div>
  )
}
