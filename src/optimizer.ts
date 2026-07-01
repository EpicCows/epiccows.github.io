import { foods } from './state';
import { loadGoals, calcDailyTotals, calcSlotTotals, getNutrition } from './data';
import { FOOD_DB } from './ai';
import type { FoodItem } from './types';

// ==================== TYPES ====================

export interface CandidateFood {
  source: 'user' | 'builtin';
  name: string;
  foodId?: number;
  dbKey?: string;
  calPer100g: number;
  proPer100g: number;
  fatPer100g: number;
  carbPer100g: number;
  isPer100g: boolean;
}

export interface FillSuggestion {
  name: string;
  foodId?: number;
  dbKey?: string;
  source: 'user' | 'builtin';
  amountGrams: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
}

// ==================== SLOT-AWARE FOOD CATEGORIES ====================

// Breakfast proteins — eggs, dairy, whey (not meat/fish)
const BREAKFAST_PROTEIN_KEYS = new Set([
  'whole eggs', 'egg', 'egg whites', 'greek yogurt', 'cottage cheese',
  'whey', 'milk', 'cheese',
]);

// Breakfast carbs — grains, breads, fruit, potato
const BREAKFAST_CARB_KEYS = new Set([
  'oats', 'oatmeal', 'bread', 'wholemeal bread', 'bagel', 'potato',
  'banana', 'blueberries', 'strawberries', 'apple', 'orange',
]);

// Lunch/dinner proteins — meat, fish, plus eggs/dairy as fallback
const MAIN_PROTEIN_KEYS = new Set([
  'chicken breast', 'chicken thigh', 'turkey breast', 'lean ground beef',
  'ground beef', 'beef sirloin', 'salmon', 'cod', 'tilapia', 'tuna',
  'shrimp', 'pork loin', 'whole eggs', 'egg', 'egg whites', 'cheese',
  'greek yogurt', 'cottage cheese',
]);

// Lunch/dinner carbs — rice, potato, pasta, vegetables
const MAIN_CARB_KEYS = new Set([
  'white rice', 'rice', 'brown rice', 'potato', 'sweet potato',
  'pasta', 'quinoa', 'bread', 'wholemeal bread', 'tortilla',
  'broccoli', 'spinach', 'green beans', 'asparagus', 'bell pepper',
  'mixed vegetables',
]);

// Snack foods — yogurt, fruit, nuts, shakes
const SNACK_KEYS = new Set([
  'greek yogurt', 'cottage cheese', 'whey', 'almonds', 'banana',
  'apple', 'peanut butter', 'blueberries', 'strawberries', 'orange',
  'cheese', 'milk', 'bread', 'wholemeal bread', 'whole eggs', 'egg',
]);

// Complex carb priority — these get a bonus in the carb phase sort
const COMPLEX_CARB_KEYS = new Set([
  'potato', 'sweet potato', 'brown rice', 'oats', 'oatmeal',
  'quinoa', 'wholemeal bread',
]);

function isBreakfast(slot: string): boolean {
  return slot === 'breakfast';
}

function isSnack(slot: string): boolean {
  return slot === 'snacks';
}

function isMainMeal(slot: string): boolean {
  return slot === 'lunch' || slot === 'dinner';
}

