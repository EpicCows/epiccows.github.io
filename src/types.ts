// ==================== WORKOUT TYPES ====================

export interface ExerciseTemplate {
  name: string;
  sets: number;
  reps: string;
  cue?: string;
  note?: string;
}

export interface WorkoutSet {
  weight: number;
  reps: number;
  rpe: number;
  notes: string;
}

export interface WorkoutExercise {
  name: string;
  sets: WorkoutSet[];
  extraSets?: number;
  skipReason?: string;
  skipNote?: string;
}

export interface CurrentWorkout {
  date: string;
  startTime: string;
  startTimestamp: number;
  dayType: string;
  exercises: WorkoutExercise[];
  cardioDone?: boolean;
}

export interface CompletedExercise {
  name: string;
  sets: WorkoutSet[];
}

export interface CompletedWorkout {
  id: number;
  date: string;
  startTime: string;
  endTime: string;
  dayType: string;
  exercises: CompletedExercise[];
  totalVolume: number;
  avgRpe: number;
}

// ==================== NUTRITION TYPES ====================

export interface FoodItem {
  id: number;
  name: string;
  calories: number;
  protein: number;
  fat?: number;
  carbs?: number;
  per100g?: boolean;
}

export interface MealEntry {
  foodId: number;
  servings?: number;
  amount?: number;
  unit?: string;
}

export interface PlanNoteItem {
  desc: string;
  cal: number;
  pro: number;
  fat?: number;
  carbs?: number;
  _source?: string;
}

export interface SurpriseRecipe {
  name: string;              // catchy name like "Crispy Gochujang Chicken Bowls"
  desc: string;              // one-line description
  portions: number;          // suggested number of portions
  caloriesPerPortion: number;
  proteinPerPortion: number;
  fatPerPortion: number;
  carbsPerPortion: number;
  prepTime: string;          // e.g. "45 min"
  freezesWell: boolean;
  ingredients: string[];     // shopping list items with amounts
  instructions: string;      // numbered steps
  mealPrepTips: string;      // storage/reheating tips
}

export interface SurpriseMealPlan {
  recipes: SurpriseRecipe[];
  totalPortions: number;
  suggestedDays: number;
  macroSummary: string;      // e.g. "Averaged across all meals: ~520 cal, 42P, 14F, 58C"
}

export interface MealSlot {
  slot: string;
  items: MealEntry[];
  notes: string;
  planNotes?: PlanNoteItem[] | null;
}

export interface DailyNutrition {
  meals: MealSlot[];
}

export interface RecentMeal {
  id: number;
  name: string;
  slot: string;
  items: MealEntry[];
  lastUsed: string;
  useCount: number;
}

export interface MealTemplate {
  id: number;
  name: string;
  items: MealEntry[];
}

export interface Goals {
  calories: number;
  protein: number;
  fat: number;
  carbs: number;
  height: number;
  age: number;
}

// ==================== APP DATA ====================

export interface AppData {
  workouts: CompletedWorkout[];
  currentWorkout: CurrentWorkout | null;
  nutrition: Record<string, DailyNutrition>;
  bodyweight?: Record<string, number>;
  cardioLog?: Record<string, boolean>;
}

// ==================== APP STATE ====================

export interface AppState {
  appData: AppData;
  currentView: string;
  nutritionDate: string;
  pendingSetExIdx: number | null;
  pendingSetIdx: number | null;
  pendingConfirmCallback: (() => void) | null;
  pendingSkipExIdx: number | null;
  pendingFoodSlot: string;
  pendingServingsFoodId: number | null;
  clockInterval: ReturnType<typeof setInterval> | null;
  timerDuration: number;
  timerRemaining: number;
  timerInterval: ReturnType<typeof setInterval> | null;
  timerRunning: boolean;
  timerAutoStart: boolean;
}

// ==================== DOM REFS ====================

export interface DomRefs {
  workoutContent: HTMLElement | null;
  archiveContent: HTMLElement | null;
  statsContent: HTMLElement | null;
  settingsContent: HTMLElement | null;
  tabBar: HTMLElement | null;
  setModal: HTMLElement | null;
  confirmModal: HTMLElement | null;
  toast: HTMLElement | null;
  importInput: HTMLInputElement | null;
  nutritionContent: HTMLElement | null;
  foodPickerModal: HTMLElement | null;
  foodSearchInput: HTMLInputElement | null;
  foodPickerList: HTMLElement | null;
  aiEstimateModal: HTMLElement | null;
  aiMealInput: HTMLTextAreaElement | null;
  aiResult: HTMLElement | null;
  aiEstimateBtn: HTMLButtonElement | null;
  modalExName: HTMLElement | null;
  modalSetInfo: HTMLElement | null;
  modalWeight: HTMLInputElement | null;
  modalReps: HTMLInputElement | null;
  modalRpe: HTMLInputElement | null;
  modalNotes: HTMLTextAreaElement | null;
  modalSaveBtn: HTMLButtonElement | null;
  modalCancelBtn: HTMLButtonElement | null;
  modalClearBtn: HTMLButtonElement | null;
  confirmContent: HTMLElement | null;
  confirmActions: HTMLElement | null;
}

// ==================== PROGRAMS ====================

export type Programs = Record<string, ExerciseTemplate[]>;
