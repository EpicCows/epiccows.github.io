import { state, dom, foods } from './state';
import { FATSECRET_WORKER } from './core';
import { todayStr } from './utils';
import { loadGoals, getNutrition, saveData, saveFoods, calcSlotTotals, trackRecentMeal } from './data';
import { showToast, haptic } from './ui';
import { parseFsDescription, parseFsServing } from './food-picker';
import { renderNutritionView } from './nutrition';
import type { Goals, MealSlot, DailyNutrition, FoodItem, PlanNoteItem } from './types';

// ==================== AI ESTIMATE ====================

export function openAiEstimate(): void {
  if (!dom.aiEstimateModal || !dom.aiMealInput || !dom.aiResult) return;
  dom.aiEstimateModal.classList.add('open');
  dom.aiMealInput.value = '';
  dom.aiResult.innerHTML = '';
  setTimeout(function() { dom.aiMealInput!.focus(); }, 200);
}

export function closeAiEstimate(): void {
  if (dom.aiEstimateModal) dom.aiEstimateModal.classList.remove('open');
}

export function callAiEstimate(): void {
  if (!dom.aiMealInput) return;
  const mealText = dom.aiMealInput.value.trim();
  if (!mealText) { showToast('Describe your meal first'); return; }
  callAiEstimateWithFatSecret(mealText);
}

export function callAiEstimateWithFatSecret(mealText: string): void {
  if (!dom.aiResult) return;
  dom.aiResult.innerHTML = '<div style="text-align:center;padding:20px;color:#7e8d9e;">Breaking down your meal...</div>';

  const prompt = 'Break this meal description into individual food search terms for a nutrition database lookup. Return ONLY a valid JSON array of strings (search terms). Be specific: include preparation method and key ingredients. Examples:\n' +
    '"bowl of oatmeal with banana and honey" → ["oatmeal", "banana", "honey"]\n' +
    '"grilled chicken breast with steamed broccoli and brown rice" → ["grilled chicken breast", "steamed broccoli", "brown rice"]\n' +
    '"turkey sandwich with lettuce tomato and mayo on whole wheat" → ["turkey sandwich", "whole wheat bread", "lettuce", "tomato", "mayonnaise"]\n' +
    'Now process this meal: ' + mealText;

  fetch(FATSECRET_WORKER + '/deepseek', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'You are a meal parser. Return ONLY valid JSON arrays of strings, no markdown, no extra text. Each string is a food search term.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 300,
      temperature: 0.2,
    }),
  })
    .then(function(res) {
      if (!res.ok) throw new Error('API error: ' + res.status);
      return res.json();
    })
    .then(function(data) {
      let content = data.choices[0].message.content;
      content = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const terms = JSON.parse(content);
      if (!Array.isArray(terms) || terms.length === 0) throw new Error('No foods identified');

      let html = '<div style="font-size:14px;font-weight:600;margin-bottom:8px;">Looking up in FatSecret...</div>';
      terms.forEach(function(term: string, idx: number) {
        html += '<div class="food-picker-item" id="fsItem' + idx + '" style="opacity:0.6;">';
        html += '<div><div class="fp-name">' + term + '</div><div class="fp-macros" id="fsMacros' + idx + '">Searching...</div></div>';
        html += '<span class="fp-add" style="font-size:13px;color:#7e8d9e;">...</span>';
        html += '</div>';
      });
      html += '<div style="margin-top:10px;"><button class="btn-save" id="btnConfirmAllFs" style="width:100%;display:none;">Confirm All &amp; Add to ' + state.pendingFoodSlot + '</button></div>';
      dom.aiResult.innerHTML = html;

      (dom.aiResult as any)._fsItems = [];
      (dom.aiResult as any)._fsPending = terms.length;

      terms.forEach(function(term: string, idx: number) {
        lookupFatSecretForAi(term, idx);
      });
    })
    .catch(function(err) {
      if (dom.aiResult) dom.aiResult.innerHTML = '<div style="color:#c96a6a;text-align:center;padding:10px;">Error: ' + err.message + '</div>';
    });
}

