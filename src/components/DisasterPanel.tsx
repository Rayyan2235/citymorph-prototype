import { motion } from 'motion/react'
import { Play, Waves, Zap } from 'lucide-react'
import { CARE } from '../data/config'
import type { BudgetStep, Result } from '../logic/evaluate'
import { BudgetStepCard } from './Shortlist'
import { Cites } from './Cite'

export type Scenario = 'z100' | 'z500' | 'blackout'

export const SCENARIOS: { id: Scenario; label: string; short: string }[] = [
  { id: 'z100', label: '100-yr flood', short: '100-yr' },
  { id: 'z500', label: '500-yr flood', short: '500-yr' },
  { id: 'blackout', label: 'Night blackout', short: 'Blackout' },
]

const km = (m: number) => `${(m / 1000).toFixed(1)} km`

// What one scenario means for one building, from precomputed FEMA + OSM metrics.
export function outcome(r: Result, s: Scenario) {
  const c = r.property
  const fl = c.metrics.flood
  const hasPower = r.checks.find((x) => x.id === 'power')?.pass ?? false
  const evac = r.evac?.minutes ?? null
  if (s === 'blackout') {
    return {
      wet: false,
      stay: hasPower,
      out: fl?.routeOut.normal ?? null,
      normal: fl?.routeOut.normal ?? null,
      evac,
      verdict: hasPower ? 'Stay put: backup power runs cooling' : `Evacuate: about ${evac} min at night`,
    }
  }
  const wet = s === 'z100' ? c.flood.zone === '100' : c.flood.zone === '100' || c.flood.zone === '500'
  const out = fl?.routeOut[s] ?? null
  const stay = !wet && hasPower
  return {
    wet,
    stay,
    out,
    normal: fl?.routeOut.normal ?? null,
    evac,
    verdict: wet ? 'Building floods: rescue by boat' : out === null ? (stay ? 'Cut off, but can shelter in place' : 'Cut off with no backup cooling') : stay ? `Stay put; road out ${km(out)} if needed` : `Evacuate: ${km(out)} road out, ${evac} min to clear`,
  }
}

interface Props {
  result: Result
  results: Result[]
  scenario: Scenario
  setScenario: (s: Scenario) => void
  ran: boolean
  onRun: () => void
  onPick: (id: string) => void
  stretch: BudgetStep | null
  onStretch: () => void
  loading: boolean
}

