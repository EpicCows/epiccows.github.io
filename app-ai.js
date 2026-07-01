window.App = window.App || {};

(function() {
  'use strict';

  var App = window.App;
  var s = App.state;
  var dom = App.dom;

  function openAiEstimate() {
    dom.aiEstimateModal.classList.add('open');
    dom.aiMealInput.value = '';
    dom.aiResult.innerHTML = '';
    setTimeout(function() { dom.aiMealInput.focus(); }, 200);
  }

  function closeAiEstimate() {
    dom.aiEstimateModal.classList.remove('open');
  }

  function callAiEstimate() {

    var mealText = dom.aiMealInput.value.trim();
    if (!mealText) { App.showToast('Describe your meal first'); return; }

    var workerUrl = App.FATSECRET_WORKER;

    App.callAiEstimateWithFatSecret(mealText, workerUrl);
  }

  /**
   * New flow: DeepSeek breaks the meal into search terms, then each term
   * is looked up via the FatSecret Worker for real nutrition data.
   */
  function callAiEstimateWithFatSecret(mealText, workerUrl) {
    dom.aiResult.innerHTML = '<div style="text-align:center;padding:20px;color:#7e8d9e;">Breaking down your meal...</div>';

    var prompt = 'Break this meal description into individual food search terms for a nutrition database lookup. Return ONLY a valid JSON array of strings (search terms). Be specific: include preparation method and key ingredients. Examples:\n' +
      '"bowl of oatmeal with banana and honey" → ["oatmeal", "banana", "honey"]\n' +
      '"grilled chicken breast with steamed broccoli and brown rice" → ["grilled chicken breast", "steamed broccoli", "brown rice"]\n' +
      '"turkey sandwich with lettuce tomato and mayo on whole wheat" → ["turkey sandwich", "whole wheat bread", "lettuce", "tomato", "mayonnaise"]\n' +
      'Now process this meal: ' + mealText;

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
      if (!Array.isArray(terms) || terms.length === 0) throw new Error('No App.foods identified');

      // Show searching state
      var html = '<div style="font-size:14px;font-weight:600;margin-bottom:8px;">Looking up in FatSecret...</div>';
      terms.forEach(function(term, idx) {
        html += '<div class="food-picker-item" id="fsItem' + idx + '" style="opacity:0.6;">';
        html += '<div><div class="fp-name">' + term + '</div><div class="fp-macros" id="fsMacros' + idx + '">Searching...</div></div>';
        html += '<span class="fp-add" style="font-size:13px;color:#7e8d9e;">...</span>';
        html += '</div>';
      });
      html += '<div style="margin-top:10px;"><button class="btn-save" id="btnConfirmAllFs" style="width:100%;display:none;">Confirm All &amp; Add to ' + s.pendingFoodSlot + '</button></div>';
      dom.aiResult.innerHTML = html;

      // Store terms
      dom.aiResult._fsItems = [];  // populated as lookups complete
      dom.aiResult._fsPending = terms.length;

      // Look up each term
      terms.forEach(function(term, idx) {
        App.lookupFatSecretForAi(term, idx, workerUrl);
      });
    })
    .catch(function(err) {
      dom.aiResult.innerHTML = '<div style="color:#c96a6a;text-align:center;padding:10px;">Error: ' + err.message + '</div>';
    });
  }

  /**
   * Look up a single search term via FatSecret and populate the result row.
   */
  function lookupFatSecretForAi(term, idx, workerUrl) {
    var el = document.getElementById('fsItem' + idx);
    var macrosEl = document.getElementById('fsMacros' + idx);
    if (!el || !macrosEl) return; // modal closed

    fetch(workerUrl + '/search?q=' + encodeURIComponent(term) + '&page=0')
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      var el2 = document.getElementById('fsItem' + idx);
      if (!el2) return;

      var foodsList = (data.foods && data.foods.food) ? data.foods.food : null;
      if (!foodsList) {
        // No FatSecret result — mark as not found, user can still add manually
        macrosEl.textContent = 'Not found in database';
        el2.style.opacity = '0.5';
        el2.querySelector('.fp-add').textContent = '✗';
        el2.querySelector('.fp-add').style.color = '#c96a6a';
        el2.classList.add('fs-not-found');
        dom.aiResult._fsPending--;
        App.checkAllFsDone();
        return;
      }

      var fsFood = Array.isArray(foodsList) ? foodsList[0] : foodsList;
      var fsId = fsFood.food_id || '';
      var fsName = fsFood.food_name || term;
      var desc = fsFood.food_description || '';
      var macros = App.parseFsDescription(desc);

      // Now fetch full details for exact macros
      return fetch(workerUrl + '/food?id=' + encodeURIComponent(fsId))
      .then(function(res2) {
        if (!res2.ok) throw new Error('HTTP ' + res2.status);
        return res2.json();
      })
      .then(function(detailData) {
        var el3 = document.getElementById('fsItem' + idx);
        if (!el3) return;

        var food = detailData.food;
        var cals = macros.calories || 0;
        var protein = macros.protein || 0;

        // Override with serving-level data if available (more accurate)
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
        }

        // Update row
        el3.querySelector('.fp-name').textContent = fsName;
        macrosEl.textContent = (cals || '?') + ' cal | ' + (protein || '?') + 'g protein';
        el3.style.opacity = '1';
        el3.querySelector('.fp-add').textContent = 'import';
        el3.querySelector('.fp-add').style.color = '#5a7a6a';

        // Store for confirm
        dom.aiResult._fsItems[idx] = { name: fsName, calories: cals, protein: protein };

        // Individual click → import just this one
        el3.querySelector('.fp-add').style.cursor = 'pointer';
        el3.addEventListener('click', function() {
          var item = dom.aiResult._fsItems[idx];
          if (!item) return;
          var newId = Date.now();
          App.foods.push({ id: newId, name: item.name, calories: item.calories || 0, protein: item.protein || 0, per100g: true });
          App.saveFoods();
          var nut = App.getNutrition(s.nutritionDate);
          var meal = null;
          for (var i = 0; i < nut.meals.length; i++) {
            if (nut.meals[i].slot === s.pendingFoodSlot) { meal = nut.meals[i]; break; }
          }
          if (meal) meal.items.push({ foodId: newId, amount: 100, unit: 'g' });
          App.saveData();
          App.trackRecentMeal(s.pendingFoodSlot, meal.items);
          App.showToast('Imported ' + item.name);
          // Gray out this row
          el3.style.opacity = '0.3';
          el3.style.pointerEvents = 'none';
          dom.aiResult._fsItems[idx] = null;
        });

        dom.aiResult._fsPending--;
        App.checkAllFsDone();
      });
    })
    .catch(function() {
      var el4 = document.getElementById('fsItem' + idx);
      if (!el4) return;
      macrosEl.textContent = 'Lookup failed';
      el4.style.opacity = '0.5';
      el4.querySelector('.fp-add').textContent = '✗';
      el4.querySelector('.fp-add').style.color = '#c96a6a';
      el4.classList.add('fs-not-found');
      dom.aiResult._fsPending--;
      App.checkAllFsDone();
    });
  }

  function checkAllFsDone() {
    if (dom.aiResult._fsPending <= 0) {
      var btn = document.getElementById('btnConfirmAllFs');
      if (btn) {
        btn.style.display = 'block';
        btn.addEventListener('click', function() {
          var nut = App.getNutrition(s.nutritionDate);
          var meal = null;
          for (var i = 0; i < nut.meals.length; i++) {
            if (nut.meals[i].slot === s.pendingFoodSlot) { meal = nut.meals[i]; break; }
          }
          var added = 0;
          dom.aiResult._fsItems.forEach(function(item, idx) {
            if (!item) return;
            var newId = Date.now() + idx;
            App.foods.push({ id: newId, name: item.name, calories: item.calories || 0, protein: item.protein || 0, per100g: true });
            if (meal) meal.items.push({ foodId: newId, amount: 100, unit: 'g' });
            added++;
          });
          App.saveFoods();
          App.saveData();
          if (meal) App.trackRecentMeal(s.pendingFoodSlot, meal.items);
          App.closeAiEstimate();
          App.renderNutritionView();
          App.showToast('Imported ' + added + ' App.foods with real nutrition data!');
        });
      }
    }
  }

  /**
   * Original behavior: DeepSeek estimates macros directly.
   * Used when no FatSecret Worker URL is configured.
   */
  // ==================== MEAL PLAN GENERATOR ====================

  /**
   * USDA / FatSecret verified reference values for common bodybuilding App.foods.
   * All values are per 100g edible portion (cooked unless noted).
   * Used to ground AI estimates in real data and post-validate plan macros.
   */
  var FOOD_DB = {
    // Protein sources (per 100g cooked)
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
    // Eggs & dairy (per 100g)
    'whole eggs':            { cal: 155, pro: 13, fat: 11, carb: 1.1 },
    'egg':                   { cal: 155, pro: 13, fat: 11, carb: 1.1 },
    'egg whites':            { cal: 52, pro: 11, fat: 0.2, carb: 0.7 },
    'greek yogurt':          { cal: 59, pro: 10, fat: 0.4, carb: 3.6 },
    'cottage cheese':        { cal: 81, pro: 12, fat: 2.3, carb: 3.4 },
    'whey':                  { cal: 400, pro: 80, fat: 5, carb: 8 },
    'milk':                  { cal: 42, pro: 3.4, fat: 1, carb: 5 },
    'cheese':                { cal: 350, pro: 25, fat: 27, carb: 1.3 },
    // Carb sources (per 100g cooked)
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
    'bagel':                 { cal: 275, pro: 11, fat: 1.5, carb: 55 },
    // Vegetables (per 100g)
    'broccoli':              { cal: 55, pro: 3.7, fat: 0.6, carb: 7 },
    'spinach':               { cal: 23, pro: 2.9, fat: 0.4, carb: 3.6 },
    'green beans':           { cal: 35, pro: 1.9, fat: 0.3, carb: 7 },
    'asparagus':             { cal: 22, pro: 2.4, fat: 0.2, carb: 4 },
    'bell pepper':           { cal: 28, pro: 0.9, fat: 0.2, carb: 6 },
    'mixed vegetables':      { cal: 45, pro: 2, fat: 0.3, carb: 8 },
    // Fats (per 100g unless noted)
    'olive oil':             { cal: 884, pro: 0, fat: 100, carb: 0 },
    'avocado':               { cal: 160, pro: 2, fat: 15, carb: 9 },
    'almonds':               { cal: 579, pro: 21, fat: 50, carb: 22 },
    'peanut butter':         { cal: 588, pro: 25, fat: 50, carb: 20 },
    // Fruit
    'banana':                { cal: 89, pro: 1.1, fat: 0.3, carb: 23 },
    'apple':                 { cal: 52, pro: 0.3, fat: 0.2, carb: 14 },
    'blueberries':           { cal: 57, pro: 0.7, fat: 0.3, carb: 14 },
    'orange':                { cal: 47, pro: 0.9, fat: 0.1, carb: 12 },
    'strawberries':          { cal: 32, pro: 0.7, fat: 0.3, carb: 8 }
  };

  /**
   * Build a compact reference table string for the AI system prompt.
   */
  function buildFoodDbPrompt() {
    var lines = ['REFERENCE MACROS (per 100g, verified USDA/FatSecret values):'];
    for (var key in FOOD_DB) {
      if (FOOD_DB.hasOwnProperty(key)) {
        var f = FOOD_DB[key];
        lines.push(key + ': ' + f.cal + 'cal P' + f.pro + ' F' + f.fat + ' C' + f.carb);
      }
    }
    return lines.join('\n');
  }

  /**
   * Fuzzy-match a food description against FOOD_DB and return the best entry.
   * Returns { key, entry, score } or null.
   */
  function matchFoodDb(desc) {
    var lower = desc.toLowerCase();
    var best = null;
    var bestScore = 0;
    for (var key in FOOD_DB) {
      if (FOOD_DB.hasOwnProperty(key)) {
        var score = 0;
        if (lower.indexOf(key) >= 0) score = key.length;          // exact substring match
        else {
          // Check individual words
          var words = key.split(' ');
          for (var w = 0; w < words.length; w++) {
            if (lower.indexOf(words[w]) >= 0 && words[w].length > 2) score += words[w].length;
          }
        }
        if (score > bestScore) { bestScore = score; best = key; }
      }
    }
    if (best && bestScore >= 3) return { key: best, entry: FOOD_DB[best], score: bestScore };
    return null;
  }

  /**
   * Also try to match against the user's local food library (which contains
   * FatSecret-verified App.foods they've already imported). Returns { food, per100g }
   * where per100g has { cal, pro, fat, carb } normalized to 100g, or null.
   */
  function matchLocalFood(desc) {
    var lower = desc.toLowerCase();
    var best = null;
    var bestScore = 0;
    for (var i = 0; i < App.foods.length; i++) {
      var f = App.foods[i];
      var name = f.name.toLowerCase();
      var score = 0;
      if (lower.indexOf(name) >= 0) score = name.length;
      else {
        var words = name.split(' ');
        for (var w = 0; w < words.length; w++) {
          if (lower.indexOf(words[w]) >= 0 && words[w].length > 2) score += words[w].length;
        }
      }
      if (score > bestScore) { bestScore = score; best = f; }
    }
    if (best && bestScore >= 3) {
      // Normalize to per-100g if the food has per100g flag
      if (best.per100g) {
        return { food: best, per100g: { cal: best.calories, pro: best.protein, fat: best.fat || 0, carb: best.carbs || 0 } };
      }
      // Otherwise assume the food entry is a typical serving; return as-is
      return { food: best, per100g: null };
    }
    return null;
  }

  /**
   * Extract gram amount from a food description like "200g chicken breast" or "8oz steak".
   * Returns grams (number) or null if unparseable.
   */
  function parseGrams(desc) {
    var gMatch = desc.match(/(\d+)\s*g\b/i);
    if (gMatch) return parseInt(gMatch[1]);
    var ozMatch = desc.match(/(\d+)\s*oz\b/i);
    if (ozMatch) return Math.round(parseInt(ozMatch[1]) * 28.35);
    // Common serving sizes
    if (/\b1\s*scoop\b/i.test(desc)) return 30;   // whey scoop
    if (/\blarge egg\b/i.test(desc) || /\begg\b.*\blarge\b/i.test(desc)) return 50; // 1 large egg ~50g
    if (/\bmedium egg\b/i.test(desc)) return 44;
    if (/\btbsp\b/i.test(desc)) { var m = desc.match(/(\d+)\s*tbsp\b/i); return m ? parseInt(m[1]) * 14 : null; }
    if (/\btsp\b/i.test(desc)) { var m = desc.match(/(\d+)\s*tsp\b/i); return m ? parseInt(m[1]) * 5 : null; }
    if (/\bcup\b/i.test(desc)) { var m = desc.match(/(\d+)\s*cup\b/i); return m ? parseInt(m[1]) * 240 : null; } // rough ml
    if (/\bslice\b/i.test(desc)) return 30; // rough bread slice
    return null;
  }

  /**
   * Validate and correct a single plan item's macros against FOOD_DB + local App.foods.
   * Returns a corrected item object (or the original if it looks reasonable).
   */
  function validatePlanItem(item) {
    var desc = item.desc || '';
    var grams = App.parseGrams(desc);

    // Try local food library first (FatSecret-verified)
    var localMatch = App.matchLocalFood(desc);
    if (localMatch && localMatch.per100g && grams) {
      var mult = grams / 100;
      return {
        desc: desc,
        cal: Math.round(localMatch.per100g.cal * mult),
        pro: Math.round(localMatch.per100g.pro * mult),
        fat: Math.round(localMatch.per100g.fat * mult),
        carbs: Math.round(localMatch.per100g.carb * mult),
        _source: 'fatsecret'
      };
    }

    // Fall back to FOOD_DB
    var match = App.matchFoodDb(desc);
    if (match && grams) {
      var mult2 = grams / 100;
      var expectedCal = Math.round(match.entry.cal * mult2);
      var expectedPro = Math.round(match.entry.pro * mult2);
      var expectedFat = Math.round(match.entry.fat * mult2);
      var expectedCarb = Math.round(match.entry.carb * mult2);

      // If AI estimate is within 25% for calories, keep AI values (they may have
      // accounted for preparation details we don't model). Otherwise correct.
      var aiCal = item.cal || 0;
      var pctDiff = expectedCal > 0 ? Math.abs(aiCal - expectedCal) / expectedCal : 1;
      if (pctDiff > 0.25 || !item.cal) {
        return {
          desc: desc,
          cal: expectedCal,
          pro: expectedPro,
          fat: expectedFat,
          carbs: expectedCarb,
          _source: 'usda'
        };
      }
    }

    // No match or within tolerance — keep AI estimate but ensure all 4 fields
    return {
      desc: desc,
      cal: item.cal || 0,
      pro: item.pro || 0,
      fat: item.fat || 0,
      carbs: item.carbs || 0
    };
  }

  /**
   * Validate all plan items across all slots, correcting macros against
   * FOOD_DB and the local food library where possible.
   */
  function validateAndCorrectPlan(plan) {
    var corrected = {};
    var corrections = 0;
    for (var slot in plan) {
      if (plan.hasOwnProperty(slot) && Array.isArray(plan[slot])) {
        corrected[slot] = plan[slot].map(function(item) {
          var fixed = App.validatePlanItem(item);
          if (fixed._source) corrections++;
          return fixed;
        });
      }
    }
    return { plan: corrected, corrections: corrections };
  }

  /**
   * Generate a modular meal plan — simple guidelines with alternates.
   * User picks the actual App.foods from FatSecret by tapping each suggestion.
   * Plan is stored as text notes per meal slot, with tappable food chips.
   */
  function generateMealPlan() {
    var goals = App.loadGoals();

    var btn = document.getElementById('btnMealPlan');
    if (btn) { btn.textContent = '...'; btn.disabled = true; }

    var nut = App.getNutrition(s.nutritionDate);

    // ---- Scan slots: which are already filled with actual food? ----
    var filledCal = 0, filledPro = 0, filledFat = 0, filledCarbs = 0;
    var emptySlots = [];
    var filledSlots = [];
    ['breakfast', 'lunch', 'dinner', 'snacks'].forEach(function(slot) {
      var meal = null;
      for (var i = 0; i < nut.meals.length; i++) {
        if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; }
      }
      if (meal && meal.items && meal.items.length > 0) {
        var t = App.calcSlotTotals(meal.items);
        filledCal += t.calories;
        filledPro += t.protein;
        filledFat += t.fat;
        filledCarbs += t.carbs;
        filledSlots.push(slot);
        // Clear stale planNotes — these slots are already fulfilled
        meal.planNotes = null;
      } else {
        emptySlots.push(slot);
      }
    });

    // If every slot already has food, nothing to plan
    if (emptySlots.length === 0) {
      if (btn) { btn.textContent = '🧠 Generate Meal Plan'; btn.disabled = false; }
      App.showToast('All meal slots are already filled!');
      return;
    }

    var remainingCal = Math.max(0, goals.calories - filledCal);
    var remainingPro = Math.max(0, goals.protein - filledPro);
    var remainingFat = Math.max(0, (goals.fat || 0) - filledFat);
    var remainingCarbs = Math.max(0, (goals.carbs || 0) - filledCarbs);

    App.showToast('Filling ' + emptySlots.length + ' empty slot(s) around ' + filledCal + ' cal already logged...');

    // ---- Build a science-backed prompt targeting only empty slots ----
    var promptParts = ['Create a modular meal plan using a science-backed high-protein, moderate-carb, low-fat model.'];

    if (filledSlots.length > 0) {
      promptParts.push('These slots are ALREADY FILLED — do NOT include them in the plan:');
      promptParts.push(filledSlots.join(', ') + ' (' + filledCal + ' cal, P' + filledPro + 'g, F' + filledFat + 'g, C' + filledCarbs + 'g).');
    }

    promptParts.push('Only plan for these EMPTY slots: ' + emptySlots.join(', ') + '.');
    promptParts.push('Target for new items: ~' + remainingCal + ' cal, ~' + remainingPro + 'g protein, ~' + remainingFat + 'g fat, ~' + remainingCarbs + 'g carbs.');
    promptParts.push('Grand total (filled + new) must be ≤' + goals.calories + ' cal, ≥' + goals.protein + 'g protein, ≤' + (goals.fat || 70) + 'g fat, ~' + (goals.carbs || 250) + 'g carbs.');

    // Science-backed principles
    promptParts.push('PRIORITIES: 1) Hit protein target with lean sources first. 2) Keep fat low (use lean meats, avoid added oils/butter). 3) Fill remaining calories with complex carbs (rice, potato, oats, whole grains).');
    promptParts.push('GUIDELINES: Prefer whole App.foods, including whole eggs (not just whites — the fat is modest and they\'re more practical). Each meal: 30-50g protein from lean meat/fish/eggs/dairy. Favor slow-digesting carbs. Minimal added fats. Use vegetables for volume/satiety.');

    promptParts.push('Return ONLY valid JSON with exactly these keys: ' + JSON.stringify(emptySlots) + '.');
    promptParts.push('Each value is an array of objects: {"desc":"200g chicken breast (grilled, no oil)","cal":330,"pro":62,"fat":7,"carbs":0}.');
    promptParts.push('Include realistic estimates for cal, pro, fat, carbs per item. Return only JSON, no markdown.');

    var prompt = promptParts.join(' ');

    fetch(App.FATSECRET_WORKER + '/deepseek', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You are a science-backed meal planner. Follow a high-protein, moderate-carb, low-fat model. Prioritize lean protein sources (chicken breast, turkey, white fish, lean beef, whole eggs, nonfat Greek yogurt, whey) at every meal. Favor whole eggs over egg whites — the extra few grams of fat are worth the convenience and nutrition, and they fit the model fine as long as total fat stays under target. Keep added fats minimal — avoid oil, butter, cheese, nuts unless essential. Fill remaining calories with complex carbs (rice, potato, oats, whole grains, legumes). Each meal should center on a lean protein.\n\nUSE THESE EXACT VERIFIED VALUES for all macro estimates (per 100g unless noted):\n' + App.buildFoodDbPrompt() + '\n\nCalculate macros by multiplying the reference value by (grams / 100). For example, 200g chicken breast = 200/100 * 165cal = 330cal, 200/100 * 31g protein = 62g. Be precise. Return ONLY valid JSON, no markdown.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 600,
        temperature: 0.4
      })
    })
    .then(function(res) {
      if (!res.ok) throw new Error('API error: ' + res.status);
      return res.json();
    })
    .then(function(data) {
      var content = data.choices[0].message.content;
      content = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      var rawPlan = JSON.parse(content);
      if (!rawPlan || typeof rawPlan !== 'object') throw new Error('Invalid meal plan');

      // Validate and correct macros against FOOD_DB + local App.foods
      var vResult = App.validateAndCorrectPlan(rawPlan);
      var plan = vResult.plan;

      // Store plan notes ONLY on empty slots (leave filled slots untouched)
      emptySlots.forEach(function(slot) {
        var items = plan[slot];
        var meal = null;
        for (var i = 0; i < nut.meals.length; i++) {
          if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; }
        }
        if (!meal) return;

        if (Array.isArray(items) && items.length) {
          meal.planNotes = items;
          meal.notes = items.map(function(i) { return typeof i === 'string' ? i : i.desc; }).join(' | ');
        }
      });

      App.saveData();
      if (btn) { btn.textContent = '🧠 Generate Meal Plan'; btn.disabled = false; }
      App.renderNutritionView();
      var msg = 'Meal plan ready — ' + emptySlots.length + ' slot(s) filled!';
      if (vResult.corrections > 0) msg += ' (' + vResult.corrections + ' items verified against USDA data)';
      App.showToast(msg);
    })
    .catch(function(err) {
      if (btn) { btn.textContent = '🧠 Generate Meal Plan'; btn.disabled = false; }
      App.showToast('Meal plan failed: ' + err.message);
    });
  }


  // ==================== EXPORTS ====================
  App.buildFoodDbPrompt = buildFoodDbPrompt;
  App.callAiEstimate = callAiEstimate;
  App.callAiEstimateWithFatSecret = callAiEstimateWithFatSecret;
  App.checkAllFsDone = checkAllFsDone;
  App.closeAiEstimate = closeAiEstimate;
  App.generateMealPlan = generateMealPlan;
  App.lookupFatSecretForAi = lookupFatSecretForAi;
  App.matchFoodDb = matchFoodDb;
  App.matchLocalFood = matchLocalFood;
  App.openAiEstimate = openAiEstimate;
  App.parseGrams = parseGrams;
  App.validateAndCorrectPlan = validateAndCorrectPlan;
  App.validatePlanItem = validatePlanItem;

})();