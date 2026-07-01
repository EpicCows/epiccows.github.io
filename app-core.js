window.App = window.App || {};

(function() {
  'use strict';

  var App = window.App;

  // ==================== PWA REGISTRATION ====================
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('sw.js').catch(function() {});
    });
  }

  // ==================== CONSTANTS ====================

  App.PROFILE = localStorage.getItem('tallTenderProfile') || 'default';
  App.FATSECRET_WORKER = 'https://fatsecret-proxy.jockgrieve.workers.dev';
  App.STORAGE_KEY  = 'tallTenderData_' + App.PROFILE;
  App.PROGRAMS_KEY = 'tallTenderPrograms_' + App.PROFILE;

  App.FOODS_KEY = 'tallTenderFoods_' + App.PROFILE;
  App.TEMPLATES_KEY = 'tallTenderMealTemplates_' + App.PROFILE;
  App.RECENT_MEALS_KEY = 'tallTenderRecentMeals_' + App.PROFILE;
  App.GOALS_KEY = 'tallTenderGoals_' + App.PROFILE;
  App.REVIEW_EMAIL_KEY = 'tallTenderReviewEmail_' + App.PROFILE;
  App.REVIEW_OPTIN_KEY = 'tallTenderReviewOptIn_' + App.PROFILE;
  App.MAX_RECENT_MEALS = 20;

  App.BUILTIN_PROGRAMS = {
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

  App.PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

  // ==================== PROGRAMS STATE ====================

  App.programs = {};

  App.loadPrograms = function() {
    try {
      var raw = localStorage.getItem(App.PROGRAMS_KEY);
      if (raw) {
        App.programs = JSON.parse(raw);
        if (Object.keys(App.programs).length === 0) throw new Error('empty');
        App.migratePrograms();
      } else {
        throw new Error('no data');
      }
    } catch (e) {
      App.programs = JSON.parse(JSON.stringify(App.BUILTIN_PROGRAMS));
      App.savePrograms();
      console.warn('loadPrograms: falling back to built-in programs', e);
    }
  };

  App.migratePrograms = function() {
    var upperA = App.programs['Upper A'];
    if (upperA && upperA.length === 6) {
      var hasSmith = upperA.some(function(ex) { return ex.name.indexOf('Smith') >= 0; });
      var hasSkull = upperA.some(function(ex) { return ex.name.indexOf('Skullcrusher') >= 0; });
      var hasRow = upperA.some(function(ex) { return ex.name.toLowerCase().indexOf('row') >= 0; });
      if (hasSmith && hasSkull && !hasRow) {
        App.programs['Upper A'] = JSON.parse(JSON.stringify(App.BUILTIN_PROGRAMS['Upper A']));
        console.log('Migrated Upper A to optimized program');
      }
    }
    var lowerA = App.programs['Lower A'];
    if (lowerA && lowerA.length === 6) {
      var hasLunges = lowerA.some(function(ex) { return ex.name.indexOf('Lunges') >= 0; });
      var hasLegCurl = lowerA.some(function(ex) { return ex.name.indexOf('Leg Curls') >= 0; });
      var hasLying = lowerA.some(function(ex) { return ex.name.indexOf('Lying') >= 0; });
      if ((hasLunges && !hasLegCurl) || hasLying) {
        App.programs['Lower A'] = JSON.parse(JSON.stringify(App.BUILTIN_PROGRAMS['Lower A']));
        console.log('Migrated Lower A to optimized program');
      }
    }
    var upperB = App.programs['Upper B'];
    if (upperB && upperB.length === 6 && !upperB[0].cue) {
      App.programs['Upper B'] = JSON.parse(JSON.stringify(App.BUILTIN_PROGRAMS['Upper B']));
      console.log('Migrated Upper B cues');
    }
    var lowerB = App.programs['Lower B'];
    if (lowerB && lowerB.length === 6 && !lowerB[0].cue) {
      App.programs['Lower B'] = JSON.parse(JSON.stringify(App.BUILTIN_PROGRAMS['Lower B']));
      console.log('Migrated Lower B cues');
    }
    if (upperA && upperA[0] && upperA[0].reps === '8-12') {
      App.programs['Upper A'] = JSON.parse(JSON.stringify(App.BUILTIN_PROGRAMS['Upper A']));
    }
    if (upperB && upperB[0] && upperB[0].reps === '8-12') {
      App.programs['Upper B'] = JSON.parse(JSON.stringify(App.BUILTIN_PROGRAMS['Upper B']));
    }
    if (lowerA && lowerA[0] && (lowerA[0].reps === '8-12/leg' || lowerA[0].name.indexOf('Bulgarian') >= 0)) {
      App.programs['Lower A'] = JSON.parse(JSON.stringify(App.BUILTIN_PROGRAMS['Lower A']));
    }
    if (lowerB && lowerB[0] && lowerB[0].reps === '8-12') {
      App.programs['Lower B'] = JSON.parse(JSON.stringify(App.BUILTIN_PROGRAMS['Lower B']));
    }
    App.savePrograms();
  };

  App.savePrograms = function() {
    try {
      localStorage.setItem(App.PROGRAMS_KEY, JSON.stringify(App.programs));
    } catch (e) { console.warn('savePrograms failed', e); }
  };

  App.resetPrograms = function() {
    App.programs = JSON.parse(JSON.stringify(App.BUILTIN_PROGRAMS));
    App.savePrograms();
  };

  // ==================== NUTRITION DATA STATE ====================

  App.foods = [];
  App.mealTemplates = [];
  App.recentMeals = [];

  // ==================== SHARED MUTABLE STATE ====================

  App.state = {
    appData: { workouts: [], currentWorkout: null, nutrition: {} },
    currentView: 'workout',
    nutritionDate: '', // set at boot
    pendingSetExIdx: null,
    pendingSetIdx: null,
    pendingConfirmCallback: null,
    pendingSkipExIdx: null,
    pendingFoodSlot: 'breakfast',
    pendingServingsFoodId: null,
    clockInterval: null,
    // Timer state
    timerDuration: 60,
    timerRemaining: 60,
    timerInterval: null,
    timerRunning: false,
    timerAutoStart: true
  };

  // ==================== DOM REFS ====================

  App.$ = function(id) { return document.getElementById(id); };

  App.dom = {
    workoutContent:  App.$('workoutContent'),
    archiveContent:  App.$('archiveContent'),
    statsContent:    App.$('statsContent'),
    settingsContent: App.$('settingsContent'),
    tabBar:          App.$('tabBar'),
    setModal:        App.$('setModal'),
    confirmModal:    App.$('confirmModal'),
    toast:           App.$('toast'),
    importInput:     App.$('importFileInput'),
    // Nutrition
    nutritionContent:   App.$('nutritionContent'),
    foodPickerModal:    App.$('foodPickerModal'),
    foodSearchInput:    App.$('foodSearchInput'),
    foodPickerList:     App.$('foodPickerList'),
    aiEstimateModal:    App.$('aiEstimateModal'),
    aiMealInput:        App.$('aiMealInput'),
    aiResult:           App.$('aiResult'),
    aiEstimateBtn:      App.$('aiEstimateBtn'),
    // Set modal inputs
    modalExName:   App.$('modalExName'),
    modalSetInfo:  App.$('modalSetInfo'),
    modalWeight:   App.$('modalWeight'),
    modalReps:     App.$('modalReps'),
    modalRpe:      App.$('modalRpe'),
    modalNotes:    App.$('modalNotes'),
    modalSaveBtn:  App.$('modalSaveBtn'),
    modalCancelBtn: App.$('modalCancelBtn'),
    // Confirm modal
    confirmContent: App.$('confirmContent'),
    confirmActions: App.$('confirmActions')
  };

})();
