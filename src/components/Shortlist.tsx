import { createRef, useContext, useMemo, useRef, useState, type RefObject } from 'react'
import { motion } from 'motion/react'
import { Accessibility, Check, Layers, Ruler, Wallet, X, type LucideIcon } from 'lucide-react'
import type { PropertyId, SourceKind } from '../data/demo'
import type { CheckId, Result } from '../logic/evaluate'
import { Aerial } from './AerialFrame'
import { Beam, type BeamPulse } from './Beam'
import { Cites, EvidenceContext, SOURCE_ICON } from './Cite'

// Cell (row i, rule j) appears at this time in check mode. The beams use the
// same clock, so a pulse lands on the rule just as its cells are checked.
const BASE = 0.8
const cellAt = (i: number, j: number) => BASE + i * 0.35 + j * 0.12
const BEAM_S = 0.9

const SOURCE_SHORT: Record<SourceKind, string> = {
  user: 'You',
  costar: 'CoStar',
  matterport: 'Scan',
  vexcel: 'Aerial',
  assumption: 'Assumed',
}
const SOURCE_ORDER: SourceKind[] = ['user', 'costar', 'matterport', 'vexcel', 'assumption']

export const RULES: { id: CheckId; label: string; icon: LucideIcon }[] = [
  { id: 'access', label: 'Step free', icon: Accessibility },
  { id: 'space', label: 'Space', icon: Ruler },
  { id: 'level', label: 'One level', icon: Layers },
  { id: 'budget', label: 'Budget', icon: Wallet },
]

interface Props {
  results: Result[]
  shown: PropertyId[]
  mode: 'find' | 'check'
  selected: PropertyId | null
  onSelect: (id: PropertyId) => void
}

const k = (n: number) => `$${Math.round(n / 1000)}k`

// Step 2 lists the buildings as they are found; step 3 turns the same rows
// into a rule grid. Rows keep their place so the eye can follow them.
// One reason per rank, from the evaluator's numbers: what this building has
// that the one it is compared with does not.
function reasonFor(r: Result, passes: Result[]) {
  const i = passes.indexOf(r)
  if (i < 0 || passes.length < 2) return null
  const other = i === 0 ? passes[1] : passes[0]
  const room = Math.round((r.usable - other.usable) / 10) * 10
  const cost = Math.round((other.cost - r.cost) / 1000)
  const parts: string[] = []
  if (room > 0) parts.push(`+${room.toLocaleString('en-US')} sq ft more room`)
  if (room < 0) parts.push(`${(-room).toLocaleString('en-US')} sq ft less room`)
  if (cost > 0) parts.push(`$${cost}k cheaper`)
  if (cost < 0) parts.push(`$${-cost}k more work`)
  return `${parts.join(' · ')} than #${i === 0 ? 2 : 1}`
}

// Which source kinds each rule actually read, taken from the evaluator's
// evidence ids, plus one pulse per checked cell (ink when that cell failed).
function useEdges(rows: Result[]) {
  const { byId } = useContext(EvidenceContext)
  return useMemo(() => {
    const edges: { kind: SourceKind; rule: CheckId; j: number; pulses: BeamPulse[] }[] = []
    RULES.forEach((rule, j) => {
      const kinds = new Map<SourceKind, BeamPulse[]>()
      rows.forEach((r, i) => {
        const c = r.checks.find((x) => x.id === rule.id)!
        for (const id of c.ev) {
          const kind = byId[id]?.kind
          if (!kind) continue
          const list = kinds.get(kind) ?? []
          list.push({ at: Math.max(0, cellAt(i, j) - BEAM_S * 0.85), tone: c.pass ? 'accent' : 'ink' })
          kinds.set(kind, list)
        }
      })
      for (const [kind, pulses] of kinds) edges.push({ kind, rule: rule.id, j, pulses })
    })
    const sources = SOURCE_ORDER.filter((k) => edges.some((e) => e.kind === k))
    return { edges, sources }
  }, [rows, byId])
}

