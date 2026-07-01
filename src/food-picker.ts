import { state, dom, foods, mealTemplates } from './state';
import { FATSECRET_WORKER } from './core';
import { getNutrition, getFoodById, saveData, saveFoods, saveMealTemplates, trackRecentMeal } from './data';
import { showToast, showConfirm, closeConfirm, haptic } from './ui';
import { renderNutritionView } from './nutrition';
import type { FoodItem, MealEntry } from './types';

let fsSearchTimer: ReturnType<typeof setTimeout> | null = null;

// ==================== FOOD PICKER ====================

export function openFoodPicker(): void {
  if (!dom.foodPickerModal || !dom.foodSearchInput) return;
  dom.foodPickerModal.classList.add('open');
  dom.foodSearchInput.value = '';
  renderFoodPickerList('');
  setTimeout(function() { dom.foodSearchInput!.focus(); }, 200);
}

export function renderFoodPickerList(query: string): void {
  if (!dom.foodPickerList) return;
  const q = query.toLowerCase();
  const filtered = foods.filter(function(f) {
    return f.name.toLowerCase().indexOf(q) >= 0;
  });
  let html = '';

  if (filtered.length === 0) {
    html += '<div class="no-foods">No matching foods in your library.</div>';
  } else {
    filtered.forEach(function(f) {
      html += '<div class="food-picker-item" data-food-id="' + f.id + '">';
      html += '<div><div class="fp-name">' + f.name + '</div><div class="fp-macros">';
      html += (f.calories || 0) + 'cal P' + (f.protein || 0);
      if (f.fat != null) html += ' F' + f.fat;
      if (f.carbs != null) html += ' C' + f.carbs;
      html += '</div></div>';
      html += '<span class="fp-add">+</span>';
      html += '</div>';
    });
  }

  const workerUrl = FATSECRET_WORKER;
  if (query.trim() && workerUrl) {
    html += '<div class="fs-section-label">FatSecret Results</div>';
    html += '<div id="fsResults"><div class="fs-loading">Searching...</div></div>';
  }

  if (query.trim()) {
    html += '<button class="btn-log-food" id="btnAddNewFood" style="margin-top:8px;">+ Add "' + query.trim() + '" to library</button>';
  }
  dom.foodPickerList.innerHTML = html;

  // Local food item click
  dom.foodPickerList.querySelectorAll('.food-picker-item').forEach(function(el) {
    el.addEventListener('click', function() {
      const foodId = parseInt((this as HTMLElement).dataset.foodId || '0');
      const f = getFoodById(foodId);
      if (!f) return;
      if (f.per100g) {
        const sv = smartServe(f.name);
        showAmountUnitPicker(f.name, sv.amount, sv.unit, function(amount, unit) {
          if (amount <= 0) return;
          const nut = getNutrition(state.nutritionDate);
          let meal = null;
          for (let i = 0; i < nut.meals.length; i++) {
            if (nut.meals[i].slot === state.pendingFoodSlot) { meal = nut.meals[i]; break; }
          }
          if (!meal) return;
          meal.items.push({ foodId: foodId, amount: amount, unit: unit });
          saveData();
          trackRecentMeal(state.pendingFoodSlot, meal.items);
          closeFoodPicker();
          renderNutritionView();
          showToast('Added ' + amount + unit + ' ' + f.name);
        }, foodId);
      } else {
        showServingsPicker(f.name, 1, function(servings) {
          if (servings <= 0) return;
          const nut = getNutrition(state.nutritionDate);
          let meal = null;
          for (let i = 0; i < nut.meals.length; i++) {
            if (nut.meals[i].slot === state.pendingFoodSlot) { meal = nut.meals[i]; break; }
          }
          if (!meal) return;
          meal.items.push({ foodId: foodId, servings: servings });
          saveData();
          trackRecentMeal(state.pendingFoodSlot, meal.items);
          closeFoodPicker();
          renderNutritionView();
          showToast('Added ' + f.name + (servings !== 1 ? ' x' + servings : ''));
        });
      }
    });
  });

  // Add new food button
  const addNew = document.getElementById('btnAddNewFood');
  if (addNew) addNew.addEventListener('click', function() {
    const name = query.trim();
    if (!name) return;
    showAddFoodModal(name, function(foodName, cal, pro) {
      if (!foodName) return;
      const newId = Date.now();
      foods.push({ id: newId, name: foodName, calories: cal, protein: pro });
      saveFoods();
      const nut = getNutrition(state.nutritionDate);
      let meal = null;
      for (let i = 0; i < nut.meals.length; i++) {
        if (nut.meals[i].slot === state.pendingFoodSlot) { meal = nut.meals[i]; break; }
      }
      if (meal) meal.items.push({ foodId: newId, servings: 1 });
      saveData();
      trackRecentMeal(state.pendingFoodSlot, meal.items);
      closeFoodPicker();
      renderNutritionView();
      showToast('Added "' + foodName + '"');
    });
  });

  // Fire FatSecret search (debounced 300ms)
  if (query.trim() && workerUrl) {
    if (fsSearchTimer) clearTimeout(fsSearchTimer);
    fsSearchTimer = setTimeout(function() {
      searchFatSecret(query.trim(), workerUrl);
    }, 300);
  }
}

