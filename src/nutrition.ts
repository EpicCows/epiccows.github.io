import { state, dom, foods, mealTemplates, recentMeals } from './state';
import { todayStr, formatDate } from './utils';
import { FATSECRET_WORKER } from './core';
import {
  getNutrition, calcDailyTotals, calcSlotTotals, computeSuggestions,
  loadGoals, saveData, saveFoods, saveRecentMeals, trackRecentMeal, getFoodById,
} from './data';
import { showToast, showConfirm, closeConfirm, haptic } from './ui';
import {
  openFoodPicker, closeFoodPicker, renderFoodPickerList,
  showAmountUnitPicker, showServingsPicker, unitSelectHtml,
  showAddFoodModal, pickSlotThen, showTemplatePicker, saveMealAsTemplate,
  parseFsDescription, parseFsServing,
} from './food-picker';
import { generateMealPlan } from './ai';
import type { DailyNutrition, MealSlot, MealEntry, FoodItem, PlanNoteItem, Goals } from './types';

// ==================== RENDER NUTRITION VIEW ====================

export function renderNutritionView(): void {
  const nut = getNutrition(state.nutritionDate);
  const totals = calcDailyTotals(state.nutritionDate);
  const suggestions = computeSuggestions(state.nutritionDate);

  let html = '';
  // Sticky header
  html += '<div class="sticky-bar">';
  html += '<div class="nutrition-date">';
  html += '<button class="date-arrow" id="nutPrevDay">◀</button>';
  html += '<span id="nutDateLabel">' + (state.nutritionDate === todayStr() ? 'Today' : formatDate(state.nutritionDate)) + '</span>';
  html += '<button class="date-arrow" id="nutNextDay"' + (state.nutritionDate >= todayStr() ? ' disabled style="opacity:0.3"' : '') + '>▶</button>';
  const bwData = state.appData.bodyweight || {};
  const todayBw = bwData[todayStr()] || '';
  const bwHistory = Object.keys(bwData).sort().slice(-14).map(function(k) { return bwData[k]; });
  if (bwHistory.length > 1) {
    html += '<span style="font-size:10px;color:#5a7a6a;margin-left:auto;">' + bwHistory[0].toFixed(1) + ' → ' + bwHistory[bwHistory.length - 1].toFixed(1) + ' kg</span>';
  }
  html += '<input type="number" id="bwInput" placeholder="BW kg" value="' + todayBw + '" step="0.1" min="30" max="300" style="width:60px;padding:6px 8px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:12px;text-align:center;margin-left:6px;">';
  html += '</div>';

  const goals = loadGoals();

  // Streak
  let streak = 0;
  const d = new Date(todayStr() + 'T12:00:00');
  for (let si = 0; si < 365; si++) {
    const dateStr = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    const dayTotals = calcDailyTotals(dateStr);
    if (dayTotals.calories > 0 && goals.calories > 0 && dayTotals.calories <= goals.calories) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else if (dayTotals.calories === 0 && dateStr === todayStr()) {
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  // Weekly totals
  const refDate = new Date(state.nutritionDate + 'T12:00:00');
  const dayOfWeek = refDate.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekMon = new Date(refDate);
  weekMon.setDate(refDate.getDate() + mondayOffset);
  let weekCal = 0, weekPro = 0, weekDays = 0;
  for (let wi = 0; wi < 7; wi++) {
    const wd = new Date(weekMon);
    wd.setDate(weekMon.getDate() + wi);
    const wds = wd.getFullYear() + '-' + ('0' + (wd.getMonth() + 1)).slice(-2) + '-' + ('0' + wd.getDate()).slice(-2);
    const wt = calcDailyTotals(wds);
    if (wt.calories > 0) { weekCal += wt.calories; weekPro += wt.protein; weekDays++; }
  }
  const weekGoalCal = goals.calories * 7;
  const weekAvgCal = weekDays > 0 ? Math.round(weekCal / weekDays) : 0;

  html += '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">';
  const streakColor = streak >= 7 ? '#4caf50' : (streak >= 3 ? '#ffb74d' : '#7e8d9e');
  const streakIcon = streak >= 7 ? '🔥' : (streak >= 3 ? '⚡' : '📅');
  html += '<div style="flex:1;min-width:100px;padding:8px 10px;background:#14191f;border-radius:10px;border:1px solid #2a333d;text-align:center;">';
  html += '<div style="font-size:20px;font-weight:700;color:' + streakColor + ';">' + streakIcon + ' ' + streak + '</div>';
  html += '<div style="font-size:9px;color:#7e8d9e;">day streak under ' + goals.calories + ' cal</div>';
  html += '</div>';
  const weekSurplus = weekCal - weekGoalCal;
  const weekColor = weekSurplus <= 0 ? '#4caf50' : (weekSurplus <= 500 ? '#ffb74d' : '#ef5350');
  const weekLabel = weekSurplus <= 0 ? 'under' : 'over';
  html += '<div style="flex:2;min-width:140px;padding:8px 10px;background:#14191f;border-radius:10px;border:1px solid #2a333d;text-align:center;">';
  html += '<div style="display:flex;justify-content:center;align-items:baseline;gap:6px;">';
  html += '<span style="font-size:18px;font-weight:700;color:#e8edf2;">' + (weekCal / 1000).toFixed(1) + 'k</span>';
  html += '<span style="font-size:10px;color:#7e8d9e;">/ ' + (weekGoalCal / 1000).toFixed(1) + 'k</span>';
  html += '<span style="font-size:13px;font-weight:600;color:' + weekColor + ';">' + (weekSurplus <= 0 ? '' : '+') + Math.round(weekSurplus) + '</span>';
  html += '</div>';
  html += '<div style="font-size:9px;color:#7e8d9e;">week ' + weekLabel + ' · avg ' + weekAvgCal + ' cal/day</div>';
  html += '</div>';
  html += '</div>';

  // Macro summary
  html += '<div class="nutrition-summary">';
  html += '<div class="macro-box">';
  html += '<div class="macro-val">' + totals.calories + '</div>';
  html += '<div class="macro-label">Calories';
  if (goals.calories > 0) {
    const calPct = Math.min(100, Math.round((totals.calories / goals.calories) * 100));
    const calRemaining = goals.calories - totals.calories;
    const calClass = calPct >= 100 ? 'over' : (calPct >= 85 ? 'close' : 'under');
    html += ' <span class="macro-remaining ' + calClass + '">(' + (calRemaining > 0 ? calRemaining + ' left' : '0 left') + ')</span>';
    html += '<div class="progress-bar-wrap"><div class="progress-bar-fill ' + calClass + '" style="width:' + calPct + '%"></div></div>';
  }
  html += '</div></div>';
  html += '<div class="macro-box">';
  html += '<div class="macro-val">' + totals.protein + 'g</div>';
  html += '<div class="macro-label">Protein';
  if (goals.protein > 0) {
    const proPct = Math.min(100, Math.round((totals.protein / goals.protein) * 100));
    const proRemaining = goals.protein - totals.protein;
    const proClass = proPct >= 100 ? 'over' : (proPct >= 85 ? 'close' : 'under');
    html += ' <span class="macro-remaining ' + proClass + '">(' + (proRemaining > 0 ? proRemaining + 'g left' : '0g left') + ')</span>';
    html += '<div class="progress-bar-wrap"><div class="progress-bar-fill ' + proClass + '" style="width:' + proPct + '%"></div></div>';
  }
  html += '</div></div>';

  const totalMacroGrams = totals.protein + totals.fat + totals.carbs;
  if (totalMacroGrams > 0) {
    html += '<div style="margin:6px 0 12px;">';
    html += '<div style="display:flex;gap:6px;font-size:10px;color:#7e8d9e;margin-bottom:4px;">';
    html += '<span>Protein ' + totals.protein + 'g</span>';
    html += '<span>Fat ' + totals.fat + 'g</span>';
    html += '<span>Carbs ' + totals.carbs + 'g</span>';
    html += '</div>';
    html += '<div style="height:6px;border-radius:3px;overflow:hidden;display:flex;gap:2px;">';
    const pPct = (totals.protein / totalMacroGrams * 100).toFixed(0);
    const fPct = (totals.fat / totalMacroGrams * 100).toFixed(0);
    const cPct = (totals.carbs / totalMacroGrams * 100).toFixed(0);
    html += '<div style="width:' + pPct + '%;height:100%;background:#4caf50;border-radius:3px;" title="Protein"></div>';
    html += '<div style="width:' + fPct + '%;height:100%;background:#ffb74d;border-radius:3px;" title="Fat"></div>';
    html += '<div style="width:' + cPct + '%;height:100%;background:#64b5f6;border-radius:3px;" title="Carbs"></div>';
    html += '</div></div>';
  }

  // Meal plan daily totals
  let loggedCal = 0, loggedPro = 0, loggedFat = 0, loggedCarbs = 0;
  let planCal = 0, planPro = 0, planFat = 0, planCarbs = 0;
  ['breakfast', 'lunch', 'dinner', 'snacks'].forEach(function(s) {
    let m: MealSlot | null = null;
    for (let i = 0; i < nut.meals.length; i++) { if (nut.meals[i].slot === s) { m = nut.meals[i]; break; } }
    if (m && m.items && m.items.length > 0) {
      const st = calcSlotTotals(m.items);
      loggedCal += st.calories; loggedPro += st.protein; loggedFat += st.fat; loggedCarbs += st.carbs;
    }
    if (m && m.planNotes) {
      m.planNotes.forEach(function(n: PlanNoteItem) {
        if (n.cal) { planCal += n.cal; planPro += (n.pro || 0); planFat += (n.fat || 0); planCarbs += (n.carbs || 0); }
      });
    }
  });
  const combinedCal = loggedCal + planCal;
  const combinedPro = loggedPro + planPro;
  if (planCal > 0 || loggedCal > 0) {
    html += '<div style="margin:8px 0;padding:8px 12px;background:#0f151b;border-radius:10px;border:1px dashed #2a3a2a;display:flex;flex-wrap:wrap;gap:6px 12px;justify-content:center;font-size:11px;">';
    if (loggedCal > 0) {
      html += '<span style="color:#7e8d9e;">Logged: <strong style="color:#b0c0d0;">' + loggedCal + ' cal</strong> P' + loggedPro + 'g</span>';
      if (planCal > 0) html += '<span style="color:#3a4a3a;">+</span>';
    }
    if (planCal > 0) {
      html += '<span style="color:#5a7a6a;">Plan: <strong style="color:#a0c0a0;">' + planCal + ' cal</strong> P' + planPro + ' F' + planFat + ' C' + planCarbs + '</span>';
    }
    if (goals.calories > 0) {
      const combinedRemaining = goals.calories - combinedCal;
      const combinedClass = combinedRemaining >= 0 ? '#5a8a5a' : '#8a5a5a';
      html += '<span style="color:' + combinedClass + ';">→ ' + combinedCal + '/' + goals.calories + ' cal' + (combinedRemaining >= 0 ? ' (' + combinedRemaining + ' left)' : ' (' + Math.abs(combinedRemaining) + ' over)') + '</span>';
    }
    if (goals.protein > 0 && combinedPro > 0) {
      const proShort = goals.protein - combinedPro;
      const proShortClass = proShort <= 0 ? '#5a8a5a' : (proShort <= 20 ? '#ffb74d' : '#8a5a5a');
      html += '<span style="color:' + proShortClass + ';">P' + combinedPro + '/' + goals.protein + 'g' + (proShort > 0 ? ' (-' + proShort + 'g)' : ' ✓') + '</span>';
    }
    html += '</div>';
  }
  html += '</div></div>'; // close sticky-bar and nutrition-summary

  // Quick actions
  html += '<div class="quick-actions">';
  html += '<button class="qa-btn" id="btnUseTemplate">Use Recipe</button>';
  html += '<button class="qa-btn" id="btnLogManual">Log Manually</button>';
  html += '<button class="qa-btn" id="btnMealPlan" style="background:#1e2a1e;border-color:#2d5a2d;color:#4caf50;">🧠 Generate Meal Plan</button>';
  html += '</div>';

  // Recipe chips
  if (mealTemplates.length > 0) {
    html += '<div class="template-chips-row" id="templateChipsRow">';
    html += '<span class="sug-label" style="line-height:22px;">Recipes:</span>';
    for (let ti = 0; ti < mealTemplates.length; ti++) {
      const tpl = mealTemplates[ti];
      let tCal = 0, tPro = 0;
      tpl.items.forEach(function(ti: MealEntry) {
        const tf = getFoodById(ti.foodId);
        if (tf) {
          let m = 1;
          if (ti.amount && ti.unit) { m = ti.amount / 100; }
          else { m = ti.servings || 1; }
          tCal += (tf.calories || 0) * m;
          tPro += (tf.protein || 0) * m;
        }
      });
      html += '<span class="suggestion-chip template-chip" data-tpl-id="' + tpl.id + '">' + tpl.name + ' <span class="sug-badge">' + Math.round(tCal) + 'cal P' + Math.round(tPro) + '</span></span>';
    }
    html += '</div>';
  }

  // Meal slots
  const slots = ['breakfast', 'lunch', 'dinner', 'snacks'];
  const slotIcons: Record<string, string> = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snacks: '🍿' };
  slots.forEach(function(slot) {
    let meal: MealSlot | null = null;
    for (let i = 0; i < nut.meals.length; i++) {
      if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; }
    }
    const slotTotals = calcSlotTotals(meal ? meal.items : []);
    const hasFood = meal && meal.items.length > 0;
    html += '<div class="meal-slot' + (hasFood ? ' has-food' : '') + '" data-slot="' + slot + '">';
    html += '<div class="slot-header">';
    html += '<span class="slot-name">' + slotIcons[slot] + ' ' + slot.charAt(0).toUpperCase() + slot.slice(1) + '</span>';
    html += '<span class="slot-totals">' + (hasFood ? slotTotals.calories + ' cal | ' + slotTotals.protein + 'g protein' : 'Empty') + '</span>';
    html += '</div>';
    if (hasFood) {
      html += '<div class="slot-items">';
      meal!.items.forEach(function(item, idx) {
        const f = getFoodById(item.foodId);
        const name = f ? f.name : 'Unknown';
        html += '<span class="food-chip" data-slot="' + slot + '" data-idx="' + idx + '">';
        let label = name;
        if (item.amount && item.unit) { label = item.amount + item.unit + ' ' + name; }
        else if (item.servings && item.servings !== 1) { label = name + ' x' + item.servings; }
        html += label;
        html += '<span class="chip-del" data-slot="' + slot + '" data-idx="' + idx + '">×</span>';
        html += '</span>';
      });
      html += '</div>';
    }
    if (meal && meal.planNotes && meal.planNotes.length) {
      html += '<div class="plan-chips-row">';
      meal.planNotes.forEach(function(note: PlanNoteItem) {
        const desc = typeof note === 'string' ? note : note.desc;
        let macroSuffix = '';
        if (typeof note === 'object' && note.cal) {
          const verified = note._source === 'usda' || note._source === 'fatsecret';
          macroSuffix = ' <span style="color:#7a8a5a;font-size:9px;">' + note.cal + 'cal P' + (note.pro || 0);
          if (note.fat != null) macroSuffix += ' F' + note.fat;
          if (note.carbs != null) macroSuffix += ' C' + note.carbs;
          if (verified) macroSuffix += ' <span style="color:#4caf50;" title="Verified against ' + note._source + ' data">✓</span>';
          macroSuffix += '</span>';
        }
        html += '<span class="plan-chip" data-slot="' + slot + '" data-search="' + desc.replace(/"/g, '&quot;') + '">' + desc + macroSuffix + '</span>';
      });
      html += '</div>';
    }
    html += '<button class="btn-add-food" data-slot="' + slot + '" style="width:100%;padding:6px;background:none;border:1px dashed #2a333d;border-radius:8px;color:#5a6a6a;font-size:11px;cursor:pointer;margin-top:4px;">+ Add food</button>';
    if (hasFood) {
      html += '<div style="display:flex;gap:4px;margin-top:2px;">';
      html += '<button class="btn-save-tpl" data-save-slot="' + slot + '" style="flex:1;font-size:10px;padding:4px;">💾 Save</button>';
      html += '<button class="btn-clear-slot" data-slot="' + slot + '" style="font-size:10px;padding:4px 8px;background:none;border:1px solid #3a2a2a;border-radius:6px;color:#7a5a5a;cursor:pointer;">Clear</button>';
      html += '</div>';
    }
    html += '</div>';
  });

  // Food library (collapsible)
  html += '<div style="margin-top:20px;">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;" id="toggleFoodLib">';
  html += '<span style="font-size:14px;font-weight:600;">Food Library</span><span id="foodLibArrow">▼</span>';
  html += '</div>';
  html += '<div id="foodLibContent" style="display:none;margin-top:8px;">';
  if (foods.length === 0) {
    html += '<div class="no-foods">No foods yet. Log meals with AI and they\'ll appear here.</div>';
  } else {
    html += '<input type="text" id="foodLibSearch" placeholder="Filter..." style="width:100%;padding:10px;border-radius:10px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:13px;outline:none;margin-bottom:8px;">';
    foods.forEach(function(f) {
      html += '<div class="food-picker-item food-lib-item" data-id="' + f.id + '">';
      html += '<div><div class="fp-name">' + f.name + '</div><div class="fp-macros">' + (f.calories || 0) + ' cal | ' + (f.protein || 0) + 'g protein</div></div>';
      html += '<div style="display:flex;gap:4px;align-items:center;">';
      html += '<button class="lib-quick-add" data-food-id="' + f.id + '" style="padding:4px 10px;background:#1e3a1e;border:1px solid #2d7a3a;border-radius:6px;color:#4caf50;font-size:14px;font-weight:700;cursor:pointer;">+</button>';
      html += '<button class="ex-del" data-del-food="' + f.id + '" style="font-size:16px;">×</button>';
      html += '</div>';
      html += '</div>';
    });
  }
  html += '<button class="btn-log-food" id="btnAddFoodToLib" style="margin-top:8px;">+ Add Food</button>';
  html += '</div></div>';

  // Meal templates
  html += '<div style="margin-top:16px;margin-bottom:8px;">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;" id="toggleTemplates">';
  html += '<span style="font-size:14px;font-weight:600;">Meal Templates</span><span id="templatesArrow">▼</span>';
  html += '</div>';
  html += '<div id="templatesContent" style="display:none;margin-top:8px;">';
  if (mealTemplates.length === 0) {
    html += '<div class="no-foods">No templates. Save a meal as a template first.</div>';
  } else {
    mealTemplates.forEach(function(tpl) {
      const itemNames = tpl.items.map(function(item) {
        const f = getFoodById(item.foodId);
        return f ? f.name : '?';
      }).join(', ');
      html += '<div class="template-card" data-tpl-id="' + tpl.id + '">';
      html += '<div class="tpl-name">' + tpl.name + '</div>';
      html += '<div class="tpl-items">' + itemNames + '</div>';
      html += '</div>';
    });
  }
  html += '</div></div>';

  html += '<div style="text-align:center;padding:16px 0 8px;font-size:9px;color:#3a4a3a;">Powered by <span style="color:#5a7a5a;">FatSecret</span> API</div>';

  if (!dom.nutritionContent) return;
  dom.nutritionContent.innerHTML = html;

  bindNutritionEvents(nut);
}

// ==================== EVENT BINDING ====================

function bindNutritionEvents(nut: DailyNutrition): void {
  if (!dom.nutritionContent) return;

  // Add food buttons
  dom.nutritionContent.querySelectorAll('.btn-add-food').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      state.pendingFoodSlot = (this as HTMLElement).dataset.slot || 'breakfast';
      openFoodPicker();
    });
  });

  // Clear slot buttons
  dom.nutritionContent.querySelectorAll('.btn-clear-slot').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const slot = (this as HTMLElement).dataset.slot || '';
      const nut2 = getNutrition(state.nutritionDate);
      let meal: MealSlot | null = null;
      for (let i = 0; i < nut2.meals.length; i++) { if (nut2.meals[i].slot === slot) { meal = nut2.meals[i]; break; } }
      if (meal) { meal.items = []; meal.planNotes = null; meal.notes = ''; saveData(); renderNutritionView(); }
    });
  });

  // Save recipe buttons
  dom.nutritionContent.querySelectorAll('.btn-save-tpl').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      saveMealAsTemplate((this as HTMLElement).dataset.saveSlot || '');
    });
  });

  // Template chips
  dom.nutritionContent.querySelectorAll('.template-chip[data-tpl-id]').forEach(function(chip) {
    chip.addEventListener('click', function(e) {
      e.stopPropagation();
      const tplId = parseInt((this as HTMLElement).dataset.tplId || '0');
      let tpl = null;
      for (let i = 0; i < mealTemplates.length; i++) {
        if (mealTemplates[i].id === tplId) { tpl = mealTemplates[i]; break; }
      }
      if (!tpl) return;
      pickSlotThen(function(slot) {
        const nut2 = getNutrition(state.nutritionDate);
        let meal: MealSlot | null = null;
        for (let j = 0; j < nut2.meals.length; j++) { if (nut2.meals[j].slot === slot) { meal = nut2.meals[j]; break; } }
        if (!meal) return;
        tpl.items.forEach(function(item: MealEntry) {
          const entry: MealEntry = { foodId: item.foodId };
          if (item.amount != null && item.unit) { entry.amount = item.amount; entry.unit = item.unit; }
          else { entry.servings = item.servings || 1; }
          meal!.items.push(entry);
        });
        saveData();
        trackRecentMeal(slot, meal.items);
        renderNutritionView();
        showToast('Template applied to ' + slot);
      });
    });
  });

  // Date navigation
  const prevBtn = document.getElementById('nutPrevDay');
  const nextBtn = document.getElementById('nutNextDay');
  if (prevBtn) prevBtn.addEventListener('click', function() {
    const d = new Date(state.nutritionDate + 'T12:00:00');
    d.setDate(d.getDate() - 1);
    state.nutritionDate = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    renderNutritionView();
  });
  if (nextBtn) nextBtn.addEventListener('click', function() {
    if (state.nutritionDate >= todayStr()) return;
    const d = new Date(state.nutritionDate + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    state.nutritionDate = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    renderNutritionView();
  });

  // Bodyweight
  const bwInput = document.getElementById('bwInput');
  if (bwInput) {
    bwInput.addEventListener('change', function() {
      const val = parseFloat((this as HTMLInputElement).value);
      if (!state.appData.bodyweight) state.appData.bodyweight = {};
      if (val > 0) { state.appData.bodyweight[todayStr()] = val; }
      else { delete state.appData.bodyweight[todayStr()]; }
      saveData();
      showToast('Weight logged: ' + val + 'kg');
    });
  }

  // Food chip delete
  dom.nutritionContent.querySelectorAll('.chip-del').forEach(function(chip) {
    chip.addEventListener('click', function(e) {
      e.stopPropagation();
      const slot = (this as HTMLElement).dataset.slot || '';
      const idx = parseInt((this as HTMLElement).dataset.idx || '0');
      const nut2 = getNutrition(state.nutritionDate);
      let meal: MealSlot | null = null;
      for (let i = 0; i < nut2.meals.length; i++) { if (nut2.meals[i].slot === slot) { meal = nut2.meals[i]; break; } }
      if (meal) { meal.items.splice(idx, 1); saveData(); trackRecentMeal(slot, meal.items); renderNutritionView(); }
    });
  });

  // Food chip tap to edit
  dom.nutritionContent.querySelectorAll('.food-chip').forEach(function(chip) {
    chip.addEventListener('click', function(e) {
      if ((e.target as HTMLElement).closest('.chip-del')) return;
      e.stopPropagation();
      const el = this as HTMLElement;
      const slot = el.dataset.slot || '';
      const idx = parseInt(el.dataset.idx || '0');
      const nut2 = getNutrition(state.nutritionDate);
      let meal: MealSlot | null = null;
      for (let i = 0; i < nut2.meals.length; i++) { if (nut2.meals[i].slot === slot) { meal = nut2.meals[i]; break; } }
      if (!meal) return;
      const item = meal.items[idx];
      const f = getFoodById(item.foodId);
      if (item.amount && item.unit) {
        showAmountUnitPicker(f ? f.name : 'Food', item.amount, item.unit, function(newAmount, newUnit) {
          if (newAmount <= 0) { meal!.items.splice(idx, 1); }
          else { item.amount = newAmount; item.unit = newUnit; }
          saveData();
          trackRecentMeal(slot, meal!.items);
          renderNutritionView();
        }, item.foodId);
      } else {
        showServingsPicker(f ? f.name : 'Food', item.servings || 1, function(newServings) {
          if (newServings <= 0) { meal!.items.splice(idx, 1); }
          else { item.servings = newServings; }
          saveData();
          trackRecentMeal(slot, meal!.items);
          renderNutritionView();
        });
      }
    });
  });

  // Plan chips
  dom.nutritionContent.querySelectorAll('.plan-chip').forEach(function(chip) {
    chip.addEventListener('click', function(e) {
      e.stopPropagation();
      const el = this as HTMLElement;
      const slot = el.dataset.slot || '';
      const search = el.dataset.search || '';
      state.pendingFoodSlot = slot;
      openFoodPicker();
      setTimeout(function() {
        if (dom.foodSearchInput) dom.foodSearchInput.value = search;
        renderFoodPickerList(search);
        if (dom.foodSearchInput) dom.foodSearchInput.focus();
      }, 250);
    });
  });

  // Quick actions
  const btnTpl = document.getElementById('btnUseTemplate');
  if (btnTpl) btnTpl.addEventListener('click', function() {
    if (mealTemplates.length === 0) { showToast('No templates saved yet'); return; }
    pickSlotThen(function(slot) {
      showTemplatePicker(function(tplId) {
        let tpl = null;
        for (let i = 0; i < mealTemplates.length; i++) { if (mealTemplates[i].id === tplId) { tpl = mealTemplates[i]; break; } }
        if (!tpl) return;
        const nut2 = getNutrition(state.nutritionDate);
        let meal: MealSlot | null = null;
        for (let j = 0; j < nut2.meals.length; j++) { if (nut2.meals[j].slot === slot) { meal = nut2.meals[j]; break; } }
        if (!meal) return;
        tpl.items.forEach(function(item: MealEntry) {
          const entry: MealEntry = { foodId: item.foodId };
          if (item.amount != null && item.unit) { entry.amount = item.amount; entry.unit = item.unit; }
          else { entry.servings = item.servings || 1; }
          meal!.items.push(entry);
        });
        saveData();
        trackRecentMeal(slot, meal.items);
        renderNutritionView();
        showToast('Template applied to ' + slot);
      });
    });
  });

  const btnManual = document.getElementById('btnLogManual');
  if (btnManual) btnManual.addEventListener('click', function() {
    pickSlotThen(function(slot) { state.pendingFoodSlot = slot; openFoodPicker(); });
  });

  const btnMealPlan = document.getElementById('btnMealPlan');
  if (btnMealPlan) btnMealPlan.addEventListener('click', function() { haptic(); generateMealPlan(); });

  // Template cards
  dom.nutritionContent.querySelectorAll('.template-card').forEach(function(card) {
    card.addEventListener('click', function() {
      const tplId = parseInt((this as HTMLElement).dataset.tplId || '0');
      let tpl = null;
      for (let i = 0; i < mealTemplates.length; i++) { if (mealTemplates[i].id === tplId) { tpl = mealTemplates[i]; break; } }
      if (!tpl) return;
      pickSlotThen(function(slot) {
        const nut2 = getNutrition(state.nutritionDate);
        let meal: MealSlot | null = null;
        for (let j = 0; j < nut2.meals.length; j++) { if (nut2.meals[j].slot === slot) { meal = nut2.meals[j]; break; } }
        if (!meal) return;
        tpl.items.forEach(function(item: MealEntry) {
          const entry: MealEntry = { foodId: item.foodId };
          if (item.amount != null && item.unit) { entry.amount = item.amount; entry.unit = item.unit; }
          else { entry.servings = item.servings || 1; }
          meal!.items.push(entry);
        });
        saveData();
        trackRecentMeal(slot, meal.items);
        renderNutritionView();
        showToast('Template applied to ' + slot);
      });
    });
  });

  // Food library toggle/search/delete
  const togLib = document.getElementById('toggleFoodLib');
  if (togLib) togLib.addEventListener('click', function() {
    const c = document.getElementById('foodLibContent');
    const a = document.getElementById('foodLibArrow');
    if (c && a) {
      if (c.style.display === 'none') { c.style.display = 'block'; a.textContent = '▲'; }
      else { c.style.display = 'none'; a.textContent = '▼'; }
    }
  });
  const libSearch = document.getElementById('foodLibSearch');
  if (libSearch) libSearch.addEventListener('input', function() {
    const q = (this as HTMLInputElement).value.toLowerCase();
    document.querySelectorAll('.food-lib-item').forEach(function(el) {
      (el as HTMLElement).style.display = el.textContent?.toLowerCase().indexOf(q) >= 0 ? '' : 'none';
    });
  });

  // Quick-add from library
  dom.nutritionContent.querySelectorAll('.lib-quick-add').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const foodId = parseInt((this as HTMLElement).dataset.foodId || '0');
      const f = getFoodById(foodId);
      if (!f) return;
      pickSlotThen(function(slot) {
        const defAmt = f.per100g ? 100 : 1;
        showAmountUnitPicker(f.name, defAmt, 'g', function(amount, unit) {
          if (amount <= 0) return;
          const nut2 = getNutrition(state.nutritionDate);
          let meal: MealSlot | null = null;
          for (let i = 0; i < nut2.meals.length; i++) { if (nut2.meals[i].slot === slot) { meal = nut2.meals[i]; break; } }
          if (!meal) return;
          meal.items.push({ foodId: foodId, amount: amount, unit: unit });
          saveData();
          trackRecentMeal(slot, meal.items);
          renderNutritionView();
          showToast('Added ' + f.name + ' to ' + slot);
        }, foodId);
      });
    });
  });

  // Delete food
  dom.nutritionContent.querySelectorAll('[data-del-food]').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const id = parseInt((this as HTMLElement).dataset.delFood || '0');
      const f = getFoodById(id);
      showConfirm('<h3>Delete Food?</h3><p>Remove "' + (f ? f.name : '?') + '" from your library?</p>', [
        { label: 'Cancel', cls: 'btn-cancel', callback: function() {} },
        { label: 'Delete', cls: 'btn-danger', callback: function() {
          for (let i = foods.length - 1; i >= 0; i--) { if (foods[i].id === id) { foods.splice(i, 1); break; } }
          for (let i = recentMeals.length - 1; i >= 0; i--) {
            const rm = recentMeals[i];
            let hasDeleted = false;
            for (let ri = 0; ri < rm.items.length; ri++) { if (rm.items[ri].foodId === id) { hasDeleted = true; break; } }
            if (hasDeleted) { recentMeals.splice(i, 1); }
          }
          saveFoods();
          saveRecentMeals();
          renderNutritionView();
          showToast('Food deleted');
        }},
      ]);
    });
  });

  const btnAddLib = document.getElementById('btnAddFoodToLib');
  if (btnAddLib) btnAddLib.addEventListener('click', function() {
    showAddFoodModal('', function(name, cal, pro) {
      if (!name) return;
      foods.push({ id: Date.now(), name: name, calories: cal, protein: pro });
      saveFoods();
      renderNutritionView();
      showToast('Added "' + name + '" to library');
    });
  });

  const togTpl = document.getElementById('toggleTemplates');
  if (togTpl) togTpl.addEventListener('click', function() {
    const c = document.getElementById('templatesContent');
    const a = document.getElementById('templatesArrow');
    if (c && a) {
      if (c.style.display === 'none') { c.style.display = 'block'; a.textContent = '▲'; }
      else { c.style.display = 'none'; a.textContent = '▼'; }
    }
  });
}

