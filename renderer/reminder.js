function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// Reading scrollHeight forces a synchronous layout, so this reflects the
// card's true natural height. Main resizes the window to match before
// showing it (and again any time content changes, e.g. the timer revealing
// itself), since fixed pixel heights drift across machines with different
// font metrics/DPI and silently clip the buttons.
// Note: document.documentElement.scrollHeight is special-cased by the
// browser as the viewport scroller and just reports the current window
// height here (not the true content height) since html has
// overflow:hidden — body.scrollHeight measures correctly instead.
function reportSize() {
  window.reminderAPI.reportSize(document.body.scrollHeight);
}

function startCountdown(timerSeconds) {
  const timerEl = document.getElementById('timer');
  const fillEl = document.getElementById('progressFill');
  let remaining = timerSeconds;
  timerEl.textContent = formatTime(remaining);

  const tick = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(tick);
      remaining = 0;
      timerEl.textContent = "TIME'S UP";
    } else {
      timerEl.textContent = formatTime(remaining);
    }
    fillEl.style.width = `${(remaining / timerSeconds) * 100}%`;
  }, 1000);
}

function init() {
  const params = new URLSearchParams(window.location.search);
  const type = params.get('type') || 'water';
  const label = params.get('label') || 'Reminder';
  const message = params.get('message') || '';
  const timerSeconds = parseInt(params.get('timer') || '0', 10);

  document.body.dataset.type = type;
  document.getElementById('title').textContent = label;
  document.getElementById('message').textContent = message;
  window.WellnessIcons.render(document.getElementById('icon'), type);

  const doneBtn = document.getElementById('doneBtn');
  const snoozeBtn = document.getElementById('snoozeBtn');
  const timerWrap = document.getElementById('timerWrap');

  if (timerSeconds > 0) {
    // Phase 1: confirm before the break starts — OKAY / LATER, no timer yet.
    doneBtn.textContent = 'OKAY';
    snoozeBtn.textContent = 'LATER';
    snoozeBtn.onclick = () => window.reminderAPI.respond(type, 'snooze');
    doneBtn.onclick = () => {
      // Phase 2: break is running — DONE / FINISH EARLY, both count as done.
      timerWrap.hidden = false;
      doneBtn.textContent = 'DONE';
      snoozeBtn.textContent = 'FINISH EARLY';
      doneBtn.onclick = () => window.reminderAPI.respond(type, 'done');
      snoozeBtn.onclick = () => window.reminderAPI.respond(type, 'done');
      startCountdown(timerSeconds);
      reportSize();
    };
  } else {
    doneBtn.onclick = () => window.reminderAPI.respond(type, 'done');
    snoozeBtn.onclick = () => window.reminderAPI.respond(type, 'snooze');
  }

  reportSize();
}

init();
