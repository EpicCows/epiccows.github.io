import { state, dom } from './state';
import { todayStr, formatTimeNow, formatDate, formatElapsed, calcVolume, calcAvgRpe, calc1RM, getWeekKey } from './utils';
import { programs, PLATES, PROGRAMS_KEY, BUILTIN_PROGRAMS } from './core';
import { saveData, exportData as exportAppData, renderMealReminder } from './data';
import { showToast, haptic, showConfirm, closeConfirm, startTimer, stopTimer, toggleTimer, saveTimerSettings, updateTimerUI, formatTimer, switchView, updateElapsed } from './ui';
import type { WorkoutSet, CompletedWorkout, CompletedExercise, CurrentWorkout, WorkoutExercise, Programs } from './types';

// ==================== HELPERS ====================

function findLastExerciseEntry(exerciseName: string): WorkoutSet | null {
  for (let i = state.appData.workouts.length - 1; i >= 0; i--) {
    const w = state.appData.workouts[i];
    for (let j = 0; j < w.exercises.length; j++) {
      const ex = w.exercises[j];
      if (ex.name === exerciseName && ex.sets.length > 0 && ex.sets[0].reps > 0) {
        return ex.sets[0];
      }
    }
  }
  return null;
}

export function getLastWorkoutFirstSet(exerciseName: string): WorkoutSet | null {
  const set = findLastExerciseEntry(exerciseName);
  if (!set) return null;
  return { weight: set.weight || 0, reps: set.reps, rpe: set.rpe, notes: set.notes || '' };
}

export function getLastLog(exerciseName: string): string {
  const set = findLastExerciseEntry(exerciseName);
  if (!set) return '';
  return (set.weight || 0) + 'kg x ' + set.reps + (set.rpe ? ' @' + set.rpe : '');
}

export function getExerciseProgression(exerciseName: string, count?: number): number[] {
  count = count || 8;
  const weights: number[] = [];
  for (let i = 0; i < state.appData.workouts.length && weights.length < count; i++) {
    const w = state.appData.workouts[i];
    for (let j = 0; j < w.exercises.length; j++) {
      const ex = w.exercises[j];
      if (ex.name === exerciseName && ex.sets.length > 0 && ex.sets[0].reps > 0) {
        weights.push(ex.sets[0].weight || 0);
        break;
      }
    }
  }
  return weights;
}

