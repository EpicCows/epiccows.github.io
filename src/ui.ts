import { state, dom } from './state';
import { formatElapsed } from './utils';

// Runtime imports — called only on user interaction
import { renderWorkoutView, renderArchiveView, renderStatsView } from './workout';
import { renderNutritionView } from './nutrition';
import { renderSettingsView } from './settings';

// ==================== TOAST ====================

export function showToast(msg: string, undoFn?: () => void): void {
  const domToast = dom.toast;
  if (!domToast) return;
  if (undoFn) {
    domToast.innerHTML = msg + ' <span class="toast-undo" style="color:#4caf50;cursor:pointer;text-decoration:underline;font-weight:700;">Undo</span>';
    const undoEl = domToast.querySelector('.toast-undo');
    if (undoEl) {
      undoEl.addEventListener('click', function(e) {
        e.stopPropagation();
        undoFn();
        domToast.classList.remove('show');
      });
    }
  } else {
    domToast.textContent = msg;
  }
  domToast.classList.add('show');
  clearTimeout((domToast as any)._timeout);
  (domToast as any)._timeout = setTimeout(function() {
    domToast.classList.remove('show');
  }, undoFn ? 4000 : 2500);
}

// ==================== HAPTIC ====================

export function haptic(): void {
  if (navigator.vibrate) {
    navigator.vibrate(10);
  }
}

// ==================== CONFIRM MODAL ====================

export function showConfirm(
  htmlContent: string,
  actions: { label: string; cls?: string; callback: () => void }[],
): void {
  if (!dom.confirmContent || !dom.confirmActions || !dom.confirmModal) return;
  dom.confirmContent.innerHTML = htmlContent;
  dom.confirmActions.innerHTML = '';
  actions.forEach(function(a) {
    const btn = document.createElement('button');
    btn.textContent = a.label;
    btn.className = a.cls || 'btn-save';
    btn.addEventListener('click', function() {
      closeConfirm();
      if (a.callback) a.callback();
    });
    dom.confirmActions!.appendChild(btn);
  });
  dom.confirmModal.classList.add('open');
}

export function closeConfirm(): void {
  if (dom.confirmModal) dom.confirmModal.classList.remove('open');
}

// ==================== TIMER ====================

export function loadTimerSettings(): void {
  try {
    const saved = localStorage.getItem('tallTenderTimer');
    if (saved) {
      const settings = JSON.parse(saved);
      state.timerDuration = settings.duration || 60;
      state.timerAutoStart = settings.autoStart !== undefined ? settings.autoStart : true;
    }
  } catch (e) { console.warn('loadTimerSettings failed', e); }
}

export function saveTimerSettings(): void {
  try {
    localStorage.setItem('tallTenderTimer', JSON.stringify({
      duration: state.timerDuration,
      autoStart: state.timerAutoStart,
    }));
  } catch (e) { console.warn('saveTimerSettings failed', e); }
}

export function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return m + ':' + (sec < 10 ? '0' : '') + sec;
}

export function updateElapsed(): void {
  const el = document.getElementById('elapsedTime');
  if (!el || !state.appData.currentWorkout) return;
  const elapsed = Date.now() - (state.appData.currentWorkout.startTimestamp || Date.now());
  el.textContent = formatElapsed(elapsed);
}

export function tickTimer(): void {
  if (!state.timerRunning) return;
  state.timerRemaining--;
  updateTimerUI();
  if (state.timerRemaining <= 0) {
    stopTimer();
    if (navigator.vibrate) { navigator.vibrate([200, 100, 200, 100, 400]); }
    showToast('⏰ Rest done - next set!');
  }
}

export function startTimer(duration?: number): void {
  if (duration !== undefined) {
    state.timerDuration = duration;
    state.timerRemaining = duration;
    saveTimerSettings();
  } else {
    state.timerRemaining = state.timerDuration;
  }
  if (state.timerInterval) clearInterval(state.timerInterval);
  state.timerRunning = true;
  state.timerInterval = setInterval(tickTimer, 1000);
  updateTimerUI();
}

export function stopTimer(): void {
  state.timerRunning = false;
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
  state.timerRemaining = state.timerDuration;
  updateTimerUI();
}

export function toggleTimer(): void {
  if (state.timerRunning) {
    stopTimer();
  } else {
    startTimer();
  }
}

export function updateTimerUI(): void {
  const bar = document.getElementById('restTimerBar');
  if (!bar) return;
  const display = bar.querySelector('.timer-display') as HTMLElement | null;
  const actionBtn = bar.querySelector('.timer-action-btn') as HTMLElement | null;
  const presetBtns = bar.querySelectorAll('.preset-btn');

  if (display) display.textContent = formatTimer(state.timerRemaining);

  bar.classList.remove('running', 'warning');
  const btn30s = document.getElementById('timer30sBtn');
  if (state.timerRunning) {
    bar.classList.add('running');
    if (state.timerRemaining <= 10 && state.timerRemaining > 0) {
      bar.classList.add('warning');
    }
    if (actionBtn) actionBtn.textContent = 'Reset';
    if (btn30s) btn30s.style.display = '';
  } else {
    if (actionBtn) actionBtn.textContent = 'Start';
    if (btn30s) btn30s.style.display = 'none';
  }

  presetBtns.forEach(function(btn) {
    const val = parseInt((btn as HTMLElement).dataset.seconds || '0');
    btn.classList.toggle('active-preset', !state.timerRunning && val === state.timerDuration);
  });
}

// ==================== NAVIGATION ====================

export function switchView(viewName: string): void {
  state.currentView = viewName;

  if (dom.tabBar) {
    dom.tabBar.querySelectorAll('.tab-btn').forEach(function(btn) {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.view === viewName);
    });
  }

  document.querySelectorAll('.view').forEach(function(v) {
    v.classList.remove('active');
  });
  const targetView = document.getElementById('view-' + viewName);
  if (targetView) targetView.classList.add('active');

  if (viewName !== 'workout' && state.clockInterval) {
    clearInterval(state.clockInterval);
    state.clockInterval = null;
  }

  if (viewName === 'workout') {
    renderWorkoutView();
  } else if (viewName === 'archive') {
    renderArchiveView();
  } else if (viewName === 'stats') {
    renderStatsView();
  } else if (viewName === 'settings') {
    renderSettingsView();
  } else if (viewName === 'nutrition') {
    state.nutritionDate = new Date().getFullYear() + '-' +
      ('0' + (new Date().getMonth() + 1)).slice(-2) + '-' +
      ('0' + new Date().getDate()).slice(-2);
    renderNutritionView();
  }
}

// ==================== EVENT INIT ====================

export function initTabBar(): void {
  if (!dom.tabBar) return;
  dom.tabBar.querySelectorAll('.tab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      const view = (this as HTMLElement).dataset.view;
      if (view && view !== state.currentView) {
        haptic();
        switchView(view);
      }
    });
  });

  // Confirm modal overlay dismiss
  if (dom.confirmModal) {
    dom.confirmModal.addEventListener('click', function(e) {
      if (e.target === dom.confirmModal) closeConfirm();
    });
  }
}