// ==================== INLINE AI ESTIMATE ====================

export function callInlineAiEstimate(slot: string, mealText: string, inputEl: HTMLInputElement): void {
  const workerUrl = FATSECRET_WORKER;

  inputEl.disabled = true;
  inputEl.placeholder = 'Estimating...';
  const btn = dom.nutritionContent?.querySelector('.ai-inline-btn[data-slot="' + slot + '"]') as HTMLButtonElement | null;
  if (btn) { btn.textContent = '...'; btn.disabled = true; }

  function restoreInput(): void {
    inputEl.disabled = false;
    inputEl.placeholder = 'Describe what you ate...';
    if (btn) { btn.textContent = 'AI Estimate'; btn.disabled = false; }
  }

  if (workerUrl) {
    const prompt = 'Break this meal description into individual food search terms for a nutrition database lookup. Return ONLY a valid JSON array of strings. Be specific: include preparation method and key ingredients. Meal: ' + mealText;

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
        restoreInput();
        showToast('Looking up ' + terms.length + ' foods in FatSecret...');
        lookupAndImportBatch(terms, slot, workerUrl);
      })
      .catch(function(err) {
        restoreInput();
        showToast('Error: ' + err.message);
      });
  } else {
    const prompt = 'Estimate macros for this meal. Return ONLY a valid JSON array of objects with keys: name (string), amount (number), unit (one of: g, oz, each, scoop, tbsp, tsp, cup, ml), calories (number, total for this amount), protein (number, grams total for this amount). Use natural units per food. Meal: ' + mealText;

    fetch(FATSECRET_WORKER + '/deepseek', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You are a nutrition estimator. Return ONLY valid JSON arrays, no markdown, no extra text. Each object must have: name, amount (number), unit (g/oz/each/scoop/tbsp/tsp/cup/ml), calories (total), protein (grams total). Use appropriate units per food.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 500,
        temperature: 0.3,
      }),
    })
      .then(function(res) {
        if (!res.ok) throw new Error('API error: ' + res.status);
        return res.json();
      })
      .then(function(data) {
        let content = data.choices[0].message.content;
        content = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        const items = JSON.parse(content);
        if (!Array.isArray(items) || items.length === 0) throw new Error('No foods returned');
        restoreInput();
        showAiReviewPanel(slot, items);
      })
      .catch(function(err) {
        restoreInput();
        showToast('Error: ' + err.message);
      });
  }
}

