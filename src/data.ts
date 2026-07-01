import { state, dom, foods, mealTemplates, recentMeals } from './state';
import { todayStr, migrateOldKeys, formatDate } from './utils';
import {
  PROFILE, FATSECRET_WORKER, STORAGE_KEY, FOODS_KEY, TEMPLATES_KEY,
  RECENT_MEALS_KEY, GOALS_KEY, MAX_RECENT_MEALS,
} from './core';
import type {
  AppData, CompletedWorkout, Goals, FoodItem, MealEntry, MealTemplate,
  RecentMeal, DailyNutrition, MealSlot, PlanNoteItem,
} from './types';

// Runtime imports — called in callbacks, not at parse time
import { showToast, showConfirm } from './ui';
import { renderWorkoutView, renderArchiveView, renderStatsView } from './workout';
import { renderNutritionView } from './nutrition';

// Module-private
let _backupTimer: ReturnType<typeof setTimeout> | null = null;

// ==================== DATA PERSISTENCE ====================

export function loadData(): void {
  migrateOldKeys();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state.appData.workouts = parsed.workouts || [];
      state.appData.currentWorkout = parsed.currentWorkout || null;
      state.appData.nutrition = parsed.nutrition || {};
      state.appData.bodyweight = parsed.bodyweight || {};
    } else {
      tryMigrateOldData();
    }
  } catch (e) {
    state.appData = { workouts: [], currentWorkout: null, nutrition: {} };
  }
  // If storage is empty, attempt cloud restore
  if (state.appData.workouts.length === 0 && !state.appData.currentWorkout) {
    let hasNutrition = false;
    for (const k in state.appData.nutrition) {
      if (Object.prototype.hasOwnProperty.call(state.appData.nutrition, k)) { hasNutrition = true; break; }
    }
    if (!hasNutrition) {
      restoreFromCloud(function(backup) {
        if (backup && backup.data) {
          state.appData.workouts = backup.data.workouts || [];
          state.appData.nutrition = backup.data.nutrition || {};
          state.appData.bodyweight = backup.data.bodyweight || {};
          saveData();
          showToast('📥 Restored from cloud backup (' + backup.backedUpAt + ')');
          if (state.currentView === 'workout') renderWorkoutView();
          else if (state.currentView === 'nutrition') renderNutritionView();
        }
      });
    }
  }
}

export function tryMigrateOldData(): void {
  try {
    const old = localStorage.getItem('tallTenderProgress');
    if (!old) return;
    localStorage.removeItem('tallTenderProgress');
    localStorage.removeItem('tallTenderRestDuration');
  } catch (e) { console.warn('migrateOldData failed', e); }
}

export function saveData(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.appData));
  } catch (e) { console.warn('saveData failed', e); }
  scheduleCloudBackup();
}

// ==================== CLOUD BACKUP ====================

export function scheduleCloudBackup(): void {
  if (_backupTimer) clearTimeout(_backupTimer);
  _backupTimer = setTimeout(syncCloudBackup, 3000);
}

