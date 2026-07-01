# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Mobile-first workout tracker ("Tall & Tender Split") — a 7-day upper/lower/rest split with set-by-set weight, reps, and RPE logging. Plus nutrition tracking with FatSecret food database integration and AI-powered macro estimates. Vanilla JS (IIFE pattern), CSS, and HTML. No build step, no dependencies, no npm.

| File | Purpose |
|------|---------|
| `index.html` | HTML structure |
| `styles.css` | All styles |
| `app-core.js` | Namespace init, shared state, constants, DOM refs, PWA registration |
| `app-utils.js` | Pure utility functions (dates, calc, formatting) |
| `app-data.js` | Data layer — localStorage CRUD, cloud sync, nutrition helpers, export/import |
| `app-ui.js` | UI primitives — toast, haptic, confirm modal, timer, navigation |
| `app-workout.js` | Workout system — rendering, set/skip modals, archive, stats, progression coach |
| `app-food-picker.js` | Food picker modal, FatSecret search/import, servings/amount pickers |
| `app-ai.js` | AI macro estimate modal, meal plan generator |
| `app-nutrition.js` | Nutrition view, inline AI estimate |
| `app-settings.js` | Settings view, weekly review email |
| `app-boot.js` | Bootstrap — event binding init, boot sequence, module self-test |
| `check.sh` | Pre-commit syntax check — `node --check` all JS + CSS brace balance |
| `check.ps1` | PowerShell variant of syntax check |
| `fatsecret-proxy.js` | Cloudflare Worker — FatSecret OAuth 1.0a proxy + DeepSeek AI proxy |
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

### Module system

All modules use the `window.App` global namespace. Each file is an IIFE that attaches its exports to `App.*`. Files are loaded via `<script>` tags in `index.html` in dependency order. The load order is critical:

1. `app-core.js` — `App.*` namespace, `App.state`, `App.dom`, `App.PROFILE`, `App.BUILTIN_PROGRAMS`, `App.PLATES`
2. `app-utils.js` — `App.todayStr()`, `App.formatDate()`, `App.calcVolume()`, etc.
3. `app-data.js` — `App.loadData()`, `App.saveData()`, `App.getNutrition()`, `App.loadFoods()`, etc.
4. `app-ui.js` — `App.showToast()`, `App.haptic()`, `App.switchView()`, timer functions
5. `app-workout.js` — `App.renderWorkoutView()`, `App.openSetModal()`, `App.handleSaveSet()`, etc.
6. `app-food-picker.js` — `App.openFoodPicker()`, `App.searchFatSecret()`, servings pickers
7. `app-ai.js` — `App.openAiEstimate()`, `App.callAiEstimate()`, `App.generateMealPlan()`
8. `app-nutrition.js` — `App.renderNutritionView()`, `App.callInlineAiEstimate()`
9. `app-settings.js` — `App.renderSettingsView()`, `App.generateAndSendWeeklyReview()`
10. `app-boot.js` — calls all `init*()` functions, runs boot sequence

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