export function renderSparkline(weights: number[]): string {
  if (weights.length < 2) return '';
  const min = Math.min.apply(null, weights) * 0.9;
  const max = Math.max.apply(null, weights) * 1.05;
  const range = max - min || 1;
  const w = 60, h = 16, pad = 2;
  const points = weights.map(function(v, i) {
    const x = pad + (i / (weights.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return x.toFixed(1) + ',' + y.toFixed(1);
  }).join(' ');
  return '<svg width="' + w + '" height="' + h + '" style="vertical-align:middle;margin-left:4px;flex-shrink:0;">' +
    '<polyline points="' + points + '" fill="none" stroke="#cc0000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>' +
    '</svg>';
}

function calcPlatesPerSide(weight: number): string {
  if (!weight || weight <= 20) return '';
  const perSide = (weight - 20) / 2;
  const result: number[] = [];
  let remaining = perSide;
  for (let i = 0; i < PLATES.length; i++) {
    const p = PLATES[i];
    while (remaining >= p - 0.01) {
      result.push(p);
      remaining -= p;
    }
  }
  if (remaining > 0.5) result.push(Math.round(remaining * 100) / 100);
  return result.length ? result.join(' + ') + ' / side' : '';
}

function updatePlateCalc(): void {
  const el = document.getElementById('plateCalc');
  if (!el) return;
  const w = parseFloat(dom.modalWeight?.value || '') || 0;
  el.textContent = calcPlatesPerSide(w);
}

function updateWarmupHint(): void {
  const el = document.getElementById('warmupHint');
  if (!el || !dom.modalWeight) return;
  const w = parseFloat(dom.modalWeight.value) || 0;
  if (w < 20) { el.textContent = ''; return; }
  el.textContent = 'Warm-up: ' +
    Math.round(w * 0.5) + ' x 8  |  ' +
    Math.round(w * 0.6) + ' x 5  |  ' +
    Math.round(w * 0.7) + ' x 3';
}

function fillWarmup(): void {
  if (!dom.modalWeight) return;
  let w = parseFloat(dom.modalWeight.value) || 0;
  if (w < 20) {
    if (state.pendingSetExIdx !== null && state.appData.currentWorkout) {
      const exName = state.appData.currentWorkout.exercises[state.pendingSetExIdx].name;
      const lastSet = findLastExerciseEntry(exName);
      if (lastSet && lastSet.weight > 0) w = lastSet.weight;
    }
  }
  if (w < 20) return;

  const current = parseFloat(dom.modalWeight.value) || w;
  const pct = current / w;
  let next: number;
  if (pct < 0.5)      next = Math.round(w * 0.4);
  else if (pct < 0.7) next = Math.round(w * 0.6);
  else if (pct < 0.9) next = Math.round(w * 0.8);
  else                next = w;

  dom.modalWeight.value = String(next);
  if (dom.modalReps) dom.modalReps.value = next === w ? '' : String(next < w * 0.5 ? 8 : next < w * 0.7 ? 5 : 2);
  if (dom.modalRpe) dom.modalRpe.value = next === w ? '' : String(next < w * 0.5 ? 6 : next < w * 0.7 ? 7 : 8);
  updatePlateCalc();
  updateWarmupHint();
  haptic();
}

// ==================== SET LOG MODAL ====================

export function openSetModal(exIdx: number, setIdx: number): void {
  if (!state.appData.currentWorkout || !dom.modalExName || !dom.modalSetInfo || !dom.modalWeight || !dom.setModal) return;
  const ex = state.appData.currentWorkout.exercises[exIdx];
  const totalSets = programs[state.appData.currentWorkout.dayType][exIdx].sets;

  state.pendingSetExIdx = exIdx;
  state.pendingSetIdx = setIdx;

  dom.modalExName.textContent = ex.name;
  dom.modalSetInfo.textContent = 'Set ' + (setIdx + 1) + ' of ' + totalSets;

  const existing = ex.sets[setIdx];
  const hasExisting = existing && existing.weight > 0;

  let prefillWeight: string | number = '';
  let prefillReps: string | number = '';
  let prefillRpe: string | number = '';
  let prefillNotes = '';

  if (hasExisting) {
    prefillWeight = existing.weight;
    prefillReps = existing.reps;
    prefillRpe = existing.rpe;
    prefillNotes = existing.notes || '';
  } else if (setIdx > 0) {
    const prevSet = ex.sets[setIdx - 1];
    if (prevSet && prevSet.weight > 0) {
      prefillWeight = prevSet.weight;
      prefillReps = prevSet.reps;
      prefillRpe = prevSet.rpe;
      prefillNotes = prevSet.notes || '';
    }
  } else {
    const last = getLastWorkoutFirstSet(ex.name);
    if (last) {
      prefillWeight = last.weight;
      prefillReps = last.reps;
      prefillRpe = last.rpe;
      prefillNotes = last.notes || '';
    }
  }

  dom.modalWeight.value = String(prefillWeight);
  if (dom.modalReps) dom.modalReps.value = String(prefillReps);
  if (dom.modalRpe) dom.modalRpe.value = String(prefillRpe);
  if (dom.modalNotes) dom.modalNotes.value = prefillNotes;

  // Show clear button only when editing a logged set
  if (dom.modalClearBtn) {
    dom.modalClearBtn.style.display = hasExisting ? '' : 'none';
  }

  dom.setModal.classList.add('open');
  haptic();
  updatePlateCalc();
  updateWarmupHint();
  setTimeout(function() { dom.modalWeight!.focus(); }, 200);
}

export function closeSetModal(): void {
  if (dom.setModal) dom.setModal.classList.remove('open');
  state.pendingSetExIdx = null;
  state.pendingSetIdx = null;
}

function handleClearSet(): void {
  if (state.pendingSetExIdx === null || state.pendingSetIdx === null) return;
  if (!state.appData.currentWorkout) return;

  const ex = state.appData.currentWorkout.exercises[state.pendingSetExIdx];
  const set = ex.sets[state.pendingSetIdx];
  if (!set || !set.weight || !set.reps) {
    closeSetModal();
    return;
  }

  // Snapshot for undo
  const clearedSet = { weight: set.weight, reps: set.reps, rpe: set.rpe, notes: set.notes };
  const exIdx = state.pendingSetExIdx;
  const setIdx = state.pendingSetIdx;

  ex.sets[state.pendingSetIdx] = { weight: 0, reps: 0, rpe: 0, notes: '' };
  saveData();
  closeSetModal();
  renderWorkoutView();

  showToast('Set cleared · Undo', function() {
    if (!state.appData.currentWorkout) return;
    state.appData.currentWorkout.exercises[exIdx].sets[setIdx] = clearedSet;
    saveData();
    renderWorkoutView();
    showToast('Set restored');
  });
}

// ==================== SKIP EXERCISE MODAL ====================

export function openSkipModal(exIdx: number): void {
  if (!state.appData.currentWorkout) return;
  const ex = state.appData.currentWorkout.exercises[exIdx];
  state.pendingSkipExIdx = exIdx;

  document.querySelectorAll<HTMLElement>('#skipReasons .skip-reason-chip').forEach(function(c) { c.classList.remove('selected'); });
  const noteInput = document.getElementById('skipNoteInput') as HTMLTextAreaElement;
  if (noteInput) { noteInput.value = ''; noteInput.style.display = 'none'; }
  const confirmBtn = document.getElementById('skipConfirmBtn') as HTMLButtonElement;
  if (confirmBtn) confirmBtn.disabled = true;
  const skipExName = document.getElementById('skipExName');
  if (skipExName) skipExName.textContent = 'Skip: ' + ex.name + '?';

  const skipModal = document.getElementById('skipModal');
  if (skipModal) skipModal.classList.add('open');
}

export function closeSkipModal(): void {
  const skipModal = document.getElementById('skipModal');
  if (skipModal) skipModal.classList.remove('open');
  state.pendingSkipExIdx = null;
}

function confirmSkip(): void {
  if (state.pendingSkipExIdx === null || !state.appData.currentWorkout) return;
  const selectedChip = document.querySelector('#skipReasons .skip-reason-chip.selected') as HTMLElement | null;
  if (!selectedChip) return;

  const reason = selectedChip.dataset.reason || '';
  const noteInput = document.getElementById('skipNoteInput') as HTMLTextAreaElement;
  const note = noteInput ? noteInput.value.trim() : '';

  const ex = state.appData.currentWorkout.exercises[state.pendingSkipExIdx];
  const totalSets = programs[state.appData.currentWorkout.dayType][state.pendingSkipExIdx].sets;

  // Snapshot existing sets before overwriting
  const prevSets = ex.sets.map(function(s) {
    return s ? { weight: s.weight, reps: s.reps, rpe: s.rpe, notes: s.notes } : null;
  });
  const prevSkipReason = ex.skipReason;
  const prevSkipNote = ex.skipNote;
  const exIdx = state.pendingSkipExIdx;

  for (let si = 0; si < totalSets; si++) {
    if (!ex.sets[si] || !ex.sets[si].reps) {
      ex.sets[si] = { weight: 0, reps: 0, rpe: 0, notes: '' };
    }
  }

  ex.skipReason = reason;
  ex.skipNote = note || '';

  saveData();
  closeSkipModal();
  renderWorkoutView();

  const reasonLabels: Record<string, string> = { injury: 'Injury', fatigue: 'Fatigue', time: 'Time', equipment: 'Equipment', other: 'Other' };
  showToast('Skipped: ' + (reasonLabels[reason] || reason) + ' · Undo', function() {
    if (!state.appData.currentWorkout) return;
    const ex2 = state.appData.currentWorkout.exercises[exIdx];
    // Restore previous sets
    for (let si = 0; si < prevSets.length; si++) {
      ex2.sets[si] = prevSets[si] || { weight: 0, reps: 0, rpe: 0, notes: '' };
    }
    ex2.skipReason = prevSkipReason;
    ex2.skipNote = prevSkipNote || '';
    saveData();
    renderWorkoutView();
    showToast('Skip undone');
  });
}

export function initSkipModal(): void {
  const skipModalEl = document.getElementById('skipModal');
  const reasonsContainer = document.getElementById('skipReasons');
  const noteInput = document.getElementById('skipNoteInput') as HTMLTextAreaElement;
  const confirmBtn = document.getElementById('skipConfirmBtn') as HTMLButtonElement;
  const cancelBtn = document.getElementById('skipCancelBtn');

  if (skipModalEl) {
    skipModalEl.addEventListener('click', function(e) {
      if (e.target === skipModalEl) closeSkipModal();
    });
  }

  if (reasonsContainer) {
    reasonsContainer.addEventListener('click', function(e) {
      const chip = (e.target as HTMLElement).closest('.skip-reason-chip') as HTMLElement | null;
      if (!chip) return;
      haptic();

      const wasSelected = chip.classList.contains('selected');
      reasonsContainer.querySelectorAll('.skip-reason-chip').forEach(function(c) { c.classList.remove('selected'); });
      if (!wasSelected) {
        chip.classList.add('selected');
        if (confirmBtn) confirmBtn.disabled = false;
      } else {
        if (confirmBtn) confirmBtn.disabled = true;
      }

      const reason = chip.dataset.reason;
      if (noteInput) {
        if (reason === 'other') {
          noteInput.style.display = 'block';
          noteInput.placeholder = 'Describe why…';
          setTimeout(function() { noteInput.focus(); }, 150);
        } else {
          noteInput.style.display = 'block';
          noteInput.placeholder = 'Add a note (optional)…';
        }
      }
    });
  }

  if (confirmBtn) confirmBtn.addEventListener('click', function() { haptic(); confirmSkip(); });
  if (cancelBtn) cancelBtn.addEventListener('click', function() { closeSkipModal(); });
}

// ==================== HANDLE SAVE SET ====================

export function handleSaveSet(): void {
  if (state.pendingSetExIdx === null || state.pendingSetIdx === null) return;
  if (!state.appData.currentWorkout || !dom.modalWeight) return;

  const weight = parseFloat(dom.modalWeight.value) || 0;
  const reps = parseInt(dom.modalReps?.value || '') || 0;
  const rpe = parseInt(dom.modalRpe?.value || '') || 0;
  const notes = dom.modalNotes?.value.trim() || '';

  const ex = state.appData.currentWorkout.exercises[state.pendingSetExIdx];
  while (ex.sets.length <= state.pendingSetIdx) {
    ex.sets.push({ weight: 0, reps: 0, rpe: 0, notes: '' });
  }
  const prevSnapshot = ex.sets[state.pendingSetIdx] ? JSON.parse(JSON.stringify(ex.sets[state.pendingSetIdx])) : null;

  ex.sets[state.pendingSetIdx] = { weight, reps, rpe, notes };

  const undoInfo = { exIdx: state.pendingSetExIdx, setIdx: state.pendingSetIdx, prev: prevSnapshot };
  saveData();
  closeSetModal();
  renderWorkoutView();

  if (prevSnapshot && prevSnapshot.weight > 0) {
    showToast('Set updated · Undo', function() {
      if (!state.appData.currentWorkout) return;
      state.appData.currentWorkout.exercises[undoInfo.exIdx].sets[undoInfo.setIdx] = undoInfo.prev;
      saveData();
      renderWorkoutView();
      showToast('Undone');
    });
  }

  if (state.timerAutoStart) startTimer();

  // Auto-advance to next unlogged set
  if (!state.appData.currentWorkout) return;
  const exTemplate = programs[state.appData.currentWorkout.dayType][state.pendingSetExIdx];
  const totalSets = exTemplate.sets;
  const nextSet = state.pendingSetIdx + 1;
  let foundNext = false;

  for (let ei = state.pendingSetExIdx; ei < state.appData.currentWorkout.exercises.length && !foundNext; ei++) {
    const startS = (ei === state.pendingSetExIdx) ? nextSet : 0;
    const tSets = programs[state.appData.currentWorkout.dayType][ei].sets;
    for (let si = startS; si < tSets; si++) {
      const set = state.appData.currentWorkout.exercises[ei].sets[si];
      if (!set || !set.weight || !set.reps) {
        setTimeout((function(eiCaptured: number, siCaptured: number) {
          return function() {
            const card = document.querySelector('.exercise-card[data-ex="' + eiCaptured + '"]');
            if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            openSetModal(eiCaptured, siCaptured);
          };
        })(ei, si), 150);
        foundNext = true;
        return;
      }
    }
  }

  const totalLogged = countLoggedSets();
  const totalSetsAll = countTotalSets();
  if (totalLogged >= totalSetsAll) {
    showToast('🎉 All sets logged! Ready to finish?');
  }
}

// ==================== WORKOUT HELPERS ====================

export function countLoggedSets(): number {
  if (!state.appData.currentWorkout) return 0;
  let count = 0;
  state.appData.currentWorkout.exercises.forEach(function(ex) {
    ex.sets.forEach(function(set) {
      if (set && set.weight > 0 && set.reps > 0) count++;
    });
  });
  return count;
}

export function countTotalSets(): number {
  if (!state.appData.currentWorkout) return 0;
  let total = 0;
  state.appData.currentWorkout.exercises.forEach(function(ex, i) {
    total += programs[state.appData.currentWorkout!.dayType][i].sets + (ex.extraSets || 0);
  });
  return total;
}

export function getCurrentVolume(): number {
  if (!state.appData.currentWorkout) return 0;
  const allSets: WorkoutSet[] = [];
  state.appData.currentWorkout.exercises.forEach(function(ex) {
    ex.sets.forEach(function(set) {
      if (set) allSets.push(set);
    });
  });
  return calcVolume(allSets);
}

// ==================== START / FINISH WORKOUT ====================

export function startWorkout(dayType: string): void {
  const exercises = programs[dayType].map(function(ex) {
    return { name: ex.name, sets: [] as WorkoutSet[] };
  });
  state.appData.currentWorkout = {
    date: todayStr(),
    startTime: formatTimeNow(),
    startTimestamp: Date.now(),
    dayType: dayType,
    exercises: exercises,
  };
  saveData();
  renderWorkoutView();
  showToast('💪 ' + dayType + ' workout started!');
}

export function finishWorkout(): void {
  if (!state.appData.currentWorkout) return;
  const logged = countLoggedSets();
  const total = countTotalSets();

  showConfirm(
    '<h3>Finish Workout?</h3>' +
    (logged < total ? '<p style="color:#cc4444;">⚠ ' + (total - logged) + ' sets still unlogged.</p>' : '<p>All ' + total + ' sets complete. Great work!</p>'),
    [
      { label: 'Cancel', cls: 'btn-cancel', callback: function() {} },
      {
        label: '✓ Finish',
        cls: logged < total ? 'btn-danger' : 'btn-save',
        callback: function() { doFinishWorkout(); },
      },
    ],
  );
}

export function doFinishWorkout(): void {
  if (!state.appData.currentWorkout) return;

  const cw = state.appData.currentWorkout;
  const allSets: WorkoutSet[] = [];
  cw.exercises.forEach(function(ex) {
    ex.sets.forEach(function(set) {
      if (set && set.weight > 0 && set.reps > 0) allSets.push(set);
    });
  });

  const loggedExercises = cw.exercises.map(function(ex) {
    return {
      name: ex.name,
      sets: ex.sets.filter(function(set) { return set && set.weight > 0 && set.reps > 0; }),
    };
  }).filter(function(ex) { return ex.sets.length > 0; });

  const workout: CompletedWorkout = {
    id: Date.now(),
    date: cw.date,
    startTime: cw.startTime,
    endTime: formatTimeNow(),
    dayType: cw.dayType,
    exercises: loggedExercises,
    totalVolume: calcVolume(allSets),
    avgRpe: calcAvgRpe(allSets),
  };

  state.appData.workouts.push(workout);
  state.appData.currentWorkout = null;
  stopTimer();
  saveData();
  renderWorkoutView();
  showToast('✅ Workout saved! ' + workout.totalVolume.toLocaleString() + ' kg total');

  if (state.appData.workouts.length % 5 === 0) {
    setTimeout(function() {
      const backup = JSON.stringify({
        workouts: state.appData.workouts,
        nutrition: state.appData.nutrition,
        bodyweight: state.appData.bodyweight,
      });
      const blob = new Blob([backup], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'tall-tender-backup-' + todayStr() + '.json';
      a.click();
      showToast('💾 Backup downloaded (every 5 workouts)');
    }, 1000);
  }
}

export function cancelWorkout(): void {
  if (!state.appData.currentWorkout) return;
  const logged = countLoggedSets();
  showConfirm(
    '<h3>Cancel Workout?</h3>' +
    '<p>You\'ve logged <strong>' + logged + '</strong> sets. This data will be lost.</p>',
    [
      { label: 'Keep Working', cls: 'btn-save', callback: function() {} },
      {
        label: 'Discard',
        cls: 'btn-danger',
        callback: function() {
          const discarded = state.appData.currentWorkout;
          state.appData.currentWorkout = null;
          stopTimer();
          saveData();
          renderWorkoutView();
          showToast('Workout discarded · Undo', function() {
            state.appData.currentWorkout = discarded;
            saveData();
            renderWorkoutView();
            showToast('Workout restored');
          });
        },
      },
    ],
  );
}

// ==================== RENDER: WORKOUT VIEW ====================

export function renderWorkoutView(): void {
  if (state.clockInterval) clearInterval(state.clockInterval);

  let html = '';

  // Onboarding for new users
  const hasSeenOnboarding = localStorage.getItem('tallTenderOnboarded');
  if (!hasSeenOnboarding && !state.appData.currentWorkout && state.appData.workouts.length === 0) {
    html += '<div class="onboard-card" id="onboardCard" style="margin-bottom:16px;padding:16px;background:#14191f;border-radius:14px;border:1px solid #2d5a3a;">';
    html += '<div style="font-size:18px;font-weight:700;margin-bottom:8px;">👋 Welcome to Progression</div>';
    html += '<p style="font-size:12px;color:#a0b0c0;line-height:1.6;margin:0;">Pick a workout below, tap the set circles to log your lifts, and track nutrition in the 🍽️ tab. Your data stays on this device. Auto-backups save every 5 workouts.</p>';
    html += '<button id="btnDismissOnboard" style="margin-top:10px;padding:8px 16px;background:#1a0808;border:1px solid #cc0000;border-radius:8px;color:#cc0000;font-size:13px;font-weight:600;cursor:pointer;">Got it</button>';
    html += '</div>';
  }

  if (!state.appData.currentWorkout) {
    // No active workout: show day type selector
    html += '<div class="sticky-bar">';
    html += '<div class="live-clock">';
    html += '<div class="time" id="liveClock">' + formatTimeNow() + '</div>';
    html += '<div class="date">' + formatDate(todayStr()) + '</div>';
    html += '</div>';
    html += renderMealReminder();
    html += '</div>';
    html += '<p style="text-align:center;color:#7e8d9e;margin-bottom:16px;">Select your workout for today:</p>';
    html += '<div class="day-type-selector">';

    Object.keys(programs).forEach(function(key) {
      html += '<button class="day-type-btn" data-day="' + key + '">' + key + '</button>';
    });

    html += '</div>';
  } else {
    // Active workout
    const cw = state.appData.currentWorkout;
    const exTemplates = programs[cw.dayType];
    const totalSetsAll = countTotalSets();
    const loggedSets = countLoggedSets();
    const volume = getCurrentVolume();

    html += '<div class="sticky-bar">';
    html += '<div class="live-clock">';
    html += '<div class="time" id="liveClock">' + formatTimeNow() + '</div>';
    html += '<div class="date">' + formatDate(cw.date) + '</div>';
    html += '<span class="day-type-badge">' + cw.dayType + '</span>';
    html += '</div>';
    html += renderMealReminder();
    html += '</div>';

    cw.exercises.forEach(function(ex, exIdx) {
      const template = exTemplates[exIdx];
      const programmedSets = template.sets;
      const extraSets = ex.extraSets || 0;
      const displaySets = programmedSets + extraSets;
      let loggedCount = 0;
      ex.sets.forEach(function(set) { if (set && set.weight > 0 && set.reps > 0) loggedCount++; });
      const allDone = loggedCount >= programmedSets;
      const hasLogs = loggedCount > 0;
      const wasSkipped = !!(ex.skipReason);

      html += '<div class="exercise-card' +
        (allDone ? ' all-done' : '') +
        (hasLogs && !allDone ? ' has-logs' : '') +
        (wasSkipped ? ' skipped' : '') +
        '" data-ex="' + exIdx + '">';
      html += '<div class="ex-header">';
      html += '<span class="ex-name">' + ex.name + '</span>';
      html += '<span class="ex-target">' + programmedSets + ' × ' + template.reps + (extraSets > 0 ? ' <span style="color:#cc4444;font-size:10px;">+' + extraSets + '</span>' : '') + '</span>';
      html += renderSparkline(getExerciseProgression(ex.name, 6));
      html += '</div>';
      const cue = (template as any).cue || (template as any).note;
      if (cue) {
        html += '<div class="ex-permanent-note">' + cue + '</div>';
      }
      const lastLog = getLastLog(ex.name);
      if (lastLog) {
        html += '<div class="ex-history">Last: ' + lastLog + '</div>';
      }
      if (wasSkipped) {
        const reasonLabels: Record<string, string> = { injury: '🩹 Injury / pain', fatigue: '😴 Fatigue', time: '⏱️ Short on time', equipment: '🔧 Equipment', other: '💬 Other' };
        const reasonLabel = reasonLabels[ex.skipReason || ''] || ex.skipReason;
        html += '<div class="skip-tag">' + reasonLabel + (ex.skipNote ? ': ' + ex.skipNote : '') + '</div>';
      }
      if (!allDone && !wasSkipped) {
        html += '<button class="btn-skip-ex" data-ex="' + exIdx + '" style="font-size:10px;padding:3px 8px;background:none;border:1px solid #3a2a2a;border-radius:6px;color:#7a5a5a;cursor:pointer;margin-bottom:4px;">Skip Exercise</button>';
      }
      html += '<div class="ex-sets">';
      for (let si = 0; si < displaySets; si++) {
        const set = ex.sets[si];
        const isLogged = set && set.weight > 0 && set.reps > 0;
        const isCurrent = !isLogged && (si === loggedCount || (si === 0 && loggedCount === 0)) && !wasSkipped;
        html += '<span class="set-circle' +
          (isLogged ? ' logged' : '') +
          (isCurrent ? ' current-set' : '') +
          (si >= programmedSets ? ' extra-set' : '') +
          '" data-ex="' + exIdx + '" data-set="' + si + '">' +
          (isLogged ? (set.weight > 0 ? Math.round(set.weight) : '') : (si + 1)) +
          '</span>';
      }
      html += '<span class="btn-add-set" data-ex="' + exIdx + '">+</span>';
      html += '</div>';
      html += '</div>';
    });

    // Workout progress footer
    html += '<div class="workout-footer">';
    html += '<div class="wf-progress">' + loggedSets + '/' + totalSetsAll + ' sets · ' + volume.toLocaleString() + ' kg</div>';
    html += '<div class="wf-actions">';
    html += '<button class="wf-cancel" id="btnCancelWorkout">Cancel</button>';
    html += '<button class="btn-finish" id="btnFinishWorkout">Finish Workout</button>';
    html += '</div></div>';
  }

  if (!dom.workoutContent) return;
  dom.workoutContent.innerHTML = html;

  // Event bindings
  bindWorkoutEvents();
}

function bindWorkoutEvents(): void {
  // Day type selector
  document.querySelectorAll('.day-type-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      haptic();
      startWorkout((this as HTMLElement).dataset.day || '');
    });
  });

  // Onboarding dismiss
  const onboardBtn = document.getElementById('btnDismissOnboard');
  if (onboardBtn) {
    onboardBtn.addEventListener('click', function() {
      localStorage.setItem('tallTenderOnboarded', '1');
      const card = document.getElementById('onboardCard');
      if (card) card.style.display = 'none';
    });
  }

  // Meal reminder → nutrition tab
  const mealReminder = document.getElementById('mealReminder');
  if (mealReminder) {
    mealReminder.addEventListener('click', function() {
      haptic();
      switchView('nutrition');
    });
  }

  // Set circles
  document.querySelectorAll('.set-circle.current-set').forEach(function(circle) {
    circle.addEventListener('click', function() {
      const el = this as HTMLElement;
      openSetModal(parseInt(el.dataset.ex || '0'), parseInt(el.dataset.set || '0'));
    });
  });

  // Add set button
  document.querySelectorAll('.btn-add-set').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (!state.appData.currentWorkout) return;
      haptic();
      const exIdx = parseInt((this as HTMLElement).dataset.ex || '0');
      const ex = state.appData.currentWorkout!.exercises[exIdx];
      ex.extraSets = (ex.extraSets || 0) + 1;
      saveData();
      renderWorkoutView();
      const newSetIdx = (programs[state.appData.currentWorkout!.dayType][exIdx].sets + ex.extraSets) - 1;
      setTimeout(function() { openSetModal(exIdx, newSetIdx); }, 200);
    });
  });

  // Skip exercise buttons
  document.querySelectorAll('.btn-skip-ex').forEach(function(btn) {
    btn.addEventListener('click', function() {
      openSkipModal(parseInt((this as HTMLElement).dataset.ex || '0'));
    });
  });

  // Finish / Cancel
  const btnFinish = document.getElementById('btnFinishWorkout');
  if (btnFinish) btnFinish.addEventListener('click', function() { haptic(); finishWorkout(); });
  const btnCancel = document.getElementById('btnCancelWorkout');
  if (btnCancel) btnCancel.addEventListener('click', function() { haptic(); cancelWorkout(); });
}

