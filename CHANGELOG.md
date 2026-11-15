# CHANGELOG

## v3.1.0 — 2026-11-15
Fix round per MASTER-PROMPT.md: new tokens, logo and progress dots; 3-page opening with two-click snap scroll and a self-rotating Moon (Lenis/GSAP removed, 8k texture deleted, first-paint JS 83 kB gzip); simpler planner; alternatives return only fully suitable sites, searched over the whole 75° S map (owner asked for 2,000 km), guided by the Sun & Earth raster; English-only one-page A4 report; EN/AR string files with a parity test.
Landing ellipse: the region where a lander is predicted to touch down given navigation and guidance uncertainty, described by two axes at a stated confidence (commonly 3-sigma).
Default 100 m × 100 m follows the NASA Artemis human-lander requirement of landing within 100 m of the target; the engine treats it as axis-aligned (N–S length, E–W width). Arabic UI calls it «هامش الخطأ» (owner's request).

## v3.0.0-build1 — 2026-11-14 (builder)
Phases 1–7 built; phase 8 partly verified (see report). Nothing pushed or deployed.

### Pinned new packages
three 0.187.0, gsap 3.15.1, lenis 1.3.27, @fontsource-variable/manrope 5.3.0, @fontsource/ibm-plex-sans-arabic 5.3.0, @fontsource-variable/jetbrains-mono 5.3.0, @types/three 0.187.0. react-router removed (two hash routes handled in App.tsx).

### Data
- Horizons: `verify_horizons.py` → RESULT: PASS (1,248 comparisons; Sun 0.00019°, Earth 0.00597°).
- ephemeris.json, lunar_names.json, moontrek_vectors.json: SHA-256 identical to carry-over/E.
- lola_south_240m.bin.gz (25,592,420 B) and dem40 tiles (75.3 MB) differ in bytes from carry-over/E. Likely cause: the local zlib (1.4 / zlib-ng) compresses differently from the original's. Not yet proven identical content. Size 3812, origin 1905.5, depth score 6676 m, 40 m vs 240 m median 14 m, and every reference-result test match. lola_south_240m.json also differs (645 vs 665 B); cause not found.
- New: scripts/prepare_moon_textures.py (orientation check passes: Tycho bright 204.7 vs mean 149.4, Tranquillitatis dark 68.4), scripts/prepare_pole_hillshade.py, scripts/write_sources.py.

### Journey date
JOURNEY_DATE = 2027-01-27T04:00Z. 2027-01-08 has sub-solar lon 172° (near side dark). A ±20-day scan picks the date closest to screen sun dir (−0.7, 0.35, 0.62): dot 0.957.

### Deviations (rulings)
- Horizon keys cy = −5.9 (not −1.55, which fills the whole screen), so the arc sits in the lower third.
- Horizon/Descent lon keys follow the Horizons sub-solar lon (−55°) so the arc is lit; lon 0 at the Handoff matches the planner map orientation.
- Descent R 2.6–3.0 (not 4.5/9): at R = 9 the camera is 26 km above the pole and the Artemis regions (±140 km) leave the frame.
- Scene counter shows 006 (six scenes are specified).
- Handoff is a circular reveal into a planner intro, not a pixel-matched Moon Trek crossfade.
- No rocks layer, no Web Worker for alternatives (the engine already yields, as in v2).
- Engine status "rejected" is shown as "Not suitable"; "Needs attention" is the step-3 site rating, as in v2.
- Owner questions (01 §8): no team name on the title card; Arabic headlines use the chapter 04 drafts.