export function lookupFatSecretForAi(term: string, idx: number): void {
  const el = document.getElementById('fsItem' + idx);
  const macrosEl = document.getElementById('fsMacros' + idx);
  if (!el || !macrosEl || !dom.aiResult) return;

  fetch(FATSECRET_WORKER + '/search?q=' + encodeURIComponent(term) + '&page=0')
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      const el2 = document.getElementById('fsItem' + idx);
      if (!el2) return;

      const foodsList = (data.foods && data.foods.food) ? data.foods.food : null;
      if (!foodsList) {
        if (macrosEl) macrosEl.textContent = 'Not found in database';
        el2.style.opacity = '0.5';
        const addEl = el2.querySelector('.fp-add') as HTMLElement | null;
        if (addEl) { addEl.textContent = '✗'; addEl.style.color = '#c96a6a'; }
        el2.classList.add('fs-not-found');
        (dom.aiResult as any)._fsPending--;
        checkAllFsDone();
        return;
      }

      const fsFood = Array.isArray(foodsList) ? foodsList[0] : foodsList;
      const fsId = fsFood.food_id || '';
      const fsName = fsFood.food_name || term;
      const desc = fsFood.food_description || '';
      const macros = parseFsDescription(desc);

      return fetch(FATSECRET_WORKER + '/food?id=' + encodeURIComponent(fsId))
        .then(function(res2) {
          if (!res2.ok) throw new Error('HTTP ' + res2.status);
          return res2.json();
        })
        .then(function(detailData) {
          const el3 = document.getElementById('fsItem' + idx);
          if (!el3) return;

          const food = detailData.food;
          let cals = macros.calories || 0;
          let protein = macros.protein || 0;

          if (food && food.servings && food.servings.serving) {
            const servings = Array.isArray(food.servings.serving) ? food.servings.serving : [food.servings.serving];
            let s = servings[0];
            for (let i = 0; i < servings.length; i++) {
              if (servings[i].is_default === '1' || servings[i].serving_description === '100 g') {
                s = servings[i]; break;
              }
            }
            const sv = parseFsServing(s);
            if (sv.calories > 0) cals = sv.calories;
            if (sv.protein > 0) protein = sv.protein;
          }

          const nameEl = el3.querySelector('.fp-name');
          if (nameEl) nameEl.textContent = fsName;
          if (macrosEl) macrosEl.textContent = (cals || '?') + ' cal | ' + (protein || '?') + 'g protein';
          el3.style.opacity = '1';
          const addEl = el3.querySelector('.fp-add') as HTMLElement | null;
          if (addEl) { addEl.textContent = 'import'; addEl.style.color = '#886666'; }

          (dom.aiResult as any)._fsItems[idx] = { name: fsName, calories: cals, protein: protein };

          if (addEl) addEl.style.cursor = 'pointer';
          el3.addEventListener('click', function() {
            const item = (dom.aiResult as any)._fsItems[idx];
            if (!item) return;
            const newId = Date.now();
            foods.push({ id: newId, name: item.name, calories: item.calories || 0, protein: item.protein || 0, per100g: true });
            saveFoods();
            const nut = getNutrition(state.nutritionDate);
            let meal: MealSlot | null = null;
            for (let i = 0; i < nut.meals.length; i++) {
              if (nut.meals[i].slot === state.pendingFoodSlot) { meal = nut.meals[i]; break; }
            }
            if (meal) meal.items.push({ foodId: newId, amount: 100, unit: 'g' });
            saveData();
            trackRecentMeal(state.pendingFoodSlot, meal ? meal.items : []);
            showToast('Imported ' + item.name);
            el3.style.opacity = '0.3';
            el3.style.pointerEvents = 'none';
            (dom.aiResult as any)._fsItems[idx] = null;
          });

          (dom.aiResult as any)._fsPending--;
          checkAllFsDone();
        });
    })
    .catch(function() {
      const el4 = document.getElementById('fsItem' + idx);
      if (!el4) return;
      if (macrosEl) macrosEl.textContent = 'Lookup failed';
      el4.style.opacity = '0.5';
      const addEl = el4.querySelector('.fp-add') as HTMLElement | null;
      if (addEl) { addEl.textContent = '✗'; addEl.style.color = '#c96a6a'; }
      el4.classList.add('fs-not-found');
      (dom.aiResult as any)._fsPending--;
      checkAllFsDone();
    });
}

