import type { WorkoutSet } from './types';

// ==================== DATE UTILITIES ====================

export function todayStr(): string {
  const d = new Date();
  return d.getFullYear() + '-' +
    ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
    ('0' + d.getDate()).slice(-2);
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
  return days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
}

export function formatTimeNow(): string {
  const now = new Date();
  let h = now.getHours();
  const m = now.getMinutes();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
}

export function formatTimeShort(h: number, m: number): string {
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
}

export function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const temp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = temp.getUTCDay() || 7;
  temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((temp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return temp.getUTCFullYear() + '-W' + (weekNo < 10 ? '0' : '') + weekNo;
}

// ==================== CALC UTILITIES ====================

export function calcVolume(sets: WorkoutSet[]): number {
  return sets.reduce(function(sum, s) {
    return sum + ((s.weight || 0) * (s.reps || 0));
  }, 0);
}

export function calcAvgRpe(sets: WorkoutSet[]): number {
  const withRpe = sets.filter(function(s) { return s.rpe > 0; });
  if (withRpe.length === 0) return 0;
  const sum = withRpe.reduce(function(s, x) { return s + x.rpe; }, 0);
  return Math.round((sum / withRpe.length) * 10) / 10;
}

export function calc1RM(weight: number, reps: number): number {
  if (!weight || !reps || reps <= 0) return 0;
  // Epley formula
  return Math.round(weight * (1 + reps / 30));
}

export function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return h + 'h ' + m + 'm';
  if (m > 0) return m + 'm ' + s + 's';
  return s + 's';
}

// ==================== MIGRATION ====================

export function migrateOldKeys(): void {
  const oldKeys = ['tallTenderData', 'tallTenderPrograms', 'tallTenderFoods', 'tallTenderMealTemplates', 'tallTenderRecentMeals', 'tallTenderGoals'];
  oldKeys.forEach(function(oldKey) {
    const oldVal = localStorage.getItem(oldKey);
    if (oldVal !== null) {
      const newKey = oldKey + '_default';
      if (localStorage.getItem(newKey) === null) {
        localStorage.setItem(newKey, oldVal);
      }
      localStorage.removeItem(oldKey);
    }
  });
}
