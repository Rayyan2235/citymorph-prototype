import { createRef, useContext, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Accessibility, Check, ChevronDown, Landmark, Layers, Ruler, Trees, Wallet, Waves, X, Zap, type LucideIcon } from 'lucide-react'
import type { SourceKind } from '../data/evidence'
import type { BudgetStep, CheckId, Criterion, Result } from '../logic/evaluate'
import { Aerial } from './AerialFrame'
import { Beam, type BeamPulse } from './Beam'
import { Cites, EvidenceContext, SOURCE_ICON } from './Cite'

// Cell (row i, rule j) appears at this time in check mode. The beams and the
// agent log use the same clock, so a pulse lands as its cell is checked.
const BASE = 0.8
export const cellAt = (i: number, j: number) => BASE + i * 0.55 + j * 0.1
const BEAM_S = 0.9

const SOURCE_SHORT: Record<SourceKind, string> = { user: 'You', osm: 'OSM', census: 'Census', fema: 'FEMA', costar: 'Listing', matterport: 'Scan', vexcel: 'Aerial', assumption: 'Assumed' }
const SOURCE_ORDER: SourceKind[] = ['user', 'fema', 'osm', 'census', 'costar', 'matterport', 'vexcel', 'assumption']

export const RULE_META: Record<CheckId, { label: string; icon: LucideIcon }> = {
  access: { label: 'Step free', icon: Accessibility },
  space: { label: 'Space', icon: Ruler },
  level: { label: 'One level', icon: Layers },
  budget: { label: 'Budget', icon: Wallet },
  zoning: { label: 'Zoning', icon: Landmark },
  outdoor: { label: 'Outdoor', icon: Trees },
  flood: { label: 'Flood', icon: Waves },
  power: { label: 'Cooling', icon: Zap },
}
const RULE_ORDER: CheckId[] = ['access', 'space', 'level', 'flood', 'power', 'budget', 'zoning', 'outdoor']
export const rulesOf = (rows: Result[]) => RULE_ORDER.filter((id) => rows.some((r) => r.checks.some((c) => c.id === id)))

const k = (n: number) => `$${Math.round(n / 1000)}k`

// Which source kinds each rule read, from the evaluator's evidence ids. Only
// failing cells pulse, and the wires behind a failure stay drawn.
function useEdges(rows: Result[], rules: CheckId[]) {
  const { byId } = useContext(EvidenceContext)
  return useMemo(() => {
    const edges: { kind: SourceKind; rule: CheckId; pulses: BeamPulse[]; failed: boolean }[] = []
    rules.forEach((rule, j) => {
      const kinds = new Map<SourceKind, BeamPulse[]>()
      rows.forEach((r, i) => {
        const c = r.checks.find((x) => x.id === rule)
        if (!c) return
        for (const id of c.ev) {
          const kind = byId[id]?.kind
          if (!kind) continue
          const list = kinds.get(kind) ?? []
          if (!c.pass && kind !== 'user') list.push({ at: Math.max(0, cellAt(i, j) - BEAM_S * 0.85), tone: 'ink' })
          kinds.set(kind, list)
        }
      })
      for (const [kind, pulses] of kinds) edges.push({ kind, rule, pulses, failed: pulses.length > 0 })
    })
    return { edges, sources: SOURCE_ORDER.filter((s) => edges.some((e) => e.kind === s)) }
  }, [rows, rules, byId])
}