function matchesSlot(c: CandidateFood, slot: string, phase: 'protein' | 'carb' | 'fat'): boolean {
  // For user foods, check by name
  const name = c.name.toLowerCase().trim();
  const key = c.dbKey || '';

  if (isBreakfast(slot)) {
    if (phase === 'protein') {
      return setContains(BREAKFAST_PROTEIN_KEYS, name) || setContains(BREAKFAST_PROTEIN_KEYS, key);
    }
    if (phase === 'carb') {
      return setContains(BREAKFAST_CARB_KEYS, name) || setContains(BREAKFAST_CARB_KEYS, key);
    }
    if (phase === 'fat') {
      // For breakfast, only allow fats that match toast/yogurt context
      return name.indexOf('peanut butter') >= 0 || name.indexOf('avocado') >= 0
        || key.indexOf('peanut butter') >= 0 || key.indexOf('avocado') >= 0;
    }
  }

  if (isMainMeal(slot)) {
    if (phase === 'protein') {
      return setContains(MAIN_PROTEIN_KEYS, name) || setContains(MAIN_PROTEIN_KEYS, key);
    }
    if (phase === 'carb') {
      return setContains(MAIN_CARB_KEYS, name) || setContains(MAIN_CARB_KEYS, key);
    }
    if (phase === 'fat') {
      return name.indexOf('olive oil') >= 0 || name.indexOf('avocado') >= 0
        || key.indexOf('olive oil') >= 0 || key.indexOf('avocado') >= 0;
    }
  }

  if (isSnack(slot)) {
    return setContains(SNACK_KEYS, name) || setContains(SNACK_KEYS, key);
  }

  return true; // fallback: allow all
}

function setContains(set: Set<string>, str: string): boolean {
  if (!str) return false;
  if (set.has(str)) return true;
  // Check if any key in the set is contained within the string
  const iter = set.values();
  let item = iter.next();
  while (!item.done) {
    if (str.indexOf(item.value) >= 0 && item.value.length > 3) return true;
    item = iter.next();
  }
  return false;
}

// ==================== CANDIDATE POOL ====================

export function buildCandidatePool(): CandidateFood[] {
  const pool: CandidateFood[] = [];
  const seen = new Set<string>();

  // User's food library first (prefer user's own foods)
  for (let i = 0; i < foods.length; i++) {
    const f = foods[i];
    const key = f.name.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);

    if (f.per100g) {
      pool.push({
        source: 'user',
        name: f.name,
        foodId: f.id,
        calPer100g: f.calories || 0,
        proPer100g: f.protein || 0,
        fatPer100g: f.fat || 0,
        carbPer100g: f.carbs || 0,
        isPer100g: true,
      });
    } else {
      if ((f.calories || 0) > 0) {
        pool.push({
          source: 'user',
          name: f.name,
          foodId: f.id,
          calPer100g: f.calories || 0,
          proPer100g: f.protein || 0,
          fatPer100g: f.fat || 0,
          carbPer100g: f.carbs || 0,
          isPer100g: false,
        });
      }
    }
  }

  // Built-in FOOD_DB (fill gaps, skip macro-identical dupes)
  for (const key in FOOD_DB) {
    if (!Object.prototype.hasOwnProperty.call(FOOD_DB, key)) continue;
    const lower = key.toLowerCase().trim();
    if (seen.has(lower)) continue;

    const entry = FOOD_DB[key];
    // Skip if pool already has an entry with identical macros (alias like oats/oatmeal)
    let isDupe = false;
    for (let p = 0; p < pool.length; p++) {
      const c = pool[p];
      if (c.calPer100g === entry.cal && c.proPer100g === entry.pro &&
          c.fatPer100g === entry.fat && c.carbPer100g === entry.carb) {
        isDupe = true;
        break;
      }
    }
    if (isDupe) continue;
    seen.add(lower);

    pool.push({
      source: 'builtin',
      name: key.charAt(0).toUpperCase() + key.slice(1),
      dbKey: key,
      calPer100g: entry.cal,
      proPer100g: entry.pro,
      fatPer100g: entry.fat,
      carbPer100g: entry.carb,
      isPer100g: true,
    });
  }

  return pool;
}

// ==================== MAIN ENTRY POINTS ====================