// ==================== CARDIO TOGGLE ====================

export function toggleCardio(): void {
  if (!state.appData.currentWorkout) return;
  state.appData.currentWorkout.cardioDone = !state.appData.currentWorkout.cardioDone;
  if (!state.appData.cardioLog) state.appData.cardioLog = {};
  state.appData.cardioLog[todayStr()] = !!state.appData.currentWorkout.cardioDone;
  saveData();
  renderWorkoutView();
  showToast(state.appData.currentWorkout.cardioDone ? '🏃 Cardio logged!' : 'Cardio unmarked');
}

// ==================== ARCHIVE VIEW ====================

export function renderArchiveView(): void {
  let html = '';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">';
  html += '<h2 style="margin:0;">Archive</h2>';
  html += '<div style="display:flex;gap:6px;">';
  html += '<input type="text" id="archiveSearch" placeholder="Filter..." style="padding:8px 12px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:12px;outline:none;width:120px;">';
  html += '<button id="btnExportData" style="padding:8px 12px;background:#1e2a3e;border:1px solid #3a5a8a;border-radius:8px;color:#7a9aca;font-size:12px;cursor:pointer;">Export</button>';
  html += '<button id="btnImportData" style="padding:8px 12px;background:#1e2a3e;border:1px solid #3a5a8a;border-radius:8px;color:#7a9aca;font-size:12px;cursor:pointer;">Import</button>';
  html += '</div></div>';

  if (state.appData.workouts.length === 0) {
    html += '<p style="color:#7e8d9e;text-align:center;padding:40px 0;">No completed workouts yet.</p>';
  } else {
    const workouts = [...state.appData.workouts].reverse();
    html += '<div id="archiveCards">';
    workouts.forEach(function(w) {
      html += '<div class="archive-card" data-day="' + w.dayType + '" data-date="' + w.date + '">';
      html += '<div class="arc-top">';
      html += '<span class="arc-type">' + w.dayType + '</span>';
      html += '<span class="arc-date">' + formatDate(w.date) + '</span>';
      html += '<span class="arc-meta">' + w.startTime + ' – ' + w.endTime + '</span>';
      html += '</div>';
      html += '<div class="arc-meta">' + w.totalVolume.toLocaleString() + ' kg · ' + w.avgRpe.toFixed(1) + ' avg RPE</div>';
      html += '<div class="arc-detail" style="display:none;">';
      w.exercises.forEach(function(ex) {
        const exVolume = calcVolume(ex.sets);
        html += '<div class="ac-ex">';
        html += '<span class="arc-ex-name">' + ex.name + '</span>';
        html += '<span class="arc-sets">';
        const setDescs: string[] = [];
        ex.sets.forEach(function(s) { setDescs.push((s.weight || 0) + 'kg × ' + s.reps + (s.rpe ? ' @' + s.rpe : '')); });
        html += setDescs.join(' | ') + ' · ' + exVolume.toLocaleString() + ' kg';
        html += '</span></div>';
      });
      html += '</div>';
      html += '</div>';
    });
    html += '</div>';
  }

  if (!dom.archiveContent) return;
  dom.archiveContent.innerHTML = html;

  // Event bindings
  const exportBtn = document.getElementById('btnExportData');
  if (exportBtn) exportBtn.addEventListener('click', function() { exportAppData(); });
  const importBtn = document.getElementById('btnImportData');
  if (importBtn) importBtn.addEventListener('click', function() { dom.importInput?.click(); });

  const searchInput = document.getElementById('archiveSearch') as HTMLInputElement;
  if (searchInput) {
    searchInput.addEventListener('input', function() { filterArchiveCards(this.value); });
  }

  document.querySelectorAll('.archive-card').forEach(function(card) {
    card.addEventListener('click', function() {
      const detail = (this as HTMLElement).querySelector('.ac-detail') as HTMLElement | null;
      if (detail) detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
    });
  });
}

