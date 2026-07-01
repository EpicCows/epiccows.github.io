window.App = window.App || {};

(function() {
  'use strict';

  var App = window.App;
  var s = App.state;
  var dom = App.dom;

  // ==================== SET LOG MODAL ====================

  function findLastExerciseEntry(exerciseName) {
    for (var i = s.appData.workouts.length - 1; i >= 0; i--) {
      var w = s.appData.workouts[i];
      for (var j = 0; j < w.exercises.length; j++) {
        var ex = w.exercises[j];
        if (ex.name === exerciseName && ex.sets.length > 0 && ex.sets[0].reps > 0) {
          return ex.sets[0];
        }
      }
    }
    return null;
  }

  App.getLastWorkoutFirstSet = function(exerciseName) {
    var set = findLastExerciseEntry(exerciseName);
    if (!set) return null;
    return {
      weight: set.weight || 0,
      reps: set.reps,
      rpe: set.rpe,
      notes: set.notes || ''
    };
  };

  App.getLastLog = function(exerciseName) {
    var set = findLastExerciseEntry(exerciseName);
    if (!set) return '';
    return (set.weight || 0) + 'kg x ' + set.reps + (set.rpe ? ' @' + set.rpe : '');
  };

  App.getExerciseProgression = function(exerciseName, count) {
    count = count || 8;
    var weights = [];
    for (var i = 0; i < s.appData.workouts.length && weights.length < count; i++) {
      var w = s.appData.workouts[i];
      for (var j = 0; j < w.exercises.length; j++) {
        var ex = w.exercises[j];
        if (ex.name === exerciseName && ex.sets.length > 0 && ex.sets[0].reps > 0) {
          weights.push(ex.sets[0].weight || 0);
          break;
        }
      }
    }
    return weights;
  };

  App.renderSparkline = function(weights) {
    if (weights.length < 2) return '';
    var min = Math.min.apply(null, weights) * 0.9;
    var max = Math.max.apply(null, weights) * 1.05;
    var range = max - min || 1;
    var w = 60, h = 16, pad = 2;
    var points = weights.map(function(v, i) {
      var x = pad + (i / (weights.length - 1)) * (w - pad * 2);
      var y = h - pad - ((v - min) / range) * (h - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    }).join(' ');
    return '<svg width="' + w + '" height="' + h + '" style="vertical-align:middle;margin-left:4px;flex-shrink:0;">' +
      '<polyline points="' + points + '" fill="none" stroke="#4caf50" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/>' +
      '</svg>';
  };

  function calcPlatesPerSide(weight) {
    if (!weight || weight <= 20) return '';
    var perSide = (weight - 20) / 2;
    var result = [];
    var remaining = perSide;
    for (var i = 0; i < App.PLATES.length; i++) {
      var p = App.PLATES[i];
      while (remaining >= p - 0.01) {
        result.push(p);
        remaining -= p;
      }
    }
    if (remaining > 0.5) result.push(Math.round(remaining * 100) / 100);
    return result.length ? result.join(' + ') + ' / side' : '';
  }

  function updatePlateCalc() {
    var el = document.getElementById('plateCalc');
    if (!el) return;
    var w = parseFloat(dom.modalWeight.value) || 0;
    el.textContent = calcPlatesPerSide(w);
  }

  function updateWarmupHint() {
    var el = document.getElementById('warmupHint');
    if (!el) return;
    var w = parseFloat(dom.modalWeight.value) || 0;
    if (w < 20) { el.textContent = ''; return; }
    el.textContent = 'Warm-up: ' +
      Math.round(w * 0.5) + ' x 8  |  ' +
      Math.round(w * 0.6) + ' x 5  |  ' +
      Math.round(w * 0.7) + ' x 3';
  }

  function fillWarmup() {
    var w = parseFloat(dom.modalWeight.value) || 0;
    if (w < 20) {
      if (s.pendingSetExIdx !== null && s.appData.currentWorkout) {
        var exName = s.appData.currentWorkout.exercises[s.pendingSetExIdx].name;
        var lastSet = findLastExerciseEntry(exName);
        if (lastSet && lastSet.weight > 0) w = lastSet.weight;
      }
    }
    if (w < 20) return;

    var current = parseFloat(dom.modalWeight.value) || w;
    var pct = current / w;
    var next;
    if (pct < 0.5)      next = Math.round(w * 0.4);
    else if (pct < 0.7) next = Math.round(w * 0.6);
    else if (pct < 0.9) next = Math.round(w * 0.8);
    else                next = w;

    dom.modalWeight.value = next;
    dom.modalReps.value = next === w ? '' : (next < w * 0.5 ? 8 : next < w * 0.7 ? 5 : 2);
    dom.modalRpe.value = next === w ? '' : (next < w * 0.5 ? 6 : next < w * 0.7 ? 7 : 8);
    updatePlateCalc();
    updateWarmupHint();
    App.haptic();
  }

  App.openSetModal = function(exIdx, setIdx) {
    if (!s.appData.currentWorkout) return;
    var ex = s.appData.currentWorkout.exercises[exIdx];
    var totalSets = App.programs[s.appData.currentWorkout.dayType][exIdx].sets;

    s.pendingSetExIdx = exIdx;
    s.pendingSetIdx = setIdx;

    dom.modalExName.textContent = ex.name;
    dom.modalSetInfo.textContent = 'Set ' + (setIdx + 1) + ' of ' + totalSets;

    var existing = ex.sets[setIdx];
    var hasExisting = existing && existing.weight > 0;

    var prefillWeight = '';
    var prefillReps = '';
    var prefillRpe = '';
    var prefillNotes = '';

    if (hasExisting) {
      prefillWeight = existing.weight;
      prefillReps = existing.reps;
      prefillRpe = existing.rpe;
      prefillNotes = existing.notes || '';
    } else if (setIdx > 0) {
      var prevSet = ex.sets[setIdx - 1];
      if (prevSet && prevSet.weight > 0) {
        prefillWeight = prevSet.weight;
        prefillReps = prevSet.reps;
        prefillRpe = prevSet.rpe;
        prefillNotes = prevSet.notes || '';
      }
    } else {
      var last = App.getLastWorkoutFirstSet(ex.name);
      if (last) {
        prefillWeight = last.weight;
        prefillReps = last.reps;
        prefillRpe = last.rpe;
        prefillNotes = last.notes || '';
      }
    }

    dom.modalWeight.value = prefillWeight;
    dom.modalReps.value = prefillReps;
    dom.modalRpe.value = prefillRpe;
    dom.modalNotes.value = prefillNotes;

    dom.setModal.classList.add('open');
    App.haptic();
    updatePlateCalc();
    updateWarmupHint();
    setTimeout(function() { dom.modalWeight.focus(); }, 200);
  };

  App.closeSetModal = function() {
    dom.setModal.classList.remove('open');
    s.pendingSetExIdx = null;
    s.pendingSetIdx = null;
  };

  // ==================== SKIP EXERCISE MODAL ====================

  App.openSkipModal = function(exIdx) {
    var ex = s.appData.currentWorkout.exercises[exIdx];
    s.pendingSkipExIdx = exIdx;

    document.querySelectorAll('#skipReasons .skip-reason-chip').forEach(function(c) { c.classList.remove('selected'); });
    var noteInput = document.getElementById('skipNoteInput');
    noteInput.value = '';
    noteInput.style.display = 'none';
    var confirmBtn = document.getElementById('skipConfirmBtn');
    confirmBtn.disabled = true;
    document.getElementById('skipExName').textContent = 'Skip: ' + ex.name + '?';

    document.getElementById('skipModal').classList.add('open');
  };

  App.closeSkipModal = function() {
    document.getElementById('skipModal').classList.remove('open');
    s.pendingSkipExIdx = null;
  };

  function confirmSkip() {
    if (s.pendingSkipExIdx === null) return;
    var selectedChip = document.querySelector('#skipReasons .skip-reason-chip.selected');
    if (!selectedChip) return;

    var reason = selectedChip.dataset.reason;
    var note = document.getElementById('skipNoteInput').value.trim();

    var ex = s.appData.currentWorkout.exercises[s.pendingSkipExIdx];
    var totalSets = App.programs[s.appData.currentWorkout.dayType][s.pendingSkipExIdx].sets;

    for (var si = 0; si < totalSets; si++) {
      if (!ex.sets[si] || !ex.sets[si].reps) {
        ex.sets[si] = { weight: 0, reps: 0, rpe: 0, notes: '' };
      }
    }

    ex.skipReason = reason;
    ex.skipNote = note || '';

    App.saveData();
    App.closeSkipModal();
    App.renderWorkoutView();

    var reasonLabels = { injury: 'Injury', fatigue: 'Fatigue', time: 'Time', equipment: 'Equipment', other: 'Other' };
    App.showToast('Skipped: ' + (reasonLabels[reason] || reason));
  }

  App.initSkipModal = function() {
    var skipModalEl = document.getElementById('skipModal');
    var reasonsContainer = document.getElementById('skipReasons');
    var noteInput = document.getElementById('skipNoteInput');
    var confirmBtn = document.getElementById('skipConfirmBtn');
    var cancelBtn = document.getElementById('skipCancelBtn');

    skipModalEl.addEventListener('click', function(e) {
      if (e.target === skipModalEl) App.closeSkipModal();
    });

    reasonsContainer.addEventListener('click', function(e) {
      var chip = e.target.closest('.skip-reason-chip');
      if (!chip) return;
      App.haptic();

      var wasSelected = chip.classList.contains('selected');
      reasonsContainer.querySelectorAll('.skip-reason-chip').forEach(function(c) { c.classList.remove('selected'); });
      if (!wasSelected) {
        chip.classList.add('selected');
        confirmBtn.disabled = false;
      } else {
        confirmBtn.disabled = true;
      }

      var reason = chip.dataset.reason;
      if (reason === 'other') {
        noteInput.style.display = 'block';
        noteInput.placeholder = 'Describe why…';
        setTimeout(function() { noteInput.focus(); }, 150);
      } else {
        noteInput.style.display = 'block';
        noteInput.placeholder = 'Add a note (optional)…';
      }
    });

    confirmBtn.addEventListener('click', function() {
      App.haptic();
      confirmSkip();
    });

    cancelBtn.addEventListener('click', function() {
      App.closeSkipModal();
    });
  };

  // ==================== HANDLE SAVE SET ====================

  App.handleSaveSet = function() {
    if (s.pendingSetExIdx === null || s.pendingSetIdx === null) return;
    if (!s.appData.currentWorkout) return;

    var weight = parseFloat(dom.modalWeight.value) || 0;
    var reps = parseInt(dom.modalReps.value) || 0;
    var rpe = parseInt(dom.modalRpe.value) || 0;
    var notes = dom.modalNotes.value.trim();

    var ex = s.appData.currentWorkout.exercises[s.pendingSetExIdx];
    while (ex.sets.length <= s.pendingSetIdx) {
      ex.sets.push({ weight: 0, reps: 0, rpe: 0, notes: '' });
    }
    var prevSnapshot = ex.sets[s.pendingSetIdx] ? JSON.parse(JSON.stringify(ex.sets[s.pendingSetIdx])) : null;

    ex.sets[s.pendingSetIdx] = {
      weight: weight,
      reps: reps,
      rpe: rpe,
      notes: notes
    };

    var undoInfo = { exIdx: s.pendingSetExIdx, setIdx: s.pendingSetIdx, prev: prevSnapshot };
    App.saveData();
    App.closeSetModal();
    App.renderWorkoutView();

    if (prevSnapshot && prevSnapshot.weight > 0) {
      App.showToast('Set updated · Undo', function() {
        s.appData.currentWorkout.exercises[undoInfo.exIdx].sets[undoInfo.setIdx] = undoInfo.prev;
        App.saveData();
        App.renderWorkoutView();
        App.showToast('Undone');
      });
    }

    if (s.timerAutoStart) {
      App.startTimer();
    }

    // Auto-advance to next unlogged set
    var exTemplate = App.programs[s.appData.currentWorkout.dayType][s.pendingSetExIdx];
    var totalSets = exTemplate.sets;
    var nextSet = s.pendingSetIdx + 1;
    var foundNext = false;

    for (var ei = s.pendingSetExIdx; ei < s.appData.currentWorkout.exercises.length && !foundNext; ei++) {
      var startS = (ei === s.pendingSetExIdx) ? nextSet : 0;
      var tSets = App.programs[s.appData.currentWorkout.dayType][ei].sets;
      for (var si = startS; si < tSets; si++) {
        var set = (s.appData.currentWorkout.exercises[ei].sets[si]);
        if (!set || !set.weight || !set.reps) {
          setTimeout(function(eiCaptured, siCaptured) {
            return function() {
              var card = document.querySelector('.exercise-card[data-ex="' + eiCaptured + '"]');
              if (card) card.scrollIntoView({ behavior: 'smooth', block: 'center' });
              App.openSetModal(eiCaptured, siCaptured);
            };
          }(ei, si), 150);
          foundNext = true;
          return;
        }
      }
    }

    var totalLogged = App.countLoggedSets();
    var totalSetsAll = App.countTotalSets();
    if (totalLogged >= totalSetsAll) {
      App.showToast('🎉 All sets logged! Ready to finish?');
    }
  };

  // ==================== WORKOUT HELPERS ====================

  App.countLoggedSets = function() {
    if (!s.appData.currentWorkout) return 0;
    var count = 0;
    s.appData.currentWorkout.exercises.forEach(function(ex) {
      ex.sets.forEach(function(set) {
        if (set && set.weight > 0 && set.reps > 0) count++;
      });
    });
    return count;
  };

  App.countTotalSets = function() {
    if (!s.appData.currentWorkout) return 0;
    var total = 0;
    s.appData.currentWorkout.exercises.forEach(function(ex, i) {
      total += App.programs[s.appData.currentWorkout.dayType][i].sets + (ex.extraSets || 0);
    });
    return total;
  };

  App.getCurrentVolume = function() {
    if (!s.appData.currentWorkout) return 0;
    var allSets = [];
    s.appData.currentWorkout.exercises.forEach(function(ex) {
      ex.sets.forEach(function(set) {
        if (set) allSets.push(set);
      });
    });
    return App.calcVolume(allSets);
  };

  // ==================== START / FINISH WORKOUT ====================

  App.startWorkout = function(dayType) {
    var exercises = App.programs[dayType].map(function(ex) {
      return { name: ex.name, sets: [] };
    });
    s.appData.currentWorkout = {
      date: App.todayStr(),
      startTime: App.formatTimeNow(),
      startTimestamp: Date.now(),
      dayType: dayType,
      exercises: exercises
    };
    App.saveData();
    App.renderWorkoutView();
    App.showToast('💪 ' + dayType + ' workout started!');
  };

  App.finishWorkout = function() {
    if (!s.appData.currentWorkout) return;
    var logged = App.countLoggedSets();
    var total = App.countTotalSets();
    var volume = App.getCurrentVolume();

    App.showConfirm(
      '<h3>Finish Workout?</h3>' +
      (logged < total ? '<p style="color:#ffb74d;">⚠ ' + (total - logged) + ' sets still unlogged.</p>' : '<p>All ' + total + ' sets complete. Great work!</p>'),
      [
        { label: 'Cancel', cls: 'btn-cancel', callback: function() {} },
        {
          label: '✓ Finish',
          cls: logged < total ? 'btn-danger' : 'btn-save',
          callback: function() { App.doFinishWorkout(); }
        }
      ]
    );
  };

  App.doFinishWorkout = function() {
    if (!s.appData.currentWorkout) return;

    var cw = s.appData.currentWorkout;
    var allSets = [];
    cw.exercises.forEach(function(ex) {
      ex.sets.forEach(function(set) {
        if (set && set.weight > 0 && set.reps > 0) allSets.push(set);
      });
    });

    var loggedExercises = cw.exercises.map(function(ex) {
      return {
        name: ex.name,
        sets: ex.sets.filter(function(set) { return set && set.weight > 0 && set.reps > 0; })
      };
    }).filter(function(ex) { return ex.sets.length > 0; });

    var workout = {
      id: Date.now(),
      date: cw.date,
      startTime: cw.startTime,
      endTime: App.formatTimeNow(),
      dayType: cw.dayType,
      exercises: loggedExercises,
      totalVolume: App.calcVolume(allSets),
      avgRpe: App.calcAvgRpe(allSets)
    };

    s.appData.workouts.push(workout);
    s.appData.currentWorkout = null;
    App.stopTimer();
    App.saveData();
    App.renderWorkoutView();
    App.showToast('✅ Workout saved! ' + workout.totalVolume.toLocaleString() + ' kg total');

    if (s.appData.workouts.length % 5 === 0) {
      setTimeout(function() {
        var backup = JSON.stringify({
          workouts: s.appData.workouts,
          nutrition: s.appData.nutrition,
          bodyweight: s.appData.bodyweight
        });
        var blob = new Blob([backup], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'tall-tender-backup-' + App.todayStr() + '.json';
        a.click();
        App.showToast('💾 Backup downloaded (every 5 workouts)');
      }, 1000);
    }
  };

  App.cancelWorkout = function() {
    if (!s.appData.currentWorkout) return;
    var logged = App.countLoggedSets();
    App.showConfirm(
      '<h3>Cancel Workout?</h3>' +
      '<p>You\'ve logged <strong>' + logged + '</strong> sets. This data will be lost.</p>',
      [
        { label: 'Keep Working', cls: 'btn-save', callback: function() {} },
        {
          label: 'Discard',
          cls: 'btn-danger',
          callback: function() {
            s.appData.currentWorkout = null;
            App.stopTimer();
            App.saveData();
            App.renderWorkoutView();
            App.showToast('Workout discarded');
          }
        }
      ]
    );
  };

  // ==================== RENDER: WORKOUT VIEW ====================

  App.renderWorkoutView = function() {
    if (s.clockInterval) clearInterval(s.clockInterval);

    var html = '';

    // Onboarding for new users
    var hasSeenOnboarding = localStorage.getItem('tallTenderOnboarded');
    if (!hasSeenOnboarding && !s.appData.currentWorkout && s.appData.workouts.length === 0) {
      html += '<div class="onboard-card" id="onboardCard" style="margin-bottom:16px;padding:16px;background:#14191f;border-radius:14px;border:1px solid #2d5a3a;">';
      html += '<div style="font-size:18px;font-weight:700;margin-bottom:8px;">👋 Welcome to Progression</div>';
      html += '<p style="font-size:12px;color:#a0b0c0;line-height:1.6;margin:0;">Pick a workout below, tap the set circles to log your lifts, and track nutrition in the 🍽️ tab. Your data stays on this device. Auto-backups save every 5 workouts.</p>';
      html += '<button id="btnDismissOnboard" style="margin-top:10px;padding:8px 16px;background:#1e3a1e;border:1px solid #4caf50;border-radius:8px;color:#4caf50;font-size:13px;font-weight:600;cursor:pointer;">Got it</button>';
      html += '</div>';
    }

    if (!s.appData.currentWorkout) {
      // --- No active workout: show day type selector ---
      html += '<div class="sticky-bar">';
      html += '<div class="live-clock">';
      html += '<div class="time" id="liveClock">' + App.formatTimeNow() + '</div>';
      html += '<div class="date">' + App.formatDate(App.todayStr()) + '</div>';
      html += '</div>';
      html += App.renderMealReminder();
      html += '</div>';
      html += '<p style="text-align:center;color:#7e8d9e;margin-bottom:16px;">Select your workout for today:</p>';
      html += '<div class="day-type-selector">';

      var dayKeys = Object.keys(App.programs);
      dayKeys.forEach(function(key) {
        html += '<button class="day-type-btn" data-day="' + key + '">' + key + '</button>';
      });

      html += '</div>';
    } else {
      // --- Active workout ---
      var cw = s.appData.currentWorkout;
      var exTemplates = App.programs[cw.dayType];
      var totalSetsAll = App.countTotalSets();
      var loggedSets = App.countLoggedSets();
      var volume = App.getCurrentVolume();

      html += '<div class="sticky-bar">';
      html += '<div class="live-clock">';
      html += '<div class="time" id="liveClock">' + App.formatTimeNow() + '</div>';
      html += '<div class="date">' + App.formatDate(cw.date) + '</div>';
      html += '<span class="day-type-badge">' + cw.dayType + '</span>';
      html += '</div>';
      html += App.renderMealReminder();
      html += '</div>';

      cw.exercises.forEach(function(ex, exIdx) {
        var template = exTemplates[exIdx];
        var programmedSets = template.sets;
        var extraSets = ex.extraSets || 0;
        var displaySets = programmedSets + extraSets;
        var loggedCount = 0;
        ex.sets.forEach(function(set) { if (set && set.weight > 0 && set.reps > 0) loggedCount++; });
        var allDone = loggedCount >= programmedSets;
        var hasLogs = loggedCount > 0;
        var wasSkipped = !!(ex.skipReason);

        html += '<div class="exercise-card' +
          (allDone ? ' all-done' : '') +
          (hasLogs && !allDone ? ' has-logs' : '') +
          (wasSkipped ? ' skipped' : '') +
          '" data-ex="' + exIdx + '">';
        html += '<div class="ex-header">';
        html += '<span class="ex-name">' + ex.name + '</span>';
        html += '<span class="ex-target">' + programmedSets + ' × ' + template.reps + (extraSets > 0 ? ' <span style="color:#ffb74d;font-size:10px;">+' + extraSets + '</span>' : '') + '</span>';
        html += App.renderSparkline(App.getExerciseProgression(ex.name, 6));
        html += '</div>';
        var cue = template.cue || template.note;
        if (cue) {
          html += '<div class="ex-permanent-note">' + cue + '</div>';
        }
        var lastLog = App.getLastLog(ex.name);
        if (lastLog) {
          html += '<div class="ex-history">Last: ' + lastLog + '</div>';
        }
        if (wasSkipped) {
          var reasonLabels = { injury: '🩹 Injury / pain', fatigue: '😴 Fatigue', time: '⏱️ Short on time', equipment: '🔧 Equipment', other: '💬 Other' };
          var reasonLabel = reasonLabels[ex.skipReason] || ex.skipReason;
          html += '<div class="skip-tag">' + reasonLabel + (ex.skipNote ? ': ' + ex.skipNote : '') + '</div>';
        }
        if (!allDone && !wasSkipped) {
          html += '<button class="btn-skip-ex" data-ex="' + exIdx + '" style="font-size:10px;padding:3px 8px;background:none;border:1px solid #3a2a2a;border-radius:6px;color:#7a5a5a;cursor:pointer;margin-bottom:4px;">Skip Exercise</button>';
        }
        html += '<div class="set-circles">';

        for (var si = 0; si < displaySets; si++) {
          var setData = ex.sets[si];
          var logged = setData && setData.weight > 0 && setData.reps > 0;
          var isExtra = si >= programmedSets;
          var brief = '';
          if (logged) {
            brief = setData.weight + 'kg' + (setData.rpe ? ' @' + setData.rpe : '');
          }
          var isCurrent = false;
          if (!logged) {
            for (var ei2 = 0; ei2 < cw.exercises.length && !isCurrent; ei2++) {
              var progSets2 = App.programs[cw.dayType][ei2].sets + (cw.exercises[ei2].extraSets || 0);
              for (var si2 = 0; si2 < progSets2; si2++) {
                var sd2 = cw.exercises[ei2].sets[si2];
                if (!sd2 || !sd2.weight || !sd2.reps) {
                  if (ei2 === exIdx && si2 === si) isCurrent = true;
                  break;
                }
              }
              if (isCurrent) break;
            }
          }

          html += '<span class="set-circle' +
            (logged ? ' logged' : '') +
            (isCurrent ? ' current-set' : '') +
            (isExtra ? ' extra-set' : '') +
            '" data-ex="' + exIdx + '" data-set="' + si + '"' +
            (isExtra ? ' data-extra="1"' : '') + '>';
          if (isExtra && !logged) {
            html += '<span class="set-del">×</span>';
          }
          html += '<span class="set-num">' + (isExtra ? '+' : '') + (si + 1) + '</span>';
          if (brief) {
            html += '<span class="set-brief">' + brief + '<span class="set-dup">+</span></span>';
          }
          html += '</span>';
        }

        html += '<button class="btn-add-set" data-ex="' + exIdx + '" title="Add an extra set">+</button>';
        html += '</div></div>';

        if (App.isProgressionCoachEnabled() && allDone) {
          html += App.renderProgressionCoach(ex.name, cw.dayType);
        }
      });

      // Progress footer
      html += '<div class="workout-progress">';
      html += '<div class="stat"><div class="stat-val">' + volume.toLocaleString() + ' kg</div><div class="stat-label">Volume</div></div>';
      html += '<div class="stat"><div class="stat-val">' + loggedSets + ' / ' + totalSetsAll + '</div><div class="stat-label">Sets Done</div></div>';
      html += '<div class="stat"><div class="stat-val"><span id="elapsedTime">0:00</span></div><div class="stat-label">Elapsed</div></div>';
      html += '</div>';

      // Rest timer bar
      html += '<div class="rest-timer-bar" id="restTimerBar">';
      html += '<div class="timer-presets">';
      [30, 60, 90, 120, 180].forEach(function(sec) {
        html += '<button class="preset-btn' + (!s.timerRunning && s.timerDuration === sec ? ' active-preset' : '') + '" data-seconds="' + sec + '">' + sec + 's</button>';
      });
      html += '</div>';
      html += '<div class="timer-main">';
      html += '<span class="timer-display">' + App.formatTimer(s.timerRemaining) + '</span>';
      html += '<input type="number" class="timer-custom" id="timerCustom" placeholder="sec" value="' + s.timerDuration + '" min="5" max="600" step="5">';
      html += '<button class="timer-action-btn" id="timerActionBtn">' + (s.timerRunning ? 'Reset' : 'Start') + '</button>';
      html += '<button class="timer-action-btn" id="timer30sBtn" style="font-size:11px;' + (s.timerRunning ? '' : 'display:none;') + '">+30s</button>';
      html += '<button class="timer-action-btn" id="timerSkipBtn" style="font-size:11px;background:#2a1a1a;border-color:#5a3a3a;color:#c96a6a;">Skip</button>';
      html += '</div>';
      html += '<div class="timer-auto-toggle">';
      html += '<label for="timerAutoCheck">Auto-start after set</label>';
      html += '<input type="checkbox" id="timerAutoCheck"' + (s.timerAutoStart ? ' checked' : '') + '>';
      html += '</div>';
      html += '</div>';

      // Cardio checkbox
      var cardioDone = !!(s.appData.cardioLog && s.appData.cardioLog[App.todayStr()]);
      html += '<div class="cardio-check" style="display:flex;align-items:center;gap:10px;padding:12px 14px;background:#14191f;border-radius:12px;margin-bottom:10px;cursor:pointer;" id="cardioCheck">';
      html += '<input type="checkbox" id="cardioCheckbox" style="accent-color:#4caf50;width:20px;height:20px;cursor:pointer;"' + (cardioDone ? ' checked' : '') + '>';
      html += '<label for="cardioCheckbox" style="font-size:14px;font-weight:500;cursor:pointer;">Cardio done today</label>';
      html += '</div>';

      html += '<button class="btn-finish" id="btnFinish">✓ Finish Workout</button>';
      html += '<button style="width:100%;padding:12px;background:none;border:1px solid #3a2a2a;border-radius:14px;color:#7a5a5a;font-size:14px;font-weight:600;cursor:pointer;margin-bottom:8px;" id="btnCancelWorkout">✕ Cancel Workout</button>';
    }

    dom.workoutContent.innerHTML = html;

    // Onboarding dismiss
    var btnDismiss = document.getElementById('btnDismissOnboard');
    if (btnDismiss) btnDismiss.addEventListener('click', function() {
      localStorage.setItem('tallTenderOnboarded', '1');
      var card = document.getElementById('onboardCard');
      if (card) card.style.display = 'none';
    });

    // Meal reminder tap
    var mealReminder = dom.workoutContent.querySelector('.meal-reminder');
    if (mealReminder) mealReminder.addEventListener('click', function() {
      App.haptic();
      App.switchView('nutrition');
    });

    if (!s.appData.currentWorkout) {
      dom.workoutContent.querySelectorAll('.day-type-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          App.haptic();
          var dayType = this.dataset.day;
          App.showConfirm(
            '<h3>Start ' + dayType + '?</h3><p>Begin logging your ' + dayType.toLowerCase() + ' workout.</p>',
            [
              { label: 'Cancel', cls: 'btn-cancel', callback: function() {} },
              { label: '✓ Start', cls: 'btn-save', callback: function() { App.startWorkout(dayType); } }
            ]
          );
        });
      });
      s.clockInterval = setInterval(function() {
        var el = document.getElementById('liveClock');
        if (el) el.textContent = App.formatTimeNow();
      }, 1000);
    } else {
      // Set circle dup tap
      dom.workoutContent.querySelectorAll('.set-dup').forEach(function(dup) {
        dup.addEventListener('click', function(e) {
          e.stopPropagation();
          App.haptic();
          var circle = this.closest('.set-circle');
          var exIdx = parseInt(circle.dataset.ex);
          var setIdx = parseInt(circle.dataset.set);
          var ex = s.appData.currentWorkout.exercises[exIdx];
          var src = ex.sets[setIdx];
          if (!src) return;
          var totalSets = App.programs[s.appData.currentWorkout.dayType][exIdx].sets + (ex.extraSets || 0);
          for (var si = setIdx + 1; si < totalSets; si++) {
            if (!ex.sets[si] || !ex.sets[si].reps) {
              ex.sets[si] = { weight: src.weight, reps: src.reps, rpe: src.rpe, notes: src.notes || '' };
              App.saveData();
              App.renderWorkoutView();
              App.showToast('Duplicated set ' + (si + 1) + ' (' + src.weight + 'kg × ' + src.reps + ')');
              if (s.timerAutoStart) App.startTimer();
              return;
            }
          }
          App.showToast('No empty sets left in this exercise');
        });
      });
      dom.workoutContent.querySelectorAll('.set-circle').forEach(function(el) {
        el.addEventListener('click', function() {
          var exIdx = parseInt(this.dataset.ex);
          var setIdx = parseInt(this.dataset.set);
          App.openSetModal(exIdx, setIdx);
        });
      });
      var btnFinish = document.getElementById('btnFinish');
      if (btnFinish) {
        btnFinish.addEventListener('click', function() {
          App.haptic();
          App.finishWorkout();
        });
      }
      dom.workoutContent.querySelectorAll('.btn-skip-ex').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          App.haptic();
          var exIdx = parseInt(this.dataset.ex);
          App.openSkipModal(exIdx);
        });
      });
      dom.workoutContent.querySelectorAll('.btn-add-set').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
          e.stopPropagation();
          App.haptic();
          var exIdx = parseInt(this.dataset.ex);
          var ex = s.appData.currentWorkout.exercises[exIdx];
          ex.extraSets = (ex.extraSets || 0) + 1;
          App.saveData();
          App.renderWorkoutView();
          App.showToast('Extra set added to ' + ex.name);
        });
      });
      dom.workoutContent.querySelectorAll('.set-circle.extra-set').forEach(function(circle) {
        circle.addEventListener('click', function(e) {
          if (e.target.closest('.set-del')) {
            e.stopPropagation();
            App.haptic();
            var exIdx = parseInt(this.dataset.ex);
            var setIdx = parseInt(this.dataset.set);
            var ex = s.appData.currentWorkout.exercises[exIdx];
            var sd = ex.sets[setIdx];
            if (!sd || !sd.weight || !sd.reps) {
              ex.sets.splice(setIdx, 1);
              ex.extraSets = Math.max(0, (ex.extraSets || 1) - 1);
              App.saveData();
              App.renderWorkoutView();
              App.showToast('Extra set removed');
            }
          }
        });
      });
      var btnCancel = document.getElementById('btnCancelWorkout');
      if (btnCancel) {
        btnCancel.addEventListener('click', function() {
          App.haptic();
          App.cancelWorkout();
        });
      }
      dom.workoutContent.querySelectorAll('.preset-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          App.haptic();
          var sec = parseInt(this.dataset.seconds);
          App.startTimer(sec);
        });
      });
      var timerActionBtn = document.getElementById('timerActionBtn');
      if (timerActionBtn) {
        timerActionBtn.addEventListener('click', function() { App.haptic(); App.toggleTimer(); });
      }
      var timerCustom = document.getElementById('timerCustom');
      if (timerCustom) {
        timerCustom.addEventListener('change', function() {
          var val = parseInt(this.value) || 60;
          if (val < 5) val = 5;
          if (val > 600) val = 600;
          this.value = val;
          s.timerDuration = val;
          s.timerRemaining = val;
          App.saveTimerSettings();
          App.updateTimerUI();
        });
      }
      var timerAutoCheck = document.getElementById('timerAutoCheck');
      if (timerAutoCheck) {
        timerAutoCheck.addEventListener('change', function() {
          s.timerAutoStart = this.checked;
          App.saveTimerSettings();
        });
      }
      var timerSkipBtn = document.getElementById('timerSkipBtn');
      if (timerSkipBtn) {
        timerSkipBtn.addEventListener('click', function() {
          App.haptic();
          if (s.timerRunning) App.stopTimer();
          s.timerRemaining = 0;
          App.updateTimerUI();
        });
      }
      var timer30sBtn = document.getElementById('timer30sBtn');
      if (timer30sBtn) {
        timer30sBtn.addEventListener('click', function() {
          App.haptic();
          s.timerRemaining += 30;
          App.updateTimerUI();
        });
      }
      s.clockInterval = setInterval(function() {
        var el = document.getElementById('liveClock');
        if (el) el.textContent = App.formatTimeNow();
        App.updateElapsed();
      }, 1000);
    }

    // Cardio checkbox
    var cardioCb = document.getElementById('cardioCheckbox');
    var cardioDiv = document.getElementById('cardioCheck');
    if (cardioCb && cardioDiv) {
      cardioDiv.addEventListener('click', function(e) {
        if (e.target === cardioCb) return;
        cardioCb.checked = !cardioCb.checked;
        App.toggleCardio(cardioCb.checked);
      });
      cardioCb.addEventListener('change', function() {
        App.toggleCardio(cardioCb.checked);
      });
    }
  };

  App.toggleCardio = function(done) {
    if (!s.appData.cardioLog) s.appData.cardioLog = {};
    s.appData.cardioLog[App.todayStr()] = done;
    App.saveData();
  };

  // ==================== RENDER: ARCHIVE VIEW ====================

  App.renderArchiveView = function() {
    var workouts = s.appData.workouts.slice().reverse();
    var html = '';

    var exNames = {};
    workouts.forEach(function(w) {
      w.exercises.forEach(function(ex) {
        exNames[ex.name] = true;
      });
    });
    var exNameList = Object.keys(exNames).sort();

    html += '<div class="archive-controls">';
    html += '<select id="archiveFilter">';
    html += '<option value="">All exercises</option>';
    exNameList.forEach(function(name) {
      html += '<option value="' + name.replace(/"/g, '&quot;') + '">' + name + '</option>';
    });
    html += '</select>';
    html += '</div>';

    html += '<div class="io-buttons">';
    html += '<button class="io-btn" id="btnExport">📥 Export JSON</button>';
    html += '<button class="io-btn" id="btnImport">📤 Import JSON</button>';
    html += '</div>';

    var totalVolumeAll = workouts.reduce(function(sum, w) { return sum + w.totalVolume; }, 0);
    html += '<p style="font-size:13px;color:#7e8d9e;margin-bottom:12px;">';
    html += '<strong>' + workouts.length + '</strong> workouts · ';
    html += '<strong>' + totalVolumeAll.toLocaleString() + ' kg</strong> total volume';
    html += '</p>';

    if (workouts.length === 0) {
      html += '<div class="archive-empty">';
      html += '<span class="empty-icon">📋</span>';
      html += '<h3 style="color:#7e8d9e;">No workouts yet</h3>';
      html += '<p>Complete a workout to see it here.</p>';
      html += '</div>';
    } else {
      workouts.forEach(function(w, idx) {
        html += '<div class="archive-card" data-idx="' + idx + '">';
        html += '<div class="arc-top">';
        html += '<span class="arc-date">' + App.formatDate(w.date) + '</span>';
        html += '<span class="arc-type">' + w.dayType + '</span>';
        html += '</div>';
        html += '<div class="arc-meta">';
        html += '<span>' + w.startTime + ' → ' + w.endTime + '</span>';
        html += '<span>' + w.totalVolume.toLocaleString() + ' kg</span>';
        html += '<span>RPE ' + w.avgRpe + '</span>';
        html += '</div>';
        html += '<div class="arc-detail">';
        w.exercises.forEach(function(ex) {
          html += '<div class="arc-exercise">';
          html += '<div class="arc-ex-name">' + ex.name + '</div>';
          html += '<div class="arc-sets">';
          ex.sets.forEach(function(set, si) {
            html += '<span>Set ' + (si + 1) + ': ' + set.weight + 'kg × ' + set.reps + ' @' + set.rpe + '</span>';
            if (set.notes) html += '<span style="color:#5a7a6a;font-style:italic;">"' + set.notes + '"</span>';
          });
          html += '</div></div>';
        });
        html += '</div>';
        html += '</div>';
      });
    }

    dom.archiveContent.innerHTML = html;

    dom.archiveContent.querySelectorAll('.archive-card').forEach(function(card) {
      card.addEventListener('click', function(e) {
        card.classList.toggle('expanded');
        App.haptic();
      });
    });

    var filterSelect = dom.archiveContent.querySelector('#archiveFilter');
    if (filterSelect) {
      filterSelect.addEventListener('change', function() {
        App.filterArchiveCards(this.value);
      });
      filterSelect.addEventListener('click', function(e) { e.stopPropagation(); });
    }

    var btnExport = dom.archiveContent.querySelector('#btnExport');
    if (btnExport) {
      btnExport.addEventListener('click', function(e) {
        e.stopPropagation();
        App.haptic();
        App.exportData();
      });
    }

    var btnImport = dom.archiveContent.querySelector('#btnImport');
    if (btnImport) {
      btnImport.addEventListener('click', function(e) {
        e.stopPropagation();
        App.haptic();
        dom.importInput.click();
      });
    }
  };

  App.filterArchiveCards = function(exName) {
    var cards = dom.archiveContent.querySelectorAll('.archive-card');
    if (!exName) {
      cards.forEach(function(c) { c.style.display = ''; });
      return;
    }
    var workouts = s.appData.workouts.slice().reverse();
    cards.forEach(function(card, idx) {
      var w = workouts[idx];
      if (!w) { card.style.display = ''; return; }
      var hasEx = w.exercises.some(function(ex) { return ex.name === exName; });
      card.style.display = hasEx ? '' : 'none';
    });
  };

  // ==================== RENDER: STATS VIEW ====================

  App.renderStatsView = function() {
    var workouts = s.appData.workouts;
    var html = '';

    if (workouts.length === 0) {
      html += '<div class="archive-empty">';
      html += '<span class="empty-icon">📊</span>';
      html += '<h3 style="color:#7e8d9e;">No data yet</h3>';
      html += '<p>Complete workouts to see your stats.</p>';
      html += '</div>';
      dom.statsContent.innerHTML = html;
      return;
    }

    var totalVolumeAll = workouts.reduce(function(sum, w) { return sum + w.totalVolume; }, 0);
    var totalSetsAll = workouts.reduce(function(sum, w) {
      return sum + w.exercises.reduce(function(ss, ex) { return ss + ex.sets.length; }, 0);
    }, 0);

    var dayCounts = {};
    workouts.forEach(function(w) {
      dayCounts[w.dayType] = (dayCounts[w.dayType] || 0) + 1;
    });
    var mostFreqDay = '';
    var mostFreqCount = 0;
    Object.keys(dayCounts).forEach(function(k) {
      if (dayCounts[k] > mostFreqCount) {
        mostFreqCount = dayCounts[k];
        mostFreqDay = k;
      }
    });

    var streak = App.calcStreak(workouts);

    html += '<div class="stats-grid">';
    html += '<div class="metric-card"><div class="metric-val">' + workouts.length + '</div><div class="metric-label">Workouts</div></div>';
    html += '<div class="metric-card"><div class="metric-val">' + (totalVolumeAll / 1000).toFixed(1) + 'k</div><div class="metric-label">Total Volume (kg)</div></div>';
    html += '<div class="metric-card"><div class="metric-val">' + totalSetsAll + '</div><div class="metric-label">Total Sets</div></div>';
    html += '<div class="metric-card"><div class="metric-val">' + mostFreqDay + '</div><div class="metric-label">Top Day Type</div></div>';
    html += '<div class="metric-card"><div class="metric-val">' + streak + '</div><div class="metric-label">Week Streak</div></div>';
    html += '</div>';

    // Most Improved Exercise
    var exStats = {};
    workouts.forEach(function(w) {
      w.exercises.forEach(function(ex) {
        if (!exStats[ex.name]) {
          exStats[ex.name] = { allSets: [], bestWeight: 0, bestVolume: 0, totalSets: 0, rpeSum: 0, rpeCount: 0 };
        }
        var st = exStats[ex.name];
        ex.sets.forEach(function(set) {
          st.allSets.push(set);
          st.totalSets++;
          if (set.weight > st.bestWeight) st.bestWeight = set.weight;
          var setVol = set.weight * set.reps;
          if (setVol > st.bestVolume) st.bestVolume = setVol;
          if (set.rpe > 0) { st.rpeSum += set.rpe; st.rpeCount++; }
        });
      });
    });

    var improvements = [];
    Object.keys(exStats).forEach(function(name) {
      var weights = [];
      for (var wi = workouts.length - 1; wi >= 0 && weights.length < 8; wi--) {
        for (var j = 0; j < workouts[wi].exercises.length; j++) {
          if (workouts[wi].exercises[j].name === name && workouts[wi].exercises[j].sets[0] && workouts[wi].exercises[j].sets[0].weight > 0) {
            weights.push(workouts[wi].exercises[j].sets[0].weight);
            break;
          }
        }
      }
      if (weights.length >= 4) {
        var firstAvg = weights.slice(0, 3).reduce(function(a,b){return a+b;},0)/Math.min(3,weights.length);
        var lastAvg = weights.slice(-3).reduce(function(a,b){return a+b;},0)/3;
        if (firstAvg > 0) improvements.push({ name: name, pct: Math.round((lastAvg/firstAvg - 1)*100), first: Math.round(firstAvg), last: Math.round(lastAvg) });
      }
    });
    improvements.sort(function(a,b){ return b.pct - a.pct; });
    if (improvements.length > 0) {
      var best = improvements[0];
      html += '<div style="margin:8px 0;padding:12px;background:#14191f;border-radius:12px;border-left:3px solid ' + (best.pct > 0 ? '#4caf50' : '#ef5350') + ';">';
      html += '<div style="font-size:11px;color:#7e8d9e;margin-bottom:2px;">Most Improved</div>';
      html += '<div style="font-size:14px;font-weight:600;">' + best.name + ' <span style="color:' + (best.pct > 0 ? '#4caf50' : '#ef5350') + ';">' + (best.pct > 0 ? '+' : '') + best.pct + '%</span></div>';
      html += '<div style="font-size:10px;color:#5a6a7a;">' + best.first + 'kg → ' + best.last + 'kg average top set</div>';
      html += '</div>';
    }

    // Weekly volume trend
    var weekVolumes = [];
    var weekLabels = [];
    for (var wi = Math.max(0, workouts.length - 28); wi < workouts.length; wi++) {
      var wd = new Date(workouts[wi].startedAt || workouts[wi].completedAt || 0);
      var wk = wd.getFullYear() + '-W' + ('0' + Math.floor((wd - new Date(wd.getFullYear(),0,1)) / 604800000)).slice(-2);
      var found = false;
      for (var v = 0; v < weekVolumes.length; v++) {
        if (weekLabels[v] === wk) { weekVolumes[v] += workouts[wi].totalVolume || 0; found = true; break; }
      }
      if (!found) { weekLabels.push(wk); weekVolumes.push(workouts[wi].totalVolume || 0); }
    }
    if (weekVolumes.length > 1) {
      html += '<div style="margin:8px 0;font-size:11px;color:#7e8d9e;">Weekly Volume</div>';
      html += '<div style="display:flex;align-items:end;gap:4px;height:40px;">';
      var maxVol = Math.max.apply(null, weekVolumes);
      weekVolumes.forEach(function(v) {
        var h = Math.max(4, (v / maxVol) * 40);
        html += '<div style="flex:1;background:#4caf50;border-radius:3px 3px 0 0;height:' + h + 'px;opacity:0.6;" title="' + Math.round(v/1000) + 'k kg"></div>';
      });
      html += '</div>';
    }

    html += '<div class="section-title">Exercise Stats</div>';

    var exList = Object.keys(exStats).map(function(name) {
      var st = exStats[name];
      var best1RM = 0;
      st.allSets.forEach(function(set) {
        var rm = App.calc1RM(set.weight, set.reps);
        if (rm > best1RM) best1RM = rm;
      });
      return {
        name: name,
        best1RM: best1RM,
        bestWeight: st.bestWeight,
        bestVolume: st.bestVolume,
        totalSets: st.totalSets,
        avgRpe: st.rpeCount > 0 ? Math.round((st.rpeSum / st.rpeCount) * 10) / 10 : 0
      };
    });

    exList.sort(function(a, b) { return b.best1RM - a.best1RM; });

    exList.forEach(function(ex) {
      html += '<div class="ex-stat-row">';
      html += '<div class="ex-stat-name">' + ex.name + '</div>';
      html += '<div class="ex-stat-nums">';
      html += '<span class="highlight">1RM: ' + ex.best1RM + ' kg</span>';
      html += '<span>Best: ' + ex.bestWeight + ' kg</span>';
      html += '<span>Vol: ' + ex.bestVolume.toLocaleString() + ' kg</span>';
      html += '<span>' + ex.totalSets + ' sets</span>';
      html += '<span>Avg RPE: ' + ex.avgRpe + '</span>';
      html += '</div></div>';
    });

    // Weekly volume chart
    html += '<div class="section-title">Weekly Volume (Last 8 Weeks)</div>';

    var weekVolumesChart = {};
    workouts.forEach(function(w) {
      var wk = App.getWeekKey(w.date);
      weekVolumesChart[wk] = (weekVolumesChart[wk] || 0) + w.totalVolume;
    });

    var weeks = Object.keys(weekVolumesChart).sort();
    if (weeks.length > 8) weeks = weeks.slice(-8);

    if (weeks.length === 0) {
      html += '<div class="chart-empty">No data to chart yet.</div>';
    } else {
      var maxVolChart = Math.max.apply(null, weeks.map(function(w) { return weekVolumesChart[w]; }));
      if (maxVolChart === 0) maxVolChart = 1;

      html += '<div class="chart-container"><div class="chart-bars">';
      weeks.forEach(function(wk) {
        var vol = weekVolumesChart[wk];
        var pct = Math.round((vol / maxVolChart) * 100);
        if (pct < 3) pct = 3;
        var label = wk.replace('-W', ' W');
        html += '<div class="chart-bar-wrap">';
        html += '<div class="chart-bar-val">' + (vol / 1000).toFixed(1) + 'k</div>';
        html += '<div class="chart-bar" style="height:' + pct + '%" title="' + wk + ': ' + vol.toLocaleString() + ' kg"></div>';
        html += '<div class="chart-bar-label">' + label + '</div>';
        html += '</div>';
      });
      html += '</div></div>';
    }

    dom.statsContent.innerHTML = html;
  };

  App.calcStreak = function(workouts) {
    if (workouts.length === 0) return 0;
    var trainedWeeks = {};
    workouts.forEach(function(w) {
      trainedWeeks[App.getWeekKey(w.date)] = true;
    });
    var weeks = Object.keys(trainedWeeks).sort().reverse();
    if (weeks.length === 0) return 0;

    var streak = 1;
    for (var i = 1; i < weeks.length; i++) {
      var parts = weeks[i - 1].split('-W');
      var yr = parseInt(parts[0]);
      var wk = parseInt(parts[1]);
      var prevYr = yr;
      var prevWk = wk - 1;
      if (prevWk <= 0) {
        prevYr--;
        prevWk = 52;
      }
      var prevKey = prevYr + '-W' + (prevWk < 10 ? '0' : '') + prevWk;
      if (trainedWeeks[prevKey]) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  };

  // ==================== PROGRESSION COACH ====================

  function analyzeProgression(exerciseName, dayType) {
    var template = null;
    var prog = App.programs[dayType];
    for (var i = 0; i < prog.length; i++) {
      if (prog[i].name === exerciseName) { template = prog[i]; break; }
    }
    if (!template) return null;

    var repRange = template.reps.match(/(\d+)\s*-\s*(\d+)/);
    if (!repRange) return null;
    var low = parseInt(repRange[1]);
    var high = parseInt(repRange[2]);

    var cw = s.appData.currentWorkout;
    var ex = null;
    for (var j = 0; j < cw.exercises.length; j++) {
      if (cw.exercises[j].name === exerciseName) { ex = cw.exercises[j]; break; }
    }
    if (!ex || !ex.sets.length) return null;

    var totalSets = template.sets;
    var allDone = ex.sets.length >= totalSets && ex.sets.every(function(set) { return set && set.reps > 0; });
    if (!allDone) return null;

    var workingSets = ex.sets.filter(function(set) {
      if (!set || !set.reps) return false;
      if (set.rpe && set.rpe <= 6 && set.reps >= 5) return false;
      return true;
    });
    var topW = workingSets.reduce(function(m, set) { return Math.max(m, set.weight || 0); }, 0);
    workingSets = workingSets.filter(function(set) { return (set.weight || 0) >= topW * 0.6; });
    if (!workingSets.length) workingSets = ex.sets.filter(function(set) { return set && set.reps > 0; });

    var allHitTop = workingSets.every(function(set) { return set.reps >= high; });
    var anyBelowBottom = workingSets.some(function(set) { return set.reps < low; });
    var avgRpe = workingSets.reduce(function(sum, set) { return sum + (set.rpe || 0); }, 0) / workingSets.length;
    var topWeight = workingSets.reduce(function(max, set) { return Math.max(max, set.weight || 0); }, 0);

    var action, message, color;
    if (allHitTop && avgRpe <= 9 && avgRpe > 0) {
      var increase = topWeight < 50 ? 2.5 : (topWeight < 100 ? 5 : 10);
      action = 'increase';
      message = 'Add ' + increase + 'kg next session — all sets hit top of range @RPE ' + avgRpe.toFixed(0);
      color = '#4caf50';
    } else if (anyBelowBottom) {
      action = 'decrease';
      message = 'Back off weight — sets falling below ' + low + ' reps. Reduce 5-10% next session';
      color = '#ef5350';
    } else if (avgRpe >= 9.5) {
      action = 'hold';
      message = 'Hold weight — at RPE limit (' + avgRpe.toFixed(0) + '). Build more volume before increasing';
      color = '#ffb74d';
    } else {
      action = 'maintain';
      message = 'Keep weight, push for ' + high + ' reps — building volume before next jump';
      color = '#7e8d9e';
    }

    return { action: action, message: message, color: color, topWeight: topWeight, avgRpe: avgRpe, low: low, high: high };
  }

  function checkDeload(exerciseName) {
    var weekMap = {};
    var now = new Date();
    for (var i = s.appData.workouts.length - 1; i >= 0; i--) {
      var w = s.appData.workouts[i];
      var wDate = new Date(w.startedAt || w.completedAt || 0);
      var weekKey = wDate.getFullYear() + '-W' + Math.floor((wDate - new Date(wDate.getFullYear(), 0, 1)) / 604800000);
      if (!weekMap[weekKey]) {
        weekMap[weekKey] = { date: wDate, topWeight: 0 };
      }
      for (var j = 0; j < w.exercises.length; j++) {
        if (w.exercises[j].name === exerciseName) {
          var sets = w.exercises[j].sets.filter(function(set) { return set && set.reps > 0; });
          sets.forEach(function(set) {
            if (set.weight > weekMap[weekKey].topWeight) weekMap[weekKey].topWeight = set.weight;
          });
        }
      }
    }

    var weeks = Object.keys(weekMap).sort();
    if (weeks.length < 4) return null;

    var recent = weeks.slice(-3);
    var weights = recent.map(function(wk) { return weekMap[wk].topWeight; });
    var declining = weights[0] > weights[1] && weights[1] > weights[2];

    var lastWorkout = s.appData.workouts[s.appData.workouts.length - 1];
    var daysSinceLast = lastWorkout ? Math.floor((now - new Date(lastWorkout.startedAt || lastWorkout.completedAt || 0)) / 86400000) : 0;

    if (declining) {
      return {
        deload: true,
        severity: 'warning',
        message: 'Consider a deload week — top weight declining for 3 consecutive weeks. Train at 50-60% for one week, then resume.'
      };
    } else if (daysSinceLast > 10) {
      return {
        deload: true,
        severity: 'info',
        message: daysSinceLast + ' days since last workout. Start light (80-90% of last working weight) and ramp up over 2-3 sets.'
      };
    }
    return null;
  }

  App.renderProgressionCoach = function(exerciseName, dayType) {
    var result = analyzeProgression(exerciseName, dayType);
    var deloadResult = checkDeload(exerciseName);
    var html = '';

    if (result) {
      html += '<div class="prog-coach" style="margin:6px 0;padding:10px 12px;border-radius:10px;background:#0f151b;border-left:3px solid ' + result.color + ';">';
      html += '<div style="font-size:12px;font-weight:600;color:' + result.color + ';">Progression Coach</div>';
      html += '<div style="font-size:11px;color:#a0b0c0;margin-top:2px;">' + result.message + '</div>';
      if (result.action === 'increase') {
        html += '<div style="font-size:10px;color:#5a7a6a;margin-top:2px;">Top set: ' + result.topWeight + 'kg × ' + result.high + ' reps all sets</div>';
      }
      html += '</div>';
    }

    if (deloadResult) {
      html += '<div class="prog-coach deload" style="margin:6px 0;padding:10px 12px;border-radius:10px;background:#1a1515;border-left:3px solid ' + (deloadResult.severity === 'warning' ? '#ef5350' : '#ffb74d') + ';">';
      html += '<div style="font-size:12px;font-weight:600;color:' + (deloadResult.severity === 'warning' ? '#ef5350' : '#ffb74d') + ';">🔄 Recovery Check</div>';
      html += '<div style="font-size:11px;color:#a0b0c0;margin-top:2px;">' + deloadResult.message + '</div>';
      html += '</div>';
    }

    return html;
  };

  App.isProgressionCoachEnabled = function() {
    try {
      return localStorage.getItem('tallTenderProgCoach') !== 'false';
    } catch (e) { return true; }
  };

  // ==================== EVENT INIT ====================

  App.initWorkoutEvents = function() {
    // Set modal events
    dom.modalSaveBtn.addEventListener('click', App.handleSaveSet);
    dom.modalCancelBtn.addEventListener('click', App.closeSetModal);
    dom.setModal.addEventListener('click', function(e) {
      if (e.target === dom.setModal) App.closeSetModal();
    });

    // Weight stepper buttons
    dom.setModal.addEventListener('click', function(e) {
      var btn = e.target.closest('.step-btn');
      if (btn) {
        e.preventDefault();
        var step = parseFloat(btn.dataset.step);
        var current = parseFloat(dom.modalWeight.value) || 0;
        var next = Math.max(0, Math.round((current + step) * 10) / 10);
        dom.modalWeight.value = next || '';
        updatePlateCalc();
        updateWarmupHint();
        App.haptic();
        return;
      }
      if (e.target.closest('#modalWarmupBtn')) {
        e.preventDefault();
        fillWarmup();
      }
    });

    // Plate calc + warmup hint on weight input
    dom.modalWeight.addEventListener('input', function() {
      updatePlateCalc();
      updateWarmupHint();
    });

    // Keyboard shortcuts
    dom.modalWeight.addEventListener('keydown', function(e) { if (e.key === 'Enter') { dom.modalReps.focus(); e.preventDefault(); } });
    dom.modalReps.addEventListener('keydown', function(e) { if (e.key === 'Enter') { dom.modalRpe.focus(); e.preventDefault(); } });
    dom.modalRpe.addEventListener('keydown', function(e) { if (e.key === 'Enter') { App.handleSaveSet(); } });
    dom.modalNotes.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && e.ctrlKey) { App.handleSaveSet(); }
    });

    // Skip exercise modal
    App.initSkipModal();
  };

})();
