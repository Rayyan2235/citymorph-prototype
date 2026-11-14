import { useRef, useState } from 'react'
import { Building2, MapPin, Search } from 'lucide-react'
import { CITIES, type CityId } from '../data/config'
import { byCity } from '../data/candidates'
import type { LngLat } from '../logic/geo'

export interface Hit {
  label: string
  sub: string
  lngLat: LngLat
  candidate?: string
}

// Search candidates first, then addresses through OpenStreetMap Nominatim,
// bounded to the city. One request per submit, as Nominatim's policy asks.
export function SearchBox({ city, onPick }: { city: CityId; onPick: (h: Hit) => void }) {
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [busy, setBusy] = useState(false)
  const box = useRef<HTMLFormElement>(null)

  async function run(e: React.FormEvent) {
    e.preventDefault()
    const text = q.trim()
    if (!text) return
    const lower = text.toLowerCase()
    const local: Hit[] = byCity(city)
      .filter((c) => [c.name, c.area].some((s) => s.toLowerCase().includes(lower)))
      .map((c) => ({ label: c.name, sub: `Candidate · ${c.area}`, lngLat: c.lngLat, candidate: c.id }))
    setHits(local)
    setBusy(true)
    try {
      const [w, s, e2, n] = CITIES[city].bbox
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&bounded=1&viewbox=${w},${n},${e2},${s}&q=${encodeURIComponent(text)}`
      const res = await fetch(url, { headers: { Accept: 'application/json' } })
      const list: { display_name: string; lat: string; lon: string; type: string }[] = await res.json()
      setHits([...local, ...list.map((x) => ({ label: x.display_name.split(',').slice(0, 2).join(','), sub: x.display_name.split(',').slice(2, 4).join(',').trim() || x.type, lngLat: [Number(x.lon), Number(x.lat)] as LngLat }))])
    } catch {
      setHits(local.length ? local : [])
    } finally {
      setBusy(false)
    }
  }

  return (
    <form ref={box} className="search" role="search" onSubmit={run} onBlur={(e) => !box.current?.contains(e.relatedTarget as Node) && setHits(null)}>
      <Search size={14} strokeWidth={1.8} aria-hidden="true" />
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${CITIES[city].name} addresses`} aria-label="Search for a location or address" />
      {hits && (
        <ul className="search-hits float" role="listbox">
          {busy && <li className="mono-label search-note">Searching OpenStreetMap…</li>}
          {!busy && !hits.length && <li className="mono-label search-note">No match inside {CITIES[city].name}</li>}
          {hits.map((h, i) => (
            <li key={i}>
              <button
                type="button"
                onClick={() => {
                  onPick(h)
                  setHits(null)
                }}
              >
                {h.candidate ? <Building2 size={14} strokeWidth={1.7} /> : <MapPin size={14} strokeWidth={1.7} />}
                <span>
                  <span className="search-label">{h.label}</span>
                  <span className="mono-label">{h.sub}</span>
                </span>
              </button>
            </li>
          ))}
          <li className="mono-label search-note">Addresses · OpenStreetMap Nominatim</li>
        </ul>
      )}
    </form>
  )
}