export function syncCloudBackup(): void {
  const payload = {
    profile: PROFILE,
    data: {
      workouts: state.appData.workouts,
      nutrition: state.appData.nutrition,
      bodyweight: state.appData.bodyweight,
      backedUpAt: new Date().toISOString(),
    },
  };
  fetch(FATSECRET_WORKER + '/backup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
    .then(function(res) {
      if (res.ok) {
        try { localStorage.setItem('tallTenderLastSync', new Date().toISOString()); } catch (e) { console.warn('syncCloudBackup: failed to save lastSync', e); }
      }
    })
    .catch(function(err) { console.warn('syncCloudBackup failed', err); });
}

export function restoreFromCloud(callback: (result: { data: AppData; backedUpAt: string } | null) => void): void {
  fetch(FATSECRET_WORKER + '/restore?profile=' + encodeURIComponent(PROFILE))
    .then(function(res) {
      if (!res.ok) return callback(null);
      return res.json();
    })
    .then(function(result) {
      if (!result || !result.data) return callback(null);
      callback(result);
    })
    .catch(function() { callback(null); });
}

// ==================== GOALS ====================

export function loadGoals(): Goals {
  try {
    const raw = localStorage.getItem(GOALS_KEY);
    return raw ? JSON.parse(raw) : { calories: 2500, protein: 200, fat: 70, carbs: 250, height: 178, age: 25 };
  } catch (e) { return { calories: 2500, protein: 200, fat: 70, carbs: 250, height: 178, age: 25 }; }
}

export function saveGoals(goals: Goals): void {
  try { localStorage.setItem(GOALS_KEY, JSON.stringify(goals)); } catch (e) { console.warn('saveGoals failed', e); }
}

// ==================== FOOD CRUD ====================

export function loadFoods(): void {
  try {
    const raw = localStorage.getItem(FOODS_KEY);
    foods.length = 0;
    if (raw) foods.push(...JSON.parse(raw));
  } catch (e) { foods.length = 0; }
}

export function saveFoods(): void {
  try { localStorage.setItem(FOODS_KEY, JSON.stringify(foods)); } catch (e) { console.warn('saveFoods failed', e); }
}

export function loadMealTemplates(): void {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    mealTemplates.length = 0;
    if (raw) mealTemplates.push(...JSON.parse(raw));
  } catch (e) { mealTemplates.length = 0; }
}

export function saveMealTemplates(): void {
  try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(mealTemplates)); } catch (e) { console.warn('saveMealTemplates failed', e); }
}

export function loadRecentMeals(): void {
  try {
    const raw = localStorage.getItem(RECENT_MEALS_KEY);
    recentMeals.length = 0;
    if (raw) recentMeals.push(...JSON.parse(raw));
  } catch (e) { recentMeals.length = 0; }
}

export function saveRecentMeals(): void {
  try { localStorage.setItem(RECENT_MEALS_KEY, JSON.stringify(recentMeals)); } catch (e) { console.warn('saveRecentMeals failed', e); }
}

// ==================== NUTRITION HELPERS ====================

export function getNutrition(dateStr: string): DailyNutrition {
  if (!state.appData.nutrition) state.appData.nutrition = {};
  if (!state.appData.nutrition[dateStr]) {
    state.appData.nutrition[dateStr] = {
      meals: [
        { slot: 'breakfast', items: [], notes: '' },
        { slot: 'lunch', items: [], notes: '' },
        { slot: 'dinner', items: [], notes: '' },
        { slot: 'snacks', items: [], notes: '' },
      ],
    };
  }
  return state.appData.nutrition[dateStr];
}

export function getFoodById(id: number): FoodItem | null {
  for (let i = 0; i < foods.length; i++) {
    if (foods[i].id === id) return foods[i];
  }
  return null;
}

export function calcSlotTotals(items: MealEntry[]): { calories: number; protein: number; fat: number; carbs: number } {
  let cal = 0, pro = 0, fat = 0, carbs = 0;
  items.forEach(function(item) {
    const f = getFoodById(item.foodId);
    if (f) {
      let mult: number;
      if (item.amount != null && item.unit) {
        if (f.per100g) {
          if (item.unit === 'g') { mult = item.amount / 100; }
          else { mult = item.amount; }
        } else { mult = 1; }
      } else {
        mult = item.servings || 1;
      }
      cal   += (f.calories || 0) * mult;
      pro   += (f.protein  || 0) * mult;
      fat   += (f.fat      || 0) * mult;
      carbs += (f.carbs    || 0) * mult;
    }
  });
  return { calories: Math.round(cal), protein: Math.round(pro), fat: Math.round(fat), carbs: Math.round(carbs) };
}

export function calcDailyTotals(dateStr: string): { calories: number; protein: number; fat: number; carbs: number } {
  const nut = getNutrition(dateStr);
  let cal = 0, pro = 0, fat = 0, carbs = 0;
  nut.meals.forEach(function(meal) {
    const t = calcSlotTotals(meal.items);
    cal += t.calories; pro += t.protein; fat += t.fat; carbs += t.carbs;
  });
  return { calories: cal, protein: pro, fat: fat, carbs: carbs };
}