// ==================== FATSECRET HELPERS ====================

export function parseFsDescription(desc: string): { calories: number | null; protein: number | null; fat: number | null; carbs: number | null } {
  if (!desc) return { calories: null, protein: null, fat: null, carbs: null };
  const calMatch = desc.match(/Calories:\s*([\d.]+)kcal/i);
  const proMatch = desc.match(/Protein:\s*([\d.]+)g/i);
  const fatMatch = desc.match(/Fat:\s*([\d.]+)g/i);
  const carbMatch = desc.match(/Carbs:\s*([\d.]+)g/i);
  return {
    calories: calMatch ? Math.round(parseFloat(calMatch[1])) : null,
    protein: proMatch ? Math.round(parseFloat(proMatch[1])) : null,
    fat: fatMatch ? Math.round(parseFloat(fatMatch[1])) : null,
    carbs: carbMatch ? Math.round(parseFloat(carbMatch[1])) : null,
  };
}

export function parseFsServing(s: any): { calories: number; protein: number; fat: number; carbs: number } {
  const cal = parseFloat(s.calories) || 0;
  const pro = parseFloat(s.protein) || 0;
  const fat = parseFloat(s.fat) || 0;
  const carbs = parseFloat(s.carbohydrate) || 0;
  return { calories: Math.round(cal), protein: Math.round(pro), fat: Math.round(fat), carbs: Math.round(carbs) };
}

export function searchFatSecret(query: string, workerUrl: string): void {
  const fsContainer = document.getElementById('fsResults');
  if (!fsContainer) return;

  if (query.toLowerCase().indexOf('australia') < 0 && query.toLowerCase().indexOf('coles') < 0 && query.toLowerCase().indexOf('woolworths') < 0) {
    query = query + ' Australia';
  }

  fetch(workerUrl + '/search?q=' + encodeURIComponent(query) + '&page=0')
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      const fsContainer2 = document.getElementById('fsResults');
      if (!fsContainer2) return;

      let foodsList = (data.foods && data.foods.food) ? data.foods.food : null;
      if (!foodsList) {
        fsContainer2.innerHTML = '<div class="no-foods" style="padding:12px 0;">No FatSecret results for "' + query + '"</div>';
        return;
      }

      if (!Array.isArray(foodsList)) foodsList = [foodsList];

      let html = '';
      foodsList.forEach(function(fsFood: any) {
        const fsId = fsFood.food_id || '';
        const fsName = fsFood.food_name || 'Unknown';
        const desc = fsFood.food_description || '';
        const macros = parseFsDescription(desc);

        html += '<div class="food-picker-item fs-import-item" data-fs-id="' + fsId + '" data-fs-name="' + fsName.replace(/"/g, '&quot;') + '">';
        html += '<div>';
        html += '<div class="fp-name">' + fsName + '</div>';
        html += '<div class="fp-macros">';
        html += (macros.calories !== null ? macros.calories + 'cal ' : '');
        html += 'P' + (macros.protein !== null ? macros.protein : '?') + ' ';
        html += 'F' + (macros.fat !== null ? macros.fat : '?') + ' ';
        html += 'C' + (macros.carbs !== null ? macros.carbs : '?');
        html += '</div>';
        html += '</div>';
        html += '<span class="fp-add" style="font-size:13px;color:#5a7a6a;">import</span>';
        html += '</div>';
      });

      fsContainer2.innerHTML = html;

      fsContainer2.querySelectorAll('.fs-import-item').forEach(function(el) {
        const htmlEl = el as HTMLElement;
        htmlEl.addEventListener('click', function() {
          importFatSecretFood(htmlEl.dataset.fsId || '', htmlEl.dataset.fsName || '', htmlEl, workerUrl);
        });
      });
    })
    .catch(function(err) {
      const fsContainer3 = document.getElementById('fsResults');
      if (!fsContainer3) return;
      fsContainer3.innerHTML = '<div class="fs-error">FatSecret search failed: ' + err.message + '</div>';
    });
}

