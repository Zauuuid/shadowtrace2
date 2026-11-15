# ShadowTrace

**Lunar south-pole landing planner** for NASA Space Apps Challenge 2026, *Lunar Landing Site Navigator*.

Two opening pages, then six short steps: **dates → spacecraft → site → landing ellipse → result → report**.

The result says whether the plan works (**Suitable / Rejected**) in one clear sentence, then gives:
- the exact dates when the Sun and Earth go away;
- a multi-year timeline with draggable handles;
- up to three nearby sites that pass every rule (searched over the whole map to 75° S) if the plan fails.

The report step prints a one-page mission card (PDF) and copies a link that reopens the same mission. The interface is fully bilingual (English and Arabic); the report is always in English.

## Data (NASA only)
- **Sun and Earth:** NASA JPL Horizons, hourly from Nov 2026 to Dec 2035. It matches direct Horizons queries within 0.006° (`scripts/verify_horizons.py`).
- **Terrain and horizons:** NASA LRO LOLA (PDS). Resolution is 40 m near the pole and 240 m out to 75°S.
- **Sun & Earth map layer:** a monthly colour map of the cap to 75°S, computed from LOLA + Horizons (`scripts/prepare_suitability.py`):
  - **green:** Sun and Earth up about half the month or more, on flat ground;
  - **red:** long nights, no Earth (far side), or steep ground.
- **Maps:** NASA Moon Trek (LRO WAC and NAC mosaics).
- **Feature names:** IAU / USGS Gazetteer of Planetary Nomenclature.
- **Spacecraft defaults:** published specs of Nova-C, Blue Ghost, Peregrine and VIPER. The lander drawing is an illustration, not a real vehicle.

Earth visibility is geometric line of sight, not signal strength.

## Run
```bash
npm ci
```
```bash
npm run dev
```

Check everything (types, lint, tests, build):
```bash
npm run check
```

## Deploy
The site is fully static: `npm run build` produces `dist/`.
- **Vercel:** import the repository. It detects Vite (build `npm run build`, output `dist`); no settings are needed.
- **GitHub Pages:** `.github/workflows/deploy.yml` publishes on every push to `main`.

## Layout
- `src/planner/`: the engine (pure TypeScript): ephemeris, terrain, horizon, power and battery, landing zone, alternatives.
- `src/journey/`: the opening pages and the Three.js Moon.
- `src/planner-ui/`, `src/ui/`, `src/i18n/`: the planner, shell and strings (en.ts / ar.ts).
- `scripts/`: Python scripts that build `public/data/` from NASA sources.

## AI disclosure
Built with Claude Code (Anthropic) under the team's direction. All numbers come from NASA data and deterministic calculations, not from AI.
