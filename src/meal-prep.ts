import { FATSECRET_WORKER } from './core';
import { getNutrition, saveData, saveFoods, trackRecentMeal } from './data';
import { foods } from './state';
import { showToast } from './ui';
import { validatePlanItem } from './ai';
import { generateShoppingListFromPrepItems } from './shopping-list';
import { formatShoppingList } from './shopping-list';
import { pickSlotThen } from './food-picker';
import type { PlanNoteItem, MealSlot } from './types';

export function showMealPrepModal(): void {
  let html = '<div class="modal-overlay" id="mealPrepModal" style="display:flex;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:200;align-items:flex-end;justify-content:center;">';
  html += '<div class="modal-sheet" style="width:100%;max-width:480px;max-height:85vh;overflow-y:auto;background:#0c0c0c;border-radius:20px 20px 0 0;padding:20px 20px 30px;">';
  html += '<div class="modal-handle" style="width:40px;height:4px;background:#2a2a2a;border-radius:2px;margin:0 auto 16px;"></div>';
  html += '<h3 style="font-size:18px;font-weight:700;margin-bottom:4px;">🥘 Meal Prep</h3>';
  html += '<p style="font-size:11px;color:#888888;margin-bottom:12px;">Describe your recipe — macros are verified against USDA &amp; FatSecret</p>';
  html += '<textarea id="mpRecipeInput" placeholder="e.g. Chicken and garlic cheesy potatoes with broccoli" style="width:100%;min-height:70px;padding:12px;border-radius:10px;background:#111;border:1.5px solid #2a2a2a;color:#e0e0e0;font-size:14px;outline:none;resize:vertical;font-family:inherit;margin-bottom:10px;"></textarea>';
  html += '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;">';
  html += '<span style="font-size:11px;color:#888888;">Portions:</span>';
  html += '<button class="mp-portion-btn" data-delta="-1" style="width:32px;height:32px;border-radius:50%;background:#141414;border:1px solid #2a2a2a;color:#e0e0e0;font-size:16px;cursor:pointer;">−</button>';
  html += '<span id="mpPortionCount" style="font-size:16px;font-weight:700;min-width:30px;text-align:center;">4</span>';
  html += '<button class="mp-portion-btn" data-delta="1" style="width:32px;height:32px;border-radius:50%;background:#141414;border:1px solid #2a2a2a;color:#e0e0e0;font-size:16px;cursor:pointer;">+</button>';
  html += '</div>';
  html += '<button id="btnMpGenerate" style="width:100%;padding:14px;background:#8b0000;border:none;border-radius:12px;color:#fff;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:10px;">Analyze Recipe</button>';
  html += '<div id="mpResult" style="margin-top:8px;"></div>';
  html += '<button id="btnMpClose" style="width:100%;padding:14px;background:#141414;border:1px solid #2a2a2a;border-radius:12px;color:#888888;font-size:14px;font-weight:600;cursor:pointer;margin-top:10px;">Close</button>';
  html += '</div></div>';

  document.body.insertAdjacentHTML('beforeend', html);

  const modal = document.getElementById('mealPrepModal');
  if (!modal) return;

  let portions = 4;

  modal.addEventListener('click', function(e) { if (e.target === modal) modal.remove(); });
  document.getElementById('btnMpClose')?.addEventListener('click', function() { modal.remove(); });

  modal.querySelectorAll('.mp-portion-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const delta = parseInt((this as HTMLElement).dataset.delta || '0');
      portions = Math.max(1, Math.min(14, portions + delta));
      const countEl = document.getElementById('mpPortionCount');
      if (countEl) countEl.textContent = String(portions);
    });
  });

  document.getElementById('btnMpGenerate')?.addEventListener('click', function() {
    const input = (document.getElementById('mpRecipeInput') as HTMLTextAreaElement)?.value?.trim();
    if (!input) { showToast('Describe your recipe first'); return; }
    const resultEl = document.getElementById('mpResult');
    if (resultEl) resultEl.innerHTML = '<div style="text-align:center;padding:20px;color:#888888;">Analyzing recipe...</div>';

    const prompt = 'Break this recipe into individual whole-food ingredients with gram amounts. Return ONLY a valid JSON array. Each object: {"desc":"200g chicken breast","cal":330,"pro":62,"fat":7,"carbs":0}. Calculate macros by multiplying reference per-100g values. Recipe: ' + input;

    fetch(FATSECRET_WORKER + '/deepseek', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You are a precise recipe analyzer. Return ONLY valid JSON arrays, no markdown. Use these EXACT per-100g USDA values to calculate macros: chicken breast 165cal/31pro/3.6fat/0carb, chicken thigh 209cal/26pro/11fat/0carb, lean ground beef 192cal/27pro/8fat/0carb, salmon 208cal/20pro/13fat/0carb, cod 105cal/23pro/0.9fat/0carb, shrimp 99cal/24pro/0.3fat/0.2carb, whole eggs 155cal/13pro/11fat/1.1carb, egg whites 52cal/11pro/0.2fat/0.7carb, greek yogurt 59cal/10pro/0.4fat/3.6carb, cottage cheese 81cal/12pro/2.3fat/3.4carb, cheese 350cal/25pro/27fat/1.3carb, milk 42cal/3.4pro/1fat/5carb, whey 400cal/80pro/5fat/8carb, white rice 130cal/2.7pro/0.3fat/28carb, brown rice 123cal/2.7pro/1fat/26carb, potato 93cal/2.5pro/0.1fat/21carb, sweet potato 90cal/2pro/0.1fat/21carb, oats 389cal/17pro/7fat/66carb, pasta 131cal/5pro/0.6fat/25carb, bread 265cal/9pro/3.2fat/49carb, wholemeal bread 247cal/13pro/3.4fat/41carb, broccoli 55cal/3.7pro/0.6fat/7carb, spinach 23cal/2.9pro/0.4fat/3.6carb, asparagus 22cal/2.4pro/0.2fat/4carb, bell pepper 28cal/0.9pro/0.2fat/6carb, olive oil 884cal/0pro/100fat/0carb, butter 717cal/0.9pro/81fat/0.1carb, avocado 160cal/2pro/15fat/9carb, peanut butter 588cal/25pro/50fat/20carb, banana 89cal/1.1pro/0.3fat/23carb, apple 52cal/0.3pro/0.2fat/14carb. Multiply per-100g value by (grams/100) to get total. Be precise.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 600,
        temperature: 0.3,
      }),
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
      let content = data.choices[0].message.content;
      content = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const rawItems = JSON.parse(content);
      if (!Array.isArray(rawItems) || rawItems.length === 0) throw new Error('No ingredients parsed');

      let verifyCount = 0;
      const validated = rawItems.map(function(item: any) {
        const result = validatePlanItem({ desc: item.desc || '', cal: item.cal || 0, pro: item.pro || 0, fat: item.fat || 0, carbs: item.carbs || 0 });
        if (result._source) verifyCount++;
        return result;
      });

      let totalCal = 0, totalPro = 0, totalFat = 0, totalCarbs = 0;
      validated.forEach(function(v) { totalCal += v.cal; totalPro += v.pro; totalFat += (v.fat || 0); totalCarbs += (v.carbs || 0); });

      let resultHtml = '';
      if (verifyCount > 0) {
        resultHtml += '<div style="font-size:10px;color:#4a8a4a;margin-bottom:6px;">✓ ' + verifyCount + ' of ' + validated.length + ' ingredients verified against USDA/FatSecret</div>';
      }
      resultHtml += '<div style="font-size:13px;font-weight:600;color:#cc0000;margin-bottom:8px;">Ingredients (per portion)</div>';
      validated.forEach(function(item) {
        const badge = item._source === 'usda' ? '✓ USDA' : (item._source === 'fatsecret' ? '✓ FS' : '');
        resultHtml += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #1a1a1a;font-size:12px;">';
        resultHtml += '<span style="color:#e0e0e0;flex:1;">' + item.desc + (badge ? ' <span style="font-size:9px;color:#5a8a5a;">' + badge + '</span>' : '') + '</span>';
        resultHtml += '<span style="color:#888888;white-space:nowrap;">' + item.cal + 'cal P' + item.pro + '</span>';
        resultHtml += '</div>';
      });

      const scaleCal = totalCal * portions;
      const scalePro = totalPro * portions;
      resultHtml += '<div style="margin-top:10px;padding:10px;background:#111;border-radius:8px;">';
      resultHtml += '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px;">';
      resultHtml += '<span style="color:#888888;">Per portion:</span>';
      resultHtml += '<span style="color:#e0e0e0;font-weight:600;">' + totalCal + 'cal P' + totalPro + ' F' + totalFat + ' C' + totalCarbs + '</span>';
      resultHtml += '</div>';
      resultHtml += '<div style="display:flex;justify-content:space-between;font-size:13px;">';
      resultHtml += '<span style="color:#888888;">x' + portions + ' portions:</span>';
      resultHtml += '<span style="color:#cc0000;font-weight:700;">' + scaleCal + 'cal P' + scalePro + '</span>';
      resultHtml += '</div></div>';

      resultHtml += '<div style="display:flex;gap:8px;margin-top:10px;">';
      resultHtml += '<button class="mp-log-one" style="flex:1;padding:12px;background:#8b0000;border:none;border-radius:10px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">🍽️ Log 1 Portion</button>';
      resultHtml += '<button class="mp-shop-list" style="flex:1;padding:12px;background:#1a1010;border:1px solid #4a1010;border-radius:10px;color:#cc0000;font-size:13px;font-weight:600;cursor:pointer;">🛒 Shopping List</button>';
      resultHtml += '</div>';

      if (resultEl) {
        resultEl.innerHTML = resultHtml;
        (resultEl as any)._mpItems = validated;
        (resultEl as any)._mpPortions = portions;
      }
    })
    .catch(function(err) {
      if (resultEl) resultEl.innerHTML = '<div style="color:#c96a6a;text-align:center;padding:10px;">Failed to parse recipe. Try a clearer description.</div>';
    });
  });

  // Delegate action buttons
  modal.addEventListener('click', function(e) {
    const target = e.target as HTMLElement;
    const resultEl = document.getElementById('mpResult');
    if (!resultEl) return;

    if (target.closest('.mp-log-one')) {
      const items = (resultEl as any)._mpItems as PlanNoteItem[];
      if (!items || items.length === 0) return;
      pickSlotThen(function(slot) {
        const nut = getNutrition('');
        let meal: MealSlot | null = null;
        for (let i = 0; i < nut.meals.length; i++) { if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; } }
        if (!meal) return;
        items.forEach(function(item) {
          const nameMatch = item.desc.replace(/\d+\s*g\b/gi, '').replace(/\([^)]*\)/g, '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
          const gMatch = item.desc.match(/(\d+)\s*g\b/i);
          const amount = gMatch ? parseInt(gMatch[1]) : 100;
          const foodId = Date.now() + Math.random();
          foods.push({
            id: foodId, name: nameMatch || item.desc,
            calories: Math.round(item.cal / Math.max(1, amount) * 100),
            protein: Math.round(item.pro / Math.max(1, amount) * 100),
            fat: Math.round((item.fat || 0) / Math.max(1, amount) * 100),
            carbs: Math.round((item.carbs || 0) / Math.max(1, amount) * 100),
            per100g: true,
          });
          meal!.items.push({ foodId: foodId, amount: amount, unit: 'g' });
        });
        saveFoods(); saveData();
        trackRecentMeal(slot, meal.items);
        modal.remove();
        import('./nutrition').then(function(m) { m.renderNutritionView(); });
        showToast('Logged 1 portion to ' + slot);
      });
    }

    if (target.closest('.mp-shop-list')) {
      const items = (resultEl as any)._mpItems as PlanNoteItem[];
      const mpPortions = (resultEl as any)._mpPortions || 1;
      if (!items || items.length === 0) return;
      const listItems = generateShoppingListFromPrepItems(items, mpPortions);
      const text = formatShoppingList(listItems);
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text).then(function() {
          showToast('Shopping list copied! (' + mpPortions + ' portions)');
        }).catch(function() { showToast('Failed to copy'); });
      }
      modal.remove();
    }
  });
}