export function lookupAndImportBatch(terms: string[], slot: string, workerUrl: string): void {
  let pending = terms.length;
  let imported = 0;

  terms.forEach(function(term) {
    fetch(workerUrl + '/search?q=' + encodeURIComponent(term) + '&page=0')
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function(data) {
        const foodsList = (data.foods && data.foods.food) ? data.foods.food : null;
        if (!foodsList) { pending--; checkDone(); return; }
        const fsFood = Array.isArray(foodsList) ? foodsList[0] : foodsList;
        const fsId = fsFood.food_id || '';
        const fsName = fsFood.food_name || term;
        const desc = fsFood.food_description || '';
        const macros = parseFsDescription(desc);

        return fetch(workerUrl + '/food?id=' + encodeURIComponent(fsId))
          .then(function(res2) {
            if (!res2.ok) throw new Error('HTTP ' + res2.status);
            return res2.json();
          })
          .then(function(detailData) {
            const food = detailData.food;
            let cals = macros.calories || 0, protein = macros.protein || 0;
            let fat = macros.fat || 0, carbs = macros.carbs || 0;
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
              if (sv.fat > 0) fat = sv.fat;
              if (sv.carbs > 0) carbs = sv.carbs;
            }

            const newId = Date.now() + imported;
            foods.push({ id: newId, name: fsName, calories: cals, protein: protein, fat: fat, carbs: carbs, per100g: true });

            const nut = getNutrition(state.nutritionDate);
            let meal: MealSlot | null = null;
            for (let i = 0; i < nut.meals.length; i++) {
              if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; }
            }
            if (meal) meal.items.push({ foodId: newId, amount: 100, unit: 'g' });

            imported++;
            pending--;
            checkDone();
          });
      })
      .catch(function(err) {
        console.warn('lookupAndImportBatch: FatSecret lookup failed for term', err);
        pending--;
        checkDone();
      });
  });

  function checkDone(): void {
    if (pending <= 0) {
      saveFoods();
      saveData();
      const nut = getNutrition(state.nutritionDate);
      let meal: MealSlot | null = null;
      for (let i = 0; i < nut.meals.length; i++) {
        if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; }
      }
      if (meal) trackRecentMeal(slot, meal.items);
      renderNutritionView();
      showToast('Imported ' + imported + ' foods with real nutrition data!');
    }
  }
}

