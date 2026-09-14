const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('reminderAPI', {
  respond: (type, action) => ipcRenderer.send('reminder-action', { type, action }),
  reportSize: (height) => ipcRenderer.send('reminder-size', height),
});
