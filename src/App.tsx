import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, MotionConfig, animate, motion } from 'motion/react'
import NumberFlow from '@number-flow/react'
import { BookOpen, Moon, Sun, X } from 'lucide-react'
import { CITIES, FACILITIES, type CityId, type FacilityId } from './data/config'
import { ASSUMPTIONS, KIND_ORDER, SITE_EVIDENCE, SOURCE_LABEL, userEvidence, type Evidence, type SourceKind } from './data/evidence'
import { CANDIDATES, byCity } from './data/candidates'
import { evaluate, inspectionOrder, thousands, type Request, type Result } from './logic/evaluate'
import { loadGeo, simulate, type Impact } from './logic/impact'
import { EvidenceContext, SOURCE_ICON } from './components/Cite'
import { MapStage, type MapMode, type OtherBuilding } from './components/MapStage'
import { ComparePanel, Shortlist, cellAt, rulesOf } from './components/Shortlist'
import { Journey, STEPS } from './components/Journey'
import { Studio } from './components/Studio'
import { ImpactPanel } from './components/ImpactPanel'
import { AgentLog, type AgentName, type LogLine } from './components/AgentLog'
import { SearchBox, type Hit } from './components/SearchBox'
import { Hook } from './components/Hook'
import { BUDGET_MAX, BUDGET_MIN } from './components/Replan'
import type { LngLat } from './logic/geo'