function RuleHead({ rows, rules }: { rows: Result[]; rules: CheckId[] }) {
  const { edges, sources } = useEdges(rows, rules)
  const head = useRef<HTMLDivElement>(null)
  const srcRefs = useMemo(() => Object.fromEntries(SOURCE_ORDER.map((s) => [s, createRef<HTMLSpanElement>()])) as Record<SourceKind, RefObject<HTMLSpanElement | null>>, [])
  const ruleRefs = useMemo(() => Object.fromEntries(RULE_ORDER.map((r) => [r, createRef<HTMLSpanElement>()])) as Record<CheckId, RefObject<HTMLSpanElement | null>>, [])
  const [hot, setHot] = useState<{ kind?: SourceKind; rule?: CheckId } | null>(null)
  return (
    <div className="sl-head" ref={head} style={{ ['--rules' as string]: rules.length }}>
      <span className="sl-sources">
        <span className="mono-label sl-sources-label">Reads</span>
        {sources.map((s) => {
          const Icon = SOURCE_ICON[s]
          return (
            <span key={s} ref={srcRefs[s]} className={`sl-src sl-src-${s}${hot?.kind === s ? ' is-hot' : ''}`} onMouseEnter={() => setHot({ kind: s })} onMouseLeave={() => setHot(null)}>
              <Icon size={12} strokeWidth={1.8} aria-hidden="true" />
              {SOURCE_SHORT[s]}
            </span>
          )
        })}
      </span>
      {rules.map((id, j) => {
        const R = RULE_META[id]
        return (
          <span key={id} ref={ruleRefs[id]} style={{ gridColumn: 3 + j, gridRow: 2 }} className={`sl-rule${hot?.rule === id ? ' is-hot' : ''}`} onMouseEnter={() => setHot({ rule: id })} onMouseLeave={() => setHot(null)}>
            <R.icon size={15} strokeWidth={1.6} aria-hidden="true" />
            <span className="mono-label">{R.label}</span>
          </span>
        )
      })}
      {edges.map((e) => (
        <Beam key={e.kind + e.rule} containerRef={head} fromRef={srcRefs[e.kind]} toRef={ruleRefs[e.rule]} fromAnchor="bottom" toAnchor="top" vertical pulses={e.pulses} duration={BEAM_S} active={!!hot && (hot.kind === e.kind || hot.rule === e.rule)} shown={e.failed} />
      ))}
    </div>
  )
}

