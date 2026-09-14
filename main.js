const { app, BrowserWindow, Tray, Menu, ipcMain, screen, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

// Keep the app out of the dock/taskbar — it only ever shows small popups.
app.dock && app.dock.hide();

// --- Windows "run at login" registration. ---
// Once packaged (electron-builder), process.execPath *is* the installed
// app with no extra args needed, so Electron's own API handles it cleanly.
// In dev mode, process.execPath is node_modules/electron/dist/electron.exe,
// which needs this project's path as an argument to know what to run — the
// auto-launch npm package's Windows backend silently drops that argument,
// so a Startup-folder shortcut is created directly instead.
const STARTUP_DIR = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
const SHORTCUT_PATH = path.join(STARTUP_DIR, 'WellnessReminder.lnk');

function isAutoLaunchEnabled() {
  if (app.isPackaged) return app.getLoginItemSettings().openAtLogin;
  return fs.existsSync(SHORTCUT_PATH);
}

function psQuote(str) {
  return `'${String(str).replace(/'/g, "''")}'`;
}

function enableAutoLaunch() {
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: true });
    return;
  }

  const script = [
    '$ProgressPreference = "SilentlyContinue"',
    '$s = New-Object -ComObject WScript.Shell',
    `$sc = $s.CreateShortcut(${psQuote(SHORTCUT_PATH)})`,
    `$sc.TargetPath = ${psQuote(process.execPath)}`,
    `$sc.Arguments = ${psQuote(`"${app.getAppPath()}"`)}`,
    `$sc.WorkingDirectory = ${psQuote(app.getAppPath())}`,
    '$sc.Save()',
  ].join('\n');

  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded]);
}

function disableAutoLaunch() {
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: false });
    return;
  }
  if (fs.existsSync(SHORTCUT_PATH)) fs.unlinkSync(SHORTCUT_PATH);
}

const MINUTE = 60 * 1000;

const REMINDERS = {
  water: {
    label: 'Drink Water',
    hasTimer: false,
    defaultIntervalMin: 45,
    defaultTimerMin: 0,
    messages: [
      'Time for a glass of water.',
      '{name}, hydration check — grab some water.',
      'Your body could use some water right now, {name}.',
    ],
  },
  eyes: {
    label: 'Look Away',
    hasTimer: true,
    defaultIntervalMin: 30,
    defaultTimerMin: 5,
    messages: [
      'Look at something 20+ feet away and let your eyes (and mind) rest.',
      '{name}, give your eyes a break from the screen.',
      'Screen break time, {name}. Rest those eyes for a bit.',
    ],
  },
  walk: {
    label: 'Get Up & Walk',
    hasTimer: true,
    defaultIntervalMin: 90,
    defaultTimerMin: 10,
    messages: [
      'Stand up, stretch, and walk for a bit.',
      '{name}, time to get up and move around.',
      'Your legs miss you, {name}. Take a short walk.',
    ],
  },
};

const SNOOZE_MS = 10 * MINUTE;

// --- Persistent settings + daily done/later counts. ---
const STORE_PATH = path.join(app.getPath('userData'), 'store.json');

function defaultReminderSettings() {
  const reminders = {};
  Object.keys(REMINDERS).forEach((type) => {
    reminders[type] = {
      intervalMin: REMINDERS[type].defaultIntervalMin,
      timerMin: REMINDERS[type].defaultTimerMin,
    };
  });
  return reminders;
}

function defaultStore() {
  return { onboarded: false, userName: '', reminders: defaultReminderSettings(), stats: {} };
}

let store = defaultStore();

function loadStore() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
    const defaults = defaultStore();
    const reminders = {};
    Object.keys(REMINDERS).forEach((type) => {
      reminders[type] = { ...defaults.reminders[type], ...((parsed.reminders || {})[type] || {}) };
    });
    store = { ...defaults, ...parsed, reminders, stats: parsed.stats || {} };
  } catch (e) {
    store = defaultStore();
  }
}

function saveStore() {
  try {
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2));
  } catch (e) {
    console.error('saveStore failed', e);
  }
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function bumpStat(type, kind) {
  const key = todayKey();
  if (!store.stats[key]) store.stats[key] = {};
  if (!store.stats[key][type]) store.stats[key][type] = { done: 0, later: 0 };
  store.stats[key][type][kind] += 1;

  // Keep the stats file from growing forever — 60 days of daily counts is plenty.
  const keys = Object.keys(store.stats).sort();
  while (keys.length > 60) {
    delete store.stats[keys.shift()];
  }

  saveStore();
}

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function pickMessage(type, name) {
  const trimmedName = (name || '').trim();
  const templates = REMINDERS[type].messages.filter((t) => trimmedName || !t.includes('{name}'));
  const chosen = templates[Math.floor(Math.random() * templates.length)];
  return chosen.replace('{name}', trimmedName);
}

let tray = null;
let paused = false;
const timers = {}; // type -> Timeout/Interval handle
const openWindows = {}; // type -> BrowserWindow
let dashboardWindow = null;

