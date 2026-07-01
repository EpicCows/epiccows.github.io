window.App = window.App || {};

(function() {
  'use strict';

  var App = window.App;
  var s = App.state;
  var dom = App.dom;

  function renderNutritionView() {
    var nut = App.getNutrition(s.nutritionDate);
    var totals = App.calcDailyTotals(s.nutritionDate);
    var suggestions = App.computeSuggestions(s.nutritionDate);

    var html = '';
    // ---- Sticky header: date + macros ----
    html += '<div class="sticky-bar">';
    // Date selector
    html += '<div class="nutrition-date">';
    html += '<button class="date-arrow" id="nutPrevDay">◀</button>';
    html += '<span id="nutDateLabel">' + (s.nutritionDate === App.todayStr() ? 'Today' : App.formatDate(s.nutritionDate)) + '</span>';
    html += '<button class="date-arrow" id="nutNextDay"' + (s.nutritionDate >= App.todayStr() ? ' disabled style="opacity:0.3"' : '') + '>▶</button>';
    // Bodyweight log inline
    var bwData = s.appData.bodyweight || {};
    var todayBw = bwData[App.todayStr()] || '';
    var bwHistory = Object.keys(bwData).sort().slice(-14).map(function(k) { return bwData[k]; });
    if (bwHistory.length > 1) {
      html += '<span style="font-size:10px;color:#5a7a6a;margin-left:auto;">' + bwHistory[0].toFixed(1) + ' → ' + bwHistory[bwHistory.length-1].toFixed(1) + ' kg</span>';
    }
    html += '<input type="number" id="bwInput" placeholder="BW kg" value="' + todayBw + '" step="0.1" min="30" max="300" style="width:60px;padding:6px 8px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:12px;text-align:center;margin-left:6px;">';
    html += '</div>';

    // ---- Streak + Weekly summary ----
    var goals = App.loadGoals();

    // Compute current streak (consecutive days under calorie goal)
    var streak = 0;
    var d = new Date(App.todayStr() + 'T12:00:00');
    for (var si = 0; si < 365; si++) {
      var dateStr = d.getFullYear() + '-' + ('0' + (d.getMonth()+1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      var dayTotals = App.calcDailyTotals(dateStr);
      if (dayTotals.calories > 0 && goals.calories > 0 && dayTotals.calories <= goals.calories) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else if (dayTotals.calories === 0 && dateStr === App.todayStr()) {
        // Today hasn't been logged yet — don't break streak, just don't count it
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }

    // Compute weekly totals (Mon-Sun containing s.nutritionDate)
    var refDate = new Date(s.nutritionDate + 'T12:00:00');
    var dayOfWeek = refDate.getDay(); // 0=Sun
    var mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    var weekMon = new Date(refDate);
    weekMon.setDate(refDate.getDate() + mondayOffset);
    var weekCal = 0, weekPro = 0, weekDays = 0;
    for (var wi = 0; wi < 7; wi++) {
      var wd = new Date(weekMon);
      wd.setDate(weekMon.getDate() + wi);
      var wds = wd.getFullYear() + '-' + ('0' + (wd.getMonth()+1)).slice(-2) + '-' + ('0' + wd.getDate()).slice(-2);
      var wt = App.calcDailyTotals(wds);
      if (wt.calories > 0) { weekCal += wt.calories; weekPro += wt.protein; weekDays++; }
    }
    var weekGoalCal = goals.calories * 7;
    var weekAvgCal = weekDays > 0 ? Math.round(weekCal / weekDays) : 0;

    // Render streak + week row
    html += '<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">';
    // Streak badge
    var streakColor = streak >= 7 ? '#4caf50' : (streak >= 3 ? '#ffb74d' : '#7e8d9e');
    var streakIcon = streak >= 7 ? '🔥' : (streak >= 3 ? '⚡' : '📅');
    html += '<div style="flex:1;min-width:100px;padding:8px 10px;background:#14191f;border-radius:10px;border:1px solid #2a333d;text-align:center;">';
    html += '<div style="font-size:20px;font-weight:700;color:' + streakColor + ';">' + streakIcon + ' ' + streak + '</div>';
    html += '<div style="font-size:9px;color:#7e8d9e;">day streak under ' + goals.calories + ' cal</div>';
    html += '</div>';
    // Weekly summary
    var weekSurplus = weekCal - weekGoalCal;
    var weekColor = weekSurplus <= 0 ? '#4caf50' : (weekSurplus <= 500 ? '#ffb74d' : '#ef5350');
    var weekLabel = weekSurplus <= 0 ? 'under' : 'over';
    html += '<div style="flex:2;min-width:140px;padding:8px 10px;background:#14191f;border-radius:10px;border:1px solid #2a333d;text-align:center;">';
    html += '<div style="display:flex;justify-content:center;align-items:baseline;gap:6px;">';
    html += '<span style="font-size:18px;font-weight:700;color:#e8edf2;">' + (weekCal / 1000).toFixed(1) + 'k</span>';
    html += '<span style="font-size:10px;color:#7e8d9e;">/ ' + (weekGoalCal / 1000).toFixed(1) + 'k</span>';
    html += '<span style="font-size:13px;font-weight:600;color:' + weekColor + ';">' + (weekSurplus <= 0 ? '' : '+') + Math.round(weekSurplus) + '</span>';
    html += '</div>';
    html += '<div style="font-size:9px;color:#7e8d9e;">week ' + weekLabel + ' · avg ' + weekAvgCal + ' cal/day</div>';
    html += '</div>';
    html += '</div>';

    // Summary with goals
    html += '<div class="nutrition-summary">';
    // Calories
    html += '<div class="macro-box">';
    html += '<div class="macro-val">' + totals.calories + '</div>';
    html += '<div class="macro-label">Calories';
    if (goals.calories > 0) {
      var calPct = Math.min(100, Math.round((totals.calories / goals.calories) * 100));
      var calRemaining = goals.calories - totals.calories;
      var calClass = calPct >= 100 ? 'over' : (calPct >= 85 ? 'close' : 'under');
      html += ' <span class="macro-remaining ' + calClass + '">(' + (calRemaining > 0 ? calRemaining + ' left' : '0 left') + ')</span>';
      html += '<div class="progress-bar-wrap"><div class="progress-bar-fill ' + calClass + '" style="width:' + calPct + '%"></div></div>';
    }
    html += '</div></div>';
    // Protein
    html += '<div class="macro-box">';
    html += '<div class="macro-val">' + totals.protein + 'g</div>';
    html += '<div class="macro-label">Protein';
    if (goals.protein > 0) {
      var proPct = Math.min(100, Math.round((totals.protein / goals.protein) * 100));
      var proRemaining = goals.protein - totals.protein;
      var proClass = proPct >= 100 ? 'over' : (proPct >= 85 ? 'close' : 'under');
      html += ' <span class="macro-remaining ' + proClass + '">(' + (proRemaining > 0 ? proRemaining + 'g left' : '0g left') + ')</span>';
      html += '<div class="progress-bar-wrap"><div class="progress-bar-fill ' + proClass + '" style="width:' + proPct + '%"></div></div>';
    }
    html += '</div></div>';
    // Macro breakdown
    var totalMacroGrams = totals.protein + totals.fat + totals.carbs;
    if (totalMacroGrams > 0) {
      html += '<div style="margin:6px 0 12px;">';
      html += '<div style="display:flex;gap:6px;font-size:10px;color:#7e8d9e;margin-bottom:4px;">';
      html += '<span>Protein ' + totals.protein + 'g</span>';
      html += '<span>Fat ' + totals.fat + 'g</span>';
      html += '<span>Carbs ' + totals.carbs + 'g</span>';
      html += '</div>';
      html += '<div style="height:6px;border-radius:3px;overflow:hidden;display:flex;gap:2px;">';
      var pPct = (totals.protein / totalMacroGrams * 100).toFixed(0);
      var fPct = (totals.fat / totalMacroGrams * 100).toFixed(0);
      var cPct = (totals.carbs / totalMacroGrams * 100).toFixed(0);
      html += '<div style="width:' + pPct + '%;height:100%;background:#4caf50;border-radius:3px;" title="Protein"></div>';
      html += '<div style="width:' + fPct + '%;height:100%;background:#ffb74d;border-radius:3px;" title="Fat"></div>';
      html += '<div style="width:' + cPct + '%;height:100%;background:#64b5f6;border-radius:3px;" title="Carbs"></div>';
      html += '</div></div>';
    }
    // Meal plan daily totals: split logged food vs plan notes
    var loggedCal = 0, loggedPro = 0, loggedFat = 0, loggedCarbs = 0;
    var planCal = 0, planPro = 0, planFat = 0, planCarbs = 0;
    ['breakfast','lunch','dinner','snacks'].forEach(function(s) {
      var m = null;
      for (var i = 0; i < nut.meals.length; i++) { if (nut.meals[i].slot === s) { m = nut.meals[i]; break; } }
      if (m && m.items && m.items.length > 0) {
        var st = App.calcSlotTotals(m.items);
        loggedCal += st.calories; loggedPro += st.protein; loggedFat += st.fat; loggedCarbs += st.carbs;
      }
      if (m && m.planNotes) {
        m.planNotes.forEach(function(n) {
          if (n.cal) { planCal += n.cal; planPro += (n.pro || 0); planFat += (n.fat || 0); planCarbs += (n.carbs || 0); }
        });
      }
    });
    var combinedCal = loggedCal + planCal;
    var combinedPro = loggedPro + planPro;
    var combinedFat = loggedFat + planFat;
    var combinedCarbs = loggedCarbs + planCarbs;
    if (planCal > 0 || loggedCal > 0) {
      html += '<div style="margin:8px 0;padding:8px 12px;background:#0f151b;border-radius:10px;border:1px dashed #2a3a2a;display:flex;flex-wrap:wrap;gap:6px 12px;justify-content:center;font-size:11px;">';
      if (loggedCal > 0) {
        html += '<span style="color:#7e8d9e;">Logged: <strong style="color:#b0c0d0;">' + loggedCal + ' cal</strong> P' + loggedPro + 'g</span>';
        if (planCal > 0) html += '<span style="color:#3a4a3a;">+</span>';
      }
      if (planCal > 0) {
        html += '<span style="color:#5a7a6a;">Plan: <strong style="color:#a0c0a0;">' + planCal + ' cal</strong> P' + planPro + ' F' + planFat + ' C' + planCarbs + '</span>';
      }
      if (goals.calories > 0 && (loggedCal > 0 || planCal > 0)) {
        var combinedRemaining = goals.calories - combinedCal;
        var combinedClass = combinedRemaining >= 0 ? '#5a8a5a' : '#8a5a5a';
        html += '<span style="color:' + combinedClass + ';">→ ' + combinedCal + '/' + goals.calories + ' cal' + (combinedRemaining >= 0 ? ' (' + combinedRemaining + ' left)' : ' (' + Math.abs(combinedRemaining) + ' over)') + '</span>';
      }
      if (goals.protein > 0 && combinedPro > 0) {
        var proShort = goals.protein - combinedPro;
        var proShortClass = proShort <= 0 ? '#5a8a5a' : (proShort <= 20 ? '#ffb74d' : '#8a5a5a');
        html += '<span style="color:' + proShortClass + ';">P' + combinedPro + '/' + goals.protein + 'g' + (proShort > 0 ? ' (-' + proShort + 'g)' : ' ✓') + '</span>';
      }
      html += '</div>';
    }
    html += '</div>';

    html += '</div>'; // close sticky-bar
    // Quick actions
    html += '<div class="quick-actions">';
    html += '<button class="qa-btn" id="btnUseTemplate">Use Recipe</button>';
    html += '<button class="qa-btn" id="btnLogManual">Log Manually</button>';
    html += '<button class="qa-btn" id="btnMealPlan" style="background:#1e2a1e;border-color:#2d5a2d;color:#4caf50;">🧠 Generate Meal Plan</button>';
    html += '</div>';

    // Recipe chips (quick access)
    if (App.mealTemplates.length > 0) {
      html += '<div class="template-chips-row" id="templateChipsRow">';
      html += '<span class="sug-label" style="line-height:22px;">Recipes:</span>';
      for (var ti = 0; ti < App.mealTemplates.length; ti++) {
        var tpl = App.mealTemplates[ti];
        // Calculate recipe macro totals
        var tCal = 0, tPro = 0;
        tpl.items.forEach(function(ti) {
          var tf = App.getFoodById(ti.foodId);
          if (tf) {
            var m = 1;
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

    // Meal slots — each has an inline AI input
    var slots = ['breakfast', 'lunch', 'dinner', 'snacks'];
    var slotIcons = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snacks: '🍿' };
    slots.forEach(function(slot) {
      var meal = null;
      for (var i = 0; i < nut.meals.length; i++) {
        if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; }
      }
      var slotTotals = App.calcSlotTotals(meal ? meal.items : []);
      var hasFood = meal && meal.items.length > 0;
      html += '<div class="meal-slot' + (hasFood ? ' has-food' : '') + '" data-slot="' + slot + '">';
      html += '<div class="slot-header">';
      html += '<span class="slot-name">' + slotIcons[slot] + ' ' + slot.charAt(0).toUpperCase() + slot.slice(1) + '</span>';
      html += '<span class="slot-totals">' + (hasFood ? slotTotals.calories + ' cal | ' + slotTotals.protein + 'g protein' : 'Empty') + '</span>';
      html += '</div>';
      if (hasFood) {
        html += '<div class="slot-items">';
        meal.items.forEach(function(item, idx) {
          var f = App.getFoodById(item.foodId);
          var name = f ? f.name : 'Unknown';
          html += '<span class="food-chip" data-slot="' + slot + '" data-idx="' + idx + '">';
          var label = name;
          if (item.amount && item.unit) {
            label = item.amount + item.unit + ' ' + name;
          } else if (item.servings && item.servings !== 1) {
            label = name + ' x' + item.servings;
          }
          html += label;
          html += '<span class="chip-del" data-slot="' + slot + '" data-idx="' + idx + '">×</span>';
          html += '</span>';
        });
        html += '</div>';
      }
      // Meal plan chips with macros
      if (meal && meal.planNotes && meal.planNotes.length) {
        html += '<div class="plan-chips-row">';
        meal.planNotes.forEach(function(note) {
          var desc = typeof note === 'string' ? note : note.desc;
          var macroSuffix = '';
          if (typeof note === 'object' && note.cal) {
            var verified = note._source === 'usda' || note._source === 'fatsecret';
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
      // Add food button
      html += '<button class="btn-add-food" data-slot="' + slot + '" style="width:100%;padding:6px;background:none;border:1px dashed #2a333d;border-radius:8px;color:#5a6a6a;font-size:11px;cursor:pointer;margin-top:4px;">+ Add food</button>';
      // Save as Recipe + Clear (only when has food)
      if (hasFood) {
        html += '<div style="display:flex;gap:4px;margin-top:2px;">';
        html += '<button class="btn-save-tpl" data-save-slot="' + slot + '" style="flex:1;font-size:10px;padding:4px;">💾 Save</button>';
        html += '<button class="btn-clear-slot" data-slot="' + slot + '" style="font-size:10px;padding:4px 8px;background:none;border:1px solid #3a2a2a;border-radius:6px;color:#7a5a5a;cursor:pointer;">Clear</button>';
        html += '</div>';
      }
      html += '</div>';
    });

    // Food library (collapsible) — same as before
    html += '<div style="margin-top:20px;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;" id="toggleFoodLib">';
    html += '<span style="font-size:14px;font-weight:600;">Food Library</span><span id="foodLibArrow">▼</span>';
    html += '</div>';
    html += '<div id="foodLibContent" style="display:none;margin-top:8px;">';
    if (App.foods.length === 0) {
      html += '<div class="no-foods">No foods yet. Log meals with AI and they\'ll appear here.</div>';
    } else {
      html += '<input type="text" id="foodLibSearch" placeholder="Filter..." style="width:100%;padding:10px;border-radius:10px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:13px;outline:none;margin-bottom:8px;">';
      App.foods.forEach(function(f) {
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

    // Meal templates — same as before
    html += '<div style="margin-top:16px;margin-bottom:8px;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;" id="toggleTemplates">';
    html += '<span style="font-size:14px;font-weight:600;">Meal Templates</span><span id="templatesArrow">▼</span>';
    html += '</div>';
    html += '<div id="templatesContent" style="display:none;margin-top:8px;">';
    if (App.mealTemplates.length === 0) {
      html += '<div class="no-foods">No templates. Save a meal as a template first.</div>';
    } else {
      App.mealTemplates.forEach(function(tpl) {
        var itemNames = tpl.items.map(function(item) {
          var f = App.getFoodById(item.foodId);
          return f ? f.name : '?';
        }).join(', ');
        html += '<div class="template-card" data-tpl-id="' + tpl.id + '">';
        html += '<div class="tpl-name">' + tpl.name + '</div>';
        html += '<div class="tpl-items">' + itemNames + '</div>';
        html += '</div>';
      });
    }
    html += '</div></div>';

    // FatSecret credit
    html += '<div style="text-align:center;padding:16px 0 8px;font-size:9px;color:#3a4a3a;">Powered by <span style="color:#5a7a5a;">FatSecret</span> API</div>';

    dom.nutritionContent.innerHTML = html;

    // --- Event handlers ---

    // Suggestion chip — frequent food
    // Add food button per slot
    dom.nutritionContent.querySelectorAll('.btn-add-food').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        s.pendingFoodSlot = this.dataset.slot;
        App.openFoodPicker();
      });
    });
    // Clear slot button
    dom.nutritionContent.querySelectorAll('.btn-clear-slot').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var slot = this.dataset.slot;
        var nut = App.getNutrition(s.nutritionDate);
        var meal = null;
        for (var i = 0; i < nut.meals.length; i++) { if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; } }
        if (meal) { meal.items = []; meal.planNotes = null; meal.notes = ''; App.saveData(); App.renderNutritionView(); }
      });
    });
    // Save recipe button
    dom.nutritionContent.querySelectorAll('.btn-save-tpl').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        App.saveMealAsTemplate(this.dataset.saveSlot);
      });
    });

    // Template chips in quick-actions row
    dom.nutritionContent.querySelectorAll('.template-chip[data-tpl-id]').forEach(function(chip) {
      chip.addEventListener('click', function(e) {
        e.stopPropagation();
        var tplId = parseInt(this.dataset.tplId);
        var tpl = null;
        for (var i = 0; i < App.mealTemplates.length; i++) {
          if (App.mealTemplates[i].id === tplId) { tpl = App.mealTemplates[i]; break; }
        }
        if (!tpl) return;
        App.pickSlotThen(function(slot) {
          var nut = App.getNutrition(s.nutritionDate);
          var meal = null;
          for (var j = 0; j < nut.meals.length; j++) {
            if (nut.meals[j].slot === slot) { meal = nut.meals[j]; break; }
          }
          if (!meal) return;
          tpl.items.forEach(function(item) {
            var entry = { foodId: item.foodId };
            if (item.amount != null && item.unit) {
              entry.amount = item.amount;
              entry.unit = item.unit;
            } else {
              entry.servings = item.servings || 1;
            }
            meal.items.push(entry);
          });
          App.saveData();
          App.trackRecentMeal(slot, meal.items);
          App.renderNutritionView();
          App.showToast('Template applied to ' + slot);
        });
      });
    });

    // Date navigation (same)
    var prevBtn = document.getElementById('nutPrevDay');
    var nextBtn = document.getElementById('nutNextDay');
    if (prevBtn) prevBtn.addEventListener('click', function() {
      var d = new Date(s.nutritionDate + 'T12:00:00');
      d.setDate(d.getDate() - 1);
      s.nutritionDate = d.getFullYear() + '-' + ('0' + (d.getMonth()+1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      App.renderNutritionView();
    });
    if (nextBtn) nextBtn.addEventListener('click', function() {
      if (s.nutritionDate >= App.todayStr()) return;
      var d = new Date(s.nutritionDate + 'T12:00:00');
      d.setDate(d.getDate() + 1);
      s.nutritionDate = d.getFullYear() + '-' + ('0' + (d.getMonth()+1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      App.renderNutritionView();
    });

    // Bodyweight log
    var bwInput = document.getElementById('bwInput');
    if (bwInput) {
      bwInput.addEventListener('change', function() {
        var val = parseFloat(this.value);
        if (!s.appData.bodyweight) s.appData.bodyweight = {};
        if (val > 0) {
          s.appData.bodyweight[App.todayStr()] = val;
        } else {
          delete s.appData.bodyweight[App.todayStr()];
        }
        App.saveData();
        App.showToast('Weight logged: ' + val + 'kg');
      });
    }

    // Food chip — delete
    dom.nutritionContent.querySelectorAll('.chip-del').forEach(function(chip) {
      chip.addEventListener('click', function(e) {
        e.stopPropagation();
        var slot = this.dataset.slot;
        var idx = parseInt(this.dataset.idx);
        var nut = App.getNutrition(s.nutritionDate);
        var meal = null;
        for (var i = 0; i < nut.meals.length; i++) {
          if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; }
        }
        if (meal) { meal.items.splice(idx, 1); App.saveData(); App.trackRecentMeal(slot, meal.items); App.renderNutritionView(); }
      });
    });

    // Food chip — tap to edit servings (same)
    dom.nutritionContent.querySelectorAll('.food-chip').forEach(function(chip) {
      chip.addEventListener('click', function(e) {
        if (e.target.closest('.chip-del')) return;
        e.stopPropagation();
        var slot = this.dataset.slot;
        var idx = parseInt(this.dataset.idx);
        var nut = App.getNutrition(s.nutritionDate);
        var meal = null;
        for (var i = 0; i < nut.meals.length; i++) {
          if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; }
        }
        if (!meal) return;
        var item = meal.items[idx];
        var f = App.getFoodById(item.foodId);
        if (item.amount && item.unit) {
          // New format: show amount picker
          App.showAmountUnitPicker(f ? f.name : 'Food', item.amount, item.unit, function(newAmount, newUnit) {
            if (newAmount <= 0) {
              meal.items.splice(idx, 1);
            } else {
              item.amount = newAmount;
              item.unit = newUnit;
            }
            App.saveData();
            App.trackRecentMeal(slot, meal.items);
            App.renderNutritionView();
          }, item.foodId);
        } else {
          // Old format: servings picker
          App.showServingsPicker(f ? f.name : 'Food', item.servings || 1, function(newServings) {
            if (newServings <= 0) {
              meal.items.splice(idx, 1);
            } else {
              item.servings = newServings;
            }
            App.saveData();
            App.trackRecentMeal(slot, meal.items);
            App.renderNutritionView();
          });
        }
      });
    });

    // Meal plan chips — tap to search food picker
    dom.nutritionContent.querySelectorAll('.plan-chip').forEach(function(chip) {
      chip.addEventListener('click', function(e) {
        e.stopPropagation();
        var slot = this.dataset.slot;
        var search = this.dataset.search || '';
        s.pendingFoodSlot = slot;
        App.openFoodPicker();
        setTimeout(function() {
          dom.foodSearchInput.value = search;
          App.renderFoodPickerList(search);
          dom.foodSearchInput.focus();
        }, 250);
      });
    });

    // Quick action: Use Template (same)
    var btnTpl = document.getElementById('btnUseTemplate');
    if (btnTpl) btnTpl.addEventListener('click', function() {
      if (App.mealTemplates.length === 0) { App.showToast('No templates saved yet'); return; }
      App.pickSlotThen(function(slot) {
        App.showTemplatePicker(function(tplId) {
          var tpl = null;
          for (var i = 0; i < App.mealTemplates.length; i++) {
            if (App.mealTemplates[i].id === tplId) { tpl = App.mealTemplates[i]; break; }
          }
          if (!tpl) return;
          var nut = App.getNutrition(s.nutritionDate);
          var meal = null;
          for (var j = 0; j < nut.meals.length; j++) {
            if (nut.meals[j].slot === slot) { meal = nut.meals[j]; break; }
          }
          if (!meal) return;
          tpl.items.forEach(function(item) {
            var entry = { foodId: item.foodId };
            if (item.amount != null && item.unit) {
              entry.amount = item.amount;
              entry.unit = item.unit;
            } else {
              entry.servings = item.servings || 1;
            }
            meal.items.push(entry);
          });
          App.saveData();
          App.trackRecentMeal(slot, meal.items);
          App.renderNutritionView();
          App.showToast('Template applied to ' + slot);
        });
      });
    });

    // Quick action: Log Manually
    var btnManual = document.getElementById('btnLogManual');
    if (btnManual) btnManual.addEventListener('click', function() {
      App.pickSlotThen(function(slot) { s.pendingFoodSlot = slot; App.openFoodPicker(); });
    });

    // Generate meal plan
    var btnMealPlan = document.getElementById('btnMealPlan');
    if (btnMealPlan) btnMealPlan.addEventListener('click', function() {
      App.haptic();
      App.generateMealPlan();
    });

    // Template cards (same)
    dom.nutritionContent.querySelectorAll('.template-card').forEach(function(card) {
      card.addEventListener('click', function() {
        var tplId = parseInt(this.dataset.tplId);
        var tpl = null;
        for (var i = 0; i < App.mealTemplates.length; i++) {
          if (App.mealTemplates[i].id === tplId) { tpl = App.mealTemplates[i]; break; }
        }
        if (!tpl) return;
        App.pickSlotThen(function(slot) {
          var nut = App.getNutrition(s.nutritionDate);
          var meal = null;
          for (var j = 0; j < nut.meals.length; j++) {
            if (nut.meals[j].slot === slot) { meal = nut.meals[j]; break; }
          }
          if (!meal) return;
          tpl.items.forEach(function(item) {
            var entry = { foodId: item.foodId };
            if (item.amount != null && item.unit) {
              entry.amount = item.amount;
              entry.unit = item.unit;
            } else {
              entry.servings = item.servings || 1;
            }
            meal.items.push(entry);
          });
          App.saveData();
          App.trackRecentMeal(slot, meal.items);
          App.renderNutritionView();
          App.showToast('Template applied to ' + slot);
        });
      });
    });

    // Food library toggle/search/delete — same
    var togLib = document.getElementById('toggleFoodLib');
    if (togLib) togLib.addEventListener('click', function() {
      var c = document.getElementById('foodLibContent');
      var a = document.getElementById('foodLibArrow');
      if (c.style.display === 'none') { c.style.display = 'block'; a.textContent = '▲'; }
      else { c.style.display = 'none'; a.textContent = '▼'; }
    });
    var libSearch = document.getElementById('foodLibSearch');
    if (libSearch) libSearch.addEventListener('input', function() {
      var q = this.value.toLowerCase();
      document.querySelectorAll('.food-lib-item').forEach(function(el) {
        el.style.display = el.textContent.toLowerCase().indexOf(q) >= 0 ? '' : 'none';
      });
    });
    // Quick-add from food library
    dom.nutritionContent.querySelectorAll('.lib-quick-add').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var foodId = parseInt(this.dataset.foodId);
        var f = App.getFoodById(foodId);
        if (!f) return;
        App.pickSlotThen(function(slot) {
          var defAmt = f.per100g ? 100 : 1;
          App.showAmountUnitPicker(f.name, defAmt, 'g', function(amount, unit) {
            if (amount <= 0) return;
            var nut = App.getNutrition(s.nutritionDate);
            var meal = null;
            for (var i = 0; i < nut.meals.length; i++) {
              if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; }
            }
            if (!meal) return;
            meal.items.push({ foodId: foodId, amount: amount, unit: unit });
            App.saveData();
            App.trackRecentMeal(slot, meal.items);
            App.renderNutritionView();
            App.showToast('Added ' + f.name + ' to ' + slot);
          }, foodId);
        });
      });
    });

    dom.nutritionContent.querySelectorAll('[data-del-food]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = parseInt(this.dataset.delFood);
        var f = App.getFoodById(id);
        App.showConfirm('<h3>Delete Food?</h3><p>Remove "' + (f ? f.name : '?') + '" from your library?</p>', [
          { label: 'Cancel', cls: 'btn-cancel', callback: function() {} },
          { label: 'Delete', cls: 'btn-danger', callback: function() {
            App.foods = App.foods.filter(function(x) { return x.id !== id; });
            // Clean up recent meals referencing deleted food
            App.recentMeals = App.recentMeals.filter(function(rm) {
              for (var ri = 0; ri < rm.items.length; ri++) {
                if (rm.items[ri].foodId === id) return false;
              }
              return true;
            });
            App.saveFoods();
            App.saveRecentMeals();
            App.renderNutritionView();
            App.showToast('Food deleted');
          }}
        ]);
      });
    });
    var btnAddLib = document.getElementById('btnAddFoodToLib');
    if (btnAddLib) btnAddLib.addEventListener('click', function() {
      App.showAddFoodModal('', function(name, cal, pro) {
        if (!name) return;
        App.foods.push({ id: Date.now(), name: name, calories: cal, protein: pro });
        App.saveFoods();
        App.renderNutritionView();
        App.showToast('Added "' + name + '" to library');
      });
    });
    var togTpl = document.getElementById('toggleTemplates');
    if (togTpl) togTpl.addEventListener('click', function() {
      var c = document.getElementById('templatesContent');
      var a = document.getElementById('templatesArrow');
      if (c.style.display === 'none') { c.style.display = 'block'; a.textContent = '▲'; }
      else { c.style.display = 'none'; a.textContent = '▼'; }
    });
  }

  // ==================== INLINE AI ESTIMATE ====================

  function callInlineAiEstimate(slot, mealText, inputEl) {
    var workerUrl = App.FATSECRET_WORKER;

    // Show loading state
    inputEl.disabled = true;
    inputEl.placeholder = 'Estimating...';
    var btn = dom.nutritionContent.querySelector('.ai-inline-btn[data-slot="' + slot + '"]');
    if (btn) { btn.textContent = '...'; btn.disabled = true; }

    function restoreInput() {
      inputEl.disabled = false;
      inputEl.placeholder = 'Describe what you ate...';
      if (btn) { btn.textContent = 'AI Estimate'; btn.disabled = false; }
    }

    if (workerUrl) {
      // --- Worker-available: DeepSeek → FatSecret lookup, auto-import ---
      var prompt = 'Break this meal description into individual food search terms for a nutrition database lookup. Return ONLY a valid JSON array of strings. Be specific: include preparation method and key ingredients. Meal: ' + mealText;

      fetch(App.FATSECRET_WORKER + '/deepseek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'You are a meal parser. Return ONLY valid JSON arrays of strings, no markdown, no extra text. Each string is a food search term.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 300,
          temperature: 0.2
        })
      })
      .then(function(res) {
        if (!res.ok) throw new Error('API error: ' + res.status);
        return res.json();
      })
      .then(function(data) {
        var content = data.choices[0].message.content;
        content = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        var terms = JSON.parse(content);
        if (!Array.isArray(terms) || terms.length === 0) throw new Error('No foods identified');

        restoreInput();
        // Kick off parallel FatSecret lookups; show progress toast
        App.showToast('Looking up ' + terms.length + ' foods in FatSecret...');
        App.lookupAndImportBatch(terms, slot, workerUrl);
      })
      .catch(function(err) {
        restoreInput();
        App.showToast('Error: ' + err.message);
      });
    } else {
      // --- Fallback: DeepSeek estimates macros (no Worker configured) ---
      var prompt = 'Estimate macros for this meal. Return ONLY a valid JSON array of objects with keys: name (string), amount (number), unit (one of: g, oz, each, scoop, tbsp, tsp, cup, ml), calories (number, total for this amount), protein (number, grams total for this amount). Use natural units per food. Meal: ' + mealText;

      fetch(App.FATSECRET_WORKER + '/deepseek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: 'You are a nutrition estimator. Return ONLY valid JSON arrays, no markdown, no extra text. Each object must have: name, amount (number), unit (g/oz/each/scoop/tbsp/tsp/cup/ml), calories (total), protein (grams total). Use appropriate units per food.' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 500,
          temperature: 0.3
        })
      })
      .then(function(res) {
        if (!res.ok) throw new Error('API error: ' + res.status);
        return res.json();
      })
      .then(function(data) {
        var content = data.choices[0].message.content;
        content = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        var items = JSON.parse(content);
        if (!Array.isArray(items) || items.length === 0) throw new Error('No foods returned');
        restoreInput();
        App.showAiReviewPanel(slot, items);
      })
      .catch(function(err) {
        restoreInput();
        App.showToast('Error: ' + err.message);
      });
    }
  }

  /**
   * Batch FatSecret lookup: for each term, search FatSecret then auto-import
   * the top result. When all done, render the nutrition view.
   */
  function lookupAndImportBatch(terms, slot, workerUrl) {
    var pending = terms.length;
    var imported = 0;

    terms.forEach(function(term) {
      fetch(workerUrl + '/search?q=' + encodeURIComponent(term) + '&page=0')
      .then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function(data) {
        var foodsList = (data.foods && data.foods.food) ? data.foods.food : null;
        if (!foodsList) { pending--; checkDone(); return; }
        var fsFood = Array.isArray(foodsList) ? foodsList[0] : foodsList;
        var fsId = fsFood.food_id || '';
        var fsName = fsFood.food_name || term;
        var desc = fsFood.food_description || '';
        var macros = App.parseFsDescription(desc);

        // Get full details for accurate macros
        return fetch(workerUrl + '/food?id=' + encodeURIComponent(fsId))
        .then(function(res2) {
          if (!res2.ok) throw new Error('HTTP ' + res2.status);
          return res2.json();
        })
        .then(function(detailData) {
          var food = detailData.food;
          var cals = macros.calories || 0, protein = macros.protein || 0;
          var fat = macros.fat || 0, carbs = macros.carbs || 0;
          if (food && food.servings && food.servings.serving) {
            var servings = Array.isArray(food.servings.serving) ? food.servings.serving : [food.servings.serving];
            var s = servings[0];
            for (var i = 0; i < servings.length; i++) {
              if (servings[i].is_default === '1' || servings[i].serving_description === '100 g') {
                s = servings[i]; break;
              }
            }
            var sv = App.parseFsServing(s);
            if (sv.calories > 0) cals = sv.calories;
            if (sv.protein > 0) protein = sv.protein;
            if (sv.fat > 0) fat = sv.fat;
            if (sv.carbs > 0) carbs = sv.carbs;
          }

          // Create food and add to meal (macros per 100g)
          var newId = Date.now() + imported;
          App.foods.push({ id: newId, name: fsName, calories: cals, protein: protein, fat: fat, carbs: carbs, per100g: true });

          var nut = App.getNutrition(s.nutritionDate);
          var meal = null;
          for (var i = 0; i < nut.meals.length; i++) {
            if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; }
          }
          if (meal) meal.items.push({ foodId: newId, amount: 100, unit: 'g' });

          imported++;
          pending--;
          checkDone();
        });
      })
      .catch(function() {
        pending--;
        checkDone();
      });
    });

    function checkDone() {
      if (pending <= 0) {
        App.saveFoods();
        App.saveData();
        var nut = App.getNutrition(s.nutritionDate);
        var meal = null;
        for (var i = 0; i < nut.meals.length; i++) {
          if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; }
        }
        if (meal) App.trackRecentMeal(slot, meal.items);
        App.renderNutritionView();
        App.showToast('Imported ' + imported + ' foods with real nutrition data!');
      }
    }
  }


  function showAiReviewPanel(slot, items) {
    var existing = document.querySelector('.ai-review-panel[data-slot="' + slot + '"]');
    if (existing) existing.remove();

    var mealSlot = document.querySelector('.meal-slot[data-slot="' + slot + '"]');
    if (!mealSlot) return;

    var html = '<div class="ai-review-panel" data-slot="' + slot + '" style="margin-top:8px;padding:10px;background:#0f151b;border-radius:10px;border:1px solid #2d7a3a;">';
    html += '<div style="font-size:12px;font-weight:600;color:#4caf50;margin-bottom:8px;">Review (edit amounts/macros if off):</div>';

    items.forEach(function(item, idx) {
      var unit = item.unit || 'g';
      var amount = item.amount || 1;
      html += '<div class="ai-review-item" data-idx="' + idx + '" style="display:flex;gap:4px;align-items:center;margin-bottom:6px;flex-wrap:wrap;">';
      // Name
      html += '<input type="text" class="rv-name" value="' + (item.name || '').replace(/"/g, '&quot;') + '" style="flex:2;min-width:80px;padding:6px 8px;border-radius:6px;background:#1a222b;border:1px solid #2a333d;color:#e8edf2;font-size:12px;" placeholder="Food">';
      // Amount
      html += '<input type="number" class="rv-amount" value="' + amount + '" style="width:50px;padding:6px 4px;border-radius:6px;background:#1a222b;border:1px solid #2a333d;color:#e8edf2;font-size:12px;text-align:center;" step="0.5" min="0">';
      // Unit
      html += App.unitSelectHtml(unit);
      // Calories
      html += '<input type="number" class="rv-cal" value="' + (item.calories || 0) + '" style="width:52px;padding:6px 4px;border-radius:6px;background:#1a222b;border:1px solid #2a333d;color:#e8edf2;font-size:12px;text-align:center;" title="kcal">';
      html += '<span style="font-size:10px;color:#7e8d9e;">cal</span>';
      // Protein
      html += '<input type="number" class="rv-pro" value="' + (item.protein || 0) + '" style="width:42px;padding:6px 4px;border-radius:6px;background:#1a222b;border:1px solid #2a333d;color:#e8edf2;font-size:12px;text-align:center;" title="protein g">';
      html += '<span style="font-size:10px;color:#7e8d9e;">g pro</span>';
      // Remove
      html += '<button class="rv-remove" data-idx="' + idx + '" style="padding:4px 6px;background:none;border:none;color:#7a4a4a;font-size:16px;cursor:pointer;">×</button>';
      html += '</div>';
    });

    html += '<div style="display:flex;gap:6px;margin-top:8px;">';
    html += '<button class="rv-confirm" style="flex:1;padding:8px;background:#2d7a3a;border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Confirm All</button>';
    html += '<button class="rv-cancel" style="flex:1;padding:8px;background:#1e262e;border:1px solid #2a333d;border-radius:8px;color:#7a8a9a;font-size:13px;font-weight:600;cursor:pointer;">Cancel</button>';
    html += '</div>';
    html += '</div>';

    var inlineDiv = mealSlot.querySelector('.ai-inline');
    if (inlineDiv) {
      inlineDiv.insertAdjacentHTML('afterend', html);
    } else {
      mealSlot.insertAdjacentHTML('beforeend', html);
    }

    var panel = mealSlot.querySelector('.ai-review-panel[data-slot="' + slot + '"]');
    if (!panel) return;

    panel.querySelectorAll('.rv-remove').forEach(function(btn) {
      btn.addEventListener('click', function() {
        items[parseInt(this.dataset.idx)] = null;
        this.parentElement.style.display = 'none';
      });
    });

    panel.querySelector('.rv-cancel').addEventListener('click', function() { panel.remove(); });

    panel.querySelector('.rv-confirm').addEventListener('click', function() {
      var nut = App.getNutrition(s.nutritionDate);
      var meal = null;
      for (var i = 0; i < nut.meals.length; i++) {
        if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; }
      }
      if (!meal) return;

      var added = 0;
      panel.querySelectorAll('.ai-review-item').forEach(function(row) {
        var idx = parseInt(row.dataset.idx);
        var item = items[idx];
        if (!item) return;

        var name = (row.querySelector('.rv-name') || {}).value;
        if (!name || !name.trim()) return;
        name = name.trim();

        var amount = parseFloat((row.querySelector('.rv-amount') || {}).value) || 1;
        var unit = (row.querySelector('.rv-unit') || {}).value || 'g';
        var cal = parseInt((row.querySelector('.rv-cal') || {}).value) || 0;
        var pro = parseInt((row.querySelector('.rv-pro') || {}).value) || 0;

        var newId = Date.now() + idx + added;
        App.foods.push({ id: newId, name: name, calories: cal, protein: pro });
        meal.items.push({ foodId: newId, amount: amount, unit: unit });
        added++;
      });

      App.saveFoods();
      App.saveData();
      App.trackRecentMeal(slot, meal.items);
      panel.remove();
      App.renderNutritionView();
      App.showToast(added + ' foods added to ' + slot);
    });
  }

  // ==================== EXPORTS ====================
  App.callInlineAiEstimate = callInlineAiEstimate;
  App.lookupAndImportBatch = lookupAndImportBatch;
  App.renderNutritionView = renderNutritionView;
  App.showAiReviewPanel = showAiReviewPanel;

})();
