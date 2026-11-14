# CityMorph prototype

**World (Kiln):** an architect's survey of Houston, inked on warm paper. Plans, pins and the 3D city are all drawn in ink and paper; the one accent is blueprint navy, with a peach fill for proposed rooms.

CityMorph finds existing commercial buildings that could become the services a neighborhood needs, checks them against hard rules in code, and drafts a reuse plan that replans when the budget changes.

> **Sample records.** Every property, scan finding and cost here is a labelled sample standing in for the CoStar, Matterport and Vexcel APIs. The aerial image is Esri World Imagery, labelled as a Vexcel stand-in. Nothing is presented as a live integration.

## Run

```
npm install
npm run dev
```

Open http://localhost:5173.

| URL | What it does |
| --- | --- |
| `/` | Idle. Press **Find buildings**. |
| `/?demo=run` | Plays the run, flies to the top pick, opens the morph plan. |
| `/?demo=map` | Plays the run and stays on the map. |
| `/?demo=cut` | Plays the run, then cuts the budget to $90k and replans. Use it as the fallback if a live click fails. |

## 90 second demo path

1. "A Houston nonprofit needs a learning center for 40 people." Press **Find buildings**.
2. The agents run; three pins drop on the paper map. Fulton St is rejected: required step free entry, the interior scan shows 3 steps and no ramp.
3. The camera flies to Bellaire Blvd and lifts the building. The morph plan turns the retail floor into reception, two activity rooms, staff office and storage.
4. Hand the judge the budget slider. Drag to $90k. The evaluator reruns: Bellaire's core work ($110k, led by the change of use from retail) no longer fits, the old ranking is struck through, and Navigation Blvd office moves to first at about $51k.
5. Open **Evidence** if asked where a number comes from.

## How it decides

`src/logic/evaluate.ts` is deterministic. Four hard rules (step free entry, room for the program, one level, core work within budget) decide pass or fail. The fit score is 35% space, 25% budget left, 20% room fit, 20% evidence confidence. The agent text is generated from those results, not scripted.

## Kiln components used and added

Used: Button (pill with arrow chip), Tag, SpecSheet, segmented control from the sky picker pattern, tokens for all three themes.

New in this project (candidates for Kiln):

- **Cite** (`src/components/Cite.tsx`). Inline source chip with a hover card. Says the source in words ("Interior scan", "You said"); assumptions use a dashed border so a guess never looks like a fact. Consumer provides an evidence id. Rule: every number on screen gets one.
- **AgentRun** (`src/components/AgentRun.tsx`). The agent's plan as a checklist. On a replan, superseded lines are struck through and new lines appear under them. Consumer provides steps with an agent name, a title, a computed detail and citations. Rule: every line carries a number or a citation, never "Analyzing...".
- **MapStage** (`src/components/MapStage.tsx`). MapLibre with OpenFreeMap tiles repainted from Kiln tokens at runtime, 3D buildings, paper pins, a mono coordinate HUD, and the chosen building lifted in `accent-fill`. One WebGL canvas per page.
- **MorphPlan** (`src/components/MorphPlan.tsx`). A floor plan that morphs from today's rooms to proposed zones, with estimated areas and door markers. Consumer provides existing rooms and zones with from and to rectangles. Rule: label it conceptual; areas are estimates.
- **Results / TaskList** (`src/components/Results.tsx`). Paper shortlist cards with the same four bars in the same order, a required vs observed reject block, and a cost list with ranges where dropped work is struck through.

Known gap against the Kiln checklist: a few font sizes in `src/styles/app.css` are raw px values rather than type tokens.

## Credits

Map data © OpenStreetMap contributors, tiles by OpenFreeMap and OpenMapTiles. Aerial imagery © Esri, Maxar, Earthstar Geographics. Fonts: Fraunces, Figtree, Geist Mono, Caveat (SIL OFL 1.1). Patterns borrowed from Felt (paper map, coordinate HUD), Hypar (zone plans), TestFit (live metrics), Archistar (rule pass and fail), Cursor (plan checklist), Perplexity (inline citations), and 21st.dev components by Dice UI (compare slider) and Maxwell Barvian (Number Flow, MIT).
