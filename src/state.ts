import type { AppState, DomRefs } from './types';
import type { FoodItem, MealTemplate, RecentMeal } from './types';

// ==================== DOM HELPER ====================

export function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

// ==================== NUTRITION DATA ====================

export const foods: FoodItem[] = [];
export const mealTemplates: MealTemplate[] = [];
export const recentMeals: RecentMeal[] = [];

// ==================== SHARED MUTABLE STATE ====================

export const state: AppState = {
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
  timerAutoStart: true,
};

// ==================== DOM REFS ====================

export const dom: DomRefs = {
  workoutContent: $('workoutContent'),
  archiveContent: $('archiveContent'),
  statsContent: $('statsContent'),
  settingsContent: $('settingsContent'),
  tabBar: $('tabBar'),
  setModal: $('setModal'),
  confirmModal: $('confirmModal'),
  toast: $('toast'),
  importInput: $('importFileInput') as HTMLInputElement | null,
  nutritionContent: $('nutritionContent'),
  foodPickerModal: $('foodPickerModal'),
  foodSearchInput: $('foodSearchInput') as HTMLInputElement | null,
  foodPickerList: $('foodPickerList'),
  aiEstimateModal: $('aiEstimateModal'),
  aiMealInput: $('aiMealInput') as HTMLTextAreaElement | null,
  aiResult: $('aiResult'),
  aiEstimateBtn: $('aiEstimateBtn') as HTMLButtonElement | null,
  modalExName: $('modalExName'),
  modalSetInfo: $('modalSetInfo'),
  modalWeight: $('modalWeight') as HTMLInputElement | null,
  modalReps: $('modalReps') as HTMLInputElement | null,
  modalRpe: $('modalRpe') as HTMLInputElement | null,
  modalNotes: $('modalNotes') as HTMLTextAreaElement | null,
  modalSaveBtn: $('modalSaveBtn') as HTMLButtonElement | null,
  modalCancelBtn: $('modalCancelBtn') as HTMLButtonElement | null,
  confirmContent: $('confirmContent'),
  confirmActions: $('confirmActions'),
};
