window.App = window.App || {};

(function() {
  'use strict';

  var App = window.App;
  var s = App.state;
  var dom = App.dom;
  var fsSearchTimer = null;

  // ==================== FOOD PICKER ====================

  App.openFoodPicker = function() {
    dom.foodPickerModal.classList.add('open');
    dom.foodSearchInput.value = '';
    App.renderFoodPickerList('');
    setTimeout(function() { dom.foodSearchInput.focus(); }, 200);
  };

  App.renderFoodPickerList = function(query) {
    var q = query.toLowerCase();
    var filtered = App.foods.filter(function(f) {
      return f.name.toLowerCase().indexOf(q) >= 0;
    });
    var html = '';

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

    var workerUrl = App.FATSECRET_WORKER;
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
        var foodId = parseInt(this.dataset.foodId);
        var f = App.getFoodById(foodId);
        if (!f) return;
        if (f.per100g) {
          var sv = App.smartServe(f.name);
          App.showAmountUnitPicker(f.name, sv.amount, sv.unit, function(amount, unit) {
            if (amount <= 0) return;
            var nut = App.getNutrition(s.nutritionDate);
            var meal = null;
            for (var i = 0; i < nut.meals.length; i++) {
              if (nut.meals[i].slot === s.pendingFoodSlot) { meal = nut.meals[i]; break; }
            }
            if (!meal) return;
            meal.items.push({ foodId: foodId, amount: amount, unit: unit });
            App.saveData();
            App.trackRecentMeal(s.pendingFoodSlot, meal.items);
            App.closeFoodPicker();
            App.renderNutritionView();
            App.showToast('Added ' + amount + unit + ' ' + f.name);
          }, foodId);
        } else {
          App.showServingsPicker(f.name, 1, function(servings) {
            if (servings <= 0) return;
            var nut = App.getNutrition(s.nutritionDate);
            var meal = null;
            for (var i = 0; i < nut.meals.length; i++) {
              if (nut.meals[i].slot === s.pendingFoodSlot) { meal = nut.meals[i]; break; }
            }
            if (!meal) return;
            meal.items.push({ foodId: foodId, servings: servings });
            App.saveData();
            App.trackRecentMeal(s.pendingFoodSlot, meal.items);
            App.closeFoodPicker();
            App.renderNutritionView();
            App.showToast('Added ' + f.name + (servings !== 1 ? ' x' + servings : ''));
          });
        }
      });
    });

    // Add new food button
    var addNew = document.getElementById('btnAddNewFood');
    if (addNew) addNew.addEventListener('click', function() {
      var name = query.trim();
      if (!name) return;
      App.showAddFoodModal(name, function(foodName, cal, pro) {
        if (!foodName) return;
        var newId = Date.now();
        App.foods.push({ id: newId, name: foodName, calories: cal, protein: pro });
        App.saveFoods();
        var nut = App.getNutrition(s.nutritionDate);
        var meal = null;
        for (var i = 0; i < nut.meals.length; i++) {
          if (nut.meals[i].slot === s.pendingFoodSlot) { meal = nut.meals[i]; break; }
        }
        if (meal) meal.items.push({ foodId: newId, servings: 1 });
        App.saveData();
        App.trackRecentMeal(s.pendingFoodSlot, meal.items);
        App.closeFoodPicker();
        App.renderNutritionView();
        App.showToast('Added "' + foodName + '"');
      });
    });

    // Fire FatSecret search (debounced 300ms)
    if (query.trim() && workerUrl) {
      clearTimeout(fsSearchTimer);
      fsSearchTimer = setTimeout(function() {
        App.searchFatSecret(query.trim(), workerUrl);
      }, 300);
    }
  };

  // ==================== FATSECRET HELPERS ====================

  App.parseFsDescription = function(desc) {
    if (!desc) return { calories: null, protein: null, fat: null, carbs: null };
    var calMatch = desc.match(/Calories:\s*([\d.]+)kcal/i);
    var proMatch = desc.match(/Protein:\s*([\d.]+)g/i);
    var fatMatch = desc.match(/Fat:\s*([\d.]+)g/i);
    var carbMatch = desc.match(/Carbs:\s*([\d.]+)g/i);
    return {
      calories: calMatch ? Math.round(parseFloat(calMatch[1])) : null,
      protein: proMatch ? Math.round(parseFloat(proMatch[1])) : null,
      fat: fatMatch ? Math.round(parseFloat(fatMatch[1])) : null,
      carbs: carbMatch ? Math.round(parseFloat(carbMatch[1])) : null
    };
  };

  App.parseFsServing = function(s) {
    var cal = parseFloat(s.calories) || 0;
    var pro = parseFloat(s.protein) || 0;
    var fat = parseFloat(s.fat) || 0;
    var carbs = parseFloat(s.carbohydrate) || 0;
    return { calories: Math.round(cal), protein: Math.round(pro), fat: Math.round(fat), carbs: Math.round(carbs) };
  };

  App.searchFatSecret = function(query, workerUrl) {
    var fsContainer = document.getElementById('fsResults');
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
      var fsContainer2 = document.getElementById('fsResults');
      if (!fsContainer2) return;

      var foodsList = (data.foods && data.foods.food) ? data.foods.food : null;
      if (!foodsList) {
        fsContainer2.innerHTML = '<div class="no-foods" style="padding:12px 0;">No FatSecret results for "' + query + '"</div>';
        return;
      }

      if (!Array.isArray(foodsList)) foodsList = [foodsList];

      var html = '';
      foodsList.forEach(function(fsFood) {
        var fsId = fsFood.food_id || '';
        var fsName = fsFood.food_name || 'Unknown';
        var desc = fsFood.food_description || '';
        var macros = App.parseFsDescription(desc);

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
        el.addEventListener('click', function() {
          App.importFatSecretFood(this.dataset.fsId, this.dataset.fsName, this, workerUrl);
        });
      });
    })
    .catch(function(err) {
      var fsContainer3 = document.getElementById('fsResults');
      if (!fsContainer3) return;
      fsContainer3.innerHTML = '<div class="fs-error">FatSecret search failed: ' + err.message + '</div>';
    });
  };

  App.importFatSecretFood = function(fsId, fsName, clickedEl, workerUrl) {
    clickedEl.classList.add('fs-importing');
    var addSpan = clickedEl.querySelector('.fp-add');
    if (addSpan) addSpan.textContent = '...';

    fetch(workerUrl + '/food?id=' + encodeURIComponent(fsId))
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      var food = data.food;
      if (!food) throw new Error('No food data returned');

      var cals = 0, protein = 0, fat = 0, carbs = 0;
      var servings = food.servings && food.servings.serving;
      if (servings) {
        var servingList = Array.isArray(servings) ? servings : [servings];
        var s = servingList[0];
        for (var i = 0; i < servingList.length; i++) {
          if (servingList[i].is_default === '1' || servingList[i].serving_description === '100 g') {
            s = servingList[i]; break;
          }
        }
        var macros = App.parseFsServing(s);
        cals = macros.calories;
        protein = macros.protein;
        fat = macros.fat;
        carbs = macros.carbs;
      }

      var newId = Date.now();
      var foodName = food.food_name || fsName;
      App.foods.push({ id: newId, name: foodName, calories: cals, protein: protein, fat: fat || 0, carbs: carbs || 0, per100g: true });
      App.saveFoods();

      var serve = App.smartServe(foodName);
      App.showAmountUnitPicker(foodName, serve.amount, serve.unit, function(amount, unit) {
        if (amount <= 0) {
          App.renderFoodPickerList(dom.foodSearchInput.value);
          return;
        }
        var nut = App.getNutrition(s.nutritionDate);
        var meal = null;
        for (var i = 0; i < nut.meals.length; i++) {
          if (nut.meals[i].slot === s.pendingFoodSlot) { meal = nut.meals[i]; break; }
        }
        if (meal) meal.items.push({ foodId: newId, amount: amount, unit: unit });
        App.saveData();
        App.trackRecentMeal(s.pendingFoodSlot, meal.items);
        App.closeFoodPicker();
        App.renderNutritionView();
        App.showToast('Added ' + amount + unit + ' ' + foodName);
      }, newId);
    })
    .catch(function(err) {
      clickedEl.classList.remove('fs-importing');
      if (addSpan) addSpan.textContent = 'import';
      App.showToast('Import failed: ' + err.message);
    });
  };

  App.smartServe = function(foodName) {
    var name = (foodName || '').toLowerCase();
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
  };

  App.closeFoodPicker = function() {
    clearTimeout(fsSearchTimer);
    dom.foodPickerModal.classList.remove('open');
  };

  // ==================== SERVINGS PICKER ====================

  App.COMMON_UNITS = [
    { value: 'g', label: 'g (grams)' },
    { value: 'ml', label: 'ml' },
    { value: 'oz', label: 'oz' },
    { value: 'each', label: 'each' },
    { value: 'cup', label: 'cup' },
    { value: 'tbsp', label: 'tbsp' },
    { value: 'tsp', label: 'tsp' },
    { value: 'scoop', label: 'scoop' }
  ];

  App.unitSelectHtml = function(selected) {
    var html = '<select id="amountUnitSelect" style="padding:8px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:14px;">';
    App.COMMON_UNITS.forEach(function(u) {
      html += '<option value="' + u.value + '"' + (u.value === selected ? ' selected' : '') + '>' + u.label + '</option>';
    });
    html += '</select>';
    return html;
  };

  App.showServingsPicker = function(foodName, current, callback) {
    var opts = [];
    for (var sv = 1; sv <= 6; sv++) {
      var label = sv === 1 ? foodName : foodName + ' x' + sv;
      opts.push({ label: label, callback: (function(s) { return function() { callback(s); }; })(sv) });
    }
    opts.push({ label: 'Remove', cls: 'btn-danger', callback: function() { callback(0); } });
    App.showConfirm('<h3>Servings</h3><p>' + foodName + '</p>', opts);
  };

  App.showAmountUnitPicker = function(foodName, amount, unit, callback, foodId) {
    var content = '<h3>' + foodName + '</h3>';
    content += '<div style="display:flex;gap:8px;align-items:center;margin-top:8px;">';
    content += '<input type="number" id="amountVal" value="' + amount + '" step="5" min="0" style="flex:1;padding:10px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:16px;">';
    content += App.unitSelectHtml(unit || 'g');
    content += '</div>';

    if (foodId) {
      content += '<div id="amountLivePreview" style="margin-top:8px;padding:8px;border-radius:8px;background:#0f151b;color:#7e8d9e;font-size:12px;text-align:center;"></div>';
    }

    var actions = [
      { label: 'Cancel', cls: 'btn-cancel', callback: function() { callback(-1); } },
      { label: 'Remove', cls: 'btn-danger', callback: function() { callback(0); } },
      { label: 'Add', cls: 'btn-save', callback: function() {
        var amt = parseFloat(document.getElementById('amountVal').value) || 0;
        var unt = document.getElementById('amountUnitSelect').value;
        callback(amt, unt);
      }}
    ];

    App.showConfirm(content, actions);

    // Live preview
    if (foodId) {
      var previewEl = document.getElementById('amountLivePreview');
      var updatePreview = function() {
        var amt = parseFloat(document.getElementById('amountVal').value) || 0;
        var unt = document.getElementById('amountUnitSelect').value;
        var f = App.getFoodById(foodId);
        if (!f || !f.per100g) { if (previewEl) previewEl.textContent = ''; return; }
        var mult = unt === 'g' || unt === 'ml' ? amt / 100 : amt;
        var cal = Math.round((f.calories || 0) * mult);
        var pro = Math.round((f.protein || 0) * mult);
        if (previewEl) previewEl.textContent = cal + ' cal · ' + pro + 'g protein' + (f.fat != null ? ' · ' + Math.round(f.fat * mult) + 'g fat' : '') + (f.carbs != null ? ' · ' + Math.round(f.carbs * mult) + 'g carbs' : '');
      };
      setTimeout(function() {
        var av = document.getElementById('amountVal');
        if (av) { av.addEventListener('input', updatePreview); updatePreview(); }
      }, 100);
    }
  };

  App.pickSlotThen = function(callback) {
    var slots = ['breakfast', 'lunch', 'dinner', 'snacks'];
    var slotIcons = { breakfast: '🌅', lunch: '☀️', dinner: '🌙', snacks: '🍿' };
    var content = '<h3>Pick Meal Slot</h3>';
    var actions = [];
    slots.forEach(function(slot) {
      actions.push({
        label: slotIcons[slot] + ' ' + slot.charAt(0).toUpperCase() + slot.slice(1),
        cls: 'btn-save',
        callback: function() { callback(slot); App.closeConfirm(); }
      });
    });
    actions.push({ label: 'Cancel', cls: 'btn-cancel', callback: function() {} });
    App.showConfirm(content, actions);
  };

  App.showTemplatePicker = function(callback) {
    if (App.mealTemplates.length === 0) {
      App.showToast('No templates saved yet');
      return;
    }
    var content = '<h3>Choose Recipe</h3>';
    var actions = App.mealTemplates.map(function(tpl) {
      var itemNames = tpl.items.map(function(item) {
        var f = App.getFoodById(item.foodId);
        return f ? f.name : '?';
      }).join(', ');
      return {
        label: tpl.name + ' (' + itemNames + ')',
        cls: 'btn-save',
        callback: function() { callback(tpl.id); App.closeConfirm(); }
      };
    });
    actions.push({ label: 'Cancel', cls: 'btn-cancel', callback: function() {} });
    App.showConfirm(content, actions);
  };

  App.saveMealAsTemplate = function(slot) {
    var nut = App.getNutrition(s.nutritionDate);
    var meal = null;
    for (var i = 0; i < nut.meals.length; i++) {
      if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; }
    }
    if (!meal || !meal.items.length) {
      App.showToast('No foods in this slot to save');
      return;
    }
    var names = meal.items.map(function(item) {
      var f = App.getFoodById(item.foodId);
      return f ? f.name : '?';
    });
    var defaultName = names.slice(0, 3).join(' + ');
    if (names.length > 3) defaultName += ' +more';

    App.showConfirm(
      '<h3>Save as Recipe?</h3>' +
      '<p>Name: <input type="text" id="tplNameInput" value="' + defaultName.replace(/"/g, '&quot;') + '" style="width:100%;padding:8px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:14px;"></p>',
      [
        { label: 'Cancel', cls: 'btn-cancel', callback: function() {} },
        { label: 'Save', cls: 'btn-save', callback: function() {
          var tplName = document.getElementById('tplNameInput').value.trim() || defaultName;
          App.mealTemplates.push({
            id: Date.now(),
            name: tplName,
            items: meal.items.map(function(item) {
              var copy = { foodId: item.foodId };
              if (item.amount != null && item.unit) {
                copy.amount = item.amount;
                copy.unit = item.unit;
              } else {
                copy.servings = item.servings || 1;
              }
              return copy;
            })
          });
          App.saveMealTemplates();
          App.renderNutritionView();
          App.showToast('Recipe "' + tplName + '" saved!');
        }}
      ]
    );
  };

  App.showAddFoodModal = function(prefillName, callback) {
    var content = '<h3>Add Food</h3>';
    content += '<input type="text" id="newFoodName" placeholder="Food name" value="' + (prefillName || '').replace(/"/g, '&quot;') + '" style="width:100%;padding:10px;margin-bottom:8px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:14px;outline:none;">';
    content += '<div style="display:flex;gap:8px;">';
    content += '<input type="number" id="newFoodCal" placeholder="Calories" step="1" min="0" style="flex:1;padding:10px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:14px;">';
    content += '<input type="number" id="newFoodPro" placeholder="Protein (g)" step="0.1" min="0" style="flex:1;padding:10px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:14px;">';
    content += '</div>';

    App.showConfirm(content, [
      { label: 'Cancel', cls: 'btn-cancel', callback: function() { callback(null); } },
      { label: 'Add', cls: 'btn-save', callback: function() {
        var name = document.getElementById('newFoodName').value.trim();
        var cal = parseInt(document.getElementById('newFoodCal').value) || 0;
        var pro = parseFloat(document.getElementById('newFoodPro').value) || 0;
        callback(name, cal, pro);
      }}
    ]);
  };

  // ==================== EVENT INIT ====================

  App.initFoodPickerEvents = function() {
    // Food picker modal overlay
    dom.foodPickerModal.addEventListener('click', function(e) {
      if (e.target === dom.foodPickerModal) App.closeFoodPicker();
    });
    document.getElementById('foodPickerCancel').addEventListener('click', App.closeFoodPicker);

    // Food search input
    dom.foodSearchInput.addEventListener('input', function() {
      App.renderFoodPickerList(this.value);
    });
    dom.foodSearchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        var q = this.value.trim();
        if (q) {
          App.showAddFoodModal(q, function(name, cal, pro) {
            if (!name) return;
            var newId = Date.now();
            App.foods.push({ id: newId, name: name, calories: cal, protein: pro });
            App.saveFoods();
            var nut = App.getNutrition(s.nutritionDate);
            var meal = null;
            for (var i = 0; i < nut.meals.length; i++) {
              if (nut.meals[i].slot === s.pendingFoodSlot) { meal = nut.meals[i]; break; }
            }
            if (meal) meal.items.push({ foodId: newId, servings: 1 });
            App.saveData();
            App.trackRecentMeal(s.pendingFoodSlot, meal.items);
            App.closeFoodPicker();
            App.renderNutritionView();
            App.showToast('Added "' + name + '"');
          });
        }
      }
    });
  };

})();
