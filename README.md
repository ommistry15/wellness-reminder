# Wellness Reminder

A tiny Windows tray app that nags you — nicely — to drink water, look away from your screen, and get up and walk. It runs quietly in the background, starts automatically when Windows starts, and pops up small pixel-art reminder cards when it's time.

> **Note:** This project is 100% [vibe coded](https://en.wikipedia.org/wiki/Vibe_coding) — built entirely through conversation with [Claude Code](https://claude.com/claude-code), Anthropic's AI coding assistant. No hand-written code.

## What it does

- 💧 **Drink Water** — a reminder every 45 minutes (configurable)
- 👁 **Look Away** — every 30 minutes, a 5-minute break to rest your eyes (configurable)
- 🚶 **Get Up & Walk** — every 90 minutes, a 10-minute walk break (configurable)

Each reminder is a small, frameless popup in the bottom-right corner, styled with a warm cream palette and hand-drawn pixel-art icons — no external design assets, everything is drawn in CSS/JS.

For the timed reminders (Look Away, Get Up & Walk), the popup first asks **OKAY** or **LATER** — the countdown only starts once you confirm. While it's running you get **DONE** or **FINISH EARLY**. Drink Water is a plain nudge with just **DONE** / **LATER**.

The first time you run the app, a small setup window asks what to call you and lets you adjust each reminder's interval and timer length. You can reopen it anytime from the tray icon to tweak settings or see how many reminders you've completed today (done vs. later), shown as the same pixel progress bars used for the countdown timers.

## Install (just want to use it)

1. Go to the [Releases page](../../releases) of this repository.
2. Download the latest `WellnessReminder-Setup-x.x.x.exe`.
3. Run it. No admin rights needed — it installs to your user folder and adds Start Menu / Desktop shortcuts.
4. On first launch, a setup window appears — enter your name, adjust the timings if you like, and hit **Get Started**.

That's it — it now runs in the background and starts automatically every time you log in to Windows. Look for the small orange droplet icon in your system tray (bottom-right, may be under the `^` overflow arrow) — click it for Pause/Resume, a manual test of each reminder, the Dashboard, and Quit.

## Development

Requires [Node.js](https://nodejs.org/).

```bash
git clone https://github.com/ommistry15/wellness-reminder.git
cd wellness-reminder
npm install
npm start
```

### Useful scripts

| Command | What it does |
|---|---|
| `npm start` | Run the app in dev mode |
| `npm run generate-icon` | Regenerate the tray icon and app icon (pure pixel-art, no image tools needed) |
| `npm run dist` | Build a Windows installer into `release/` (electron-builder, NSIS) |

### Project structure

```
main.js                 Electron main process — tray, scheduling, windows, settings/stats storage
preload.js               IPC bridge for reminder popups
dashboardPreload.js       IPC bridge for the settings/stats dashboard
renderer/
  reminder.html/.css/.js   The popup UI
  dashboard.html/.css/.js  The setup/settings/stats window
  icons.js                 Shared pixel-art icon renderer
assets/tray-icon.png       System tray icon
build/icon.png              App/installer icon
scripts/generate-icon.js    Generates the icons above (pngjs, no external tools)
scripts/dev-server.js       Tiny static server, just for previewing renderer/ styling in a browser
```

Settings and daily done/later stats are stored as plain JSON in `%APPDATA%\wellness-reminder\store.json` — nothing is sent anywhere.

## Tech

Electron, vanilla HTML/CSS/JS (no frontend framework), Node's built-in `fs` for storage, [pngjs](https://github.com/lukeapage/pngjs) only for generating icon assets, [electron-builder](https://www.electron.build/) for packaging.

## License

[MIT](LICENSE)
