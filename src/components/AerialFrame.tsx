// Aerial stand-in. Plain image tiles (no second WebGL canvas), from Esri World
// Imagery, clearly labelled as a stand-in until Vexcel keys arrive.
function tileOf(lng: number, lat: number, z: number) {
  const n = 2 ** z
  const x = ((lng + 180) / 360) * n
  const r = (lat * Math.PI) / 180
  const y = ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n
  return { x, y }
}

interface Props {
  lngLat: [number, number]
  name: string
  z?: number
  className?: string
  target?: boolean
}

// A 3x3 tile grid centred on the property, cropped by its frame.
export function Aerial({ lngLat, name, z = 19, className = '', target = true }: Props) {
  const t = tileOf(lngLat[0], lngLat[1], z)
  const tx = Math.floor(t.x)
  const ty = Math.floor(t.y)
  const ox = (t.x - tx) * 100
  const oy = (t.y - ty) * 100
  const tiles = []
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++)
      tiles.push(
        <img
          key={`${dx}${dy}`}
          src={`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty + dy}/${tx + dx}`}
          alt=""
          loading="lazy"
          draggable={false}
        />,
      )
  return (
    <div className={`aerial ${className}`} role="img" aria-label={`Aerial view near ${name}`}>
      <div className="aerial-grid" style={{ left: `${-(50 + ox)}%`, top: `${-(50 + oy)}%` }}>
        {tiles}
      </div>
      {target && <span className="aerial-target" aria-hidden="true" />}
    </div>
  )
}

export const AERIAL_CREDIT = 'Aerial stand-in for Vexcel · Imagery Esri, Maxar, Earthstar Geographics'