const START: Request = { city: 'houston', facility: 'learning', capacity: 40, budget: 150000, opts: { outdoorPlay: false, accessFirst: false }, variant: 'A' }
const CUT_BUDGET = 90000
type Patch = Partial<Omit<Request, 'opts'>> & { opts?: Partial<Request['opts']> }
const merge = (r: Request, p: Patch): Request => ({ ...r, ...p, opts: { ...r.opts, ...(p.opts ?? {}) } })

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
  const [req, setReqState] = useState<Request>(START)
  const [budget, setBudget] = useState(START.budget)
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const [shown, setShown] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [ranked, setRanked] = useState(false)
  const [compare, setCompare] = useState<string[]>([])
  const [lines, setLines] = useState<LogLine[]>([])
  const [over, setOver] = useState(false)
  const [was, setWas] = useState<{ name: string; cost: number } | null>(null)
  const [playKey, setPlayKey] = useState(0)
  const [drawer, setDrawer] = useState(false)
  const [focus, setFocus] = useState<string | null>(null)
  const [search, setSearch] = useState<{ lngLat: LngLat; label: string; key: number } | null>(null)
  const [other, setOther] = useState<OtherBuilding | null>(null)
  const [impact, setImpact] = useState<Impact | null>(null)
  const [view, setView] = useState<'before' | 'after'>('before')
  const [reveal, setReveal] = useState(0)
  const [ran, setRan] = useState(false)
  const [stops, setStops] = useState<{ at: LngLat; kind: string }[]>([])
  const timers = useRef<number[]>([])
  const lineId = useRef(0)
  const width = useWidth()

  const reduce = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  useEffect(() => {
    document.documentElement.dataset.motion = reduce ? 'off' : 'on'
  }, [reduce])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  // Every OSM transit stop around this city's candidates, for the overview map.
  useEffect(() => {
    let live = true
    Promise.all(byCity(req.city).map((c) => loadGeo(c.id).catch(() => null))).then((list) => {
      if (!live) return
      const seen = new Set<string>()
      const out: { at: LngLat; kind: string }[] = []
      for (const g of list)
        for (const s of g?.stops ?? []) {
          const key = `${s.lon.toFixed(4)},${s.lat.toFixed(4)}`
          if (seen.has(key)) continue
          seen.add(key)
          out.push({ at: [s.lon, s.lat], kind: s.kind })
        }
      setStops(out)
    })
    return () => {
      live = false
    }
  }, [req.city])

  const results = useMemo(() => evaluate(req), [req])
  const order = useMemo(() => inspectionOrder(req), [req])
  const f = FACILITIES[req.facility]
  const evidence = useMemo(
    () => [...userEvidence(req.city, req.facility, req.capacity, req.budget, req.opts.outdoorPlay, req.opts.accessFirst), ...ASSUMPTIONS, ...SITE_EVIDENCE.filter((e) => CANDIDATES.find((c) => c.id === e.propertyId)?.city === req.city)],
    [req],
  )
  const byId = useMemo(() => Object.fromEntries(evidence.map((e) => [e.id, e])), [evidence])
  const passes = results.filter((r) => r.status === 'pass')
  const shownResult = results.find((r) => r.property.id === selected) ?? passes[0] ?? results[0]

  const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, reduce ? Math.min(ms, 80) : ms))
  const clear = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }
  const log = (agent: AgentName, text: string, tone?: LogLine['tone']) => setLines((l) => [...l, { id: ++lineId.current, agent, text, tone }])

  const openEvidence = useCallback((id: string) => {
    setFocus(id)
    setDrawer(true)
  }, [])
  const select = useCallback((id: string) => {
    setSelected(id)
    setOther(null)
  }, [])

  // Every log line is computed from the evaluator, not scripted.
  function goTo(n: number, base: Request = req) {
    clear()
    setBusy(false)
    setOver(false)
    setCompare([])
    const res = evaluate(base)
    const ord = inspectionOrder(base)
    const fac = FACILITIES[base.facility]
    if (n < 3) setWas(null)
    if (n !== 4) {
      setImpact(null)
      setRan(false)
      setReveal(0)
      setView('before')
    }
    if (n === 0) {
      setShown([])
      setSelected(null)
      setRanked(false)
    }
    if (n === 1) {
      setSelected(null)
      setRanked(false)
      setShown([])
      setBusy(true)
      log('Translator', `${fac.label} · ${base.capacity} ${fac.noun} · step free · ${thousands(base.budget)} · ${CITIES[base.city].name}`)
      later(900, () => log('Scout', `Searching sample listings across ${CITIES[base.city].name}; footprints from OpenStreetMap`))
      ord.forEach((id, i) =>
        later(1500 + i * 420, () => {
          const c = res.find((r) => r.property.id === id)!.property
          setShown((s) => [...s, id])
          log('Scout', `${c.name}, ${c.area} · ${c.footprintSqft.toLocaleString('en-US')} sq ft footprint`)
        }),
      )
      later(1500 + ord.length * 420 + 300, () => {
        log('Scout', `${ord.length} buildings already standing`, 'ok')
        setBusy(false)
      })
    }
    if (n === 2) {
      setShown(ord)
      setSelected(null)
      setRanked(false)
      setBusy(true)
      const rules = rulesOf(res)
      log('Inspector', `${rules.length} hard rules × ${ord.length} buildings, run in code`)
      ord.forEach((id, i) => {
        const r = res.find((x) => x.property.id === id)!
        later(cellAt(i, rules.length) * 1000, () => {
          const fail = r.checks.find((c) => !c.pass)
          const next = ord[i + 1] ? res.find((x) => x.property.id === ord[i + 1])!.property.name : null
          if (fail) log('Inspector', `${r.property.name} rejected: ${fail.fail.toLowerCase()}${next ? ` → checking ${next}` : ''}`, 'fail')
          else log('Inspector', `${r.property.name} passes all ${r.checks.length} rules`, 'ok')
        })
      })
      later(cellAt(ord.length - 1, rules.length) * 1000 + 700, () => {
        const top = res.filter((r) => r.status === 'pass')
        if (top.length) log('Ranker', `${top.length} pass · scored on 7 criteria · #1 ${top[0].property.name}, fit ${top[0].score}`, 'ok')
        else log('Ranker', 'No building passes every rule; open the studio to change the design', 'fail')
        setRanked(true)
        setBusy(false)
      })
    }
    if (n === 3) {
      const keep = selected && res.find((r) => r.property.id === selected)
      const pick = keep ? selected! : (res.find((r) => r.status === 'pass') ?? res[0]).property.id
      setShown(ord)
      setRanked(true)
      setSelected(pick)
      setPlayKey((k) => k + 1)
      const r = res.find((x) => x.property.id === pick)!
      log('Planner', `Drafting ${r.plan.zones.filter((z) => z.kind !== 'hall' && z.kind !== 'flex').length} rooms for a ${fac.label} inside ${r.property.name}`)
      later(4800, () => log('Economist', `Core work ${thousands(r.coreCost)} · est. total ${thousands(r.cost)} · ${r.plan.newWallFt} ft of new walls`))
    }
    if (n === 4) {
      const pick = selected ?? (res.find((r) => r.status === 'pass') ?? res[0]).property.id
      setSelected(pick)
      setShown(ord)
      setRan(false)
      setReveal(0)
      setView('before')
      setImpact(null)
      const r = res.find((x) => x.property.id === pick)!
      log('Simulator', `Loading the OpenStreetMap street network around ${r.property.name}`)
      loadGeo(pick).then((g) => {
        const im = simulate(g, r, base.facility)
        setImpact(im)
        log('Simulator', `${g.edges.length.toLocaleString('en-US')} street segments, ${g.stops.length} stops, ${(g.facilities[base.facility] ?? []).length} existing ${fac.label}s mapped nearby`)
      })
    }
    setStep(n)
  }

  // A design change reruns the evaluator. If the building on screen now fails
  // a hard rule, it is stamped, and the next best building takes over.
  function setReq(p: Patch) {
    const next = merge(req, p)
    if (p.budget !== undefined) setBudget(p.budget)
    setReqState(next)
    if (step < 3 || !selected) return
    clear()
    const before = results.find((r) => r.property.id === selected)
    const after = evaluate(next)
    const now = after.find((r) => r.property.id === selected)!
    const best = after.find((r) => r.status === 'pass')
    const what =
      p.budget !== undefined ? `Budget ${thousands(req.budget)} → ${thousands(next.budget)}`
      : p.facility ? `Facility → ${FACILITIES[next.facility].label}`
      : p.capacity !== undefined ? `Capacity ${req.capacity} → ${next.capacity}`
      : p.variant ? `Layout option ${next.variant}`
      : p.opts?.outdoorPlay !== undefined ? `Outdoor playground ${next.opts.outdoorPlay ? 'on' : 'off'}`
      : p.opts?.accessFirst !== undefined ? `Accessibility first ${next.opts.accessFirst ? 'on' : 'off'}`
      : 'Design changed'
    log('Planner', `${what} · re-checking rules`)
    if (now.status === 'fail' && best && best.property.id !== selected) {
      const fail = now.checks.find((c) => !c.pass)!
      setOver(true)
      later(700, () => log('Inspector', `${now.property.name} rejected: ${fail.fail.toLowerCase()} → evaluating the next building`, 'fail'))
      later(1900, () => {
        setOver(false)
        setWas({ name: now.property.name, cost: before?.cost ?? now.cost })
        setSelected(best.property.id)
        setPlayKey((k) => k + 1)
        log('Ranker', `${best.property.name} passes; now #1 at ${thousands(best.cost)}`, 'ok')
      })
      return
    }
    if (now.status === 'fail') log('Inspector', `${now.property.name} fails ${now.checks.find((c) => !c.pass)!.label.toLowerCase()}; no other building passes`, 'fail')
    else {
      if (before && before.cost !== now.cost) setWas({ name: now.property.name, cost: before.cost })
      log('Economist', `${now.property.name} still passes · est. ${thousands(now.cost)} for ${now.plan.achieved} ${FACILITIES[next.facility].noun}`, 'ok')
    }
  }

  function changeCity(c: CityId) {
    clear()
    const next = merge(req, { city: c })
    setReqState(next)
    setSelected(null)
    setShown([])
    setOther(null)
    setSearch(null)
    setLines([])
    log('Translator', `City set to ${CITIES[c].name}`)
    goTo(0, next)
  }

  function pickSearch(h: Hit) {
    if (h.candidate) {
      if (step < 1) goTo(1)
      setSelected(h.candidate)
    }
    setSearch({ lngLat: h.lngLat, label: h.label, key: Date.now() })
  }

  function runImpact() {
    if (!impact) return
    setRan(true)
    setView('after')
    setReveal(0)
    log('Simulator', `Walking the network from the site · ${impact.routes.length} transit routes traced`)
    animate(0, 1, { duration: reduce ? 0.01 : 3.2, ease: [0.33, 0, 0.2, 1], onUpdate: setReveal })
    later(3300, () => log('Simulator', `${impact.served.toLocaleString('en-US')} ${f.servesTract === 'under5' ? 'children under 5' : 'residents'} within a 10 minute walk (tract average) · ${Math.round(impact.coverAfter * 100)}% of streets now within 10 minutes, from ${Math.round(impact.coverBefore * 100)}%`, 'ok'))
  }

  // Keyboard: arrows move through the journey.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'SELECT' || drawer) return
      if (e.key === 'ArrowRight' && !busy && step < STEPS.length - 1) goTo(step + 1)
      if (e.key === 'ArrowLeft' && step > 0) goTo(step - 1)
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  })

  // ?demo=auto plays the whole journey hands free: find, check, studio, a
  // budget cut that rejects the leader, then the impact simulation.
  const demo = useRef(new URLSearchParams(window.location.search).get('demo'))
  const cut = useRef(false)
  useEffect(() => {
    if (!demo.current || busy) return
    const go = (ms: number, fn: () => void) => {
      const t = window.setTimeout(fn, ms)
      return () => clearTimeout(t)
    }
    if (step === 0) return go(1200, () => goTo(1))
    if (step === 1) return go(1600, () => goTo(2))
    if (step === 2 && ranked) return go(4200, () => goTo(3))
    if (step === 3 && !cut.current)
      return go(7000, () => {
        cut.current = true
        setReq({ budget: CUT_BUDGET })
      })
    if (step === 3 && cut.current) return go(7000, () => goTo(4))
    if (step === 4 && impact && !ran) return go(2500, runImpact)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, busy, ranked, impact, ran, selected, req.budget])

  const narrow = width < 900
  const sideW = Math.min(640, Math.round(width * 0.44))
  const studioW = Math.min(1180, width - 120)
  const impactW = Math.min(440, Math.round(width * 0.34))
  const mapMode: MapMode = step === 0 ? 'idle' : step < 3 ? 'overview' : step === 3 ? 'studio' : 'impact'
  const padRight = narrow || step === 0 ? 0 : step === 3 ? Math.round(studioW * 0.82) : step === 4 ? impactW + 56 : sideW + 56
  const cmp = compare.length === 2 ? compare.map((id) => results.find((r) => r.property.id === id)!).filter((r) => r && r.status === 'pass') : []

  return (
    <MotionConfig reducedMotion="user">
      <EvidenceContext.Provider value={{ byId, open: openEvidence, focus }}>
        <div className={`app step-${STEPS[step].id}`}>
          <header className="topbar">
            <div className="brand">
              <Logo />
              <span className="wordmark">CityMorph</span>
              <label className="city-pick">
                <select value={req.city} onChange={(e) => changeCity(e.target.value as CityId)} aria-label="City">
                  {(Object.keys(CITIES) as CityId[]).map((c) => (
                    <option key={c} value={c}>
                      {CITIES[c].name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <SearchBox city={req.city} onPick={pickSearch} />
            <div className="topbar-right">
              <span className="tag-sample" title="Footprints, streets, stops and population are real public data. Listings, interiors, vacancy, zoning and costs are simulated.">
                Real map · simulated listings
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
              city={req.city}
              results={results}
              shown={shown}
              selected={selected}
              onSelect={select}
              onOther={setOther}
              theme={theme}
              mode={mapMode}
              padRight={padRight}
              padBottom={120}
              showChecks={step >= 2 && (ranked || step > 2)}
              focus={search}
              impact={impact}
              view={view}
              reveal={ran ? reveal : 1}
              stops={stops}
              proposed={f.label}
            />
            <div className={`wash${step === 0 ? ' is-on' : ''}`} aria-hidden="true" />

            <AnimatePresence>
              {other && (
                <motion.div className="other float" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  <div className="hs-head">
                    <span className="hs-name">Not a candidate</span>
                    <button type="button" className="icon-btn is-square" onClick={() => setOther(null)} aria-label="Close">
                      <X size={13} strokeWidth={1.8} />
                    </button>
                  </div>
                  <p className="hs-purpose">This building has no property record in the demo, so CityMorph cannot check it. Ranking needs a listing, an interior and an aerial.</p>
                  <span className="mono-label">{other.height ? `OSM height ≈ ${Math.round(other.height)} m · ` : ''}OpenStreetMap footprint</span>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence mode="wait">
              {step === 0 && (
                <motion.section key="need" className="need" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16, filter: 'blur(4px)' }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} aria-label="What your neighborhood needs">
                  <Hook city={req.city} />
                  <span className="mono-label need-kicker">{CITIES[req.city].name} · what does the neighborhood need?</span>
                  <h1 className="need-line">
                    A{' '}
                    <Blank i={0}>
                      <select className="blank-select" value={req.facility} onChange={(e) => setReq({ facility: e.target.value as FacilityId, capacity: FACILITIES[e.target.value as FacilityId].capacity.default, budget: FACILITIES[e.target.value as FacilityId].budget })} aria-label="Facility type">
                        {(Object.keys(FACILITIES) as FacilityId[]).map((id) => (
                          <option key={id} value={id}>
                            {FACILITIES[id].label}
                          </option>
                        ))}
                      </select>
                    </Blank>{' '}
                    for{' '}
                    <Blank i={1}>
                      <select className="blank-select" value={req.capacity} onChange={(e) => setReq({ capacity: Number(e.target.value) })} aria-label="Capacity">
                        {Array.from({ length: Math.floor((f.capacity.max - f.capacity.min) / f.capacity.step) + 1 }, (_, i) => f.capacity.min + i * f.capacity.step).map((n) => (
                          <option key={n} value={n}>
                            {n} {f.noun}
                          </option>
                        ))}
                      </select>
                    </Blank>
                    , with <Blank i={2}>step free</Blank> entry, under{' '}
                    <Blank i={3}>
                      <select className="blank-select" value={req.budget} onChange={(e) => setReq({ budget: Number(e.target.value) })} aria-label="Budget">
                        {Array.from({ length: (BUDGET_MAX - BUDGET_MIN) / 10000 + 1 }, (_, i) => BUDGET_MIN + i * 10000).map((n) => (
                          <option key={n} value={n}>
                            {thousands(n)}
                          </option>
                        ))}
                      </select>
                    </Blank>
                    .
                  </h1>
                  <div className="need-foot">
                    <span className="mono-label">Reads</span>
                    <span className="need-sources" aria-label="Sources CityMorph reads">
                      {(['osm', 'census', 'costar', 'matterport', 'vexcel'] as SourceKind[]).map((s) => {
                        const Icon = SOURCE_ICON[s]
                        return (
                          <span key={s} className={`need-source${s === 'osm' || s === 'census' ? ' is-real' : ''}`}>
                            <Icon size={14} strokeWidth={1.7} /> {SOURCE_LABEL[s]}
                          </span>
                        )
                      })}
                    </span>
                  </div>
                </motion.section>
              )}

              {(step === 1 || step === 2) && (
                <motion.aside key="list" className="side float" style={{ width: narrow ? undefined : sideW }} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}>
                  <div className="side-head">
                    <span className="big-n">
                      <NumberFlow value={step === 1 || !ranked ? shown.length : passes.length} />
                    </span>
                    <span className="side-title">{step === 1 ? `buildings already standing in ${CITIES[req.city].name}` : ranked ? `of ${results.length} pass every rule` : 'being checked, one by one'}</span>
                  </div>
                  <Shortlist results={results} order={order} shown={shown} mode={step === 1 ? 'find' : 'check'} ranked={ranked} selected={selected} onSelect={select} compare={compare} onCompare={(id) => setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id].slice(-2)))} />
                  <p className="fig mono-label">{step === 1 ? 'Fig 02 · Footprints from OpenStreetMap · listings are sample records' : 'Fig 03 · Rules and scores run in code, not by a model · tick two to compare'}</p>
                </motion.aside>
              )}

              {step === 3 && shownResult && (
                <motion.aside key="studio" className="sheet float is-studio" style={{ width: narrow ? undefined : studioW }} initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 60 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: 0.6 }}>
                  <Studio
                    result={shownResult}
                    results={results}
                    req={req}
                    budget={budget}
                    setBudget={setBudget}
                    commitBudget={() => budget !== req.budget && setReq({ budget })}
                    setReq={setReq}
                    onSwitch={(id) => {
                      setWas(null)
                      setSelected(id)
                      setPlayKey((k) => k + 1)
                    }}
                    playKey={`${playKey}`}
                    over={over}
                    was={was}
                    note={lines.at(-1) ?? null}
                  />
                </motion.aside>
              )}

              {step === 4 && shownResult && (
                <motion.aside key="impact" className="side-impact" style={{ width: narrow ? undefined : impactW }} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40 }} transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}>
                  <ImpactPanel result={shownResult} facility={req.facility} impact={impact} view={view} setView={setView} ran={ran} onRun={runImpact} />
                </motion.aside>
              )}
            </AnimatePresence>

            <AnimatePresence>{step === 2 && cmp.length === 2 && <ComparePanel a={cmp[0]} b={cmp[1]} onClose={() => setCompare([])} rankOf={(id) => passes.findIndex((r) => r.property.id === id) + 1} />}</AnimatePresence>

            {!narrow && step > 0 && <AgentLog lines={lines} />}
            <Journey step={step} busy={busy} onGo={(n) => goTo(n)} />
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

