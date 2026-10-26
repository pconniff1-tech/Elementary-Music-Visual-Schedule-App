const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('scheduleApi', {
  getAudioProxyBase: () => ipcRenderer.invoke('audio:get-proxy-base'),
  listSchedules: () => ipcRenderer.invoke('schedules:list'),
  createSchedule: (name, grade) => ipcRenderer.invoke('schedules:create', name, grade),
  updateSchedule: (id, name, grade) => ipcRenderer.invoke('schedules:update', id, name, grade),
  deleteSchedule: (id) => ipcRenderer.invoke('schedules:delete', id),
  getItems: (scheduleId) => ipcRenderer.invoke('items:get', scheduleId),
  saveItems: (scheduleId, items) => ipcRenderer.invoke('items:save', scheduleId, items),
  listImages: () => ipcRenderer.invoke('images:list'),
  uploadImage: () => ipcRenderer.invoke('images:upload'),
  onAuthPopupClosed: (callback) => ipcRenderer.on('auth-popup-closed', () => callback()),
  signInToYouTube: () => ipcRenderer.invoke('youtube:sign-in'),
  onNavigate: (callback) => ipcRenderer.on('navigate-step', (_e, direction) => callback(direction)),
  getAppVersion: () => ipcRenderer.invoke('update:get-version'),
  getUpdateStatus: () => ipcRenderer.invoke('update:get-status'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  deferUpdate: () => ipcRenderer.invoke('update:later'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateStatus: (callback) => ipcRenderer.on('update:status', (_e, status) => callback(status)),
  setNavEnabled: (enabled) => ipcRenderer.send('nav:set-enabled', Boolean(enabled))
});
