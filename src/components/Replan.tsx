import { motion } from 'motion/react'
import type { Task } from '../logic/costs'
import { Cites } from './Cite'

export const BUDGET_MIN = 40000
export const BUDGET_MAX = 260000
const k = (n: number) => `$${Math.round(n / 1000)}k`

// Work for one design as a stacked bar against the live budget line. Core
// work that crosses the line is what breaks the plan; optional work that does
// not fit is struck.
export function CostBar({ tasks, selected, budget }: { tasks: Task[]; selected: Task[]; budget: number }) {
  const core = tasks.filter((t) => t.core)
  const coreSum = core.reduce((s, t) => s + t.cost, 0)
  const fits = new Set(selected.map((t) => t.id))
  const max = Math.max(BUDGET_MAX, tasks.reduce((s, t) => s + t.cost, 0))
  const pct = (n: number) => `${(n / max) * 100}%`
  let x = 0
  const over = coreSum > budget
  const ordered = [...core, ...tasks.filter((t) => !t.core)]
  return (
    <div className={`costbar${over ? ' is-over' : ''}`}>
      <div className="cb-track">
        {ordered.map((t) => {
          const left = x
          x += t.cost
          return <span key={t.id} className={`cb-seg${t.core ? ' is-core' : ''}${fits.has(t.id) ? '' : ' is-cut'}`} style={{ left: pct(left), width: pct(t.cost) }} title={`${t.name}: about ${k(t.cost)}`} />
        })}
        {over && <span className="cb-over" style={{ left: pct(budget), width: pct(coreSum - budget) }} />}
        <motion.span className="cb-line" animate={{ left: pct(budget) }} transition={{ type: 'spring', stiffness: 500, damping: 40 }}>
          <span className="mono-label cb-line-label">{k(budget)}</span>
        </motion.span>
      </div>
      <div className="cb-legend">
        <span>
          <i className="cb-key is-core" /> Core work {k(coreSum)}
        </span>
        <span>
          <i className="cb-key" /> Optional
        </span>
        <Cites ids={['A3']} />
      </div>
    </div>
  )
}

export function WorkList({ tasks, selected }: { tasks: Task[]; selected: Task[] }) {
  const fits = new Set(selected.map((t) => t.id))
  return (
    <ul className="worklist">
      {tasks.map((t) => (
        <li key={t.id} className={`${t.core ? 'is-core' : 'is-opt'}${fits.has(t.id) ? '' : ' is-cut'}`}>
          <span className="wl-name">
            {t.name} <Cites ids={[t.ev]} />
          </span>
          <span className="mono-label wl-cost">{fits.has(t.id) ? k(t.cost) : `${k(t.cost)} · cut`}</span>
        </li>
      ))}
    </ul>
  )
}
