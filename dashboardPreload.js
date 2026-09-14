const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dashboardAPI', {
  getState: () => ipcRenderer.invoke('dashboard-get-state'),
  save: (payload) => ipcRenderer.invoke('dashboard-save', payload),
  close: () => ipcRenderer.send('dashboard-close'),
  reportSize: (height) => ipcRenderer.send('dashboard-size', height),
});