function smartFillSlot(slot: string, dateStr: string): FillSuggestion[] {
  const goals = loadGoals();
  const totals = calcDailyTotals(dateStr);

  const remCal = Math.max(0, goals.calories - totals.calories);
  const remPro = Math.max(0, goals.protein - totals.protein);

  if (remCal <= 50 && remPro <= 5) return [];

  const nut = getNutrition(dateStr);
  let emptySlots = 0;
  let isSlotEmpty = false;
  let slotCal = 0;
  let slotPro = 0;

  for (let i = 0; i < nut.meals.length; i++) {
    const meal = nut.meals[i];
    if (meal.items.length === 0) {
      emptySlots++;
      if (meal.slot === slot) isSlotEmpty = true;
    } else if (meal.slot === slot) {
      const st = calcSlotTotals(meal.items);
      slotCal = st.calories;
      slotPro = st.protein;
    }
  }

  let targetCal: number;
  let targetPro: number;

  if (isSlotEmpty && emptySlots > 0) {
    targetCal = Math.round(remCal / emptySlots);
    targetPro = Math.round(remPro / emptySlots);
  } else {
    const perSlotCal = Math.round(goals.calories / 4);
    const perSlotPro = Math.round(goals.protein / 4);
    targetCal = Math.min(remCal, Math.max(0, perSlotCal - slotCal));
    targetPro = Math.min(remPro, Math.max(0, perSlotPro - slotPro));
  }

  if (targetCal <= 30 && targetPro <= 3) return [];

  const pool = buildCandidatePool();
  return greedyFill(pool, targetCal, targetPro, slot);
}

export function smartFillDay(dateStr: string): Record<string, FillSuggestion[]> {
  const nut = getNutrition(dateStr);
  const result: Record<string, FillSuggestion[]> = {};

  for (let i = 0; i < nut.meals.length; i++) {
    const slot = nut.meals[i].slot;
    const suggestions = smartFillSlot(slot, dateStr);
    if (suggestions.length > 0) {
      result[slot] = suggestions;
    }
  }

  return result;
}

// ==================== GREEDY FILL ALGORITHM ====================