export function checkAllFsDone(): void {
  if (!dom.aiResult) return;
  if ((dom.aiResult as any)._fsPending <= 0) {
    const btn = document.getElementById('btnConfirmAllFs');
    if (btn) {
      btn.style.display = 'block';
      btn.addEventListener('click', function() {
        const nut = getNutrition(state.nutritionDate);
        let meal: MealSlot | null = null;
        for (let i = 0; i < nut.meals.length; i++) {
          if (nut.meals[i].slot === state.pendingFoodSlot) { meal = nut.meals[i]; break; }
        }
        let added = 0;
        (dom.aiResult as any)._fsItems.forEach(function(item: any, idx: number) {
          if (!item) return;
          const newId = Date.now() + idx;
          foods.push({ id: newId, name: item.name, calories: item.calories || 0, protein: item.protein || 0, per100g: true });
          if (meal) meal.items.push({ foodId: newId, amount: 100, unit: 'g' });
          added++;
        });
        saveFoods();
        saveData();
        if (meal) trackRecentMeal(state.pendingFoodSlot, meal.items);
        closeAiEstimate();
        renderNutritionView();
        showToast('Imported ' + added + ' foods with real nutrition data!');
      });
    }
  }
}

// ==================== FOOD DATABASE ====================

interface FoodDbEntry { cal: number; pro: number; fat: number; carb: number }

export const FOOD_DB: Record<string, FoodDbEntry> = {
  'chicken breast':        { cal: 165, pro: 31, fat: 3.6, carb: 0 },
  'chicken thigh':         { cal: 209, pro: 26, fat: 11, carb: 0 },
  'turkey breast':         { cal: 135, pro: 30, fat: 0.7, carb: 0 },
  'lean ground beef':      { cal: 192, pro: 27, fat: 8, carb: 0 },
  'ground beef':           { cal: 250, pro: 26, fat: 15, carb: 0 },
  'beef sirloin':          { cal: 206, pro: 27, fat: 10, carb: 0 },
  'salmon':                { cal: 208, pro: 20, fat: 13, carb: 0 },
  'cod':                   { cal: 105, pro: 23, fat: 0.9, carb: 0 },
  'tilapia':               { cal: 96, pro: 20, fat: 1.7, carb: 0 },
  'tuna':                  { cal: 116, pro: 26, fat: 0.8, carb: 0 },
  'shrimp':                { cal: 99, pro: 24, fat: 0.3, carb: 0.2 },
  'pork loin':             { cal: 190, pro: 29, fat: 8, carb: 0 },
  'whole eggs':            { cal: 155, pro: 13, fat: 11, carb: 1.1 },
  'egg':                   { cal: 155, pro: 13, fat: 11, carb: 1.1 },
  'egg whites':            { cal: 52, pro: 11, fat: 0.2, carb: 0.7 },
  'greek yogurt':          { cal: 59, pro: 10, fat: 0.4, carb: 3.6 },
  'cottage cheese':        { cal: 81, pro: 12, fat: 2.3, carb: 3.4 },
  'whey':                  { cal: 400, pro: 80, fat: 5, carb: 8 },
  'milk':                  { cal: 42, pro: 3.4, fat: 1, carb: 5 },
  'cheese':                { cal: 350, pro: 25, fat: 27, carb: 1.3 },
  'white rice':            { cal: 130, pro: 2.7, fat: 0.3, carb: 28 },
  'rice':                  { cal: 130, pro: 2.7, fat: 0.3, carb: 28 },
  'brown rice':            { cal: 123, pro: 2.7, fat: 1, carb: 26 },
  'potato':                { cal: 93, pro: 2.5, fat: 0.1, carb: 21 },
  'sweet potato':          { cal: 90, pro: 2, fat: 0.1, carb: 21 },
  'oats':                  { cal: 389, pro: 17, fat: 7, carb: 66 },
  'oatmeal':               { cal: 389, pro: 17, fat: 7, carb: 66 },
  'pasta':                 { cal: 131, pro: 5, fat: 0.6, carb: 25 },
  'bread':                 { cal: 265, pro: 9, fat: 3.2, carb: 49 },
  'quinoa':                { cal: 120, pro: 4.4, fat: 1.9, carb: 21 },
  'tortilla':              { cal: 300, pro: 8, fat: 7, carb: 50 },
  'wholemeal bread':       { cal: 247, pro: 13, fat: 3.4, carb: 41 },
'bagel':                 { cal: 275, pro: 11, fat: 1.5, carb: 55 },
  'broccoli':              { cal: 55, pro: 3.7, fat: 0.6, carb: 7 },
  'spinach':               { cal: 23, pro: 2.9, fat: 0.4, carb: 3.6 },
  'green beans':           { cal: 35, pro: 1.9, fat: 0.3, carb: 7 },
  'asparagus':             { cal: 22, pro: 2.4, fat: 0.2, carb: 4 },
  'bell pepper':           { cal: 28, pro: 0.9, fat: 0.2, carb: 6 },
  'mixed vegetables':      { cal: 45, pro: 2, fat: 0.3, carb: 8 },
  'olive oil':             { cal: 884, pro: 0, fat: 100, carb: 0 },
  'avocado':               { cal: 160, pro: 2, fat: 15, carb: 9 },
  'almonds':               { cal: 579, pro: 21, fat: 50, carb: 22 },
  'peanut butter':         { cal: 588, pro: 25, fat: 50, carb: 20 },
  'banana':                { cal: 89, pro: 1.1, fat: 0.3, carb: 23 },
  'apple':                 { cal: 52, pro: 0.3, fat: 0.2, carb: 14 },
  'blueberries':           { cal: 57, pro: 0.7, fat: 0.3, carb: 14 },
  'orange':                { cal: 47, pro: 0.9, fat: 0.1, carb: 12 },
  'strawberries':          { cal: 32, pro: 0.7, fat: 0.3, carb: 8 },
};

