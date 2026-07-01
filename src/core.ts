import type { Programs, ExerciseTemplate } from './types';

// ==================== CONSTANTS ====================

export const PROFILE: string = localStorage.getItem('tallTenderProfile') || 'default';
export const FATSECRET_WORKER = 'https://fatsecret-proxy.jockgrieve.workers.dev';
export const STORAGE_KEY = 'tallTenderData_' + PROFILE;
export const PROGRAMS_KEY = 'tallTenderPrograms_' + PROFILE;

export const FOODS_KEY = 'tallTenderFoods_' + PROFILE;
export const TEMPLATES_KEY = 'tallTenderMealTemplates_' + PROFILE;
export const RECENT_MEALS_KEY = 'tallTenderRecentMeals_' + PROFILE;
export const GOALS_KEY = 'tallTenderGoals_' + PROFILE;
export const REVIEW_EMAIL_KEY = 'tallTenderReviewEmail_' + PROFILE;
export const REVIEW_OPTIN_KEY = 'tallTenderReviewOptIn_' + PROFILE;
export const MAX_RECENT_MEALS = 20;

export const BUILTIN_PROGRAMS: Programs = {
  'Upper A': [
    { name: 'Machine Chest Press', sets: 3, reps: '8-12', cue: 'Pinch shoulders back. Elbows ~45°. Press through palms. Safe on tendons.' },
    { name: 'Seated Cable Row (V-Grip)', sets: 3, reps: '8-12', cue: 'Pull to sternum. Pinch shoulder blades. No momentum.' },
    { name: 'Seated DB Shoulder Press', sets: 3, reps: '12-15', cue: 'Slight forward lean. Stop at ear level. Light+controlled. Protect labrum.' },
    { name: 'Cable Lateral Raises', sets: 3, reps: '12-15', cue: 'Cable behind back. Lead with elbow. Pause at top.' },
    { name: 'Pec Deck Fly', sets: 3, reps: '10-12', cue: 'Elbows bent ~15°. Stretch then squeeze. Control negative.' },
    { name: 'Overhead Rope Tricep Ext.', sets: 3, reps: '10-12', cue: 'Elbows near ears. Full stretch overhead. No shoulder flare.' },
  ],
  'Lower A': [
    { name: 'Smith Machine Squat', sets: 3, reps: '6-10', cue: 'Feet slightly forward. Depth to parallel. Drive through midfoot. Safe on knees.' },
    { name: 'Standard Leg Press', sets: 3, reps: '8-12', cue: 'Feet high+wide. Deep but no butt wink. Press through midfoot.' },
    { name: 'Leg Extensions', sets: 3, reps: '12-15', cue: 'Pause at top 1s. Control negative. No hip lift off pad.' },
    { name: 'Seated Leg Curls', sets: 3, reps: '10-12', cue: 'Pause at peak contraction. Control eccentric 3s. No hip lift.' },
    { name: 'Seated Calf Raises', sets: 4, reps: '12-15', cue: 'Pause at bottom 2s. Explode up. Soleus = bent knee.' },
    { name: 'Cable Rope Crunch', sets: 3, reps: '10-12', cue: 'Round spine. Rope behind head. Crunch, don\'t hip hinge.' },
  ],
  'Upper B': [
    { name: 'Neutral Grip Lat Pulldowns', sets: 3, reps: '6-10', cue: 'Chest to bar. Drive elbows down+back. No lean-back swing.' },
    { name: 'Supported DB Row', sets: 3, reps: '8-12', cue: 'Chest on pad. Full stretch at bottom. Squeeze at top.' },
    { name: 'Seated Cable Row (V-Grip)', sets: 3, reps: '8-12', cue: 'Pull to sternum. Pinch shoulder blades. No momentum.' },
    { name: 'Face Pulls', sets: 3, reps: '12-15', cue: 'Rope to forehead. External rotate at end. Hold 1s.' },
    { name: 'DB Hammer Curls', sets: 3, reps: '10-12', cue: 'Neutral grip. No shoulder swing. Full stretch at bottom.' },
    { name: 'Cable Rope Curls', sets: 3, reps: '12-15', cue: 'Elbows locked at sides. Squeeze at peak. Slow negative.' },
  ],
  'Lower B': [
    { name: 'Trap Bar Deadlift', sets: 3, reps: '6-10', cue: 'Hips high. Push floor away. Brace core hard. No rounded back.' },
    { name: 'DB Romanian Deadlifts', sets: 3, reps: '8-12', cue: 'Soft knees. Hinge at hips. Feel hamstring stretch. Flat back.' },
    { name: 'Seated Leg Curls', sets: 3, reps: '10-12', cue: 'Pause at peak contraction. Control eccentric 3s. No hip lift.' },
    { name: '45° Back Extensions', sets: 3, reps: '10-12', cue: 'Hinge at hips, not spine. Squeeze glutes at top. Controlled.' },
    { name: 'Standing Calf Raises', sets: 4, reps: '12-15', cue: 'Full stretch 2s at bottom. Explode up. Straight knees = gastroc.' },
    { name: 'Decline Bench Sit-up', sets: 3, reps: '10-12', cue: 'Control down. Hands near temples. Don\'t yank neck.' },
  ],
};

