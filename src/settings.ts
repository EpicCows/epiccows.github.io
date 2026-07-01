import { state, dom } from './state';
import { todayStr } from './utils';
import { calcDailyTotals } from './data';
import { PROFILE, FATSECRET_WORKER, BUILTIN_PROGRAMS, programs, loadPrograms, savePrograms, resetPrograms, REVIEW_EMAIL_KEY, REVIEW_OPTIN_KEY } from './core';
import { loadGoals, saveGoals } from './data';
import { showToast, haptic, showConfirm, closeConfirm, switchView } from './ui';
import { isProgressionCoachEnabled, renderProgressionCoach } from './workout';
import type { Goals, ExerciseTemplate, CompletedWorkout } from './types';

// ==================== WEEKLY REVIEW ====================

interface WeeklyData {
  weekLabel: string;
  workouts: any[];
  workoutCount: number;
  totalVolume: number;
  nutrition: {
    totalCalories: number; totalProtein: number; totalFat: number; totalCarbs: number;
    avgDailyCal: number; goalCal: number; surplus: number; loggedDays: number; streakDays: number;
  };
  bodyweight: { start: number | null; end: number | null; delta: number | null };
}

export function gatherWeeklyData(): WeeklyData {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekMon = new Date(now);
  weekMon.setDate(now.getDate() + mondayOffset);
  weekMon.setHours(0, 0, 0, 0);
  const weekSun = new Date(weekMon);
  weekSun.setDate(weekMon.getDate() + 6);

  function fmt(d: Date): string {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }

  const weekLabel = 'Mon ' + fmt(weekMon) + ' to Sun ' + fmt(weekSun);

  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekMon);
    d.setDate(weekMon.getDate() + i);
    weekDates.push(fmt(d));
  }

  const weekWorkouts: any[] = [];
  let totalVolume = 0;
  for (let wi = 0; wi < state.appData.workouts.length; wi++) {
    const w = state.appData.workouts[wi];
    if (weekDates.indexOf(w.date) >= 0) {
      const exSummary = w.exercises.map(function(ex) {
        const loggedSets = ex.sets.filter(function(s) { return s && s.weight > 0 && s.reps > 0; });
        const topWeight = loggedSets.reduce(function(m, s) { return Math.max(m, s.weight || 0); }, 0);
        return { name: ex.name, sets: loggedSets.length, topWeight: topWeight };
      });
      weekWorkouts.push({ date: w.date, dayType: w.dayType, totalVolume: w.totalVolume, avgRpe: w.avgRpe, exercises: exSummary });
      totalVolume += w.totalVolume || 0;
    }
  }

  const goals = loadGoals();
  let totalCal = 0, totalPro = 0, totalFat = 0, totalCarbs = 0, loggedDays = 0;
  for (let di = 0; di < weekDates.length; di++) {
    const dt = calcDailyTotals(weekDates[di]);
    if (dt.calories > 0) { totalCal += dt.calories; totalPro += dt.protein; totalFat += dt.fat; totalCarbs += dt.carbs; loggedDays++; }
  }
  const avgDailyCal = loggedDays > 0 ? Math.round(totalCal / loggedDays) : 0;
  const weekGoalCal = goals.calories * 7;
  const surplus = totalCal - weekGoalCal;

  let streak = 0;
  const sd = new Date(todayStr() + 'T12:00:00');
  for (let si = 0; si < 365; si++) {
    const sds = fmt(sd);
    const sdt = calcDailyTotals(sds);
    if (sdt.calories > 0 && goals.calories > 0 && sdt.calories <= goals.calories) { streak++; sd.setDate(sd.getDate() - 1); }
    else if (sdt.calories === 0 && sds === todayStr()) { sd.setDate(sd.getDate() - 1); }
    else break;
  }

  const bwData = state.appData.bodyweight || {};
  const bwStart = bwData[weekDates[0]] || null;
  const bwEnd = bwData[weekDates[6]] || null;
  const bwDelta = (bwStart != null && bwEnd != null) ? Math.round((bwEnd - bwStart) * 10) / 10 : null;

  return {
    weekLabel, workouts: weekWorkouts, workoutCount: weekWorkouts.length, totalVolume,
    nutrition: { totalCalories: totalCal, totalProtein: totalPro, totalFat: totalFat, totalCarbs: totalCarbs, avgDailyCal, goalCal: goals.calories, surplus, loggedDays, streakDays: streak },
    bodyweight: { start: bwStart, end: bwEnd, delta: bwDelta },
  };
}

