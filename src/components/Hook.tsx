import { useEffect, useState } from 'react'
import NumberFlow from '@number-flow/react'
import type { CityId } from '../data/config'
import { HOOKS } from '../data/hook'

// The problem in one number, counted up before the need sentence lands.
export function Hook({ city }: { city: CityId }) {
  const hook = HOOKS[city]
  const [n, setN] = useState(0)
  useEffect(() => {
    const t = window.setTimeout(() => setN(hook.value), 150)
    return () => clearTimeout(t)
  }, [hook.value])
  return (
    <div className="hook">
      <p className="hook-stat">
        <span className="hook-n">
          <NumberFlow value={n} prefix={hook.prefix} suffix={hook.suffix} />
        </span>{' '}
        <span className="hook-line">{hook.line}</span>
      </p>
      <span className="mono-label hook-src">{hook.source}</span>
    </div>
  )
}