export function renderMealReminder(): string {
  const goals = loadGoals();
  if (!goals.calories) return '';
  const today = calcDailyTotals(todayStr());
  if (today.calories > 0) return '';
  const now = new Date();
  if (now.getHours() < 9) return '';
  const emoji = now.getHours() >= 14 ? '⚠️' : '🍽️';
  return '<div class="meal-reminder" id="mealReminder" style="margin:6px 0 10px;padding:8px 12px;background:#0f0a0a;border-radius:10px;border:1px solid #2a1515;display:flex;align-items:center;gap:8px;cursor:pointer;">' +
    '<span style="font-size:16px;">' + emoji + '</span>' +
    '<span style="font-size:11px;color:#cc4444;flex:1;">No meals logged today — tap to track</span>' +
    '<span style="font-size:10px;color:#884444;">🍽️</span>' +
    '</div>';
}

// ==================== RECENT MEALS ====================

export function trackRecentMeal(slot: string, items: MealEntry[]): void {
  if (!items || items.length === 0) return;
  const ids: number[] = [];
  items.forEach(function(item) { ids.push(item.foodId); });
  ids.sort(function(a, b) { return a - b; });
  const fingerprint = ids.join(',');
  const today = todayStr();
  for (let i = 0; i < recentMeals.length; i++) {
    const rm = recentMeals[i];
    const rmIds: number[] = [];
    rm.items.forEach(function(item) { rmIds.push(item.foodId); });
    rmIds.sort(function(a, b) { return a - b; });
    if (rmIds.join(',') === fingerprint && rm.slot === slot) {
      rm.useCount = (rm.useCount || 0) + 1;
      rm.lastUsed = today;
      recentMeals.splice(i, 1);
      recentMeals.unshift(rm);
      saveRecentMeals();
      return;
    }
  }
  const names: string[] = [];
  items.forEach(function(item) {
    const f = getFoodById(item.foodId);
    if (f) names.push(f.name);
  });
  let displayName = names.slice(0, 3).join(' + ');
  if (names.length > 3) displayName += ' +' + (names.length - 3) + ' more';
  if (!displayName) displayName = 'Meal';
  recentMeals.unshift({
    id: Date.now(),
    name: displayName,
    slot: slot,
    items: items.map(function(item) {
      return {
        foodId: item.foodId,
        servings: item.servings || 1,
        amount: item.amount || null,
        unit: item.unit || null,
      };
    }),
    lastUsed: today,
    useCount: 1,
  });
  if (recentMeals.length > MAX_RECENT_MEALS) {
    recentMeals.length = MAX_RECENT_MEALS;
  }
  saveRecentMeals();
}

export function getRecentMealsForSlot(slot: string, limit?: number): RecentMeal[] {
  const result: RecentMeal[] = [];
  for (let i = 0; i < recentMeals.length; i++) {
    if (recentMeals[i].slot === slot) {
      let valid = true;
      for (let j = 0; j < recentMeals[i].items.length; j++) {
        if (!getFoodById(recentMeals[i].items[j].foodId)) { valid = false; break; }
      }
      if (valid) result.push(recentMeals[i]);
    }
  }
  result.sort(function(a, b) {
    if (a.lastUsed > b.lastUsed) return -1;
    if (a.lastUsed < b.lastUsed) return 1;
    return (b.useCount || 0) - (a.useCount || 0);
  });
  return result.slice(0, limit || 3);
}

interface SuggestionEntry { foodId: number; name: string; count: number; lastUsed: string }