export function sendReviewEmail(to: string, subject: string, html: string): Promise<any> {
  return fetch(FATSECRET_WORKER + '/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to, subject, html }),
  }).then(function(res) {
    if (!res.ok) {
      return res.json().then(function(err) { throw new Error(err.error || 'Email failed with status ' + res.status); });
    }
    return res.json();
  });
}

export function generateAndSendWeeklyReview(): Promise<void> {
  const email = (localStorage.getItem(REVIEW_EMAIL_KEY) || '').trim();
  if (!email) { showToast('Set your email address in Settings first'); return Promise.reject('no email'); }

  const optIn = localStorage.getItem(REVIEW_OPTIN_KEY);
  if (optIn === 'false') { showToast('Enable weekly review in Settings first'); return Promise.reject('not opted in'); }

  const weeklyData = gatherWeeklyData();
  const goals = loadGoals();

  const prompt = 'Write a plain, professional weekly fitness report. Do not use em dashes, motivational language, or pretend to be a human coach. Just the facts.\n\n' +
    'Week: ' + weeklyData.weekLabel + '\n' +
    JSON.stringify(weeklyData, null, 2) + '\n\n' +
    'Goals: ' + JSON.stringify(goals) + '\n\n' +
    'Return ONLY valid JSON with keys "subject" and "html". The "html" should be a clean, minimal HTML email (dark bg #14191f, text #e8edf2). Use simple bullet points and numbers. No fluff, no em dashes, no cheerleading. Keep it under 200 words.';

  return fetch(FATSECRET_WORKER + '/deepseek', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: 'You write plain, professional weekly fitness reports. No fluff, no em dashes, no motivational language. Just the data in clean HTML. Return ONLY valid JSON with keys "subject" and "html".' },
        { role: 'user', content: prompt },
      ],
      max_tokens: 800,
      temperature: 0.7,
    }),
  })
    .then(function(res) {
      if (!res.ok) throw new Error('DeepSeek API error: ' + res.status);
      return res.json();
    })
    .then(function(data) {
      let content = data.choices[0].message.content;
      content = content.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const review = JSON.parse(content);
      if (!review.subject || !review.html) throw new Error('AI response missing subject or html');
      return sendReviewEmail(email, review.subject, review.html);
    })
    .then(function() { showToast('Weekly review sent! Check your inbox.'); });
}

// ==================== RENDER SETTINGS VIEW ====================