export function buildFoodDbPrompt(): string {
  const lines = ['REFERENCE MACROS (per 100g, verified USDA/FatSecret values):'];
  for (const key in FOOD_DB) {
    if (Object.prototype.hasOwnProperty.call(FOOD_DB, key)) {
      const f = FOOD_DB[key];
      lines.push(key + ': ' + f.cal + 'cal P' + f.pro + ' F' + f.fat + ' C' + f.carb);
    }
  }
  return lines.join('\n');
}

export function matchFoodDb(desc: string): { key: string; entry: FoodDbEntry; score: number } | null {
  const lower = desc.toLowerCase();
  let best: string | null = null;
  let bestScore = 0;
  for (const key in FOOD_DB) {
    if (Object.prototype.hasOwnProperty.call(FOOD_DB, key)) {
      let score = 0;
      if (lower.indexOf(key) >= 0) score = key.length;
      else {
        const words = key.split(' ');
        for (let w = 0; w < words.length; w++) {
          if (lower.indexOf(words[w]) >= 0 && words[w].length > 2) score += words[w].length;
        }
      }
      if (score > bestScore) { bestScore = score; best = key; }
    }
  }
  if (best && bestScore >= 3) return { key: best, entry: FOOD_DB[best], score: bestScore };
  return null;
}

export function matchLocalFood(desc: string): { food: FoodItem; per100g: { cal: number; pro: number; fat: number; carb: number } | null } | null {
  const lower = desc.toLowerCase();
  let best: FoodItem | null = null;
  let bestScore = 0;
  for (let i = 0; i < foods.length; i++) {
    const f = foods[i];
    const name = f.name.toLowerCase();
    let score = 0;
    if (lower.indexOf(name) >= 0) score = name.length;
    else {
      const words = name.split(' ');
      for (let w = 0; w < words.length; w++) {
        if (lower.indexOf(words[w]) >= 0 && words[w].length > 2) score += words[w].length;
      }
    }
    if (score > bestScore) { bestScore = score; best = f; }
  }
  if (best && bestScore >= 3) {
    if (best.per100g) {
      return { food: best, per100g: { cal: best.calories, pro: best.protein, fat: best.fat || 0, carb: best.carbs || 0 } };
    }
    return { food: best, per100g: null };
  }
  return null;
}

export function parseGrams(desc: string): number | null {
  const gMatch = desc.match(/(\d+)\s*g\b/i);
  if (gMatch) return parseInt(gMatch[1]);
  const ozMatch = desc.match(/(\d+)\s*oz\b/i);
  if (ozMatch) return Math.round(parseInt(ozMatch[1]) * 28.35);
  if (/\b1\s*scoop\b/i.test(desc)) return 30;
  if (/\blarge egg\b/i.test(desc) || /\begg\b.*\blarge\b/i.test(desc)) return 50;
  if (/\bmedium egg\b/i.test(desc)) return 44;
  if (/\btbsp\b/i.test(desc)) { const m = desc.match(/(\d+)\s*tbsp\b/i); return m ? parseInt(m[1]) * 14 : null; }
  if (/\btsp\b/i.test(desc)) { const m = desc.match(/(\d+)\s*tsp\b/i); return m ? parseInt(m[1]) * 5 : null; }
  if (/\bcup\b/i.test(desc)) { const m = desc.match(/(\d+)\s*cup\b/i); return m ? parseInt(m[1]) * 240 : null; }
  if (/\bslice\b/i.test(desc)) return 30;
  return null;
}

