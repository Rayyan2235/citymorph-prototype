# CityMorph 2.0

CityMorph finds existing buildings that could become the services a neighborhood needs. It checks every candidate against hard rules in code, ranks the ones that pass with an explainable score, morphs the best one into a concept floorplan in a Transformation Studio, and simulates how the new facility changes walking access across the real street network.

> **What is real and what is simulated.**
> **Real public data:** building footprints, streets, footpaths, transit stops, parks and existing facilities (OpenStreetMap, via Overpass), and tract population and children under 5 (US Census ACS 5-year, via Census Reporter). This data is fetched by `scripts/fetch-geo.mjs` and baked into the repo.
> **Simulated, and labelled in the UI:** listings, vacancy, use, storeys where OSM has none, interiors and doors, yards, LA zone readings, costs and every planning ratio. Nothing is presented as a live CoStar, Matterport or Vexcel result. Every number cites its source in the evidence trail.

## Run

```
npm install
npm run dev
```

Open http://localhost:5173. For the judge laptop, run `npm run build`, then `npx vite preview --port 5179`.

| URL | What it does |
| --- | --- |
| `/` | Step 1. Edit the need sentence, then press the dock button (or the right arrow key). |
| `/?demo=auto` | Plays the whole journey hands free: Find, Check, Studio, a budget cut that rejects the leader, then the impact simulation. |

## The journey

1. **Need.** A fill-in sentence whose blanks are real controls: facility type (learning center, childcare center, pediatric clinic), capacity and budget. A city switch (Houston, Los Angeles) and an address search (OpenStreetMap Nominatim) sit in the top bar.
2. **Find.** Five candidates per city drop onto the 3D map as their real OSM footprints, extruded by storey. Click any other building and CityMorph explains why it is not a candidate.
3. **Check.** The Inspector checks the candidates one at a time against 4 to 6 hard rules: step free entry, fits the program, one level, budget, plus zoning (LA) and outdoor play (childcare, or when a playground is requested). A building that fails is stamped Rejected, and the log says "rejected → checking the next one". The passing buildings are then ranked by a 7-part score: room to grow, accessibility, transit access (walked on OSM streets), outdoor space, budget left, zoning and readiness. Open any row for the score breakdown, or tick two rows to compare them side by side.
4. **Studio.** An isometric digital twin of the chosen building, drawn to its real footprint. The old interior sinks away, the generated rooms slide in, new walls rise in orange, and people walk in through the step free door. You can:
   - click a room for its purpose and notes, and scroll or drag to zoom and pan;
   - switch the facility type or the layout option;
   - change capacity, the outdoor playground, wheelchair access first, and the budget.

   Every change regenerates the plan, the work list and the economics. If the building now fails a rule, it is stamped, and the next best building takes over. Conflicts come with one-click fixes.
5. **Impact.** Press Simulate impact. The network lights up outward from the site. Streets whose nearest facility of this type got closer turn orange, and the dashed outline is the 10-minute walk catchment. Walking routes are traced from the nearest transit stops. The panel estimates residents (or children under 5) served, capacity, the change in street coverage, minutes saved, and reuse versus new construction in cost and months.

The agent log (Translator, Scout, Inspector, Ranker, Planner, Economist, Simulator) narrates each step. Every line is computed from the evaluator; no language model runs in this prototype.

## How it decides

| File | Role |
| --- | --- |
| `src/data/config.ts` | One source of truth for every planning number: cities, facility room programs, unit costs, score weights and impact assumptions. Each one cites an evidence id. |
| `src/data/candidates.ts` | Sample property records, merged with the real OSM footprint, the walking metrics and the Census tract. |
| `src/logic/layout.ts` | Generates the floorplan inside a box with the footprint's real proportions and area. Bands of rooms sit on either side of a corridor. A building much bigger than the program gets a right-sized block by the door plus spare space. It computes walls kept, removed and added. |
| `src/logic/costs.ts` | The work list. Quantities come from the plan (feet of wall, rooms, doors); unit costs come from config. |
| `src/logic/evaluate.ts` | Deterministic rules, the score, conflicts with suggested fixes, and the largest capacity each building can hold. |
| `src/logic/geo.ts`, `src/logic/impact.ts` | Footprint geometry, Dijkstra on the walking network, catchment, before/after access to the nearest existing facility, and transit routes. |

## Refreshing the real data

```
node scripts/fetch-geo.mjs        # OSM + Census for each site (slow when Overpass is busy)
node scripts/derive-geo.ts        # walking metrics per site
npx tsx scripts/calibrate.ts      # print what the evaluator decides per city and facility
```

The fetch avoids named or business-tagged buildings, so no real business gets a simulated "for lease" label.

## Design

The Kiln token structure, with this project's own type and palette: Inter Tight 600 for display, Inter for UI, Geist Mono for labels; paper `#F7F2E7`, ink `#171717`, and one accent `#D4501E`. Orange only marks what changed: the chosen building, new walls, a new exit, a replanned price, streets made closer. Failure is ink, never red. A hard 4px paper offset shadow appears only on panels floating over the map.

New components: Studio, ImpactPanel, AgentLog, SearchBox, ComparePanel and ScoreBars, plus IsoPlan (now with hotspots, zoom and pan, yard, exits and the accessible route), Shortlist, Beam (a port of Magic UI's Animated Beam, MIT, with no gradient), CostBar and WorkList, Cite, MapStage and Journey.

## Credits

Map data © OpenStreetMap contributors (ODbL), via Overpass and Nominatim. Tiles by OpenFreeMap and OpenMapTiles. Population data from US Census ACS 5-year, via Census Reporter. Aerial thumbnails © Esri, Maxar, Earthstar Geographics, labelled as a Vexcel stand-in. Fonts: Inter, Inter Tight, Geist Mono (SIL OFL 1.1). Number Flow by Maxwell Barvian (MIT). Patterns studied with rea: Giraffe, Rayon, Archistar, UpCodes, Magic UI, Arcol, TestFit, Felt and Placer.ai.