export const PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

// ==================== PROGRAMS STATE ====================

export let programs: Programs = {};

export function loadPrograms(): void {
  try {
    const raw = localStorage.getItem(PROGRAMS_KEY);
    if (raw) {
      programs = JSON.parse(raw);
      if (Object.keys(programs).length === 0) throw new Error('empty');
      migratePrograms();
    } else {
      throw new Error('no data');
    }
  } catch (e) {
    programs = JSON.parse(JSON.stringify(BUILTIN_PROGRAMS));
    savePrograms();
    console.warn('loadPrograms: falling back to built-in programs', e);
  }
}

export function migratePrograms(): void {
  const upperA = programs['Upper A'];
  if (upperA && upperA.length === 6) {
    const hasSmith = upperA.some((ex) => ex.name.indexOf('Smith') >= 0);
    const hasSkull = upperA.some((ex) => ex.name.indexOf('Skullcrusher') >= 0);
    const hasRow = upperA.some((ex) => ex.name.toLowerCase().indexOf('row') >= 0);
    if (hasSmith && hasSkull && !hasRow) {
      programs['Upper A'] = JSON.parse(JSON.stringify(BUILTIN_PROGRAMS['Upper A']));
      console.log('Migrated Upper A to optimized program');
    }
  }
  const lowerA = programs['Lower A'];
  if (lowerA && lowerA.length === 6) {
    const hasLunges = lowerA.some((ex) => ex.name.indexOf('Lunges') >= 0);
    const hasLegCurl = lowerA.some((ex) => ex.name.indexOf('Leg Curls') >= 0);
    const hasLying = lowerA.some((ex) => ex.name.indexOf('Lying') >= 0);
    if ((hasLunges && !hasLegCurl) || hasLying) {
      programs['Lower A'] = JSON.parse(JSON.stringify(BUILTIN_PROGRAMS['Lower A']));
      console.log('Migrated Lower A to optimized program');
    }
  }
  const upperB = programs['Upper B'];
  if (upperB && upperB.length === 6 && !upperB[0].cue) {
    programs['Upper B'] = JSON.parse(JSON.stringify(BUILTIN_PROGRAMS['Upper B']));
    console.log('Migrated Upper B cues');
  }
  const lowerB = programs['Lower B'];
  if (lowerB && lowerB.length === 6 && !lowerB[0].cue) {
    programs['Lower B'] = JSON.parse(JSON.stringify(BUILTIN_PROGRAMS['Lower B']));
    console.log('Migrated Lower B cues');
  }
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

export function savePrograms(): void {
  try {
    localStorage.setItem(PROGRAMS_KEY, JSON.stringify(programs));
  } catch (e) { console.warn('savePrograms failed', e); }
}

export function resetPrograms(): void {
  programs = JSON.parse(JSON.stringify(BUILTIN_PROGRAMS));
  savePrograms();
}
