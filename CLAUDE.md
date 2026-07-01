# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Mobile-first workout tracker ("Tall & Tender Split") — a 7-day upper/lower/rest split with set-by-set weight, reps, and RPE logging. Plus nutrition tracking with FatSecret food database integration and AI-powered macro estimates. TypeScript ES modules built with Vite. Zero runtime dependencies.

| File | Purpose |
|------|---------|
| `index.html` | Vite entry point — single `<script type="module" src="/src/main.ts">` |
| `src/main.ts` | Bootstrap — PWA registration, boot sequence, module self-test |
| `src/types.ts` | All shared TypeScript interfaces (AppState, DomRefs, FoodItem, etc.) |
| `src/state.ts` | Mutable globals — `state`, `dom`, `foods`, `mealTemplates`, `recentMeals` |
| `src/core.ts` | Constants (PROFILE, FATSECRET_WORKER, storage keys), programs, PLATES |
| `src/utils.ts` | Pure functions — dates, calc, formatting, migration |
| `src/data.ts` | Data layer — localStorage CRUD, cloud sync, nutrition helpers, export/import |
| `src/ui.ts` | UI primitives — toast, haptic, confirm modal, timer, navigation |
| `src/workout.ts` | Workout system — set/skip modals, workout render, archive, stats, progression |
| `src/food-picker.ts` | Food picker modal, FatSecret search/import, servings/amount pickers |
| `src/ai.ts` | AI macro estimate modal, meal plan generator, FOOD_DB |
| `src/nutrition.ts` | Nutrition view rendering, inline AI estimate, batch import |
| `src/settings.ts` | Settings view, goals wizard, weekly review email, program editor |
| `src/styles.css` | All styles (moved from root, imported by main.ts) |
| `public/sw.js` | Service worker — PWA offline support (runtime caching, no hardcoded file list) |
| `public/manifest.json` | PWA manifest |
| `public/icon-*.png` | PWA icons |
| `fatsecret-proxy.js` | Cloudflare Worker — FatSecret OAuth 1.0a proxy + DeepSeek AI proxy |
| `vite.config.ts` | Vite config — port 3000, ES2020 target |
| `tsconfig.json` | TypeScript config — strict, ESNext modules, bundler resolution |
| `package.json` | npm scripts: `dev`, `build`, `preview`, `check` |
| `check.sh` | Pre-commit: `tsc --noEmit` + CSS brace check + `vite build` |
| `wrangler.toml` | Cloudflare Worker config |

## How to run / preview

```bash
npm run dev        # Vite dev server with HMR at localhost:3000
npm run build      # TypeScript check + production build to dist/
npm run preview    # Preview production build
```

## Architecture

### Module system

All modules use ES module `import`/`export`. TypeScript compiles to ES2020. Vite bundles a single JS + CSS output. No global namespace — each module imports exactly what it needs from other modules.

Circular dependency: `ai.ts` ↔ `nutrition.ts` — both import each other's functions (`renderNutritionView` ↔ `generateMealPlan`). This works because both calls only happen at runtime (user clicks), never at module evaluation time. ES modules resolve live bindings correctly.

### Dependency graph

```
types.ts, state.ts     (no internal deps)
utils.ts               (no internal deps)
core.ts                → types
data.ts                → types, state, core, utils  RUNTIME: ui, workout, nutrition
ui.ts                  → state, utils               RUNTIME: workout, nutrition, settings
workout.ts             → types, state, core, utils, data, ui
food-picker.ts         → types, state, core, data, ui  RUNTIME: nutrition
ai.ts                  → state, core, utils, data, ui, food-picker, nutrition ⚠
nutrition.ts           → state, core, utils, data, ui, food-picker, ai ⚠
settings.ts            → state, core, utils, data, ui, workout
main.ts                → ALL (boot)
```

### Shared state

- **`App.state`** — all mutable shared state (`appData`, `currentView`, `nutritionDate`, pending/timer vars)
- **`App.dom`** — cached `getElementById` refs, accessed via `dom.*` alias
- **`App.programs`** — workout program definitions (loaded from localStorage, seeded from `App.BUILTIN_PROGRAMS`)
- **`App.foods`**, **`App.mealTemplates`**, **`App.recentMeals`** — nutrition data arrays

Each module creates local aliases: `var s = App.state; var dom = App.dom;`

### Data model

- **Programs** — `App.programs` maps program names (e.g. "Upper A") to arrays of exercises with `name`, `sets`, `reps`, `cue`. Persisted to `localStorage` under `App.PROGRAMS_KEY`.
- **Workouts** — `App.state.appData.workouts[]` — each workout has `date`, `dayType`, `exercises[]` (each with `name`, `sets[]` where each set is `{weight, reps, rpe, notes}`), `totalVolume`, `avgRpe`.
- **Current workout** — `App.state.appData.currentWorkout` — transient, not persisted in cloud backups.
- **Nutrition** — `App.state.appData.nutrition[dateStr]` — per-day meal slots (breakfast, lunch, dinner, snacks), each with `items[]` (`{foodId, servings/amount/unit}`) and optional `planNotes`.
- **Goals** — `{ calories, protein, fat, carbs, height, age }` stored in localStorage.

### Key constraints

- **No external dependencies** — keep it that way. Any new feature must be vanilla JS/CSS only.
- **Mobile-first** — max-width 480px container. Test on narrow viewports. Touch-friendly hit targets.
- **localStorage only** — no backend, no sync, no account system. Data lives in the browser.
- **Dark theme** — background `#0b0d10`, text `#e8edf2`. Green accent `#2d7a3a` / `#4caf50`. Follow these tokens when adding UI.
