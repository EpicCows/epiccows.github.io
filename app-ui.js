window.App = window.App || {};

(function() {
  'use strict';

  var App = window.App;
  var s = App.state;

  // ==================== TOAST ====================

  App.showToast = function(msg, undoFn) {
    var domToast = App.dom.toast;
    if (undoFn) {
      domToast.innerHTML = msg + ' <span class="toast-undo" style="color:#4caf50;cursor:pointer;text-decoration:underline;font-weight:700;">Undo</span>';
      domToast.querySelector('.toast-undo').addEventListener('click', function(e) {
        e.stopPropagation();
        undoFn();
        domToast.classList.remove('show');
      });
    } else {
      domToast.textContent = msg;
    }
    domToast.classList.add('show');
    clearTimeout(domToast._timeout);
    domToast._timeout = setTimeout(function() {
      domToast.classList.remove('show');
    }, undoFn ? 4000 : 2500);
  };

  // ==================== HAPTIC ====================

  App.haptic = function() {
    if (navigator.vibrate) {
      navigator.vibrate(10);
    }
  };

  // ==================== CONFIRM MODAL ====================

  App.showConfirm = function(htmlContent, actions) {
    App.dom.confirmContent.innerHTML = htmlContent;
    App.dom.confirmActions.innerHTML = '';
    actions.forEach(function(a) {
      var btn = document.createElement('button');
      btn.textContent = a.label;
      btn.className = a.cls || 'btn-save';
      btn.addEventListener('click', function() {
        App.closeConfirm();
        if (a.callback) a.callback();
      });
      App.dom.confirmActions.appendChild(btn);
    });
    App.dom.confirmModal.classList.add('open');
  };

  App.closeConfirm = function() {
    App.dom.confirmModal.classList.remove('open');
  };

  // ==================== TIMER ====================

  App.loadTimerSettings = function() {
    try {
      var saved = localStorage.getItem('tallTenderTimer');
      if (saved) {
        var settings = JSON.parse(saved);
        s.timerDuration = settings.duration || 60;
        s.timerAutoStart = settings.autoStart !== undefined ? settings.autoStart : true;
      }
    } catch (e) {}
  };

  App.saveTimerSettings = function() {
    try {
      localStorage.setItem('tallTenderTimer', JSON.stringify({
        duration: s.timerDuration,
        autoStart: s.timerAutoStart
      }));
    } catch (e) {}
  };

  App.formatTimer = function(seconds) {
    var m = Math.floor(seconds / 60);
    var sec = seconds % 60;
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  };

  App.updateElapsed = function() {
    var el = document.getElementById('elapsedTime');
    if (!el || !s.appData.currentWorkout) return;
    var elapsed = Date.now() - (s.appData.currentWorkout.startTimestamp || Date.now());
    el.textContent = App.formatElapsed(elapsed);
  };

  App.tickTimer = function() {
    if (!s.timerRunning) return;
    s.timerRemaining--;
    App.updateTimerUI();
    if (s.timerRemaining <= 0) {
      App.stopTimer();
      if (navigator.vibrate) { navigator.vibrate([200, 100, 200, 100, 400]); }
      App.showToast('⏰ Rest done - next set!');
    }
  };

  App.startTimer = function(duration) {
    if (duration !== undefined) {
      s.timerDuration = duration;
      s.timerRemaining = duration;
      App.saveTimerSettings();
    } else {
      s.timerRemaining = s.timerDuration;
    }
    if (s.timerInterval) clearInterval(s.timerInterval);
    s.timerRunning = true;
    s.timerInterval = setInterval(App.tickTimer, 1000);
    App.updateTimerUI();
  };

  App.stopTimer = function() {
    s.timerRunning = false;
    if (s.timerInterval) {
      clearInterval(s.timerInterval);
      s.timerInterval = null;
    }
    s.timerRemaining = s.timerDuration;
    App.updateTimerUI();
  };

  App.toggleTimer = function() {
    if (s.timerRunning) {
      App.stopTimer();
    } else {
      App.startTimer();
    }
  };

  App.updateTimerUI = function() {
    var bar = document.getElementById('restTimerBar');
    if (!bar) return;
    var display = bar.querySelector('.timer-display');
    var actionBtn = bar.querySelector('.timer-action-btn');
    var presetBtns = bar.querySelectorAll('.preset-btn');

    if (display) display.textContent = App.formatTimer(s.timerRemaining);

    bar.classList.remove('running', 'warning');
    var btn30s = document.getElementById('timer30sBtn');
    if (s.timerRunning) {
      bar.classList.add('running');
      if (s.timerRemaining <= 10 && s.timerRemaining > 0) {
        bar.classList.add('warning');
      }
      if (actionBtn) actionBtn.textContent = 'Reset';
      if (btn30s) btn30s.style.display = '';
    } else {
      if (actionBtn) actionBtn.textContent = 'Start';
      if (btn30s) btn30s.style.display = 'none';
    }

    presetBtns.forEach(function(btn) {
      var val = parseInt(btn.dataset.seconds);
      btn.classList.toggle('active-preset', !s.timerRunning && val === s.timerDuration);
    });
  };

  // ==================== NAVIGATION ====================

  App.switchView = function(viewName) {
    s.currentView = viewName;

    App.dom.tabBar.querySelectorAll('.tab-btn').forEach(function(btn) {
      btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    document.querySelectorAll('.view').forEach(function(v) {
      v.classList.remove('active');
    });
    var targetView = document.getElementById('view-' + viewName);
    if (targetView) targetView.classList.add('active');

    if (viewName !== 'workout' && s.clockInterval) {
      clearInterval(s.clockInterval);
      s.clockInterval = null;
    }

    if (viewName === 'workout') {
      App.renderWorkoutView();
    } else if (viewName === 'archive') {
      App.renderArchiveView();
    } else if (viewName === 'stats') {
      App.renderStatsView();
    } else if (viewName === 'settings') {
      App.renderSettingsView();
    } else if (viewName === 'nutrition') {
      s.nutritionDate = App.todayStr();
      App.renderNutritionView();
    }
  };

  // ==================== EVENT INIT ====================

  App.initTabBar = function() {
    App.dom.tabBar.querySelectorAll('.tab-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var view = this.dataset.view;
        if (view !== s.currentView) {
          App.haptic();
          App.switchView(view);
        }
      });
    });

    // Confirm modal overlay dismiss
    App.dom.confirmModal.addEventListener('click', function(e) {
      if (e.target === App.dom.confirmModal) App.closeConfirm();
    });
  };

})();
