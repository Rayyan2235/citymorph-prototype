import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Map as MLMap, Marker } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'

// The worker is self contained; ship it as an asset so dev and build both work.
maplibregl.setWorkerUrl(workerUrl)
import type { PropertyId } from '../data/demo'
import type { Result } from '../logic/evaluate'

const STYLE = 'https://tiles.openfreemap.org/styles/positron'
const HOUSTON: [number, number] = [-95.405, 29.752]

function token(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

// Repaint the OpenFreeMap positron style with Kiln paper colours, read from
// the live tokens so light and dark themes both work.
function paint(map: MLMap) {
  const paper = token('--paper')
  const sunk = token('--paper-sunk')
  const raised = token('--paper-raised')
  const hairline = token('--hairline')
  const stone = token('--stone')
  const muted = token('--ink-muted')
  const accent = token('--accent')
  const set = (id: string, prop: string, value: unknown) => {
    if (map.getLayer(id)) map.setPaintProperty(id, prop as never, value as never)
  }
  for (const layer of map.getStyle().layers ?? []) {
    const id = layer.id
    if (layer.type === 'background') set(id, 'background-color', paper)
    else if (id === 'water') {
      set(id, 'fill-color', accent)
      set(id, 'fill-opacity', 0.1)
    } else if (id === 'park' || id.startsWith('landcover') || id.startsWith('landuse')) {
      set(id, 'fill-color', sunk)
      set(id, 'fill-opacity', 0.7)
    } else if (id === 'building') set(id, 'fill-opacity', 0)
    else if (layer.type === 'line' && id.startsWith('highway')) {
      set(id, 'line-color', id.includes('motorway') || id.includes('major') ? stone : hairline)
    } else if (layer.type === 'line' && id.startsWith('railway')) set(id, 'line-color', stone)
    else if (layer.type === 'line' && id.startsWith('boundary')) set(id, 'line-opacity', 0)
    else if (layer.type === 'symbol') {
      set(id, 'text-color', muted)
      set(id, 'text-halo-color', paper)
    }
  }
  if (!map.getLayer('kiln-3d')) {
    map.addLayer({
      id: 'kiln-3d',
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 13,
      paint: {
        'fill-extrusion-color': raised,
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.92,
        'fill-extrusion-vertical-gradient': true,
      },
    })
  } else {
    set('kiln-3d', 'fill-extrusion-color', raised)
  }
  set('pick-3d', 'fill-extrusion-color', token('--accent-fill'))
}

interface Props {
  results: Result[]
  shown: PropertyId[]
  selected: PropertyId | null
  onSelect: (id: PropertyId) => void
  theme: string
  overview: boolean
}

export function MapStage({ results, shown, selected, onSelect, theme, overview }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const markers = useRef<Map<PropertyId, Marker>>(new Map())
  const [ready, setReady] = useState(false)
  const [hud, setHud] = useState({ lat: HOUSTON[1], lng: HOUSTON[0], zoom: 10.6, bearing: 0 })

  useEffect(() => {
    if (!box.current) return
    const map = new maplibregl.Map({
      container: box.current,
      style: STYLE,
      center: HOUSTON,
      zoom: 10.6,
      pitch: 0,
      attributionControl: { compact: true },
      canvasContextAttributes: { antialias: true },
    })
    mapRef.current = map
    if (import.meta.env.DEV) (window as unknown as { __cm: MLMap }).__cm = map
    map.on('load', () => {
      paint(map)
      setReady(true)
    })
    map.on('move', () => {
      const c = map.getCenter()
      setHud({ lat: c.lat, lng: c.lng, zoom: map.getZoom(), bearing: map.getBearing() })
    })
    const ms = markers.current
    return () => {
      ms.forEach((m) => m.remove())
      ms.clear()
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (map && ready) paint(map)
  }, [theme, ready])

  // Pins: one HTML marker per shown property, restyled on every result change.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    results.forEach((r, i) => {
      const id = r.property.id
      let m = markers.current.get(id)
      if (!shown.includes(id)) {
        m?.remove()
        markers.current.delete(id)
        return
      }
      if (!m) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'pin'
        btn.addEventListener('click', () => onSelect(id))
        const created = new maplibregl.Marker({ element: btn, anchor: 'bottom' }).setLngLat(r.property.lngLat).addTo(map)
        markers.current.set(id, created)
        m = created
      }
      const el = m.getElement()
      el.className = `pin pin-${r.status}${selected === id ? ' is-selected' : ''}`
      el.setAttribute('aria-label', `${r.property.name}, ${r.status === 'pass' ? `rank ${i + 1}` : 'does not fit'}`)
      el.innerHTML = `<span class="pin-badge"><b>${r.status === 'pass' ? i + 1 : '×'}</b></span><span class="pin-name">${r.property.name}</span>`
    })
  }, [results, shown, selected, ready, onSelect])

  // Camera.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const reduce = document.documentElement.dataset.motion === 'off'
    if (overview || !selected) {
      map.flyTo({ center: [-95.41, 29.75], zoom: 11.4, pitch: 42, bearing: -12, duration: reduce ? 0 : 2200, essential: true })
      return
    }
    const p = results.find((r) => r.property.id === selected)?.property
    if (!p) return
    map.flyTo({ center: p.lngLat, zoom: 16.4, pitch: 62, bearing: -28, duration: reduce ? 0 : 2600, essential: true })
    // When the camera lands, lift the building under the pin in the accent fill.
    const land = () => {
      const pt = map.project(p.lngLat)
      const hits = map.queryRenderedFeatures(
        [
          [pt.x - 70, pt.y - 70],
          [pt.x + 70, pt.y + 70],
        ],
        { layers: ['kiln-3d'] },
      )
      // Tiles merge many footprints into one MultiPolygon, so split them and
      // keep the single polygon nearest the pin.
      type Geo = { type: string; coordinates?: unknown }
      const polys: { rings: number[][][]; h: number; d: number; area: number; c: [number, number] }[] = []
      for (const f of hits) {
        const g = f.geometry as Geo
        const list = g.type === 'Polygon' ? [g.coordinates as number[][][]] : g.type === 'MultiPolygon' ? (g.coordinates as number[][][][]) : []
        for (const rings of list) {
          const r = rings[0]
          const px = r.map((c) => map.project([c[0], c[1]]))
          let a = 0
          for (let i = 0; i < px.length - 1; i++) a += px[i].x * px[i + 1].y - px[i + 1].x * px[i].y
          const cx = r.reduce((s, c) => s + c[0], 0) / r.length
          const cy = r.reduce((s, c) => s + c[1], 0) / r.length
          const q = map.project([cx, cy])
          polys.push({ rings, h: Number(f.properties?.render_height ?? 8), d: Math.hypot(q.x - pt.x, q.y - pt.y), area: Math.abs(a) / 2, c: [cx, cy] })
        }
      }
      // The commercial building is the largest footprint close to the sample pin.
      const best = polys.filter((x) => x.d < 90).sort((a, b) => b.area - a.area)[0] ?? polys.sort((a, b) => a.d - b.d)[0]
      if (best) markers.current.get(p.id)?.setLngLat(best.c)
      const data = {
        type: 'FeatureCollection' as const,
        features: best ? [{ type: 'Feature' as const, geometry: { type: 'Polygon' as const, coordinates: best.rings }, properties: { h: best.h + 1 } }] : [],
      }
      const src = map.getSource('pick') as maplibregl.GeoJSONSource | undefined
      if (src) src.setData(data)
      else {
        map.addSource('pick', { type: 'geojson', data })
        map.addLayer({
          id: 'pick-3d',
          type: 'fill-extrusion',
          source: 'pick',
          paint: {
            'fill-extrusion-color': token('--accent-fill'),
            'fill-extrusion-height': ['get', 'h'],
            'fill-extrusion-opacity': 0.95,
          },
        })
      }
    }
    const afterMove = () => map.once('idle', land)
    map.once('moveend', afterMove)
    return () => {
      map.off('moveend', afterMove)
      map.off('idle', land)
    }
  }, [selected, overview, ready, results])

  return (
    <div className="map-stage">
      <div ref={box} className="map-canvas" />
      <div className="map-hud label" aria-hidden="true">
        <span>LAT {hud.lat.toFixed(4)}° N</span>
        <span>LON {Math.abs(hud.lng).toFixed(4)}° W</span>
        <span>BRG {(((hud.bearing % 360) + 360) % 360).toFixed(0).padStart(3, '0')}°</span>
        <span>ZOOM {hud.zoom.toFixed(1)}</span>
      </div>
    </div>
  )
}
