import { state, dom, foods, mealTemplates, recentMeals } from './state';
import { todayStr, formatDate } from './utils';
import { FATSECRET_WORKER } from './core';
import {
  getNutrition, calcDailyTotals, calcSlotTotals, computeSuggestions,
  loadGoals, saveData, saveFoods, saveRecentMeals, trackRecentMeal, getFoodById,
getRecentMealsForSlot,
} from './data';
import { showToast, showConfirm, closeConfirm, haptic } from './ui';
import {
  openFoodPicker, closeFoodPicker, renderFoodPickerList,
  showAmountUnitPicker, showServingsPicker, unitSelectHtml,
  showAddFoodModal, pickSlotThen, showTemplatePicker, saveMealAsTemplate,
  parseFsDescription, parseFsServing,
} from './food-picker';
import { generateMealPlan, generateSurpriseMeals, validateSurpriseRecipe } from './ai';
import type { RecipeValidation } from './ai';
import { smartFillSlot, smartFillDay, findMacroAlternatives } from './optimizer';
import type { FillSuggestion, SwapAlternative } from './optimizer';
import { generateShoppingList, generateShoppingListFromMeals, mergeShoppingLists, formatShoppingList } from './shopping-list';
import { showMealPrepModal } from './meal-prep';
import type { DailyNutrition, MealSlot, MealEntry, FoodItem, PlanNoteItem, Goals, SurpriseMealPlan, SurpriseRecipe } from './types';

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
    html += '<span style="font-size:10px;color:#886666;margin-left:auto;">' + bwHistory[0].toFixed(1) + ' → ' + bwHistory[bwHistory.length - 1].toFixed(1) + ' kg</span>';
  }
  html += '<input type="number" id="bwInput" placeholder="BW kg" value="' + todayBw + '" step="0.1" min="30" max="300" style="width:60px;padding:6px 8px;border-radius:8px;background:#0c0c0c;border:1.5px solid #2a333d;color:#e8edf2;font-size:12px;text-align:center;margin-left:6px;">';
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
  const streakColor = streak >= 7 ? '#cc0000' : (streak >= 3 ? '#cc4444' : '#7e8d9e');
  const streakIcon = streak >= 7 ? '🔥' : (streak >= 3 ? '⚡' : '📅');
  html += '<div style="flex:1;min-width:100px;padding:8px 10px;background:#14191f;border-radius:10px;border:1px solid #2a333d;text-align:center;">';
  html += '<div style="font-size:20px;font-weight:700;color:' + streakColor + ';">' + streakIcon + ' ' + streak + '</div>';
  html += '<div style="font-size:9px;color:#7e8d9e;">day streak under ' + goals.calories + ' cal</div>';
  html += '</div>';
  const weekSurplus = weekCal - weekGoalCal;
  const weekColor = weekSurplus <= 0 ? '#cc0000' : (weekSurplus <= 500 ? '#cc4444' : '#ef5350');
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
    html += '<div style="width:' + pPct + '%;height:100%;background:#cc0000;border-radius:3px;" title="Protein"></div>';
    html += '<div style="width:' + fPct + '%;height:100%;background:#cc4444;border-radius:3px;" title="Fat"></div>';
    html += '<div style="width:' + cPct + '%;height:100%;background:#888888;border-radius:3px;" title="Carbs"></div>';
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
    html += '<div style="margin:8px 0;padding:8px 12px;background:#0c0c0c;border-radius:10px;border:1px dashed #2a3a2a;display:flex;flex-wrap:wrap;gap:6px 12px;justify-content:center;font-size:11px;">';
    if (loggedCal > 0) {
      html += '<span style="color:#7e8d9e;">Logged: <strong style="color:#b0c0d0;">' + loggedCal + ' cal</strong> P' + loggedPro + 'g</span>';
      if (planCal > 0) html += '<span style="color:#3a4a3a;">+</span>';
    }
    if (planCal > 0) {
      html += '<span style="color:#886666;">Plan: <strong style="color:#c09898;">' + planCal + ' cal</strong> P' + planPro + ' F' + planFat + ' C' + planCarbs + '</span>';
    }
    if (goals.calories > 0) {
      const combinedRemaining = goals.calories - combinedCal;
      const combinedClass = combinedRemaining >= 0 ? '#5a8a5a' : '#8a5a5a';
      html += '<span style="color:' + combinedClass + ';">→ ' + combinedCal + '/' + goals.calories + ' cal' + (combinedRemaining >= 0 ? ' (' + combinedRemaining + ' left)' : ' (' + Math.abs(combinedRemaining) + ' over)') + '</span>';
    }
    if (goals.protein > 0 && combinedPro > 0) {
      const proShort = goals.protein - combinedPro;
      const proShortClass = proShort <= 0 ? '#5a8a5a' : (proShort <= 20 ? '#cc4444' : '#8a5a5a');
      html += '<span style="color:' + proShortClass + ';">P' + combinedPro + '/' + goals.protein + 'g' + (proShort > 0 ? ' (-' + proShort + 'g)' : ' ✓') + '</span>';
    }
    html += '</div>';
  }
  html += '</div></div>'; // close sticky-bar and nutrition-summary

  // Quick actions
  html += '<div class="quick-actions">';
  if (planCal > 0) {
    html += '<button class="qa-btn" id="btnApplyPlan" style="background:#1a1010;border-color:#cc0000;color:#cc0000;">✅ Apply Plan</button>';
  }
  html += '<button class="qa-btn" id="btnMealPrep" style="background:#1a1010;border-color:#cc0000;color:#cc0000;">🥘 Meal Prep</button>';
  html += '<button class="qa-btn" id="btnShoppingList" style="background:#1a1010;border-color:#4a1010;color:#cc0000;">🛒 Shopping List</button>';
  html += '<button class="qa-btn" id="btnSmartFillDay" style="background:#1a1010;border-color:#4a1010;color:#cc0000;">⚡ Quick Fill</button>';
  html += '<button class="qa-btn" id="btnMealPlan" style="background:#1a1010;border-color:#4a1010;color:#cc0000;">🧠 Meal Plan</button>';
  html += '<button class="qa-btn" id="btnSurpriseMe" style="background:#1a1010;border-color:#4a1010;color:#cc0000;">🎲 Surprise Me</button>';
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