export function validatePlanItem(item: PlanNoteItem): PlanNoteItem {
  const desc = item.desc || '';
  const grams = parseGrams(desc);

  const localMatch = matchLocalFood(desc);
  if (localMatch && localMatch.per100g && grams) {
    const mult = grams / 100;
    return {
      desc, cal: Math.round(localMatch.per100g.cal * mult),
      pro: Math.round(localMatch.per100g.pro * mult),
      fat: Math.round(localMatch.per100g.fat * mult),
      carbs: Math.round(localMatch.per100g.carb * mult),
      _source: 'fatsecret',
    };
  }

  const match = matchFoodDb(desc);
  if (match && grams) {
    const mult = grams / 100;
    const expectedCal = Math.round(match.entry.cal * mult);
    const expectedPro = Math.round(match.entry.pro * mult);
    const expectedFat = Math.round(match.entry.fat * mult);
    const expectedCarb = Math.round(match.entry.carb * mult);
    const aiCal = item.cal || 0;
    const pctDiff = expectedCal > 0 ? Math.abs(aiCal - expectedCal) / expectedCal : 1;
    // Always use USDA values when we have a match — AI estimates are discarded
    return { desc, cal: expectedCal, pro: expectedPro, fat: expectedFat, carbs: expectedCarb, _source: 'usda' };
  }

  return { desc, cal: item.cal || 0, pro: item.pro || 0, fat: item.fat || 0, carbs: item.carbs || 0 };
}

export function validateAndCorrectPlan(plan: Record<string, PlanNoteItem[]>): { plan: Record<string, PlanNoteItem[]>; corrections: number } {
  const corrected: Record<string, PlanNoteItem[]> = {};
  let corrections = 0;
  for (const slot in plan) {
    if (Object.prototype.hasOwnProperty.call(plan, slot) && Array.isArray(plan[slot])) {
      corrected[slot] = plan[slot].map(function(item) {
        const fixed = validatePlanItem(item);
        if (fixed._source) corrections++;
        return fixed;
      });
    }
  }
  return { plan: corrected, corrections };
}

// ==================== MEAL PLAN GENERATOR ====================