function Logo() {
  return (
    <svg className="logo" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5 20.5 7.4v9.2L12 21.5 3.5 16.6V7.4Z" className="logo-out" />
      <path d="M12 12 20.5 7.4M12 12v9.5M12 12 3.5 7.4" className="logo-in" />
      <path d="M12 2.5 20.5 7.4 12 12 3.5 7.4Z" className="logo-top" />
    </svg>
  )
}

function EvidenceDrawer({ evidence, focus, onClose, results }: { evidence: Evidence[]; focus: string | null; onClose: () => void; results: Result[] }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    ref.current?.querySelector<HTMLElement>(focus ? `[data-ev="${CSS.escape(focus)}"]` : 'button')?.scrollIntoView({ block: 'center' })
    ref.current?.querySelector<HTMLElement>('button')?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [focus, onClose])
  const name = (id?: string) => results.find((r) => r.property.id === id)?.property.name
  const verify = evidence.filter((e) => e.verify).length
  const real = evidence.filter((e) => e.kind === 'osm' || e.kind === 'census').length
  return (
    <>
      <motion.div className="scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div ref={ref} className="drawer" role="dialog" aria-modal="true" aria-label="Evidence trail" initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
        <div className="drawer-hd">
          <div>
            <span className="mono-label">
              {evidence.length} claims · {real} from public data · {verify} need checking
            </span>
            <p className="drawer-title">Where every number comes from</p>
          </div>
          <button type="button" className="icon-btn is-square" onClick={onClose} aria-label="Close evidence trail">
            <X size={15} strokeWidth={1.7} />
          </button>
        </div>
        {KIND_ORDER.map((kind) => {
          const Icon = SOURCE_ICON[kind]
          const rows = evidence.filter((e) => e.kind === kind)
          if (!rows.length) return null
          return (
            <section key={kind} className="ev-group">
              <span className="mono-label ev-kind">
                <Icon size={13} strokeWidth={1.7} /> {SOURCE_LABEL[kind]}
                {(kind === 'costar' || kind === 'matterport' || kind === 'vexcel') && ' · simulated'}
              </span>
              <ul>
                {rows.map((e) => (
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