// Recent meals quick-add chips
const slotForRecent = ["breakfast", "lunch", "dinner", "snacks"];
let hasRecent = false;
for (let si = 0; si < slotForRecent.length && !hasRecent; si++) {
  const rms = getRecentMealsForSlot(slotForRecent[si], 5);
  if (rms.length > 0) hasRecent = true;
}
if (hasRecent) {
  html += '<div class="template-chips-row" id="recentChipsRow">';
  html += '<span class="sug-label" style="line-height:22px;">Recent:</span>';
  slotForRecent.forEach(function(slot) {
    const rms = getRecentMealsForSlot(slot, 2);
    rms.forEach(function(rm) {
      html += '<span class="suggestion-chip recent-chip" data-rm-id="' + rm.id + '" data-rm-slot="' + slot + '">' + rm.name + ' <span class="sug-badge">×' + (rm.useCount || 1) + '</span></span>';
    });
  });
  html += '<span class="recent-clear-all" id="clearAllRecent" style="font-size:10px;color:#884444;cursor:pointer;line-height:22px;margin-left:auto;">clear all</span>';
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
        html += '<span class="chip-swap" data-slot="' + slot + '" data-idx="' + idx + '" title="Swap for similar food">⇄</span>';
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
          if (verified) macroSuffix += ' <span style="color:#cc0000;" title="Verified against ' + note._source + ' data">✓</span>';
          macroSuffix += '</span>';
        }
        html += '<span class="plan-chip" data-slot="' + slot + '" data-search="' + desc.replace(/"/g, '&quot;') + '" data-cal="' + (note.cal || 0) + '" data-pro="' + (note.pro || 0) + '" data-fat="' + (note.fat || 0) + '" data-carbs="' + (note.carbs || 0) + '">' + desc + macroSuffix + '<span class="plan-swap-icon" data-slot="' + slot + '" data-desc="' + desc.replace(/"/g, '&quot;') + '" data-cal="' + (note.cal || 0) + '" data-pro="' + (note.pro || 0) + '" data-fat="' + (note.fat || 0) + '" data-carbs="' + (note.carbs || 0) + '" title="Swap for similar food">⇄</span></span>';
      });
      html += '</div>';
    }
    html += '<button class="btn-add-food" data-slot="' + slot + '" style="width:100%;padding:6px;background:none;border:1px dashed #2a333d;border-radius:8px;color:#5a6a6a;font-size:11px;cursor:pointer;margin-top:4px;">+ Add food</button>';