export function importFatSecretFood(fsId: string, fsName: string, clickedEl: HTMLElement, workerUrl: string): void {
  clickedEl.classList.add('fs-importing');
  const addSpan = clickedEl.querySelector('.fp-add');
  if (addSpan) addSpan.textContent = '...';

  fetch(workerUrl + '/food?id=' + encodeURIComponent(fsId))
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      const food = data.food;
      if (!food) throw new Error('No food data returned');

      let cals = 0, protein = 0, fat = 0, carbs = 0;
      const servings = food.servings && food.servings.serving;
      if (servings) {
        const servingList = Array.isArray(servings) ? servings : [servings];
        let s = servingList[0];
        for (let i = 0; i < servingList.length; i++) {
          if (servingList[i].is_default === '1' || servingList[i].serving_description === '100 g') {
            s = servingList[i]; break;
          }
        }
        const macros = parseFsServing(s);
        cals = macros.calories;
        protein = macros.protein;
        fat = macros.fat;
        carbs = macros.carbs;
      }

      const newId = Date.now();
      const foodName = food.food_name || fsName;
      foods.push({ id: newId, name: foodName, calories: cals, protein: protein, fat: fat || 0, carbs: carbs || 0, per100g: true });
      saveFoods();

      const serve = smartServe(foodName);
      showAmountUnitPicker(foodName, serve.amount, serve.unit, function(amount, unit) {
        if (amount <= 0) {
          renderFoodPickerList(dom.foodSearchInput?.value || '');
          return;
        }
        const nut = getNutrition(state.nutritionDate);
        let meal = null;
        for (let i = 0; i < nut.meals.length; i++) {
          if (nut.meals[i].slot === state.pendingFoodSlot) { meal = nut.meals[i]; break; }
        }
        if (meal) meal.items.push({ foodId: newId, amount: amount, unit: unit });
        saveData();
        trackRecentMeal(state.pendingFoodSlot, meal.items);
        closeFoodPicker();
        renderNutritionView();
        showToast('Added ' + amount + unit + ' ' + foodName);
      }, newId);
    })
    .catch(function(err) {
      clickedEl.classList.remove('fs-importing');
      if (addSpan) addSpan.textContent = 'import';
      showToast('Import failed: ' + err.message);
    });
}

export function smartServe(foodName: string): { amount: number; unit: string } {
  const name = (foodName || '').toLowerCase();
  if (/egg|banana|apple|orange|scoop|bar|slice|wrap|burger|sandwich/i.test(name)) {
    return { amount: 1, unit: 'each' };
  }
  if (/breast|steak|fillet|salmon|tuna|chicken|beef|turkey|pork|lamb|prawn|shrimp|tofu/i.test(name)) {
    return { amount: 150, unit: 'g' };
  }
  if (/oil|milk|juice|coffee/i.test(name)) {
    return { amount: 15, unit: 'ml' };
  }
  if (/butter|sauce|dressing|peanut butter|jam|honey/i.test(name)) {
    return { amount: 15, unit: 'g' };
  }
  return { amount: 100, unit: 'g' };
}

export function closeFoodPicker(): void {
  if (fsSearchTimer) clearTimeout(fsSearchTimer);
  if (dom.foodPickerModal) dom.foodPickerModal.classList.remove('open');
}

// ==================== SERVINGS PICKER ====================

export const COMMON_UNITS = [
  { value: 'g', label: 'g (grams)' },
  { value: 'ml', label: 'ml' },
  { value: 'oz', label: 'oz' },
  { value: 'each', label: 'each' },
  { value: 'cup', label: 'cup' },
  { value: 'tbsp', label: 'tbsp' },
  { value: 'tsp', label: 'tsp' },
  { value: 'scoop', label: 'scoop' },
];

export function unitSelectHtml(selected: string): string {
  let html = '<select id="amountUnitSelect" style="padding:8px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:14px;">';
  COMMON_UNITS.forEach(function(u) {
    html += '<option value="' + u.value + '"' + (u.value === selected ? ' selected' : '') + '>' + u.label + '</option>';
  });
  html += '</select>';
  return html;
}