export function DisasterPanel({ result, results, scenario, setScenario, ran, onRun, onPick, stretch, onStretch, loading }: Props) {
  const p = result.property
  const o = outcome(result, scenario)
  const t = p.tract
  const passes = results.filter((r) => r.status === 'pass')
  const rows = [...passes, ...results.filter((r) => r.status !== 'pass')]
  return (
    <section className="impact disaster float" aria-label="Disaster simulation">
      <div className="im-head">
        <div>
          <span className="mono-label">Disaster simulation · FEMA zones on real streets</span>
          <p className="im-title">An old age home at {p.name}</p>
        </div>
      </div>

      <div className="seg-group ds-tabs" role="radiogroup" aria-label="Scenario">
        {SCENARIOS.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={scenario === s.id} className={`seg${scenario === s.id ? ' is-on' : ''}`} onClick={() => setScenario(s.id)}>
            {s.id === 'blackout' ? <Zap size={13} strokeWidth={1.8} /> : <Waves size={13} strokeWidth={1.8} />} {s.label}
          </button>
        ))}
      </div>

      {loading && <p className="mono-label im-loading">Loading flood zones and streets…</p>}
      {!loading && !ran && (
        <button type="button" className="btn-primary im-run" onClick={onRun}>
          <Play size={14} strokeWidth={2} /> Run the disaster
        </button>
      )}

      {!loading && (
        <>
          <motion.p key={scenario + p.id} className={`ds-verdict${o.wet || (o.out === null && !o.stay) ? ' is-bad' : ''}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            {o.verdict}
          </motion.p>
          <dl className="im-stats">
            <div>
              <dt className="mono-label">
                Building <Cites ids={[`${p.id}:fema`]} />
              </dt>
              <dd className="ds-text">{scenario === 'blackout' ? 'Dry' : o.wet ? 'In the zone' : 'Dry'}</dd>
            </div>
            <div>
              <dt className="mono-label">
                Road out of the area <Cites ids={[`${p.id}:fema`, `${p.id}:osmwalk`]} />
              </dt>
              <dd className={`ds-text${o.out === null ? ' is-bad' : ''}`}>{o.out === null ? 'Cut off' : km(o.out)}</dd>
              {o.out !== null && o.normal !== null && o.out > o.normal + 20 && <span className="im-was">normally {km(o.normal)}</span>}
            </div>
            <div>
              <dt className="mono-label">
                Night evacuation <Cites ids={['C1', 'C2', 'C3']} />
              </dt>
              <dd className={`ds-text${(o.evac ?? 0) > CARE.badMin * 0.75 ? ' is-bad' : ''}`}>{o.evac === null ? '—' : `${o.evac} min`}</dd>
              {result.evac && <span className="im-was">{result.evac.staff} staff · {result.evac.assisted} need help</span>}
            </div>
            <div>
              <dt className="mono-label">
                Stay put? <Cites ids={['C4', `${p.id}:scan`]} />
              </dt>
              <dd className={`ds-text${o.stay ? '' : ' is-bad'}`}>{o.stay ? 'Yes' : 'No'}</dd>
              <span className="im-was">{result.checks.find((x) => x.id === 'power')?.observed}</span>
            </div>
          </dl>

          <div className="ds-matrix">
            <span className="mono-label">Every building, every scenario</span>
            <table>
              <thead>
                <tr>
                  <th />
                  {SCENARIOS.map((s) => (
                    <th key={s.id} className={s.id === scenario ? 'is-on' : ''}>
                      {s.short}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.property.id} className={`${r.property.id === p.id ? 'is-me' : ''}${r.status !== 'pass' ? ' is-out' : ''}`} onClick={() => onPick(r.property.id)}>
                    <th>
                      {r.status === 'pass' ? <span className="ds-rank">{passes.indexOf(r) + 1}</span> : <span className="ds-rank is-out">×</span>}
                      {r.property.name}
                    </th>
                    {SCENARIOS.map((s) => {
                      const x = outcome(r, s.id)
                      const bad = x.wet || (x.out === null && !x.stay)
                      const warn = !bad && x.out === null
                      const text = s.id === 'blackout' ? (x.stay ? 'Stay' : `${x.evac} min`) : x.wet ? 'Floods' : x.out === null ? 'Cut off' : km(x.out)
                      return (
                        <td key={s.id} className={`${bad ? 'is-bad' : warn ? 'is-warn' : ''}${s.id === scenario ? ' is-on' : ''}`} title={x.verdict}>
                          {text}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <span className="mono-label ds-key">Floods: km = road out of the area · Cut off = no dry road · Blackout: Stay = backup cooling, else night evacuation minutes · click a row</span>
          </div>

          {stretch && <BudgetStepCard step={stretch} onApply={onStretch} />}

          <dl className="ds-facts">
            <div>
              <dt className="mono-label">Hospital</dt>
              <dd>{p.metrics.hospital ? `${p.metrics.hospital.name ?? 'Hospital'}, ${km(p.metrics.hospital.m)}` : 'None mapped within 2.6 km'}</dd>
            </div>
            {t.over65 != null && (
              <div>
                <dt className="mono-label">
                  65+ in this tract <Cites ids={[`${p.id}:tract`]} />
                </dt>
                <dd>
                  {t.over65.toLocaleString('en-US')} ({(t.over80 ?? 0).toLocaleString('en-US')} aged 80+)
                </dd>
              </div>
            )}
          </dl>
          <p className="fig mono-label">Fig 05 · Flood zones: FEMA National Flood Hazard Layer · streets: OpenStreetMap, flooded segments removed · evacuation times are a staffing model, not a drill</p>
        </>
      )}
    </section>
  )
}
