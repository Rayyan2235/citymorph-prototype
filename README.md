# CityMorph prototype

CityMorph finds existing commercial buildings that could become the services a neighborhood needs, checks them against hard rules in code, and morphs the best one into a concept plan that replans when the budget changes.

> **Sample records.** Every property, scan finding and cost here is a labelled sample standing in for the CoStar, Matterport and Vexcel APIs. The aerial thumbnails are Esri World Imagery, labelled as a Vexcel stand-in. Nothing is presented as a live integration.

## Run

```
npm install
npm run dev
```

Open http://localhost:5173. For the judge laptop, `npm run build` then `npx vite preview --port 5179`.

| URL | What it does |
| --- | --- |
| `/` | Step 1. Press **Find buildings**, then the button in the bottom dock (or the right arrow key). |
| `/?demo=auto` | Plays all five steps hands free, including the budget cut to $90k. Use it as the fallback if a live click fails. `?demo=run` and `?demo=cut` do the same. |

## The journey (about 90 seconds)

The bottom dock shows where you are and the one thing to do next.

1. **Need.** A fill in sentence: a learning center for 40 people, 2 activity rooms, step free entry, under $150k. The blanks are the rules.
2. **Find.** Three buildings drop onto the 3D Houston map with their estimated cost on the pin. The panel lists them with aerial thumbnails.
3. **Check.** The same rows become a 4 rule grid. Fulton St fails step free entry (3 steps, no ramp) and one level; its pin goes flat and says why.
4. **Morph.** The camera flies to Bellaire Blvd and lifts the real building in orange. Beside it, an isometric cutaway turns the retail floor into reception, two activity rooms, storage and a staff office, then 40 people walk in through the step free door and sit. Drag Today / Proposed to scrub it.
5. **Replan.** Drag the budget to $90k. The cost bar shows Bellaire's core work ($110k) crossing the budget line, the plan is stamped Over budget, the ranking reorders, the camera flies to Navigation Blvd and the morph replays there at about $51k.

The ticker at the top shows one line at a time, each computed from the evaluator. Source icons (You, CoStar record, Interior scan, Aerial, Assumption) open the evidence trail.

## How it decides

`src/logic/evaluate.ts` is deterministic. Four hard rules (step free entry, room for the program, one level, core work within budget) decide pass or fail. The fit score is 35% space, 25% budget left, 20% room fit, 20% evidence confidence. Ticker lines and the "what changed" note are generated from those results, not scripted.

## Design

Kiln token structure, with this project's own type and palette (agreed with the planner sessions after studying Linear, Vercel, Raycast, Cursor and Arcol): Inter Tight 600 for display, Inter for UI, Geist Mono for labels; paper `#F7F2E7`, ink `#171717`, one accent `#D4501E`. Failure is ink strikethrough and muted, never red. Radius 4px for controls, 8px for cards, 999px for chips; one shadow, only on floating panels over the map.

New components (candidates for Kiln):

- **Journey** (`src/components/Journey.tsx`). Bottom dock: numbered stepper with a sliding active pill, Back, and a primary button that names the next step.
- **IsoPlan** (`src/components/IsoPlan.tsx`). Isometric cutaway driven by one progress value: fixtures sink, old walls lower, zones slide, new walls rise in the accent, people walk in and sit. Takes existing rooms, fixtures, zones and entrances. Always labelled concept, areas estimated.
- **Shortlist** (`src/components/Shortlist.tsx`). Building rows with aerial thumbnails that turn into a rule grid with staggered check and cross cells and a "why it failed" line.
- **CostBar / ReplanPanel** (`src/components/Replan.tsx`). Stacked work bar against a live budget line; core work over the line is hatched. Ranking reorders with layout animation.
- **Cite** (`src/components/Cite.tsx`). Source as an icon chip with a hover card; assumptions dashed.
- **MapStage** (`src/components/MapStage.tsx`). MapLibre repainted from tokens, 3D buildings, pill pins with rank, name and cost, and the chosen building lifted in the accent.

## Credits

Map data © OpenStreetMap contributors, tiles by OpenFreeMap and OpenMapTiles. Aerial imagery © Esri, Maxar, Earthstar Geographics. Fonts: Inter, Inter Tight, Geist Mono (SIL OFL 1.1). Number Flow by Maxwell Barvian (MIT). Patterns studied: Arcol and TestFit (metrics that follow the geometry), Felt (paper map), Rivian configurator (preview updates per step), Cursor (plan lines), Linear (product UI as the hero), Origin UI stepper and Dice UI compare slider on 21st.dev.