// The explainable score: each criterion's value, weight and why.
export function ScoreBars({ criteria, compact = false }: { criteria: Criterion[]; compact?: boolean }) {
  return (
    <ul className={`bars${compact ? ' is-compact' : ''}`}>
      {!compact && (
        <li className="bars-key">
          Points earned out of what each item is worth. They add up to the fit score of {criteria.reduce((t, c) => t + c.points, 0)}.
        </li>
      )}
      {criteria.map((c) => (
        <li key={c.id}>
          <span className="bars-label">{c.label}</span>
          <span className="bars-track" title={`${c.points} of ${Math.round(c.weight * 100)} points`}>
            <motion.span className="bars-fill" initial={{ width: 0 }} animate={{ width: `${c.value * 100}%` }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
          </span>
          {!compact && (
            <span className="bars-w" title={`Earned ${c.points} of the ${Math.round(c.weight * 100)} points this item is worth`}>
              <b>{c.points}</b>/{Math.round(c.weight * 100)}
            </span>
          )}
          {!compact && (
            <span className="bars-note">
              {c.note} <Cites ids={c.ev} />
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

// What puts a building above the next one: the criteria with the biggest
// weighted lead, in words.
export function whyAbove(a: Result, b: Result) {
  const leads = a.criteria
    .map((c) => ({ c, d: (c.value - (b.criteria.find((x) => x.id === c.id)?.value ?? 0)) * c.weight }))
    .filter((x) => x.d > 0.004)
    .sort((x, y) => y.d - x.d)
    .slice(0, 2)
    .map((x) => x.c.label.toLowerCase())
  return leads.length ? `Ahead of ${b.property.name} on ${leads.join(' and ')}` : `Close to ${b.property.name}`
}

interface Props {
  results: Result[]
  order: string[]
  shown: string[]
  mode: 'find' | 'check'
  ranked: boolean
  selected: string | null
  onSelect: (id: string) => void
  compare: string[]
  onCompare: (id: string) => void
}

export function Shortlist({ results, order, shown, mode, ranked, selected, onSelect, compare, onCompare }: Props) {
  const byId = Object.fromEntries(results.map((r) => [r.property.id, r]))
  const inspection = order.filter((id) => shown.includes(id)).map((id) => byId[id]).filter(Boolean)
  const rules = rulesOf(inspection)
  const passes = results.filter((r) => r.status === 'pass' && shown.includes(r.property.id))
  const rows = mode === 'check' && ranked ? [...passes, ...results.filter((r) => r.status === 'fail' && shown.includes(r.property.id))] : inspection
  const [open, setOpen] = useState<string | null>(null)
  const firstFail = rows.findIndex((r) => r.status === 'fail')
  const listRef = useRef<HTMLUListElement>(null)
  // Picking a building on the map opens its analysis here and scrolls to it.
  useEffect(() => {
    if (!selected) return
    if (mode === 'check' && ranked) setOpen(selected)
    listRef.current?.querySelector(`[data-id="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected, mode, ranked])

  return (
    <div className={`shortlist is-${mode}${ranked ? ' is-ranked' : ''}`} style={{ ['--rules' as string]: rules.length }}>
      {mode === 'check' && <RuleHead rows={inspection} rules={rules} />}
      <ul ref={listRef}>
        {rows.map((r, idx) => {
          const p = r.property
          const i = inspection.indexOf(r)
          const pass = r.status === 'pass'
          const rank = passes.indexOf(r) + 1
          const fails = r.checks.filter((c) => !c.pass)
          const next = pass ? passes[rank] ?? passes[rank - 2] : null
          const isOpen = open === p.id && pass
          return (
            <motion.li
              key={p.id}
              layout
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], layout: { duration: 0.7, ease: [0.65, 0, 0.35, 1] } }}
              className={`sl-row${mode === 'check' ? ` is-${r.status}` : ''}${selected === p.id ? ' is-selected' : ''}${mode === 'check' && ranked && idx === firstFail ? ' is-first-out' : ''}`}
              style={{ ['--d' as string]: `${cellAt(i, rules.length)}s` }}
              data-id={p.id}
            >
              {mode === 'check' && ranked && idx === firstFail && <span className="mono-label sl-divider">Rejected · checked and set aside</span>}
              <div className="sl-main-wrap">
                <button type="button" className="sl-main" onClick={() => onSelect(p.id)} aria-pressed={selected === p.id}>
                  <Aerial lngLat={p.lngLat} name={p.name} z={18} className="sl-thumb" target={false} />
                  <span className="sl-name">
                    <span className="sl-title">{p.name}</span>
                    <span className="mono-label">
                      {p.area}
                      {mode === 'find' && ` · ${p.sqft.toLocaleString('en-US')} sq ft`}
                    </span>
                  </span>
                  {mode === 'find' && (
                    <span className="sl-use">
                      <span className="sl-use-text">{p.use}</span>
                      <span className="mono-label sl-vacancy">{p.vacancy}</span>
                      <Cites ids={[`${p.id}:osm`, `${p.id}:listing`]} />
                    </span>
                  )}
                  {mode === 'check' &&
                    rules.map((id, j) => {
                      const c = r.checks.find((x) => x.id === id)
                      if (!c) return <span key={id} className="sl-slot" />
                      return (
                        <span key={id} className="sl-slot">
                          <motion.span className="sl-dash" aria-hidden="true" initial={{ opacity: 1 }} animate={{ opacity: 0 }} transition={{ delay: cellAt(i, j), duration: 0.12 }} />
                          <motion.span className={`sl-cell${c.pass ? ' is-pass' : ' is-fail'}`} initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: cellAt(i, j), duration: 0.35, ease: [0.16, 1, 0.3, 1] }} title={`${RULE_META[id].label}: ${c.observed}`}>
                            {c.pass ? <Check size={15} strokeWidth={2.2} aria-label="passes" /> : <X size={15} strokeWidth={2.2} aria-label="fails" />}
                          </motion.span>
                        </span>
                      )
                    })}
                  {mode === 'check' && (
                    <motion.span className="sl-verdict" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: cellAt(i, rules.length), duration: 0.3 }}>
                      {pass ? (
                        <>
                          <span className="sl-rank">{ranked ? `#${rank}` : 'Pass'}</span>
                          <span className="mono-label">Fit {r.score}</span>
                          <span className="mono-label">{k(r.cost)}</span>
                        </>
                      ) : (
                        <span className="mono-label sl-out">Rejected</span>
                      )}
                    </motion.span>
                  )}
                </button>
              </div>
              {mode === 'check' && pass && ranked && (
                <div className="sl-foot">
                  <p className="sl-reason">{!next ? 'The only building that passes' : rank === 1 ? whyAbove(r, next) : `Behind ${passes[rank - 2].property.name}: ${whyAbove(passes[rank - 2], r).replace(/^Ahead of .*? on /, 'it leads on ')}`}</p>
                  <span className="sl-tools">
                    <label className="sl-compare" title="Compare side by side">
                      <input type="checkbox" checked={compare.includes(p.id)} onChange={() => onCompare(p.id)} />
                      <span className="mono-label">Compare</span>
                    </label>
                    <button type="button" className={`sl-more${isOpen ? ' is-open' : ''}`} onClick={() => setOpen(isOpen ? null : p.id)} aria-expanded={isOpen} aria-label={`Score breakdown for ${p.name}`}>
                      <ChevronDown size={14} strokeWidth={1.8} />
                    </button>
                  </span>
                </div>
              )}
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div className="sl-bars" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
                    <ScoreBars criteria={r.criteria} />
                  </motion.div>
                )}
              </AnimatePresence>
              {/* one line per failed rule, so every ink wire points at a reason */}
              {mode === 'check' &&
                fails.map((f, n) => (
                  <motion.p key={f.id} className="sl-why" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ delay: cellAt(i, rules.length) + 0.05 + n * 0.15, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
                    <span className="mono-label">{f.fail}</span> {f.observed}
                    <Cites ids={f.ev.filter((e) => !e.startsWith('U'))} />
                  </motion.p>
                ))}
            </motion.li>
          )
        })}
      </ul>
    </div>
  )
}

