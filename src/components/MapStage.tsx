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
const EMPTY = { type: 'FeatureCollection' as const, features: [] }

function token(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

// Repaint the OpenFreeMap positron style from the live tokens so light and
// dark themes both work: paper land, hairline water, raised roads.
function paint(map: MLMap) {
  const paper = token('--paper')
  const sunk = token('--paper-sunk')
  const raised = token('--paper-raised')
  const hairline = token('--hairline')
  const stone = token('--stone')
  const muted = token('--ink-muted')
  const set = (id: string, prop: string, value: unknown) => {
    if (map.getLayer(id)) map.setPaintProperty(id, prop as never, value as never)
  }
  for (const layer of map.getStyle().layers ?? []) {
    const id = layer.id
    if (layer.type === 'background') set(id, 'background-color', paper)
    else if (id === 'water') {
      set(id, 'fill-color', hairline)
      set(id, 'fill-opacity', 1)
    } else if (id === 'park' || id.startsWith('landcover') || id.startsWith('landuse')) {
      set(id, 'fill-color', sunk)
      set(id, 'fill-opacity', 0.8)
    } else if (id === 'building') set(id, 'fill-opacity', 0)
    else if (layer.type === 'line' && id.startsWith('highway')) {
      set(id, 'line-color', id.includes('motorway') ? stone : id.includes('major') || id.includes('trunk') ? hairline : raised)
    } else if (layer.type === 'line' && id.startsWith('railway')) set(id, 'line-color', stone)
    else if (layer.type === 'line' && (id.startsWith('boundary') || id.includes('waterway'))) set(id, 'line-opacity', 0)
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
        'fill-extrusion-opacity': 0.94,
        'fill-extrusion-vertical-gradient': true,
      },
    })
  } else set('kiln-3d', 'fill-extrusion-color', raised)
  set('pick-3d', 'fill-extrusion-color', token('--accent'))
}

export type MapMode = 'idle' | 'overview' | 'focus'

interface Props {
  results: Result[]
  shown: PropertyId[]
  selected: PropertyId | null
  onSelect: (id: PropertyId) => void
  theme: string
  mode: MapMode
  padRight: number
  padBottom: number
  showChecks: boolean
}

const short = (name: string) => name.replace(/ (retail flex|two storey office|single storey office)$/, '')

export function MapStage({ results, shown, selected, onSelect, theme, mode, padRight, padBottom, showChecks }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const markers = useRef<Map<PropertyId, Marker>>(new Map())
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!box.current) return
    const map = new maplibregl.Map({
      container: box.current,
      style: STYLE,
      center: HOUSTON,
      zoom: 10.4,
      pitch: 0,
      attributionControl: { compact: true },
      canvasContextAttributes: { antialias: true },
    })
    mapRef.current = map
    ;(window as unknown as { __cm: MLMap }).__cm = map // handle for demo checks in a browser console
    map.on('load', () => {
      paint(map)
      setReady(true)
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

  // Pins: rank badge, short name and estimated cost. Failed buildings go flat.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    let rank = 0
    results.forEach((r) => {
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
        btn.addEventListener('click', () => onSelect(id))
        const created = new maplibregl.Marker({ element: btn, anchor: 'bottom' }).setLngLat(r.property.lngLat).addTo(map)
        markers.current.set(id, created)
        m = created
      }
      const pass = r.status === 'pass'
      if (pass) rank += 1
      const out = showChecks && !pass
      const el = m.getElement()
      el.className = `pin${out ? ' is-out' : ''}${selected === id ? ' is-selected' : ''}`
      el.setAttribute('aria-label', `${r.property.name}${showChecks ? (pass ? `, rank ${rank}` : ', does not fit') : ''}`)
      const badge = showChecks ? (pass ? String(rank) : '×') : '•'
      const why = r.checks.find((c) => !c.pass)
      el.innerHTML = `<span class="pin-card"><span class="pin-badge">${badge}</span><span class="pin-name">${short(r.property.name)}</span><span class="pin-cost">${out ? (why?.fail ?? 'Out') : `$${Math.round(r.cost / 1000)}k`}</span></span><span class="pin-stem"></span>`
    })
  }, [results, shown, selected, ready, onSelect, showChecks])

  // Camera.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const reduce = document.documentElement.dataset.motion === 'off'
    const padding = { top: 80, bottom: padBottom, left: 40, right: padRight }
    const clearPick = () => (map.getSource('pick') as maplibregl.GeoJSONSource | undefined)?.setData(EMPTY)
    if (mode === 'idle') {
      clearPick()
      map.flyTo({ center: HOUSTON, zoom: 10.4, pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: reduce ? 0 : 1600, essential: true })
      return
    }
    if (mode === 'overview' || !selected) {
      clearPick()
      map.flyTo({ center: [-95.405, 29.752], zoom: 11.3, pitch: 48, bearing: -14, padding, duration: reduce ? 0 : 2200, essential: true })
      return
    }
    const p = results.find((r) => r.property.id === selected)?.property
    if (!p) return
    clearPick()
    // When the camera lands, lift the building under the pin in the accent.
    const land = () => {
      const pt = map.project(p.lngLat)
      const hits = map.queryRenderedFeatures(
        [
          [pt.x - 130, pt.y - 130],
          [pt.x + 130, pt.y + 130],
        ],
        { layers: ['kiln-3d'] },
      )
      // Tiles merge many footprints into one MultiPolygon, so split them.
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
      const best = polys.filter((x) => x.d < 130).sort((a, b) => b.area - a.area)[0] ?? polys.sort((a, b) => a.d - b.d)[0]
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
            'fill-extrusion-color': token('--accent'),
            'fill-extrusion-height': ['get', 'h'],
            'fill-extrusion-opacity': 0.92,
          },
        })
      }
    }
    const afterMove = () => map.once('idle', land)
    // Listen before flying: a zero length flight fires moveend synchronously.
    map.once('moveend', afterMove)
    map.flyTo({ center: p.lngLat, zoom: 16.8, pitch: 60, bearing: -28, padding, duration: reduce ? 0 : 2600, essential: true })
    return () => {
      map.off('moveend', afterMove)
      map.off('idle', land)
    }
  }, [selected, mode, ready, results, padRight, padBottom])

  return (
    <div className="map-stage">
      <div ref={box} className="map-canvas" />
    </div>
  )
}
