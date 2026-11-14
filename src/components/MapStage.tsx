import { useEffect, useRef, useState } from 'react'
import * as maplibregl from 'maplibre-gl'
import type { Map as MLMap, Marker } from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import { CITIES, type CityId } from '../data/config'
import type { Result } from '../logic/evaluate'
import type { Impact } from '../logic/impact'
import { routeOut, type LngLat, type SiteGeo } from '../logic/geo'

// The worker is self contained; ship it as an asset so dev and build both work.
maplibregl.setWorkerUrl(workerUrl)

const STYLE = 'https://tiles.openfreemap.org/styles/positron'
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

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
  const ink = token('--ink')
  const accent = token('--accent')
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
      set(id, 'fill-opacity', 0.9)
    } else if (id === 'building') set(id, 'fill-opacity', 0)
    else if (layer.type === 'line' && id.startsWith('highway')) {
      set(id, 'line-color', id.includes('motorway') ? stone : id.includes('major') || id.includes('trunk') ? hairline : raised)
    } else if (layer.type === 'line' && id.startsWith('railway')) set(id, 'line-color', stone)
    else if (layer.type === 'line' && (id.startsWith('boundary') || id.includes('waterway'))) set(id, 'line-opacity', 0)
    else if (layer.type === 'symbol' && !id.startsWith('cm-')) {
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

  // Our own sources: candidates (real OSM footprints) and impact overlays.
  const src = (id: string) => !map.getSource(id) && map.addSource(id, { type: 'geojson', data: EMPTY })
  ;['cm-cands', 'cm-streets', 'cm-catch', 'cm-routes', 'cm-stops', 'cm-exist', 'cm-allstops', 'cm-flood', 'cm-cut', 'cm-out'].forEach(src)
  const add = (spec: maplibregl.LayerSpecification, before?: string) => !map.getLayer(spec.id) && map.addLayer(spec, before)
  // Disaster layers: FEMA flood zones as ink water, cut streets dashed ink, the road out in orange.
  add({ id: 'cm-flood-fill', type: 'fill', source: 'cm-flood', paint: { 'fill-color': ink, 'fill-opacity': 0 } }, 'kiln-3d')
  add({ id: 'cm-flood-line', type: 'line', source: 'cm-flood', paint: { 'line-color': ink, 'line-width': 0.8, 'line-opacity': 0 } }, 'kiln-3d')
  add({ id: 'cm-cut', type: 'line', source: 'cm-cut', layout: { 'line-cap': 'round' }, paint: { 'line-color': ink, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1.4, 16, 3], 'line-dasharray': [1, 1.5], 'line-opacity': 0 } })
  add({ id: 'cm-out', type: 'line', source: 'cm-out', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': accent, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 2.5, 16, 5], 'line-opacity': 0 } })
  set('cm-flood-fill', 'fill-color', ink)
  set('cm-flood-line', 'line-color', ink)
  set('cm-cut', 'line-color', ink)
  set('cm-out', 'line-color', accent)
  add({ id: 'cm-catch-fill', type: 'fill', source: 'cm-catch', paint: { 'fill-color': ink, 'fill-opacity': 0.04 } }, 'kiln-3d')
  add({ id: 'cm-catch-line', type: 'line', source: 'cm-catch', paint: { 'line-color': ink, 'line-width': 1.2, 'line-dasharray': [3, 2], 'line-opacity': 0.7 } }, 'kiln-3d')
  add({ id: 'cm-streets', type: 'line', source: 'cm-streets', layout: { 'line-cap': 'round' }, paint: { 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1.2, 16, 3.2], 'line-opacity': 0 } }, 'kiln-3d')
  add({ id: 'cm-routes', type: 'line', source: 'cm-routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': ink, 'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1.5, 16, 3.5], 'line-dasharray': [1, 2], 'line-opacity': 0.9 } })
  add({ id: 'cm-allstops', type: 'circle', source: 'cm-allstops', minzoom: 12, paint: { 'circle-radius': ['case', ['==', ['get', 'kind'], 'bus'], 2.6, 4.5], 'circle-color': raised, 'circle-stroke-color': ink, 'circle-stroke-width': 1.2 } })
  set('cm-allstops', 'circle-color', raised)
  set('cm-allstops', 'circle-stroke-color', ink)
  add({ id: 'cm-exist', type: 'circle', source: 'cm-exist', paint: { 'circle-radius': 5, 'circle-color': raised, 'circle-stroke-color': ink, 'circle-stroke-width': 1.5 } })
  add({ id: 'cm-stops', type: 'circle', source: 'cm-stops', paint: { 'circle-radius': ['case', ['==', ['get', 'route'], 1], 5, 3], 'circle-color': ink, 'circle-stroke-color': raised, 'circle-stroke-width': 1.5 } })
  add({ id: 'cm-stops-t', type: 'symbol', source: 'cm-stops', filter: ['==', ['get', 'route'], 1], layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-font': ['Noto Sans Regular'] }, paint: { 'text-color': ink, 'text-halo-color': paper, 'text-halo-width': 1.5 } })
  add({
    id: 'cm-cands-3d',
    type: 'fill-extrusion',
    source: 'cm-cands',
    paint: {
      'fill-extrusion-color': ['case', ['==', ['get', 'sel'], 1], accent, ['==', ['get', 'out'], 1], sunk, muted],
      'fill-extrusion-height': ['get', 'h'],
      'fill-extrusion-opacity': 0.96,
    },
  })
  set('cm-cands-3d', 'fill-extrusion-color', ['case', ['==', ['get', 'sel'], 1], accent, ['==', ['get', 'out'], 1], sunk, muted])
  set('cm-catch-fill', 'fill-color', ink)
  set('cm-catch-line', 'line-color', ink)
  set('cm-routes', 'line-color', ink)
  set('cm-stops', 'circle-color', ink)
  set('cm-stops', 'circle-stroke-color', raised)
  set('cm-exist', 'circle-color', raised)
  set('cm-exist', 'circle-stroke-color', ink)
  set('cm-stops-t', 'text-color', ink)
  set('cm-stops-t', 'text-halo-color', paper)
  // Street heat: ink ramp by walk time to the nearest facility; streets the
  // new facility brings closer turn orange, the one colour for change.
  set('cm-streets', 'line-color', [
    'case',
    ['all', ['==', ['get', 'view'], 1], ['==', ['get', 'imp'], 1]],
    accent,
    ['interpolate', ['linear'], ['get', 'd'], 0, ink, 800, muted, 1600, stone, 2400, hairline],
  ])
}

export type MapMode = 'idle' | 'overview' | 'focus' | 'studio' | 'impact'

export interface OtherBuilding {
  lngLat: LngLat
  height: number | null
}

interface Props {
  city: CityId
  results: Result[]
  shown: string[]
  selected: string | null
  onSelect: (id: string) => void
  onOther: (b: OtherBuilding | null) => void
  theme: string
  mode: MapMode
  padRight: number
  padBottom: number
  showChecks: boolean
  focus: { lngLat: LngLat; label: string; key: number } | null
  impact: Impact | null
  view: 'before' | 'after'
  reveal: number // 0..1, how far the impact has spread from the site
  stops: { at: LngLat; kind: string }[] // every OSM stop near the city's candidates
  proposed: string // facility label shown on the site in the impact view
  disaster: { geo: SiteGeo; site: LngLat; scenario: 'z100' | 'z500' | 'blackout'; reveal: number } | null
}

export function MapStage({ city, results, shown, selected, onSelect, onOther, theme, mode, padRight, padBottom, showChecks, focus, impact, view, reveal, stops, proposed, disaster }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const markers = useRef<Map<string, Marker>>(new Map())
  const searchMarker = useRef<Marker | null>(null)
  const [ready, setReady] = useState(false)
  const cb = useRef({ onSelect, onOther })
  cb.current = { onSelect, onOther }

  useEffect(() => {
    if (!box.current) return
    const c = CITIES[city]
    const map = new maplibregl.Map({
      container: box.current,
      style: STYLE,
      center: c.center,
      zoom: c.zoom,
      pitch: 0,
      attributionControl: { compact: true },
      canvasContextAttributes: { antialias: true },
    })
    mapRef.current = map
    ;(window as unknown as { __cm: MLMap }).__cm = map // handle for demo checks in a browser console
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left')
    map.on('load', () => {
      paint(map)
      setReady(true)
    })
    // Click a candidate to open it; click any other building to see why it is not one.
    map.on('click', (e) => {
      const cand = map.queryRenderedFeatures(e.point, { layers: ['cm-cands-3d'] })[0]
      if (cand) {
        cb.current.onOther(null)
        cb.current.onSelect(String(cand.properties.id))
        return
      }
      const b = map.queryRenderedFeatures(e.point, { layers: ['kiln-3d'] })[0]
      if (b) cb.current.onOther({ lngLat: [e.lngLat.lng, e.lngLat.lat], height: b.properties?.render_height ?? null })
      else cb.current.onOther(null)
    })
    map.on('mousemove', (e) => {
      const hit = map.queryRenderedFeatures(e.point, { layers: ['cm-cands-3d'] }).length > 0
      map.getCanvas().style.cursor = hit ? 'pointer' : ''
    })
    const ms = markers.current
    return () => {
      ms.forEach((m) => m.remove())
      ms.clear()
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (map && ready) paint(map)
  }, [theme, ready])

  // Candidate footprints, extruded by storeys. Rejected ones sink to paper.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const data: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: results
        .filter((r) => shown.includes(r.property.id))
        .map((r) => ({
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [r.property.ring] },
          properties: { id: r.property.id, h: r.property.floors * 4.6 + (selected === r.property.id ? 1.5 : 0), sel: selected === r.property.id ? 1 : 0, out: showChecks && r.status === 'fail' ? 1 : 0 },
        })),
    }
    ;(map.getSource('cm-cands') as maplibregl.GeoJSONSource | undefined)?.setData(data)
  }, [results, shown, selected, showChecks, ready])

  // Pins: rank badge, name and estimated cost. Hidden during the impact view.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const ranks = results.filter((r) => r.status === 'pass').map((r) => r.property.id)
    const keep = new Set(results.filter((r) => shown.includes(r.property.id) && (mode !== 'impact' || r.property.id === selected)).map((r) => r.property.id))
    markers.current.forEach((m, id) => {
      if (!keep.has(id)) {
        m.remove()
        markers.current.delete(id)
      }
    })
    results.forEach((r) => {
      const id = r.property.id
      if (!keep.has(id)) return
      let m = markers.current.get(id)
      if (!m) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation()
          cb.current.onSelect(id)
        })
        m = new maplibregl.Marker({ element: btn, anchor: 'bottom' }).setLngLat(r.property.lngLat).addTo(map)
        markers.current.set(id, m)
      }
      m.setLngLat(r.property.lngLat)
      const pass = r.status === 'pass'
      const rank = ranks.indexOf(id) + 1
      const out = showChecks && !pass
      const el = m.getElement()
      el.className = `pin${out ? ' is-out' : ''}${selected === id ? ' is-selected' : ''}`
      el.setAttribute('aria-label', `${r.property.name}${showChecks ? (pass ? `, rank ${rank}` : ', rejected') : ''}`)
      const badge = showChecks ? (pass ? String(rank) : '×') : '•'
      const why = r.checks.find((c) => !c.pass)
      el.innerHTML = `<span class="pin-card"><span class="pin-badge">${badge}</span><span class="pin-name">${r.property.name}</span><span class="pin-cost">${mode === 'impact' && view === 'after' ? `Proposed ${proposed}` : out ? (why?.fail ?? 'Out') : showChecks ? `$${Math.round(r.cost / 1000)}k` : r.property.area}</span></span><span class="pin-stem"></span>`
    })
  }, [results, shown, selected, ready, showChecks, mode, view, proposed])

  // Camera.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const reduce = document.documentElement.dataset.motion === 'off'
    const padding = { top: 90, bottom: padBottom, left: 60, right: padRight }
    const c = CITIES[city]
    const sel = results.find((r) => r.property.id === selected)?.property
    if (mode === 'idle') {
      map.flyTo({ center: c.center, zoom: c.zoom, pitch: 0, bearing: 0, padding: { top: 0, bottom: 0, left: 0, right: 0 }, duration: reduce ? 0 : 1600, essential: true })
      return
    }
    if (mode === 'overview' || !sel) {
      const pts = results.filter((r) => shown.includes(r.property.id)).map((r) => r.property.lngLat)
      if (!pts.length) {
        map.flyTo({ center: c.center, zoom: c.zoom + 0.8, pitch: 40, bearing: -12, padding, duration: reduce ? 0 : 1800, essential: true })
        return
      }
      // Fit by hand: fitBounds adds the padding left over from earlier
      // flights to its own, which zooms out far too much.
      const lons = pts.map((p) => p[0])
      const lats = pts.map((p) => p[1])
      const my = (lat: number) => (1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2
      const dx = (Math.max(...lons) - Math.min(...lons)) / 360 || 1e-6
      const dy = Math.abs(my(Math.max(...lats)) - my(Math.min(...lats))) || 1e-6
      const el = map.getContainer()
      // Leave room for the agent log (bottom left) and the dock.
      if (el.clientWidth > 900) {
        padding.left = 420
        padding.bottom = Math.max(padding.bottom, 150)
      }
      const availW = Math.max(200, el.clientWidth - padding.left - padding.right - 80)
      const availH = Math.max(200, el.clientHeight - padding.top - padding.bottom - 80)
      const zoom = Math.min(13.2, Math.log2(Math.min(availW / (dx * 512), availH / (dy * 512))) - 0.35)
      const center: LngLat = [(Math.max(...lons) + Math.min(...lons)) / 2, (Math.max(...lats) + Math.min(...lats)) / 2]
      map.flyTo({ center, zoom, padding, pitch: 45, bearing: -12, duration: reduce ? 0 : 2000, essential: true })
      return
    }
    const zoom = mode === 'impact' ? 14.6 : 16.9
    map.flyTo({ center: sel.lngLat, zoom, pitch: mode === 'impact' ? 42 : 60, bearing: mode === 'impact' ? -10 : -28, padding, duration: reduce ? 0 : 2400, essential: true })
  }, [selected, mode, ready, city, results, shown, padRight, padBottom])

  // Search result: fly there and drop a marker.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !focus) return
    searchMarker.current?.remove()
    const el = document.createElement('div')
    el.className = 'search-pin'
    el.innerHTML = `<span class="search-pin-label">${focus.label.replace(/[<>&]/g, '')}</span>`
    searchMarker.current = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(focus.lngLat).addTo(map)
    map.flyTo({ center: focus.lngLat, zoom: 16.4, pitch: 50, duration: 1800, essential: true })
  }, [focus, ready])

  // Disaster overlays: recompute the cut streets and the road out per scenario.
  const dGeo = disaster?.geo
  const dScenario = disaster?.scenario
  const dSite = disaster?.site
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const set = (id: string, data: GeoJSON.FeatureCollection) => (map.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData(data)
    if (!dGeo || !dScenario || !dSite || mode !== 'impact') {
      ;['cm-flood', 'cm-cut', 'cm-out'].forEach((id) => set(id, EMPTY))
      return
    }
    const fl = dGeo.flood ?? { z100: [], z500: [] }
    const ringsFor = dScenario === 'z100' ? fl.z100 : dScenario === 'z500' ? [...fl.z100, ...fl.z500] : []
    set('cm-flood', { type: 'FeatureCollection', features: ringsFor.map((r) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [r] }, properties: {} })) })
    const out = routeOut(dGeo, dSite, dScenario === 'blackout' ? null : dScenario)
    set('cm-cut', { type: 'FeatureCollection', features: dGeo.edges.filter((_, i) => out.cut[i]).map(([a, b]) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: [dGeo.nodes[a], dGeo.nodes[b]] }, properties: {} })) })
    set('cm-out', out.path.length > 1 ? { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates: out.path }, properties: {} }] } : EMPTY)
  }, [dGeo, dScenario, dSite, mode, ready])

  // The water rises: zones fade in, then cut streets, then the road out.
  const dReveal = disaster?.reveal ?? 0
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !map.getLayer('cm-flood-fill')) return
    const r = mode === 'impact' ? dReveal : 0
    map.setPaintProperty('cm-flood-fill', 'fill-opacity', Math.min(1, r / 0.5) * 0.22)
    map.setPaintProperty('cm-flood-line', 'line-opacity', Math.min(1, r / 0.5) * 0.6)
    map.setPaintProperty('cm-cut', 'line-opacity', Math.max(0, Math.min(1, (r - 0.35) / 0.35)) * 0.9)
    map.setPaintProperty('cm-out', 'line-opacity', Math.max(0, Math.min(1, (r - 0.7) / 0.3)))
  }, [dReveal, mode, ready])

  // Real transit stops around the candidates, shown outside the impact view.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const data: GeoJSON.FeatureCollection = mode === 'impact' || mode === 'idle' ? EMPTY : { type: 'FeatureCollection', features: stops.map((s) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: s.at }, properties: { kind: s.kind } })) }
    ;(map.getSource('cm-allstops') as maplibregl.GeoJSONSource | undefined)?.setData(data)
  }, [stops, mode, ready])

  // Impact overlays on the real street network.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const set = (id: string, data: GeoJSON.FeatureCollection) => (map.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData(data)
    if (!impact || mode !== 'impact') {
      ;['cm-streets', 'cm-catch', 'cm-routes', 'cm-stops', 'cm-exist'].forEach((id) => set(id, EMPTY))
      return
    }
    const v = view === 'after' ? 1 : 0
    set('cm-streets', {
      type: 'FeatureCollection',
      features: impact.streets.features.map((f) => ({ ...f, properties: { ...f.properties, d: v ? f.properties.a : f.properties.b, view: v } })),
    })
    set('cm-catch', v ? { type: 'FeatureCollection', features: impact.catchment.length ? [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [impact.catchment] }, properties: {} }] : [] } : EMPTY)
    set('cm-routes', v ? { type: 'FeatureCollection', features: impact.routes.map((r) => ({ type: 'Feature', geometry: { type: 'LineString', coordinates: r.path }, properties: { name: r.name } })) } : EMPTY)
    const routeNames = new Set(impact.routes.map((r) => r.name))
    set('cm-stops', { type: 'FeatureCollection', features: impact.stops.map((s) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: s.at }, properties: { name: s.name ?? '', route: v && routeNames.has(s.name ?? (s.kind === 'bus' ? 'Bus stop' : 'Station')) ? 1 : 0 } })) })
    set('cm-exist', { type: 'FeatureCollection', features: impact.existing.map((x) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: x.at }, properties: { name: x.name ?? '' } })) })
  }, [impact, view, mode, ready])

  // The reveal: streets light up outward from the site as the simulation runs.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !map.getLayer('cm-streets')) return
    const r = impact ? reveal * (impact.maxS + 50) : 0
    map.setPaintProperty('cm-streets', 'line-opacity', ['case', ['<=', ['get', 's'], r], 0.95, view === 'before' ? 0.95 : 0.12])
    map.setPaintProperty('cm-routes', 'line-opacity', reveal > 0.55 ? 0.9 : 0)
  }, [reveal, impact, view, ready])

  return (
    <div className="map-stage">
      <div ref={box} className="map-canvas" />
    </div>
  )
}