export function renderSettingsView(): void {
  if (!dom.settingsContent) return;

  let html = '';

  // Profile selector
  html += '<div style="margin-bottom:20px;padding:14px;background:#14191f;border-radius:12px;border:1px solid #2a333d;">';
  html += '<div style="font-size:12px;font-weight:600;color:#7e8d9e;margin-bottom:8px;">Profile</div>';
  html += '<div style="display:flex;gap:8px;align-items:center;">';
  html += '<input type="text" id="profileNameInput" value="' + PROFILE.replace(/"/g, '&quot;') + '" placeholder="Profile name" style="flex:1;padding:10px 12px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:14px;outline:none;">';
  html += '<button class="prog-btn add" id="btnSwitchProfile" style="padding:10px 16px;white-space:nowrap;">Switch</button>';
  html += '<button class="prog-btn danger" id="btnDeleteProfile" style="padding:10px 12px;white-space:nowrap;font-size:11px;">Delete</button>';
  html += '</div>';
  html += '<p style="font-size:10px;color:#5a6a5a;margin-top:6px;">Each profile has separate workouts, foods, and goals.</p>';
  html += '</div>';

  // Archive link
  const workoutCount = state.appData.workouts.length;
  const totalVol = state.appData.workouts.reduce(function(s, w) { return s + w.totalVolume; }, 0);
  html += '<button class="btn-new-program" id="btnViewArchive" style="margin-bottom:20px;">📋 Workout Archive (' + workoutCount + ' workouts, ' + (totalVol / 1000).toFixed(1) + 'k kg)</button>';

  html += '<button class="btn-new-program" id="btnNewProgram">+ New Program</button>';

  const progKeys = Object.keys(programs).sort(function(a, b) {
    const aBuiltin = Object.prototype.hasOwnProperty.call(BUILTIN_PROGRAMS, a);
    const bBuiltin = Object.prototype.hasOwnProperty.call(BUILTIN_PROGRAMS, b);
    if (aBuiltin && !bBuiltin) return -1;
    if (!aBuiltin && bBuiltin) return 1;
    return a.localeCompare(b);
  });

  progKeys.forEach(function(progName) {
    const exList = programs[progName];
    const isBuiltin = Object.prototype.hasOwnProperty.call(BUILTIN_PROGRAMS, progName);
    html += '<div class="program-card" data-program="' + progName.replace(/"/g, '&quot;') + '">';
    html += '<div class="prog-top">';
    html += '<span class="prog-name">' + progName + (isBuiltin ? ' <span style="font-size:10px;color:#886666;">(built-in)</span>' : '') + '</span>';
    html += '<span class="prog-count">' + exList.length + ' exercises</span>';
    html += '</div>';
    html += '<div class="prog-detail">';
    exList.forEach(function(ex, exIdx) {
      html += '<div class="prog-ex-item">';
      html += '<div class="ex-info"><span class="ex-name">' + ex.name + '</span><br><span class="ex-params">' + ex.sets + ' sets × ' + ex.reps + (ex.note ? '  ·  <span style="color:#886666;">' + ex.note + '</span>' : '') + '</span></div>';
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

  // Nutrition goals
  const goals = loadGoals();
  html += '<div class="settings-section">';
  html += '<div class="settings-section-header"><h3 style="font-size:16px;font-weight:600;">🎯 Nutrition Goals</h3><span class="section-arrow">▼</span></div>';
  html += '<div class="settings-section-body">';
  html += '<div style="margin-bottom:12px;padding:12px;background:#14191f;border-radius:10px;border:1px solid #2a333d;">';
  html += '<div style="font-size:12px;font-weight:600;color:#7e8d9e;margin-bottom:8px;">Macro Goal Wizard</div>';
  html += '<div style="display:flex;gap:6px;align-items:end;flex-wrap:wrap;">';
  html += '<div style="flex:1;min-width:80px;"><label style="font-size:10px;color:#7e8d9e;">Bodyweight</label><input type="number" id="wizardBW" placeholder="kg" value="' + ((goals as any).bodyweight || '') + '" min="30" max="300" step="0.1" style="width:100%;padding:8px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:13px;"></div>';
  html += '<div style="flex:1;min-width:60px;"><label style="font-size:10px;color:#7e8d9e;">Height</label><input type="number" id="wizardHeight" placeholder="cm" value="' + (goals.height || '') + '" min="100" max="250" step="1" style="width:100%;padding:8px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:13px;"></div>';
  html += '<div style="flex:1;min-width:50px;"><label style="font-size:10px;color:#7e8d9e;">Age</label><input type="number" id="wizardAge" placeholder="yr" value="' + (goals.age || '') + '" min="14" max="100" step="1" style="width:100%;padding:8px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:13px;"></div>';
  html += '<div style="flex:1;min-width:80px;"><label style="font-size:10px;color:#7e8d9e;">Goal</label><select id="wizardGoal" style="width:100%;padding:8px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:13px;">';
  html += '<option value="maintain">Maintain</option><option value="cut">Cut</option><option value="bulk">Lean Bulk</option>';
  html += '</select></div>';
  html += '<button id="btnWizardCalc" style="padding:8px 16px;background:#8b0000;border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Calculate</button>';
  html += '</div></div>';

  // Manual goal inputs
  html += '<div style="display:flex;gap:8px;flex-wrap:wrap;">';
  html += '<div style="flex:1;min-width:60px;"><label style="font-size:10px;color:#7e8d9e;">Calories</label><input type="number" id="goalCal" value="' + goals.calories + '" style="width:100%;padding:8px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:13px;"></div>';
  html += '<div style="flex:1;min-width:60px;"><label style="font-size:10px;color:#7e8d9e;">Protein (g)</label><input type="number" id="goalPro" value="' + goals.protein + '" style="width:100%;padding:8px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:13px;"></div>';
  html += '<div style="flex:1;min-width:60px;"><label style="font-size:10px;color:#7e8d9e;">Fat (g)</label><input type="number" id="goalFat" value="' + (goals.fat || 70) + '" style="width:100%;padding:8px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:13px;"></div>';
  html += '<div style="flex:1;min-width:60px;"><label style="font-size:10px;color:#7e8d9e;">Carbs (g)</label><input type="number" id="goalCarbs" value="' + (goals.carbs || 250) + '" style="width:100%;padding:8px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:13px;"></div>';
  html += '</div>';
  html += '<button id="btnSaveGoals" style="margin-top:8px;padding:8px 16px;background:#8b0000;border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Save Goals</button>';
  html += '</div></div>'; // end nutrition section

  // FatSecret Worker URL
  html += '<div class="settings-section">';
  html += '<div class="settings-section-header"><h3 style="font-size:16px;font-weight:600;">🔧 API Configuration</h3><span class="section-arrow">▼</span></div>';
  html += '<div class="settings-section-body">';
  html += '<div style="margin-bottom:8px;"><label style="font-size:10px;color:#7e8d9e;">FatSecret / DeepSeek Worker URL</label>';
  html += '<input type="text" id="apiUrlInput" value="' + FATSECRET_WORKER + '" style="width:100%;padding:10px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:13px;outline:none;margin-top:4px;">';
  html += '</div>';
  html += '<button id="btnSaveApiUrl" style="padding:8px 16px;background:#8b0000;border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Save</button>';
  html += '</div></div>';

  // Weekly review
  html += '<div class="settings-section">';
  html += '<div class="settings-section-header"><h3 style="font-size:16px;font-weight:600;">📧 Weekly Review</h3><span class="section-arrow">▼</span></div>';
  html += '<div class="settings-section-body">';
  html += '<div style="margin-bottom:8px;"><label style="font-size:10px;color:#7e8d9e;">Email Address</label>';
  html += '<input type="email" id="reviewEmailInput" value="' + (localStorage.getItem(REVIEW_EMAIL_KEY) || '') + '" placeholder="you@example.com" style="width:100%;padding:10px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:13px;outline:none;margin-top:4px;">';
  html += '</div>';
  const optIn = localStorage.getItem(REVIEW_OPTIN_KEY);
  html += '<label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:13px;color:#a0b0c0;">';
  html += '<input type="checkbox" id="reviewOptIn"' + (optIn !== 'false' ? ' checked' : '') + '> Send weekly review email';
  html += '</label>';
  html += '<div style="display:flex;gap:8px;">';
  html += '<button id="btnSaveReview" style="padding:8px 16px;background:#8b0000;border:none;border-radius:8px;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Save</button>';
  html += '<button id="btnSendReviewNow" style="padding:8px 16px;background:#1e2a3e;border:1px solid #3a5a8a;border-radius:8px;color:#7a9aca;font-size:13px;font-weight:600;cursor:pointer;">Send Now</button>';
  html += '</div>';
  html += '</div></div>';

  // Progression coach
  html += '<div class="settings-section">';
  html += '<div class="settings-section-header"><h3 style="font-size:16px;font-weight:600;">📈 Progression Coach</h3><span class="section-arrow">▼</span></div>';
  html += '<div class="settings-section-body">';
  const coachEnabled = isProgressionCoachEnabled();
  html += '<label style="display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:13px;color:#a0b0c0;">';
  html += '<input type="checkbox" id="progCoachToggle"' + (coachEnabled ? ' checked' : '') + '> Show progression insights';
  html += '</label>';
  html += '<div id="progressionCoachContent">';
  if (coachEnabled) html += renderProgressionCoach();
  html += '</div>';
  html += '</div></div>';

  // Export / Import / Reset
  html += '<div style="display:flex;gap:8px;margin-top:20px;flex-wrap:wrap;">';
  html += '<button id="btnExportSettings" style="flex:1;min-width:80px;padding:10px;background:#1e2a3e;border:1px solid #3a5a8a;border-radius:8px;color:#7a9aca;font-size:12px;font-weight:600;cursor:pointer;">Export Data</button>';
  html += '<button id="btnImportSettings" style="flex:1;min-width:80px;padding:10px;background:#1e2a3e;border:1px solid #3a5a8a;border-radius:8px;color:#7a9aca;font-size:12px;font-weight:600;cursor:pointer;">Import Data</button>';
  html += '<button id="btnResetPrograms" style="flex:1;min-width:80px;padding:10px;background:#2a1e1e;border:1px solid #5a3a3a;border-radius:8px;color:#c96a6a;font-size:12px;font-weight:600;cursor:pointer;">Reset Programs</button>';
  html += '</div>';

  dom.settingsContent.innerHTML = html;

  bindSettingsEvents();
}

function bindSettingsEvents(): void {
  // Section toggles
  document.querySelectorAll('.settings-section-header').forEach(function(header) {
    header.addEventListener('click', function() {
      const body = (this as HTMLElement).nextElementSibling as HTMLElement | null;
      const arrow = (this as HTMLElement).querySelector('.section-arrow');
      if (body) body.style.display = body.style.display === 'none' ? 'block' : 'none';
      if (arrow) arrow.textContent = arrow.textContent === '▼' ? '▶' : '▼';
    });
  });

  // Archive button
  const archiveBtn = document.getElementById('btnViewArchive');
  if (archiveBtn) archiveBtn.addEventListener('click', function() { switchView('archive'); });

  // New program
  const newProgBtn = document.getElementById('btnNewProgram');
  if (newProgBtn) newProgBtn.addEventListener('click', function() { showProgramNameModal('', function(name) {
    if (!name || programs[name]) return;
    programs[name] = [];
    savePrograms();
    renderSettingsView();
    showToast('Program "' + name + '" created');
  });});

  // Program card toggles
  document.querySelectorAll('.program-card .prog-top').forEach(function(top) {
    top.addEventListener('click', function() {
      const detail = (this as HTMLElement).nextElementSibling as HTMLElement | null;
      if (detail) detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
    });
  });

  // Add exercise
  document.querySelectorAll('.prog-btn.add[data-action="add-exercise"]').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const progName = (this as HTMLElement).dataset.program || '';
      showExerciseModal(function(ex) {
        if (!ex.name) return;
        programs[progName].push(ex);
        savePrograms();
        renderSettingsView();
        showToast('Added "' + ex.name + '" to ' + progName);
      });
    });
  });

  // Delete program
  document.querySelectorAll('.prog-btn.danger[data-action="delete-program"]').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const progName = (this as HTMLElement).dataset.program || '';
      showConfirm('<h3>Delete Program?</h3><p>Remove "' + progName + '" permanently?</p>', [
        { label: 'Cancel', cls: 'btn-cancel', callback: function() {} },
        { label: 'Delete', cls: 'btn-danger', callback: function() {
          delete programs[progName];
          savePrograms();
          renderSettingsView();
          showToast('Program "' + progName + '" deleted');
        }},
      ]);
    });
  });

  // Delete exercise
  document.querySelectorAll('.ex-del').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const el = this as HTMLElement;
      const progName = el.dataset.program || '';
      const exIdx = parseInt(el.dataset.exidx || '0');
      const removed = programs[progName][exIdx];
      programs[progName].splice(exIdx, 1);
      savePrograms();
      renderSettingsView();
      showToast('Removed ' + removed.name + ' · Undo', function() {
        programs[progName].splice(exIdx, 0, removed);
        savePrograms();
        renderSettingsView();
        showToast('Restored ' + removed.name);
      });
    });
  });

  // Reorder buttons
  document.querySelectorAll('.ex-reorder').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      const el = this as HTMLElement;
      const progName = el.dataset.program || '';
      const exIdx = parseInt(el.dataset.exidx || '0');
      const list = programs[progName];
      if (el.classList.contains('ex-up') && exIdx > 0) {
        [list[exIdx], list[exIdx - 1]] = [list[exIdx - 1], list[exIdx]];
      } else if (el.classList.contains('ex-down') && exIdx < list.length - 1) {
        [list[exIdx], list[exIdx + 1]] = [list[exIdx + 1], list[exIdx]];
      }
      savePrograms();
      renderSettingsView();
    });
  });

  // Goal wizard
  const wizardBtn = document.getElementById('btnWizardCalc');
  if (wizardBtn) wizardBtn.addEventListener('click', function() {
    const bw = parseFloat((document.getElementById('wizardBW') as HTMLInputElement)?.value || '');
    const height = parseFloat((document.getElementById('wizardHeight') as HTMLInputElement)?.value || '');
    const age = parseInt((document.getElementById('wizardAge') as HTMLInputElement)?.value || '');
    const goal = (document.getElementById('wizardGoal') as HTMLSelectElement)?.value || 'maintain';

    if (!bw || !height || !age) { showToast('Fill in bodyweight, height, and age'); return; }

    // Mifflin-St Jeor BMR
    const bmr = 10 * bw + 6.25 * height - 5 * age + 5; // male formula
    const tdee = Math.round(bmr * 1.55); // moderately active
    let calTarget = tdee;
    if (goal === 'cut') calTarget = Math.round(tdee * 0.8);
    else if (goal === 'bulk') calTarget = Math.round(tdee * 1.1);
    const proTarget = Math.round(bw * 2.2); // ~2.2g/kg
    const fatTarget = Math.round(calTarget * 0.25 / 9); // 25% calories from fat
    const carbTarget = Math.round((calTarget - proTarget * 4 - fatTarget * 9) / 4);

    (document.getElementById('goalCal') as HTMLInputElement).value = String(calTarget);
    (document.getElementById('goalPro') as HTMLInputElement).value = String(proTarget);
    (document.getElementById('goalFat') as HTMLInputElement).value = String(fatTarget);
    (document.getElementById('goalCarbs') as HTMLInputElement).value = String(Math.max(0, carbTarget));
    showToast('Goals calculated: ' + calTarget + ' cal');
  });

  // Save goals
  const saveGoalsBtn = document.getElementById('btnSaveGoals');
  if (saveGoalsBtn) saveGoalsBtn.addEventListener('click', function() {
    const newGoals: Goals = {
      calories: parseInt((document.getElementById('goalCal') as HTMLInputElement)?.value || '') || 2500,
      protein: parseInt((document.getElementById('goalPro') as HTMLInputElement)?.value || '') || 200,
      fat: parseInt((document.getElementById('goalFat') as HTMLInputElement)?.value || '') || 70,
      carbs: parseInt((document.getElementById('goalCarbs') as HTMLInputElement)?.value || '') || 250,
      height: parseFloat((document.getElementById('wizardHeight') as HTMLInputElement)?.value || '') || 178,
      age: parseInt((document.getElementById('wizardAge') as HTMLInputElement)?.value || '') || 25,
    };
    saveGoals(newGoals);
    showToast('Goals saved!');
  });

  // API URL
  const saveApiBtn = document.getElementById('btnSaveApiUrl');
  if (saveApiBtn) saveApiBtn.addEventListener('click', function() {
    const url = (document.getElementById('apiUrlInput') as HTMLInputElement)?.value.trim() || '';
    try { localStorage.setItem('tallTenderApiUrl', url); showToast('API URL saved'); } catch (e) {}
  });

  // Review email
  const saveReviewBtn = document.getElementById('btnSaveReview');
  if (saveReviewBtn) saveReviewBtn.addEventListener('click', function() {
    const email = (document.getElementById('reviewEmailInput') as HTMLInputElement)?.value.trim() || '';
    const optIn = (document.getElementById('reviewOptIn') as HTMLInputElement)?.checked;
    localStorage.setItem(REVIEW_EMAIL_KEY, email);
    localStorage.setItem(REVIEW_OPTIN_KEY, String(optIn));
    showToast('Review settings saved');
  });

  const sendNowBtn = document.getElementById('btnSendReviewNow');
  if (sendNowBtn) sendNowBtn.addEventListener('click', function() {
    haptic();
    generateAndSendWeeklyReview().catch(function(err) { showToast('Failed to send: ' + err); });
  });

  // Progression coach toggle
  const coachToggle = document.getElementById('progCoachToggle');
  if (coachToggle) coachToggle.addEventListener('change', function() {
    const enabled = (this as HTMLInputElement).checked;
    localStorage.setItem('tallTenderProgCoach', String(enabled));
    const content = document.getElementById('progressionCoachContent');
    if (content) content.innerHTML = enabled ? renderProgressionCoach() : '';
  });

  // Profile switch
  const switchBtn = document.getElementById('btnSwitchProfile');
  if (switchBtn) switchBtn.addEventListener('click', function() {
    const newProfile = (document.getElementById('profileNameInput') as HTMLInputElement)?.value.trim() || 'default';
    if (newProfile !== PROFILE) {
      localStorage.setItem('tallTenderProfile', newProfile);
      showToast('Profile switched to "' + newProfile + '" — reloading...');
      setTimeout(function() { location.reload(); }, 800);
    }
  });

  const deleteProfileBtn = document.getElementById('btnDeleteProfile');
  if (deleteProfileBtn) deleteProfileBtn.addEventListener('click', function() {
    const profile = (document.getElementById('profileNameInput') as HTMLInputElement)?.value.trim() || 'default';
    if (profile === 'default') { showToast('Cannot delete default profile'); return; }
    showConfirm('<h3>Delete Profile?</h3><p>Remove all data for "' + profile + '"? This cannot be undone.</p>', [
      { label: 'Cancel', cls: 'btn-cancel', callback: function() {} },
      { label: 'Delete', cls: 'btn-danger', callback: function() {
        ['tallTenderData_', 'tallTenderPrograms_', 'tallTenderFoods_', 'tallTenderMealTemplates_', 'tallTenderRecentMeals_', 'tallTenderGoals_'].forEach(function(key) {
          localStorage.removeItem(key + profile);
        });
        localStorage.setItem('tallTenderProfile', 'default');
        showToast('Profile deleted — reloading...');
        setTimeout(function() { location.reload(); }, 800);
      }},
    ]);
  });

  // Export / Import / Reset
  const exportBtn = document.getElementById('btnExportSettings');
  if (exportBtn) exportBtn.addEventListener('click', function() { /* uses export from data layer */ import('./data').then(m => m.exportData()); });

  const importBtn = document.getElementById('btnImportSettings');
  if (importBtn) importBtn.addEventListener('click', function() { dom.importInput?.click(); });

  const resetBtn = document.getElementById('btnResetPrograms');
  if (resetBtn) resetBtn.addEventListener('click', function() {
    showConfirm('<h3>Reset Programs?</h3><p>Restore all programs to built-in defaults? Custom programs will be lost.</p>', [
      { label: 'Cancel', cls: 'btn-cancel', callback: function() {} },
      { label: 'Reset', cls: 'btn-danger', callback: function() { resetPrograms(); renderSettingsView(); showToast('Programs reset to defaults'); }},
    ]);
  });
}

