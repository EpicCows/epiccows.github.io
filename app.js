(function() {
  'use strict';

  // ==================== PWA REGISTRATION ====================
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('sw.js').catch(function() {});
    });
  }

  // ==================== CONSTANTS ====================

  var PROFILE = localStorage.getItem('tallTenderProfile') || 'default';
  var STORAGE_KEY  = 'tallTenderData_' + PROFILE;
  var PROGRAMS_KEY = 'tallTenderPrograms_' + PROFILE;

  var BUILTIN_PROGRAMS = {
    'Upper A': [
      { name: 'Machine Chest Press', sets: 3, reps: '8-12', cue: 'Pinch shoulders back. Elbows ~45°. Press through palms. Safe on tendons.' },
      { name: 'Seated Cable Row (V-Grip)', sets: 3, reps: '8-12', cue: 'Pull to sternum. Pinch shoulder blades. No momentum.' },
      { name: 'Seated DB Shoulder Press', sets: 3, reps: '12-15', cue: 'Slight forward lean. Stop at ear level. Light+controlled. Protect labrum.' },
      { name: 'Cable Lateral Raises', sets: 3, reps: '12-15', cue: 'Cable behind back. Lead with elbow. Pause at top.' },
      { name: 'Pec Deck Fly', sets: 3, reps: '10-12', cue: 'Elbows bent ~15°. Stretch then squeeze. Control negative.' },
      { name: 'Overhead Rope Tricep Ext.', sets: 3, reps: '10-12', cue: 'Elbows near ears. Full stretch overhead. No shoulder flare.' }
    ],
    'Lower A': [
      { name: 'Smith Machine Squat', sets: 3, reps: '6-10', cue: 'Feet slightly forward. Depth to parallel. Drive through midfoot. Safe on knees.' },
      { name: 'Standard Leg Press', sets: 3, reps: '8-12', cue: 'Feet high+wide. Deep but no butt wink. Press through midfoot.' },
      { name: 'Leg Extensions', sets: 3, reps: '12-15', cue: 'Pause at top 1s. Control negative. No hip lift off pad.' },
      { name: 'Seated Leg Curls', sets: 3, reps: '10-12', cue: 'Pause at peak contraction. Control eccentric 3s. No hip lift.' },
      { name: 'Seated Calf Raises', sets: 4, reps: '12-15', cue: 'Pause at bottom 2s. Explode up. Soleus = bent knee.' },
      { name: 'Cable Rope Crunch', sets: 3, reps: '10-12', cue: 'Round spine. Rope behind head. Crunch, don\'t hip hinge.' }
    ],
    'Upper B': [
      { name: 'Neutral Grip Lat Pulldowns', sets: 3, reps: '6-10', cue: 'Chest to bar. Drive elbows down+back. No lean-back swing.' },
      { name: 'Supported DB Row', sets: 3, reps: '8-12', cue: 'Chest on pad. Full stretch at bottom. Squeeze at top.' },
      { name: 'Seated Cable Row (V-Grip)', sets: 3, reps: '8-12', cue: 'Pull to sternum. Pinch shoulder blades. No momentum.' },
      { name: 'Face Pulls', sets: 3, reps: '12-15', cue: 'Rope to forehead. External rotate at end. Hold 1s.' },
      { name: 'DB Hammer Curls', sets: 3, reps: '10-12', cue: 'Neutral grip. No shoulder swing. Full stretch at bottom.' },
      { name: 'Cable Rope Curls', sets: 3, reps: '12-15', cue: 'Elbows locked at sides. Squeeze at peak. Slow negative.' }
    ],
    'Lower B': [
      { name: 'Trap Bar Deadlift', sets: 3, reps: '6-10', cue: 'Hips high. Push floor away. Brace core hard. No rounded back.' },
      { name: 'DB Romanian Deadlifts', sets: 3, reps: '8-12', cue: 'Soft knees. Hinge at hips. Feel hamstring stretch. Flat back.' },
      { name: 'Seated Leg Curls', sets: 3, reps: '10-12', cue: 'Pause at peak contraction. Control eccentric 3s. No hip lift.' },
      { name: '45° Back Extensions', sets: 3, reps: '10-12', cue: 'Hinge at hips, not spine. Squeeze glutes at top. Controlled.' },
      { name: 'Standing Calf Raises', sets: 4, reps: '12-15', cue: 'Full stretch 2s at bottom. Explode up. Straight knees = gastroc.' },
      { name: 'Decline Bench Sit-up', sets: 3, reps: '10-12', cue: 'Control down. Hands near temples. Don\'t yank neck.' }
    ]
  };

  // Programs runtime state — loaded from localStorage or seeded from builtins
  var programs = {};

  function loadPrograms() {
    try {
      var raw = localStorage.getItem(PROGRAMS_KEY);
      if (raw) {
        programs = JSON.parse(raw);
        if (Object.keys(programs).length === 0) throw new Error('empty');
        // Auto-migrate from old defaults to science-optimized programs
        migratePrograms();
      } else {
        throw new Error('no data');
      }
    } catch (e) {
      programs = JSON.parse(JSON.stringify(BUILTIN_PROGRAMS)); // deep copy
      savePrograms();
    }
  }

  function migratePrograms() {
    // Detect old Upper A: had Smith press + skullcrushers, no row
    var upperA = programs['Upper A'];
    if (upperA && upperA.length === 6) {
      var hasSmith = upperA.some(function(ex) { return ex.name.indexOf('Smith') >= 0; });
      var hasSkull = upperA.some(function(ex) { return ex.name.indexOf('Skullcrusher') >= 0; });
      var hasRow = upperA.some(function(ex) { return ex.name.toLowerCase().indexOf('row') >= 0; });
      if (hasSmith && hasSkull && !hasRow) {
        programs['Upper A'] = JSON.parse(JSON.stringify(BUILTIN_PROGRAMS['Upper A']));
        console.log('Migrated Upper A to optimized program');
      }
    }
    // Detect old Lower A: had lunges, no leg curl (or had Lying variant)
    var lowerA = programs['Lower A'];
    if (lowerA && lowerA.length === 6) {
      var hasLunges = lowerA.some(function(ex) { return ex.name.indexOf('Lunges') >= 0; });
      var hasLegCurl = lowerA.some(function(ex) { return ex.name.indexOf('Leg Curls') >= 0; });
      var hasLying = lowerA.some(function(ex) { return ex.name.indexOf('Lying') >= 0; });
      if ((hasLunges && !hasLegCurl) || hasLying) {
        programs['Lower A'] = JSON.parse(JSON.stringify(BUILTIN_PROGRAMS['Lower A']));
        console.log('Migrated Lower A to optimized program');
      }
    }
    // Update Upper B / Lower B cues if they match old format (no cues)
    var upperB = programs['Upper B'];
    if (upperB && upperB.length === 6 && !upperB[0].cue) {
      programs['Upper B'] = JSON.parse(JSON.stringify(BUILTIN_PROGRAMS['Upper B']));
      console.log('Migrated Upper B cues');
    }
    var lowerB = programs['Lower B'];
    if (lowerB && lowerB.length === 6 && !lowerB[0].cue) {
      programs['Lower B'] = JSON.parse(JSON.stringify(BUILTIN_PROGRAMS['Lower B']));
      console.log('Migrated Lower B cues');
    }
    // Update rep ranges: if first exercise still has old high-rep range, bump to latest
    if (upperA && upperA[0] && upperA[0].reps === '8-12') {
      programs['Upper A'] = JSON.parse(JSON.stringify(BUILTIN_PROGRAMS['Upper A']));
    }
    if (upperB && upperB[0] && upperB[0].reps === '8-12') {
      programs['Upper B'] = JSON.parse(JSON.stringify(BUILTIN_PROGRAMS['Upper B']));
    }
    if (lowerA && lowerA[0] && (lowerA[0].reps === '8-12/leg' || lowerA[0].name.indexOf('Bulgarian') >= 0)) {
      programs['Lower A'] = JSON.parse(JSON.stringify(BUILTIN_PROGRAMS['Lower A']));
    }
    if (lowerB && lowerB[0] && lowerB[0].reps === '8-12') {
      programs['Lower B'] = JSON.parse(JSON.stringify(BUILTIN_PROGRAMS['Lower B']));
    }
    savePrograms();
  }

  function savePrograms() {
    try {
      localStorage.setItem(PROGRAMS_KEY, JSON.stringify(programs));
    } catch (e) {}
  }

  function resetPrograms() {
    programs = JSON.parse(JSON.stringify(BUILTIN_PROGRAMS));
    savePrograms();
  }

  // ==================== NUTRITION DATA ====================

  var FOODS_KEY = 'tallTenderFoods_' + PROFILE;
  var TEMPLATES_KEY = 'tallTenderMealTemplates_' + PROFILE;
  var RECENT_MEALS_KEY = 'tallTenderRecentMeals_' + PROFILE;
  var MAX_RECENT_MEALS = 20;

  var foods = [];          // [{ id, name, calories, protein }]
  var mealTemplates = [];  // [{ id, name, items: [{foodId, servings}] }]
  var recentMeals = [];    // [{ id, name, slot, items: [{foodId, servings, amount?, unit?}], lastUsed, useCount }]

  function loadFoods() {
    try {
      var raw = localStorage.getItem(FOODS_KEY);
      foods = raw ? JSON.parse(raw) : [];
    } catch (e) { foods = []; }
  }

  function saveFoods() {
    try { localStorage.setItem(FOODS_KEY, JSON.stringify(foods)); } catch (e) {}
  }

  function loadMealTemplates() {
    try {
      var raw = localStorage.getItem(TEMPLATES_KEY);
      mealTemplates = raw ? JSON.parse(raw) : [];
    } catch (e) { mealTemplates = []; }
  }

  function saveMealTemplates() {
    try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(mealTemplates)); } catch (e) {}
  }

  function loadRecentMeals() {
    try {
      var raw = localStorage.getItem(RECENT_MEALS_KEY);
      recentMeals = raw ? JSON.parse(raw) : [];
    } catch (e) { recentMeals = []; }
  }

  function saveRecentMeals() {
    try { localStorage.setItem(RECENT_MEALS_KEY, JSON.stringify(recentMeals)); } catch (e) {}
  }

  var GOALS_KEY = 'tallTenderGoals_' + PROFILE;
  var REVIEW_EMAIL_KEY = 'tallTenderReviewEmail_' + PROFILE;
  var REVIEW_OPTIN_KEY = 'tallTenderReviewOptIn_' + PROFILE;

  function loadGoals() {
    try {
      var raw = localStorage.getItem(GOALS_KEY);
      return raw ? JSON.parse(raw) : { calories: 2500, protein: 200, fat: 70, carbs: 250, height: 178, age: 25 };
    } catch (e) { return { calories: 2500, protein: 200, fat: 70, carbs: 250, height: 178, age: 25 }; }
  }

  function saveGoals(goals) {
    try { localStorage.setItem(GOALS_KEY, JSON.stringify(goals)); } catch (e) {}
  }

  function getNutrition(dateStr) {
    if (!appData.nutrition) appData.nutrition = {};
    if (!appData.nutrition[dateStr]) {
      appData.nutrition[dateStr] = {
        meals: [
          { slot: 'breakfast', items: [], notes: '' },
          { slot: 'lunch', items: [], notes: '' },
          { slot: 'dinner', items: [], notes: '' },
          { slot: 'snacks', items: [], notes: '' }
        ]
      };
    }
    return appData.nutrition[dateStr];
  }

  function getFoodById(id) {
    for (var i = 0; i < foods.length; i++) {
      if (foods[i].id === id) return foods[i];
    }
    return null;
  }

  function calcSlotTotals(items) {
    var cal = 0, pro = 0, fat = 0, carbs = 0;
    items.forEach(function(item) {
      var f = getFoodById(item.foodId);
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
  }

  function calcDailyTotals(dateStr) {
    var nut = getNutrition(dateStr);
    var cal = 0, pro = 0, fat = 0, carbs = 0;
    nut.meals.forEach(function(meal) {
      var t = calcSlotTotals(meal.items);
      cal += t.calories; pro += t.protein; fat += t.fat; carbs += t.carbs;
    });
    return { calories: cal, protein: pro, fat: fat, carbs: carbs };
  }

  function renderMealReminder() {
    var goals = loadGoals();
    if (!goals.calories) return '';
    var today = calcDailyTotals(todayStr());
    // Only remind if nothing logged and it's after 9am
    if (today.calories > 0) return '';
    var now = new Date();
    if (now.getHours() < 9) return '';
    var emoji = now.getHours() >= 14 ? '⚠️' : '🍽️';
    return '<div class="meal-reminder" style="margin:6px 0 10px;padding:8px 12px;background:#1a1814;border-radius:10px;border:1px solid #3a3020;display:flex;align-items:center;gap:8px;cursor:pointer;">' +
      '<span style="font-size:16px;">' + emoji + '</span>' +
      '<span style="font-size:11px;color:#ffb74d;flex:1;">No meals logged today — tap to track</span>' +
      '<span style="font-size:10px;color:#5a4a2a;">🍽️</span>' +
      '</div>';
  }

  // ==================== WEEKLY REVIEW EMAIL ====================

  function gatherWeeklyData() {
    var now = new Date();
    var dayOfWeek = now.getDay();
    var mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    var weekMon = new Date(now);
    weekMon.setDate(now.getDate() + mondayOffset);
    weekMon.setHours(0, 0, 0, 0);
    var weekSun = new Date(weekMon);
    weekSun.setDate(weekMon.getDate() + 6);

    function fmt(d) {
      return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    }

    var weekLabel = 'Mon ' + fmt(weekMon) + ' to Sun ' + fmt(weekSun);

    // Build array of 7 date strings
    var weekDates = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(weekMon);
      d.setDate(weekMon.getDate() + i);
      weekDates.push(fmt(d));
    }

    // --- Workouts ---
    var weekWorkouts = [];
    var totalVolume = 0;
    for (var wi = 0; wi < appData.workouts.length; wi++) {
      var w = appData.workouts[wi];
      if (weekDates.indexOf(w.date) >= 0) {
        var exSummary = w.exercises.map(function(ex) {
          var loggedSets = ex.sets.filter(function(s) { return s && s.weight > 0 && s.reps > 0; });
          var topWeight = loggedSets.reduce(function(m, s) { return Math.max(m, s.weight || 0); }, 0);
          return { name: ex.name, sets: loggedSets.length, topWeight: topWeight };
        });
        weekWorkouts.push({
          date: w.date,
          dayType: w.dayType,
          totalVolume: w.totalVolume,
          avgRpe: w.avgRpe,
          exercises: exSummary
        });
        totalVolume += w.totalVolume || 0;
      }
    }

    // --- Nutrition ---
    var goals = loadGoals();
    var totalCal = 0, totalPro = 0, totalFat = 0, totalCarbs = 0, loggedDays = 0;
    for (var di = 0; di < weekDates.length; di++) {
      var dt = calcDailyTotals(weekDates[di]);
      if (dt.calories > 0) {
        totalCal += dt.calories;
        totalPro += dt.protein;
        totalFat += dt.fat;
        totalCarbs += dt.carbs;
        loggedDays++;
      }
    }
    var avgDailyCal = loggedDays > 0 ? Math.round(totalCal / loggedDays) : 0;
    var weekGoalCal = goals.calories * 7;
    var surplus = totalCal - weekGoalCal;

    // Streak (consecutive days under goal)
    var streak = 0;
    var sd = new Date(todayStr() + 'T12:00:00');
    for (var si2 = 0; si2 < 365; si2++) {
      var sds = fmt(sd);
      var sdt = calcDailyTotals(sds);
      if (sdt.calories > 0 && goals.calories > 0 && sdt.calories <= goals.calories) {
        streak++;
        sd.setDate(sd.getDate() - 1);
      } else if (sdt.calories === 0 && sds === todayStr()) {
        sd.setDate(sd.getDate() - 1);
      } else {
        break;
      }
    }

    // --- Bodyweight ---
    var bwData = appData.bodyweight || {};
    var bwStart = bwData[weekDates[0]] || null;
    var bwEnd = bwData[weekDates[6]] || null;
    var bwDelta = (bwStart != null && bwEnd != null) ? Math.round((bwEnd - bwStart) * 10) / 10 : null;

    return {
      weekLabel: weekLabel,
      workouts: weekWorkouts,
      workoutCount: weekWorkouts.length,
      totalVolume: totalVolume,
      nutrition: {
        totalCalories: totalCal,
        totalProtein: totalPro,
        totalFat: totalFat,
        totalCarbs: totalCarbs,
        avgDailyCal: avgDailyCal,
        goalCal: goals.calories,
        surplus: surplus,
        loggedDays: loggedDays,
        streakDays: streak
      },
      bodyweight: {
        start: bwStart,
        end: bwEnd,
        delta: bwDelta
      }
    };
  }

  function sendReviewEmail(to, subject, html) {
    var workerUrl = (localStorage.getItem('tallTenderFatSecretUrl') || '').replace(/\/+$/, '');
    if (!workerUrl) {
      return Promise.reject(new Error('Worker URL not configured. Set it in Settings.'));
    }
    return fetch(workerUrl + '/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: to, subject: subject, html: html })
    })
    .then(function(res) {
      if (!res.ok) {
        return res.json().then(function(err) { throw new Error(err.error || 'Email failed with status ' + res.status); });
      }
      return res.json();
    });
  }

  function generateAndSendWeeklyReview() {
    var email = (localStorage.getItem(REVIEW_EMAIL_KEY) || '').trim();
    if (!email) { showToast('Set your email address in Settings first'); return Promise.reject('no email'); }

    var apiKey = localStorage.getItem('tallTenderApiKey') || '';
    if (!apiKey) { showToast('Set your DeepSeek API key in Settings first'); return Promise.reject('no api key'); }

    var optIn = localStorage.getItem(REVIEW_OPTIN_KEY);
    if (optIn === 'false') { showToast('Enable weekly review in Settings first'); return Promise.reject('not opted in'); }

    var weeklyData = gatherWeeklyData();
    var goals = loadGoals();

    var prompt = 'You are a supportive fitness coach writing a weekly review email.\n\n' +
      'Here is the user\'s data for the week (' + weeklyData.weekLabel + '):\n' +
      JSON.stringify(weeklyData, null, 2) + '\n\n' +
      'Goals: ' + JSON.stringify(goals) + '\n\n' +
      'Write a brief, motivational weekly summary email. Highlight progress, celebrate wins, gently note any areas for improvement. Use a friendly, encouraging tone. Return ONLY valid JSON with keys "subject" and "html". The "html" should be a clean, well-formatted HTML email body with inline dark-friendly styles (background #14191f, text #e8edf2, accent #4caf50). Keep it concise — no more than 300 words. Do not use markdown.';

    return fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You are a supportive fitness coach. Return ONLY valid JSON with keys "subject" and "html". No markdown.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 800,
        temperature: 0.7
      })
    })
    .then(function(res) {
      if (!res.ok) throw new Error('DeepSeek API error: ' + res.status);
      return res.json();
    })
    .then(function(data) {
      var content = data.choices[0].message.content;
      content = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      var review = JSON.parse(content);
      if (!review.subject || !review.html) throw new Error('AI response missing subject or html');
      return sendReviewEmail(email, review.subject, review.html);
    })
    .then(function() {
      showToast('Weekly review sent! Check your inbox.');
    });
  }

  function trackRecentMeal(slot, items) {
    if (!items || items.length === 0) return;
    // Build fingerprint from sorted foodIds
    var ids = [];
    items.forEach(function(item) { ids.push(item.foodId); });
    ids.sort(function(a, b) { return a - b; });
    var fingerprint = ids.join(',');
    var today = todayStr();
    // Check for existing combo
    for (var i = 0; i < recentMeals.length; i++) {
      var rm = recentMeals[i];
      var rmIds = [];
      rm.items.forEach(function(item) { rmIds.push(item.foodId); });
      rmIds.sort(function(a, b) { return a - b; });
      if (rmIds.join(',') === fingerprint && rm.slot === slot) {
        rm.useCount = (rm.useCount || 0) + 1;
        rm.lastUsed = today;
        // Move to front
        recentMeals.splice(i, 1);
        recentMeals.unshift(rm);
        saveRecentMeals();
        return;
      }
    }
    // New combo: auto-generate name from food names
    var names = [];
    items.forEach(function(item) {
      var f = getFoodById(item.foodId);
      if (f) names.push(f.name);
    });
    var displayName = names.slice(0, 3).join(' + ');
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
          unit: item.unit || null
        };
      }),
      lastUsed: today,
      useCount: 1
    });
    // Trim to max
    if (recentMeals.length > MAX_RECENT_MEALS) {
      recentMeals = recentMeals.slice(0, MAX_RECENT_MEALS);
    }
    saveRecentMeals();
  }

  function getRecentMealsForSlot(slot, limit) {
    var result = [];
    for (var i = 0; i < recentMeals.length; i++) {
      if (recentMeals[i].slot === slot) {
        // Filter out combos with deleted foods
        var valid = true;
        for (var j = 0; j < recentMeals[i].items.length; j++) {
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

  function computeSuggestions(excludeDate) {
    var slots = ['breakfast', 'lunch', 'dinner', 'snacks'];
    var result = {};
    // Initialize per-slot frequency maps
    var freqMaps = {};
    slots.forEach(function(s) { freqMaps[s] = {}; });
    // Collect all dates from nutrition data, sorted desc
    var dates = [];
    for (var d in appData.nutrition) {
      if (appData.nutrition.hasOwnProperty(d)) dates.push(d);
    }
    dates.sort().reverse();
    // Cap at 180 days
    var cutoff = '';
    if (dates.length > 0) {
      var cutoffDate = new Date(todayStr() + 'T12:00:00');
      cutoffDate.setDate(cutoffDate.getDate() - 180);
      cutoff = cutoffDate.getFullYear() + '-' +
        ('0' + (cutoffDate.getMonth() + 1)).slice(-2) + '-' +
        ('0' + cutoffDate.getDate()).slice(-2);
    }
    // Scan dates
    for (var di = 0; di < dates.length; di++) {
      var dateStr = dates[di];
      if (dateStr < cutoff) break; // older than 180 days
      if (dateStr === excludeDate) continue; // skip today's date
      var nut = appData.nutrition[dateStr];
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
    // Build result per slot
    slots.forEach(function(slot) {
      var arr = [];
      for (var fid in freqMaps[slot]) {
        if (freqMaps[slot].hasOwnProperty(fid)) {
          var entry = freqMaps[slot][fid];
          var f = getFoodById(entry.foodId);
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
        recent: getRecentMealsForSlot(slot, 2)
      };
    });
    return result;
  }

  // ==================== STATE ====================

  var appData = { workouts: [], currentWorkout: null, nutrition: {} };
  var currentView = 'workout';
  var pendingSetExIdx = null;
  var pendingSetIdx = null;
  var pendingConfirmCallback = null;
  var clockInterval = null;

  // Timer state
  var timerDuration = 60;      // seconds, default
  var timerRemaining = 60;
  var timerInterval = null;
  var timerRunning = false;
  var timerAutoStart = true;   // auto-start after logging a set

  // ==================== DOM REFS ====================

  var $ = function(id) { return document.getElementById(id); };

  var domWorkoutContent  = $('workoutContent');
  var domArchiveContent  = $('archiveContent');
  var domStatsContent    = $('statsContent');
  var domSettingsContent = $('settingsContent');
  var domTabBar          = $('tabBar');
  var domSetModal        = $('setModal');
  var domConfirmModal    = $('confirmModal');
  var domToast           = $('toast');
  var domImportInput     = $('importFileInput');

  // Nutrition
  var domNutritionContent   = $('nutritionContent');
  var domFoodPickerModal    = $('foodPickerModal');
  var domFoodSearchInput    = $('foodSearchInput');
  var domFoodPickerList     = $('foodPickerList');
  var domAiEstimateModal    = $('aiEstimateModal');
  var domAiMealInput        = $('aiMealInput');
  var domAiResult           = $('aiResult');
  var domAiEstimateBtn      = $('aiEstimateBtn');

  // Set modal inputs
  var domModalExName   = $('modalExName');
  var domModalSetInfo  = $('modalSetInfo');
  var domModalWeight   = $('modalWeight');
  var domModalReps     = $('modalReps');
  var domModalRpe      = $('modalRpe');
  var domModalNotes    = $('modalNotes');
  var domModalSaveBtn  = $('modalSaveBtn');
  var domModalCancelBtn = $('modalCancelBtn');

  var domConfirmContent = $('confirmContent');
  var domConfirmActions = $('confirmActions');

  // ==================== DATA LAYER ====================

  function loadData() {
    // One-time migration: copy old non-suffixed keys into default profile
    migrateOldKeys();
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        appData.workouts = parsed.workouts || [];
        appData.currentWorkout = parsed.currentWorkout || null;
      } else {
        tryMigrateOldData();
      }
    } catch (e) {
      appData = { workouts: [], currentWorkout: null };
    }
  }

  function migrateOldKeys() {
    var oldKeys = ['tallTenderData', 'tallTenderPrograms', 'tallTenderFoods', 'tallTenderMealTemplates', 'tallTenderRecentMeals', 'tallTenderGoals'];
    oldKeys.forEach(function(oldKey) {
      var oldVal = localStorage.getItem(oldKey);
      if (oldVal !== null) {
        var newKey = oldKey + '_default';
        if (localStorage.getItem(newKey) === null) {
          localStorage.setItem(newKey, oldVal);
        }
        localStorage.removeItem(oldKey);
      }
    });
  }

  function tryMigrateOldData() {
    try {
      var old = localStorage.getItem('tallTenderProgress');
      if (!old) return;
      // Old format can't be meaningfully migrated to the new workout model,
      // so just clear it and start fresh.
      localStorage.removeItem('tallTenderProgress');
      localStorage.removeItem('tallTenderRestDuration');
    } catch (e) {}
  }

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    } catch (e) {}
  }

  function calcVolume(sets) {
    return sets.reduce(function(sum, s) {
      return sum + ((s.weight || 0) * (s.reps || 0));
    }, 0);
  }

  function calcAvgRpe(sets) {
    var withRpe = sets.filter(function(s) { return s.rpe > 0; });
    if (withRpe.length === 0) return 0;
    var sum = withRpe.reduce(function(s, x) { return s + x.rpe; }, 0);
    return Math.round((sum / withRpe.length) * 10) / 10;
  }

  function calc1RM(weight, reps) {
    if (!weight || !reps || reps <= 0) return 0;
    // Epley formula
    return Math.round(weight * (1 + reps / 30));
  }

  function getWeekKey(dateStr) {
    var d = new Date(dateStr + 'T12:00:00');
    // Get ISO week number
    var temp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var dayNum = temp.getUTCDay() || 7;
    temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
    var yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((temp - yearStart) / 86400000) + 1) / 7);
    return temp.getUTCFullYear() + '-W' + (weekNo < 10 ? '0' : '') + weekNo;
  }

  function formatDate(dateStr) {
    var d = new Date(dateStr + 'T12:00:00');
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
    return days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  function formatTimeNow() {
    var now = new Date();
    var h = now.getHours();
    var m = now.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
  }

  function formatTimeShort(h, m) {
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
  }

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + '-' +
      ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
      ('0' + d.getDate()).slice(-2);
  }

  // ==================== TIMER ====================

  function loadTimerSettings() {
    try {
      var saved = localStorage.getItem('tallTenderTimer');
      if (saved) {
        var s = JSON.parse(saved);
        timerDuration = s.duration || 60;
        timerAutoStart = s.autoStart !== undefined ? s.autoStart : true;
      }
    } catch (e) {}
  }

  function saveTimerSettings() {
    try {
      localStorage.setItem('tallTenderTimer', JSON.stringify({
        duration: timerDuration,
        autoStart: timerAutoStart
      }));
    } catch (e) {}
  }

  function formatTimer(seconds) {
    var m = Math.floor(seconds / 60);
    var s = seconds % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function formatElapsed(ms) {
    var totalSec = Math.floor(ms / 1000);
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    if (h > 0) return h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function updateElapsed() {
    var el = document.getElementById('elapsedTime');
    if (!el || !appData.currentWorkout) return;
    var elapsed = Date.now() - (appData.currentWorkout.startTimestamp || Date.now());
    el.textContent = formatElapsed(elapsed);
  }

  function tickTimer() {
    if (!timerRunning) return;
    timerRemaining--;
    updateTimerUI();
    if (timerRemaining <= 0) {
      stopTimer();
      // Long vibration pattern for timer completion
      if (navigator.vibrate) { navigator.vibrate([200, 100, 200, 100, 400]); }
      showToast('⏰ Rest done - next set!');
    }
  }

  function startTimer(duration) {
    if (duration !== undefined) {
      timerDuration = duration;
      timerRemaining = duration;
      saveTimerSettings();
    } else {
      timerRemaining = timerDuration;
    }
    if (timerInterval) clearInterval(timerInterval);
    timerRunning = true;
    timerInterval = setInterval(tickTimer, 1000);
    updateTimerUI();
  }

  function stopTimer() {
    timerRunning = false;
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    timerRemaining = timerDuration;
    updateTimerUI();
  }

  function toggleTimer() {
    if (timerRunning) {
      stopTimer();
    } else {
      startTimer();
    }
  }

  function updateTimerUI() {
    var bar = document.getElementById('restTimerBar');
    if (!bar) return;
    var display = bar.querySelector('.timer-display');
    var actionBtn = bar.querySelector('.timer-action-btn');
    var presetBtns = bar.querySelectorAll('.preset-btn');

    if (display) display.textContent = formatTimer(timerRemaining);

    bar.classList.remove('running', 'warning');
    var btn30s = document.getElementById('timer30sBtn');
    if (timerRunning) {
      bar.classList.add('running');
      if (timerRemaining <= 10 && timerRemaining > 0) {
        bar.classList.add('warning');
      }
      if (actionBtn) actionBtn.textContent = 'Reset';
      if (btn30s) btn30s.style.display = '';
    } else {
      if (actionBtn) actionBtn.textContent = 'Start';
      if (btn30s) btn30s.style.display = 'none';
    }

    // Highlight active preset
    presetBtns.forEach(function(btn) {
      var val = parseInt(btn.dataset.seconds);
      btn.classList.toggle('active-preset', !timerRunning && val === timerDuration);
    });
  }

  // ==================== TOAST ====================

  function showToast(msg, undoFn) {
    if (undoFn) {
      domToast.innerHTML = msg + ' <span class="toast-undo" style="color:#4caf50;cursor:pointer;text-decoration:underline;font-weight:700;">Undo</span>';
      domToast.querySelector('.toast-undo').addEventListener('click', function(e) {
        e.stopPropagation();
        undoFn();
        domToast.classList.remove('show');
      });
    } else {
      domToast.textContent = msg;
    }
    domToast.classList.add('show');
    clearTimeout(domToast._timeout);
    domToast._timeout = setTimeout(function() {
      domToast.classList.remove('show');
    }, undoFn ? 4000 : 2500);
  }

  // ==================== HAPTIC ====================

  function haptic() {
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }
  }

  // ==================== CONFIRM MODAL ====================

  function showConfirm(htmlContent, actions) {
    domConfirmContent.innerHTML = htmlContent;
    domConfirmActions.innerHTML = '';
    actions.forEach(function(a) {
      var btn = document.createElement('button');
      btn.textContent = a.label;
      btn.className = a.cls || 'btn-save';
      btn.addEventListener('click', function() {
        closeConfirm();
        if (a.callback) a.callback();
      });
      domConfirmActions.appendChild(btn);
    });
    domConfirmModal.classList.add('open');
  }

  function closeConfirm() {
    domConfirmModal.classList.remove('open');
  }

  // ==================== SET LOG MODAL ====================

  // Look up the last logged first-set of this exercise from past workouts
  // Shared helper: find the last logged entry for an exercise by name.
  // Returns the first-set data from the most recent workout containing it.
  function findLastExerciseEntry(exerciseName) {
    for (var i = appData.workouts.length - 1; i >= 0; i--) {
      var w = appData.workouts[i];
      for (var j = 0; j < w.exercises.length; j++) {
        var ex = w.exercises[j];
        // Allow bodyweight (weight=0) — guard on reps instead
        if (ex.name === exerciseName && ex.sets.length > 0 && ex.sets[0].reps > 0) {
          return ex.sets[0];
        }
      }
    }
    return null;
  }

  // Get last workout's first set for pre-fill (weight, reps, RPE, notes)
  function getLastWorkoutFirstSet(exerciseName) {
    var set = findLastExerciseEntry(exerciseName);
    if (!set) return null;
    return {
      weight: set.weight || 0,
      reps: set.reps,
      rpe: set.rpe,
      notes: set.notes || ''
    };
  }

  // Get last logged set for exercise history display
  function getLastLog(exerciseName) {
    var set = findLastExerciseEntry(exerciseName);
    if (!set) return '';
    return (set.weight || 0) + 'kg x ' + set.reps + (set.rpe ? ' @' + set.rpe : '');
  }

  function getExerciseProgression(exerciseName, count) {
    count = count || 8;
    var weights = [];
    // Iterate oldest-first (no array copy needed)
    for (var i = 0; i < appData.workouts.length && weights.length < count; i++) {
      var w = appData.workouts[i];
      for (var j = 0; j < w.exercises.length; j++) {
        var ex = w.exercises[j];
        if (ex.name === exerciseName && ex.sets.length > 0 && ex.sets[0].reps > 0) {
          weights.push(ex.sets[0].weight || 0);
          break;
        }
      }
    }
    return weights; // already oldest-first
  }

  function renderSparkline(weights) {
    if (weights.length < 2) return '';
    var min = Math.min.apply(null, weights) * 0.9;
    var max = Math.max.apply(null, weights) * 1.05;
    var range = max - min || 1;
    var w = 60, h = 16, pad = 2;
    var points = weights.map(function(v, i) {
      var x = pad + (i / (weights.length - 1)) * (w - pad * 2);
      var y = h - pad - ((v - min) / range) * (h - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    return '<svg width="' + w + '" height="' + h + '" style="vertical-align:middle;margin-left:4px;flex-shrink:0;">' +
      '<polyline points="' + points + '" fill="none" stroke="#4caf50" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>' +
      '</svg>';
  }

  // Plate calculator — standard kg plates per side (20kg bar)
  var PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

  function calcPlatesPerSide(weight) {
    if (!weight || weight <= 20) return '';
    var perSide = (weight - 20) / 2;
    var result = [];
    var remaining = perSide;
    for (var i = 0; i < PLATES.length; i++) {
      var p = PLATES[i];
      while (remaining >= p - 0.01) { // small epsilon for float
        result.push(p);
        remaining -= p;
      }
    }
    if (remaining > 0.5) result.push(Math.round(remaining * 100) / 100);
    return result.length ? result.join(' + ') + ' / side' : '';
  }

  function updatePlateCalc() {
    var el = document.getElementById('plateCalc');
    if (!el) return;
    var w = parseFloat(domModalWeight.value) || 0;
    el.textContent = calcPlatesPerSide(w);
  }

  // Warm-up calculator
  function updateWarmupHint() {
    var el = document.getElementById('warmupHint');
    if (!el) return;
    var w = parseFloat(domModalWeight.value) || 0;
    if (w < 20) { el.textContent = ''; return; }
    el.textContent = 'Warm-up: ' +
      Math.round(w * 0.5) + ' x 8  |  ' +
      Math.round(w * 0.6) + ' x 5  |  ' +
      Math.round(w * 0.7) + ' x 3';
  }

  function fillWarmup() {
    var w = parseFloat(domModalWeight.value) || 0;
    if (w < 20) {
      // Try to get last session's weight for this exercise
      if (pendingSetExIdx !== null && appData.currentWorkout) {
        var exName = appData.currentWorkout.exercises[pendingSetExIdx].name;
        var lastSet = findLastExerciseEntry(exName);
        if (lastSet && lastSet.weight > 0) w = lastSet.weight;
      }
    }
    if (w < 20) return;

    // Cycle through warmup percentages: 40% → 60% → 80% → back to 100%
    var current = parseFloat(domModalWeight.value) || w;
    var pct = current / w;
    var next;
    if (pct < 0.5)      next = Math.round(w * 0.4);
    else if (pct < 0.7) next = Math.round(w * 0.6);
    else if (pct < 0.9) next = Math.round(w * 0.8);
    else                next = w; // back to working weight

    domModalWeight.value = next;
    domModalReps.value = next === w ? '' : (next < w * 0.5 ? 8 : next < w * 0.7 ? 5 : 2);
    domModalRpe.value = next === w ? '' : (next < w * 0.5 ? 6 : next < w * 0.7 ? 7 : 8);
    updatePlateCalc();
    updateWarmupHint();
    haptic();
  }

  function openSetModal(exIdx, setIdx) {
    if (!appData.currentWorkout) return;
    var ex = appData.currentWorkout.exercises[exIdx];
    var totalSets = programs[appData.currentWorkout.dayType][exIdx].sets;

    pendingSetExIdx = exIdx;
    pendingSetIdx = setIdx;

    domModalExName.textContent = ex.name;
    domModalSetInfo.textContent = 'Set ' + (setIdx + 1) + ' of ' + totalSets;

    // Pre-fill logic: existing data > previous set in this workout > last workout's first set
    var existing = ex.sets[setIdx];
    var hasExisting = existing && existing.weight > 0;

    var prefillWeight = '';
    var prefillReps = '';
    var prefillRpe = '';
    var prefillNotes = '';

    if (hasExisting) {
      // Set was already logged — show saved data
      prefillWeight = existing.weight;
      prefillReps = existing.reps;
      prefillRpe = existing.rpe;
      prefillNotes = existing.notes || '';
    } else if (setIdx > 0) {
      // Pre-fill from the previous set in this workout
      var prevSet = ex.sets[setIdx - 1];
      if (prevSet && prevSet.weight > 0) {
        prefillWeight = prevSet.weight;
        prefillReps = prevSet.reps;
        prefillRpe = prevSet.rpe;
        prefillNotes = prevSet.notes || '';
      }
    } else {
      // First set — pre-fill from the last time this exercise was logged
      var last = getLastWorkoutFirstSet(ex.name);
      if (last) {
        prefillWeight = last.weight;
        prefillReps = last.reps;
        prefillRpe = last.rpe;
        prefillNotes = last.notes || '';
      }
    }

    domModalWeight.value = prefillWeight;
    domModalReps.value = prefillReps;
    domModalRpe.value = prefillRpe;
    domModalNotes.value = prefillNotes;

    domSetModal.classList.add('open');
    haptic();
    updatePlateCalc();
    updateWarmupHint();
    setTimeout(function() { domModalWeight.focus(); }, 200);
  }

  function closeSetModal() {
    domSetModal.classList.remove('open');
    pendingSetExIdx = null;
    pendingSetIdx = null;
  }

  // ==================== SKIP EXERCISE MODAL ====================

  var pendingSkipExIdx = null;

  function openSkipModal(exIdx) {
    var ex = appData.currentWorkout.exercises[exIdx];
    var template = programs[appData.currentWorkout.dayType][exIdx];
    pendingSkipExIdx = exIdx;

    // Reset state
    document.querySelectorAll('#skipReasons .skip-reason-chip').forEach(function(c) { c.classList.remove('selected'); });
    var noteInput = document.getElementById('skipNoteInput');
    noteInput.value = '';
    noteInput.style.display = 'none';
    var confirmBtn = document.getElementById('skipConfirmBtn');
    confirmBtn.disabled = true;
    document.getElementById('skipExName').textContent = 'Skip: ' + ex.name + '?';

    document.getElementById('skipModal').classList.add('open');
  }

  function closeSkipModal() {
    document.getElementById('skipModal').classList.remove('open');
    pendingSkipExIdx = null;
  }

  function confirmSkip() {
    if (pendingSkipExIdx === null) return;
    var selectedChip = document.querySelector('#skipReasons .skip-reason-chip.selected');
    if (!selectedChip) return;

    var reason = selectedChip.dataset.reason;
    var note = document.getElementById('skipNoteInput').value.trim();

    var ex = appData.currentWorkout.exercises[pendingSkipExIdx];
    var totalSets = programs[appData.currentWorkout.dayType][pendingSkipExIdx].sets;

    // Mark all unlogged sets as skipped (weight=0, reps=0, rpe=0)
    for (var si = 0; si < totalSets; si++) {
      if (!ex.sets[si] || !ex.sets[si].reps) {
        ex.sets[si] = { weight: 0, reps: 0, rpe: 0, notes: '' };
      }
    }

    // Store skip reason
    ex.skipReason = reason;
    ex.skipNote = note || '';

    saveData();
    closeSkipModal();
    renderWorkoutView();

    var reasonLabels = { injury: 'Injury', fatigue: 'Fatigue', time: 'Time', equipment: 'Equipment', other: 'Other' };
    showToast('Skipped: ' + (reasonLabels[reason] || reason));
  }

  // Skip modal event delegation
  function initSkipModal() {
    var skipModal = document.getElementById('skipModal');
    var reasonsContainer = document.getElementById('skipReasons');
    var noteInput = document.getElementById('skipNoteInput');
    var confirmBtn = document.getElementById('skipConfirmBtn');
    var cancelBtn = document.getElementById('skipCancelBtn');

    // Close on overlay click
    skipModal.addEventListener('click', function(e) {
      if (e.target === skipModal) closeSkipModal();
    });

    // Reason chip selection
    reasonsContainer.addEventListener('click', function(e) {
      var chip = e.target.closest('.skip-reason-chip');
      if (!chip) return;
      haptic();

      // Toggle selection
      var wasSelected = chip.classList.contains('selected');
      reasonsContainer.querySelectorAll('.skip-reason-chip').forEach(function(c) { c.classList.remove('selected'); });
      if (!wasSelected) {
        chip.classList.add('selected');
        confirmBtn.disabled = false;
      } else {
        confirmBtn.disabled = true;
      }

      // Show note input for "other" or any reason
      var reason = chip.dataset.reason;
      if (reason === 'other') {
        noteInput.style.display = 'block';
        noteInput.placeholder = 'Describe why…';
        setTimeout(function() { noteInput.focus(); }, 150);
      } else {
        noteInput.style.display = 'block';
        noteInput.placeholder = 'Add a note (optional)…';
      }
    });

    // Confirm
    confirmBtn.addEventListener('click', function() {
      haptic();
      confirmSkip();
    });

    // Cancel
    cancelBtn.addEventListener('click', function() {
      closeSkipModal();
    });
  }

  function handleSaveSet() {
    if (pendingSetExIdx === null || pendingSetIdx === null) return;
    if (!appData.currentWorkout) return;

    var weight = parseFloat(domModalWeight.value) || 0;
    var reps = parseInt(domModalReps.value) || 0;
    var rpe = parseInt(domModalRpe.value) || 0;
    var notes = domModalNotes.value.trim();

    var ex = appData.currentWorkout.exercises[pendingSetExIdx];
    // Ensure array is long enough
    while (ex.sets.length <= pendingSetIdx) {
      ex.sets.push({ weight: 0, reps: 0, rpe: 0, notes: '' });
    }
    // Snapshot for undo
    var prevSnapshot = ex.sets[pendingSetIdx] ? JSON.parse(JSON.stringify(ex.sets[pendingSetIdx])) : null;

    ex.sets[pendingSetIdx] = {
      weight: weight,
      reps: reps,
      rpe: rpe,
      notes: notes
    };

    // Store undo info
    var undoInfo = { exIdx: pendingSetExIdx, setIdx: pendingSetIdx, prev: prevSnapshot };
    saveData();
    closeSetModal();
    renderWorkoutView();

    // Show toast with undo
    if (prevSnapshot && prevSnapshot.weight > 0) {
      showToast('Set updated · Undo', function() {
        appData.currentWorkout.exercises[undoInfo.exIdx].sets[undoInfo.setIdx] = undoInfo.prev;
        saveData();
        renderWorkoutView();
        showToast('Undone');
      });
    }

    // Auto-start rest timer if enabled and there are more sets to log
    if (timerAutoStart) {
      startTimer();
    }

    // Auto-advance to next unlogged set
    var exTemplate = programs[appData.currentWorkout.dayType][pendingSetExIdx];
    var totalSets = exTemplate.sets;
    var nextSet = pendingSetIdx + 1;
    var foundNext = false;

    // Look for next unlogged set in this exercise, then in following exercises
    for (var ei = pendingSetExIdx; ei < appData.currentWorkout.exercises.length && !foundNext; ei++) {
      var startS = (ei === pendingSetExIdx) ? nextSet : 0;
      var tSets = programs[appData.currentWorkout.dayType][ei].sets;
      for (var si = startS; si < tSets; si++) {
        var s = (appData.currentWorkout.exercises[ei].sets[si]);
        if (!s || !s.weight || !s.reps) {
          // Scroll to this exercise card
          setTimeout(function() {
            var card = document.querySelector('.exercise-card[data-ex="' + ei + '"]');
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            openSetModal(ei, si);
          }, 150);
          foundNext = true;
          return;
        }
      }
    }

    // All sets logged - show congrats toast
    var totalLogged = countLoggedSets();
    var totalSetsAll = countTotalSets();
    if (totalLogged >= totalSetsAll) {
      showToast('🎉 All sets logged! Ready to finish?');
    }
  }

  // ==================== WORKOUT HELPERS ====================

  function countLoggedSets() {
    if (!appData.currentWorkout) return 0;
    var count = 0;
    appData.currentWorkout.exercises.forEach(function(ex) {
      ex.sets.forEach(function(s) {
        if (s && s.weight > 0 && s.reps > 0) count++;
      });
    });
    return count;
  }

  function countTotalSets() {
    if (!appData.currentWorkout) return 0;
    var total = 0;
    appData.currentWorkout.exercises.forEach(function(ex, i) {
      total += programs[appData.currentWorkout.dayType][i].sets + (ex.extraSets || 0);
    });
    return total;
  }

  function getCurrentVolume() {
    if (!appData.currentWorkout) return 0;
    var allSets = [];
    appData.currentWorkout.exercises.forEach(function(ex) {
      ex.sets.forEach(function(s) {
        if (s) allSets.push(s);
      });
    });
    return calcVolume(allSets);
  }

  // ==================== START / FINISH WORKOUT ====================

  function startWorkout(dayType) {
    var exercises = programs[dayType].map(function(ex) {
      return { name: ex.name, sets: [] };
    });
    appData.currentWorkout = {
      date: todayStr(),
      startTime: formatTimeNow(),
      startTimestamp: Date.now(),
      dayType: dayType,
      exercises: exercises
    };
    saveData();
    renderWorkoutView();
    showToast('💪 ' + dayType + ' workout started!');
  }

  function finishWorkout() {
    if (!appData.currentWorkout) return;
    var logged = countLoggedSets();
    var total = countTotalSets();

    var volume = getCurrentVolume();

    showConfirm(
      '<h3>Finish Workout?</h3>' +
      (logged < total ? '<p style="color:#ffb74d;">⚠ ' + (total - logged) + ' sets still unlogged.</p>' : '<p>All ' + total + ' sets complete. Great work!</p>'),
      [
        {
          label: 'Cancel',
          cls: 'btn-cancel',
          callback: function() {}
        },
        {
          label: '✓ Finish',
          cls: logged < total ? 'btn-danger' : 'btn-save',
          callback: function() {
            doFinishWorkout();
          }
        }
      ]
    );
  }

  function doFinishWorkout() {
    if (!appData.currentWorkout) return;

    var cw = appData.currentWorkout;
    var allSets = [];
    cw.exercises.forEach(function(ex) {
      ex.sets.forEach(function(s) {
        if (s && s.weight > 0 && s.reps > 0) allSets.push(s);
      });
    });

    // Build exercises array with only logged sets
    var loggedExercises = cw.exercises.map(function(ex) {
      return {
        name: ex.name,
        sets: ex.sets.filter(function(s) { return s && s.weight > 0 && s.reps > 0; })
      };
    }).filter(function(ex) { return ex.sets.length > 0; });

    var workout = {
      id: Date.now(),
      date: cw.date,
      startTime: cw.startTime,
      endTime: formatTimeNow(),
      dayType: cw.dayType,
      exercises: loggedExercises,
      totalVolume: calcVolume(allSets),
      avgRpe: calcAvgRpe(allSets)
    };

    appData.workouts.push(workout);
    appData.currentWorkout = null;
    stopTimer();
    saveData();
    renderWorkoutView();
    showToast('✅ Workout saved! ' + workout.totalVolume.toLocaleString() + ' kg total');

    // Auto-backup every 5 workouts
    if (appData.workouts.length % 5 === 0) {
      setTimeout(function() {
        var backup = JSON.stringify({
          workouts: appData.workouts,
          nutrition: appData.nutrition,
          bodyweight: appData.bodyweight
        });
        var blob = new Blob([backup], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'tall-tender-backup-' + todayStr() + '.json';
        a.click();
        showToast('💾 Backup downloaded (every 5 workouts)');
      }, 1000);
    }
  }

  function cancelWorkout() {
    if (!appData.currentWorkout) return;
    var logged = countLoggedSets();
    showConfirm(
      '<h3>Cancel Workout?</h3>' +
      '<p>You\'ve logged <strong>' + logged + '</strong> sets. This data will be lost.</p>',
      [
        {
          label: 'Keep Working',
          cls: 'btn-save',
          callback: function() {}
        },
        {
          label: 'Discard',
          cls: 'btn-danger',
          callback: function() {
            appData.currentWorkout = null;
            stopTimer();
            saveData();
            renderWorkoutView();
            showToast('Workout discarded');
          }
        }
      ]
    );
  }

  // ==================== RENDER: WORKOUT VIEW ====================

  function renderWorkoutView() {
    // Clear previous clock interval
    if (clockInterval) clearInterval(clockInterval);

    var html = '';

    // Onboarding for new users
    var hasSeenOnboarding = localStorage.getItem('tallTenderOnboarded');
    if (!hasSeenOnboarding && !appData.currentWorkout && appData.workouts.length === 0) {
      html += '<div class="onboard-card" id="onboardCard" style="margin-bottom:16px;padding:16px;background:#14191f;border-radius:14px;border:1px solid #2d5a3a;">';
      html += '<div style="font-size:18px;font-weight:700;margin-bottom:8px;">👋 Welcome to Progression</div>';
      html += '<p style="font-size:12px;color:#a0b0c0;line-height:1.6;margin:0;">Pick a workout below, tap the set circles to log your lifts, and track nutrition in the 🍽️ tab. Your data stays on this device. Auto-backups save every 5 workouts.</p>';
      html += '<button id="btnDismissOnboard" style="margin-top:10px;padding:8px 16px;background:#1e3a1e;border:1px solid #4caf50;border-radius:8px;color:#4caf50;font-size:13px;font-weight:600;cursor:pointer;">Got it</button>';
      html += '</div>';
    }

    if (!appData.currentWorkout) {
      // --- No active workout: show day type selector ---
      html += '<div class="sticky-bar">';
      html += '<div class="live-clock">';
      html += '<div class="time" id="liveClock">' + formatTimeNow() + '</div>';
      html += '<div class="date">' + formatDate(todayStr()) + '</div>';
      html += '</div>';
      // Meal reminder if nothing logged today
      html += renderMealReminder();
      html += '</div>'; // close sticky-bar
      html += '<p style="text-align:center;color:#7e8d9e;margin-bottom:16px;">Select your workout for today:</p>';
      html += '<div class="day-type-selector">';

      var dayKeys = Object.keys(programs);
      dayKeys.forEach(function(key) {
        html += '<button class="day-type-btn" data-day="' + key + '">' + key + '</button>';
      });

      html += '</div>';
    } else {
      // --- Active workout ---
      var cw = appData.currentWorkout;
      var exTemplates = programs[cw.dayType];
      var totalSetsAll = countTotalSets();
      var loggedSets = countLoggedSets();
      var volume = getCurrentVolume();

      // Header with clock (sticky)
      html += '<div class="sticky-bar">';
      html += '<div class="live-clock">';
      html += '<div class="time" id="liveClock">' + formatTimeNow() + '</div>';
      html += '<div class="date">' + formatDate(cw.date) + '</div>';
      html += '<span class="day-type-badge">' + cw.dayType + '</span>';
      html += '</div>';
      // Meal reminder if nothing logged today
      html += renderMealReminder();
      html += '</div>'; // close sticky-bar

      // Exercises
      cw.exercises.forEach(function(ex, exIdx) {
        var template = exTemplates[exIdx];
        var programmedSets = template.sets;
        var extraSets = ex.extraSets || 0;
        var displaySets = programmedSets + extraSets;
        var loggedCount = 0;
        ex.sets.forEach(function(s) { if (s && s.weight > 0 && s.reps > 0) loggedCount++; });
        var allDone = loggedCount >= programmedSets;
        var hasLogs = loggedCount > 0;
        var wasSkipped = !!(ex.skipReason);

        html += '<div class="exercise-card' +
          (allDone ? ' all-done' : '') +
          (hasLogs && !allDone ? ' has-logs' : '') +
          (wasSkipped ? ' skipped' : '') +
          '" data-ex="' + exIdx + '">';
        html += '<div class="ex-header">';
        html += '<span class="ex-name">' + ex.name + '</span>';
        html += '<span class="ex-target">' + programmedSets + ' × ' + template.reps + (extraSets > 0 ? ' <span style="color:#ffb74d;font-size:10px;">+' + extraSets + '</span>' : '') + '</span>';
        html += renderSparkline(getExerciseProgression(ex.name, 6));
        html += '</div>';
        var cue = template.cue || template.note;
        if (cue) {
          html += '<div class="ex-permanent-note">' + cue + '</div>';
        }
        var lastLog = getLastLog(ex.name);
        if (lastLog) {
          html += '<div class="ex-history">Last: ' + lastLog + '</div>';
        }
        // Show skip reason tag if exercise was skipped
        if (wasSkipped) {
          var reasonLabels = { injury: '🩹 Injury / pain', fatigue: '😴 Fatigue', time: '⏱️ Short on time', equipment: '🔧 Equipment', other: '💬 Other' };
          var reasonLabel = reasonLabels[ex.skipReason] || ex.skipReason;
          html += '<div class="skip-tag">' + reasonLabel + (ex.skipNote ? ': ' + ex.skipNote : '') + '</div>';
        }
        // Skip exercise button (if not all done and not already skipped)
        if (!allDone && !wasSkipped) {
          html += '<button class="btn-skip-ex" data-ex="' + exIdx + '" style="font-size:10px;padding:3px 8px;background:none;border:1px solid #3a2a2a;border-radius:6px;color:#7a5a5a;cursor:pointer;margin-bottom:4px;">Skip Exercise</button>';
        }
        html += '<div class="set-circles">';

        for (var si = 0; si < displaySets; si++) {
          var setData = ex.sets[si];
          var logged = setData && setData.weight > 0 && setData.reps > 0;
          var isExtra = si >= programmedSets;
          var brief = '';
          if (logged) {
            brief = setData.weight + 'kg' + (setData.rpe ? ' @' + setData.rpe : '');
          }
          // Find next unlogged set for highlighting (across all exercises, including extras)
          var isCurrent = false;
          if (!logged) {
            for (var ei2 = 0; ei2 < cw.exercises.length && !isCurrent; ei2++) {
              var progSets2 = programs[cw.dayType][ei2].sets + (cw.exercises[ei2].extraSets || 0);
              for (var si2 = 0; si2 < progSets2; si2++) {
                var sd2 = cw.exercises[ei2].sets[si2];
                if (!sd2 || !sd2.weight || !sd2.reps) {
                  if (ei2 === exIdx && si2 === si) isCurrent = true;
                  break;
                }
              }
              if (isCurrent) break;
            }
          }

          html += '<span class="set-circle' +
            (logged ? ' logged' : '') +
            (isCurrent ? ' current-set' : '') +
            (isExtra ? ' extra-set' : '') +
            '" data-ex="' + exIdx + '" data-set="' + si + '"' +
            (isExtra ? ' data-extra="1"' : '') + '>';
          if (isExtra && !logged) {
            html += '<span class="set-del">×</span>';
          }
          html += '<span class="set-num">' + (isExtra ? '+' : '') + (si + 1) + '</span>';
          if (brief) {
            html += '<span class="set-brief">' + brief + '<span class="set-dup">+</span></span>';
          }
          html += '</span>';
        }

        // Add set button
        html += '<button class="btn-add-set" data-ex="' + exIdx + '" title="Add an extra set">+</button>';

        html += '</div></div>';

        // Progression coach (after exercise card)
        if (isProgressionCoachEnabled() && allDone) {
          html += renderProgressionCoach(ex.name, cw.dayType);
        }
      });

      // Progress footer
      html += '<div class="workout-progress">';
      html += '<div class="stat"><div class="stat-val">' + volume.toLocaleString() + ' kg</div><div class="stat-label">Volume</div></div>';
      html += '<div class="stat"><div class="stat-val">' + loggedSets + ' / ' + totalSetsAll + '</div><div class="stat-label">Sets Done</div></div>';
      html += '<div class="stat"><div class="stat-val"><span id="elapsedTime">0:00</span></div><div class="stat-label">Elapsed</div></div>';
      html += '</div>';

      // Rest timer bar
      html += '<div class="rest-timer-bar" id="restTimerBar">';
      html += '<div class="timer-presets">';
      [30, 60, 90, 120, 180].forEach(function(sec) {
        html += '<button class="preset-btn' + (!timerRunning && timerDuration === sec ? ' active-preset' : '') + '" data-seconds="' + sec + '">' + sec + 's</button>';
      });
      html += '</div>';
      html += '<div class="timer-main">';
      html += '<span class="timer-display">' + formatTimer(timerRemaining) + '</span>';
      html += '<input type="number" class="timer-custom" id="timerCustom" placeholder="sec" value="' + timerDuration + '" min="5" max="600" step="5">';
      html += '<button class="timer-action-btn" id="timerActionBtn">' + (timerRunning ? 'Reset' : 'Start') + '</button>';
      html += '<button class="timer-action-btn" id="timer30sBtn" style="font-size:11px;' + (timerRunning ? '' : 'display:none;') + '">+30s</button>';
      html += '<button class="timer-action-btn" id="timerSkipBtn" style="font-size:11px;background:#2a1a1a;border-color:#5a3a3a;color:#c96a6a;">Skip</button>';
      html += '</div>';
      html += '<div class="timer-auto-toggle">';
      html += '<label for="timerAutoCheck">Auto-start after set</label>';
      html += '<input type="checkbox" id="timerAutoCheck"' + (timerAutoStart ? ' checked' : '') + '>';
      html += '</div>';
      html += '</div>';

      // Cardio checkbox
      var cardioDone = !!(appData.cardioLog && appData.cardioLog[todayStr()]);
      html += '<div class="cardio-check" style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:#14191f;border-radius:12px;margin-bottom:10px;cursor:pointer;" id="cardioCheck">';
      html += '<input type="checkbox" id="cardioCheckbox" style="accent-color:#4caf50;width:20px;height:20px;cursor:pointer;"' + (cardioDone ? ' checked' : '') + '>';
      html += '<label for="cardioCheckbox" style="font-size:14px;font-weight:500;cursor:pointer;">Cardio done today</label>';
      html += '</div>';

      html += '<button class="btn-finish" id="btnFinish">✓ Finish Workout</button>';
      html += '<button style="width:100%;padding:12px;background:none;border:1px solid #3a2a2a;border-radius:14px;color:#7a5a5a;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:8px;" id="btnCancelWorkout">✕ Cancel Workout</button>';
    }

    domWorkoutContent.innerHTML = html;

    // Onboarding dismiss
    var btnDismiss = document.getElementById('btnDismissOnboard');
    if (btnDismiss) btnDismiss.addEventListener('click', function() {
      localStorage.setItem('tallTenderOnboarded', '1');
      var card = document.getElementById('onboardCard');
      if (card) card.style.display = 'none';
    });

    // Meal reminder — tap to switch to nutrition tab
    var mealReminder = domWorkoutContent.querySelector('.meal-reminder');
    if (mealReminder) mealReminder.addEventListener('click', function() {
      haptic();
      switchView('nutrition');
    });

    // Attach events
    if (!appData.currentWorkout) {
      // Day type selector
      domWorkoutContent.querySelectorAll('.day-type-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          haptic();
          var dayType = this.dataset.day;
          showConfirm(
            '<h3>Start ' + dayType + '?</h3><p>Begin logging your ' + dayType.toLowerCase() + ' workout.</p>',
            [
              { label: 'Cancel', cls: 'btn-cancel', callback: function() {} },
              { label: '✓ Start', cls: 'btn-save', callback: function() { startWorkout(dayType); } }
            ]
          );
        });
      });
      // Start live clock
      clockInterval = setInterval(function() {
        var el = document.getElementById('liveClock');
        if (el) el.textContent = formatTimeNow();
      }, 1000);
    } else {
      // Set circle clicks
      // Set circle dup tap — duplicate to next available set
      domWorkoutContent.querySelectorAll('.set-dup').forEach(function(dup) {
        dup.addEventListener('click', function(e) {
          e.stopPropagation();
          haptic();
          var circle = this.closest('.set-circle');
          var exIdx = parseInt(circle.dataset.ex);
          var setIdx = parseInt(circle.dataset.set);
          var ex = appData.currentWorkout.exercises[exIdx];
          var src = ex.sets[setIdx];
          if (!src) return;
          // Find next unlogged set in this exercise (including extra sets)
          var totalSets = programs[appData.currentWorkout.dayType][exIdx].sets + (ex.extraSets || 0);
          for (var si = setIdx + 1; si < totalSets; si++) {
            if (!ex.sets[si] || !ex.sets[si].reps) {
              ex.sets[si] = { weight: src.weight, reps: src.reps, rpe: src.rpe, notes: src.notes || '' };
              saveData();
              renderWorkoutView();
              showToast('Duplicated set ' + (si + 1) + ' (' + src.weight + 'kg × ' + src.reps + ')');
              // Auto-start timer
              if (timerAutoStart) startTimer();
              return;
            }
          }
          showToast('No empty sets left in this exercise');
        });
      });
      domWorkoutContent.querySelectorAll('.set-circle').forEach(function(el) {
        el.addEventListener('click', function() {
          var exIdx = parseInt(this.dataset.ex);
          var setIdx = parseInt(this.dataset.set);
          openSetModal(exIdx, setIdx);
        });
      });
      // Finish button
      var btnFinish = document.getElementById('btnFinish');
      if (btnFinish) {
        btnFinish.addEventListener('click', function() {
          haptic();
          finishWorkout();
        });
      }
      // Skip exercise buttons — open skip reason modal
      domWorkoutContent.querySelectorAll('.btn-skip-ex').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          haptic();
          var exIdx = parseInt(this.dataset.ex);
          openSkipModal(exIdx);
        });
      });
      // Add set buttons
      domWorkoutContent.querySelectorAll('.btn-add-set').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          haptic();
          var exIdx = parseInt(this.dataset.ex);
          var ex = appData.currentWorkout.exercises[exIdx];
          ex.extraSets = (ex.extraSets || 0) + 1;
          saveData();
          renderWorkoutView();
          showToast('Extra set added to ' + ex.name);
        });
      });
      // Extra set circles — tap to log, × to remove
      domWorkoutContent.querySelectorAll('.set-circle.extra-set').forEach(function(circle) {
        circle.addEventListener('click', function(e) {
          // If tapping the delete × on an unlogged extra set, remove it
          if (e.target.closest('.set-del')) {
            e.stopPropagation();
            haptic();
            var exIdx = parseInt(this.dataset.ex);
            var setIdx = parseInt(this.dataset.set);
            var ex = appData.currentWorkout.exercises[exIdx];
            var sd = ex.sets[setIdx];
            // Only allow removal if unlogged
            if (!sd || !sd.weight || !sd.reps) {
              ex.sets.splice(setIdx, 1);
              ex.extraSets = Math.max(0, (ex.extraSets || 1) - 1);
              saveData();
              renderWorkoutView();
              showToast('Extra set removed');
            }
          }
        });
      });
      // Cancel button
      var btnCancel = document.getElementById('btnCancelWorkout');
      if (btnCancel) {
        btnCancel.addEventListener('click', function() {
          haptic();
          cancelWorkout();
        });
      }
      // Timer - preset buttons
      domWorkoutContent.querySelectorAll('.preset-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          haptic();
          var sec = parseInt(this.dataset.seconds);
          startTimer(sec);
        });
      });
      // Timer - action button (Start/Reset)
      var timerActionBtn = document.getElementById('timerActionBtn');
      if (timerActionBtn) {
        timerActionBtn.addEventListener('click', function() { haptic(); toggleTimer(); });
      }
      // Timer - custom input
      var timerCustom = document.getElementById('timerCustom');
      if (timerCustom) {
        timerCustom.addEventListener('change', function() {
          var val = parseInt(this.value) || 60;
          if (val < 5) val = 5;
          if (val > 600) val = 600;
          this.value = val;
          timerDuration = val;
          timerRemaining = val;
          saveTimerSettings();
          updateTimerUI();
        });
      }
      // Timer - auto-start toggle
      var timerAutoCheck = document.getElementById('timerAutoCheck');
      if (timerAutoCheck) {
        timerAutoCheck.addEventListener('change', function() {
          timerAutoStart = this.checked;
          saveTimerSettings();
        });
      }
      // Timer - skip button (stop and reset)
      var timerSkipBtn = document.getElementById('timerSkipBtn');
      if (timerSkipBtn) {
        timerSkipBtn.addEventListener('click', function() {
          haptic();
          if (timerRunning) stopTimer();
          timerRemaining = 0;
          updateTimerUI();
        });
      }
      // Timer - +30s button
      var timer30sBtn = document.getElementById('timer30sBtn');
      if (timer30sBtn) {
        timer30sBtn.addEventListener('click', function() {
          haptic();
          timerRemaining += 30;
          updateTimerUI();
        });
      }
      // Start live clock + elapsed timer
      clockInterval = setInterval(function() {
        var el = document.getElementById('liveClock');
        if (el) el.textContent = formatTimeNow();
        updateElapsed();
      }, 1000);
    }

    // Cardio checkbox handler (works for both states)
    var cardioCb = document.getElementById('cardioCheckbox');
    var cardioDiv = document.getElementById('cardioCheck');
    if (cardioCb && cardioDiv) {
      cardioDiv.addEventListener('click', function(e) {
        if (e.target === cardioCb) return; // let checkbox toggle naturally
        cardioCb.checked = !cardioCb.checked;
        toggleCardio(cardioCb.checked);
      });
      cardioCb.addEventListener('change', function() {
        toggleCardio(cardioCb.checked);
      });
    }
  }

  function toggleCardio(done) {
    if (!appData.cardioLog) appData.cardioLog = {};
    appData.cardioLog[todayStr()] = done;
    saveData();
  }

  // ==================== RENDER: ARCHIVE VIEW ====================

  function renderArchiveView() {
    var workouts = appData.workouts.slice().reverse(); // newest first
    var html = '';

    // Collect unique exercise names
    var exNames = {};
    workouts.forEach(function(w) {
      w.exercises.forEach(function(ex) {
        exNames[ex.name] = true;
      });
    });
    var exNameList = Object.keys(exNames).sort();

    // Controls
    html += '<div class="archive-controls">';
    html += '<select id="archiveFilter">';
    html += '<option value="">All exercises</option>';
    exNameList.forEach(function(name) {
      html += '<option value="' + name.replace(/"/g, '&quot;') + '">' + name + '</option>';
    });
    html += '</select>';
    html += '</div>';

    // Export / Import buttons
    html += '<div class="io-buttons">';
    html += '<button class="io-btn" id="btnExport">📥 Export JSON</button>';
    html += '<button class="io-btn" id="btnImport">📤 Import JSON</button>';
    html += '</div>';

    // Total summary
    var totalVolumeAll = workouts.reduce(function(sum, w) { return sum + w.totalVolume; }, 0);
    html += '<p style="font-size:13px;color:#7e8d9e;margin-bottom:12px;">';
    html += '<strong>' + workouts.length + '</strong> workouts · ';
    html += '<strong>' + totalVolumeAll.toLocaleString() + ' kg</strong> total volume';
    html += '</p>';

    if (workouts.length === 0) {
      html += '<div class="archive-empty">';
      html += '<span class="empty-icon">📋</span>';
      html += '<h3 style="color:#7e8d9e;">No workouts yet</h3>';
      html += '<p>Complete a workout to see it here.</p>';
      html += '</div>';
    } else {
      workouts.forEach(function(w, idx) {
        html += '<div class="archive-card" data-idx="' + idx + '">';
        html += '<div class="arc-top">';
        html += '<span class="arc-date">' + formatDate(w.date) + '</span>';
        html += '<span class="arc-type">' + w.dayType + '</span>';
        html += '</div>';
        html += '<div class="arc-meta">';
        html += '<span>' + w.startTime + ' → ' + w.endTime + '</span>';
        html += '<span>' + w.totalVolume.toLocaleString() + ' kg</span>';
        html += '<span>RPE ' + w.avgRpe + '</span>';
        html += '</div>';
        // Expanded detail
        html += '<div class="arc-detail">';
        w.exercises.forEach(function(ex) {
          html += '<div class="arc-exercise">';
          html += '<div class="arc-ex-name">' + ex.name + '</div>';
          html += '<div class="arc-sets">';
          ex.sets.forEach(function(s, si) {
            html += '<span>Set ' + (si + 1) + ': ' + s.weight + 'kg × ' + s.reps + ' @' + s.rpe + '</span>';
            if (s.notes) html += '<span style="color:#5a7a6a;font-style:italic;">"' + s.notes + '"</span>';
          });
          html += '</div></div>';
        });
        html += '</div>';
        html += '</div>';
      });
    }

    domArchiveContent.innerHTML = html;

    // Attach events
    // Expand/collapse archive cards
    domArchiveContent.querySelectorAll('.archive-card').forEach(function(card) {
      card.addEventListener('click', function(e) {
        // Don't toggle if clicking buttons inside (none yet but future-proof)
        card.classList.toggle('expanded');
        haptic();
      });
    });

    // Filter
    var filterSelect = domArchiveContent.querySelector('#archiveFilter');
    if (filterSelect) {
      filterSelect.addEventListener('change', function() {
        filterArchiveCards(this.value);
      });
      // Also prevent card clicks from firing when interacting with filter
      filterSelect.addEventListener('click', function(e) { e.stopPropagation(); });
    }

    // Export
    var btnExport = domArchiveContent.querySelector('#btnExport');
    if (btnExport) {
      btnExport.addEventListener('click', function(e) {
        e.stopPropagation();
        haptic();
        exportData();
      });
    }

    // Import
    var btnImport = domArchiveContent.querySelector('#btnImport');
    if (btnImport) {
      btnImport.addEventListener('click', function(e) {
        e.stopPropagation();
        haptic();
        domImportInput.click();
      });
    }
  }

  function filterArchiveCards(exName) {
    var cards = domArchiveContent.querySelectorAll('.archive-card');
    if (!exName) {
      cards.forEach(function(c) { c.style.display = ''; });
      return;
    }
    var workouts = appData.workouts.slice().reverse();
    cards.forEach(function(card, idx) {
      var w = workouts[idx];
      if (!w) { card.style.display = ''; return; }
      var hasEx = w.exercises.some(function(ex) { return ex.name === exName; });
      card.style.display = hasEx ? '' : 'none';
    });
  }

  // ==================== EXPORT / IMPORT ====================

  function exportData() {
    var json = JSON.stringify(appData, null, 2);
    var blob = new Blob([json], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'tall-tender-backup-' + todayStr() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('📥 Data exported!');
  }

  function importData(jsonStr) {
    try {
      var imported = JSON.parse(jsonStr);
      if (!imported.workouts || !Array.isArray(imported.workouts)) {
        throw new Error('Invalid format');
      }
      showConfirm(
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
              appData = imported;
              if (!appData.currentWorkout) appData.currentWorkout = null;
              saveData();
              renderWorkoutView();
              renderArchiveView();
              renderStatsView();
              showToast('📤 ' + imported.workouts.length + ' workouts imported!');
            }
          }
        ]
      );
    } catch (e) {
      showToast('❌ Invalid file format');
    }
  }

  // ==================== RENDER: STATS VIEW ====================

  function renderStatsView() {
    var workouts = appData.workouts;
    var html = '';

    if (workouts.length === 0) {
      html += '<div class="archive-empty">';
      html += '<span class="empty-icon">📊</span>';
      html += '<h3 style="color:#7e8d9e;">No data yet</h3>';
      html += '<p>Complete workouts to see your stats.</p>';
      html += '</div>';
      domStatsContent.innerHTML = html;
      return;
    }

    // ---- Aggregate metrics ----
    var totalVolumeAll = workouts.reduce(function(s, w) { return s + w.totalVolume; }, 0);
    var totalSetsAll = workouts.reduce(function(s, w) {
      return s + w.exercises.reduce(function(ss, ex) { return ss + ex.sets.length; }, 0);
    }, 0);

    // Most frequent day type
    var dayCounts = {};
    workouts.forEach(function(w) {
      dayCounts[w.dayType] = (dayCounts[w.dayType] || 0) + 1;
    });
    var mostFreqDay = '';
    var mostFreqCount = 0;
    Object.keys(dayCounts).forEach(function(k) {
      if (dayCounts[k] > mostFreqCount) {
        mostFreqCount = dayCounts[k];
        mostFreqDay = k;
      }
    });

    // Current streak (weeks in a row)
    var streak = calcStreak(workouts);

    // ---- Metric cards ----
    html += '<div class="stats-grid">';
    html += '<div class="metric-card"><div class="metric-val">' + workouts.length + '</div><div class="metric-label">Workouts</div></div>';
    html += '<div class="metric-card"><div class="metric-val">' + (totalVolumeAll / 1000).toFixed(1) + 'k</div><div class="metric-label">Total Volume (kg)</div></div>';
    html += '<div class="metric-card"><div class="metric-val">' + totalSetsAll + '</div><div class="metric-label">Total Sets</div></div>';
    html += '<div class="metric-card"><div class="metric-val">' + mostFreqDay + '</div><div class="metric-label">Top Day Type</div></div>';
    html += '<div class="metric-card"><div class="metric-val">' + streak + '</div><div class="metric-label">Week Streak</div></div>';
    html += '</div>';

    // ---- Most Improved Exercise ----
    var improvements = [];
    Object.keys(exStats).forEach(function(name) {
      var weights = [];
      for (var wi = workouts.length - 1; wi >= 0 && weights.length < 8; wi--) {
        for (var j = 0; j < workouts[wi].exercises.length; j++) {
          if (workouts[wi].exercises[j].name === name && workouts[wi].exercises[j].sets[0] && workouts[wi].exercises[j].sets[0].weight > 0) {
            weights.push(workouts[wi].exercises[j].sets[0].weight);
            break;
          }
        }
      }
      if (weights.length >= 4) {
        var firstAvg = weights.slice(0, 3).reduce(function(a,b){return a+b;},0)/Math.min(3,weights.length);
        var lastAvg = weights.slice(-3).reduce(function(a,b){return a+b;},0)/3;
        if (firstAvg > 0) improvements.push({ name: name, pct: Math.round((lastAvg/firstAvg - 1)*100), first: Math.round(firstAvg), last: Math.round(lastAvg) });
      }
    });
    improvements.sort(function(a,b){ return b.pct - a.pct; });
    if (improvements.length > 0) {
      var best = improvements[0];
      html += '<div style="margin:8px 0;padding:12px;background:#14191f;border-radius:12px;border-left:3px solid ' + (best.pct > 0 ? '#4caf50' : '#ef5350') + ';">';
      html += '<div style="font-size:11px;color:#7e8d9e;margin-bottom:2px;">Most Improved</div>';
      html += '<div style="font-size:14px;font-weight:600;">' + best.name + ' <span style="color:' + (best.pct > 0 ? '#4caf50' : '#ef5350') + ';">' + (best.pct > 0 ? '+' : '') + best.pct + '%</span></div>';
      html += '<div style="font-size:10px;color:#5a6a7a;">' + best.first + 'kg → ' + best.last + 'kg average top set</div>';
      html += '</div>';
    }

    // ---- Weekly volume trend ----
    var weekVolumes = [];
    var weekLabels = [];
    for (var wi = Math.max(0, workouts.length - 28); wi < workouts.length; wi++) {
      var wd = new Date(workouts[wi].startedAt || workouts[wi].completedAt || 0);
      var wk = wd.getFullYear() + '-W' + ('0' + Math.floor((wd - new Date(wd.getFullYear(),0,1)) / 604800000)).slice(-2);
      var found = false;
      for (var v = 0; v < weekVolumes.length; v++) {
        if (weekLabels[v] === wk) { weekVolumes[v] += workouts[wi].totalVolume || 0; found = true; break; }
      }
      if (!found) { weekLabels.push(wk); weekVolumes.push(workouts[wi].totalVolume || 0); }
    }
    if (weekVolumes.length > 1) {
      html += '<div style="margin:8px 0;font-size:11px;color:#7e8d9e;">Weekly Volume</div>';
      html += '<div style="display:flex;align-items:end;gap:4px;height:40px;">';
      var maxVol = Math.max.apply(null, weekVolumes);
      weekVolumes.forEach(function(v) {
        var h = Math.max(4, (v / maxVol) * 40);
        html += '<div style="flex:1;background:#4caf50;border-radius:3px 3px 0 0;height:' + h + 'px;opacity:0.6;" title="' + Math.round(v/1000) + 'k kg"></div>';
      });
      html += '</div>';
    }

    // ---- Per-exercise stats ----
    html += '<div class="section-title">Exercise Stats</div>';

    // Collect all sets by exercise
    var exStats = {}; // name -> { allSets: [], bestWeight: 0, bestVolume: 0, totalSets: 0, rpeSum: 0, rpeCount: 0 }
    workouts.forEach(function(w) {
      w.exercises.forEach(function(ex) {
        if (!exStats[ex.name]) {
          exStats[ex.name] = { allSets: [], bestWeight: 0, bestVolume: 0, totalSets: 0, rpeSum: 0, rpeCount: 0 };
        }
        var st = exStats[ex.name];
        ex.sets.forEach(function(s) {
          st.allSets.push(s);
          st.totalSets++;
          if (s.weight > st.bestWeight) st.bestWeight = s.weight;
          var setVol = s.weight * s.reps;
          if (setVol > st.bestVolume) st.bestVolume = setVol;
          if (s.rpe > 0) { st.rpeSum += s.rpe; st.rpeCount++; }
        });
      });
    });

    // Calculate best 1RM and sort
    var exList = Object.keys(exStats).map(function(name) {
      var st = exStats[name];
      var best1RM = 0;
      st.allSets.forEach(function(s) {
        var rm = calc1RM(s.weight, s.reps);
        if (rm > best1RM) best1RM = rm;
      });
      return {
        name: name,
        best1RM: best1RM,
        bestWeight: st.bestWeight,
        bestVolume: st.bestVolume,
        totalSets: st.totalSets,
        avgRpe: st.rpeCount > 0 ? Math.round((st.rpeSum / st.rpeCount) * 10) / 10 : 0
      };
    });

    exList.sort(function(a, b) { return b.best1RM - a.best1RM; });

    exList.forEach(function(ex) {
      html += '<div class="ex-stat-row">';
      html += '<div class="ex-stat-name">' + ex.name + '</div>';
      html += '<div class="ex-stat-nums">';
      html += '<span class="highlight">1RM: ' + ex.best1RM + ' kg</span>';
      html += '<span>Best: ' + ex.bestWeight + ' kg</span>';
      html += '<span>Vol: ' + ex.bestVolume.toLocaleString() + ' kg</span>';
      html += '<span>' + ex.totalSets + ' sets</span>';
      html += '<span>Avg RPE: ' + ex.avgRpe + '</span>';
      html += '</div></div>';
    });

    // ---- Weekly volume chart ----
    html += '<div class="section-title">Weekly Volume (Last 8 Weeks)</div>';

    var weekVolumes = {};
    workouts.forEach(function(w) {
      var wk = getWeekKey(w.date);
      weekVolumes[wk] = (weekVolumes[wk] || 0) + w.totalVolume;
    });

    var weeks = Object.keys(weekVolumes).sort();
    // Take last 8
    if (weeks.length > 8) weeks = weeks.slice(-8);

    if (weeks.length === 0) {
      html += '<div class="chart-empty">No data to chart yet.</div>';
    } else {
      var maxVol = Math.max.apply(null, weeks.map(function(w) { return weekVolumes[w]; }));
      if (maxVol === 0) maxVol = 1;

      html += '<div class="chart-container"><div class="chart-bars">';
      weeks.forEach(function(wk) {
        var vol = weekVolumes[wk];
        var pct = Math.round((vol / maxVol) * 100);
        if (pct < 3) pct = 3; // minimum visible bar
        var label = wk.replace('-W', ' W');
        html += '<div class="chart-bar-wrap">';
        html += '<div class="chart-bar-val">' + (vol / 1000).toFixed(1) + 'k</div>';
        html += '<div class="chart-bar" style="height:' + pct + '%" title="' + wk + ': ' + vol.toLocaleString() + ' kg"></div>';
        html += '<div class="chart-bar-label">' + label + '</div>';
        html += '</div>';
      });
      html += '</div></div>';
    }

    domStatsContent.innerHTML = html;
  }

  function calcStreak(workouts) {
    if (workouts.length === 0) return 0;
    // Get unique weeks that have at least one workout, sorted descending
    var trainedWeeks = {};
    workouts.forEach(function(w) {
      trainedWeeks[getWeekKey(w.date)] = true;
    });
    var weeks = Object.keys(trainedWeeks).sort().reverse();
    if (weeks.length === 0) return 0;

    // Check consecutive weeks backwards from the most recent
    var streak = 1;
    for (var i = 1; i < weeks.length; i++) {
      // Parse week, check if previous week is consecutive
      var parts = weeks[i - 1].split('-W');
      var yr = parseInt(parts[0]);
      var wk = parseInt(parts[1]);
      // Get previous week
      var prevYr = yr;
      var prevWk = wk - 1;
      if (prevWk <= 0) {
        prevYr--;
        // Weeks in year: 52 or 53
        prevWk = 52;
      }
      var prevKey = prevYr + '-W' + (prevWk < 10 ? '0' : '') + prevWk;
      if (trainedWeeks[prevKey]) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  // ==================== SETTINGS VIEW ====================

  function renderSettingsView() {
    var html = '';

    // Profile selector
    html += '<div style="margin-bottom:20px;padding:14px;background:#14191f;border-radius:12px;border:1px solid #2a333d;">';
    html += '<div style="font-size:12px;font-weight:600;color:#7e8d9e;margin-bottom:8px;">Profile</div>';
    html += '<div style="display:flex;gap:8px;align-items:center;">';
    html += '<input type="text" id="profileNameInput" value="' + PROFILE.replace(/"/g, '&quot;') + '" placeholder="Profile name" style="flex:1;padding:10px 12px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:14px;outline:none;">';
    html += '<button class="prog-btn add" id="btnSwitchProfile" style="padding:10px 16px;white-space:nowrap;">Switch</button>';
    html += '<button class="prog-btn danger" id="btnDeleteProfile" style="padding:10px 12px;white-space:nowrap;font-size:11px;">Delete</button>';
    html += '</div>';
    html += '<p style="font-size:10px;color:#5a6a5a;margin-top:6px;">Each profile has separate workouts, foods, and goals. Settings (API key, FatSecret URL) are shared.</p>';
    html += '</div>';

    // Archive link
    var workoutCount = appData.workouts.length;
    var totalVol = appData.workouts.reduce(function(s, w) { return s + w.totalVolume; }, 0);
    html += '<button class="btn-new-program" id="btnViewArchive" style="margin-bottom:20px;">📋 Workout Archive (' + workoutCount + ' workouts, ' + (totalVol / 1000).toFixed(1) + 'k kg)</button>';

    html += '<button class="btn-new-program" id="btnNewProgram">+ New Program</button>';

    var progKeys = Object.keys(programs).sort(function(a, b) {
      // Built-in programs first, then alphabetical
      var aBuiltin = BUILTIN_PROGRAMS.hasOwnProperty(a);
      var bBuiltin = BUILTIN_PROGRAMS.hasOwnProperty(b);
      if (aBuiltin && !bBuiltin) return -1;
      if (!aBuiltin && bBuiltin) return 1;
      return a.localeCompare(b);
    });

    progKeys.forEach(function(progName) {
      var exList = programs[progName];
      var isBuiltin = BUILTIN_PROGRAMS.hasOwnProperty(progName);
      html += '<div class="program-card" data-program="' + progName.replace(/"/g, '&quot;') + '">';
      html += '<div class="prog-top">';
      html += '<span class="prog-name">' + progName + (isBuiltin ? ' <span style="font-size:10px;color:#5a7a6a;">(built-in)</span>' : '') + '</span>';
      html += '<span class="prog-count">' + exList.length + ' exercises</span>';
      html += '</div>';
      html += '<div class="prog-detail">';
      exList.forEach(function(ex, exIdx) {
        html += '<div class="prog-ex-item">';
        html += '<div class="ex-info"><span class="ex-name">' + ex.name + '</span><br><span class="ex-params">' + ex.sets + ' sets × ' + ex.reps + (ex.note ? '  ·  <span style="color:#5a7a6a;">' + ex.note + '</span>' : '') + '</span></div>';
        html += '<div style="display:flex;gap:4px;align-items:center;">';
        html += '<button class="ex-reorder ex-up" data-program="' + progName.replace(/"/g, '&quot;') + '" data-exidx="' + exIdx + '" style="background:none;border:none;color:#7e8d9e;font-size:16px;cursor:pointer;padding:4px 6px;">▲</button>';
        html += '<button class="ex-reorder ex-down" data-program="' + progName.replace(/"/g, '&quot;') + '" data-exidx="' + exIdx + '" style="background:none;border:none;color:#7e8d9e;font-size:16px;cursor:pointer;padding:4px 6px;">▼</button>';
        html += '<button class="ex-del" data-program="' + progName.replace(/"/g, '&quot;') + '" data-exidx="' + exIdx + '">×</button>';
        html += '</div>';
        html += '</div>';
      });
      html += '<div class="prog-actions">';
      html += '<button class="prog-btn add" data-program="' + progName.replace(/"/g, '&quot;') + '" data-action="add-exercise">+ Exercise</button>';
      html += '<button class="prog-btn danger" data-program="' + progName.replace(/"/g, '&quot;') + '" data-action="delete-program">Delete</button>';
      html += '</div>';
      html += '</div>';
      html += '</div>';
    });

    // Nutrition goals section
    var goals = loadGoals();
    html += '<div style="margin-top:28px;padding-top:20px;border-top:1px solid #2a333d;">';
    // Goal wizard
    html += '<div style="margin-bottom:12px;padding:12px;background:#14191f;border-radius:10px;border:1px solid #2a333d;">';
    html += '<div style="font-size:12px;font-weight:600;color:#7e8d9e;margin-bottom:8px;">Macro Goal Wizard</div>';
    html += '<div style="display:flex;gap:6px;align-items:end;flex-wrap:wrap;">';
    html += '<div style="flex:1;min-width:80px;"><label style="font-size:10px;color:#7e8d9e;">Bodyweight</label><input type="number" id="wizardBW" placeholder="kg" value="' + (goals.bodyweight || '') + '" min="30" max="300" step="0.1" style="width:100%;padding:8px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:13px;"></div>';
    html += '<div style="flex:1;min-width:60px;"><label style="font-size:10px;color:#7e8d9e;">Height</label><input type="number" id="wizardHeight" placeholder="cm" value="' + (goals.height || '') + '" min="100" max="250" step="1" style="width:100%;padding:8px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:13px;"></div>';
    html += '<div style="flex:1;min-width:50px;"><label style="font-size:10px;color:#7e8d9e;">Age</label><input type="number" id="wizardAge" placeholder="yr" value="' + (goals.age || '') + '" min="14" max="100" step="1" style="width:100%;padding:8px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:13px;"></div>';
    html += '<div style="flex:1;min-width:80px;"><label style="font-size:10px;color:#7e8d9e;">Goal</label><select id="wizardGoal" style="width:100%;padding:8px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:13px;">';
    html += '<option value="aggressive">Aggressive Cut (-1000)</option><option value="cut">Cut (-500)</option><option value="recomp" selected>Recomp</option><option value="bulk">Bulk (+300)</option>';
    html += '</select></div>';
    html += '<button class="prog-btn add" id="btnWizardApply" style="padding:8px 12px;font-size:12px;">Apply</button>';
    html += '</div></div>';

    html += '<h3 style="font-size:16px;font-weight:600;margin-bottom:12px;">Nutrition Goals</h3>';
    html += '<div class="prog-edit-field"><label>Daily Calories (kcal)</label><input type="number" id="goalCalInput" placeholder="e.g. 2500" value="' + (goals.calories || '') + '" min="0"></div>';
    html += '<div class="prog-edit-field"><label>Daily Protein (g)</label><input type="number" id="goalProInput" placeholder="e.g. 180" value="' + (goals.protein || '') + '" min="0"></div>';
    html += '<div class="prog-edit-field"><label>Daily Fat (g)</label><input type="number" id="goalFatInput" placeholder="e.g. 70" value="' + (goals.fat || '') + '" min="0"></div>';
    html += '<div class="prog-edit-field"><label>Daily Carbs (g)</label><input type="number" id="goalCarbInput" placeholder="e.g. 250" value="' + (goals.carbs || '') + '" min="0"></div>';
    html += '<button class="prog-btn add" id="btnSaveGoals" style="width:100%;margin-top:4px;">Save Goals</button>';
    html += '</div>';

    // AI integration section
    html += '<div style="margin-top:28px;padding-top:20px;border-top:1px solid #2a333d;">';
    html += '<h3 style="font-size:16px;font-weight:600;margin-bottom:12px;">AI Integration</h3>';
    html += '<p style="font-size:12px;color:#7e8d9e;margin-bottom:8px;">DeepSeek API key for AI macro estimates</p>';
    html += '<div class="api-key-row">';
    var savedKey = localStorage.getItem('tallTenderApiKey') || '';
    html += '<input type="password" id="apiKeyInput" placeholder="sk-..." value="' + savedKey.replace(/"/g, '&quot;') + '">';
    html += '<button class="btn-test-api" id="btnToggleApiKey">Show</button>';
    html += '</div>';
    html += '<button class="btn-test-api" id="btnTestApi" style="margin-top:8px;width:100%;">Test Connection</button>';
    html += '</div>';

    // Food database section (FatSecret proxy)
    html += '<div style="margin-top:28px;padding-top:20px;border-top:1px solid #2a333d;">';
    html += '<h3 style="font-size:16px;font-weight:600;margin-bottom:12px;">Food Database</h3>';
    html += '<p style="font-size:12px;color:#7e8d9e;margin-bottom:8px;">Cloudflare Worker URL for FatSecret food search</p>';
    html += '<div class="api-key-row">';
    var fsUrl = localStorage.getItem('tallTenderFatSecretUrl') || 'https://fatsecret-proxy.jockgrieve.workers.dev';
    html += '<input type="text" id="fsWorkerUrlInput" placeholder="https://your-worker.workers.dev" value="' + fsUrl.replace(/"/g, '&quot;') + '">';
    html += '</div>';
    html += '<button class="btn-test-api" id="btnTestFsWorker" style="margin-top:8px;width:100%;">Test Connection</button>';
    html += '</div>';

    // Progression coach toggle
    html += '<div class="timer-auto-toggle" style="margin-top:20px;padding-top:16px;border-top:1px solid #2a333d;">';
    html += '<label for="progCoachCheck">Progression Coach</label>';
    html += '<input type="checkbox" id="progCoachCheck"' + (isProgressionCoachEnabled() ? ' checked' : '') + '>';
    html += '</div>';

    // Weekly Review Email section
    var savedEmail = localStorage.getItem(REVIEW_EMAIL_KEY) || '';
    var reviewOptIn = localStorage.getItem(REVIEW_OPTIN_KEY) !== 'false';
    html += '<div style="margin-top:20px;padding-top:16px;border-top:1px solid #2a333d;">';
    html += '<h3 style="font-size:16px;font-weight:600;margin-bottom:12px;">Weekly Review Email</h3>';
    html += '<p style="font-size:12px;color:#7e8d9e;margin-bottom:8px;">AI-generated workout + nutrition summary sent to your inbox</p>';
    html += '<div class="prog-edit-field"><label>Email Address</label><input type="email" id="reviewEmailInput" placeholder="you@example.com" value="' + savedEmail.replace(/"/g, '&quot;') + '"></div>';
    html += '<div class="timer-auto-toggle" style="margin-top:12px;">';
    html += '<label for="reviewOptInCheck">Enable weekly review</label>';
    html += '<input type="checkbox" id="reviewOptInCheck"' + (reviewOptIn ? ' checked' : '') + '>';
    html += '</div>';
    var hasEmail = savedEmail.trim().length > 0;
    html += '<button class="prog-btn add" id="btnSendReview" style="width:100%;margin-top:12px;"' + (hasEmail ? '' : ' disabled') + '>📧 Send Weekly Review</button>';
    html += '</div>';

    html += '<button class="btn-reset" id="btnResetPrograms">Reset to defaults</button>';

    domSettingsContent.innerHTML = html;

    // Expand/collapse program cards
    domSettingsContent.querySelectorAll('.program-card').forEach(function(card) {
      card.addEventListener('click', function(e) {
        if (e.target.closest('button')) return; // don't toggle on button clicks
        card.classList.toggle('expanded');
        haptic();
      });
    });

    // View archive button
    var btnArchive = domSettingsContent.querySelector('#btnViewArchive');
    if (btnArchive) {
      btnArchive.addEventListener('click', function() {
        haptic();
        switchView('archive');
      });
    }

    // Profile — switch
    var btnSwitchProfile = domSettingsContent.querySelector('#btnSwitchProfile');
    if (btnSwitchProfile) {
      btnSwitchProfile.addEventListener('click', function() {
        var input = document.getElementById('profileNameInput');
        var name = (input ? input.value.trim() : '') || 'default';
        if (name === PROFILE) return;
        localStorage.setItem('tallTenderProfile', name);
        showToast('Switched to profile "' + name + '" — reloading...');
        setTimeout(function() { location.reload(); }, 500);
      });
    }
    // Profile — delete
    var btnDeleteProfile = domSettingsContent.querySelector('#btnDeleteProfile');
    if (btnDeleteProfile) {
      btnDeleteProfile.addEventListener('click', function() {
        var input = document.getElementById('profileNameInput');
        var name = (input ? input.value.trim() : '') || 'default';
        if (name === 'default') { showToast('Cannot delete the default profile'); return; }
        showConfirm(
          '<h3>Delete Profile?</h3><p>This will remove all workouts, foods, and goals for "' + name + '". This cannot be undone.</p>',
          [
            { label: 'Cancel', cls: 'btn-cancel', callback: function() {} },
            { label: 'Delete', cls: 'btn-danger', callback: function() {
              // Remove all profile-specific keys
              var keysToRemove = [];
              for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (k && k.indexOf('_' + name) >= 0) keysToRemove.push(k);
              }
              keysToRemove.forEach(function(k) { localStorage.removeItem(k); });
              localStorage.setItem('tallTenderProfile', 'default');
              showToast('Profile "' + name + '" deleted — reloading...');
              setTimeout(function() { location.reload(); }, 500);
            }}
          ]
        );
      });
    }

    // New program button
    var btnNew = domSettingsContent.querySelector('#btnNewProgram');
    if (btnNew) {
      btnNew.addEventListener('click', function() {
        haptic();
        showProgramNameModal('', function(name) {
          if (!name || programs.hasOwnProperty(name)) {
            showToast('Name already exists or is invalid');
            return;
          }
          programs[name] = [];
          savePrograms();
          renderSettingsView();
          showToast('Program "' + name + '" created');
        });
      });
    }

    // Add exercise button
    domSettingsContent.querySelectorAll('[data-action="add-exercise"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        haptic();
        var progName = this.dataset.program;
        showExerciseModal('', 3, '8-12', '', function(exName, sets, reps, note) {
          if (!exName) return;
          var ex = { name: exName, sets: sets, reps: reps };
          if (note) ex.note = note;
          programs[progName].push(ex);
          savePrograms();
          renderSettingsView();
          showToast('Added "' + exName + '" to ' + progName);
        });
      });
    });

    // Delete exercise button
    domSettingsContent.querySelectorAll('.ex-del').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        haptic();
        var progName = this.dataset.program;
        var exIdx = parseInt(this.dataset.exidx);
        var exName = programs[progName][exIdx].name;
        showConfirm(
          '<h3>Delete Exercise?</h3><p>Remove "' + exName + '" from ' + progName + '?</p>',
          [
            { label: 'Cancel', cls: 'btn-cancel', callback: function() {} },
            { label: 'Delete', cls: 'btn-danger', callback: function() {
              programs[progName].splice(exIdx, 1);
              savePrograms();
              renderSettingsView();
              showToast('Removed "' + exName + '"');
            }}
          ]
        );
      });
    });

    // Delete program button
    domSettingsContent.querySelectorAll('[data-action="delete-program"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        haptic();
        var progName = this.dataset.program;
        showConfirm(
          '<h3>Delete Program?</h3><p>Remove "' + progName + '" and all its exercises?</p>',
          [
            { label: 'Cancel', cls: 'btn-cancel', callback: function() {} },
            { label: 'Delete', cls: 'btn-danger', callback: function() {
              delete programs[progName];
              savePrograms();
              renderSettingsView();
              showToast('Program "' + progName + '" deleted');
            }}
          ]
        );
      });
    });

    // Exercise reorder — move up/down
    domSettingsContent.querySelectorAll('.ex-reorder').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        haptic();
        var progName = this.dataset.program;
        var exIdx = parseInt(this.dataset.exidx);
        var list = programs[progName];
        if (!list) return;
        if (this.classList.contains('ex-up') && exIdx > 0) {
          var tmp = list[exIdx - 1]; list[exIdx - 1] = list[exIdx]; list[exIdx] = tmp;
        } else if (this.classList.contains('ex-down') && exIdx < list.length - 1) {
          var tmp = list[exIdx + 1]; list[exIdx + 1] = list[exIdx]; list[exIdx] = tmp;
        }
        savePrograms();
        renderSettingsView();
      });
    });

    // Reset to defaults
    var btnReset = domSettingsContent.querySelector('#btnResetPrograms');
    if (btnReset) {
      btnReset.addEventListener('click', function() {
        haptic();
        showConfirm(
          '<h3>Reset to Defaults?</h3><p>This replaces all programs with the built-in 4-day split. Custom programs will be lost.</p>',
          [
            { label: 'Cancel', cls: 'btn-cancel', callback: function() {} },
            { label: 'Reset', cls: 'btn-danger', callback: function() {
              resetPrograms();
              renderSettingsView();
              showToast('Programs reset to defaults');
            }}
          ]
        );
      });
    }

    // Progression coach toggle
    var progCoachCheck = domSettingsContent.querySelector('#progCoachCheck');
    if (progCoachCheck) {
      progCoachCheck.addEventListener('change', function() {
        localStorage.setItem('tallTenderProgCoach', this.checked ? 'true' : 'false');
        showToast('Progression Coach ' + (this.checked ? 'enabled' : 'disabled'));
      });
    }

    // Weekly review email — save on input
    var reviewEmailInput = domSettingsContent.querySelector('#reviewEmailInput');
    if (reviewEmailInput) {
      reviewEmailInput.addEventListener('input', function() {
        var val = this.value.trim();
        localStorage.setItem(REVIEW_EMAIL_KEY, val);
        var btn = document.getElementById('btnSendReview');
        if (btn) btn.disabled = !val;
      });
    }

    // Weekly review — opt-in checkbox
    var reviewOptInCheck = domSettingsContent.querySelector('#reviewOptInCheck');
    if (reviewOptInCheck) {
      reviewOptInCheck.addEventListener('change', function() {
        localStorage.setItem(REVIEW_OPTIN_KEY, this.checked ? 'true' : 'false');
      });
    }

    // Weekly review — send button
    var btnSendReview = domSettingsContent.querySelector('#btnSendReview');
    if (btnSendReview) {
      btnSendReview.addEventListener('click', function() {
        haptic();
        var email = (localStorage.getItem(REVIEW_EMAIL_KEY) || '').trim();
        if (!email) { showToast('Enter an email address first'); return; }
        var apiKey = localStorage.getItem('tallTenderApiKey') || '';
        if (!apiKey) { showToast('Set your DeepSeek API key in Settings first'); return; }
        btnSendReview.textContent = 'Generating...';
        btnSendReview.disabled = true;
        generateAndSendWeeklyReview().finally(function() {
          btnSendReview.textContent = '📧 Send Weekly Review';
          var em = (localStorage.getItem(REVIEW_EMAIL_KEY) || '').trim();
          btnSendReview.disabled = !em;
        });
      });
    }

    // API key — toggle visibility
    var btnToggleKey = domSettingsContent.querySelector('#btnToggleApiKey');
    var apiInput = domSettingsContent.querySelector('#apiKeyInput');
    if (btnToggleKey && apiInput) {
      btnToggleKey.addEventListener('click', function() {
        if (apiInput.type === 'password') { apiInput.type = 'text'; btnToggleKey.textContent = 'Hide'; }
        else { apiInput.type = 'password'; btnToggleKey.textContent = 'Show'; }
      });
    }

    // API key — save on input
    if (apiInput) {
      apiInput.addEventListener('input', function() {
        localStorage.setItem('tallTenderApiKey', this.value.trim());
      });
    }

    // Test connection
    var btnTestApi = domSettingsContent.querySelector('#btnTestApi');
    if (btnTestApi) {
      btnTestApi.addEventListener('click', function() {
        var key = localStorage.getItem('tallTenderApiKey') || '';
        if (!key) { showToast('Enter an API key first'); return; }
        btnTestApi.textContent = 'Testing...';
        btnTestApi.disabled = true;
        fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
          body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: 'Say "ok"' }], max_tokens: 5 })
        })
        .then(function(res) {
          btnTestApi.textContent = 'Test Connection';
          btnTestApi.disabled = false;
          if (res.ok) showToast('Connected! API key works.');
          else showToast('Error: ' + res.status + ' - check your key');
        })
        .catch(function() {
          btnTestApi.textContent = 'Test Connection';
          btnTestApi.disabled = false;
          showToast('Connection failed. Check your network.');
        });
      });
    }

    // FatSecret Worker URL — save on input
    var fsWorkerInput = domSettingsContent.querySelector('#fsWorkerUrlInput');
    if (fsWorkerInput) {
      fsWorkerInput.addEventListener('input', function() {
        localStorage.setItem('tallTenderFatSecretUrl', this.value.trim());
      });
    }

    // Test FatSecret Worker connection
    var btnTestFsWorker = domSettingsContent.querySelector('#btnTestFsWorker');
    if (btnTestFsWorker) {
      btnTestFsWorker.addEventListener('click', function() {
        var workerUrl = localStorage.getItem('tallTenderFatSecretUrl') || '';
        if (!workerUrl) { showToast('Enter a Worker URL first'); return; }
        // Normalise: strip trailing slashes
        var baseUrl = workerUrl.replace(/\/+$/, '');
        btnTestFsWorker.textContent = 'Testing...';
        btnTestFsWorker.disabled = true;
        fetch(baseUrl + '/search?q=test')
        .then(function(res) {
          btnTestFsWorker.textContent = 'Test Connection';
          btnTestFsWorker.disabled = false;
          if (res.ok) showToast('Connected! Worker is responding.');
          else if (res.status === 401) showToast('Worker error: check FatSecret credentials.');
          else showToast('Worker error: HTTP ' + res.status);
        })
        .catch(function() {
          btnTestFsWorker.textContent = 'Test Connection';
          btnTestFsWorker.disabled = false;
          showToast('Connection failed. Check the URL and CORS.');
        });
      });
    }

    // Goal wizard — auto-fill based on bodyweight, height, age
    var btnWizard = domSettingsContent.querySelector('#btnWizardApply');
    if (btnWizard) {
      btnWizard.addEventListener('click', function() {
        var bw = parseFloat((document.getElementById('wizardBW') || {}).value) || 0;
        if (bw < 30) { showToast('Enter bodyweight first'); return; }
        var height = parseFloat((document.getElementById('wizardHeight') || {}).value) || 178;
        var age = parseInt((document.getElementById('wizardAge') || {}).value) || 25;
        var goal = (document.getElementById('wizardGoal') || {}).value || 'recomp';

        // Auto-detect activity from training history
        var now = new Date();
        var fourWeeks = 28 * 86400000;
        var recentWorkouts = appData.workouts.filter(function(w) {
          var d = new Date(w.startedAt || w.completedAt || 0);
          return (now - d) < fourWeeks;
        });
        var sessionsPerWeek = recentWorkouts.length / 4;
        var avgVolume = recentWorkouts.reduce(function(s, w) { return s + (w.totalVolume || 0); }, 0) / Math.max(1, recentWorkouts.length);
        // Activity multiplier based on training frequency
        var activityMult, activityLabel;
        if (sessionsPerWeek >= 5)      { activityMult = 1.725; activityLabel = 'Very Active (' + sessionsPerWeek.toFixed(0) + '/wk)'; }
        else if (sessionsPerWeek >= 3.5) { activityMult = 1.55;  activityLabel = 'Moderate (' + sessionsPerWeek.toFixed(0) + '/wk)'; }
        else if (sessionsPerWeek >= 2)   { activityMult = 1.375; activityLabel = 'Light (' + sessionsPerWeek.toFixed(0) + '/wk)'; }
        else                             { activityMult = 1.2;   activityLabel = 'Sedentary (' + sessionsPerWeek.toFixed(0) + '/wk)'; }

        // Mifflin-St Jeor BMR (male): 10×weight(kg) + 6.25×height(cm) - 5×age + 5
        var bmr = Math.round(10 * bw + 6.25 * height - 5 * age + 5);
        var tdee = Math.round(bmr * activityMult);

        // Science-backed macro split: high protein, moderate carb, low fat
        // Protein: 2.0-2.4 g/kg (higher on cut to preserve muscle)
        // Fat: 0.8-1.0 g/kg (essential hormone function, kept moderate)
        // Carbs: fill remaining calories
        var cal, pro, fat;
        if (goal === 'aggressive') {
          cal = tdee - 1000;
          // Estimate LBM at ~65% for protein targets — obese tissue doesn't need protein
          var estLbm = bw * 0.65;
          pro = Math.round(estLbm * 3.0);  // 3.0 g/kg LBM = ~2.0 g/kg total at 35% BF
          fat = Math.round(estLbm * 1.0);  // essential fat based on lean mass
        } else if (goal === 'cut') {
          cal = tdee - 500;
          pro = Math.round(bw * 2.4);   // higher protein on cut
          fat = Math.round(bw * 0.8);   // minimum essential fat
        } else if (goal === 'bulk') {
          cal = tdee + 300;
          pro = Math.round(bw * 2.0);   // sufficient for synthesis
          fat = Math.round(bw * 1.0);   // support hormone production
        } else {
          cal = tdee;
          pro = Math.round(bw * 2.2);   // recomp: high protein
          fat = Math.round(bw * 0.9);   // moderate fat
        }
        var carbs = Math.round((cal - (pro * 4) - (fat * 9)) / 4);
        if (carbs < 0) carbs = 0;
        var calEl = document.getElementById('goalCalInput');
        var proEl = document.getElementById('goalProInput');
        var fatEl = document.getElementById('goalFatInput');
        var carbEl = document.getElementById('goalCarbInput');
        if (calEl) calEl.value = cal;
        if (proEl) proEl.value = pro;
        if (fatEl) fatEl.value = fat;
        if (carbEl) carbEl.value = carbs;
        showToast(activityLabel + ' · TDEE ' + tdee + ' (' + bmr + ' BMR) · ' + cal + ' cal P' + pro + '/F' + fat + '/C' + carbs);
      });
    }

    // Save nutrition goals
    var btnSaveGoals = domSettingsContent.querySelector('#btnSaveGoals');
    if (btnSaveGoals) {
      btnSaveGoals.addEventListener('click', function() {
        var calEl = document.getElementById('goalCalInput');
        var proEl = document.getElementById('goalProInput');
        var fatEl = document.getElementById('goalFatInput');
        var carbEl = document.getElementById('goalCarbInput');
        var goals = {
          calories: calEl ? (parseInt(calEl.value) || 0) : 0,
          protein: proEl ? (parseInt(proEl.value) || 0) : 0,
          fat: fatEl ? (parseInt(fatEl.value) || 0) : 0,
          carbs: carbEl ? (parseInt(carbEl.value) || 0) : 0,
          bodyweight: parseFloat((document.getElementById('wizardBW') || {}).value) || 0,
          height: parseFloat((document.getElementById('wizardHeight') || {}).value) || 178,
          age: parseInt((document.getElementById('wizardAge') || {}).value) || 25
        };
        saveGoals(goals);
        showToast('Goals saved!');
      });
    }
  }

  // Program/exercise editing modals (lightweight, reuse confirm modal pattern)
  function showProgramNameModal(currentName, callback) {
    var html = '<h3 style="margin-bottom:12px;">Program Name</h3>';
    html += '<input type="text" id="progNameInput" placeholder="e.g. Push Day" value="' + currentName.replace(/"/g, '&quot;') + '" style="width:100%;padding:14px;border-radius:12px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:16px;outline:none;">';
    showConfirm(html, [
      { label: 'Cancel', cls: 'btn-cancel', callback: function() { callback(''); } },
      { label: 'Save', cls: 'btn-save', callback: function() {
        var input = document.getElementById('progNameInput');
        var name = (input ? input.value.trim() : '');
        callback(name);
      }}
    ]);
    setTimeout(function() {
      var inp = document.getElementById('progNameInput');
      if (inp) inp.focus();
    }, 300);
  }

  function showExerciseModal(name, sets, reps, note, callback) {
    var html = '<h3 style="margin-bottom:12px;">Exercise</h3>';
    html += '<div class="prog-edit-field"><label>Name</label><input type="text" id="exNameInput" placeholder="e.g. Bench Press" value="' + name.replace(/"/g, '&quot;') + '"></div>';
    html += '<div class="prog-edit-field"><label>Sets</label><input type="number" id="exSetsInput" value="' + sets + '" min="1" max="10"></div>';
    html += '<div class="prog-edit-field"><label>Target Reps</label><input type="text" id="exRepsInput" placeholder="e.g. 8-12" value="' + reps + '"></div>';
    html += '<div class="prog-edit-field"><label>Permanent Note <span style="font-size:10px;color:#5a7a6a;">(machine settings, cues)</span></label><input type="text" id="exNoteInput" placeholder="e.g. Seat 9B, XL" value="' + (note || '').replace(/"/g, '&quot;') + '"></div>';
    showConfirm(html, [
      { label: 'Cancel', cls: 'btn-cancel', callback: function() { callback('', 0, '', ''); } },
      { label: 'Save', cls: 'btn-save', callback: function() {
        var n = document.getElementById('exNameInput');
        var s = document.getElementById('exSetsInput');
        var r = document.getElementById('exRepsInput');
        var nt = document.getElementById('exNoteInput');
        callback(n ? n.value.trim() : '', s ? parseInt(s.value) || 3 : 3, r ? r.value.trim() : '8-12', nt ? nt.value.trim() : '');
      }}
    ]);
    setTimeout(function() {
      var inp = document.getElementById('exNameInput');
      if (inp) inp.focus();
    }, 300);
  }

  // ==================== NUTRITION VIEW ====================

  var nutritionDate = todayStr();
  var pendingFoodSlot = 'breakfast';
  var pendingServingsFoodId = null;

  function renderNutritionView() {
    var nut = getNutrition(nutritionDate);
    var totals = calcDailyTotals(nutritionDate);
    var hasApiKey = !!(localStorage.getItem('tallTenderApiKey') || '');
    var suggestions = computeSuggestions(nutritionDate);

    var html = '';
    // ---- Sticky header: date + macros ----
    html += '<div class="sticky-bar">';
    // Date selector
    html += '<div class="nutrition-date">';
    html += '<button class="date-arrow" id="nutPrevDay">◀</button>';
    html += '<span id="nutDateLabel">' + (nutritionDate === todayStr() ? 'Today' : formatDate(nutritionDate)) + '</span>';
    html += '<button class="date-arrow" id="nutNextDay"' + (nutritionDate >= todayStr() ? ' disabled style="opacity:0.3"' : '') + '>▶</button>';
    // Bodyweight log inline
    var bwData = appData.bodyweight || {};
    var todayBw = bwData[todayStr()] || '';
    var bwHistory = Object.keys(bwData).sort().slice(-14).map(function(k) { return bwData[k]; });
    if (bwHistory.length > 1) {
      html += '<span style="font-size:10px;color:#5a7a6a;margin-left:auto;">' + bwHistory[0].toFixed(1) + ' → ' + bwHistory[bwHistory.length-1].toFixed(1) + ' kg</span>';
    }
    html += '<input type="number" id="bwInput" placeholder="BW kg" value="' + todayBw + '" step="0.1" min="30" max="300" style="width:60px;padding:6px 8px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:12px;text-align:center;margin-left:6px;">';
    html += '</div>';

    // ---- Streak + Weekly summary ----
    var goals = loadGoals();

    // Compute current streak (consecutive days under calorie goal)
    var streak = 0;
    var d = new Date(todayStr() + 'T12:00:00');
    for (var si = 0; si < 365; si++) {
      var dateStr = d.getFullYear() + '-' + ('0' + (d.getMonth()+1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      var dayTotals = calcDailyTotals(dateStr);
      if (dayTotals.calories > 0 && goals.calories > 0 && dayTotals.calories <= goals.calories) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else if (dayTotals.calories === 0 && dateStr === todayStr()) {
        // Today hasn't been logged yet — don't break streak, just don't count it
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }

    // Compute weekly totals (Mon-Sun containing nutritionDate)
    var refDate = new Date(nutritionDate + 'T12:00:00');
    var dayOfWeek = refDate.getDay(); // 0=Sun
    var mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    var weekMon = new Date(refDate);
    weekMon.setDate(refDate.getDate() + mondayOffset);
    var weekCal = 0, weekPro = 0, weekDays = 0;
    for (var wi = 0; wi < 7; wi++) {
      var wd = new Date(weekMon);
      wd.setDate(weekMon.getDate() + wi);
      var wds = wd.getFullYear() + '-' + ('0' + (wd.getMonth()+1)).slice(-2) + '-' + ('0' + wd.getDate()).slice(-2);
      var wt = calcDailyTotals(wds);
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
        var st = calcSlotTotals(m.items);
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
    if (hasApiKey) {
      html += '<button class="qa-btn" id="btnMealPlan" style="background:#1e2a1e;border-color:#2d5a2d;color:#4caf50;">🧠 Generate Meal Plan</button>';
    }
    html += '</div>';

    // Recipe chips (quick access)
    if (mealTemplates.length > 0) {
      html += '<div class="template-chips-row" id="templateChipsRow">';
      html += '<span class="sug-label" style="line-height:22px;">Recipes:</span>';
      for (var ti = 0; ti < mealTemplates.length; ti++) {
        var tpl = mealTemplates[ti];
        // Calculate recipe macro totals
        var tCal = 0, tPro = 0;
        tpl.items.forEach(function(ti) {
          var tf = getFoodById(ti.foodId);
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
      var slotTotals = calcSlotTotals(meal ? meal.items : []);
      var hasFood = meal && meal.items.length > 0;
      html += '<div class="meal-slot' + (hasFood ? ' has-food' : '') + '" data-slot="' + slot + '">';
      html += '<div class="slot-header">';
      html += '<span class="slot-name">' + slotIcons[slot] + ' ' + slot.charAt(0).toUpperCase() + slot.slice(1) + '</span>';
      html += '<span class="slot-totals">' + (hasFood ? slotTotals.calories + ' cal | ' + slotTotals.protein + 'g protein' : 'Empty') + '</span>';
      html += '</div>';
      if (hasFood) {
        html += '<div class="slot-items">';
        meal.items.forEach(function(item, idx) {
          var f = getFoodById(item.foodId);
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

    // Meal templates — same as before
    html += '<div style="margin-top:16px;margin-bottom:8px;">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;cursor:pointer;" id="toggleTemplates">';
    html += '<span style="font-size:14px;font-weight:600;">Meal Templates</span><span id="templatesArrow">▼</span>';
    html += '</div>';
    html += '<div id="templatesContent" style="display:none;margin-top:8px;">';
    if (mealTemplates.length === 0) {
      html += '<div class="no-foods">No templates. Save a meal as a template first.</div>';
    } else {
      mealTemplates.forEach(function(tpl) {
        var itemNames = tpl.items.map(function(item) {
          var f = getFoodById(item.foodId);
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

    domNutritionContent.innerHTML = html;

    // --- Event handlers ---

    // Suggestion chip — frequent food
    // Add food button per slot
    domNutritionContent.querySelectorAll('.btn-add-food').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        pendingFoodSlot = this.dataset.slot;
        openFoodPicker();
      });
    });
    // Clear slot button
    domNutritionContent.querySelectorAll('.btn-clear-slot').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var slot = this.dataset.slot;
        var nut = getNutrition(nutritionDate);
        var meal = null;
        for (var i = 0; i < nut.meals.length; i++) { if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; } }
        if (meal) { meal.items = []; meal.planNotes = null; meal.notes = ''; saveData(); renderNutritionView(); }
      });
    });
    // Save recipe button
    domNutritionContent.querySelectorAll('.btn-save-tpl').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        saveMealAsTemplate(this.dataset.saveSlot);
      });
    });

    // Template chips in quick-actions row
    domNutritionContent.querySelectorAll('.template-chip[data-tpl-id]').forEach(function(chip) {
      chip.addEventListener('click', function(e) {
        e.stopPropagation();
        var tplId = parseInt(this.dataset.tplId);
        var tpl = null;
        for (var i = 0; i < mealTemplates.length; i++) {
          if (mealTemplates[i].id === tplId) { tpl = mealTemplates[i]; break; }
        }
        if (!tpl) return;
        pickSlotThen(function(slot) {
          var nut = getNutrition(nutritionDate);
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
          saveData();
          trackRecentMeal(slot, meal.items);
          renderNutritionView();
          showToast('Template applied to ' + slot);
        });
      });
    });

    // Date navigation (same)
    var prevBtn = document.getElementById('nutPrevDay');
    var nextBtn = document.getElementById('nutNextDay');
    if (prevBtn) prevBtn.addEventListener('click', function() {
      var d = new Date(nutritionDate + 'T12:00:00');
      d.setDate(d.getDate() - 1);
      nutritionDate = d.getFullYear() + '-' + ('0' + (d.getMonth()+1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      renderNutritionView();
    });
    if (nextBtn) nextBtn.addEventListener('click', function() {
      if (nutritionDate >= todayStr()) return;
      var d = new Date(nutritionDate + 'T12:00:00');
      d.setDate(d.getDate() + 1);
      nutritionDate = d.getFullYear() + '-' + ('0' + (d.getMonth()+1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
      renderNutritionView();
    });

    // Bodyweight log
    var bwInput = document.getElementById('bwInput');
    if (bwInput) {
      bwInput.addEventListener('change', function() {
        var val = parseFloat(this.value);
        if (!appData.bodyweight) appData.bodyweight = {};
        if (val > 0) {
          appData.bodyweight[todayStr()] = val;
        } else {
          delete appData.bodyweight[todayStr()];
        }
        saveData();
        showToast('Weight logged: ' + val + 'kg');
      });
    }

    // Food chip — delete
    domNutritionContent.querySelectorAll('.chip-del').forEach(function(chip) {
      chip.addEventListener('click', function(e) {
        e.stopPropagation();
        var slot = this.dataset.slot;
        var idx = parseInt(this.dataset.idx);
        var nut = getNutrition(nutritionDate);
        var meal = null;
        for (var i = 0; i < nut.meals.length; i++) {
          if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; }
        }
        if (meal) { meal.items.splice(idx, 1); saveData(); trackRecentMeal(slot, meal.items); renderNutritionView(); }
      });
    });

    // Food chip — tap to edit servings (same)
    domNutritionContent.querySelectorAll('.food-chip').forEach(function(chip) {
      chip.addEventListener('click', function(e) {
        if (e.target.closest('.chip-del')) return;
        e.stopPropagation();
        var slot = this.dataset.slot;
        var idx = parseInt(this.dataset.idx);
        var nut = getNutrition(nutritionDate);
        var meal = null;
        for (var i = 0; i < nut.meals.length; i++) {
          if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; }
        }
        if (!meal) return;
        var item = meal.items[idx];
        var f = getFoodById(item.foodId);
        if (item.amount && item.unit) {
          // New format: show amount picker
          showAmountUnitPicker(f ? f.name : 'Food', item.amount, item.unit, function(newAmount, newUnit) {
            if (newAmount <= 0) {
              meal.items.splice(idx, 1);
            } else {
              item.amount = newAmount;
              item.unit = newUnit;
            }
            saveData();
            trackRecentMeal(slot, meal.items);
            renderNutritionView();
          }, item.foodId);
        } else {
          // Old format: servings picker
          showServingsPicker(f ? f.name : 'Food', item.servings || 1, function(newServings) {
            if (newServings <= 0) {
              meal.items.splice(idx, 1);
            } else {
              item.servings = newServings;
            }
            saveData();
            trackRecentMeal(slot, meal.items);
            renderNutritionView();
          });
        }
      });
    });

    // Meal plan chips — tap to search food picker
    domNutritionContent.querySelectorAll('.plan-chip').forEach(function(chip) {
      chip.addEventListener('click', function(e) {
        e.stopPropagation();
        var slot = this.dataset.slot;
        var search = this.dataset.search || '';
        pendingFoodSlot = slot;
        openFoodPicker();
        setTimeout(function() {
          domFoodSearchInput.value = search;
          renderFoodPickerList(search);
          domFoodSearchInput.focus();
        }, 250);
      });
    });

    // Quick action: Use Template (same)
    var btnTpl = document.getElementById('btnUseTemplate');
    if (btnTpl) btnTpl.addEventListener('click', function() {
      if (mealTemplates.length === 0) { showToast('No templates saved yet'); return; }
      pickSlotThen(function(slot) {
        showTemplatePicker(function(tplId) {
          var tpl = null;
          for (var i = 0; i < mealTemplates.length; i++) {
            if (mealTemplates[i].id === tplId) { tpl = mealTemplates[i]; break; }
          }
          if (!tpl) return;
          var nut = getNutrition(nutritionDate);
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
          saveData();
          trackRecentMeal(slot, meal.items);
          renderNutritionView();
          showToast('Template applied to ' + slot);
        });
      });
    });

    // Quick action: Log Manually
    var btnManual = document.getElementById('btnLogManual');
    if (btnManual) btnManual.addEventListener('click', function() {
      pickSlotThen(function(slot) { pendingFoodSlot = slot; openFoodPicker(); });
    });

    // Generate meal plan
    var btnMealPlan = document.getElementById('btnMealPlan');
    if (btnMealPlan) btnMealPlan.addEventListener('click', function() {
      haptic();
      generateMealPlan();
    });

    // Template cards (same)
    domNutritionContent.querySelectorAll('.template-card').forEach(function(card) {
      card.addEventListener('click', function() {
        var tplId = parseInt(this.dataset.tplId);
        var tpl = null;
        for (var i = 0; i < mealTemplates.length; i++) {
          if (mealTemplates[i].id === tplId) { tpl = mealTemplates[i]; break; }
        }
        if (!tpl) return;
        pickSlotThen(function(slot) {
          var nut = getNutrition(nutritionDate);
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
          saveData();
          trackRecentMeal(slot, meal.items);
          renderNutritionView();
          showToast('Template applied to ' + slot);
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
    domNutritionContent.querySelectorAll('.lib-quick-add').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var foodId = parseInt(this.dataset.foodId);
        var f = getFoodById(foodId);
        if (!f) return;
        pickSlotThen(function(slot) {
          var defAmt = f.per100g ? 100 : 1;
          showAmountUnitPicker(f.name, defAmt, 'g', function(amount, unit) {
            if (amount <= 0) return;
            var nut = getNutrition(nutritionDate);
            var meal = null;
            for (var i = 0; i < nut.meals.length; i++) {
              if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; }
            }
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

    domNutritionContent.querySelectorAll('[data-del-food]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = parseInt(this.dataset.delFood);
        var f = getFoodById(id);
        showConfirm('<h3>Delete Food?</h3><p>Remove "' + (f ? f.name : '?') + '" from your library?</p>', [
          { label: 'Cancel', cls: 'btn-cancel', callback: function() {} },
          { label: 'Delete', cls: 'btn-danger', callback: function() {
            foods = foods.filter(function(x) { return x.id !== id; });
            // Clean up recent meals referencing deleted food
            recentMeals = recentMeals.filter(function(rm) {
              for (var ri = 0; ri < rm.items.length; ri++) {
                if (rm.items[ri].foodId === id) return false;
              }
              return true;
            });
            saveFoods();
            saveRecentMeals();
            renderNutritionView();
            showToast('Food deleted');
          }}
        ]);
      });
    });
    var btnAddLib = document.getElementById('btnAddFoodToLib');
    if (btnAddLib) btnAddLib.addEventListener('click', function() {
      showAddFoodModal('', function(name, cal, pro) {
        if (!name) return;
        foods.push({ id: Date.now(), name: name, calories: cal, protein: pro });
        saveFoods();
        renderNutritionView();
        showToast('Added "' + name + '" to library');
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
    var apiKey = localStorage.getItem('tallTenderApiKey') || '';
    if (!apiKey) { showToast('Set API key in Settings first'); return; }

    var workerUrl = (localStorage.getItem('tallTenderFatSecretUrl') || '').replace(/\/+$/, '');

    // Show loading state
    inputEl.disabled = true;
    inputEl.placeholder = 'Estimating...';
    var btn = domNutritionContent.querySelector('.ai-inline-btn[data-slot="' + slot + '"]');
    if (btn) { btn.textContent = '...'; btn.disabled = true; }

    function restoreInput() {
      inputEl.disabled = false;
      inputEl.placeholder = 'Describe what you ate...';
      if (btn) { btn.textContent = 'AI Estimate'; btn.disabled = false; }
    }

    if (workerUrl) {
      // --- Worker-available: DeepSeek → FatSecret lookup, auto-import ---
      var prompt = 'Break this meal description into individual food search terms for a nutrition database lookup. Return ONLY a valid JSON array of strings. Be specific: include preparation method and key ingredients. Meal: ' + mealText;

      fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
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
        showToast('Looking up ' + terms.length + ' foods in FatSecret...');
        lookupAndImportBatch(terms, slot, workerUrl);
      })
      .catch(function(err) {
        restoreInput();
        showToast('Error: ' + err.message);
      });
    } else {
      // --- Fallback: DeepSeek estimates macros (no Worker configured) ---
      var prompt = 'Estimate macros for this meal. Return ONLY a valid JSON array of objects with keys: name (string), amount (number), unit (one of: g, oz, each, scoop, tbsp, tsp, cup, ml), calories (number, total for this amount), protein (number, grams total for this amount). Use natural units per food. Meal: ' + mealText;

      fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
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
        showAiReviewPanel(slot, items);
      })
      .catch(function(err) {
        restoreInput();
        showToast('Error: ' + err.message);
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
        var macros = parseFsDescription(desc);

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
            var sv = parseFsServing(s);
            if (sv.calories > 0) cals = sv.calories;
            if (sv.protein > 0) protein = sv.protein;
            if (sv.fat > 0) fat = sv.fat;
            if (sv.carbs > 0) carbs = sv.carbs;
          }

          // Create food and add to meal (macros per 100g)
          var newId = Date.now() + imported;
          foods.push({ id: newId, name: fsName, calories: cals, protein: protein, fat: fat, carbs: carbs, per100g: true });

          var nut = getNutrition(nutritionDate);
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
        saveFoods();
        saveData();
        var nut = getNutrition(nutritionDate);
        var meal = null;
        for (var i = 0; i < nut.meals.length; i++) {
          if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; }
        }
        if (meal) trackRecentMeal(slot, meal.items);
        renderNutritionView();
        showToast('Imported ' + imported + ' foods with real nutrition data!');
      }
    }
  }

  var COMMON_UNITS = ['g', 'oz', 'each', 'scoop', 'tbsp', 'tsp', 'cup', 'ml'];

  function unitSelectHtml(selected) {
    var h = '<select class="rv-unit" style="padding:6px 2px;border-radius:6px;background:#1a222b;border:1px solid #2a333d;color:#e8edf2;font-size:10px;">';
    COMMON_UNITS.forEach(function(u) {
      h += '<option value="' + u + '"' + (u === selected ? ' selected' : '') + '>' + u + '</option>';
    });
    h += '</select>';
    return h;
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
      html += unitSelectHtml(unit);
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
      var nut = getNutrition(nutritionDate);
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
        foods.push({ id: newId, name: name, calories: cal, protein: pro });
        meal.items.push({ foodId: newId, amount: amount, unit: unit });
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

  // ==================== FOOD PICKER ====================

  function openFoodPicker() {
    domFoodPickerModal.classList.add('open');
    domFoodSearchInput.value = '';
    renderFoodPickerList('');
    setTimeout(function() { domFoodSearchInput.focus(); }, 200);
  }

  // FatSecret search debounce timer
  var fsSearchTimer = null;

  function renderFoodPickerList(query) {
    var q = query.toLowerCase();
    var filtered = foods.filter(function(f) {
      return f.name.toLowerCase().indexOf(q) >= 0;
    });
    var html = '';

    // Local library section
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

    // FatSecret section placeholder (populated async)
    var workerUrl = (localStorage.getItem('tallTenderFatSecretUrl') || '').replace(/\/+$/, '');
    if (query.trim() && workerUrl) {
      html += '<div class="fs-section-label">FatSecret Results</div>';
      html += '<div id="fsResults"><div class="fs-loading">Searching...</div></div>';
    }

    if (query.trim()) {
      html += '<button class="btn-log-food" id="btnAddNewFood" style="margin-top:8px;">+ Add "' + query.trim() + '" to library</button>';
    }
    domFoodPickerList.innerHTML = html;

    // --- Local food item click ---
    domFoodPickerList.querySelectorAll('.food-picker-item').forEach(function(el) {
      el.addEventListener('click', function() {
        var foodId = parseInt(this.dataset.foodId);
        var f = getFoodById(foodId);
        if (!f) return;
        if (f.per100g) {
          // FatSecret food — show gram-based amount picker
          var sv = smartServe(f.name);
          showAmountUnitPicker(f.name, sv.amount, sv.unit, function(amount, unit) {
            if (amount <= 0) return;
            var nut = getNutrition(nutritionDate);
            var meal = null;
            for (var i = 0; i < nut.meals.length; i++) {
              if (nut.meals[i].slot === pendingFoodSlot) { meal = nut.meals[i]; break; }
            }
            if (!meal) return;
            meal.items.push({ foodId: foodId, amount: amount, unit: unit });
            saveData();
            trackRecentMeal(pendingFoodSlot, meal.items);
            closeFoodPicker();
            renderNutritionView();
            showToast('Added ' + amount + unit + ' ' + f.name);
          }, foodId);
        } else {
          // Legacy food — use servings multiplier
          showServingsPicker(f.name, 1, function(servings) {
            if (servings <= 0) return;
            var nut = getNutrition(nutritionDate);
            var meal = null;
            for (var i = 0; i < nut.meals.length; i++) {
              if (nut.meals[i].slot === pendingFoodSlot) { meal = nut.meals[i]; break; }
            }
            if (!meal) return;
            meal.items.push({ foodId: foodId, servings: servings });
            saveData();
            trackRecentMeal(pendingFoodSlot, meal.items);
            closeFoodPicker();
            renderNutritionView();
            showToast('Added ' + f.name + (servings !== 1 ? ' x' + servings : ''));
          });
        }
      });
    });

    // --- Add new food button ---
    var addNew = document.getElementById('btnAddNewFood');
    if (addNew) addNew.addEventListener('click', function() {
      var name = query.trim();
      if (!name) return;
      showAddFoodModal(name, function(foodName, cal, pro) {
        if (!foodName) return;
        var newId = Date.now();
        foods.push({ id: newId, name: foodName, calories: cal, protein: pro });
        saveFoods();
        var nut = getNutrition(nutritionDate);
        var meal = null;
        for (var i = 0; i < nut.meals.length; i++) {
          if (nut.meals[i].slot === pendingFoodSlot) { meal = nut.meals[i]; break; }
        }
        if (meal) meal.items.push({ foodId: newId, servings: 1 });
        saveData();
        trackRecentMeal(pendingFoodSlot, meal.items);
        closeFoodPicker();
        renderNutritionView();
        showToast('Added "' + foodName + '"');
      });
    });

    // --- Fire FatSecret search (debounced 300ms) ---
    if (query.trim() && workerUrl) {
      clearTimeout(fsSearchTimer);
      fsSearchTimer = setTimeout(function() {
        searchFatSecret(query.trim(), workerUrl);
      }, 300);
    }
  }

  // ---------- FatSecret search ----------

  /**
   * Parse a FatSecret food_description string like
   * "Per 100g - Calories: 165kcal | Fat: 3.60g | Carbs: 0.00g | Protein: 31.00g"
   * into { calories, protein } numbers (null if unparseable).
   */
  function parseFsDescription(desc) {
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
  }

  function parseFsServing(s) {
    var cal = parseFloat(s.calories) || 0;
    var pro = parseFloat(s.protein) || 0;
    var fat = parseFloat(s.fat) || 0;
    var carbs = parseFloat(s.carbohydrate) || 0;
    return { calories: Math.round(cal), protein: Math.round(pro), fat: Math.round(fat), carbs: Math.round(carbs) };
  }

  function searchFatSecret(query, workerUrl) {
    var fsContainer = document.getElementById('fsResults');
    if (!fsContainer) return; // picker already closed

    fetch(workerUrl + '/search?q=' + encodeURIComponent(query) + '&page=0')
    .then(function(res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function(data) {
      // Re-check container (picker may have closed during fetch)
      var fsContainer2 = document.getElementById('fsResults');
      if (!fsContainer2) return;

      var foodsList = (data.foods && data.foods.food) ? data.foods.food : null;
      if (!foodsList) {
        fsContainer2.innerHTML = '<div class="no-foods" style="padding:12px 0;">No FatSecret results for "' + query + '"</div>';
        return;
      }

      // Normalise to array (single result comes as object, not array)
      if (!Array.isArray(foodsList)) foodsList = [foodsList];

      var html = '';
      foodsList.forEach(function(fsFood) {
        // FatSecret sometimes returns food_id as string, normalise
        var fsId = fsFood.food_id || '';
        var fsName = fsFood.food_name || 'Unknown';
        var desc = fsFood.food_description || '';
        var macros = parseFsDescription(desc);

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

      // --- Attach import handlers ---
      fsContainer2.querySelectorAll('.fs-import-item').forEach(function(el) {
        el.addEventListener('click', function() {
          importFatSecretFood(this.dataset.fsId, this.dataset.fsName, this, workerUrl);
        });
      });
    })
    .catch(function(err) {
      var fsContainer3 = document.getElementById('fsResults');
      if (!fsContainer3) return;
      fsContainer3.innerHTML = '<div class="fs-error">FatSecret search failed: ' + err.message + '</div>';
    });
  }

  /**
   * Fetch full food details from FatSecret, create a local food entry,
   * then immediately show the servings picker so the user can add it to their meal.
   */
  function importFatSecretFood(fsId, fsName, clickedEl, workerUrl) {
    // Show loading state
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

      var cals = 0, protein = 0;
      var servings = food.servings && food.servings.serving;
      if (servings) {
        // Normalise to array
        var servingList = Array.isArray(servings) ? servings : [servings];
        // Prefer the 100g serving, fall back to default then first
        var s = servingList[0];
        for (var i = 0; i < servingList.length; i++) {
          if (servingList[i].is_default === '1' || servingList[i].serving_description === '100 g') {
            s = servingList[i]; break;
          }
        }
        var macros = parseFsServing(s);
        cals = macros.calories;
        protein = macros.protein;
        var fat = macros.fat;
        var carbs = macros.carbs;
      }

      // Create local food — macros stored per 100g
      var newId = Date.now();
      var foodName = food.food_name || fsName;
      foods.push({ id: newId, name: foodName, calories: cals, protein: protein, fat: fat || 0, carbs: carbs || 0, per100g: true });
      saveFoods();

      // Show amount picker with smart default serving + live preview
      var serve = smartServe(foodName);
      showAmountUnitPicker(foodName, serve.amount, serve.unit, function(amount, unit) {
        if (amount <= 0) {
          renderFoodPickerList(domFoodSearchInput.value);
          return;
        }
        var nut = getNutrition(nutritionDate);
        var meal = null;
        for (var i = 0; i < nut.meals.length; i++) {
          if (nut.meals[i].slot === pendingFoodSlot) { meal = nut.meals[i]; break; }
        }
        if (meal) meal.items.push({ foodId: newId, amount: amount, unit: unit });
        saveData();
        trackRecentMeal(pendingFoodSlot, meal.items);
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

  /**
   * Smart serving size based on food name heuristics.
   * Returns { amount, unit } for a reasonable default portion.
   */
  function smartServe(foodName) {
    var name = (foodName || '').toLowerCase();
    // Whole items: default to 1 each
    if (/egg|banana|apple|orange|scoop|bar|slice|wrap|burger|sandwich/i.test(name)) {
      return { amount: 1, unit: 'each' };
    }
    // Protein portions: typical serving is 150-200g
    if (/breast|steak|fillet|salmon|tuna|chicken|beef|turkey|pork|lamb|prawn|shrimp|tofu/i.test(name)) {
      return { amount: 150, unit: 'g' };
    }
    // Liquids/oils
    if (/oil|milk|juice|coffee/i.test(name)) {
      return { amount: 15, unit: 'ml' };
    }
    // Spreads/sauces
    if (/butter|sauce|dressing|peanut butter|jam|honey/i.test(name)) {
      return { amount: 15, unit: 'g' };
    }
    // Default
    return { amount: 100, unit: 'g' };
  }

  function closeFoodPicker() {
    clearTimeout(fsSearchTimer);
    domFoodPickerModal.classList.remove('open');
  }

  // ==================== SERVINGS PICKER ====================

  function showServingsPicker(foodName, current, callback) {
    var html = '<h3>' + foodName + '</h3>';
    html += '<div class="servings-row">';
    html += '<button id="servDown">−</button>';
    html += '<span class="servings-val" id="servVal">' + current + '</span>';
    html += '<button id="servUp">+</button>';
    html += '</div>';
    html += '<p style="text-align:center;font-size:12px;color:#7e8d9e;">Servings</p>';
    showConfirm(html, [
      { label: 'Cancel', cls: 'btn-cancel', callback: function() { callback(-1); } },
      { label: 'Save', cls: 'btn-save', callback: function() {
        var val = parseFloat(document.getElementById('servVal').textContent) || 1;
        callback(val);
      }}
    ]);
    setTimeout(function() {
      var up = document.getElementById('servUp');
      var down = document.getElementById('servDown');
      var val = document.getElementById('servVal');
      if (up) up.addEventListener('click', function() { val.textContent = (parseFloat(val.textContent) + 0.5).toFixed(1); });
      if (down) down.addEventListener('click', function() { var v = parseFloat(val.textContent) - 0.5; if (v > 0) val.textContent = v.toFixed(1); });
    }, 300);
  }

  function showAmountUnitPicker(foodName, amount, unit, callback, foodId) {
    var html = '<h3>' + foodName + '</h3>';
    html += '<div class="servings-row">';
    html += '<button id="amtDown">−</button>';
    html += '<input type="number" class="servings-val" id="amtVal" value="' + amount + '" min="0" step="any" style="width:90px;text-align:center;background:#0f151b;border:1.5px solid #2a333d;border-radius:10px;color:#e8edf2;font-size:24px;font-weight:700;padding:4px 8px;">';
    html += '<button id="amtUp">+</button>';
    html += '</div>';
    html += '<div style="text-align:center;margin-top:8px;">';
    html += unitSelectHtml(unit).replace('rv-unit', '');
    html += '</div>';
    // Live macro preview
    html += '<div id="amtPreview" style="text-align:center;margin-top:8px;font-size:11px;color:#7e8d9e;min-height:16px;"></div>';
    showConfirm(html, [
      { label: 'Cancel', cls: 'btn-cancel', callback: function() { callback(-1, unit); } },
      { label: 'Save', cls: 'btn-save', callback: function() {
        var val = parseFloat(document.getElementById('amtVal').value) || 1;
        var u = (document.querySelector('#confirmContent select') || {}).value || unit;
        callback(val, u);
      }}
    ]);

    function updatePreview() {
      var preview = document.getElementById('amtPreview');
      if (!preview || foodId == null) return;
      var f = getFoodById(foodId);
      if (!f || !f.per100g) { preview.textContent = ''; return; }
      var v = parseFloat((document.getElementById('amtVal') || {}).value) || 0;
      var u = ((document.querySelector('#confirmContent select') || {}).value) || unit;
      var mult = (u === 'g') ? v / 100 : v;
      var cal = Math.round((f.calories || 0) * mult);
      var pro = Math.round((f.protein  || 0) * mult);
      var fat = Math.round((f.fat      || 0) * mult);
      var carbs = Math.round((f.carbs    || 0) * mult);
      preview.textContent = cal + ' cal | P' + pro + ' F' + fat + ' C' + carbs;
    }

    setTimeout(function() {
      var up = document.getElementById('amtUp');
      var down = document.getElementById('amtDown');
      var val = document.getElementById('amtVal');
      var sel = document.querySelector('#confirmContent select');
      var stepFn = function(dir) {
        var v = parseFloat(val.value);
        var u = (sel || {}).value || unit;
        var step = u === 'g' || u === 'ml' ? 5 : 0.5;
        var n = v + dir * step;
        if (n > 0) { val.value = n.toFixed(1); updatePreview(); }
      };
      if (up) up.addEventListener('click', function() { stepFn(1); });
      if (down) down.addEventListener('click', function() { stepFn(-1); });
      if (val) { val.addEventListener('input', updatePreview); val.focus(); }
      if (sel) sel.addEventListener('change', updatePreview);
      updatePreview();
    }, 300);
  }

  function pickSlotThen(callback) {
    var html = '<h3 style="margin-bottom:12px;">Select meal</h3>';
    var slots = ['breakfast', 'lunch', 'dinner', 'snacks'];
    slots.forEach(function(s) {
      html += '<button class="btn-log-food" style="margin-bottom:6px;" data-pick-slot="' + s + '">' + s.charAt(0).toUpperCase() + s.slice(1) + '</button>';
    });
    showConfirm(html, [{ label: 'Cancel', cls: 'btn-cancel', callback: function() {} }]);
    setTimeout(function() {
      document.querySelectorAll('[data-pick-slot]').forEach(function(btn) {
        btn.addEventListener('click', function() {
          closeConfirm();
          callback(this.dataset.pickSlot);
        });
      });
    }, 300);
  }

  function showTemplatePicker(callback) {
    var html = '<h3 style="margin-bottom:12px;">Select Recipe</h3>';
    mealTemplates.forEach(function(tpl) {
      var names = tpl.items.map(function(i) { var f = getFoodById(i.foodId); return f ? f.name : '?'; }).join(', ');
      html += '<div class="template-card" data-pick-tpl="' + tpl.id + '" style="margin-bottom:6px;">';
      html += '<div class="tpl-name">' + tpl.name + '</div>';
      html += '<div class="tpl-items">' + names + '</div>';
      html += '</div>';
    });
    showConfirm(html, [{ label: 'Cancel', cls: 'btn-cancel', callback: function() {} }]);
    setTimeout(function() {
      document.querySelectorAll('[data-pick-tpl]').forEach(function(card) {
        card.addEventListener('click', function() {
          closeConfirm();
          callback(parseInt(this.dataset.pickTpl));
        });
      });
    }, 300);
  }

  function saveMealAsTemplate(slot) {
    var nut = getNutrition(nutritionDate);
    var meal = null;
    for (var i = 0; i < nut.meals.length; i++) {
      if (nut.meals[i].slot === slot) { meal = nut.meals[i]; break; }
    }
    if (!meal || meal.items.length === 0) { showToast('No items to save'); return; }

    var html = '<h3 style="margin-bottom:12px;">Save Recipe</h3>';
    html += '<input type="text" id="tplNameInput" placeholder="e.g. Post-Workout Meal" style="width:100%;padding:14px;border-radius:12px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:16px;outline:none;">';
    showConfirm(html, [
      { label: 'Cancel', cls: 'btn-cancel', callback: function() {} },
      { label: 'Save', cls: 'btn-save', callback: function() {
        var input = document.getElementById('tplNameInput');
        var name = input ? input.value.trim() : '';
        if (!name) return;
        mealTemplates.push({
          id: Date.now(),
          name: name,
          items: meal.items.map(function(item) {
            var entry = { foodId: item.foodId };
            if (item.amount != null && item.unit) {
              entry.amount = item.amount;
              entry.unit = item.unit;
            } else {
              entry.servings = item.servings || 1;
            }
            return entry;
          })
        });
        saveMealTemplates();
        renderNutritionView();
        showToast('Template "' + name + '" saved!');
      }}
    ]);
    setTimeout(function() {
      var inp = document.getElementById('tplNameInput');
      if (inp) inp.focus();
    }, 300);
  }

  function showAddFoodModal(prefillName, callback) {
    var html = '<h3 style="margin-bottom:12px;">Add Food</h3>';
    html += '<div class="prog-edit-field"><label>Name</label><input type="text" id="addFoodName" placeholder="e.g. Chicken Breast" value="' + (typeof prefillName === 'string' ? prefillName.replace(/"/g, '&quot;') : '') + '"></div>';
    html += '<div class="prog-edit-field"><label>Calories (per serving)</label><input type="number" id="addFoodCal" placeholder="e.g. 280" min="0"></div>';
    html += '<div class="prog-edit-field"><label>Protein (g, per serving)</label><input type="number" id="addFoodPro" placeholder="e.g. 52" min="0"></div>';
    showConfirm(html, [
      { label: 'Cancel', cls: 'btn-cancel', callback: function() { callback('', 0, 0); } },
      { label: 'Save', cls: 'btn-save', callback: function() {
        var n = document.getElementById('addFoodName');
        var c = document.getElementById('addFoodCal');
        var p = document.getElementById('addFoodPro');
        callback(n ? n.value.trim() : '', c ? parseInt(c.value) || 0 : 0, p ? parseInt(p.value) || 0 : 0);
      }}
    ]);
    setTimeout(function() {
      var inp = document.getElementById('addFoodName');
      if (inp) inp.focus();
    }, 300);
  }

  // ==================== AI MACRO ESTIMATE ====================

  function openAiEstimate() {
    domAiEstimateModal.classList.add('open');
    domAiMealInput.value = '';
    domAiResult.innerHTML = '';
    setTimeout(function() { domAiMealInput.focus(); }, 200);
  }

  function closeAiEstimate() {
    domAiEstimateModal.classList.remove('open');
  }

  function callAiEstimate() {
    var apiKey = localStorage.getItem('tallTenderApiKey') || '';
    if (!apiKey) { showToast('Set your DeepSeek API key in Settings first'); return; }

    var mealText = domAiMealInput.value.trim();
    if (!mealText) { showToast('Describe your meal first'); return; }

    var workerUrl = (localStorage.getItem('tallTenderFatSecretUrl') || '').replace(/\/+$/, '');

    if (workerUrl) {
      // --- Worker-available path: DeepSeek → FatSecret lookup ---
      callAiEstimateWithFatSecret(mealText, apiKey, workerUrl);
    } else {
      // --- Fallback path: DeepSeek estimates macros directly (no Worker configured) ---
      callAiEstimateFallback(mealText, apiKey);
    }
  }

  /**
   * New flow: DeepSeek breaks the meal into search terms, then each term
   * is looked up via the FatSecret Worker for real nutrition data.
   */
  function callAiEstimateWithFatSecret(mealText, apiKey, workerUrl) {
    domAiResult.innerHTML = '<div style="text-align:center;padding:20px;color:#7e8d9e;">Breaking down your meal...</div>';

    var prompt = 'Break this meal description into individual food search terms for a nutrition database lookup. Return ONLY a valid JSON array of strings (search terms). Be specific: include preparation method and key ingredients. Examples:\n' +
      '"bowl of oatmeal with banana and honey" → ["oatmeal", "banana", "honey"]\n' +
      '"grilled chicken breast with steamed broccoli and brown rice" → ["grilled chicken breast", "steamed broccoli", "brown rice"]\n' +
      '"turkey sandwich with lettuce tomato and mayo on whole wheat" → ["turkey sandwich", "whole wheat bread", "lettuce", "tomato", "mayonnaise"]\n' +
      'Now process this meal: ' + mealText;

    fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
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

      // Show searching state
      var html = '<div style="font-size:14px;font-weight:600;margin-bottom:8px;">Looking up in FatSecret...</div>';
      terms.forEach(function(term, idx) {
        html += '<div class="food-picker-item" id="fsItem' + idx + '" style="opacity:0.6;">';
        html += '<div><div class="fp-name">' + term + '</div><div class="fp-macros" id="fsMacros' + idx + '">Searching...</div></div>';
        html += '<span class="fp-add" style="font-size:13px;color:#7e8d9e;">...</span>';
        html += '</div>';
      });
      html += '<div style="margin-top:10px;"><button class="btn-save" id="btnConfirmAllFs" style="width:100%;display:none;">Confirm All &amp; Add to ' + pendingFoodSlot + '</button></div>';
      domAiResult.innerHTML = html;

      // Store terms
      domAiResult._fsItems = [];  // populated as lookups complete
      domAiResult._fsPending = terms.length;

      // Look up each term
      terms.forEach(function(term, idx) {
        lookupFatSecretForAi(term, idx, workerUrl);
      });
    })
    .catch(function(err) {
      domAiResult.innerHTML = '<div style="color:#c96a6a;text-align:center;padding:10px;">Error: ' + err.message + '</div>';
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
        domAiResult._fsPending--;
        checkAllFsDone();
        return;
      }

      var fsFood = Array.isArray(foodsList) ? foodsList[0] : foodsList;
      var fsId = fsFood.food_id || '';
      var fsName = fsFood.food_name || term;
      var desc = fsFood.food_description || '';
      var macros = parseFsDescription(desc);

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
          var sv = parseFsServing(s);
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
        domAiResult._fsItems[idx] = { name: fsName, calories: cals, protein: protein };

        // Individual click → import just this one
        el3.querySelector('.fp-add').style.cursor = 'pointer';
        el3.addEventListener('click', function() {
          var item = domAiResult._fsItems[idx];
          if (!item) return;
          var newId = Date.now();
          foods.push({ id: newId, name: item.name, calories: item.calories || 0, protein: item.protein || 0, per100g: true });
          saveFoods();
          var nut = getNutrition(nutritionDate);
          var meal = null;
          for (var i = 0; i < nut.meals.length; i++) {
            if (nut.meals[i].slot === pendingFoodSlot) { meal = nut.meals[i]; break; }
          }
          if (meal) meal.items.push({ foodId: newId, amount: 100, unit: 'g' });
          saveData();
          trackRecentMeal(pendingFoodSlot, meal.items);
          showToast('Imported ' + item.name);
          // Gray out this row
          el3.style.opacity = '0.3';
          el3.style.pointerEvents = 'none';
          domAiResult._fsItems[idx] = null;
        });

        domAiResult._fsPending--;
        checkAllFsDone();
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
      domAiResult._fsPending--;
      checkAllFsDone();
    });
  }

  function checkAllFsDone() {
    if (domAiResult._fsPending <= 0) {
      var btn = document.getElementById('btnConfirmAllFs');
      if (btn) {
        btn.style.display = 'block';
        btn.addEventListener('click', function() {
          var nut = getNutrition(nutritionDate);
          var meal = null;
          for (var i = 0; i < nut.meals.length; i++) {
            if (nut.meals[i].slot === pendingFoodSlot) { meal = nut.meals[i]; break; }
          }
          var added = 0;
          domAiResult._fsItems.forEach(function(item, idx) {
            if (!item) return;
            var newId = Date.now() + idx;
            foods.push({ id: newId, name: item.name, calories: item.calories || 0, protein: item.protein || 0, per100g: true });
            if (meal) meal.items.push({ foodId: newId, amount: 100, unit: 'g' });
            added++;
          });
          saveFoods();
          saveData();
          if (meal) trackRecentMeal(pendingFoodSlot, meal.items);
          closeAiEstimate();
          renderNutritionView();
          showToast('Imported ' + added + ' foods with real nutrition data!');
        });
      }
    }
  }

  /**
   * Original behavior: DeepSeek estimates macros directly.
   * Used when no FatSecret Worker URL is configured.
   */
  function callAiEstimateFallback(mealText, apiKey) {
    domAiResult.innerHTML = '<div style="text-align:center;padding:20px;color:#7e8d9e;">Estimating macros...</div>';

    var prompt = 'Estimate the macros for this meal. Return ONLY a valid JSON array of objects with keys: name (string), calories (number, kcal), protein (number, grams). Be reasonable and specific. Meal: ' + mealText;

    fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You are a nutrition estimator. Return only valid JSON arrays, no other text.' },
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
      if (!Array.isArray(items)) throw new Error('Invalid response');

      var html = '<div style="font-size:12px;color:#7e8d9e;margin-bottom:8px;">AI estimates (no food database configured — <a href="#" id="linkToSettings" style="color:#4caf50;">add one</a> for real data)</div>';
      html += '<div style="font-size:14px;font-weight:600;margin-bottom:8px;">Estimated foods:</div>';
      items.forEach(function(item, idx) {
        html += '<div class="food-picker-item" data-ai-idx="' + idx + '">';
        html += '<div><div class="fp-name">' + item.name + '</div><div class="fp-macros">' + (item.calories || 0) + ' cal | ' + (item.protein || 0) + 'g protein</div></div>';
        html += '<span class="fp-add">+</span>';
        html += '</div>';
      });
      html += '<div style="margin-top:10px;"><button class="btn-save" id="btnConfirmAllAi" style="width:100%;">Confirm All</button></div>';
      domAiResult.innerHTML = html;

      // Link to settings
      var settingsLink = document.getElementById('linkToSettings');
      if (settingsLink) settingsLink.addEventListener('click', function(e) {
        e.preventDefault();
        closeAiEstimate();
        switchView('settings');
      });

      // Store items temporarily
      domAiResult._aiItems = items;

      // Individual add
      domAiResult.querySelectorAll('.food-picker-item').forEach(function(el) {
        el.addEventListener('click', function() {
          var idx = parseInt(this.dataset.aiIdx);
          var item = domAiResult._aiItems[idx];
          if (!item) return;
          var newId = Date.now() + idx;
          foods.push({ id: newId, name: item.name, calories: item.calories || 0, protein: item.protein || 0 });
          saveFoods();
          var nut = getNutrition(nutritionDate);
          var meal = null;
          for (var i = 0; i < nut.meals.length; i++) {
            if (nut.meals[i].slot === pendingFoodSlot) { meal = nut.meals[i]; break; }
          }
          if (meal) meal.items.push({ foodId: newId, servings: 1 });
          saveData();
          trackRecentMeal(pendingFoodSlot, meal.items);
          showToast('Added ' + item.name);
          domAiResult._aiItems[idx] = null;
          el.style.opacity = '0.3';
          el.style.pointerEvents = 'none';
        });
      });

      // Confirm all
      var btnAll = document.getElementById('btnConfirmAllAi');
      if (btnAll) btnAll.addEventListener('click', function() {
        var nut = getNutrition(nutritionDate);
        var meal = null;
        for (var i = 0; i < nut.meals.length; i++) {
          if (nut.meals[i].slot === pendingFoodSlot) { meal = nut.meals[i]; break; }
        }
        domAiResult._aiItems.forEach(function(item, idx) {
          if (!item) return;
          var newId = Date.now() + idx;
          foods.push({ id: newId, name: item.name, calories: item.calories || 0, protein: item.protein || 0 });
          if (meal) meal.items.push({ foodId: newId, servings: 1 });
        });
        saveFoods();
        saveData();
        trackRecentMeal(pendingFoodSlot, meal.items);
        closeAiEstimate();
        renderNutritionView();
        showToast('All items added!');
      });
    })
    .catch(function(err) {
      domAiResult.innerHTML = '<div style="color:#c96a6a;text-align:center;padding:10px;">Error: ' + err.message + '</div>';
    });
  }

  // ==================== MEAL PLAN GENERATOR ====================

  /**
   * USDA / FatSecret verified reference values for common bodybuilding foods.
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
   * FatSecret-verified foods they've already imported). Returns { food, per100g }
   * where per100g has { cal, pro, fat, carb } normalized to 100g, or null.
   */
  function matchLocalFood(desc) {
    var lower = desc.toLowerCase();
    var best = null;
    var bestScore = 0;
    for (var i = 0; i < foods.length; i++) {
      var f = foods[i];
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
   * Validate and correct a single plan item's macros against FOOD_DB + local foods.
   * Returns a corrected item object (or the original if it looks reasonable).
   */
  function validatePlanItem(item) {
    var desc = item.desc || '';
    var grams = parseGrams(desc);

    // Try local food library first (FatSecret-verified)
    var localMatch = matchLocalFood(desc);
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
    var match = matchFoodDb(desc);
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
          var fixed = validatePlanItem(item);
          if (fixed._source) corrections++;
          return fixed;
        });
      }
    }
    return { plan: corrected, corrections: corrections };
  }

  /**
   * Generate a modular meal plan — simple guidelines with alternates.
   * User picks the actual foods from FatSecret by tapping each suggestion.
   * Plan is stored as text notes per meal slot, with tappable food chips.
   */
  function generateMealPlan() {
    var apiKey = localStorage.getItem('tallTenderApiKey') || '';
    if (!apiKey) { showToast('Set your DeepSeek API key in Settings first'); return; }
    var goals = loadGoals();

    var btn = document.getElementById('btnMealPlan');
    if (btn) { btn.textContent = '...'; btn.disabled = true; }

    var nut = getNutrition(nutritionDate);

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
        var t = calcSlotTotals(meal.items);
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
      showToast('All meal slots are already filled!');
      return;
    }

    var remainingCal = Math.max(0, goals.calories - filledCal);
    var remainingPro = Math.max(0, goals.protein - filledPro);
    var remainingFat = Math.max(0, (goals.fat || 0) - filledFat);
    var remainingCarbs = Math.max(0, (goals.carbs || 0) - filledCarbs);

    showToast('Filling ' + emptySlots.length + ' empty slot(s) around ' + filledCal + ' cal already logged...');

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
    promptParts.push('GUIDELINES: Prefer whole foods, including whole eggs (not just whites — the fat is modest and they\'re more practical). Each meal: 30-50g protein from lean meat/fish/eggs/dairy. Favor slow-digesting carbs. Minimal added fats. Use vegetables for volume/satiety.');

    promptParts.push('Return ONLY valid JSON with exactly these keys: ' + JSON.stringify(emptySlots) + '.');
    promptParts.push('Each value is an array of objects: {"desc":"200g chicken breast (grilled, no oil)","cal":330,"pro":62,"fat":7,"carbs":0}.');
    promptParts.push('Include realistic estimates for cal, pro, fat, carbs per item. Return only JSON, no markdown.');

    var prompt = promptParts.join(' ');

    fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You are a science-backed meal planner. Follow a high-protein, moderate-carb, low-fat model. Prioritize lean protein sources (chicken breast, turkey, white fish, lean beef, whole eggs, nonfat Greek yogurt, whey) at every meal. Favor whole eggs over egg whites — the extra few grams of fat are worth the convenience and nutrition, and they fit the model fine as long as total fat stays under target. Keep added fats minimal — avoid oil, butter, cheese, nuts unless essential. Fill remaining calories with complex carbs (rice, potato, oats, whole grains, legumes). Each meal should center on a lean protein.\n\nUSE THESE EXACT VERIFIED VALUES for all macro estimates (per 100g unless noted):\n' + buildFoodDbPrompt() + '\n\nCalculate macros by multiplying the reference value by (grams / 100). For example, 200g chicken breast = 200/100 * 165cal = 330cal, 200/100 * 31g protein = 62g. Be precise. Return ONLY valid JSON, no markdown.' },
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

      // Validate and correct macros against FOOD_DB + local foods
      var vResult = validateAndCorrectPlan(rawPlan);
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

      saveData();
      if (btn) { btn.textContent = '🧠 Generate Meal Plan'; btn.disabled = false; }
      renderNutritionView();
      var msg = 'Meal plan ready — ' + emptySlots.length + ' slot(s) filled!';
      if (vResult.corrections > 0) msg += ' (' + vResult.corrections + ' items verified against USDA data)';
      showToast(msg);
    })
    .catch(function(err) {
      if (btn) { btn.textContent = '🧠 Generate Meal Plan'; btn.disabled = false; }
      showToast('Meal plan failed: ' + err.message);
    });
  }

  // ==================== PROGRESSION COACH ====================

  /**
   * Double Progression + RPE guardrails.
   * After completing all sets for an exercise, suggest whether to increase,
   * maintain, or decrease weight next session.
   */
  function analyzeProgression(exerciseName, dayType) {
    var template = null;
    var prog = programs[dayType];
    for (var i = 0; i < prog.length; i++) {
      if (prog[i].name === exerciseName) { template = prog[i]; break; }
    }
    if (!template) return null;

    // Parse rep range (e.g. "8-12" → [8, 12], "8-12/leg" → [8, 12])
    var repRange = template.reps.match(/(\d+)\s*-\s*(\d+)/);
    if (!repRange) return null;
    var low = parseInt(repRange[1]);
    var high = parseInt(repRange[2]);

    // Get this workout's sets for the exercise
    var cw = appData.currentWorkout;
    var ex = null;
    for (var j = 0; j < cw.exercises.length; j++) {
      if (cw.exercises[j].name === exerciseName) { ex = cw.exercises[j]; break; }
    }
    if (!ex || !ex.sets.length) return null;

    // Check if all sets are logged
    var totalSets = template.sets;
    var allDone = ex.sets.length >= totalSets && ex.sets.every(function(s) { return s && s.reps > 0; });
    if (!allDone) return null;

    // Evaluate each working set (exclude warmups: low RPE, high reps, or <60% top weight)
    var workingSets = ex.sets.filter(function(s) {
      if (!s || !s.reps) return false;
      if (s.rpe && s.rpe <= 6 && s.reps >= 5) return false; // warmup by RPE
      return true;
    });
    // Also filter by weight: exclude sets <60% of the top set
    var topW = workingSets.reduce(function(m, s) { return Math.max(m, s.weight || 0); }, 0);
    workingSets = workingSets.filter(function(s) { return (s.weight || 0) >= topW * 0.6; });
    if (!workingSets.length) workingSets = ex.sets.filter(function(s) { return s && s.reps > 0; });

    var allHitTop = workingSets.every(function(s) { return s.reps >= high; });
    var anyBelowBottom = workingSets.some(function(s) { return s.reps < low; });
    var avgRpe = workingSets.reduce(function(sum, s) { return sum + (s.rpe || 0); }, 0) / workingSets.length;
    var topWeight = workingSets.reduce(function(max, s) { return Math.max(max, s.weight || 0); }, 0);

    // Decision tree
    var action, message, color;
    if (allHitTop && avgRpe <= 9 && avgRpe > 0) {
      var increase = topWeight < 50 ? 2.5 : (topWeight < 100 ? 5 : 10);
      action = 'increase';
      message = 'Add ' + increase + 'kg next session — all sets hit top of range @RPE ' + avgRpe.toFixed(0);
      color = '#4caf50';
    } else if (anyBelowBottom) {
      action = 'decrease';
      message = 'Back off weight — sets falling below ' + low + ' reps. Reduce 5-10% next session';
      color = '#ef5350';
    } else if (avgRpe >= 9.5) {
      action = 'hold';
      message = 'Hold weight — at RPE limit (' + avgRpe.toFixed(0) + '). Build more volume before increasing';
      color = '#ffb74d';
    } else {
      action = 'maintain';
      message = 'Keep weight, push for ' + high + ' reps — building volume before next jump';
      color = '#7e8d9e';
    }

    return { action: action, message: message, color: color, topWeight: topWeight, avgRpe: avgRpe, low: low, high: high };
  }

  /**
   * Check for deload recommendation based on consecutive weeks of decline.
   */
  function checkDeload(exerciseName) {
    var lastWeeks = [];
    var now = new Date();
    // Group workouts by week, find top weight per week for this exercise
    var weekMap = {};
    for (var i = appData.workouts.length - 1; i >= 0; i--) {
      var w = appData.workouts[i];
      var wDate = new Date(w.startedAt || w.completedAt || 0);
      var weekKey = wDate.getFullYear() + '-W' + Math.floor((wDate - new Date(wDate.getFullYear(), 0, 1)) / 604800000);
      if (!weekMap[weekKey]) {
        weekMap[weekKey] = { date: wDate, topWeight: 0 };
      }
      for (var j = 0; j < w.exercises.length; j++) {
        if (w.exercises[j].name === exerciseName) {
          var sets = w.exercises[j].sets.filter(function(s) { return s && s.reps > 0; });
          sets.forEach(function(s) {
            if (s.weight > weekMap[weekKey].topWeight) weekMap[weekKey].topWeight = s.weight;
          });
        }
      }
    }

    var weeks = Object.keys(weekMap).sort();
    if (weeks.length < 4) return null; // need at least 4 weeks of data

    // Check last 3 weeks for decline
    var recent = weeks.slice(-3);
    var weights = recent.map(function(wk) { return weekMap[wk].topWeight; });
    var declining = weights[0] > weights[1] && weights[1] > weights[2];

    // Also check: last workout was more than 7 days ago
    var lastWorkout = appData.workouts[appData.workouts.length - 1];
    var daysSinceLast = lastWorkout ? Math.floor((now - new Date(lastWorkout.startedAt || lastWorkout.completedAt || 0)) / 86400000) : 0;

    if (declining) {
      return {
        deload: true,
        severity: 'warning',
        message: 'Consider a deload week — top weight declining for 3 consecutive weeks. Train at 50-60% for one week, then resume.'
      };
    } else if (daysSinceLast > 10) {
      return {
        deload: true,
        severity: 'info',
        message: daysSinceLast + ' days since last workout. Start light (80-90% of last working weight) and ramp up over 2-3 sets.'
      };
    }
    return null;
  }

  function renderProgressionCoach(exerciseName, dayType) {
    var result = analyzeProgression(exerciseName, dayType);
    var deloadResult = checkDeload(exerciseName);
    var html = '';

    if (result) {
      html += '<div class="prog-coach" style="margin:6px 0;padding:10px 12px;border-radius:10px;background:#0f151b;border-left:3px solid ' + result.color + ';">';
      html += '<div style="font-size:12px;font-weight:600;color:' + result.color + ';">Progression Coach</div>';
      html += '<div style="font-size:11px;color:#a0b0c0;margin-top:2px;">' + result.message + '</div>';
      if (result.action === 'increase') {
        html += '<div style="font-size:10px;color:#5a7a6a;margin-top:2px;">Top set: ' + result.topWeight + 'kg × ' + result.high + ' reps all sets</div>';
      }
      html += '</div>';
    }

    if (deloadResult) {
      html += '<div class="prog-coach deload" style="margin:6px 0;padding:10px 12px;border-radius:10px;background:#1a1515;border-left:3px solid ' + (deloadResult.severity === 'warning' ? '#ef5350' : '#ffb74d') + ';">';
      html += '<div style="font-size:12px;font-weight:600;color:' + (deloadResult.severity === 'warning' ? '#ef5350' : '#ffb74d') + ';">🔄 Recovery Check</div>';
      html += '<div style="font-size:11px;color:#a0b0c0;margin-top:2px;">' + deloadResult.message + '</div>';
      html += '</div>';
    }

    return html;
  }

  function isProgressionCoachEnabled() {
    try {
      return localStorage.getItem('tallTenderProgCoach') !== 'false';
    } catch (e) { return true; }
  }

  // ==================== NAVIGATION ====================

  function switchView(viewName) {
    currentView = viewName;

    // Update tab bar
    domTabBar.querySelectorAll('.tab-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Show/hide views
    document.querySelectorAll('.view').forEach(function(v) {
      v.classList.remove('active');
    });
    var targetView = document.getElementById('view-' + viewName);
    if (targetView) targetView.classList.add('active');

    // Clear clock interval when leaving workout view
    if (viewName !== 'workout' && clockInterval) {
      clearInterval(clockInterval);
      clockInterval = null;
    }

    // Render the view
    if (viewName === 'workout') {
      renderWorkoutView();
    } else if (viewName === 'archive') {
      renderArchiveView();
    } else if (viewName === 'stats') {
      renderStatsView();
    } else if (viewName === 'settings') {
      renderSettingsView();
    } else if (viewName === 'nutrition') {
      nutritionDate = todayStr();
      renderNutritionView();
    }
  }

  // ==================== EVENT BINDINGS ====================

  // Tab bar
  domTabBar.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var view = this.dataset.view;
      if (view !== currentView) {
        haptic();
        switchView(view);
      }
    });
  });

  // Set modal
  domModalSaveBtn.addEventListener('click', handleSaveSet);
  domModalCancelBtn.addEventListener('click', closeSetModal);
  domSetModal.addEventListener('click', function(e) {
    if (e.target === domSetModal) closeSetModal();
  });

  // Set modal — weight stepper buttons
  domSetModal.addEventListener('click', function(e) {
    var btn = e.target.closest('.step-btn');
    if (btn) {
      e.preventDefault();
      var step = parseFloat(btn.dataset.step);
      var current = parseFloat(domModalWeight.value) || 0;
      var next = Math.max(0, Math.round((current + step) * 10) / 10);
      domModalWeight.value = next || '';
      updatePlateCalc();
      updateWarmupHint();
      haptic();
      return;
    }
    // Warm-up button
    if (e.target.closest('#modalWarmupBtn')) {
      e.preventDefault();
      fillWarmup();
    }
  });

  // Plate calc + warmup hint update on weight input
  domModalWeight.addEventListener('input', function() {
    updatePlateCalc();
    updateWarmupHint();
  });

  // Set modal keyboard shortcuts
  domModalWeight.addEventListener('keydown', function(e) { if (e.key === 'Enter') { domModalReps.focus(); e.preventDefault(); } });
  domModalReps.addEventListener('keydown', function(e) { if (e.key === 'Enter') { domModalRpe.focus(); e.preventDefault(); } });
  domModalRpe.addEventListener('keydown', function(e) { if (e.key === 'Enter') { handleSaveSet(); } });
  domModalNotes.addEventListener('keydown', function(e) {
    // Allow Enter for newlines in notes, save on Ctrl+Enter
    if (e.key === 'Enter' && e.ctrlKey) { handleSaveSet(); }
  });

  // Skip exercise modal
  initSkipModal();

  // Confirm modal overlay
  domConfirmModal.addEventListener('click', function(e) {
    if (e.target === domConfirmModal) closeConfirm();
  });

  // Import file input
  domImportInput.addEventListener('change', function() {
    var file = this.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function(e) {
      importData(e.target.result);
    };
    reader.readAsText(file);
    // Reset so same file can be imported again
    domImportInput.value = '';
  });

  // Food picker modal
  domFoodPickerModal.addEventListener('click', function(e) {
    if (e.target === domFoodPickerModal) closeFoodPicker();
  });
  document.getElementById('foodPickerCancel').addEventListener('click', closeFoodPicker);
  domFoodSearchInput.addEventListener('input', function() {
    renderFoodPickerList(this.value);
  });
  domFoodSearchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      var q = this.value.trim();
      if (q) {
        showAddFoodModal(q, function(name, cal, pro) {
          if (!name) return;
          var newId = Date.now();
          foods.push({ id: newId, name: name, calories: cal, protein: pro });
          saveFoods();
          var nut = getNutrition(nutritionDate);
          var meal = null;
          for (var i = 0; i < nut.meals.length; i++) {
            if (nut.meals[i].slot === pendingFoodSlot) { meal = nut.meals[i]; break; }
          }
          if (meal) meal.items.push({ foodId: newId, servings: 1 });
          saveData();
          trackRecentMeal(pendingFoodSlot, meal.items);
          closeFoodPicker();
          renderNutritionView();
          showToast('Added "' + name + '"');
        });
      }
    }
  });

  // AI estimate modal
  domAiEstimateModal.addEventListener('click', function(e) {
    if (e.target === domAiEstimateModal) closeAiEstimate();
  });
  document.getElementById('aiEstimateCancel').addEventListener('click', closeAiEstimate);
  domAiEstimateBtn.addEventListener('click', callAiEstimate);
  domAiMealInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && e.ctrlKey) callAiEstimate();
  });

  // Save on visibility change
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) saveData();
  });

  // ==================== BOOT ====================

  loadData();
  loadPrograms();
  loadFoods();
  loadMealTemplates();
  loadRecentMeals();
  loadTimerSettings();
  timerRemaining = timerDuration;
  switchView('workout');

})();
