import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import NumberFlow from '@number-flow/react'
import { BookOpen, Moon, Sun, X } from 'lucide-react'
import { EVIDENCE, PLANNING, PROPERTIES, SOURCE_LABEL, userEvidence, type Evidence, type PropertyId, type SourceKind } from './data/demo'
import { evaluate, thousands, type Result } from './logic/evaluate'
import { Cites, EvidenceContext, SOURCE_ICON } from './components/Cite'
import { MapStage, type MapMode } from './components/MapStage'
import { IsoPlan, seatedAt } from './components/IsoPlan'
import { Shortlist } from './components/Shortlist'
import { Journey, STEPS } from './components/Journey'
import { ReplanPanel } from './components/Replan'
import { AERIAL_CREDIT } from './components/AerialFrame'
import { Hook } from './components/Hook'

const PEOPLE = 40
const START_BUDGET = 150000
const CUT_BUDGET = 90000
const REQUEST = { people: PEOPLE, stepFree: true }
const NO_SHOCKS = { rejected: [] as PropertyId[], closedEntrances: [] as string[] }
const short = (name: string) => name.replace(/ (retail flex|two storey office|single storey office)$/, '')

interface Tick {
  now: string
  prev: string | null
}

function useWidth() {
  const [w, setW] = useState(() => window.innerWidth)
  useEffect(() => {
    const on = () => setW(window.innerWidth)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return w
}

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [budget, setBudget] = useState(START_BUDGET)
  const [committed, setCommitted] = useState(START_BUDGET)
  const [shown, setShown] = useState<PropertyId[]>([])
  const [selected, setSelected] = useState<PropertyId | null>(null)
  const [tick, setTick] = useState<Tick>({ now: 'Ready · sample Houston records', prev: null })
  const [changed, setChanged] = useState<string | null>(null)
  const [over, setOver] = useState(false)
  const [was, setWas] = useState<{ name: string; cost: number } | null>(null)
  const [playKey, setPlayKey] = useState(0)
  const [drawer, setDrawer] = useState(false)
  const [focus, setFocus] = useState<string | null>(null)
  const timers = useRef<number[]>([])
  const width = useWidth()

  const reduce = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  useEffect(() => {
    document.documentElement.dataset.motion = reduce ? 'off' : 'on'
  }, [reduce])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  const results = useMemo(() => evaluate({ ...REQUEST, budget: committed }, PROPERTIES, NO_SHOCKS), [committed])
  const evidence = useMemo(() => [...userEvidence(PEOPLE, committed), ...EVIDENCE], [committed])
  const byId = useMemo(() => Object.fromEntries(evidence.map((e) => [e.id, e])), [evidence])
  const top = results[0]
  const shownResult = results.find((r) => r.property.id === selected) ?? top

  const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, reduce ? Math.min(ms, 80) : ms))
  const say = (now: string) => setTick((t) => ({ now, prev: t.now }))
  const clear = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  const openEvidence = useCallback((id: string) => {
    setFocus(id)
    setDrawer(true)
  }, [])
  const select = useCallback((id: PropertyId) => setSelected(id), [])

  // Every ticker line is computed from the evaluator, not scripted.
  function goTo(n: number) {
    clear()
    setBusy(false)
    setOver(false)
    const res = evaluate({ ...REQUEST, budget: committed }, PROPERTIES, NO_SHOCKS)
    const failed = res.filter((r) => r.status === 'fail')
    if (n < 4) setWas(null)
    if (n === 0) {
      setShown([])
      setSelected(null)
      setBudget(START_BUDGET)
      setCommitted(START_BUDGET)
      setChanged(null)
      setTick({ now: 'Ready · sample Houston records', prev: null })
    }
    if (n === 1) {
      setSelected(null)
      if (step < 1) {
        setShown([])
        setBusy(true)
        say(`Translator · ${PEOPLE} people, 2 rooms, step free, ${thousands(committed)}`)
        later(1100, () => say('Search · commercial listings with an interior scan and an aerial'))
        res.forEach((r, i) => later(1500 + i * 450, () => setShown((s) => [...s, r.property.id])))
        later(1500 + res.length * 450 + 300, () => {
          say(`Found ${res.length} buildings in reach`)
          setBusy(false)
        })
      } else {
        setShown(res.map((r) => r.property.id))
        say(`Found ${res.length} buildings in reach`)
      }
    }
    if (n === 2) {
      setShown(res.map((r) => r.property.id))
      setSelected(null)
      say(`Feasibility · 4 rules × ${res.length} buildings, in code`)
      if (failed.length)
        later(1500, () => say(`${short(failed[0].property.name)} fails ${failed[0].checks.find((c) => !c.pass)!.label.toLowerCase()}`))
      later(2600, () => say(`${res.filter((r) => r.status === 'pass').length} of ${res.length} pass · ranked by fit`))
    }
    if (n === 3) {
      setShown(res.map((r) => r.property.id))
      setSelected(res[0].property.id)
      setPlayKey((k) => k + 1)
      say(`Planner · drafting rooms inside ${short(res[0].property.name)}`)
      later(5200, () => say(`Fits ${PEOPLE} people · est. ${thousands(res[0].cost)}`))
    }
    if (n === 4) {
      setShown(res.map((r) => r.property.id))
      setSelected(res[0].property.id)
      say('Your turn · drag the budget')
    }
    setStep(n)
  }

  // A committed budget change reruns the evaluator for real. Timing only
  // paces what the judge sees.
  function commit(next = budget) {
    if (step !== 4 || next === committed) return
    clear()
    const before = results
    const after = evaluate({ ...REQUEST, budget: next }, PROPERTIES, NO_SHOCKS)
    const oldTop = before[0]
    const newTop = after[0]
    const broke = after.find((r) => r.status === 'fail' && before.find((b) => b.property.id === r.property.id)?.status === 'pass')
    say(`Budget ${thousands(committed)} → ${thousands(next)} · re-checking rules`)
    if (newTop.property.id !== oldTop.property.id) {
      if (broke && broke.property.id === selected) setOver(true)
      later(900, () => say(broke ? `${short(broke.property.name)} core work ${thousands(broke.coreCost)} is over ${thousands(next)}` : `${short(newTop.property.name)} now leads on budget left`))
      later(2000, () => {
        setCommitted(next)
        setOver(false)
        setWas({ name: short(oldTop.property.name), cost: oldTop.cost })
        setSelected(newTop.property.id)
        setPlayKey((k) => k + 1)
        say(`Re-ranked · ${short(newTop.property.name)} first at ${thousands(newTop.cost)}`)
        setChanged(
          broke
            ? `${short(newTop.property.name)} moves to #1 at about ${thousands(newTop.cost)}. ${short(broke.property.name)} needs ${thousands(broke.coreCost)} of core work.`
            : `${short(newTop.property.name)} moves to #1 at about ${thousands(newTop.cost)}.`,
        )
      })
    } else {
      setCommitted(next)
      if (newTop.cost !== oldTop.cost) setWas({ name: short(oldTop.property.name), cost: oldTop.cost })
      setSelected(newTop.property.id)
      later(500, () => say(`${short(newTop.property.name)} still first · work now ${thousands(newTop.cost)}`))
      setChanged(
        `${short(newTop.property.name)} still fits best at about ${thousands(newTop.cost)}.${newTop.dropped.length ? ` Dropped: ${newTop.dropped.map((d) => d.name.toLowerCase()).join(', ')}.` : ''}`,
      )
    }
  }

  // Keyboard: arrows move through the journey.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT' || drawer) return
      if (e.key === 'ArrowRight' && !busy && step < STEPS.length - 1) goTo(step + 1)
      if (e.key === 'ArrowLeft' && step > 0) goTo(step - 1)
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  })

  // ?demo=auto (or run, cut) plays the whole journey hands free, budget cut included.
  const demo = useRef(new URLSearchParams(window.location.search).get('demo'))
  useEffect(() => {
    if (!demo.current) return
    const wait = [900, 5200, 5600, 7200][step]
    if (step < 4 && !busy) {
      const t = window.setTimeout(() => goTo(step + 1), wait)
      return () => clearTimeout(t)
    }
    if (step === 4 && committed === START_BUDGET) {
      const t = window.setTimeout(() => {
        setBudget(CUT_BUDGET)
        commit(CUT_BUDGET)
      }, 2200)
      return () => clearTimeout(t)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, busy, committed])

  const sheet = step >= 3
  const panelW = sheet ? Math.min(900, Math.round(width * 0.58)) : Math.min(600, Math.round(width * 0.42))
  const mapMode: MapMode = step === 0 ? 'idle' : step < 3 ? 'overview' : 'focus'
  const narrow = width < 900

  return (
    <MotionConfig reducedMotion="user">
      <EvidenceContext.Provider value={{ byId, open: openEvidence, focus }}>
        <div className={`app step-${STEPS[step].id}`}>
          <header className="topbar">
            <div className="brand">
              <Logo />
              <span className="wordmark">CityMorph</span>
            </div>
            <Ticker tick={tick} />
            <div className="topbar-right">
              <span className="tag-sample" title="Sample records stand in until hackathon API keys arrive">
                Sample data · not live CoStar
              </span>
              <button type="button" className="icon-btn" onClick={() => setDrawer(true)} aria-label="Open evidence trail">
                <BookOpen size={15} strokeWidth={1.7} />
                <span>Evidence</span>
              </button>
              <button type="button" className="icon-btn is-square" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>
                {theme === 'light' ? <Moon size={15} strokeWidth={1.7} /> : <Sun size={15} strokeWidth={1.7} />}
              </button>
            </div>
          </header>

          <main className="stage">
            <MapStage
              results={results}
              shown={shown}
              selected={selected}
              onSelect={select}
              theme={theme}
              mode={mapMode}
              padRight={narrow || step === 0 ? 0 : panelW + 48}
              padBottom={step === 4 && !narrow ? 440 : 120}
              showChecks={step >= 2}
            />
            <div className={`wash${step === 0 ? ' is-on' : ''}`} aria-hidden="true" />

            <AnimatePresence mode="wait">
              {step === 0 && (
                <motion.section
                  key="need"
                  className="need"
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16, filter: 'blur(4px)' }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                  aria-label="What your neighborhood needs"
                >
                  <Hook />
                  <span className="mono-label need-kicker">Houston · what does the neighborhood need?</span>
                  <h1 className="need-line">
                    A <Blank i={0}>learning center</Blank> for <Blank i={1}>{PEOPLE} people</Blank>, with <Blank i={2}>2 activity rooms</Blank>, <Blank i={3}>step free</Blank> entry, under{' '}
                    <Blank i={4}>{thousands(committed)}</Blank>.
                  </h1>
                  <div className="need-foot">
                    <span className="mono-label">Reads</span>
                    <span className="need-sources" aria-label="Sources CityMorph reads">
                      {(['costar', 'matterport', 'vexcel'] as SourceKind[]).map((k) => {
                        const Icon = SOURCE_ICON[k]
                        return (
                          <span key={k} className="need-source">
                            <Icon size={14} strokeWidth={1.7} /> {SOURCE_LABEL[k]}
                          </span>
                        )
                      })}
                    </span>
                  </div>
                </motion.section>
              )}

              {(step === 1 || step === 2) && (
                <motion.aside
                  key="list"
                  className="side float"
                  style={{ width: narrow ? undefined : panelW }}
                  initial={{ opacity: 0, x: 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 40 }}
                  transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="side-head">
                    <span className="big-n">
                      <NumberFlow value={step === 1 ? shown.length : results.filter((r) => r.status === 'pass').length} />
                    </span>
                    <span className="side-title">{step === 1 ? 'buildings already standing' : `of ${results.length} pass every rule`}</span>
                  </div>
                  <Shortlist results={results} shown={shown} mode={step === 1 ? 'find' : 'check'} selected={selected} onSelect={select} />
                  <p className="fig mono-label">{step === 1 ? 'Fig 02 · CoStar records + aerials' : 'Fig 03 · Rules run in code, not by the model'}</p>
                </motion.aside>
              )}

              {sheet && (
                <motion.aside
                  key="sheet"
                  className="sheet float"
                  style={{ width: narrow ? undefined : panelW }}
                  initial={{ opacity: 0, x: 60 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 60 }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: step === 3 ? 0.9 : 0 }}
                >
                  <PlanSheet result={shownResult} playKey={`${playKey}`} over={over} was={step === 4 ? was : null} />
                </motion.aside>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {step === 4 && (
                <motion.div key="replan" className="replan-wrap" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}>
                  <ReplanPanel
                    budget={budget}
                    setBudget={setBudget}
                    commit={() => commit()}
                    shownProperty={shownResult.property}
                    results={results}
                    selected={selected}
                    onSelect={select}
                    changed={changed}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            <Journey step={step} busy={busy} onGo={goTo} />
          </main>

          <AnimatePresence>{drawer && <EvidenceDrawer evidence={evidence} focus={focus} onClose={() => (setDrawer(false), setFocus(null))} results={results} />}</AnimatePresence>
        </div>
      </EvidenceContext.Provider>
    </MotionConfig>
  )
}

function Blank({ i, children }: { i: number; children: React.ReactNode }) {
  return (
    <motion.span className="blank" initial={{ backgroundSize: '0% 3px' }} animate={{ backgroundSize: '100% 3px' }} transition={{ delay: 0.5 + i * 0.18, duration: 0.5, ease: [0.65, 0, 0.35, 1] }}>
      {children}
    </motion.span>
  )
}

function Ticker({ tick }: { tick: Tick }) {
  return (
    <div className="ticker" aria-live="polite">
      <span className="ticker-dot" aria-hidden="true" />
      <span className="ticker-lines">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span key={tick.now} className="ticker-now" initial={{ y: 14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -14, opacity: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
            {tick.now}
          </motion.span>
        </AnimatePresence>
      </span>
    </div>
  )
}

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5 20.5 7.4v9.2L12 21.5 3.5 16.6V7.4Z" className="logo-out" />
      <path d="M12 12 20.5 7.4M12 12v9.5M12 12 3.5 7.4" className="logo-in" />
      <path d="M12 2.5 20.5 7.4 12 12 3.5 7.4Z" className="logo-top" />
    </svg>
  )
}

function PlanSheet({ result, playKey, over, was }: { result: Result; playKey: string; over: boolean; was: { name: string; cost: number } | null }) {
  const p = result.property
  const [t, setT] = useState(0)
  const [scrub, setScrub] = useState<number | null>(null)
  useEffect(() => setScrub(null), [playKey, p.id])
  const door = p.entrances.find((e) => e.stepFree)
  const lo = Math.round((result.cost * (1 - PLANNING.costSpread)) / 1000)
  const hi = Math.round((result.cost * (1 + PLANNING.costSpread)) / 1000)
  return (
    <div className="plan">
      <div className="plan-head">
        <div>
          <span className="plan-name">{short(p.name)}</span>
          <span className="mono-label plan-sub">
            {p.area} · {p.use} <Cites ids={[p.ev[0]]} />
          </span>
        </div>
        <span className="mono-label tag-concept">Concept · areas est.</span>
      </div>

      <IsoPlan
        key={p.id}
        property={p}
        people={PEOPLE}
        playKey={playKey}
        over={over}
        onT={setT}
        scrub={scrub}
        corner={
          <>
            {/* After a replan, name both buildings so the struck price never reads
                like a discount on the same one. The new price is the change: orange. */}
            {was !== null && was.cost !== result.cost && (
              <span className="mono-label iso-was">
                {was.name === short(p.name) ? 'Was' : was.name} <s>${Math.round(was.cost / 1000)}k</s>
                {was.name === short(p.name) ? ', now' : `, now ${short(p.name)}`}
              </span>
            )}
            <span className={`iso-cost${was !== null && was.cost !== result.cost ? ' is-changed' : ''}`}>
              <NumberFlow value={result.cost / 1000} prefix="$" suffix="k" />
            </span>
            <span className="mono-label" aria-live="polite">
              Est. work · {seatedAt(t, PEOPLE)} of {PEOPLE} seated
            </span>
          </>
        }
      />

      <div className="scrub">
        <span className={`mono-label${t < 0.5 ? ' is-on' : ''}`}>Today</span>
        <input
          className="range"
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={t}
          style={{ ['--fill' as string]: `${t * 100}%` }}
          onChange={(e) => setScrub(Number(e.target.value))}
          aria-label="Morph from today to proposed"
        />
        <span className={`mono-label${t >= 0.5 ? ' is-on' : ''}`}>Proposed</span>
      </div>

      <dl className="stats">
        <div>
          <dt className="mono-label">People</dt>
          <dd>
            <NumberFlow value={PEOPLE} />
            <Cites ids={['U1', 'A1']} />
          </dd>
        </div>
        <div>
          <dt className="mono-label">Usable</dt>
          <dd>
            <NumberFlow value={Math.round(result.usable / 10) * 10} suffix=" sq ft" />
            <Cites ids={['A2']} />
          </dd>
        </div>
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
          <dt className="mono-label">Entry</dt>
          <dd>
            <span className="stat-text">{door ? 'Step free' : 'Steps'}</span>
            <Cites ids={[door?.ev ?? 'U3']} />
          </dd>
        </div>
      </dl>
      <p className="fig mono-label">Fig 04 · Floor: concept from sample record · {AERIAL_CREDIT}</p>
    </div>
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
            <span className="mono-label">
              {evidence.length} claims · {verify} need a site visit
            </span>
            <p className="drawer-title">Where every number comes from</p>
          </div>
          <button type="button" className="icon-btn is-square" onClick={onClose} aria-label="Close evidence trail">
            <X size={15} strokeWidth={1.7} />
          </button>
        </div>
        {KIND_ORDER.map((kind) => {
          const Icon = SOURCE_ICON[kind]
          return (
            <section key={kind} className="ev-group">
              <span className="mono-label ev-kind">
                <Icon size={13} strokeWidth={1.7} /> {SOURCE_LABEL[kind]}
              </span>
              <ul>
                {evidence
                  .filter((e) => e.kind === kind)
                  .map((e) => (
                    <li key={e.id} data-ev={e.id} className={`ev-row${focus === e.id ? ' is-focus' : ''}`}>
                      <span className="ev-text">
                        <span className="ev-claim">{e.claim}</span>
                        <span className="ev-detail">
                          {name(e.propertyId) ? `${name(e.propertyId)} · ` : ''}
                          {e.detail}
                        </span>
                      </span>
                      <span className="ev-meta">
                        <span className="mono-label">{e.confidence}</span>
                        {e.verify && <span className="mono-label ev-verify">Verify</span>}
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          )
        })}
      </motion.div>
    </>
  )
}