html += '<button class="btn-smart-fill" data-slot="' + slot + '" style="display:block;width:100%;padding:4px;background:none;border:none;color:#3a5a3a;font-size:10px;cursor:pointer;margin-top:2px;text-align:right;">⚡ Smart Fill</button>';
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
    html += '<input type="text" id="foodLibSearch" placeholder="Filter..." style="width:100%;padding:10px;border-radius:10px;background:#0c0c0c;border:1.5px solid #2a333d;color:#e8edf2;font-size:13px;outline:none;margin-bottom:8px;">';
    foods.forEach(function(f) {
      html += '<div class="food-picker-item food-lib-item" data-id="' + f.id + '">';
      html += '<div><div class="fp-name">' + f.name + '</div><div class="fp-macros">' + (f.calories || 0) + ' cal | ' + (f.protein || 0) + 'g protein</div></div>';
      html += '<div style="display:flex;gap:4px;align-items:center;">';
      html += '<button class="lib-quick-add" data-food-id="' + f.id + '" style="padding:4px 10px;background:#1a0808;border:1px solid #8b0000;border-radius:6px;color:#cc0000;font-size:14px;font-weight:700;cursor:pointer;">+</button>';
      html += '<button class="ex-del" data-del-food="' + f.id + '" style="font-size:16px;">×</button>';
      html += '</div>';
      html += '</div>';
    });
  }
  html += '<button class="btn-log-food" id="btnAddFoodToLib" style="margin-top:8px;">+ Add Food</button>';
  html += '</div></div>';

  html += '<div style="text-align:center;padding:16px 0 8px;font-size:9px;color:#3a1a1a;">Powered by <span style="color:#884444;">FatSecret</span> API</div>';

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
      if (meal) {
      const prevItems = meal.items.slice();
      const prevPlanNotes = meal.planNotes ? meal.planNotes.slice() : null;
      const prevNotes = meal.notes;
      meal.items = []; meal.planNotes = null; meal.notes = '';
      saveData(); renderNutritionView();
      showToast('Cleared ' + slot + ' · Undo', function() {
        const nut3 = getNutrition(state.nutritionDate);
        let meal2: MealSlot | null = null;
        for (let i = 0; i < nut3.meals.length; i++) { if (nut3.meals[i].slot === slot) { meal2 = nut3.meals[i]; break; } }
        if (meal2) { meal2.items = prevItems; meal2.planNotes = prevPlanNotes; meal2.notes = prevNotes; }
        saveData(); renderNutritionView();
        showToast('Restored ' + slot);
      });
    }
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
      if (meal) {
      const removed = meal.items[idx];
      const f = getFoodById(removed ? removed.foodId : 0);
      meal.items.splice(idx, 1); saveData(); trackRecentMeal(slot, meal.items); renderNutritionView();
      showToast('Removed ' + (f ? f.name : 'food') + ' · Undo', function() {
        const nut3 = getNutrition(state.nutritionDate);
        let meal2: MealSlot | null = null;
        for (let i = 0; i < nut3.meals.length; i++) { if (nut3.meals[i].slot === slot) { meal2 = nut3.meals[i]; break; } }
        if (meal2 && removed) { meal2.items.splice(idx, 0, removed); saveData(); trackRecentMeal(slot, meal2.items); renderNutritionView(); }
        showToast('Restored ' + (f ? f.name : 'food'));
      });
    }
    });
  });

  // Food chip tap to edit
  dom.nutritionContent.querySelectorAll('.food-chip').forEach(function(chip) {
    chip.addEventListener('click', function(e) {
      if ((e.target as HTMLElement).closest('.chip-del')) return;
      // Swap icon clicked
      if ((e.target as HTMLElement).closest('.chip-swap')) {
        e.stopPropagation();
        haptic();
        const el = (e.target as HTMLElement).closest('.chip-swap') as HTMLElement;
        const swapSlot = el.dataset.slot || '';
        const swapIdx = parseInt(el.dataset.idx || '0');
        const nut3 = getNutrition(state.nutritionDate);
        let meal3: MealSlot | null = null;
        for (let i = 0; i < nut3.meals.length; i++) { if (nut3.meals[i].slot === swapSlot) { meal3 = nut3.meals[i]; break; } }
        if (!meal3 || swapIdx >= meal3.items.length) return;
        const swapItem = meal3.items[swapIdx];
        const swapFood = getFoodById(swapItem.foodId);
        if (!swapFood) return;
        const swapName = swapFood.name;
        const swapCal = swapFood.calories || 0;
        const swapPro = swapFood.protein || 0;
        const swapFat = swapFood.fat || 0;
        const swapCarbs = swapFood.carbs || 0;
        if (swapCal <= 0 && swapPro <= 0) return;
        showFoodSwapPanel(swapSlot, swapIdx, swapName, swapCal, swapPro, swapFat, swapCarbs, el);
        return;
      }
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

  // Plan chips — tap opens food picker, swap icon shows alternatives
  dom.nutritionContent.querySelectorAll('.plan-chip').forEach(function(chip) {
    chip.addEventListener('click', function(e) {
      e.stopPropagation();
      const target = e.target as HTMLElement;
      // Swap icon clicked
      if (target.closest('.plan-swap-icon')) {
        const icon = target.closest('.plan-swap-icon') as HTMLElement;
        const slot = icon.dataset.slot || '';
        const desc = icon.dataset.desc || '';
        const cal = parseInt(icon.dataset.cal || '0');
        const pro = parseInt(icon.dataset.pro || '0');
        const fat = parseInt(icon.dataset.fat || '0');
        const carbs = parseInt(icon.dataset.carbs || '0');
        haptic();
        showSwapPanel(slot, desc, cal, pro, fat, carbs, icon);
        return;
      }
      // Normal click — open food picker
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

  // Shopping list button
  const btnMealPrep = document.getElementById('btnMealPrep');
  if (btnMealPrep) btnMealPrep.addEventListener('click', function() {
    haptic();
    showMealPrepModal();
  });

  const btnShopList = document.getElementById('btnShoppingList');
  if (btnShopList) btnShopList.addEventListener('click', function() {
    haptic();
    showShoppingListModal();
  });


  const btnApplyPlan = document.getElementById('btnApplyPlan');
  if (btnApplyPlan) btnApplyPlan.addEventListener('click', function() {
    haptic();
    applyMealPlan();
  });

  const btnSmartDay = document.getElementById('btnSmartFillDay');
  if (btnSmartDay) btnSmartDay.addEventListener('click', function() {
    haptic();
    const plan = smartFillDay(state.nutritionDate);
    const slots = Object.keys(plan);
    if (slots.length === 0) {
      // No foods in library or goals met — fall back to AI meal plan
      showConfirm(
        '<h3>Quick Fill</h3><p>No matching foods in your library. Generate an AI meal plan instead?</p>',
        [
          { label: 'Cancel', cls: 'btn-cancel', callback: function() {} },
          { label: 'Generate Plan', cls: 'btn-save', callback: function() { generateMealPlan(); } },
        ]
      );
      return;
    }
    let totalItems = 0;
    slots.forEach(function(s) { totalItems += plan[s].length; });
    showConfirm(
      '<h3>Quick Fill</h3><p>Add <strong>' + totalItems + ' foods</strong> from your library across ' + slots.length + ' slot(s)?</p>',
      [
        { label: 'Cancel', cls: 'btn-cancel', callback: function() {} },
        { label: 'Fill All', cls: 'btn-save', callback: function() { applySmartFillDay(plan); } },
      ]
    );
  });

  // Meal Plan button
  const btnMealPlan = document.getElementById('btnMealPlan');
  if (btnMealPlan) btnMealPlan.addEventListener('click', function() {
    haptic();
    generateMealPlan();
  });

  // Surprise Me button
  const btnSurprise = document.getElementById('btnSurpriseMe');
  if (btnSurprise) btnSurprise.addEventListener('click', function() {
    haptic();
    showToast('Generating viral recipes...');
    generateSurpriseMeals(
      function(plan) { showSurpriseModal(plan); },
      function(msg) { showToast('Surprise Me failed: ' + msg); },
    );
  });

  // Smart Fill per-slot buttons
  dom.nutritionContent.querySelectorAll('.btn-smart-fill').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      haptic();
      const slot = (this as HTMLElement).dataset.slot || '';
      const suggestions = smartFillSlot(slot, state.nutritionDate);
      showSmartFillPanel(slot, suggestions);
    });
  });

  // Recent meal chips — apply to slot
  dom.nutritionContent.querySelectorAll('.recent-chip').forEach(function(chip) {
    chip.addEventListener('click', function(e) {
      e.stopPropagation();
      haptic();
      const rmId = parseInt((this as HTMLElement).dataset.rmId || '0');
      const rmSlot = (this as HTMLElement).dataset.rmSlot || '';
      let rm = null;
      for (let i = 0; i < recentMeals.length; i++) { if (recentMeals[i].id === rmId) { rm = recentMeals[i]; break; } }
      if (!rm) return;
      const nut2 = getNutrition(state.nutritionDate);
      let meal: MealSlot | null = null;
      for (let j = 0; j < nut2.meals.length; j++) { if (nut2.meals[j].slot === rmSlot) { meal = nut2.meals[j]; break; } }
      if (!meal) return;
      rm.items.forEach(function(item: MealEntry) {
        const entry: MealEntry = { foodId: item.foodId };
        if (item.amount != null && item.unit) { entry.amount = item.amount; entry.unit = item.unit; }
        else { entry.servings = item.servings || 1; }
        meal!.items.push(entry);
      });
      saveData();
      trackRecentMeal(rmSlot, meal.items);
      renderNutritionView();
      showToast('Re-added ' + rm.name + ' to ' + rmSlot);
    });
  });

  // Clear all recent meals
  const clearRecent = document.getElementById('clearAllRecent');
  if (clearRecent) clearRecent.addEventListener('click', function(e) {
    e.stopPropagation();
    haptic();
    recentMeals.length = 0;
    saveRecentMeals();
    renderNutritionView();
    showToast('Recent meals cleared');
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
          const deletedFood = f ? { id: f.id, name: f.name, calories: f.calories, protein: f.protein, fat: f.fat, carbs: f.carbs, per100g: f.per100g } : null;
          const deletedRecentMeals: { rm: typeof recentMeals[0]; idx: number }[] = [];
          for (let i = foods.length - 1; i >= 0; i--) { if (foods[i].id === id) { foods.splice(i, 1); break; } }
          for (let i = recentMeals.length - 1; i >= 0; i--) {
            const rm = recentMeals[i];
            let hasDeleted = false;
            for (let ri = 0; ri < rm.items.length; ri++) { if (rm.items[ri].foodId === id) { hasDeleted = true; break; } }
            if (hasDeleted) { deletedRecentMeals.push({ rm: rm, idx: i }); recentMeals.splice(i, 1); }
          }
          saveFoods();
          saveRecentMeals();
          renderNutritionView();
          if (deletedFood) {
            showToast('Deleted ' + deletedFood.name + ' · Undo', function() {
              foods.push(deletedFood);
              // Restore recent meals that referenced this food
              for (let ri = deletedRecentMeals.length - 1; ri >= 0; ri--) {
                recentMeals.splice(deletedRecentMeals[ri].idx, 0, deletedRecentMeals[ri].rm);
              }
              saveFoods();
              saveRecentMeals();
              renderNutritionView();
              showToast('Restored ' + deletedFood.name);
            });
          } else {
            showToast('Food deleted');
          }
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

  let html = '<div class="ai-review-panel" data-slot="' + slot + '" style="margin-top:8px;padding:10px;background:#0c0c0c;border-radius:10px;border:1px solid #8b0000;">';
  html += '<div style="font-size:12px;font-weight:600;color:#cc0000;margin-bottom:8px;">Review (edit amounts/macros if off):</div>';

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
  html += '<button class="rv-confirm" style="flex:1;padding:8px;background:#8b0000;border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Confirm All</button>';
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

// ==================== SMART FILL PANEL ====================

export function showSmartFillPanel(slot: string, suggestions: FillSuggestion[]): void {
  // Remove existing smart-fill panel for this slot
  const existing = document.querySelector('.smart-fill-panel[data-slot="' + slot + '"]');
  if (existing) existing.remove();

  const mealSlot = document.querySelector('.meal-slot[data-slot="' + slot + '"]');
  if (!mealSlot) return;

  if (suggestions.length === 0) {
    showToast('No suggestions — goals already met for this slot!');
    return;
  }

  let totalCal = 0, totalPro = 0, totalFat = 0, totalCarbs = 0;
  suggestions.forEach(function(s) {
    totalCal += s.calories;
    totalPro += s.protein;
    totalFat += s.fat;
    totalCarbs += s.carbs;
  });

  let html = '<div class="smart-fill-panel" data-slot="' + slot + '" style="margin-top:8px;padding:10px;background:#0c0c0c;border-radius:10px;border:1px solid #8b0000;">';
  html += '<div style="font-size:12px;font-weight:600;color:#cc0000;margin-bottom:8px;">⚡ Smart Fill — ' + suggestions.length + ' suggestion' + (suggestions.length !== 1 ? 's' : '') + '</div>';

  suggestions.forEach(function(s, idx) {
    const icon = s.source === 'builtin' ? '📦' : '🍽️';
    html += '<div class="sf-item" data-idx="' + idx + '" style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #1a222b;">';
    html += '<span style="font-size:16px;">' + icon + '</span>';
    html += '<div style="flex:1;min-width:0;">';
    html += '<div style="font-size:12px;font-weight:600;color:#e8edf2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + s.name + '</div>';
    html += '<div style="font-size:10px;color:#7e8d9e;">' + s.amountGrams + 'g · ' + s.calories + 'cal P' + s.protein + ' F' + s.fat + ' C' + s.carbs + '</div>';
    html += '</div>';
    html += '<button class="sf-add-one" data-idx="' + idx + '" style="padding:6px 12px;background:#1a0808;border:1px solid #8b0000;border-radius:6px;color:#cc0000;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap;">+</button>';
    html += '</div>';
  });

  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding-top:6px;border-top:1px solid #2a333d;">';
  html += '<span style="font-size:10px;color:#7e8d9e;">Total: ' + totalCal + 'cal P' + totalPro + ' F' + totalFat + ' C' + totalCarbs + '</span>';
  html += '<button class="sf-apply-all" style="padding:6px 16px;background:#8b0000;border:none;border-radius:8px;color:#fff;font-size:12px;font-weight:600;cursor:pointer;">Apply All</button>';
  html += '</div>';
  html += '</div>';

  mealSlot.insertAdjacentHTML('beforeend', html);

  const panel = mealSlot.querySelector('.smart-fill-panel[data-slot="' + slot + '"]');
  if (!panel) return;

  // Add single suggestion
  panel.querySelectorAll('.sf-add-one').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const idx = parseInt((this as HTMLElement).dataset.idx || '0');
      addSuggestionToSlot(slot, suggestions[idx]);
      panel.remove();
    });
  });

  // Apply all
  const applyAllBtn = panel.querySelector('.sf-apply-all');
  if (applyAllBtn) {
    applyAllBtn.addEventListener('click', function() {
      suggestions.forEach(function(s) { addSuggestionToSlot(slot, s); });
      panel.remove();
    });
  }
}

// ==================== SMART FILL HELPERS ====================

function addSuggestionToSlot(slot: string, s: FillSuggestion): void {
  const nut = getNutrition(state.nutritionDate);
  let meal: MealSlot | null = null;
  for (let i = 0; i < nut.meals.length; i++) {
    if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; }
  }
  if (!meal) return;

  let foodId: number;
  if (s.source === 'user' && s.foodId) {
    foodId = s.foodId;
  } else {
    // Create a new FoodItem in the library from FOOD_DB
    foodId = Date.now();
    foods.push({
      id: foodId,
      name: s.name,
      calories: Math.round(s.calories / Math.max(1, s.amountGrams) * 100),
      protein: Math.round(s.protein / Math.max(1, s.amountGrams) * 100),
      fat: Math.round(s.fat / Math.max(1, s.amountGrams) * 100),
      carbs: Math.round(s.carbs / Math.max(1, s.amountGrams) * 100),
      per100g: true,
    });
    saveFoods();
  }

  meal.items.push({ foodId: foodId, amount: s.amountGrams, unit: 'g' });
  saveData();
  trackRecentMeal(slot, meal.items);
  renderNutritionView();
  showToast('Added ' + s.name + ' to ' + slot);
}

function applySmartFillDay(plan: Record<string, FillSuggestion[]>): void {
  const slots = Object.keys(plan);
  let totalAdded = 0;
  slots.forEach(function(slot) {
    plan[slot].forEach(function(s) {
      // Add directly without panel interaction
      const nut = getNutrition(state.nutritionDate);
      let meal: MealSlot | null = null;
      for (let i = 0; i < nut.meals.length; i++) {
        if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; }
      }
      if (!meal) return;

      let foodId: number;
      if (s.source === 'user' && s.foodId) {
        foodId = s.foodId;
      } else {
        foodId = Date.now() + totalAdded;
        foods.push({
          id: foodId,
          name: s.name,
          calories: Math.round(s.calories / Math.max(1, s.amountGrams) * 100),
          protein: Math.round(s.protein / Math.max(1, s.amountGrams) * 100),
          fat: Math.round(s.fat / Math.max(1, s.amountGrams) * 100),
          carbs: Math.round(s.carbs / Math.max(1, s.amountGrams) * 100),
          per100g: true,
        });
      }
      meal.items.push({ foodId: foodId, amount: s.amountGrams, unit: 'g' });
      totalAdded++;
    });
  });
  saveFoods();
  saveData();
  renderNutritionView();
  showToast('Smart Fill: ' + totalAdded + ' foods added across ' + slots.length + ' slots');
}