export function generateMealPlan(): void {
  const goals = loadGoals();

  const btn = document.getElementById('btnMealPlan') as HTMLButtonElement | null;
  if (btn) { btn.textContent = '...'; btn.disabled = true; }

  const nut = getNutrition(state.nutritionDate);

  let filledCal = 0, filledPro = 0, filledFat = 0, filledCarbs = 0;
  const emptySlots: string[] = [];
  const filledSlots: string[] = [];
  ['breakfast', 'lunch', 'dinner', 'snacks'].forEach(function(slot) {
    let meal: MealSlot | null = null;
    for (let i = 0; i < nut.meals.length; i++) {
      if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; }
    }
    if (meal && meal.items && meal.items.length > 0) {
      const t = calcSlotTotals(meal.items);
      filledCal += t.calories; filledPro += t.protein; filledFat += t.fat; filledCarbs += t.carbs;
      filledSlots.push(slot);
      meal.planNotes = null;
    } else {
      emptySlots.push(slot);
    }
  });

  if (emptySlots.length === 0) {
    if (btn) { btn.textContent = '🧠 Generate Meal Plan'; btn.disabled = false; }
    showToast('All meal slots are already filled!');
    return;
  }

  const remainingCal = Math.max(0, goals.calories - filledCal);
  const remainingPro = Math.max(0, goals.protein - filledPro);
  const remainingFat = Math.max(0, (goals.fat || 0) - filledFat);
  const remainingCarbs = Math.max(0, (goals.carbs || 0) - filledCarbs);

  showToast('Filling ' + emptySlots.length + ' empty slot(s) around ' + filledCal + ' cal already logged...');

  const promptParts = ['Create a modular meal plan using a science-backed high-protein, moderate-carb, low-fat model.'];

  if (filledSlots.length > 0) {
    promptParts.push('These slots are ALREADY FILLED — do NOT include them in the plan:');
    promptParts.push(filledSlots.join(', ') + ' (' + filledCal + ' cal, P' + filledPro + 'g, F' + filledFat + 'g, C' + filledCarbs + 'g).');
  }

  promptParts.push('Only plan for these EMPTY slots: ' + emptySlots.join(', ') + '.');
  promptParts.push('Target for new items: ~' + remainingCal + ' cal, ~' + remainingPro + 'g protein, ~' + remainingFat + 'g fat, ~' + remainingCarbs + 'g carbs.');
  promptParts.push('Grand total (filled + new) must be ≤' + goals.calories + ' cal, ≥' + goals.protein + 'g protein, ≤' + (goals.fat || 70) + 'g fat, ~' + (goals.carbs || 250) + 'g carbs.');
  promptParts.push('PRIORITIES: 1) Hit protein target with lean sources first. 2) Keep fat low (use lean meats, avoid added oils/butter). 3) Fill remaining calories with complex carbs (rice, potato, oats, whole grains).');
  promptParts.push('GUIDELINES: Prefer whole foods, including whole eggs (not just whites — the fat is modest and they\'re more practical). Each meal: 30-50g protein from lean meat/fish/eggs/dairy. Favor slow-digesting carbs. Minimal added fats. Use vegetables for volume/satiety.');
  promptParts.push('Return ONLY valid JSON with exactly these keys: ' + JSON.stringify(emptySlots) + '.');
  promptParts.push('Each value is an array of objects: {"desc":"200g chicken breast (grilled, no oil)","cal":330,"pro":62,"fat":7,"carbs":0}.');
  promptParts.push('Include realistic estimates for cal, pro, fat, carbs per item. Return only JSON, no markdown.');

  const prompt = promptParts.join(' ');

  fetch(FATSECRET_WORKER + '/deepseek', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'You are a science-backed meal planner. Follow a high-protein, moderate-carb, low-fat model. Prioritize lean protein sources (chicken breast, turkey, white fish, lean beef, whole eggs, nonfat Greek yogurt, whey) at every meal. Favor whole eggs over egg whites — the extra few grams of fat are worth the convenience and nutrition, and they fit the model fine as long as total fat stays under target. Keep added fats minimal — avoid oil, butter, cheese, nuts unless essential. Fill remaining calories with complex carbs (rice, potato, oats, whole grains, legumes). Each meal should center on a lean protein.\n\nUSE THESE EXACT VERIFIED VALUES for all macro estimates (per 100g unless noted):\n' + buildFoodDbPrompt() + '\n\nCalculate macros by multiplying the reference value by (grams / 100). For example, 200g chicken breast = 200/100 * 165cal = 330cal, 200/100 * 31g protein = 62g. Be precise. Return ONLY valid JSON, no markdown.' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 600,
      temperature: 0.4,
    }),
  })
    .then(function(res) {
      if (!res.ok) throw new Error('API error: ' + res.status);
      return res.json();
    })
    .then(function(data) {
      let content = data.choices[0].message.content;
      content = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const rawPlan = JSON.parse(content);
      if (!rawPlan || typeof rawPlan !== 'object') throw new Error('Invalid meal plan');

      const vResult = validateAndCorrectPlan(rawPlan);
      const plan = vResult.plan;

      emptySlots.forEach(function(slot) {
        const items = plan[slot];
        let meal: MealSlot | null = null;
        for (let i = 0; i < nut.meals.length; i++) {
          if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; }
        }
        if (!meal) return;

        if (Array.isArray(items) && items.length) {
          meal.planNotes = items;
          meal.notes = items.map(function(i: PlanNoteItem) { return typeof i === 'string' ? i : i.desc; }).join(' | ');
        }
      });

      saveData();
      if (btn) { btn.textContent = '🧠 Generate Meal Plan'; btn.disabled = false; }
      renderNutritionView();
      let msg = 'Meal plan ready — ' + emptySlots.length + ' slot(s) filled!';
      if (vResult.corrections > 0) msg += ' (' + vResult.corrections + ' items verified against USDA data)';
      showToast(msg);
    })
    .catch(function(err) {
      if (btn) { btn.textContent = '🧠 Generate Meal Plan'; btn.disabled = false; }
      showToast('Meal plan failed: ' + err.message);
    });
}
