import NumberFlow from '@number-flow/react'
import { Bus, Play, TrainFront } from 'lucide-react'
import { FACILITIES, PLANNING, type FacilityId } from '../data/config'
import type { Impact } from '../logic/impact'
import type { Result } from '../logic/evaluate'
import { Cites } from './Cite'

const k = (n: number) => (n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n / 1000)}k`)
const pct = (n: number) => Math.round(n * 100)

interface Props {
  result: Result
  facility: FacilityId
  impact: Impact | null
  view: 'before' | 'after'
  setView: (v: 'before' | 'after') => void
  ran: boolean
  onRun: () => void
}

// Estimates on the real street network. Each number names its assumption.
export function ImpactPanel({ result, facility, impact, view, setView, ran, onRun }: Props) {
  const f = FACILITIES[facility]
  const p = result.property
  const after = view === 'after' && ran
  const servedLabel = f.servesTract === 'under5' ? 'Children under 5' : 'Residents'
  return (
    <section className="impact float" aria-label="Neighborhood impact">
      <div className="im-head">
        <div>
          <span className="mono-label">Neighborhood impact · estimates</span>
          <p className="im-title">
            A {f.label} at {p.name}
          </p>
        </div>
        <div className="seg-group" role="radiogroup" aria-label="Neighborhood view">
          {(['before', 'after'] as const).map((v) => (
            <button key={v} type="button" role="radio" aria-checked={view === v} className={`seg${view === v ? ' is-on' : ''}`} disabled={v === 'after' && !ran} onClick={() => setView(v)}>
              {v === 'before' ? 'Today' : 'Proposed'}
            </button>
          ))}
        </div>
      </div>

      {!impact && <p className="mono-label im-loading">Loading the street network…</p>}

      {impact && !ran && (
        <button type="button" className="btn-primary im-run" onClick={onRun}>
          <Play size={14} strokeWidth={2} /> Simulate impact
        </button>
      )}

      {impact && (
        <>
          <dl className="im-stats">
            <div>
              <dt className="mono-label">
                {servedLabel} within a {PLANNING.walkMinutes} min walk <Cites ids={[`${p.id}:tract`, 'I4', 'I2']} />
              </dt>
              <dd>
                <NumberFlow value={ran ? impact.served : 0} />
              </dd>
            </div>
            <div>
              <dt className="mono-label">
                {facility === 'clinic' ? 'Visits a day' : `${f.noun[0].toUpperCase()}${f.noun.slice(1)} served`} <Cites ids={['U1', f.ratioEv]} />
              </dt>
              <dd className={after ? 'is-changed' : ''}>
                <NumberFlow value={ran ? impact.capacity : 0} />
              </dd>
            </div>
            <div>
              <dt className="mono-label">
                Streets within {PLANNING.walkMinutes} min of a {f.label} <Cites ids={[`${p.id}:osmwalk`]} />
              </dt>
              <dd>
                <NumberFlow value={pct(after ? impact.coverAfter : impact.coverBefore)} suffix="%" />
                {after && <span className="im-was"> from {pct(impact.coverBefore)}%</span>}
              </dd>
            </div>
            <div>
              <dt className="mono-label">
                Minutes saved where it got closer <Cites ids={['I2']} />
              </dt>
              <dd className={after ? 'is-changed' : ''}>
                <NumberFlow value={after ? impact.minutesSaved : 0} format={{ maximumFractionDigits: 1 }} />
              </dd>
            </div>
          </dl>

          <div className="im-compare">
            <span className="mono-label">
              Reuse vs new construction <Cites ids={['A3', 'I1', 'I3']} />
            </span>
            {[
              { label: 'Reuse this building', cost: impact.reuseCost, months: impact.reuseMonths, me: true },
              { label: 'Build new (land not included)', cost: impact.newCost, months: impact.newMonths, me: false },
            ].map((row) => (
              <div key={row.label} className={`im-bar${row.me ? ' is-me' : ''}`}>
                <span className="im-bar-label">{row.label}</span>
                <span className="im-bar-track">
                  <span className="im-bar-fill" style={{ width: `${(row.cost / Math.max(impact.newCost, impact.reuseCost)) * 100}%` }} />
                </span>
                <span className="mono-label im-bar-v">
                  {k(row.cost)} · {row.months} mo
                </span>
              </div>
            ))}
            <p className="im-save">
              About <strong>{k(Math.max(0, impact.newCost - impact.reuseCost))}</strong> and <strong>{Math.max(0, impact.newMonths - impact.reuseMonths)} months</strong> saved, before land and financing.
            </p>
          </div>

          <div className="im-routes">
            <span className="mono-label">
              Walk from transit <Cites ids={[`${p.id}:osmwalk`]} />
            </span>
            {impact.routes.length === 0 && <p className="mono-label">No stop mapped within 1.3 km in OpenStreetMap.</p>}
            <ul>
              {impact.routes.map((r) => (
                <li key={r.name + r.m}>
                  {r.kind === 'bus' ? <Bus size={13} strokeWidth={1.8} /> : <TrainFront size={13} strokeWidth={1.8} />}
                  <span className="im-route-name">{r.name}</span>
                  <span className="mono-label">
                    {Math.max(1, Math.round(r.m / PLANNING.walkSpeedMpm))} min · {r.m} m
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="im-legend" aria-hidden="true">
            <span className="mono-label">Walk to the nearest {f.label}</span>
            <span className="im-ramp" />
            <span className="mono-label im-ramp-l">
              <span>0</span>
              <span>10 min</span>
              <span>30 min</span>
            </span>
            {after && (
              <span className="mono-label im-key">
                <i className="im-key-new" /> Closer because of this site
              </span>
            )}
          </div>
          <p className="fig mono-label">
            Fig 05 · Streets, stops and existing facilities from OpenStreetMap (incomplete for childcare) · population from the Census tract · catchment {impact.catchmentKm2} km²
          </p>
        </>
      )}
    </section>
  )
}