export function computeSuggestions(excludeDate: string): Record<string, { frequent: SuggestionEntry[]; recent: RecentMeal[] }> {
  const slots = ['breakfast', 'lunch', 'dinner', 'snacks'];
  const result: Record<string, { frequent: SuggestionEntry[]; recent: RecentMeal[] }> = {};
  const freqMaps: Record<string, Record<number, { foodId: number; count: number; lastDate: string }>> = {};
  slots.forEach(function(s) { freqMaps[s] = {}; });
  const dates: string[] = [];
  for (const d in state.appData.nutrition) {
    if (Object.prototype.hasOwnProperty.call(state.appData.nutrition, d)) dates.push(d);
  }
  dates.sort().reverse();
  let cutoff = '';
  if (dates.length > 0) {
    const cutoffDate = new Date(todayStr() + 'T12:00:00');
    cutoffDate.setDate(cutoffDate.getDate() - 180);
    cutoff = cutoffDate.getFullYear() + '-' +
      ('0' + (cutoffDate.getMonth() + 1)).slice(-2) + '-' +
      ('0' + cutoffDate.getDate()).slice(-2);
  }
  for (let di = 0; di < dates.length; di++) {
    const dateStr = dates[di];
    if (dateStr < cutoff) break;
    if (dateStr === excludeDate) continue;
    const nut = state.appData.nutrition[dateStr];
    if (!nut || !nut.meals) continue;
    for (let mi = 0; mi < nut.meals.length; mi++) {
      const meal = nut.meals[mi];
      const slot = meal.slot;
      if (!freqMaps[slot]) continue;
      for (let ii = 0; ii < meal.items.length; ii++) {
        const foodId = meal.items[ii].foodId;
        if (!freqMaps[slot][foodId]) {
          freqMaps[slot][foodId] = { foodId: foodId, count: 0, lastDate: dateStr };
        }
        freqMaps[slot][foodId].count++;
        if (dateStr > freqMaps[slot][foodId].lastDate) {
          freqMaps[slot][foodId].lastDate = dateStr;
        }
      }
    }
  }
  slots.forEach(function(slot) {
    const arr: SuggestionEntry[] = [];
    for (const fid in freqMaps[slot]) {
      if (Object.prototype.hasOwnProperty.call(freqMaps[slot], fid)) {
        const entry = freqMaps[slot][fid];
        const f = getFoodById(entry.foodId);
        if (f) {
          arr.push({ foodId: entry.foodId, name: f.name, count: entry.count, lastUsed: entry.lastDate });
        }
      }
    }
    arr.sort(function(a, b) {
      if (b.count !== a.count) return b.count - a.count;
      if (a.lastUsed > b.lastUsed) return -1;
      if (a.lastUsed < b.lastUsed) return 1;
      return 0;
    });
    result[slot] = {
      frequent: arr.slice(0, 4),
      recent: getRecentMealsForSlot(slot, 2),
    };
  });
  return result;
}

// ==================== EXPORT / IMPORT ====================

export function exportData(): void {
  const json = JSON.stringify(state.appData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tall-tender-backup-' + todayStr() + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('📥 Data exported!');
}

export function importData(jsonStr: string): void {
  try {
    const imported = JSON.parse(jsonStr);
    if (!imported.workouts || !Array.isArray(imported.workouts)) {
      throw new Error('Invalid format');
    }
    showConfirm(
      '<h3>Import Data?</h3>' +
      '<p>Found <strong>' + imported.workouts.length + '</strong> workouts.</p>' +
      '<p style="color:#cc4444;">⚠ This will replace all current data.</p>',
      [
        {
          label: 'Cancel',
          cls: 'btn-cancel',
          callback: function() {},
        },
        {
          label: 'Replace',
          cls: 'btn-danger',
          callback: function() {
            state.appData = imported;
            if (!state.appData.currentWorkout) state.appData.currentWorkout = null;
            saveData();
            renderWorkoutView();
            renderArchiveView();
            renderStatsView();
            showToast('📤 ' + imported.workouts.length + ' workouts imported!');
          },
        },
      ],
    );
  } catch (e) {
    showToast('❌ Invalid file format');
  }
}

// ==================== EVENT INIT ====================

export function initImportEvents(): void {
  if (!dom.importInput) return;
  dom.importInput.addEventListener('change', function() {
    const file = (this as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
      importData(e.target?.result as string);
    };
    reader.readAsText(file);
    (this as HTMLInputElement).value = '';
  });
}
