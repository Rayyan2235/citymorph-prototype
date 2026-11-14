import { motion } from 'motion/react'
import NumberFlow from '@number-flow/react'
import { PLANNING, type PropertyId } from '../data/demo'
import type { Result } from '../logic/evaluate'
import { Cite, Cites } from './Cite'

const BARS: { key: keyof Result['parts']; label: string }[] = [
  { key: 'space', label: 'Space' },
  { key: 'rooms', label: 'Rooms' },
  { key: 'budget', label: 'Budget left' },
  { key: 'evidence', label: 'Evidence' },
]

interface Props {
  results: Result[]
  selected: PropertyId | null
  onSelect: (id: PropertyId) => void
  people: number
  changed: Set<PropertyId>
}

// Shortlist of paper cards. The same facts in the same order on every card,
// so three buildings compare at a glance. Failed buildings say which rule
// failed, what was required and what the evidence shows.
export function Results({ results, selected, onSelect, people, changed }: Props) {
  let rank = 0
  return (
    <ul className="results">
      {results.map((r) => {
        const p = r.property
        const pass = r.status === 'pass'
        if (pass) rank += 1
        const top = pass && rank === 1
        const fail = r.checks.find((c) => !c.pass)
        const step = p.entrances.find((e) => e.stepFree)
        const lo = Math.round((r.cost * (1 - PLANNING.costSpread)) / 1000)
        const hi = Math.round((r.cost * (1 + PLANNING.costSpread)) / 1000)
        return (
          <motion.li key={p.id} layout transition={{ layout: { duration: 0.6, ease: [0.65, 0, 0.35, 1] } }}>
            <div
              role="button"
              tabIndex={0}
              className={`card is-${r.status}${selected === p.id ? ' is-selected' : ''}${top ? ' is-top' : ''}${changed.has(p.id) ? ' is-changed' : ''}`}
              onClick={() => onSelect(p.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(p.id))}
              aria-pressed={selected === p.id}
            >
              <div className="card-head">
                <span className={`card-rank${pass ? '' : ' is-out'}`} aria-hidden="true">
                  {pass ? rank : '×'}
                </span>
                <div className="card-name">
                  <span className="title">{p.name}</span>
                  <span className="label">
                    {p.area} · {p.use}
                  </span>
                </div>
                {pass && (
                  <span className="card-score" title="Fit score from the four bars below">
                    <NumberFlow value={r.score} />
                    <span className="label">fit</span>
                  </span>
                )}
              </div>

              {top && (
                <p className="card-verdict">
                  Fits {people} people · est. <NumberFlow value={r.cost / 1000} prefix="$" suffix="k" />{' '}
                  <span className="card-range">
                    (${lo}k to ${hi}k)
                  </span>{' '}
                  · step free via {step ? step.name.toLowerCase() : 'main entrance'} <Cites ids={['A3', step?.ev ?? 'U3']} />
                </p>
              )}

              {pass ? (
                <div className="bars">
                  {BARS.map((b) => (
                    <div key={b.key} className="bar">
                      <span className="label">{b.label}</span>
                      <span className="bar-track">
                        <motion.span className="bar-fill" animate={{ width: `${Math.round(r.parts[b.key] * 100)}%` }} transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }} />
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                fail && (
                  <div className="reject">
                    <span className="label reject-rule">{r.status === 'rejected' ? 'Set aside by you' : `Fails · ${fail.label}`}</span>
                    {r.status !== 'rejected' && (
                      <dl className="reject-grid">
                        <dt className="label">Required</dt>
                        <dd>{fail.required}</dd>
                        <dt className="label">Evidence shows</dt>
                        <dd>
                          {fail.observed} <Cites ids={fail.ev.filter((e) => e !== 'U3' && e !== 'U4')} />
                        </dd>
                      </dl>
                    )}
                  </div>
                )
              )}
            </div>
          </motion.li>
        )
      })}
    </ul>
  )
}

export function TaskList({ result }: { result: Result }) {
  return (
    <div className="tasks">
      <div className="tasks-head">
        <span className="label">Adaptation work · planning ranges</span>
        <Cite id="A3" />
      </div>
      <ul>
        {result.property.tasks.map((t) => {
          const dropped = result.dropped.includes(t)
          return (
            <motion.li key={t.id} layout className={`task${dropped ? ' is-dropped' : ''}${t.core ? ' is-core' : ''}`}>
              <span className="task-name">
                {t.name} {t.core && <span className="label task-core">core</span>} <Cite id={t.ev} />
              </span>
              <span className="task-cost">
                ${Math.round((t.cost * 0.8) / 1000)}k to ${Math.round((t.cost * 1.2) / 1000)}k
              </span>
            </motion.li>
          )
        })}
      </ul>
      <div className="tasks-total">
        <span className="label">Selected work, est.</span>
        <span className="task-sum">
          <NumberFlow value={result.cost} prefix="$" format={{ maximumFractionDigits: 0 }} />
        </span>
      </div>
    </div>
  )
}