function showReminder(type) {
  if (openWindows[type] && !openWindows[type].isDestroyed()) {
    openWindows[type].focus();
    return;
  }

  const cfg = REMINDERS[type];
  const settings = store.reminders[type];
  const width = 340;
  const stackIndex = Object.keys(openWindows).length;
  const display = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = display.workAreaSize;

  const win = new BrowserWindow({
    width,
    height: 40, // placeholder — resized to fit once the renderer reports its real height
    x: sw - width - 24,
    y: sh - 40 - 24,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  openWindows[type] = win;

  const timerSeconds = cfg.hasTimer ? settings.timerMin * 60 : 0;
  const query = new URLSearchParams({
    type,
    label: cfg.label,
    message: pickMessage(type, store.userName),
    timer: String(timerSeconds),
  }).toString();

  win.loadFile(path.join(__dirname, 'renderer', 'reminder.html'), { search: query });

  const onSize = (event, contentHeight) => {
    if (win.isDestroyed() || BrowserWindow.fromWebContents(event.sender) !== win) return;
    const height = Math.min(500, Math.max(120, Math.ceil(contentHeight) + 4));
    win.setBounds({
      x: sw - width - 24,
      y: sh - height - 24 - stackIndex * 260,
      width,
      height,
    });
    win.show();
    if (process.env.WELLNESS_DEBUG_OKAY_SHOT && !win.__debugOkayShotFired) {
      win.__debugOkayShotFired = true;
      setTimeout(() => {
        win.webContents.executeJavaScript(`document.getElementById('doneBtn').click();`).then(() => {
          setTimeout(() => {
            win.webContents.capturePage().then((img) => {
              fs.writeFileSync(process.env.WELLNESS_DEBUG_OKAY_SHOT, img.toPNG());
              if (process.env.WELLNESS_DEBUG_QUIT) app.quit();
            });
          }, 400);
        });
      }, 300);
      return;
    }
    if (process.env.WELLNESS_DEBUG_FULL_DONE && !win.__debugFullDoneFired) {
      win.__debugFullDoneFired = true;
      setTimeout(() => {
        win.webContents.executeJavaScript(`document.getElementById('doneBtn').click();`).then(() => {
          setTimeout(() => {
            win.webContents.executeJavaScript(`document.getElementById('doneBtn').click();`).then(() => {
              setTimeout(() => app.quit(), 300);
            });
          }, 400);
        });
      }, 300);
      return;
    }
    if (process.env.WELLNESS_DEBUG_CLICK) {
      const btnId = process.env.WELLNESS_DEBUG_CLICK === 'later' ? 'snoozeBtn' : 'doneBtn';
      setTimeout(() => {
        win.webContents
          .executeJavaScript(`document.getElementById('${btnId}').click();`)
          .then(() => setTimeout(() => app.quit(), 400));
      }, 300);
      return;
    }
    if (process.env.WELLNESS_DEBUG_SHOT) {
      setTimeout(() => {
        win.webContents.capturePage().then((img) => {
          fs.writeFileSync(process.env.WELLNESS_DEBUG_SHOT, img.toPNG());
          if (process.env.WELLNESS_DEBUG_QUIT) app.quit();
        });
      }, 300);
    }
  };
  ipcMain.on('reminder-size', onSize);

  win.on('closed', () => {
    ipcMain.removeListener('reminder-size', onSize);
    if (openWindows[type] === win) delete openWindows[type];
  });
}

function scheduleReminder(type) {
  clearTimeout(timers[type]);
  clearInterval(timers[type]);
  if (paused) return;
  const intervalMs = store.reminders[type].intervalMin * MINUTE;
  timers[type] = setInterval(() => showReminder(type), intervalMs);
}

function scheduleAll() {
  Object.keys(REMINDERS).forEach(scheduleReminder);
}

function pauseAll() {
  paused = true;
  Object.values(timers).forEach((t) => {
    clearTimeout(t);
    clearInterval(t);
  });
}

function resumeAll() {
  paused = false;
  scheduleAll();
}

ipcMain.on('reminder-action', (event, { type, action }) => {
  const win = openWindows[type];
  if (win && !win.isDestroyed()) win.close();

  bumpStat(type, action === 'snooze' ? 'later' : 'done');

  if (action === 'snooze') {
    clearTimeout(timers[type]);
    clearInterval(timers[type]);
    timers[type] = setTimeout(() => {
      showReminder(type);
      scheduleReminder(type);
    }, SNOOZE_MS);
  }
  // 'done' just closes the popup; the regular interval keeps running.
});

// --- Dashboard window: first-run setup + settings + today's progress. ---

function openDashboard() {
  if (dashboardWindow && !dashboardWindow.isDestroyed()) {
    dashboardWindow.focus();
    return;
  }

  const width = 380;
  const display = screen.getPrimaryDisplay();
  const { width: sw, height: sh } = display.workAreaSize;

  const win = new BrowserWindow({
    width,
    height: 40, // placeholder — resized to fit once the renderer reports its real height
    x: Math.round((sw - width) / 2),
    y: Math.round(sh * 0.1),
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#00000000',
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, 'dashboardPreload.js'),
      contextIsolation: true,
    },
  });

  dashboardWindow = win;
  win.loadFile(path.join(__dirname, 'renderer', 'dashboard.html'));

  const onSize = (event, contentHeight) => {
    if (win.isDestroyed() || BrowserWindow.fromWebContents(event.sender) !== win) return;
    const maxHeight = Math.round(sh * 0.85);
    const height = Math.min(maxHeight, Math.max(200, Math.ceil(contentHeight) + 4));
    win.setBounds({
      x: Math.round((sw - width) / 2),
      y: Math.round((sh - height) / 2),
      width,
      height,
    });
    win.show();
    if (process.env.WELLNESS_DEBUG_AUTOSAVE) {
      setTimeout(() => {
        win.webContents
          .executeJavaScript(`
            document.getElementById('nameInput').value = 'Om';
            document.getElementById('water-interval').value = 20;
            document.getElementById('eyes-timer').value = 3;
            document.getElementById('saveBtn').click();
          `)
          .then(() => setTimeout(() => app.quit(), 500));
      }, 300);
      return;
    }
    if (process.env.WELLNESS_DEBUG_DASHBOARD) {
      setTimeout(() => {
        win.webContents.capturePage().then((img) => {
          fs.writeFileSync(process.env.WELLNESS_DEBUG_DASHBOARD, img.toPNG());
          if (process.env.WELLNESS_DEBUG_QUIT) app.quit();
        });
      }, 300);
    }
  };
  ipcMain.on('dashboard-size', onSize);

  win.on('closed', () => {
    ipcMain.removeListener('dashboard-size', onSize);
    if (dashboardWindow === win) dashboardWindow = null;
  });
}

