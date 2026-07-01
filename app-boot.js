window.App = window.App || {};

(function() {
  'use strict';

  var App = window.App;
  var s = App.state;
  var dom = App.dom;

  // ==================== REMAINING EVENT BINDINGS ====================

  App.initAIEstimateEvents = function() {
    // AI estimate modal overlay
    dom.aiEstimateModal.addEventListener('click', function(e) {
      if (e.target === dom.aiEstimateModal) App.closeAiEstimate();
    });
    document.getElementById('aiEstimateCancel').addEventListener('click', App.closeAiEstimate);
    dom.aiEstimateBtn.addEventListener('click', App.callAiEstimate);
    dom.aiMealInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && e.ctrlKey) App.callAiEstimate();
    });
  };

  // ==================== INIT ALL ====================

  App.initAll = function() {
    // Wire up all event listeners
    App.initTabBar();
    App.initWorkoutEvents();
    App.initImportEvents();
    App.initFoodPickerEvents();
    App.initAIEstimateEvents();

    // Save on visibility change
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) App.saveData();
    });
  };

  // ==================== BOOT ====================

  App.boot = function() {
    App.loadData();
    App.loadPrograms();
    App.loadFoods();
    App.loadMealTemplates();
    App.loadRecentMeals();
    App.loadTimerSettings();
    s.timerRemaining = s.timerDuration;
    s.nutritionDate = App.todayStr();
    App.initAll();
    App.switchView('workout');
  };

  // Auto-boot when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', App.boot);
  } else {
    App.boot();
  }

})();
