# Patch Notes

## 2026-06-30 — FatSecret, PWA, and Quality of Life

### 🔍 FatSecret Food Database
- **Cloudflare Worker proxy** (`fatsecret-proxy.js`) — searches FatSecret's food database with real nutrition data. Your Client Secret never leaves the server (OAuth 1.0a).
- **Food picker** now searches both your local library and FatSecret simultaneously with one-tap import.
- **AI Estimate** upgraded: DeepSeek parses your meal description into search terms → FatSecret provides real macros. No more AI-guessed calories.
- **Gram-based serving**: FatSecret foods default to 100g with macros that scale by actual grams. 5g step increments, or type any exact amount. Food chips show `150g Chicken Breast` instead of `Chicken Breast x1.5`.
- Worker URL pre-filled by default in Settings → Food Database.

### 📱 Progressive Web App
- **Installable** — "Add to Home Screen" on your phone opens it full-screen like a native app.
- **Offline support** — service worker caches core files. Workouts and nutrition work without internet.
- `manifest.json`, `sw.js`, and app icons added.

### 👥 Profiles (Multi-User)
- Switch, create, or delete profiles in Settings.
- Each profile has separate workouts, foods, and goals.
- API key, FatSecret URL, and timer settings are shared across profiles.
- Old data auto-migrates to the default profile.

### ⏱️ Timer Improvements
- **3-minute preset** (180s) added alongside 30s, 60s, 90s, 120s.
- **Skip button** — stops the timer and resets to zero.
- **+30s button** — adds 30 seconds to the current timer (visible while running).

### 🎨 UI Polish
- **Meal slots** now show slot-specific placeholder examples (breakfast, lunch, dinner, snacks).
- **Exercise reorder** — ▲▼ arrows on each exercise in Settings to move them up or down.

### 🔧 Under the Hood
- **Split `index.html`** into three files: `index.html` (structure), `styles.css` (styling), `app.js` (logic). No build step needed.
- **Amount picker** upgraded: gram steps reduced from 25g to 5g; now a typeable number input instead of read-only span.

---

## 2026-06-29 — Initial Build

### 🏋️ Workout Tracking
- 7-day Tall & Tender split (Upper A, Lower A, Rest, Upper B, Lower B, Rest, Rest)
- Set-by-set weight and RPE logging with weight stepper buttons (+/-2.5, +/-5)
- Smart pre-fill: auto-fills weight/RPE from your previous set and last workout
- Plate calculator, warm-up calculator, and exercise history in the set log modal
- Rest timer with presets (30s, 60s, 90s, 120s) and auto-start toggle
- Daily cardio checkbox
- Workout volume tracking and elapsed time display

### 📊 Stats & Archive
- Workout archive with full history
- Stats view with personal bests and volume trends
- JSON export/import for data portability

### 🍽️ Nutrition
- 4 daily meal slots (breakfast, lunch, dinner, snacks) with daily calorie/protein goals
- Food library with quick-add and manual entry
- Meal templates — save and reuse common meals
- AI macro estimate via DeepSeek API with review panel (editable amounts/units)
- Nutrition summary with progress bars showing remaining calories/protein

### ⚙️ Settings
- Custom workout programs: create, edit, and delete programs and exercises
- Nutrition goals (daily calories and protein targets)
- DeepSeek API key configuration (for AI estimates)
- Built-in program reset

### 🎨 Design
- Dark theme (#0b0d10 background, #e8edf2 text, #2d7a3a / #4caf50 green accents)
- Exo 2 Google Font
- Mobile-first (max-width 480px), touch-friendly, four-tab navigation
- Bottom-sheet modals for set logging, food picking, and AI estimates
