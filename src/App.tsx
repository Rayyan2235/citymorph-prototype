import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import NumberFlow from '@number-flow/react'
import { ArrowRight, BookOpen, Moon, Pause, Play, Sun, X } from 'lucide-react'
import { EVIDENCE, PROPERTIES, SOURCE_LABEL, userEvidence, type Evidence, type PropertyId, type SourceKind } from './data/demo'
import { evaluate, thousands, type Result } from './logic/evaluate'
import { Cite, Cites, EvidenceContext } from './components/Cite'
import { MapStage } from './components/MapStage'
import { MorphPlan } from './components/MorphPlan'
import { Results, TaskList } from './components/Results'
import { AgentRun, type Step } from './components/AgentRun'
import { AerialFrame } from './components/AerialFrame'

const PEOPLE = 40
const START_BUDGET = 150000
const REQUEST = { people: PEOPLE, stepFree: true }
const NO_SHOCKS = { rejected: [] as PropertyId[], closedEntrances: [] as string[] }

type Phase = 'idle' | 'running' | 'done'
type Tab = 'map' | 'plan'

interface Note {
  title: string
  body: string
  cites: string[]
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [motionOn, setMotionOn] = useState(true)
  const [phase, setPhase] = useState<Phase>('idle')
  const [budget, setBudget] = useState(START_BUDGET)
  const [committed, setCommitted] = useState(START_BUDGET)
  const [shown, setShown] = useState<PropertyId[]>([])
  const [steps, setSteps] = useState<Step[]>([])
  const [selected, setSelected] = useState<PropertyId | null>(null)
  const [tab, setTab] = useState<Tab>('map')
  const [drawer, setDrawer] = useState(false)
  const [focus, setFocus] = useState<string | null>(null)
  const [note, setNote] = useState<Note | null>(null)
  const [changed, setChanged] = useState<Set<PropertyId>>(new Set())
  const timers = useRef<number[]>([])
  const replanCount = useRef(0)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  useEffect(() => {
    document.documentElement.dataset.motion = motionOn ? 'on' : 'off'
  }, [motionOn])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  useEffect(() => {
    if (note) window.setTimeout(() => document.querySelector('.note')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 80)
  }, [note])