// ==================== SHOPPING LIST MODAL ====================

function showShoppingListModal(): void {
  const planItems = generateShoppingList(state.nutritionDate);
  const mealItems = generateShoppingListFromMeals(state.nutritionDate);
  const items = mergeShoppingLists(planItems, mealItems);

  if (items.length === 0) {
    showToast('No meal plan items to shop for. Generate a meal plan first!');
    return;
  }

  let html = '<div class="modal-overlay" id="shoppingListModal" style="display:flex;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:200;align-items:flex-end;justify-content:center;">';
  html += '<div class="modal-sheet" style="width:100%;max-width:480px;max-height:80vh;overflow-y:auto;background:#0c0c0c;border-radius:20px 20px 0 0;padding:20px 20px 30px;">';
  html += '<div class="modal-handle" style="width:40px;height:4px;background:#2a2a2a;border-radius:2px;margin:0 auto 16px;"></div>';
  html += '<h3 style="font-size:18px;font-weight:700;margin-bottom:4px;">🛒 Shopping List</h3>';
  html += '<p style="font-size:11px;color:#888888;margin-bottom:16px;">From your meal plan — ' + items.length + ' items</p>';

  let currentCat = '';
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.category !== currentCat) {
      currentCat = item.category;
      html += '<div style="font-size:12px;font-weight:700;color:#cc0000;margin-top:14px;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">' + currentCat + '</div>';
    }
    const display = item.totalGrams >= 1000 ? (item.totalGrams / 1000).toFixed(2) + 'kg' : item.totalGrams + 'g';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid #1a1a1a;font-size:13px;">';
    html += '<span style="color:#e0e0e0;">' + item.name + '</span>';
    html += '<span style="color:#888888;font-weight:600;">' + display + '</span>';
    html += '</div>';
  }

  html += '<div style="display:flex;gap:10px;margin-top:20px;">';
  html += '<button id="btnCopyShoppingList" style="flex:1;padding:14px;background:#1a1010;border:1px solid #4a1010;border-radius:12px;color:#cc0000;font-size:14px;font-weight:600;cursor:pointer;">📋 Copy</button>';
  html += '<button id="btnCloseShoppingList" style="flex:1;padding:14px;background:#141414;border:1px solid #2a2a2a;border-radius:12px;color:#888888;font-size:14px;font-weight:600;cursor:pointer;">Close</button>';
  html += '</div>';
  html += '</div></div>';

  document.body.insertAdjacentHTML('beforeend', html);

  const modal = document.getElementById('shoppingListModal');
  if (!modal) return;

  // Close on overlay click
  modal.addEventListener('click', function(e) {
    if (e.target === modal) modal.remove();
  });

  // Close button
  const closeBtn = document.getElementById('btnCloseShoppingList');
  if (closeBtn) closeBtn.addEventListener('click', function() { modal.remove(); });

  // Copy button
  const copyBtn = document.getElementById('btnCopyShoppingList');
  if (copyBtn) copyBtn.addEventListener('click', function() {
    const text = formatShoppingList(items);
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function() {
        showToast('Shopping list copied!');
      }).catch(function() {
        showToast('Failed to copy');
      });
    } else {
      showToast('Clipboard not available');
    }
  });
}