function greedyFill(
  pool: CandidateFood[],
  targetCal: number,
  targetPro: number,
  slot: string,
): FillSuggestion[] {
  const suggestions: FillSuggestion[] = [];
  let curCal = 0;
  let curPro = 0;

  // Phase 1: Protein — filter by slot-appropriate proteins
  const proteins = pool
    .filter(function(c) {
      return c.proPer100g >= 10 && c.fatPer100g <= 15 && matchesSlot(c, slot, 'protein');
    })
    .sort(function(a, b) {
      const da = a.proPer100g / Math.max(1, a.calPer100g);
      const db = b.proPer100g / Math.max(1, b.calPer100g);
      return db - da;
    });

  for (let i = 0; i < proteins.length; i++) {
    if (curPro >= targetPro - 5) break;
    if (suggestions.length >= 6) break;

    const c = proteins[i];
    const proNeeded = targetPro - curPro;
    const gramsRaw = Math.round((proNeeded / c.proPer100g) * 100);
    const grams = clampGrams(gramsRaw, c.isPer100g);

    const cal = Math.round(c.calPer100g * grams / 100);
    const pro = Math.round(c.proPer100g * grams / 100);

    if (curCal + cal > targetCal * 1.4) continue;
    // Don't suggest shrimp/fish for breakfast (belt-and-suspenders after slot filter)
    if (isBreakfast(slot) && isSeafood(c)) continue;

    suggestions.push(makeSuggestion(c, grams, cal, pro));
    curCal += cal;
    curPro += pro;
  }

  // If no breakfast-appropriate protein was found, try dairy/whey as fallback
  if (isBreakfast(slot) && curPro < targetPro - 10 && suggestions.length < 6) {
    const dairyFallback = pool.filter(function(c) {
      const name = c.name.toLowerCase();
      return (name.indexOf('yogurt') >= 0 || name.indexOf('cottage') >= 0
        || name.indexOf('whey') >= 0 || name.indexOf('milk') >= 0
        || name.indexOf('egg') >= 0)
        && c.proPer100g >= 5;
    }).sort(function(a, b) {
      return (b.proPer100g / Math.max(1, b.calPer100g)) - (a.proPer100g / Math.max(1, a.calPer100g));
    });

    for (let i = 0; i < dairyFallback.length && curPro < targetPro - 3 && suggestions.length < 6; i++) {
      const c = dairyFallback[i];
      const proNeeded = targetPro - curPro;
      const gramsRaw = Math.round((proNeeded / c.proPer100g) * 100);
      const grams = clampGrams(gramsRaw, c.isPer100g);
      const cal = Math.round(c.calPer100g * grams / 100);
      const pro = Math.round(c.proPer100g * grams / 100);
      if (curCal + cal > targetCal * 1.4) continue;
      suggestions.push(makeSuggestion(c, grams, cal, pro));
      curCal += cal;
      curPro += pro;
    }
  }

  // Phase 2: Carbs — filter by slot, prefer complex carbs
  if (curCal < targetCal - 30 && suggestions.length < 6) {
    const carbs = pool
      .filter(function(c) {
        return c.carbPer100g >= 10 && c.fatPer100g <= 10 && c.proPer100g < 20
          && matchesSlot(c, slot, 'carb');
      })
      .sort(function(a, b) {
        // Complex carbs get a priority boost
        const aComplex = isComplexCarb(a) ? 2 : 1;
        const bComplex = isComplexCarb(b) ? 2 : 1;
        return (b.carbPer100g * bComplex) - (a.carbPer100g * aComplex);
      });

    for (let i = 0; i < carbs.length; i++) {
      if (curCal >= targetCal - 30) break;
      if (suggestions.length >= 6) break;

      const c = carbs[i];
      // Skip if we already suggested this food (avoid duplicates)
      if (alreadySuggested(suggestions, c)) continue;

      const calNeeded = targetCal - curCal;
      const gramsRaw = Math.round((calNeeded / Math.max(1, c.calPer100g)) * 100);
      const grams = clampGrams(gramsRaw, c.isPer100g);

      const cal = Math.round(c.calPer100g * grams / 100);
      const pro = Math.round(c.proPer100g * grams / 100);

      if (curCal + cal > targetCal * 1.3) {
        // Try a smaller portion
        const halfGrams = Math.max(50, Math.round(grams / 100) * 50);
        const halfCal = Math.round(c.calPer100g * halfGrams / 100);
        const halfPro = Math.round(c.proPer100g * halfGrams / 100);
        if (curCal + halfCal > targetCal * 1.3) continue;
        suggestions.push(makeSuggestion(c, halfGrams, halfCal, halfPro));
        curCal += halfCal;
        curPro += halfPro;
        continue;
      }

      suggestions.push(makeSuggestion(c, grams, cal, pro));
      curCal += cal;
      curPro += pro;
    }
  }

  // Phase 2.5: Vegetables for lunch/dinner (volume + micronutrients)
  if (isMainMeal(slot) && suggestions.length < 6 && !hasVegetable(suggestions, pool)) {
    const veggies = pool
      .filter(function(c) {
        const name = c.name.toLowerCase();
        return (name.indexOf('broccoli') >= 0 || name.indexOf('spinach') >= 0
          || name.indexOf('green bean') >= 0 || name.indexOf('asparagus') >= 0
          || name.indexOf('vegetable') >= 0 || name.indexOf('bell pepper') >= 0);
      })
      .sort(function(a, b) { return a.calPer100g - b.calPer100g; }); // lowest cal first

    if (veggies.length > 0) {
      const c = veggies[0];
      const grams = 100; // standard vegetable portion
      const cal = Math.round(c.calPer100g * grams / 100);
      const pro = Math.round(c.proPer100g * grams / 100);
      suggestions.push(makeSuggestion(c, grams, cal, pro));
      curCal += cal;
      curPro += pro;
    }
  }

  // Phase 3: Fat top-up — only if significantly under
  if (curCal < targetCal - 80 && suggestions.length < 6) {
    const fats = pool
      .filter(function(c) {
        return c.fatPer100g >= 10 && c.proPer100g < 10 && matchesSlot(c, slot, 'fat');
      })
      .sort(function(a, b) {
        return b.fatPer100g - a.fatPer100g;
      });

    for (let i = 0; i < fats.length && suggestions.length < 6; i++) {
      if (curCal >= targetCal - 50) break;
      const c = fats[i];
      const grams = c.isPer100g ? 50 : 1;
      const cal = Math.round(c.calPer100g * grams / 100);
      const pro = Math.round(c.proPer100g * grams / 100);

      suggestions.push(makeSuggestion(c, grams, cal, pro));
      curCal += cal;
      curPro += pro;
    }
  }

  // Deduplicate: merge suggestions with the same food key/ID
  return dedupeSuggestions(suggestions);
}