export function filterArchiveCards(query: string): void {
  const q = query.toLowerCase();
  document.querySelectorAll('.archive-card').forEach(function(card) {
    const el = card as HTMLElement;
    const day = (el.dataset.day || '').toLowerCase();
    const date = (el.dataset.date || '').toLowerCase();
    el.style.display = (day.indexOf(q) >= 0 || date.indexOf(q) >= 0) ? '' : 'none';
  });
}

// ==================== STATS VIEW ====================

export function renderStatsView(): void {
  const workouts = state.appData.workouts;
  let html = '<h2 style="margin-bottom:16px;">Stats</h2>';

  if (workouts.length === 0) {
    html += '<p style="color:#7e8d9e;text-align:center;padding:40px 0;">No data yet.</p>';
  } else {
    const totalWorkouts = workouts.length;
    const totalVolume = workouts.reduce(function(s, w) { return s + w.totalVolume; }, 0);
    const totalSets = workouts.reduce(function(s, w) {
      return s + w.exercises.reduce(function(ss, ex) { return ss + ex.sets.length; }, 0);
    }, 0);
    const streak = calcStreak();

    html += '<div class="stats-grid">';
    html += '<div class="metric-card"><div class="metric-val">' + totalWorkouts + '</div><div class="metric-label">Workouts</div></div>';
    html += '<div class="metric-card"><div class="metric-val">' + (totalVolume / 1000).toFixed(1) + 'k</div><div class="metric-label">Total Volume</div></div>';
    html += '<div class="metric-card"><div class="metric-val">' + totalSets + '</div><div class="metric-label">Sets</div></div>';
    html += '<div class="metric-card"><div class="metric-val">' + streak + '</div><div class="metric-label">Day Streak</div></div>';
    html += '</div>';

    // Per-exercise stats
    const exMap: Record<string, { totalSets: number; totalVolume: number; maxWeight: number; sessions: number }> = {};
    workouts.forEach(function(w) {
      w.exercises.forEach(function(ex) {
        if (!exMap[ex.name]) exMap[ex.name] = { totalSets: 0, totalVolume: 0, maxWeight: 0, sessions: 0 };
        exMap[ex.name].totalSets += ex.sets.length;
        exMap[ex.name].totalVolume += calcVolume(ex.sets);
        exMap[ex.name].sessions++;
        ex.sets.forEach(function(s) { if (s.weight > exMap[ex.name].maxWeight) exMap[ex.name].maxWeight = s.weight; });
      });
    });

    html += '<h3 style="margin-top:20px;">By Exercise</h3>';
    Object.keys(exMap).sort().forEach(function(name) {
      const e = exMap[name];
      html += '<div class="ex-stat-row">';
      html += '<span class="ex-stat-name">' + name + '</span>';
      html += '<span class="ex-stat-nums">' + e.sessions + 'x · max ' + e.maxWeight + 'kg · ' + e.totalVolume.toLocaleString() + ' kg</span>';
      html += '</div>';
    });

    // Weekly volume chart
    html += '<h3 style="margin-top:20px;">Weekly Volume</h3>';
    html += '<div class="weekly-chart">';
    const weekMap: Record<string, number> = {};
    workouts.forEach(function(w) {
      const wk = getWeekKey(w.date);
      weekMap[wk] = (weekMap[wk] || 0) + w.totalVolume;
    });
    const weekKeys = Object.keys(weekMap).sort().slice(-12);
    const maxVol = Math.max.apply(null, weekKeys.map(function(k) { return weekMap[k]; })) || 1;
    weekKeys.forEach(function(wk) {
      const vol = weekMap[wk];
      const pct = (vol / maxVol * 100).toFixed(0);
      html += '<div class="chart-bar-wrap"><span class="chart-bar-label">' + wk + '</span>';
      html += '<span class="chart-bar" style="width:' + pct + '%;"></span>';
      html += '<span class="chart-bar-val">' + (vol / 1000).toFixed(1) + 'k</span></div>';
    });
    html += '</div>';
  }

  if (!dom.statsContent) return;
  dom.statsContent.innerHTML = html;
}