ipcMain.handle('dashboard-get-state', () => {
  const meta = {};
  Object.keys(REMINDERS).forEach((type) => {
    meta[type] = { label: REMINDERS[type].label, hasTimer: REMINDERS[type].hasTimer };
  });
  return {
    userName: store.userName,
    reminders: store.reminders,
    meta,
    onboarded: store.onboarded,
    statsToday: store.stats[todayKey()] || {},
  };
});

ipcMain.handle('dashboard-save', (event, payload) => {
  store.userName = String((payload && payload.userName) || '').slice(0, 40).trim();
  Object.keys(REMINDERS).forEach((type) => {
    const cfg = (payload && payload.reminders && payload.reminders[type]) || {};
    store.reminders[type].intervalMin = clamp(cfg.intervalMin, 5, 480);
    if (REMINDERS[type].hasTimer) {
      store.reminders[type].timerMin = clamp(cfg.timerMin, 1, 60);
    }
  });
  store.onboarded = true;
  saveStore();
  scheduleAll();
  return { ok: true };
});

ipcMain.on('dashboard-close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.close();
});

function buildTrayMenu() {
  const template = [
    { label: 'Wellness Reminder', enabled: false },
    { type: 'separator' },
    { label: 'Dashboard', click: () => openDashboard() },
    {
      label: paused ? 'Resume Reminders' : 'Pause Reminders',
      click: () => {
        if (paused) resumeAll();
        else pauseAll();
        tray.setContextMenu(buildTrayMenu());
      },
    },
    { type: 'separator' },
    {
      label: 'Test Reminder',
      submenu: Object.keys(REMINDERS).map((type) => ({
        label: REMINDERS[type].label,
        click: () => showReminder(type),
      })),
    },
    { type: 'separator' },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      checked: trayStartupChecked,
      click: (menuItem) => {
        try {
          if (menuItem.checked) enableAutoLaunch();
          else disableAutoLaunch();
          trayStartupChecked = menuItem.checked;
        } catch (e) {
          console.error('auto-launch toggle failed', e);
          menuItem.checked = !menuItem.checked;
        }
      },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ];
  return Menu.buildFromTemplate(template);
}

let trayStartupChecked = true;

app.whenReady().then(() => {
  loadStore();

  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray-icon.png'));
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
  tray.setToolTip('Wellness Reminder');

  try {
    trayStartupChecked = isAutoLaunchEnabled();
    if (!trayStartupChecked) {
      enableAutoLaunch();
      trayStartupChecked = true;
    }
  } catch (e) {
    console.error('auto-launch setup failed', e);
    trayStartupChecked = false;
  }

  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => tray.popUpContextMenu());

  if (store.onboarded) {
    scheduleAll();
  } else {
    openDashboard();
  }

  if (process.env.WELLNESS_DEBUG_TYPE) {
    showReminder(process.env.WELLNESS_DEBUG_TYPE);
  }
  if (process.env.WELLNESS_DEBUG_DASHBOARD || process.env.WELLNESS_DEBUG_AUTOSAVE) {
    openDashboard();
  }
});

app.on('window-all-closed', (e) => {
  // Stay alive in the tray even with no popups open.
  e.preventDefault?.();
});