export function showServingsPicker(foodName: string, current: number, callback: (servings: number) => void): void {
  const opts: { label: string; cls?: string; callback: () => void }[] = [];
  for (let sv = 1; sv <= 6; sv++) {
    const label = sv === 1 ? foodName : foodName + ' x' + sv;
    opts.push({ label: label, callback: (function(s: number) { return function() { callback(s); }; })(sv) });
  }
  opts.push({ label: 'Remove', cls: 'btn-danger', callback: function() { callback(0); } });
  showConfirm('<h3>Servings</h3><p>' + foodName + '</p>', opts);
}

export function showAmountUnitPicker(
  foodName: string, amount: number, unit: string,
  callback: (amount: number, unit: string) => void, foodId?: number,
): void {
  let content = '<h3>' + foodName + '</h3>';
  content += '<div style="display:flex;gap:8px;align-items:center;margin-top:8px;">';
  content += '<input type="number" id="amountVal" value="' + amount + '" step="5" min="0" style="flex:1;padding:10px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:16px;">';
  content += unitSelectHtml(unit || 'g');
  content += '</div>';

  if (foodId) {
    content += '<div id="amountLivePreview" style="margin-top:8px;padding:8px;border-radius:8px;background:#0f151b;color:#7e8d9e;font-size:12px;text-align:center;"></div>';
  }

  const actions = [
    { label: 'Cancel', cls: 'btn-cancel', callback: function() { callback(-1, ''); } },
    { label: 'Remove', cls: 'btn-danger', callback: function() { callback(0, ''); } },
    { label: 'Add', cls: 'btn-save', callback: function() {
      const amt = parseFloat((document.getElementById('amountVal') as HTMLInputElement)?.value || '') || 0;
      const unt = (document.getElementById('amountUnitSelect') as HTMLSelectElement)?.value;
      callback(amt, unt);
    }},
  ];

  showConfirm(content, actions);

  // Live preview
  if (foodId) {
    const updatePreview = function() {
      const previewEl = document.getElementById('amountLivePreview');
      const amt = parseFloat((document.getElementById('amountVal') as HTMLInputElement)?.value || '') || 0;
      const unt = (document.getElementById('amountUnitSelect') as HTMLSelectElement)?.value;
      const f = getFoodById(foodId);
      if (!f || !f.per100g) { if (previewEl) previewEl.textContent = ''; return; }
      const mult = unt === 'g' || unt === 'ml' ? amt / 100 : amt;
      const cal = Math.round((f.calories || 0) * mult);
      const pro = Math.round((f.protein || 0) * mult);
      if (previewEl) previewEl.textContent = cal + ' cal · ' + pro + 'g protein' + (f.fat != null ? ' · ' + Math.round(f.fat * mult) + 'g fat' : '') + (f.carbs != null ? ' · ' + Math.round(f.carbs * mult) + 'g carbs' : '');
    };
    setTimeout(function() {
      const av = document.getElementById('amountVal');
      if (av) { av.addEventListener('input', updatePreview); updatePreview(); }
    }, 100);
  }
}

export function pickSlotThen(callback: (slot: string) => void): void {
  const slots = ['breakfast', 'lunch', 'dinner', 'snacks'];
  const slotIcons: Record<string, string> = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snacks: '🍿' };
  const actions: { label: string; cls?: string; callback: () => void }[] = [];
  slots.forEach(function(slot) {
    actions.push({
      label: slotIcons[slot] + ' ' + slot.charAt(0).toUpperCase() + slot.slice(1),
      cls: 'btn-save',
      callback: function() { callback(slot); closeConfirm(); },
    });
  });
  actions.push({ label: 'Cancel', cls: 'btn-cancel', callback: function() {} });
  showConfirm('<h3>Pick Meal Slot</h3>', actions);
}

export function showTemplatePicker(callback: (tplId: number) => void): void {
  if (mealTemplates.length === 0) {
    showToast('No templates saved yet');
    return;
  }
  const actions = mealTemplates.map(function(tpl) {
    const itemNames = tpl.items.map(function(item) {
      const f = getFoodById(item.foodId);
      return f ? f.name : '?';
    }).join(', ');
    return {
      label: tpl.name + ' (' + itemNames + ')',
      cls: 'btn-save' as string,
      callback: function() { callback(tpl.id); closeConfirm(); },
    };
  });
  actions.push({ label: 'Cancel', cls: 'btn-cancel', callback: function() {} });
  showConfirm('<h3>Choose Recipe</h3>', actions);
}