export function calcStreak(): number {
  let streak = 0;
  const d = new Date(todayStr() + 'T12:00:00');
  for (let i = 0; i < 365; i++) {
    const dateStr = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    const found = state.appData.workouts.some(function(w) { return w.date === dateStr; });
    if (found) { streak++; d.setDate(d.getDate() - 1); }
    else if (dateStr === todayStr()) { d.setDate(d.getDate() - 1); }
    else break;
  }
  return streak;
}

// ==================== PROGRESSION COACH ====================

export function renderProgressionCoach(): string {
  let html = '';
  const exercises = getAllExerciseNames();
  exercises.forEach(function(name) {
    const progression = getExerciseProgression(name, 10);
    if (progression.length < 3) return;
    const last = progression[progression.length - 1];
    const first = progression[0];
    const trend = last - first;
    const icon = trend > 0 ? '📈' : trend < 0 ? '📉' : '➡️';
    html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid #1a222b;">';
    html += '<span style="flex:1;font-size:12px;">' + name + '</span>';
    html += '<span style="font-size:12px;color:' + (trend >= 0 ? '#cc4444' : '#c96a6a') + ';">' + icon + ' ' + first + ' → ' + last + ' kg</span>';
    html += renderSparkline(progression);
    html += '</div>';
  });
  return html || '<p style="color:#7e8d9e;text-align:center;">Need more data for progression insights.</p>';
}