export function showAiReviewPanel(slot: string, items: any[]): void {
  const existing = document.querySelector('.ai-review-panel[data-slot="' + slot + '"]');
  if (existing) existing.remove();

  const mealSlot = document.querySelector('.meal-slot[data-slot="' + slot + '"]');
  if (!mealSlot) return;

  let html = '<div class="ai-review-panel" data-slot="' + slot + '" style="margin-top:8px;padding:10px;background:#0f151b;border-radius:10px;border:1px solid #2d7a3a;">';
  html += '<div style="font-size:12px;font-weight:600;color:#4caf50;margin-bottom:8px;">Review (edit amounts/macros if off):</div>';

  items.forEach(function(item: any, idx: number) {
    const unit = item.unit || 'g';
    const amount = item.amount || 1;
    html += '<div class="ai-review-item" data-idx="' + idx + '" style="display:flex;gap:4px;align-items:center;margin-bottom:6px;flex-wrap:wrap;">';
    html += '<input type="text" class="rv-name" value="' + (item.name || '').replace(/"/g, '&quot;') + '" style="flex:2;min-width:80px;padding:6px 8px;border-radius:6px;background:#1a222b;border:1px solid #2a333d;color:#e8edf2;font-size:12px;" placeholder="Food">';
    html += '<input type="number" class="rv-amount" value="' + amount + '" style="width:50px;padding:6px 4px;border-radius:6px;background:#1a222b;border:1px solid #2a333d;color:#e8edf2;font-size:12px;text-align:center;" step="0.5" min="0">';
    html += unitSelectHtml(unit);
    html += '<input type="number" class="rv-cal" value="' + (item.calories || 0) + '" style="width:52px;padding:6px 4px;border-radius:6px;background:#1a222b;border:1px solid #2a333d;color:#e8edf2;font-size:12px;text-align:center;" title="kcal">';
    html += '<span style="font-size:10px;color:#7e8d9e;">cal</span>';
    html += '<input type="number" class="rv-pro" value="' + (item.protein || 0) + '" style="width:42px;padding:6px 4px;border-radius:6px;background:#1a222b;border:1px solid #2a333d;color:#e8edf2;font-size:12px;text-align:center;" title="protein g">';
    html += '<span style="font-size:10px;color:#7e8d9e;">g pro</span>';
    html += '<button class="rv-remove" data-idx="' + idx + '" style="padding:4px 6px;background:none;border:none;color:#7a4a4a;font-size:16px;cursor:pointer;">×</button>';
    html += '</div>';
  });

  html += '<div style="display:flex;gap:6px;margin-top:8px;">';
  html += '<button class="rv-confirm" style="flex:1;padding:8px;background:#2d7a3a;border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Confirm All</button>';
  html += '<button class="rv-cancel" style="flex:1;padding:8px;background:#1e262e;border:1px solid #2a333d;border-radius:8px;color:#7a8a9a;font-size:13px;font-weight:600;cursor:pointer;">Cancel</button>';
  html += '</div>';
  html += '</div>';

  const inlineDiv = mealSlot.querySelector('.ai-inline');
  if (inlineDiv) {
    inlineDiv.insertAdjacentHTML('afterend', html);
  } else {
    mealSlot.insertAdjacentHTML('beforeend', html);
  }

  const panel = mealSlot.querySelector('.ai-review-panel[data-slot="' + slot + '"]');
  if (!panel) return;

  panel.querySelectorAll('.rv-remove').forEach(function(btn) {
    btn.addEventListener('click', function() {
      items[parseInt((this as HTMLElement).dataset.idx || '0')] = null;
      ((this as HTMLElement).parentElement as HTMLElement).style.display = 'none';
    });
  });

  panel.querySelector('.rv-cancel')?.addEventListener('click', function() { panel.remove(); });

  panel.querySelector('.rv-confirm')?.addEventListener('click', function() {
    const nut = getNutrition(state.nutritionDate);
    let meal: MealSlot | null = null;
    for (let i = 0; i < nut.meals.length; i++) {
      if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; }
    }
    if (!meal) return;

    let added = 0;
    panel.querySelectorAll('.ai-review-item').forEach(function(row) {
      const idx = parseInt((row as HTMLElement).dataset.idx || '0');
      const item = items[idx];
      if (!item) return;

      const name = ((row.querySelector('.rv-name') as HTMLInputElement)?.value || '').trim();
      if (!name) return;

      const amount = parseFloat((row.querySelector('.rv-amount') as HTMLInputElement)?.value || '') || 1;
      const unit = (row.querySelector('.rv-unit') as HTMLSelectElement)?.value || 'g';
      const cal = parseInt((row.querySelector('.rv-cal') as HTMLInputElement)?.value || '') || 0;
      const pro = parseInt((row.querySelector('.rv-pro') as HTMLInputElement)?.value || '') || 0;

      const newId = Date.now() + idx + added;
      foods.push({ id: newId, name: name, calories: cal, protein: pro });
      meal!.items.push({ foodId: newId, amount: amount, unit: unit });
      added++;
    });

    saveFoods();
    saveData();
    trackRecentMeal(slot, meal.items);
    panel.remove();
    renderNutritionView();
    showToast(added + ' foods added to ' + slot);
  });
}