// ==================== SWAP ALTERNATIVES PANEL ====================

function showSwapPanel(
  slot: string,
  originalDesc: string,
  cal: number,
  pro: number,
  fat: number,
  carbs: number,
  iconEl: HTMLElement,
): void {
  // Remove any existing swap panels
  document.querySelectorAll('.swap-panel').forEach(function(p) { p.remove(); });

  const alternatives = findMacroAlternatives(originalDesc, cal, pro, fat, carbs, 4);

  if (alternatives.length === 0) {
    showToast('No similar alternatives found');
    return;
  }

  let html = '<div class="swap-panel">';
  html += '<div class="swap-header">⇄ Swap "' + originalDesc + '" with:</div>';

  alternatives.forEach(function(alt, idx) {
    html += '<div class="swap-alt-row" data-idx="' + idx + '">';
    html += '<span class="swap-alt-name">' + alt.name + '</span>';
    html += '<span class="swap-alt-macros">' + alt.amountGrams + 'g · ' + alt.calories + 'cal P' + alt.protein + '</span>';
    html += '</div>';
  });

  html += '</div>';

  // Insert after the plan chip that was clicked
  const planChip = iconEl.closest('.plan-chip');
  if (planChip) {
    planChip.insertAdjacentHTML('afterend', html);
  } else {
    iconEl.insertAdjacentHTML('afterend', html);
  }

  // Bind click handlers
  const panel = document.querySelector('.swap-panel');
  if (!panel) return;

  panel.querySelectorAll('.swap-alt-row').forEach(function(row) {
    row.addEventListener('click', function(e) {
      e.stopPropagation();
      const idx = parseInt((this as HTMLElement).dataset.idx || '0');
      const alt = alternatives[idx];
      if (!alt) return;

      // Replace the planNote for this slot with the swapped food
      const nut = getNutrition(state.nutritionDate);
      let meal: MealSlot | null = null;
      for (let i = 0; i < nut.meals.length; i++) {
        if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; }
      }
      if (!meal || !meal.planNotes) return;

      // Find the planNote with matching desc
      for (let i = 0; i < meal.planNotes.length; i++) {
        const note = meal.planNotes[i];
        const noteDesc = typeof note === 'string' ? note : note.desc;
        if (noteDesc === originalDesc) {
          // Build new description
          const newDesc = alt.amountGrams + 'g ' + alt.name.toLowerCase();
          meal.planNotes[i] = {
            desc: newDesc,
            cal: alt.calories,
            pro: alt.protein,
            fat: alt.fat,
            carbs: alt.carbs,
          };
          break;
        }
      }

      panel.remove();
      saveData();
      renderNutritionView();
      showToast('Swapped to ' + alt.name);
    });
  });

  // Close panel when clicking outside
  setTimeout(function() {
    const closeHandler = function(e: Event) {
      const target = e.target as HTMLElement;
      if (!target.closest('.swap-panel') && !target.closest('.plan-swap-icon')) {
        document.querySelectorAll('.swap-panel').forEach(function(p) { p.remove(); });
        document.removeEventListener('click', closeHandler);
      }
    };
    document.addEventListener('click', closeHandler);
  }, 50);
}