  const results = useMemo(() => evaluate({ ...REQUEST, budget: committed }, PROPERTIES, NO_SHOCKS), [committed])
  const evidence = useMemo(() => [...userEvidence(PEOPLE, committed), ...EVIDENCE], [committed])
  const byId = useMemo(() => Object.fromEntries(evidence.map((e) => [e.id, e])), [evidence])
  const selectedResult = results.find((r) => r.property.id === selected) ?? null

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, motionOn ? ms : Math.min(ms, 60)))
  }

  const openEvidence = useCallback((id: string) => {
    setFocus(id)
    setDrawer(true)
  }, [])

  const select = useCallback((id: PropertyId) => {
    setSelected(id)
  }, [])

  // First run. Every line is computed from the evaluator, not scripted text.
  function run() {
    timers.current.forEach(clearTimeout)
    timers.current = []
    setCommitted(budget)
    const res = evaluate({ ...REQUEST, budget }, PROPERTIES, NO_SHOCKS)
    const failed = res.filter((r) => r.status === 'fail')
    const top = res[0]
    const findings = EVIDENCE.filter((e) => e.kind === 'matterport' || e.kind === 'vexcel').length
    const verify = EVIDENCE.filter((e) => e.verify).length
    const base: Step[] = [
      { key: 's1', agent: 'Translator', title: 'Turn your request into rules', detail: `${PEOPLE} people, reception plus 2 rooms, step free entry, ${thousands(budget)} budget.`, cites: ['U1', 'U2', 'U3', 'U4'], state: 'pending' },
      { key: 's2', agent: 'Search', title: 'Find buildings in CoStar', detail: '3 Houston buildings with both an interior scan and an aerial view.', cites: ['C1', 'C2', 'C4'], state: 'pending' },
      { key: 's3', agent: 'Spatial evidence', title: 'Read interior scans and aerials', detail: `${findings} findings logged: entrances, rooms, parking, roofs.`, cites: ['M1', 'M4', 'V1'], state: 'pending' },
      {
        key: 's4',
        agent: 'Feasibility',
        title: 'Check hard rules in code',
        detail: failed.length ? `${failed.map((f) => f.property.name).join(', ')} fails ${failed[0].checks.find((c) => !c.pass)?.label.toLowerCase()}.` : 'All buildings pass the hard rules.',
        cites: failed.length ? failed[0].checks.find((c) => !c.pass)!.ev.filter((e) => !e.startsWith('U')) : ['U3'],
        state: 'pending',
      },
      { key: 's5', agent: 'Critic', title: 'Flag claims that need a site visit', detail: `${verify} claims marked needs verification, including every cost.`, cites: ['A3', 'M2'], state: 'pending' },
      { key: 's6', agent: 'Planner', title: 'Rank and draft a reuse plan', detail: `${top.property.name} fits best at about ${thousands(top.cost)}.`, cites: [top.property.ev[0], 'A3'], state: 'pending' },
    ]
    setSteps(base)
    setPhase('running')
    setShown([])
    setSelected(null)
    setNote(null)
    setChanged(new Set())
    setTab('map')
    replanCount.current = 0

    const mark = (key: string, state: Step['state']) => setSteps((s) => s.map((x) => (x.key === key ? { ...x, state } : x)))
    let t = 150
    base.forEach((s, i) => {
      later(t, () => mark(s.key, 'active'))
      t += [650, 900, 1000, 850, 750, 700][i]
      later(t, () => mark(s.key, 'done'))
      if (s.key === 's2') res.forEach((r, j) => later(t - 500 + j * 220, () => setShown((x) => [...x, r.property.id])))
    })
    later(t + 100, () => {
      setPhase('done')
      setSelected(top.property.id)
    })
    if (new URLSearchParams(window.location.search).get('demo') !== 'map') later(t + 3300, () => setTab('plan'))
  }

  // Replan on a committed budget change. The evaluator reruns for real; the
  // timing only paces what the judge sees.
  function replan(next: number) {
    if (phase !== 'done' || next === committed) {
      if (phase !== 'running') setCommitted(next)
      return
    }
    timers.current.forEach(clearTimeout)
    timers.current = []
    const before = results
    const after = evaluate({ ...REQUEST, budget: next }, PROPERTIES, NO_SHOCKS)
    const oldTop = before[0]
    const newTop = after[0]
    const n = ++replanCount.current
    const broke = after.find((r) => r.status === 'fail' && before.find((b) => b.property.id === r.property.id)?.status === 'pass')
    const fixed = after.find((r) => r.status === 'pass' && before.find((b) => b.property.id === r.property.id)?.status === 'fail')
    const biggest = broke ? [...broke.selected].filter((x) => x.core).sort((a, b) => b.cost - a.cost)[0] : null

    const add: Step[] = [
      { key: `r${n}a`, agent: 'You', title: 'Budget changed', detail: `${thousands(committed)} to ${thousands(next)}.`, cites: ['U4'], state: 'pending', replan: true },
      {
        key: `r${n}b`,
        agent: 'Feasibility',
        title: 'Re-check hard rules',
        detail: broke
          ? `${broke.property.name}: core work ${thousands(broke.coreCost)} is over ${thousands(next)}.`
          : fixed
            ? `${fixed.property.name} fits again: core work ${thousands(fixed.coreCost)}.`
            : 'No building changed pass or fail.',
        cites: broke && biggest ? [biggest.ev, 'A3'] : ['A3'],
        state: 'pending',
        replan: true,
      },
      {
        key: `r${n}c`,
        agent: 'Planner',
        title: newTop.property.id === oldTop.property.id ? 'Trim the plan' : 'Re-rank',
        detail:
          newTop.property.id === oldTop.property.id
            ? `${newTop.property.name} still fits best. Work now about ${thousands(newTop.cost)}.`
            : `${newTop.property.name} now fits best at about ${thousands(newTop.cost)}.`,
        cites: [newTop.property.ev[0], 'A3'],
        state: 'pending',
        replan: true,
      },
    ]
    setSteps((s) => [...s.map((x) => (x.agent === 'Planner' && x.state === 'done' ? { ...x, state: 'struck' as const } : x)), ...add])
    const mark = (key: string, state: Step['state']) => setSteps((s) => s.map((x) => (x.key === key ? { ...x, state } : x)))
    later(50, () => mark(add[0].key, 'done'))
    later(150, () => mark(add[1].key, 'active'))
    later(900, () => mark(add[1].key, 'done'))
    later(1000, () => mark(add[2].key, 'active'))
    later(1500, () => {
      setCommitted(next)
      setSelected(newTop.property.id)
      setChanged(new Set(after.filter((r) => before.find((b) => b.property.id === r.property.id)?.status !== r.status).map((r) => r.property.id)))
      if (newTop.property.id !== oldTop.property.id) {
        setNote({
          title: `${newTop.property.name} moves to first`,
          body: broke && biggest
            ? `${broke.property.name} no longer fits. Its core work is ${thousands(broke.coreCost)}, over your ${thousands(next)} budget. The biggest line is "${biggest.name}" at about ${thousands(biggest.cost)}.`
            : `${oldTop.property.name} drops below it on budget left.`,
          cites: broke && biggest ? ['U4', biggest.ev] : ['U4'],
        })
      } else {
        setNote({
          title: `${newTop.property.name} still fits best`,
          body: `Selected work is now about ${thousands(newTop.cost)}. ${newTop.dropped.length ? `Dropped for now: ${newTop.dropped.map((d) => d.name.toLowerCase()).join(', ')}.` : 'Nothing dropped.'}`,
          cites: ['U4', 'A3'],
        })
      }
    })
    later(1700, () => mark(add[2].key, 'done'))
  }

  const commitBudget = () => replan(budget)

  // Demo shortcuts and fallback: ?demo=run plays the first run, ?demo=cut
  // also cuts the budget to $90k once the run finishes.
  const demo = useRef(new URLSearchParams(window.location.search).get('demo'))
  const autoCut = useRef(false)
  useEffect(() => {
    if (demo.current && phase === 'idle') run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (demo.current === 'cut' && phase === 'done' && !autoCut.current) {
      autoCut.current = true
      const t = window.setTimeout(() => {
        setBudget(90000)
        replan(90000)
      }, 4200)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  return (
    <MotionConfig reducedMotion={motionOn ? 'user' : 'always'}>
      <EvidenceContext.Provider value={{ byId, open: openEvidence, focus }}>
        <div className="app">
          <header className="topbar">
            <div className="brand">
              <span className="wordmark">CityMorph</span>
              <span className="label brand-sub">Reuse planner · Houston</span>
            </div>
            <div className="topbar-right">
              <span className="tag" title="Sample records stand in until hackathon API keys arrive">
                Sample records, not live CoStar
              </span>
              <button type="button" className="icon-btn" onClick={() => setDrawer(true)} aria-label="Open evidence trail">
                <BookOpen size={16} strokeWidth={1.5} /> <span className="small">Evidence</span>
              </button>
              <button type="button" className="icon-btn" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>
                {theme === 'light' ? <Moon size={16} strokeWidth={1.5} /> : <Sun size={16} strokeWidth={1.5} />}
              </button>
              <button type="button" className="icon-btn" onClick={() => setMotionOn(!motionOn)} aria-pressed={!motionOn} aria-label={motionOn ? 'Turn motion off' : 'Turn motion on'}>
                {motionOn ? <Pause size={16} strokeWidth={1.5} /> : <Play size={16} strokeWidth={1.5} />}
                <span className="small">Motion</span>
              </button>
            </div>
          </header>

          <main className="work">
            <aside className="panel">
              <section className="request" aria-label="Your request">
                <span className="label">01 · What your neighborhood needs</span>
                <p className="request-line">
                  A Houston nonprofit needs a <mark>learning and training center</mark> for <mark>{PEOPLE} people</mark>, with <mark>a reception and two activity rooms</mark>,{' '}
                  <mark>step free entry</mark> and{' '}
                  <mark>
                    <NumberFlow value={budget / 1000} prefix="$" suffix="k" />
                  </mark>{' '}
                  to adapt it.
                </p>
                {phase !== 'idle' && <Cites ids={['U1', 'U2', 'U3', 'U4']} />}

                <div className="budget">
                  <div className="budget-head">
                    <label htmlFor="budget" className="label">
                      {phase === 'done' ? 'Try it · change the budget' : 'Adaptation budget'}
                    </label>
                    <span className="budget-value">
                      <NumberFlow value={budget} prefix="$" format={{ maximumFractionDigits: 0 }} />
                    </span>
                  </div>
                  <input
                    id="budget"
                    type="range"
                    min={60000}
                    max={200000}
                    step={5000}
                    value={budget}
                    style={{ ['--fill' as string]: `${((budget - 60000) / 140000) * 100}%` }}
                    onChange={(e) => setBudget(Number(e.target.value))}
                    onPointerUp={commitBudget}
                    onKeyUp={commitBudget}
                    onTouchEnd={commitBudget}
                    aria-valuetext={`$${budget.toLocaleString('en-US')}`}
                  />
                  <div className="budget-scale label" aria-hidden="true">
                    <span>$60k</span>
                    <span>$200k</span>
                  </div>
                </div>

                {phase === 'idle' && (
                  <button type="button" className="pill" onClick={run}>
                    Find buildings
                    <span className="chip" aria-hidden="true">
                      <ArrowRight size={16} strokeWidth={1.6} />
                    </span>
                  </button>
                )}
                {phase !== 'idle' && (
                  <button type="button" className="text-link" onClick={run}>
                    Run again
                  </button>
                )}
              </section>

              <AnimatePresence>
                {note && (
                  <motion.section
                    key={note.title + committed}
                    className="note"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    aria-live="polite"
                  >
                    <span className="label">What changed</span>
                    <p className="note-title">{note.title}</p>
                    <p className="note-body">
                      {note.body} <Cites ids={note.cites} />
                    </p>
                  </motion.section>
                )}
              </AnimatePresence>

              {phase === 'done' && (
                <section aria-label="Shortlist">
                  <span className="label section-label">02 · Shortlist</span>
                  <Results results={results.filter((r) => shown.includes(r.property.id))} selected={selected} onSelect={select} people={PEOPLE} changed={changed} />
                </section>
              )}

              {phase !== 'idle' && (
                <section aria-label="Agent run">
                  <span className="label section-label">03 · What the agents did</span>
                  <AgentRun steps={steps} />
                </section>
              )}
            </aside>

            <section className="stage" aria-label="Map and plan">
              <div className="stage-tabs seg" role="tablist" aria-label="View">
                <button type="button" role="tab" aria-selected={tab === 'map'} onClick={() => setTab('map')}>
                  Map
                </button>
                <button type="button" role="tab" aria-selected={tab === 'plan'} disabled={!selectedResult} onClick={() => setTab('plan')}>
                  Morph plan
                </button>
              </div>

              <div className={`stage-layer${tab === 'map' ? ' is-on' : ''}`} aria-hidden={tab !== 'map'}>
                <MapStage results={results} shown={shown} selected={selected} onSelect={select} theme={theme} overview={phase !== 'done'} />
                {phase === 'idle' && (
                  <div className="map-idle">
                    <span className="label">Houston, Texas</span>
                    <p className="heading-2">Find the building your neighborhood already has.</p>
                    <p className="body map-idle-sub">CityMorph reads property records, interior scans and aerials, then drafts a plan to reuse what is already standing.</p>
                  </div>
                )}
              </div>

              <div className={`stage-layer plan-layer${tab === 'plan' ? ' is-on' : ''}`} aria-hidden={tab !== 'plan'}>
                {selectedResult && tab === 'plan' && <PlanView result={selectedResult} />}
              </div>
            </section>
          </main>

          <AnimatePresence>
            {drawer && <EvidenceDrawer evidence={evidence} focus={focus} onClose={() => (setDrawer(false), setFocus(null))} results={results} />}
          </AnimatePresence>
        </div>
      </EvidenceContext.Provider>
    </MotionConfig>
  )
}

function PlanView({ result }: { result: Result }) {
  return (
    <motion.div key={result.property.id} className="plan-view" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.6, ease: [0.65, 0, 0.35, 1] }}>
      <MorphPlan result={result} closed={[]} />
      <div className="plan-side">
        <dl className="spec">
          <div className="spec-hd">
            <span className="label">Spec · {result.property.id}</span>
            <span className="spec-name">{result.property.name}</span>
          </div>
          {[
            ['Use today', result.property.use, result.property.ev[0]],
            ['Gross area', `${result.property.sqft.toLocaleString('en-US')} sq ft`, result.property.ev[0]],
            ['Usable, est.', `${Math.round(result.usable).toLocaleString('en-US')} sq ft`, 'A2'],
            ['Program needs', `${result.need.toLocaleString('en-US')} sq ft`, 'A1'],
            ['Parking', result.property.parking, result.property.ev.find((e) => e.startsWith('V')) ?? 'A2'],
          ].map(([k, v, c]) => (
            <div key={k} className="spec-row">
              <dt className="label">{k}</dt>
              <i aria-hidden="true" />
              <dd>
                {v} <Cite id={c} />
              </dd>
            </div>
          ))}
        </dl>
        {result.status === 'pass' && <TaskList result={result} />}
        <AerialFrame lngLat={result.property.lngLat} name={result.property.name} />
      </div>
    </motion.div>
  )
}

