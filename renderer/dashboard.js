let meta = null;

function renderStats(statsToday) {
  Object.keys(meta).forEach((type) => {
    const row = document.querySelector(`.stat-row[data-type="${type}"]`);
    if (!row) return;
    const s = statsToday[type] || { done: 0, later: 0 };
    const total = s.done + s.later;
    const pct = total > 0 ? Math.round((s.done / total) * 100) : 0;
    row.innerHTML = `
      <div class="stat-label">${meta[type].label.toUpperCase()}</div>
      <div class="stat-bar"><div class="stat-bar-fill" style="width:${pct}%"></div></div>
      <div class="stat-counts">${total > 0 ? `${s.done} done &middot; ${s.later} later` : 'No activity yet today'}</div>
    `;
  });
}

function collectPayload() {
  const payload = { userName: document.getElementById('nameInput').value, reminders: {} };
  Object.keys(meta).forEach((type) => {
    const intervalEl = document.getElementById(`${type}-interval`);
    const timerEl = document.getElementById(`${type}-timer`);
    payload.reminders[type] = {
      intervalMin: intervalEl ? intervalEl.value : undefined,
      timerMin: meta[type].hasTimer && timerEl ? timerEl.value : 0,
    };
  });
  return payload;
}

async function renderAll() {
  const state = await window.dashboardAPI.getState();
  meta = state.meta;

  document.getElementById('nameInput').value = state.userName || '';
  Object.keys(meta).forEach((type) => {
    const cfg = state.reminders[type];
    const intervalEl = document.getElementById(`${type}-interval`);
    if (intervalEl) intervalEl.value = cfg.intervalMin;
    const timerEl = document.getElementById(`${type}-timer`);
    if (timerEl) timerEl.value = cfg.timerMin;
  });

  document.querySelectorAll('[data-icon-for]').forEach((el) => {
    if (!el.childElementCount) window.WellnessIcons.render(el, el.dataset.iconFor);
  });

  const introText = document.getElementById('introText');
  const saveBtn = document.getElementById('saveBtn');
  const statsSection = document.getElementById('statsSection');

  if (state.onboarded) {
    introText.textContent = state.userName
      ? `Adjust your reminders anytime, ${state.userName}.`
      : 'Adjust your reminders anytime.';
    saveBtn.textContent = 'SAVE CHANGES';
    statsSection.hidden = false;
    renderStats(state.statsToday);
  } else {
    introText.textContent = "Let's set a few things up before we start.";
    saveBtn.textContent = 'GET STARTED';
    statsSection.hidden = true;
  }

  window.dashboardAPI.reportSize(document.body.scrollHeight);
}

document.getElementById('saveBtn').addEventListener('click', async () => {
  await window.dashboardAPI.save(collectPayload());
  await renderAll();
});

document.getElementById('closeBtn').addEventListener('click', () => window.dashboardAPI.close());

renderAll();