// ==================== FOOD CHIP SWAP ====================

function showFoodSwapPanel(
  slot: string,
  itemIdx: number,
  originalDesc: string,
  cal: number,
  pro: number,
  fat: number,
  carbs: number,
  iconEl: HTMLElement,
): void {
  // Remove any existing swap panels
  document.querySelectorAll('.swap-panel').forEach(function(p) { p.remove(); });

  const alternatives = findMacroAlternatives(originalDesc, cal, pro, fat, carbs, 4);

  if (alternatives.length === 0) {
    showToast('No similar alternatives found');
    return;
  }

  let html = '<div class="swap-panel">';
  html += '<div class="swap-header">⇄ Swap "' + originalDesc + '" with:</div>';

  alternatives.forEach(function(alt, idx) {
    html += '<div class="swap-alt-row" data-idx="' + idx + '">';
    html += '<span class="swap-alt-name">' + alt.name + '</span>';
    html += '<span class="swap-alt-macros">' + alt.amountGrams + 'g · ' + alt.calories + 'cal P' + alt.protein + '</span>';
    html += '</div>';
  });

  html += '</div>';

  // Insert after the food chip
  const foodChip = iconEl.closest('.food-chip');
  if (foodChip) {
    foodChip.insertAdjacentHTML('afterend', html);
  } else {
    iconEl.insertAdjacentHTML('afterend', html);
  }

  // Bind click handlers
  const panel = document.querySelector('.swap-panel');
  if (!panel) return;

  panel.querySelectorAll('.swap-alt-row').forEach(function(row) {
    row.addEventListener('click', function(e) {
      e.stopPropagation();
      const idx = parseInt((this as HTMLElement).dataset.idx || '0');
      const alt = alternatives[idx];
      if (!alt) return;

      const nut = getNutrition(state.nutritionDate);
      let meal: MealSlot | null = null;
      for (let i = 0; i < nut.meals.length; i++) {
        if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; }
      }
      if (!meal || itemIdx >= meal.items.length) return;

      // Use existing food from library if available, or create new one
      let foodId: number;
      if (alt.foodId) {
        foodId = alt.foodId;
      } else {
        foodId = Date.now();
        foods.push({
          id: foodId,
          name: alt.name,
          calories: alt.calories,
          protein: alt.protein,
          fat: alt.fat,
          carbs: alt.carbs,
          per100g: true,
        });
        saveFoods();
      }

      // Replace the food item
      meal.items[itemIdx] = { foodId: foodId, amount: alt.amountGrams, unit: 'g' };

      panel.remove();
      saveData();
      trackRecentMeal(slot, meal.items);
      renderNutritionView();
      showToast('Swapped to ' + alt.name);
    });
  });

  // Close panel when clicking outside
  setTimeout(function() {
    const closeHandler = function(e: Event) {
      const target = e.target as HTMLElement;
      if (!target.closest('.swap-panel') && !target.closest('.chip-swap')) {
        document.querySelectorAll('.swap-panel').forEach(function(p) { p.remove(); });
        document.removeEventListener('click', closeHandler);
      }
    };
    document.addEventListener('click', closeHandler);
  }, 50);
}

// ==================== SURPRISE ME MODAL ====================

