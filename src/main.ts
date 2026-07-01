import './styles.css';

import { state, dom } from './state';
import { todayStr } from './utils';
import { loadData, saveData, loadFoods, loadMealTemplates, loadRecentMeals } from './data';
import { loadPrograms } from './core';
import { loadTimerSettings, initTabBar, switchView } from './ui';
import { initWorkoutEvents } from './workout';
import { initFoodPickerEvents } from './food-picker';
import { initImportEvents } from './data';
import { closeAiEstimate, callAiEstimate } from './ai';

// ==================== EVENT BINDINGS ====================

function initAIEstimateEvents(): void {
  if (dom.aiEstimateModal) {
    dom.aiEstimateModal.addEventListener('click', function(e) {
      if (e.target === dom.aiEstimateModal) closeAiEstimate();
    });
  }
  const aiCancel = document.getElementById('aiEstimateCancel');
  if (aiCancel) aiCancel.addEventListener('click', closeAiEstimate);
  if (dom.aiEstimateBtn) dom.aiEstimateBtn.addEventListener('click', callAiEstimate);
  if (dom.aiMealInput) {
    dom.aiMealInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && e.ctrlKey) callAiEstimate();
    });
  }
}

function initAll(): void {
  initTabBar();
  initWorkoutEvents();
  initImportEvents();
  initFoodPickerEvents();
  initAIEstimateEvents();

  document.addEventListener('visibilitychange', function() {
    if (document.hidden) saveData();
  });
}

// ==================== MODULE SELF-TEST ====================

function selfTest(): void {
  const required = [
    'renderWorkoutView', 'renderNutritionView', 'renderSettingsView', 'renderStatsView',
    'renderArchiveView', 'openFoodPicker', 'openAiEstimate', 'generateMealPlan',
  ];
  // Dynamic import checks — these would be caught at compile time by TS anyway
  // but this guards against dynamic loading issues
  const app = (window as any).App;
  if (!app) return; // New TS build, skip legacy check
  const missing: string[] = [];
  required.forEach(function(fn) {
    if (typeof app[fn] !== 'function') missing.push(fn);
  });
  if (missing.length > 0) {
    console.error('MODULE LOAD FAILURE — missing:', missing.join(', '));
  }
}

// ==================== BOOT ====================

function boot(): void {
  loadData();
  loadPrograms();
  loadFoods();
  loadMealTemplates();
  loadRecentMeals();
  loadTimerSettings();
  state.timerRemaining = state.timerDuration;
  state.nutritionDate = todayStr();
  initAll();
  switchView('workout');
  selfTest();
}

// PWA registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js').catch(function() {});
  });
}

// Auto-boot when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