// ==================== HELPERS ====================

function isComplexCarb(c: CandidateFood): boolean {
  const key = (c.dbKey || '').toLowerCase();
  const name = c.name.toLowerCase();
  return setContains(COMPLEX_CARB_KEYS, key) || setContains(COMPLEX_CARB_KEYS, name);
}

function isSeafood(c: CandidateFood): boolean {
  const name = c.name.toLowerCase();
  return name.indexOf('shrimp') >= 0 || name.indexOf('salmon') >= 0
    || name.indexOf('cod') >= 0 || name.indexOf('tilapia') >= 0
    || name.indexOf('tuna') >= 0;
}


function hasVegetable(suggestions: FillSuggestion[], pool: CandidateFood[]): boolean {
  for (let i = 0; i < suggestions.length; i++) {
    const name = suggestions[i].name.toLowerCase();
    if (name.indexOf('broccoli') >= 0 || name.indexOf('spinach') >= 0 || name.indexOf('green bean') >= 0 || name.indexOf('asparagus') >= 0 || name.indexOf('vegetable') >= 0 || name.indexOf('bell pepper') >= 0) return true;
  }
  return false;
}
function alreadySuggested(suggestions: FillSuggestion[], c: CandidateFood): boolean {
  const cKey = (c.dbKey || c.name).toLowerCase();
  for (let i = 0; i < suggestions.length; i++) {
    const sKey = (suggestions[i].dbKey || suggestions[i].name).toLowerCase();
    if (sKey === cKey) return true;
    if (suggestions[i].foodId && c.foodId && suggestions[i].foodId === c.foodId) return true;
  }
  return false;
}

function dedupeSuggestions(suggestions: FillSuggestion[]): FillSuggestion[] {
  const merged: FillSuggestion[] = [];
  const seen = new Map<string, number>(); // key → index in merged

  for (let i = 0; i < suggestions.length; i++) {
    const s = suggestions[i];
    const key = (s.dbKey || s.name).toLowerCase();
    const idKey = s.foodId ? 'id:' + s.foodId : '';

    if (idKey && seen.has(idKey)) {
      const idx = seen.get(idKey)!;
      merged[idx] = mergeTwo(merged[idx], s);
    } else if (seen.has(key)) {
      const idx = seen.get(key)!;
      merged[idx] = mergeTwo(merged[idx], s);
    } else {
      seen.set(idKey || key, merged.length);
      merged.push({ ...s });
    }
  }

  return merged;
}

function mergeTwo(a: FillSuggestion, b: FillSuggestion): FillSuggestion {
  const totalGrams = a.amountGrams + b.amountGrams;
  // Recompute macros from the source to keep accuracy
  const cal = a.calories + b.calories;
  const pro = a.protein + b.protein;
  const fat = a.fat + b.fat;
  const carbs = a.carbs + b.carbs;
  return {
    name: a.name,
    foodId: a.foodId || b.foodId,
    dbKey: a.dbKey || b.dbKey,
    source: a.source,
    amountGrams: totalGrams,
    calories: cal,
    protein: pro,
    fat: fat,
    carbs: carbs,
  };
}

function clampGrams(gramsRaw: number, isPer100g: boolean): number {
  if (!isPer100g) {
    return 1;
  }
  const clamped = Math.min(300, Math.max(50, gramsRaw));
  return Math.round(clamped / 50) * 50;
}