// ==================== MODALS ====================

export function showExerciseModal(callback: (ex: ExerciseTemplate) => void): void {
  let content = '<h3>Add Exercise</h3>';
  content += '<input type="text" id="newExName" placeholder="Exercise name" style="width:100%;padding:10px;margin-bottom:8px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:14px;outline:none;">';
  content += '<div style="display:flex;gap:8px;">';
  content += '<input type="number" id="newExSets" placeholder="Sets" min="1" max="10" value="3" style="flex:1;padding:10px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:14px;">';
  content += '<input type="text" id="newExReps" placeholder="Reps" value="8-12" style="flex:1;padding:10px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:14px;">';
  content += '</div>';
  content += '<input type="text" id="newExCue" placeholder="Form cue (optional)" style="width:100%;padding:10px;margin-top:8px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:14px;outline:none;">';

  showConfirm(content, [
    { label: 'Cancel', cls: 'btn-cancel', callback: function() { callback({ name: '', sets: 0, reps: '' }); } },
    { label: 'Add', cls: 'btn-save', callback: function() {
      const name = ((document.getElementById('newExName') as HTMLInputElement)?.value || '').trim();
      const sets = parseInt((document.getElementById('newExSets') as HTMLInputElement)?.value || '') || 3;
      const reps = ((document.getElementById('newExReps') as HTMLInputElement)?.value || '').trim() || '8-12';
      const cue = ((document.getElementById('newExCue') as HTMLInputElement)?.value || '').trim();
      callback({ name, sets, reps, cue: cue || undefined });
    }},
  ]);
}

export function showProgramNameModal(prefill: string, callback: (name: string) => void): void {
  let content = '<h3>Program Name</h3>';
  content += '<input type="text" id="progNameInput" placeholder="e.g. Push Day" value="' + prefill.replace(/"/g, '&quot;') + '" style="width:100%;padding:12px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:15px;outline:none;">';
  showConfirm(content, [
    { label: 'Cancel', cls: 'btn-cancel', callback: function() { callback(''); } },
    { label: 'Create', cls: 'btn-save', callback: function() {
      callback(((document.getElementById('progNameInput') as HTMLInputElement)?.value || '').trim());
    }},
  ]);
}
