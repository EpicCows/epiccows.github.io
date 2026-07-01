window.App = window.App || {};

(function() {
  'use strict';

  var App = window.App;
  var s = App.state;
  var dom = App.dom;


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
    for (var wi = 0; wi < s.appData.workouts.length; wi++) {
      var w = s.appData.workouts[wi];
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
    var goals = App.loadGoals();
    var totalCal = 0, totalPro = 0, totalFat = 0, totalCarbs = 0, loggedDays = 0;
    for (var di = 0; di < weekDates.length; di++) {
      var dt = App.calcDailyTotals(weekDates[di]);
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
    var sd = new Date(App.todayStr() + 'T12:00:00');
    for (var si2 = 0; si2 < 365; si2++) {
      var sds = fmt(sd);
      var sdt = App.calcDailyTotals(sds);
      if (sdt.calories > 0 && goals.calories > 0 && sdt.calories <= goals.calories) {
        streak++;
        sd.setDate(sd.getDate() - 1);
      } else if (sdt.calories === 0 && sds === App.todayStr()) {
        sd.setDate(sd.getDate() - 1);
      } else {
        break;
      }
    }

    // --- Bodyweight ---
    var bwData = s.appData.bodyweight || {};
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
    return fetch(App.FATSECRET_WORKER + '/email', {
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
    var email = (localStorage.getItem(App.REVIEW_EMAIL_KEY) || '').trim();
    if (!email) { App.showToast('Set your email address in Settings first'); return Promise.reject('no email'); }

    var optIn = localStorage.getItem(App.REVIEW_OPTIN_KEY);
    if (optIn === 'false') { App.showToast('Enable weekly review in Settings first'); return Promise.reject('not opted in'); }

    var weeklyData = App.gatherWeeklyData();
    var goals = App.loadGoals();

    var prompt = 'Write a plain, professional weekly fitness report. Do not use em dashes, motivational language, or pretend to be a human coach. Just the facts.\n\n' +
      'Week: ' + weeklyData.weekLabel + '\n' +
      JSON.stringify(weeklyData, null, 2) + '\n\n' +
      'Goals: ' + JSON.stringify(goals) + '\n\n' +
      'Return ONLY valid JSON with keys "subject" and "html". The "html" should be a clean, minimal HTML email (dark bg #14191f, text #e8edf2). Use simple bullet points and numbers. No fluff, no em dashes, no cheerleading. Keep it under 200 words.';

    return fetch(App.FATSECRET_WORKER + '/deepseek', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'You write plain, professional weekly fitness reports. No fluff, no em dashes, no motivational language. Just the data in clean HTML. Return ONLY valid JSON with keys "subject" and "html".' },
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
      return App.sendReviewEmail(email, review.subject, review.html);
    })
    .then(function() {
      App.showToast('Weekly review sent! Check your inbox.');
    });
  }


  function renderSettingsView() {
    var html = '';

    // Profile selector
    html += '<div style="margin-bottom:20px;padding:14px;background:#14191f;border-radius:12px;border:1px solid #2a333d;">';
    html += '<div style="font-size:12px;font-weight:600;color:#7e8d9e;margin-bottom:8px;">Profile</div>';
    html += '<div style="display:flex;gap:8px;align-items:center;">';
    html += '<input type="text" id="profileNameInput" value="' + App.PROFILE.replace(/"/g, '&quot;') + '" placeholder="Profile name" style="flex:1;padding:10px 12px;border-radius:8px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:14px;outline:none;">';
    html += '<button class="prog-btn add" id="btnSwitchProfile" style="padding:10px 16px;white-space:nowrap;">Switch</button>';
    html += '<button class="prog-btn danger" id="btnDeleteProfile" style="padding:10px 12px;white-space:nowrap;font-size:11px;">Delete</button>';
    html += '</div>';
    html += '<p style="font-size:10px;color:#5a6a5a;margin-top:6px;">Each profile has separate workouts, foods, and goals. Settings (API key, FatSecret URL) are shared.</p>';
    html += '</div>';

    // Archive link
    var workoutCount = s.appData.workouts.length;
    var totalVol = s.appData.workouts.reduce(function(s, w) { return s + w.totalVolume; }, 0);
    html += '<button class="btn-new-program" id="btnViewArchive" style="margin-bottom:20px;">📋 Workout Archive (' + workoutCount + ' workouts, ' + (totalVol / 1000).toFixed(1) + 'k kg)</button>';

    html += '<button class="btn-new-program" id="btnNewProgram">+ New Program</button>';

    var progKeys = Object.keys(App.programs).sort(function(a, b) {
      // Built-in programs first, then alphabetical
      var aBuiltin = App.BUILTIN_PROGRAMS.hasOwnProperty(a);
      var bBuiltin = App.BUILTIN_PROGRAMS.hasOwnProperty(b);
      if (aBuiltin && !bBuiltin) return -1;
      if (!aBuiltin && bBuiltin) return 1;
      return a.localeCompare(b);
    });

    progKeys.forEach(function(progName) {
      var exList = App.programs[progName];
      var isBuiltin = App.BUILTIN_PROGRAMS.hasOwnProperty(progName);
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
    var goals = App.loadGoals();
    html += '<div class="settings-section">';
    html += '<div class="settings-section-header"><h3 style="font-size:16px;font-weight:600;">🎯 Nutrition Goals</h3><span class="section-arrow">▼</span></div>';
    html += '<div class="settings-section-body">';
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
    html += '</div>'; // close nutrition-goals
    html += '</div>'; // close settings-section-body
    html += '</div>'; // close settings-section

    // AI integration section
    html += '<div class="settings-section">';
    // Progression coach toggle
    html += '<div class="settings-section">';
    html += '<div class="settings-section-header"><h3 style="font-size:16px;font-weight:600;">📈 Progression Coach</h3><span class="section-arrow">▼</span></div>';
    html += '<div class="settings-section-body">';
    html += '<div class="timer-auto-toggle">';
    html += '<label for="progCoachCheck">Show weight progression recommendations after completing exercises</label>';
    html += '<input type="checkbox" id="progCoachCheck"' + (App.isProgressionCoachEnabled() ? ' checked' : '') + '>';
    html += '</div>';
    html += '</div></div>';

    // Weekly Review Email section
    var savedEmail = localStorage.getItem(App.REVIEW_EMAIL_KEY) || '';
    var reviewOptIn = localStorage.getItem(App.REVIEW_OPTIN_KEY) !== 'false';
    html += '<div class="settings-section">';
    html += '<div class="settings-section-header"><h3 style="font-size:16px;font-weight:600;">📧 Weekly Review Email</h3><span class="section-arrow">▼</span></div>';
    html += '<div class="settings-section-body">';
    html += '<p style="font-size:12px;color:#7e8d9e;margin-bottom:8px;">AI-generated workout + nutrition summary sent to your inbox</p>';
    html += '<div class="prog-edit-field"><label>Email Address</label><input type="email" id="reviewEmailInput" placeholder="you@example.com" value="' + savedEmail.replace(/"/g, '&quot;') + '"></div>';
    html += '<div class="timer-auto-toggle" style="margin-top:12px;">';
    html += '<label for="reviewOptInCheck">Enable weekly review</label>';
    html += '<input type="checkbox" id="reviewOptInCheck"' + (reviewOptIn ? ' checked' : '') + '>';
    html += '</div>';
    var hasEmail = savedEmail.trim().length > 0;
    html += '<button class="prog-btn add" id="btnSendReview" style="width:100%;margin-top:12px;"' + (hasEmail ? '' : ' disabled') + '>📧 Send Weekly Review</button>';
    html += '</div></div>';

    // Sync status
    var lastSync = localStorage.getItem('tallTenderLastSync') || '';
    html += '<div style="margin-top:16px;text-align:center;font-size:10px;color:#3a4a3a;">';
    if (lastSync) {
      var syncDate = new Date(lastSync);
      var syncStr = syncDate.toLocaleDateString() + ' ' + syncDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      html += '☁️ Last synced: ' + syncStr;
    } else {
      html += '☁️ Cloud backup pending...';
    }
    html += '</div>';

    html += '<button class="btn-reset" id="btnResetPrograms">Reset to defaults</button>';

    dom.settingsContent.innerHTML = html;

    // Expand/collapse settings sections
    dom.settingsContent.querySelectorAll('.settings-section-header').forEach(function(header) {
      header.addEventListener('click', function() {
        App.haptic();
        header.classList.toggle('collapsed');
        var body = header.nextElementSibling;
        if (body) body.classList.toggle('collapsed');
      });
    });

    // Expand/collapse program cards
    dom.settingsContent.querySelectorAll('.program-card').forEach(function(card) {
      card.addEventListener('click', function(e) {
        if (e.target.closest('button')) return; // don't toggle on button clicks
        card.classList.toggle('expanded');
        App.haptic();
      });
    });

    // View archive button
    var btnArchive = dom.settingsContent.querySelector('#btnViewArchive');
    if (btnArchive) {
      btnArchive.addEventListener('click', function() {
        App.haptic();
        App.switchView('archive');
      });
    }

    // Profile — switch
    var btnSwitchProfile = dom.settingsContent.querySelector('#btnSwitchProfile');
    if (btnSwitchProfile) {
      btnSwitchProfile.addEventListener('click', function() {
        var input = document.getElementById('profileNameInput');
        var name = (input ? input.value.trim() : '') || 'default';
        if (name === App.PROFILE) return;
        localStorage.setItem('tallTenderProfile', name);
        App.showToast('Switched to profile "' + name + '" — reloading...');
        setTimeout(function() { location.reload(); }, 500);
      });
    }
    // Profile — delete
    var btnDeleteProfile = dom.settingsContent.querySelector('#btnDeleteProfile');
    if (btnDeleteProfile) {
      btnDeleteProfile.addEventListener('click', function() {
        var input = document.getElementById('profileNameInput');
        var name = (input ? input.value.trim() : '') || 'default';
        if (name === 'default') { App.showToast('Cannot delete the default profile'); return; }
        App.showConfirm(
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
              App.showToast('Profile "' + name + '" deleted — reloading...');
              setTimeout(function() { location.reload(); }, 500);
            }}
          ]
        );
      });
    }

    // New program button
    var btnNew = dom.settingsContent.querySelector('#btnNewProgram');
    if (btnNew) {
      btnNew.addEventListener('click', function() {
        App.haptic();
        showProgramNameModal('', function(name) {
          if (!name || App.programs.hasOwnProperty(name)) {
            App.showToast('Name already exists or is invalid');
            return;
          }
          App.programs[name] = [];
          App.savePrograms();
          App.renderSettingsView();
          App.showToast('Program "' + name + '" created');
        });
      });
    }

    // Add exercise button
    dom.settingsContent.querySelectorAll('[data-action="add-exercise"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        App.haptic();
        var progName = this.dataset.program;
        showExerciseModal('', 3, '8-12', '', function(exName, sets, reps, note) {
          if (!exName) return;
          var ex = { name: exName, sets: sets, reps: reps };
          if (note) ex.note = note;
          App.programs[progName].push(ex);
          App.savePrograms();
          App.renderSettingsView();
          App.showToast('Added "' + exName + '" to ' + progName);
        });
      });
    });

    // Delete exercise button
    dom.settingsContent.querySelectorAll('.ex-del').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        App.haptic();
        var progName = this.dataset.program;
        var exIdx = parseInt(this.dataset.exidx);
        var exName = App.programs[progName][exIdx].name;
        App.showConfirm(
          '<h3>Delete Exercise?</h3><p>Remove "' + exName + '" from ' + progName + '?</p>',
          [
            { label: 'Cancel', cls: 'btn-cancel', callback: function() {} },
            { label: 'Delete', cls: 'btn-danger', callback: function() {
              App.programs[progName].splice(exIdx, 1);
              App.savePrograms();
              App.renderSettingsView();
              App.showToast('Removed "' + exName + '"');
            }}
          ]
        );
      });
    });

    // Delete program button
    dom.settingsContent.querySelectorAll('[data-action="delete-program"]').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        App.haptic();
        var progName = this.dataset.program;
        App.showConfirm(
          '<h3>Delete Program?</h3><p>Remove "' + progName + '" and all its exercises?</p>',
          [
            { label: 'Cancel', cls: 'btn-cancel', callback: function() {} },
            { label: 'Delete', cls: 'btn-danger', callback: function() {
              delete App.programs[progName];
              App.savePrograms();
              App.renderSettingsView();
              App.showToast('Program "' + progName + '" deleted');
            }}
          ]
        );
      });
    });

    // Exercise reorder — move up/down
    dom.settingsContent.querySelectorAll('.ex-reorder').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        App.haptic();
        var progName = this.dataset.program;
        var exIdx = parseInt(this.dataset.exidx);
        var list = App.programs[progName];
        if (!list) return;
        if (this.classList.contains('ex-up') && exIdx > 0) {
          var tmp = list[exIdx - 1]; list[exIdx - 1] = list[exIdx]; list[exIdx] = tmp;
        } else if (this.classList.contains('ex-down') && exIdx < list.length - 1) {
          var tmp = list[exIdx + 1]; list[exIdx + 1] = list[exIdx]; list[exIdx] = tmp;
        }
        App.savePrograms();
        App.renderSettingsView();
      });
    });

    // Reset to defaults
    var btnReset = dom.settingsContent.querySelector('#btnResetPrograms');
    if (btnReset) {
      btnReset.addEventListener('click', function() {
        App.haptic();
        App.showConfirm(
          '<h3>Reset to Defaults?</h3><p>This replaces all programs with the built-in 4-day split. Custom programs will be lost.</p>',
          [
            { label: 'Cancel', cls: 'btn-cancel', callback: function() {} },
            { label: 'Reset', cls: 'btn-danger', callback: function() {
              App.resetPrograms();
              App.renderSettingsView();
              App.showToast('Programs reset to defaults');
            }}
          ]
        );
      });
    }

    // Progression coach toggle
    var progCoachCheck = dom.settingsContent.querySelector('#progCoachCheck');
    if (progCoachCheck) {
      progCoachCheck.addEventListener('change', function() {
        localStorage.setItem('tallTenderProgCoach', this.checked ? 'true' : 'false');
        App.showToast('Progression Coach ' + (this.checked ? 'enabled' : 'disabled'));
      });
    }

    // Weekly review email — save on input
    var reviewEmailInput = dom.settingsContent.querySelector('#reviewEmailInput');
    if (reviewEmailInput) {
      reviewEmailInput.addEventListener('input', function() {
        var val = this.value.trim();
        localStorage.setItem(App.REVIEW_EMAIL_KEY, val);
        var btn = document.getElementById('btnSendReview');
        if (btn) btn.disabled = !val;
      });
    }

    // Weekly review — opt-in checkbox
    var reviewOptInCheck = dom.settingsContent.querySelector('#reviewOptInCheck');
    if (reviewOptInCheck) {
      reviewOptInCheck.addEventListener('change', function() {
        localStorage.setItem(App.REVIEW_OPTIN_KEY, this.checked ? 'true' : 'false');
      });
    }

    // Weekly review — send button
    var btnSendReview = dom.settingsContent.querySelector('#btnSendReview');
    if (btnSendReview) {
      btnSendReview.addEventListener('click', function() {
        App.haptic();
        var email = (localStorage.getItem(App.REVIEW_EMAIL_KEY) || '').trim();
        if (!email) { App.showToast('Enter an email address first'); return; }
                btnSendReview.textContent = 'Generating...';
        btnSendReview.disabled = true;
        App.generateAndSendWeeklyReview().finally(function() {
          btnSendReview.textContent = '📧 Send Weekly Review';
          var em = (localStorage.getItem(App.REVIEW_EMAIL_KEY) || '').trim();
          btnSendReview.disabled = !em;
        });
      });
    }


    // Goal wizard — auto-fill based on bodyweight, height, age
    var btnWizard = dom.settingsContent.querySelector('#btnWizardApply');
    if (btnWizard) {
      btnWizard.addEventListener('click', function() {
        var bw = parseFloat((document.getElementById('wizardBW') || {}).value) || 0;
        if (bw < 30) { App.showToast('Enter bodyweight first'); return; }
        var height = parseFloat((document.getElementById('wizardHeight') || {}).value) || 178;
        var age = parseInt((document.getElementById('wizardAge') || {}).value) || 25;
        var goal = (document.getElementById('wizardGoal') || {}).value || 'recomp';

        // Auto-detect activity from training history
        var now = new Date();
        var fourWeeks = 28 * 86400000;
        var recentWorkouts = s.appData.workouts.filter(function(w) {
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
        App.showToast(activityLabel + ' · TDEE ' + tdee + ' (' + bmr + ' BMR) · ' + cal + ' cal P' + pro + '/F' + fat + '/C' + carbs);
      });
    }

    // Save nutrition goals
    var btnSaveGoals = dom.settingsContent.querySelector('#btnSaveGoals');
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
        App.saveGoals(goals);
        App.showToast('Goals saved!');
      });
    }
  }

  // Program/exercise editing modals (lightweight, reuse confirm modal pattern)
  function showProgramNameModal(currentName, callback) {
    var html = '<h3 style="margin-bottom:12px;">Program Name</h3>';
    html += '<input type="text" id="progNameInput" placeholder="e.g. Push Day" value="' + currentName.replace(/"/g, '&quot;') + '" style="width:100%;padding:14px;border-radius:12px;background:#0f151b;border:1.5px solid #2a333d;color:#e8edf2;font-size:16px;outline:none;">';
    App.showConfirm(html, [
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
    App.showConfirm(html, [
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

  // ==================== EXPORTS ====================
  App.gatherWeeklyData = gatherWeeklyData;
  App.generateAndSendWeeklyReview = generateAndSendWeeklyReview;
  App.renderSettingsView = renderSettingsView;
  App.sendReviewEmail = sendReviewEmail;
  App.showExerciseModal = showExerciseModal;
  App.showProgramNameModal = showProgramNameModal;

})();