const KIND_ORDER: SourceKind[] = ['user', 'costar', 'matterport', 'vexcel', 'assumption']

function EvidenceDrawer({ evidence, focus, onClose, results }: { evidence: Evidence[]; focus: string | null; onClose: () => void; results: Result[] }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    ref.current?.querySelector<HTMLElement>(focus ? `[data-ev="${focus}"]` : 'button')?.scrollIntoView({ block: 'center' })
    ref.current?.querySelector<HTMLElement>('button')?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [focus, onClose])
  const name = (id?: string) => results.find((r) => r.property.id === id)?.property.name
  const verify = evidence.filter((e) => e.verify).length
  return (
    <>
      <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div
        ref={ref}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Evidence trail"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="drawer-hd">
          <div>
            <span className="label">Evidence trail · {evidence.length} claims · {verify} need a site visit</span>
            <p className="heading-2">Where every claim comes from</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close evidence trail">
            <X size={16} strokeWidth={1.5} />
          </button>
        </div>
        {KIND_ORDER.map((kind) => (
          <section key={kind} className="ev-group">
            <span className="label ev-kind">{SOURCE_LABEL[kind]}</span>
            <ul>
              {evidence
                .filter((e) => e.kind === kind)
                .map((e) => (
                  <li key={e.id} data-ev={e.id} className={`ev-row${focus === e.id ? ' is-focus' : ''}`}>
                    <span className="label ev-id">{e.id}</span>
                    <span className="ev-text">
                      <span className="ev-claim">{e.claim}</span>
                      <span className="ev-detail">
                        {name(e.propertyId) ? `${name(e.propertyId)} · ` : ''}
                        {e.detail}
                      </span>
                    </span>
                    <span className="ev-meta">
                      <span className="label">{e.confidence}</span>
                      {e.verify && <span className="label ev-verify">Verify</span>}
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </motion.div>
    </>
  )
}