// Two buildings side by side, criterion by criterion.
export function ComparePanel({ a, b, onClose, rankOf }: { a: Result; b: Result; onClose: () => void; rankOf: (id: string) => number }) {
  const [x, y] = rankOf(a.property.id) <= rankOf(b.property.id) ? [a, b] : [b, a]
  return (
    <motion.section className="compare float" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} aria-label="Compare two buildings">
      <div className="cmp-head">
        <span className="mono-label">Compare</span>
        <button type="button" className="icon-btn is-square" onClick={onClose} aria-label="Close compare">
          <X size={14} strokeWidth={1.8} />
        </button>
      </div>
      <div className="cmp-grid">
        <span />
        {[x, y].map((r) => (
          <span key={r.property.id} className="cmp-name">
            <span className="cmp-rank">#{rankOf(r.property.id)}</span> {r.property.name}
            <span className="mono-label">
              Fit {r.score} · {k(r.cost)}
            </span>
          </span>
        ))}
        {x.criteria.map((c) => {
          const other = y.criteria.find((o) => o.id === c.id)!
          return (
            <div key={c.id} className="cmp-row">
              <span className="cmp-label">{c.label}</span>
              {[c, other].map((v, n) => (
                <span key={n} className="cmp-cell">
                  <span className="cmp-track">
                    <span className="cmp-fill" style={{ width: `${v.value * 100}%` }} />
                  </span>
                  <span className="cmp-note">{v.note}</span>
                </span>
              ))}
            </div>
          )
        })}
      </div>
      <p className="cmp-why">{whyAbove(x, y)}.</p>
    </motion.section>
  )
}

// The mentor's ask: if a bit more money buys a much safer building, say so.
export function BudgetStepCard({ step, onApply }: { step: BudgetStep; onApply: () => void }) {
  return (
    <motion.div className="bstep" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
      <span className="mono-label">Worth stretching the budget?</span>
      <p className="bstep-line">
        <b>+{k(step.extra)}</b> (to {k(step.budget)}) gets <b>{step.name}</b>: fit <b>{step.to.score}</b>
        {step.from ? ` instead of ${step.from.score} at ${step.from.name}` : ''}
        {step.to.evac !== null && step.from?.evac != null ? `, night evacuation ${step.to.evac} min instead of ${step.from.evac}` : ''}.
      </p>
      {step.reasons.length > 0 && (
        <ul className="bstep-why">
          {step.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <button type="button" className="btn-chip" onClick={onApply}>
        Set budget to {k(step.budget)}
      </button>
    </motion.div>
  )
}