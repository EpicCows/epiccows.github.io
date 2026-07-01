window.App = window.App || {};

(function() {
  'use strict';

  var App = window.App;

  // Module-private
  var _backupTimer = null;

  // ==================== DATA PERSISTENCE ====================

  App.loadData = function() {
    App.migrateOldKeys();
    try {
      var raw = localStorage.getItem(App.STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        App.state.appData.workouts = parsed.workouts || [];
        App.state.appData.currentWorkout = parsed.currentWorkout || null;
      } else {
        App.tryMigrateOldData();
      }
    } catch (e) {
      App.state.appData = { workouts: [], currentWorkout: null, nutrition: {} };
    }
    // If storage is empty, attempt cloud restore
    if (App.state.appData.workouts.length === 0 && !App.state.appData.currentWorkout) {
      var hasNutrition = false;
      for (var k in App.state.appData.nutrition) {
        if (App.state.appData.nutrition.hasOwnProperty(k)) { hasNutrition = true; break; }
      }
      if (!hasNutrition) {
        App.restoreFromCloud(function(backup) {
          if (backup && backup.data) {
            App.state.appData.workouts = backup.data.workouts || [];
            App.state.appData.nutrition = backup.data.nutrition || {};
            App.state.appData.bodyweight = backup.data.bodyweight || {};
            App.saveData();
            App.showToast('📥 Restored from cloud backup (' + backup.backedUpAt + ')');
            if (App.state.currentView === 'workout') App.renderWorkoutView();
            else if (App.state.currentView === 'nutrition') App.renderNutritionView();
          }
        });
      }
    }
  };

  App.tryMigrateOldData = function() {
    try {
      var old = localStorage.getItem('tallTenderProgress');
      if (!old) return;
      localStorage.removeItem('tallTenderProgress');
      localStorage.removeItem('tallTenderRestDuration');
    } catch (e) {}
  };

  App.saveData = function() {
    try {
      localStorage.setItem(App.STORAGE_KEY, JSON.stringify(App.state.appData));
    } catch (e) {}
    App.scheduleCloudBackup();
  };

  // ==================== CLOUD BACKUP ====================

  App.scheduleCloudBackup = function() {
    if (_backupTimer) clearTimeout(_backupTimer);
    _backupTimer = setTimeout(App.syncCloudBackup, 3000);
  };

  App.syncCloudBackup = function() {
    var payload = {
      profile: App.PROFILE,
      data: {
        workouts: App.state.appData.workouts,
        nutrition: App.state.appData.nutrition,
        bodyweight: App.state.appData.bodyweight,
        backedUpAt: new Date().toISOString()
      }
    };
    fetch(App.FATSECRET_WORKER + '/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
    .then(function(res) {
      if (res.ok) {
        try { localStorage.setItem('tallTenderLastSync', new Date().toISOString()); } catch (e) {}
      }
    })
    .catch(function() { /* silent — will retry on next save */ });
  };

  App.restoreFromCloud = function(callback) {
    fetch(App.FATSECRET_WORKER + '/restore?profile=' + encodeURIComponent(App.PROFILE))
    .then(function(res) {
      if (!res.ok) return callback(null);
      return res.json();
    })
    .then(function(result) {
      if (!result || !result.data) return callback(null);
      callback(result);
    })
    .catch(function() { callback(null); });
  };

  // ==================== GOALS ====================

  App.loadGoals = function() {
    try {
      var raw = localStorage.getItem(App.GOALS_KEY);
      return raw ? JSON.parse(raw) : { calories: 2500, protein: 200, fat: 70, carbs: 250, height: 178, age: 25 };
    } catch (e) { return { calories: 2500, protein: 200, fat: 70, carbs: 250, height: 178, age: 25 }; }
  };

  App.saveGoals = function(goals) {
    try { localStorage.setItem(App.GOALS_KEY, JSON.stringify(goals)); } catch (e) {}
  };

  // ==================== FOOD CRUD ====================

  App.loadFoods = function() {
    try {
      var raw = localStorage.getItem(App.FOODS_KEY);
      App.foods = raw ? JSON.parse(raw) : [];
    } catch (e) { App.foods = []; }
  };

  App.saveFoods = function() {
    try { localStorage.setItem(App.FOODS_KEY, JSON.stringify(App.foods)); } catch (e) {}
  };

  App.loadMealTemplates = function() {
    try {
      var raw = localStorage.getItem(App.TEMPLATES_KEY);
      App.mealTemplates = raw ? JSON.parse(raw) : [];
    } catch (e) { App.mealTemplates = []; }
  };

  App.saveMealTemplates = function() {
    try { localStorage.setItem(App.TEMPLATES_KEY, JSON.stringify(App.mealTemplates)); } catch (e) {}
  };

  App.loadRecentMeals = function() {
    try {
      var raw = localStorage.getItem(App.RECENT_MEALS_KEY);
      App.recentMeals = raw ? JSON.parse(raw) : [];
    } catch (e) { App.recentMeals = []; }
  };

  App.saveRecentMeals = function() {
    try { localStorage.setItem(App.RECENT_MEALS_KEY, JSON.stringify(App.recentMeals)); } catch (e) {}
  };

  // ==================== NUTRITION HELPERS ====================

  App.getNutrition = function(dateStr) {
    if (!App.state.appData.nutrition) App.state.appData.nutrition = {};
    if (!App.state.appData.nutrition[dateStr]) {
      App.state.appData.nutrition[dateStr] = {
        meals: [
          { slot: 'breakfast', items: [], notes: '' },
          { slot: 'lunch', items: [], notes: '' },
          { slot: 'dinner', items: [], notes: '' },
          { slot: 'snacks', items: [], notes: '' }
        ]
      };
    }
    return App.state.appData.nutrition[dateStr];
  };

  App.getFoodById = function(id) {
    for (var i = 0; i < App.foods.length; i++) {
      if (App.foods[i].id === id) return App.foods[i];
    }
    return null;
  };

  App.calcSlotTotals = function(items) {
    var cal = 0, pro = 0, fat = 0, carbs = 0;
    items.forEach(function(item) {
      var f = App.getFoodById(item.foodId);
      if (f) {
        var mult;
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
  };

  App.calcDailyTotals = function(dateStr) {
    var nut = App.getNutrition(dateStr);
    var cal = 0, pro = 0, fat = 0, carbs = 0;
    nut.meals.forEach(function(meal) {
      var t = App.calcSlotTotals(meal.items);
      cal += t.calories; pro += t.protein; fat += t.fat; carbs += t.carbs;
    });
    return { calories: cal, protein: pro, fat: fat, carbs: carbs };
  };

  App.renderMealReminder = function() {
    var goals = App.loadGoals();
    if (!goals.calories) return '';
    var today = App.calcDailyTotals(App.todayStr());
    if (today.calories > 0) return '';
    var now = new Date();
    if (now.getHours() < 9) return '';
    var emoji = now.getHours() >= 14 ? '⚠️' : '🍽️';
    return '<div class="meal-reminder" style="margin:6px 0 10px;padding:8px 12px;background:#1a1814;border-radius:10px;border:1px solid #3a3020;display:flex;align-items:center;gap:8px;cursor:pointer;">' +
      '<span style="font-size:16px;">' + emoji + '</span>' +
      '<span style="font-size:11px;color:#ffb74d;flex:1;">No meals logged today — tap to track</span>' +
      '<span style="font-size:10px;color:#5a4a2a;">🍽️</span>' +
      '</div>';
  };

  // ==================== RECENT MEALS ====================

  App.trackRecentMeal = function(slot, items) {
    if (!items || items.length === 0) return;
    var ids = [];
    items.forEach(function(item) { ids.push(item.foodId); });
    ids.sort(function(a, b) { return a - b; });
    var fingerprint = ids.join(',');
    var today = App.todayStr();
    for (var i = 0; i < App.recentMeals.length; i++) {
      var rm = App.recentMeals[i];
      var rmIds = [];
      rm.items.forEach(function(item) { rmIds.push(item.foodId); });
      rmIds.sort(function(a, b) { return a - b; });
      if (rmIds.join(',') === fingerprint && rm.slot === slot) {
        rm.useCount = (rm.useCount || 0) + 1;
        rm.lastUsed = today;
        App.recentMeals.splice(i, 1);
        App.recentMeals.unshift(rm);
        App.saveRecentMeals();
        return;
      }
    }
    var names = [];
    items.forEach(function(item) {
      var f = App.getFoodById(item.foodId);
      if (f) names.push(f.name);
    });
    var displayName = names.slice(0, 3).join(' + ');
    if (names.length > 3) displayName += ' +' + (names.length - 3) + ' more';
    if (!displayName) displayName = 'Meal';
    App.recentMeals.unshift({
      id: Date.now(),
      name: displayName,
      slot: slot,
      items: items.map(function(item) {
        return {
          foodId: item.foodId,
          servings: item.servings || 1,
          amount: item.amount || null,
          unit: item.unit || null
        };
      }),
      lastUsed: today,
      useCount: 1
    });
    if (App.recentMeals.length > App.MAX_RECENT_MEALS) {
      App.recentMeals = App.recentMeals.slice(0, App.MAX_RECENT_MEALS);
    }
    App.saveRecentMeals();
  };

  App.getRecentMealsForSlot = function(slot, limit) {
    var result = [];
    for (var i = 0; i < App.recentMeals.length; i++) {
      if (App.recentMeals[i].slot === slot) {
        var valid = true;
        for (var j = 0; j < App.recentMeals[i].items.length; j++) {
          if (!App.getFoodById(App.recentMeals[i].items[j].foodId)) { valid = false; break; }
        }
        if (valid) result.push(App.recentMeals[i]);
      }
    }
    result.sort(function(a, b) {
      if (a.lastUsed > b.lastUsed) return -1;
      if (a.lastUsed < b.lastUsed) return 1;
      return (b.useCount || 0) - (a.useCount || 0);
    });
    return result.slice(0, limit || 3);
  };

  App.computeSuggestions = function(excludeDate) {
    var slots = ['breakfast', 'lunch', 'dinner', 'snacks'];
    var result = {};
    var freqMaps = {};
    slots.forEach(function(s) { freqMaps[s] = {}; });
    var dates = [];
    for (var d in App.state.appData.nutrition) {
      if (App.state.appData.nutrition.hasOwnProperty(d)) dates.push(d);
    }
    dates.sort().reverse();
    var cutoff = '';
    if (dates.length > 0) {
      var cutoffDate = new Date(App.todayStr() + 'T12:00:00');
      cutoffDate.setDate(cutoffDate.getDate() - 180);
      cutoff = cutoffDate.getFullYear() + '-' +
        ('0' + (cutoffDate.getMonth() + 1)).slice(-2) + '-' +
        ('0' + cutoffDate.getDate()).slice(-2);
    }
    for (var di = 0; di < dates.length; di++) {
      var dateStr = dates[di];
      if (dateStr < cutoff) break;
      if (dateStr === excludeDate) continue;
      var nut = App.state.appData.nutrition[dateStr];
      if (!nut || !nut.meals) continue;
      for (var mi = 0; mi < nut.meals.length; mi++) {
        var meal = nut.meals[mi];
        var slot = meal.slot;
        if (!freqMaps[slot]) continue;
        for (var ii = 0; ii < meal.items.length; ii++) {
          var foodId = meal.items[ii].foodId;
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
      var arr = [];
      for (var fid in freqMaps[slot]) {
        if (freqMaps[slot].hasOwnProperty(fid)) {
          var entry = freqMaps[slot][fid];
          var f = App.getFoodById(entry.foodId);
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
        recent: App.getRecentMealsForSlot(slot, 2)
      };
    });
    return result;
  };

  // ==================== EXPORT / IMPORT ====================

  App.exportData = function() {
    var json = JSON.stringify(App.state.appData, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'tall-tender-backup-' + App.todayStr() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    App.showToast('📥 Data exported!');
  };

  App.importData = function(jsonStr) {
    try {
      var imported = JSON.parse(jsonStr);
      if (!imported.workouts || !Array.isArray(imported.workouts)) {
        throw new Error('Invalid format');
      }
      App.showConfirm(
        '<h3>Import Data?</h3>' +
        '<p>Found <strong>' + imported.workouts.length + '</strong> workouts.</p>' +
        '<p style="color:#ffb74d;">⚠ This will replace all current data.</p>',
        [
          {
            label: 'Cancel',
            cls: 'btn-cancel',
            callback: function() {}
          },
          {
            label: 'Replace',
            cls: 'btn-danger',
            callback: function() {
              App.state.appData = imported;
              if (!App.state.appData.currentWorkout) App.state.appData.currentWorkout = null;
              App.saveData();
              App.renderWorkoutView();
              App.renderArchiveView();
              App.renderStatsView();
              App.showToast('📤 ' + imported.workouts.length + ' workouts imported!');
            }
          }
        ]
      );
    } catch (e) {
      App.showToast('❌ Invalid file format');
    }
  };

  // ==================== EVENT INIT ====================

  App.initImportEvents = function() {
    App.dom.importInput.addEventListener('change', function() {
      var file = this.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function(e) {
        App.importData(e.target.result);
      };
      reader.readAsText(file);
      App.dom.importInput.value = '';
    });
  };

})();
