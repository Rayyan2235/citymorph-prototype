import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import NumberFlow from '@number-flow/react'
import { AlertTriangle, ArrowRight, Minus, Plus, X } from 'lucide-react'
import { FACILITIES, PLANNING, type FacilityId } from '../data/config'
import type { Request, Result } from '../logic/evaluate'
import type { Variant } from '../logic/layout'
import { IsoPlan, seatCount, seatedAt } from './IsoPlan'
import { BUDGET_MAX, BUDGET_MIN, CostBar, WorkList } from './Replan'
import { ScoreBars } from './Shortlist'
import { Cites } from './Cite'
import { AERIAL_CREDIT } from './AerialFrame'

const k = (n: number) => `$${Math.round(n / 1000)}k`

interface Props {
  result: Result
  results: Result[]
  req: Request
  budget: number // slider position; req.budget is the committed value
  setBudget: (n: number) => void
  commitBudget: () => void
  setReq: (patch: Partial<Omit<Request, 'opts'>> & { opts?: Partial<Request['opts']> }) => void
  onSwitch: (id: string) => void
  playKey: string
  over: boolean
  was: { name: string; cost: number } | null
  note?: { agent: string; text: string; tone?: string } | null
}

export function Studio({ result, results, req, budget, setBudget, commitBudget, setReq, onSwitch, playKey, over, was, note }: Props) {
  const p = result.property
  const f = FACILITIES[req.facility]
  const plan = result.plan
  const [t, setT] = useState(0)
  const [scrub, setScrub] = useState<number | null>(null)
  const [room, setRoom] = useState<string | null>(null)
  const [tab, setTab] = useState<'design' | 'cost' | 'score'>('design')
  useEffect(() => {
    setScrub(null)
    setRoom(null)
  }, [playKey, p.id])
  const picked = plan.zones.find((z) => z.id === room) ?? null
  const people = seatCount(plan)
  const lo = Math.round((result.cost * (1 - PLANNING.costSpread)) / 1000)
  const hi = Math.round((result.cost * (1 + PLANNING.costSpread)) / 1000)
  const changed = was !== null && was.cost !== result.cost
  const passes = results.filter((r) => r.status === 'pass')
  const bestOther = passes.find((r) => r.property.id !== p.id)
  const failed = result.checks.filter((c) => !c.pass)

  // Fixes the user can apply in one click, computed from the evaluator.
  const actions: { label: string; run: () => void }[] = []
  if (failed.some((c) => c.id === 'space') && result.maxCapacity && result.maxCapacity !== req.capacity) actions.push({ label: `Set capacity to ${result.maxCapacity}`, run: () => setReq({ capacity: result.maxCapacity }) })
  if (failed.some((c) => c.id === 'budget') && result.coreCost <= BUDGET_MAX) {
    const nb = Math.ceil(result.coreCost / 5000) * 5000
    actions.push({ label: `Raise budget to ${k(nb)}`, run: () => (setBudget(nb), setReq({ budget: nb })) })
  }
  if (failed.some((c) => c.id === 'outdoor') && !f.needsOutdoor) actions.push({ label: 'Drop the playground', run: () => setReq({ opts: { outdoorPlay: false } }) })
  if (failed.length && bestOther) actions.push({ label: `Switch to ${bestOther.property.name}`, run: () => onSwitch(bestOther.property.id) })

  const roomNotes = (id: string) => {
    const z = plan.zones.find((x) => x.id === id)!
    const notes: string[] = []
    if (z.kind === 'reception' && plan.door) notes.push(`Opens onto the ${plan.door.name.toLowerCase()}`)
    if (z.kind === 'primary') notes.push('On the step free route from the door')
    if (z.target && z.sqft < z.target * 0.95) notes.push(`Smaller than the ${z.target} sq ft the program asked for`)
    if (z.seats) notes.push(`${z.seats} ${req.facility === 'clinic' ? 'people at a time' : f.noun}`)
    return notes
  }

  return (
    <div className="studio">
      <header className="st-head">
        <div>
          <span className="plan-name">{p.name}</span>
          <span className="mono-label plan-sub">
            {p.area} · {p.use} · {p.vacancy} <Cites ids={[`${p.id}:listing`, `${p.id}:osm`]} />
          </span>
          {note && (
            <motion.span key={note.text} className={`st-note${note.tone ? ` is-${note.tone}` : ''}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
              <span className="mono-label">{note.agent}</span> {note.text}
            </motion.span>
          )}
        </div>
        <div className="st-tabs" role="tablist" aria-label="Facility type">
          {(Object.keys(FACILITIES) as FacilityId[]).map((id) => (
            <button key={id} type="button" role="tab" aria-selected={req.facility === id} className={`seg${req.facility === id ? ' is-on' : ''}`} onClick={() => setReq({ facility: id, capacity: FACILITIES[id].capacity.default, budget: FACILITIES[id].budget })}>
              {FACILITIES[id].label}
            </button>
          ))}
        </div>
      </header>

      <div className="st-body">
        <div className="st-canvas">
          <div className="st-canvas-top">
            <div className="seg-group" role="radiogroup" aria-label="Layout option">
              {(['A', 'B'] as Variant[]).map((v) => (
                <button key={v} type="button" role="radio" aria-checked={req.variant === v} className={`seg${req.variant === v ? ' is-on' : ''}`} onClick={() => setReq({ variant: v })}>
                  {v === 'A' ? 'Main rooms by the door' : 'Main rooms at the back'}
                </button>
              ))}
            </div>
            <span className="mono-label tag-concept">Concept · interior simulated</span>
          </div>
          <IsoPlan
            key={p.id}
            plan={plan}
            name={p.name}
            playKey={playKey}
            over={over}
            onT={setT}
            scrub={scrub}
            interactive
            room={room}
            onRoom={setRoom}
            corner={
              <>
                {changed && (
                  <span className="mono-label iso-was">
                    {was!.name === p.name ? 'Was' : was!.name} <s>{k(was!.cost)}</s>
                    {was!.name === p.name ? ', now' : `, now ${p.name}`}
                  </span>
                )}
                <span className={`iso-cost${changed ? ' is-changed' : ''}`}>
                  <NumberFlow value={Math.round(result.cost / 1000)} prefix="$" suffix="k" />
                </span>
                <span className="mono-label" aria-live="polite">
                  Est. work · {seatedAt(t, people)} of {people} {req.facility === 'clinic' ? 'people at a time' : f.noun}
                </span>
              </>
            }
          />
          <AnimatePresence>
            {picked && (
              <motion.div className="hotspot float" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.25 }} role="dialog" aria-label={picked.name}>
                <div className="hs-head">
                  <span className="hs-name">{picked.name}</span>
                  <button type="button" className="icon-btn is-square" onClick={() => setRoom(null)} aria-label="Close room details">
                    <X size={13} strokeWidth={1.8} />
                  </button>
                </div>
                <span className="mono-label">
                  ≈ {picked.sqft.toLocaleString('en-US')} sq ft <Cites ids={['P1']} />
                </span>
                <p className="hs-purpose">{picked.purpose}</p>
                <ul className="hs-notes">
                  {roomNotes(picked.id).map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="scrub">
            <span className={`mono-label${t < 0.5 ? ' is-on' : ''}`}>Today</span>
            <input className="range" type="range" min={0} max={1} step={0.001} value={t} style={{ ['--fill' as string]: `${t * 100}%` }} onChange={(e) => setScrub(Number(e.target.value))} aria-label="Morph from today to proposed" />
            <span className={`mono-label${t >= 0.5 ? ' is-on' : ''}`}>Proposed</span>
          </div>
          <p className="fig mono-label">Fig 04 · Footprint from OpenStreetMap · rooms generated from the program · click a room · scroll to zoom · {AERIAL_CREDIT}</p>
        </div>

        <aside className="st-side">
          <div className="seg-group st-side-tabs" role="tablist" aria-label="Studio panel">
            {(['design', 'cost', 'score'] as const).map((id) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={`seg${tab === id ? ' is-on' : ''}`} onClick={() => setTab(id)}>
                {id === 'design' ? 'Design' : id === 'cost' ? 'Economics' : 'Ranking'}
              </button>
            ))}
          </div>

          {tab === 'design' && (
            <div className="st-controls">
              <div className="ctl">
                <span className="mono-label">Capacity</span>
                <div className="stepper-ctl">
                  <button type="button" className="icon-btn is-square" disabled={req.capacity <= f.capacity.min} onClick={() => setReq({ capacity: req.capacity - f.capacity.step })} aria-label="Fewer">
                    <Minus size={14} strokeWidth={1.8} />
                  </button>
                  <span className="ctl-value">
                    <NumberFlow value={req.capacity} /> <span className="ctl-unit">{f.noun}</span>
                  </span>
                  <button type="button" className="icon-btn is-square" disabled={req.capacity >= f.capacity.max} onClick={() => setReq({ capacity: req.capacity + f.capacity.step })} aria-label="More">
                    <Plus size={14} strokeWidth={1.8} />
                  </button>
                </div>
              </div>
              <label className="ctl ctl-switch">
                <span>
                  Outdoor playground
                  <span className="mono-label">{f.needsOutdoor ? 'Required for childcare' : `${f.outdoorPerSeat || 40} sq ft per ${f.noun === 'people' ? 'person' : 'seat'}`}</span>
                </span>
                <input type="checkbox" role="switch" checked={f.needsOutdoor || req.opts.outdoorPlay} disabled={f.needsOutdoor} onChange={(e) => setReq({ opts: { outdoorPlay: e.target.checked } })} />
              </label>
              <label className="ctl ctl-switch">
                <span>
                  Wheelchair access first
                  <span className="mono-label">Wider hall, larger restrooms</span>
                </span>
                <input type="checkbox" role="switch" checked={req.opts.accessFirst} onChange={(e) => setReq({ opts: { accessFirst: e.target.checked } })} />
              </label>
              <div className="ctl">
                <span className="ctl-row">
                  <label htmlFor="budget" className="mono-label">
                    Budget
                  </label>
                  <span className="ctl-value">
                    <NumberFlow value={budget} prefix="$" format={{ maximumFractionDigits: 0 }} />
                  </span>
                </span>
                <input id="budget" className="range" type="range" min={BUDGET_MIN} max={BUDGET_MAX} step={5000} value={budget} style={{ ['--fill' as string]: `${((budget - BUDGET_MIN) / (BUDGET_MAX - BUDGET_MIN)) * 100}%` }} onChange={(e) => setBudget(Number(e.target.value))} onPointerUp={commitBudget} onKeyUp={commitBudget} onTouchEnd={commitBudget} aria-valuetext={`$${budget.toLocaleString('en-US')}`} />
              </div>

              <div className="conflicts" aria-live="polite">
                {result.conflicts.length === 0 && <p className="mono-label cf-ok">Every rule passes · no conflicts</p>}
                {result.conflicts.map((c, i) => (
                  <div key={i} className={`cf${c.check === 'warn' ? ' is-warn' : ' is-fail'}`}>
                    {c.check !== 'warn' && <AlertTriangle size={14} strokeWidth={1.8} />}
                    <span>
                      {c.text}
                      {c.suggest && <span className="cf-suggest"> {c.suggest}</span>}
                    </span>
                  </div>
                ))}
                {actions.length > 0 && (
                  <div className="cf-actions">
                    {actions.map((a) => (
                      <button key={a.label} type="button" className="btn-chip" onClick={a.run}>
                        {a.label} <ArrowRight size={13} strokeWidth={1.8} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === 'cost' && (
            <div className="st-econ">
              <dl className="stats is-tight">
                <div>
                  <dt className="mono-label">Cost range</dt>
                  <dd>
                    <span className="stat-text">
                      ${lo}k to ${hi}k
                    </span>
                    <Cites ids={['A3']} />
                  </dd>
                </div>
                <div>
                  <dt className="mono-label">Per {req.facility === 'clinic' ? 'daily visit' : f.noun === 'people' ? 'person' : 'child'}</dt>
                  <dd>
                    <span className="stat-text">{k(result.cost / Math.max(1, plan.achieved))}</span>
                  </dd>
                </div>
                <div>
                  <dt className="mono-label">New build</dt>
                  <dd>
                    <span className="stat-text">{k(f.newBuildPerSqft * plan.needSqft)}</span>
                    <Cites ids={['I1']} />
                  </dd>
                </div>
              </dl>
              <CostBar tasks={result.tasks} selected={result.selected} budget={budget} />
              <WorkList tasks={result.tasks} selected={result.selected} />
            </div>
          )}

          {tab === 'score' && (
            <div className="st-score">
              <ScoreBars criteria={result.criteria} />
              <ol className="rank">
                {results.map((r) => {
                  const pass = r.status === 'pass'
                  return (
                    <li key={r.property.id} className={`rank-row is-${r.status}${r.property.id === p.id ? ' is-selected' : ''}`}>
                      <button type="button" onClick={() => onSwitch(r.property.id)}>
                        <span className="rank-n">{pass ? passes.indexOf(r) + 1 : '×'}</span>
                        <span className="rank-name">{r.property.name}</span>
                        <span className="mono-label rank-cost">{pass ? `Fit ${r.score} · ${k(r.cost)}` : r.checks.find((c) => !c.pass)?.fail}</span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
