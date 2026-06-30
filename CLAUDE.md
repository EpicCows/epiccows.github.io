# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Mobile-first workout tracker ("Tall & Tender Split") — a 7-day upper/lower/rest split with set-by-set weight and RPE logging. Vanilla JS (IIFE pattern), CSS, and HTML split across three files. No build step, no dependencies, no npm.

| File | Purpose |
|------|---------|
| `index.html` | HTML structure (141 lines) |
| `styles.css` | All styles (1475 lines) |
| `app.js` | All logic (3849 lines) |
| `fatsecret-proxy.js` | Cloudflare Worker — FatSecret OAuth 1.0a proxy |
| `sw.js` | Service worker — PWA offline support |
| `manifest.json` | PWA manifest |
| `wrangler.toml` | Cloudflare Worker config |

## How to run / preview

```bash
# Just open the HTML file in a browser
start index.html
```

There is no dev server, no bundler, no `npm install`. The app loads directly from disk and persists data to `localStorage`.

## Architecture

- **Data model** — `DAYS[]` (lines ~438-501) is the source of truth: 7 entries, each with `label`, `rest: bool`, and `exercises[]` (name, sets, reps, cue). To change the program, edit this array.
- **State** — `progress` object (line ~505) maps `"dayIdx_exIdx_setIdx"` → `{ done: bool, weight: string, rpe: string }`. Persisted to `localStorage` under key `tallTenderProgress` and includes a migration path from old boolean-only values.
- **Rendering** — `renderPanel(activeIdx)` builds the active day's DOM from scratch: exercise cards with interactive set dots, a reset button, and a completion banner. Rest days get a static message.
- **Modal** — Bottom-sheet modal for logging weight (kg/lbs) and RPE (1-10) per set. Pre-fills existing values. Dismiss on overlay click or cancel button.
- **Navigation** — Tab bar for all 7 days. `getSuggestedDay()` maps `Date.getDay()` (Sun=0) to the app's day index (Mon=0). Active tab styling uses `.active` class and inline gradient fills.
- **Persistence hooks** — Saves on every set log and also on `visibilitychange` (when the tab goes hidden).

## Key constraints

- **No external dependencies** — keep it that way. Any new feature must be vanilla JS/CSS only.
- **Mobile-first** — max-width 480px container. Test on narrow viewports. Touch-friendly hit targets.
- **localStorage only** — no backend, no sync, no account system. Data lives in the browser.
- **Dark theme** — background `#0b0d10`, text `#e8edf2`. Green accent `#2d7a3a` / `#4caf50`. Follow these tokens when adding UI.
