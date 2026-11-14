import { motion } from 'motion/react'
import NumberFlow from '@number-flow/react'
import type { Property, PropertyId } from '../data/demo'
import type { Result } from '../logic/evaluate'
import { Cites } from './Cite'

export const BUDGET_MIN = 60000
export const BUDGET_MAX = 200000
const k = (n: number) => `$${Math.round(n / 1000)}k`

// Work for one building as a stacked bar against the live budget line. Core
// work that crosses the line is what breaks the plan; optional work that does
// not fit is struck.
export function CostBar({ property, budget }: { property: Property; budget: number }) {
  const core = property.tasks.filter((t) => t.core)
  const coreSum = core.reduce((s, t) => s + t.cost, 0)
  let run = coreSum
  const fits = new Set(core.map((t) => t.id))
  for (const t of property.tasks.filter((x) => !x.core))
    if (run + t.cost <= budget) {
      fits.add(t.id)
      run += t.cost
    }
  const pct = (n: number) => `${(n / BUDGET_MAX) * 100}%`
  let x = 0
  const over = coreSum > budget
  return (
    <div className={`costbar${over ? ' is-over' : ''}`}>
      <div className="cb-track">
        {property.tasks.map((t) => {
          const left = x
          x += t.cost
          return (
            <span
              key={t.id}
              className={`cb-seg${t.core ? ' is-core' : ''}${fits.has(t.id) ? '' : ' is-cut'}`}
              style={{ left: pct(left), width: pct(t.cost) }}
              title={`${t.name}: about ${k(t.cost)}`}
            />
          )
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
        <Cites ids={['A3', ...core.map((t) => t.ev)]} />
      </div>
    </div>
  )
}

interface PanelProps {
  budget: number
  setBudget: (n: number) => void
  commit: () => void
  shownProperty: Property
  results: Result[]
  selected: PropertyId | null
  onSelect: (id: PropertyId) => void
  changed: string | null
}

export function ReplanPanel({ budget, setBudget, commit, shownProperty, results, selected, onSelect, changed }: PanelProps) {
  let rank = 0
  return (
    <section className="replan float" aria-label="Change the budget">
      <div className="rp-head">
        <label htmlFor="budget" className="mono-label">
          Adaptation budget
        </label>
        <span className="rp-value">
          <NumberFlow value={budget} prefix="$" format={{ maximumFractionDigits: 0 }} />
        </span>
      </div>
      <input
        id="budget"
        className="range"
        type="range"
        min={BUDGET_MIN}
        max={BUDGET_MAX}
        step={5000}
        value={budget}
        style={{ ['--fill' as string]: `${((budget - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100}%` }}
        onChange={(e) => setBudget(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onTouchEnd={commit}
        aria-valuetext={`$${budget.toLocaleString('en-US')}`}
      />
      <CostBar property={shownProperty} budget={budget} />
      <ol className="rank">
        {results.map((r) => {
          const pass = r.status === 'pass'
          if (pass) rank += 1
          return (
            <motion.li key={r.property.id} layout transition={{ layout: { duration: 0.6, ease: [0.65, 0, 0.35, 1] } }} className={`rank-row is-${r.status}${selected === r.property.id ? ' is-selected' : ''}`}>
              <button type="button" onClick={() => onSelect(r.property.id)}>
                <span className="rank-n">{pass ? rank : '×'}</span>
                <span className="rank-name">{r.property.name.replace(/ (retail flex|two storey office|single storey office)$/, '')}</span>
                <span className="mono-label rank-cost">{pass ? k(r.cost) : r.checks.find((c) => !c.pass)?.fail}</span>
              </button>
            </motion.li>
          )
        })}
      </ol>
      {changed && (
        <motion.p key={changed} className="rp-changed" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} aria-live="polite">
          {changed}
        </motion.p>
      )}
    </section>
  )
}
