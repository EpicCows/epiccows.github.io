window.App = window.App || {};

(function() {
  'use strict';

  var App = window.App;

  // ==================== DATE UTILITIES ====================

  App.todayStr = function() {
    var d = new Date();
    return d.getFullYear() + '-' +
      ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
      ('0' + d.getDate()).slice(-2);
  };

  App.formatDate = function(dateStr) {
    var d = new Date(dateStr + 'T12:00:00');
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
    return days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  };

  App.formatTimeNow = function() {
    var now = new Date();
    var h = now.getHours();
    var m = now.getMinutes();
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
  };

  App.formatTimeShort = function(h, m) {
    var ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return h + ':' + (m < 10 ? '0' : '') + m + ' ' + ampm;
  };

  App.getWeekKey = function(dateStr) {
    var d = new Date(dateStr + 'T12:00:00');
    var temp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    var dayNum = temp.getUTCDay() || 7;
    temp.setUTCDate(temp.getUTCDate() + 4 - dayNum);
    var yearStart = new Date(Date.UTC(temp.getUTCFullYear(), 0, 1));
    var weekNo = Math.ceil((((temp - yearStart) / 86400000) + 1) / 7);
    return temp.getUTCFullYear() + '-W' + (weekNo < 10 ? '0' : '') + weekNo;
  };

  // ==================== CALC UTILITIES ====================

  App.calcVolume = function(sets) {
    return sets.reduce(function(sum, s) {
      return sum + ((s.weight || 0) * (s.reps || 0));
    }, 0);
  };

  App.calcAvgRpe = function(sets) {
    var withRpe = sets.filter(function(s) { return s.rpe > 0; });
    if (withRpe.length === 0) return 0;
    var sum = withRpe.reduce(function(s, x) { return s + x.rpe; }, 0);
    return Math.round((sum / withRpe.length) * 10) / 10;
  };

  App.calc1RM = function(weight, reps) {
    if (!weight || !reps || reps <= 0) return 0;
    // Epley formula
    return Math.round(weight * (1 + reps / 30));
  };

  App.formatElapsed = function(ms) {
    var totalSec = Math.floor(ms / 1000);
    var h = Math.floor(totalSec / 3600);
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    if (h > 0) return h + 'h ' + m + 'm';
    if (m > 0) return m + 'm ' + s + 's';
    return s + 's';
  };

  // ==================== MIGRATION ====================

  App.migrateOldKeys = function() {
    var oldKeys = ['tallTenderData', 'tallTenderPrograms', 'tallTenderFoods', 'tallTenderMealTemplates', 'tallTenderRecentMeals', 'tallTenderGoals'];
    oldKeys.forEach(function(oldKey) {
      var oldVal = localStorage.getItem(oldKey);
      if (oldVal !== null) {
        var newKey = oldKey + '_default';
        if (localStorage.getItem(newKey) === null) {
          localStorage.setItem(newKey, oldVal);
        }
        localStorage.removeItem(oldKey);
      }
    });
  };

})();