export function saveMealAsTemplate(slot: string): void {
  const nut = getNutrition(state.nutritionDate);
  let meal = null;
  for (let i = 0; i < nut.meals.length; i++) {
    if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; }
  }
  if (!meal || !meal.items.length) {
    showToast('No foods in this slot to save');
    return;
  }
  const names = meal.items.map(function(item) {
    const f = getFoodById(item.foodId);
    return f ? f.name : '?';
  });
  let defaultName = names.slice(0, 3).join(' + ');
  if (names.length > 3) defaultName += ' +more';

  showConfirm(
    '<h3>Save as Recipe?</h3>' +
    '<p>Name: <input type="text" id="tplNameInput" value="' + defaultName.replace(/"/g, '&quot;') + '" style="width:100%;padding:8px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:14px;"></p>',
    [
      { label: 'Cancel', cls: 'btn-cancel', callback: function() {} },
      { label: 'Save', cls: 'btn-save', callback: function() {
        const tplNameInput = document.getElementById('tplNameInput') as HTMLInputElement;
        const tplName = (tplNameInput?.value.trim()) || defaultName;
        mealTemplates.push({
          id: Date.now(),
          name: tplName,
          items: meal.items.map(function(item: MealEntry) {
            const copy: MealEntry = { foodId: item.foodId };
            if (item.amount != null && item.unit) {
              copy.amount = item.amount;
              copy.unit = item.unit;
            } else {
              copy.servings = item.servings || 1;
            }
            return copy;
          }),
        });
        saveMealTemplates();
        renderNutritionView();
        showToast('Recipe "' + tplName + '" saved!');
      }},
    ],
  );
}

export function showAddFoodModal(prefillName: string, callback: (name: string | null, cal: number, pro: number) => void): void {
  let content = '<h3>Add Food</h3>';
  content += '<input type="text" id="newFoodName" placeholder="Food name" value="' + (prefillName || '').replace(/"/g, '&quot;') + '" style="width:100%;padding:10px;margin-bottom:8px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:14px;outline:none;">';
  content += '<div style="display:flex;gap:8px;">';
  content += '<input type="number" id="newFoodCal" placeholder="Calories" step="1" min="0" style="flex:1;padding:10px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:14px;">';
  content += '<input type="number" id="newFoodPro" placeholder="Protein (g)" step="0.1" min="0" style="flex:1;padding:10px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:14px;">';
  content += '</div>';

  showConfirm(content, [
    { label: 'Cancel', cls: 'btn-cancel', callback: function() { callback(null, 0, 0); } },
    { label: 'Add', cls: 'btn-save', callback: function() {
      const name = ((document.getElementById('newFoodName') as HTMLInputElement)?.value || '').trim();
      const cal = parseInt((document.getElementById('newFoodCal') as HTMLInputElement)?.value || '') || 0;
      const pro = parseFloat((document.getElementById('newFoodPro') as HTMLInputElement)?.value || '') || 0;
      callback(name, cal, pro);
    }},
  ]);
}

// ==================== EVENT INIT ====================

export function initFoodPickerEvents(): void {
  // Food picker modal overlay
  if (dom.foodPickerModal) {
    dom.foodPickerModal.addEventListener('click', function(e) {
      if (e.target === dom.foodPickerModal) closeFoodPicker();
    });
  }
  const foodPickerCancel = document.getElementById('foodPickerCancel');
  if (foodPickerCancel) foodPickerCancel.addEventListener('click', closeFoodPicker);

  // Food search input
  if (dom.foodSearchInput) {
    dom.foodSearchInput.addEventListener('input', function() {
      renderFoodPickerList((this as HTMLInputElement).value);
    });
    dom.foodSearchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        const q = (this as HTMLInputElement).value.trim();
        if (q) {
          showAddFoodModal(q, function(name, cal, pro) {
            if (!name) return;
            const newId = Date.now();
            foods.push({ id: newId, name: name, calories: cal, protein: pro });
            saveFoods();
            const nut = getNutrition(state.nutritionDate);
            let meal = null;
            for (let i = 0; i < nut.meals.length; i++) {
              if (nut.meals[i].slot === state.pendingFoodSlot) { meal = nut.meals[i]; break; }
            }
            if (meal) meal.items.push({ foodId: newId, servings: 1 });
            saveData();
            trackRecentMeal(state.pendingFoodSlot, meal.items);
            closeFoodPicker();
            renderNutritionView();
            showToast('Added "' + name + '"');
          });
        }
      }
    });
  }
}