function showSurpriseModal(plan: SurpriseMealPlan): void {
  // Remove existing modal if any
  const existing = document.getElementById('surpriseModal');
  if (existing) existing.remove();

  const recipes = plan.recipes;
  let portionsPerRecipe: number[] = recipes.map(function(r) { return r.portions; });
  let distributeDays = plan.suggestedDays || Math.max(1, Math.floor(recipes.reduce(function(s, r) { return s + r.portions; }, 0) / 2));

  let html = '<div class="modal-overlay open" id="surpriseModal"><div class="modal-sheet" style="max-width:500px;max-height:85vh;overflow-y:auto;">';
  html += '<div class="modal-handle"></div>';
  html += '<h3 style="margin:0 0 4px;">🎲 Surprise Meal Prep</h3>';
  html += '<p style="color:#888;font-size:12px;margin:0 0 12px;">' + plan.macroSummary + '</p>';

  // Recipe cards
  for (let ri = 0; ri < recipes.length; ri++) {
    const r = recipes[ri];
    html += '<div class="surprise-recipe-card" style="background:#0f151b;border:1.5px solid #2a333d;border-radius:14px;padding:14px;margin-bottom:12px;">';

    // Header: name + freezes badge
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">';
    html += '<div style="font-size:16px;font-weight:700;color:#e8edf2;">' + r.name + '</div>';
    if (r.freezesWell) {
      html += '<span style="font-size:10px;background:#1a2a1a;color:#4caf50;padding:2px 8px;border-radius:8px;">❄️ Freezes</span>';
    }
    html += '</div>';

    // Description
    html += '<p style="color:#7e8d9e;font-size:12px;margin:0 0 10px;">' + r.desc + '</p>';

    // Macro pills
    html += '<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;">';
    html += '<span class="surprise-macro-pill">' + r.caloriesPerPortion + ' cal</span>';
    html += '<span class="surprise-macro-pill">P' + r.proteinPerPortion + 'g</span>';
    html += '<span class="surprise-macro-pill">F' + r.fatPerPortion + 'g</span>';
    html += '<span class="surprise-macro-pill">C' + r.carbsPerPortion + 'g</span>';
    html += '<span class="surprise-macro-pill">⏱ ' + r.prepTime + '</span>';
    html += '</div>';

    // Cross-check macros against FOOD_DB
    const validation = validateSurpriseRecipe(r);
    let badgeColor = '#888';
    if (validation.verdict === 'verified') badgeColor = '#4caf50';
    else if (validation.verdict === 'close') badgeColor = '#cc8800';
    html += '<div style="font-size:11px;color:' + badgeColor + ';margin-bottom:8px;">' + validation.details + '</div>';

    // Portion selector
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">';
    html += '<span style="color:#888;font-size:12px;">Portions:</span>';
    html += '<button class="surprise-portion-btn" data-ri="' + ri + '" data-dir="-1">−</button>';
    html += '<span id="surprisePortion' + ri + '" style="color:#e8edf2;font-weight:600;min-width:20px;text-align:center;">' + r.portions + '</span>';
    html += '<button class="surprise-portion-btn" data-ri="' + ri + '" data-dir="+1">+</button>';
    html += '</div>';

    // Ingredients (collapsible)
    html += '<details style="margin-bottom:8px;"><summary style="color:#5a7a5a;font-size:12px;cursor:pointer;">🛒 Ingredients</summary>';
    html += '<ul style="color:#8a9a8a;font-size:11px;margin:6px 0 0;padding-left:18px;">';
    r.ingredients.forEach(function(ing) { html += '<li>' + ing + '</li>'; });
    html += '</ul></details>';

    // Instructions (collapsible)
    html += '<details style="margin-bottom:8px;"><summary style="color:#5a7a5a;font-size:12px;cursor:pointer;">📋 Instructions</summary>';
    html += '<p style="color:#8a9a8a;font-size:11px;white-space:pre-line;margin:6px 0 0;">' + r.instructions + '</p></details>';

    // Meal prep tips (collapsible)
    html += '<details><summary style="color:#5a7a5a;font-size:12px;cursor:pointer;">💡 Meal Prep Tips</summary>';
    html += '<p style="color:#8a9a8a;font-size:11px;white-space:pre-line;margin:6px 0 0;">' + r.mealPrepTips + '</p></details>';

    html += '</div>'; // end recipe card
  }

  // Distribution options
  html += '<div style="background:#0f151b;border:1.5px solid #2a333d;border-radius:14px;padding:14px;margin-bottom:12px;">';
  html += '<div style="font-size:13px;font-weight:600;color:#e8edf2;margin-bottom:8px;">📅 Distribution</div>';
  html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">';
  html += '<span style="color:#888;font-size:12px;">Eat across</span>';
  html += '<button class="surprise-portion-btn" id="surpriseDaysMinus">−</button>';
  html += '<span id="surpriseDays" style="color:#e8edf2;font-weight:600;min-width:20px;text-align:center;">' + distributeDays + '</span>';
  html += '<button class="surprise-portion-btn" id="surpriseDaysPlus">+</button>';
  html += '<span style="color:#888;font-size:12px;">days</span>';
  html += '</div>';
  const leftover = recipes.reduce(function(s, r, i) { return s + portionsPerRecipe[i]; }, 0) - distributeDays * 2;
  html += '<p id="surpriseLeftover" style="color:#7e8d9e;font-size:11px;margin:0;">' +
    (leftover > 0 ? '💡 ' + leftover + ' portion(s) extra — freeze them for later!' : 'All portions distributed across ' + distributeDays + ' days.') +
    '</p>';
  html += '</div>';

  // Action buttons
  html += '<div class="modal-actions">';
  html += '<button class="btn-cancel" id="surpriseCancel">Cancel</button>';
  html += '<button class="btn-save" id="surpriseApply">✨ Apply Meal Prep</button>';
  html += '</div>';

  html += '</div></div>';
  document.body.insertAdjacentHTML('beforeend', html);

  // Bind portion buttons
  document.querySelectorAll('.surprise-portion-btn[data-ri]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const ri = parseInt((this as HTMLElement).dataset.ri || '0');
      const dir = parseInt((this as HTMLElement).dataset.dir || '0');
      const newVal = Math.max(1, Math.min(12, portionsPerRecipe[ri] + dir));
      portionsPerRecipe[ri] = newVal;
      const span = document.getElementById('surprisePortion' + ri);
      if (span) span.textContent = String(newVal);
      updateSurpriseDistribution();
    });
  });

  // Bind days buttons
  const daysMinus = document.getElementById('surpriseDaysMinus');
  const daysPlus = document.getElementById('surpriseDaysPlus');
  if (daysMinus) daysMinus.addEventListener('click', function() {
    distributeDays = Math.max(1, distributeDays - 1);
    updateSurpriseDistribution();
  });
  if (daysPlus) daysPlus.addEventListener('click', function() {
    distributeDays = Math.min(14, distributeDays + 1);
    updateSurpriseDistribution();
  });

  function updateSurpriseDistribution() {
    const daysEl = document.getElementById('surpriseDays');
    if (daysEl) daysEl.textContent = String(distributeDays);
    const leftoverEl = document.getElementById('surpriseLeftover');
    if (!leftoverEl) return;
    const total = portionsPerRecipe.reduce(function(s, p) { return s + p; }, 0);
    const leftover = total - distributeDays * 2;
    if (leftover > 0) {
      leftoverEl.innerHTML = '💡 <span style="color:#4caf50;">' + leftover + ' portion(s) extra</span> — freeze them for later!';
    } else if (leftover < 0) {
      leftoverEl.innerHTML = '⚠️ Need ' + Math.abs(leftover) + ' more portions to fill ' + distributeDays + ' days (2/day). Add more portions above.';
    } else {
      leftoverEl.innerHTML = '✅ All ' + total + ' portions distributed across ' + distributeDays + ' days (2 meals/day).';
    }
  }

  // Cancel
  const cancelBtn = document.getElementById('surpriseCancel');
  if (cancelBtn) cancelBtn.addEventListener('click', function() {
    document.getElementById('surpriseModal')?.remove();
  });

  // Apply
  const applyBtn = document.getElementById('surpriseApply');
  if (applyBtn) applyBtn.addEventListener('click', function() {
    const nut = getNutrition(state.nutritionDate);
    const emptySlots: string[] = [];
    ['breakfast', 'lunch', 'dinner', 'snacks'].forEach(function(slot) {
      let meal: MealSlot | null = null;
      for (let i = 0; i < nut.meals.length; i++) {
        if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; }
      }
      if (!meal || meal.items.length === 0) emptySlots.push(slot);
    });

    // Build plan notes: map recipe portions to meal slots across days
    let dayOffset = 0;
    let slotIdx = 0;
    let totalApplied = 0;
    const daySlots = ['lunch', 'dinner', 'breakfast', 'snacks']; // preferred slot order

    for (let ri = 0; ri < recipes.length; ri++) {
      const r = recipes[ri];
      for (let p = 0; p < portionsPerRecipe[ri]; p++) {
        if (dayOffset >= distributeDays) break;

        const d = new Date(state.nutritionDate);
d.setDate(d.getDate() + dayOffset);
const dateStr = dayOffset === 0 ? state.nutritionDate : d.toISOString().slice(0, 10);
        const nut2 = getNutrition(dateStr);

        // Find an empty slot
        let targetSlot = '';
        for (let s = 0; s < daySlots.length; s++) {
          let meal: MealSlot | null = null;
          for (let i = 0; i < nut2.meals.length; i++) {
            if (nut2.meals[i].slot === daySlots[s]) { meal = nut2.meals[i]; break; }
          }
          if (!meal || meal.items.length === 0) {
            targetSlot = daySlots[s];
            break;
          }
        }
        if (!targetSlot) { dayOffset++; continue; }

        let meal: MealSlot | null = null;
        for (let i = 0; i < nut2.meals.length; i++) {
          if (nut2.meals[i].slot === targetSlot) { meal = nut2.meals[i]; break; }
        }
        if (!meal) continue;

        // Create plan note for the portion
        const planNote: PlanNoteItem = {
          desc: '1 portion ' + r.name.toLowerCase() + ' (' + r.caloriesPerPortion + ' cal, ' + r.proteinPerPortion + 'g protein)',
          cal: r.caloriesPerPortion,
          pro: r.proteinPerPortion,
          fat: r.fatPerPortion,
          carbs: r.carbsPerPortion,
          _source: 'ai',
        };

        if (!meal.planNotes) meal.planNotes = [];
        meal.planNotes.push(planNote);
        meal.notes = (meal.notes ? meal.notes + ' | ' : '') + planNote.desc;
        totalApplied++;

        slotIdx++;
        if (slotIdx >= 2) { slotIdx = 0; dayOffset++; }
      }
    }

    saveData();
    document.getElementById('surpriseModal')?.remove();
    renderNutritionView();
    showToast('✨ Applied ' + totalApplied + ' portions across ' + Math.min(distributeDays, dayOffset + 1) + ' day(s)!');
  });

  // Close on overlay click
  const overlay = document.getElementById('surpriseModal');
  if (overlay) overlay.addEventListener('click', function(e) {
    if (e.target === overlay) overlay.remove();
  });
}