function getAllExerciseNames(): string[] {
  const seen: Record<string, boolean> = {};
  const result: string[] = [];
  state.appData.workouts.forEach(function(w) {
    w.exercises.forEach(function(ex) {
      if (!seen[ex.name]) { seen[ex.name] = true; result.push(ex.name); }
    });
  });
  return result;
}

export function isProgressionCoachEnabled(): boolean {
  try {
    return localStorage.getItem('tallTenderProgCoach') !== 'false';
  } catch (e) { return true; }
}

// ==================== EVENT INIT ====================

export function initWorkoutEvents(): void {
  // Set modal
  if (dom.setModal) {
    dom.setModal.addEventListener('click', function(e) {
      if (e.target === dom.setModal) closeSetModal();
    });
  }
  if (dom.modalSaveBtn) dom.modalSaveBtn.addEventListener('click', handleSaveSet);
  if (dom.modalCancelBtn) dom.modalCancelBtn.addEventListener('click', closeSetModal);
  if (dom.modalClearBtn) dom.modalClearBtn.addEventListener('click', function() { haptic(); handleClearSet(); });

  // Weight steppers
  document.querySelectorAll('.step-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      if (!dom.modalWeight) return;
      const step = parseFloat((this as HTMLElement).dataset.step || '0');
      dom.modalWeight.value = String((parseFloat(dom.modalWeight.value) || 0) + step);
      updatePlateCalc();
      updateWarmupHint();
    });
  });

  // Warmup button
  const warmupBtn = document.getElementById('modalWarmupBtn');
  if (warmupBtn) warmupBtn.addEventListener('click', fillWarmup);

  // Weight input
  if (dom.modalWeight) {
    dom.modalWeight.addEventListener('input', function() { updatePlateCalc(); updateWarmupHint(); });
  }

  initSkipModal();

  // Keyboard shortcut for save
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && dom.setModal?.classList.contains('open')) {
      handleSaveSet();
    }
  });
}
