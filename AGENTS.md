# CityMorph: agent guide

CityMorph is a HackPrinceton Fall 2026 project (CoStar track). Deadline: Sun Nov 15, 8:45 AM ET.

## Build on this prototype, never from scratch

All work happens in this repo, on a branch off `main`.

- Extend existing files first: engine changes in `src/logic/`, planning numbers in `src/data/config.ts`, property data in `src/data/candidates.ts`, UI in the existing components in `src/components/`.
- Add a new file only when no existing one fits, in the same folder pattern.
- Keep the stack: Vite, React, TypeScript, MapLibre, Motion. No new app, no new framework, no rewrite of a working component.
- Hidden features (Los Angeles, other facility types, walking impact) stay in the code. Hide or show them; do not delete them.
- If a request asks to start fresh, flag it to Rayyan before writing code.

## Project notes

The team's Obsidian vault (`citymorph-vault`, ask Rayyan for the zip) is the source of truth. Put its path on your machine in `CLAUDE.local.md` (git ignored), for example:

```
CityMorph notes: <PATH TO citymorph-vault>. Read _context.md and project-status.md there before planning or coding.
```

## Fixed choices

Houston only. Old age homes only. Five steps: Need, Find, Check, Studio, Disasters. Must-haves before nice-to-haves. The UI only shows values the engine in `src/logic/` computes.

## Honesty rules

No invented measurements, capacity, compliance, vacancy, costs or evacuation results. Real data (OpenStreetMap, US Census, FEMA) is labelled real; everything else is a labelled sample or assumption. Never imply a live CoStar, Matterport or Vexcel integration unless one exists.

## Secrets

Sponsor credentials live in `.env.local` (git ignored). Only `VITE_` prefixed values reach the browser; only the Matterport SDK key may be one. Never commit keys or paste them into notes, Devpost or screenshots.

## Working rules

- After an engine change, run `npx tsx scripts/calibrate.ts` and report the Houston carehome lines.
- Small commits, push often. No co-author or "Generated with" lines.
- Run: `npm install`, `npm run dev`. Judge build: `npm run build`, then `npx vite preview --port 5179`. Hands free demo: `/?demo=auto`.