function makeSuggestion(c: CandidateFood, grams: number, cal: number, pro: number): FillSuggestion {
  return {
    name: c.name,
    foodId: c.foodId,
    dbKey: c.dbKey,
    source: c.source,
    amountGrams: grams,
    calories: cal,
    protein: pro,
    fat: Math.round(c.fatPer100g * grams / 100),
    carbs: Math.round(c.carbPer100g * grams / 100),
  };
}

// ==================== MACRO-EQUIVALENT SWAP ====================

export interface SwapAlternative {
  name: string;
  dbKey?: string;
  foodId?: number;
  source: 'user' | 'builtin';
  amountGrams: number;
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  score: number; // lower = better match
}

export function findMacroAlternatives(
  originalDesc: string,
  originalCal: number,
  originalPro: number,
  originalFat: number,
  originalCarbs: number,
  limit?: number,
): SwapAlternative[] {
  const maxResults = limit || 4;

  // Extract the original food name for exclusion
  const origName = extractFoodName(originalDesc);

  // Build pool from FOOD_DB + user foods
  const pool = buildCandidatePool();
  const alternatives: SwapAlternative[] = [];

  for (let i = 0; i < pool.length; i++) {
    const c = pool[i];
    const cName = (c.dbKey || c.name).toLowerCase();

    // Skip the same food
    if (cName === origName.toLowerCase() || origName.toLowerCase().indexOf(cName) >= 0 || cName.indexOf(origName.toLowerCase()) >= 0) {
      continue;
    }

    // Skip foods with negligible protein (not a meaningful swap for a protein source)
    if (c.proPer100g < 5 && originalPro > 10) continue;

    // Calculate grams needed to match original protein
    let grams: number;
    if (originalPro > 0 && c.proPer100g > 0) {
      grams = Math.round((originalPro / c.proPer100g) * 100);
    } else {
      // Match by calories if protein isn't relevant
      grams = Math.round((originalCal / Math.max(1, c.calPer100g)) * 100);
    }
    grams = Math.min(500, Math.max(30, Math.round(grams / 50) * 50));

    const cal = Math.round(c.calPer100g * grams / 100);
    const pro = Math.round(c.proPer100g * grams / 100);
    const fat = Math.round(c.fatPer100g * grams / 100);
    const carbs = Math.round(c.carbPer100g * grams / 100);

    // Score: how close are the macros? Lower is better.
    const calDiff = originalCal > 0 ? Math.abs(cal - originalCal) / originalCal : 0;
    const proDiff = originalPro > 0 ? Math.abs(pro - originalPro) / Math.max(1, originalPro) : 0;
    const score = calDiff + proDiff * 2; // protein accuracy matters more

    // Only include reasonable matches
    if (calDiff > 0.5 && proDiff > 0.5) continue;

    alternatives.push({
      name: c.name,
      dbKey: c.dbKey,
      foodId: c.foodId,
      source: c.source,
      amountGrams: grams,
      calories: cal,
      protein: pro,
      fat: fat,
      carbs: carbs,
      score: score,
    });
  }

  // Sort by score (lower = better), return top N
  alternatives.sort(function(a, b) { return a.score - b.score; });

  // Dedupe by name
  const seen = new Set<string>();
  const result: SwapAlternative[] = [];
  for (let i = 0; i < alternatives.length && result.length < maxResults; i++) {
    const key = alternatives[i].name.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(alternatives[i]);
    }
  }

  return result;
}

function extractFoodName(desc: string): string {
  // Remove gram amounts and parenthetical notes
  let cleaned = desc
    .replace(/\d+\s*g\b/gi, '')
    .replace(/\d+\s*oz\b/gi, '')
    .replace(/\d+\s*scoop\b/gi, '')
    .replace(/\d+\s*tbsp\b/gi, '')
    .replace(/\d+\s*tsp\b/gi, '')
    .replace(/\d+\s*cup\b/gi, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