function RuleHead({ rows }: { rows: Result[] }) {
  const { edges, sources } = useEdges(rows)
  const head = useRef<HTMLDivElement>(null)
  const srcRefs = useMemo(() => Object.fromEntries(SOURCE_ORDER.map((k) => [k, createRef<HTMLSpanElement>()])) as Record<SourceKind, RefObject<HTMLSpanElement | null>>, [])
  const ruleRefs = useMemo(() => Object.fromEntries(RULES.map((r) => [r.id, createRef<HTMLSpanElement>()])) as Record<CheckId, RefObject<HTMLSpanElement | null>>, [])
  const [hot, setHot] = useState<{ kind?: SourceKind; rule?: CheckId } | null>(null)
  const isHot = (k: SourceKind, r: CheckId) => !!hot && (hot.kind === k || hot.rule === r)
  return (
    <div className="sl-head" ref={head}>
      <span className="sl-sources">
        <span className="mono-label sl-sources-label">Reads</span>
        {sources.map((k) => {
          const Icon = SOURCE_ICON[k]
          return (
            <span
              key={k}
              ref={srcRefs[k]}
              className={`sl-src sl-src-${k}${hot?.kind === k ? ' is-hot' : ''}`}
              onMouseEnter={() => setHot({ kind: k })}
              onMouseLeave={() => setHot(null)}
            >
              <Icon size={12} strokeWidth={1.8} aria-hidden="true" />
              {SOURCE_SHORT[k]}
            </span>
          )
        })}
      </span>
      {RULES.map((r, j) => (
        <span
          key={r.id}
          ref={ruleRefs[r.id]}
          style={{ gridColumn: 3 + j, gridRow: 2 }}
          className={`sl-rule${hot?.rule === r.id ? ' is-hot' : ''}`}
          onMouseEnter={() => setHot({ rule: r.id })}
          onMouseLeave={() => setHot(null)}
          title={`${r.label} reads: ${edges
            .filter((e) => e.rule === r.id)
            .map((e) => SOURCE_SHORT[e.kind])
            .join(', ')}`}
        >
          <r.icon size={15} strokeWidth={1.6} aria-hidden="true" />
          <span className="mono-label">{r.label}</span>
        </span>
      ))}
      {edges.map((e) => (
        <Beam
          key={e.kind + e.rule}
          containerRef={head}
          fromRef={srcRefs[e.kind]}
          toRef={ruleRefs[e.rule]}
          fromAnchor="bottom"
          toAnchor="top"
          vertical
          pulses={e.pulses}
          duration={BEAM_S}
          active={isHot(e.kind, e.rule)}
        />
      ))}
    </div>
  )
}

export function Shortlist({ results, shown, mode, selected, onSelect }: Props) {
  const rows = results.filter((r) => shown.includes(r.property.id))
  const passes = rows.filter((r) => r.status === 'pass')
  let rank = 0
  return (
    <div className={`shortlist is-${mode}`}>
      {mode === 'check' && <RuleHead rows={rows} />}
      <ul>
        {rows.map((r, i) => {
          const p = r.property
          const pass = r.status === 'pass'
          if (pass) rank += 1
          const fail = r.checks.find((c) => !c.pass)
          return (
            <motion.li
              key={p.id}
              layout
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], layout: { duration: 0.6, ease: [0.65, 0, 0.35, 1] } }}
              className={`sl-row is-${r.status}${selected === p.id ? ' is-selected' : ''}`}
            >
              <button type="button" className="sl-main" onClick={() => onSelect(p.id)} aria-pressed={selected === p.id}>
                <Aerial lngLat={p.lngLat} name={p.name} z={18} className="sl-thumb" target={false} />
                <span className="sl-name">
                  <span className="sl-title">{p.name.replace(/ (retail flex|two storey office|single storey office)$/, '')}</span>
                  <span className="mono-label">
                    {p.area}
                    {mode === 'find' && ` · ${p.sqft.toLocaleString('en-US')} sq ft`}
                  </span>
                </span>
                {mode === 'find' && (
                  <span className="sl-use">
                    <span className="sl-use-text">{p.use}</span>
                    <Cites ids={[p.ev[0]]} />
                  </span>
                )}
                {mode === 'check' &&
                  RULES.map((rule, j) => {
                    const c = r.checks.find((x) => x.id === rule.id)!
                    return (
                      <motion.span
                        key={rule.id}
                        className={`sl-cell${c.pass ? ' is-pass' : ' is-fail'}`}
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: cellAt(i, j), duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                        title={`${rule.label}: ${c.observed}`}
                      >
                        {c.pass ? <Check size={15} strokeWidth={2.2} aria-label="passes" /> : <X size={15} strokeWidth={2.2} aria-label="fails" />}
                      </motion.span>
                    )
                  })}
                {mode === 'check' && (
                  <motion.span
                    className="sl-verdict"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: cellAt(i, 4), duration: 0.3 }}
                  >
                    {pass ? (
                      <>
                        <span className="sl-rank">#{rank}</span>
                        <span className="mono-label">{k(r.cost)}</span>
                      </>
                    ) : (
                      <span className="mono-label sl-out">Out</span>
                    )}
                  </motion.span>
                )}
              </button>
              {mode === 'check' && pass && reasonFor(r, passes) && (
                <motion.p
                  className="sl-reason"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: cellAt(i, 4) + 0.05, duration: 0.4 }}
                >
                  {reasonFor(r, passes)}
                </motion.p>
              )}
              {mode === 'check' && fail && (
                <motion.p
                  className="sl-why"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ delay: cellAt(i, 4) + 0.05, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                >
                  <span className="mono-label">{fail.fail}</span> {fail.observed}
                  <Cites ids={fail.ev.filter((e) => !e.startsWith('U'))} />
                </motion.p>
              )}
            </motion.li>
          )
        })}
      </ul>
    </div>
  )
}
