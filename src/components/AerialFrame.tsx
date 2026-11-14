// Aerial stand-in. Plain image tiles (no second WebGL canvas), from Esri World
// Imagery, clearly labelled as a stand-in until Vexcel keys arrive.
const Z = 19

function tileOf(lng: number, lat: number) {
  const n = 2 ** Z
  const x = ((lng + 180) / 360) * n
  const r = (lat * Math.PI) / 180
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n
  return { x, y }
}

export function AerialFrame({ lngLat, name }: { lngLat: [number, number]; name: string }) {
  const t = tileOf(lngLat[0], lngLat[1])
  const tx = Math.floor(t.x)
  const ty = Math.floor(t.y)
  // offset so the property sits in the middle of the 3x3 grid
  const ox = (t.x - tx) * 100
  const oy = (t.y - ty) * 100
  const tiles = []
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      tiles.push(
        <img
          key={`${dx}${dy}`}
          src={`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${Z}/${ty + dy}/${tx + dx}`}
          alt=""
          loading="lazy"
          draggable={false}
        />,
      )
  return (
    <figure className="aerial">
      <div className="aerial-view" aria-label={`Aerial view near ${name}`} role="img">
        <div className="aerial-grid" style={{ left: `${-(50 + ox)}%`, top: `${-(50 + oy)}%` }}>
          {tiles}
        </div>
        <span className="aerial-target" aria-hidden="true" />
      </div>
      <figcaption className="label">Aerial · stand-in for Vexcel · Imagery Esri, Maxar, Earthstar Geographics</figcaption>
    </figure>
  )
}