// ==================== APPLY MEAL PLAN ====================

function applyMealPlan(): void {
  const nut = getNutrition(state.nutritionDate);
  let totalAdded = 0;
  const slotsApplied: string[] = [];

  // Snapshot for undo
  const prevState: { slot: string; items: MealEntry[]; planNotes: PlanNoteItem[] | null }[] = [];

  for (let si = 0; si < nut.meals.length; si++) {
    const meal = nut.meals[si];
    if (!meal.planNotes || meal.planNotes.length === 0) continue;

    // Save previous state
    prevState.push({
      slot: meal.slot,
      items: meal.items.slice(),
      planNotes: meal.planNotes.slice(),
    });

    for (let pi = 0; pi < meal.planNotes.length; pi++) {
      const note = meal.planNotes[pi];
      const desc = typeof note === 'string' ? note : note.desc;
      const cal = typeof note === 'object' ? (note.cal || 0) : 0;
      const pro = typeof note === 'object' ? (note.pro || 0) : 0;
      const fat = typeof note === 'object' ? (note.fat || 0) : 0;
      const carbs = typeof note === 'object' ? (note.carbs || 0) : 0;

      // Try to match an existing food in the library by name
      let foodId = 0;
      let foodName = desc;
      let found = false;

      // Extract food name from description
      const nameMatch = desc.replace(/\d+\s*g\b/gi, '').replace(/\d+\s*oz\b/gi, '').replace(/\([^)]*\)/g, '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();

      // Search user's food library
      for (let fi = 0; fi < foods.length; fi++) {
        const f = foods[fi];
        if (f.name.toLowerCase().indexOf(nameMatch.toLowerCase()) >= 0 || nameMatch.toLowerCase().indexOf(f.name.toLowerCase()) >= 0) {
          foodId = f.id;
          foodName = f.name;
          found = true;
          break;
        }
      }

      if (!found) {
        // Create a new FoodItem
        foodId = Date.now() + totalAdded;
        foods.push({
          id: foodId,
          name: nameMatch || desc,
          calories: cal > 0 ? Math.round(cal / 100 * 100) : Math.round(cal),
          protein: pro > 0 ? Math.round(pro / 100 * 100) : Math.round(pro),
          fat: fat || 0,
          carbs: carbs || 0,
          per100g: true,
        });
        foodName = nameMatch || desc;
      }

      // Parse amount from description
      let amount = 100;
      const gMatch = desc.match(/(\d+)\s*g\b/i);
      if (gMatch) amount = parseInt(gMatch[1]);
      else {
        const ozMatch = desc.match(/(\d+)\s*oz\b/i);
        if (ozMatch) amount = Math.round(parseInt(ozMatch[1]) * 28.35);
      }

      meal.items.push({ foodId: foodId, amount: amount, unit: 'g' });
      totalAdded++;
    }

    meal.planNotes = null;
    meal.notes = '';
    slotsApplied.push(meal.slot);
  }

  if (totalAdded === 0) {
    showToast('No meal plan items to apply');
    return;
  }

  saveFoods();
  saveData();
  renderNutritionView();
  showToast('Applied ' + totalAdded + ' foods from plan · Undo', function() {
    const nut2 = getNutrition(state.nutritionDate);
    for (let i = 0; i < prevState.length; i++) {
      const ps = prevState[i];
      for (let j = 0; j < nut2.meals.length; j++) {
        if (nut2.meals[j].slot === ps.slot) {
          nut2.meals[j].items = ps.items;
          nut2.meals[j].planNotes = ps.planNotes;
          break;
        }
      }
    }
    // Remove newly created foods
    for (let fi = foods.length - 1; fi >= 0; fi--) {
      if (foods[fi].id >= Date.now() - 10000) {
        foods.splice(fi, 1);
      }
    }
    saveFoods();
    saveData();
    renderNutritionView();
    showToast('Meal plan restored');
  });
}
