const { app, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');

const createUpdater = (getWindow) => {
  let status = { state: 'idle', message: '' };

  const publish = (next) => {
    status = next;
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('update:status', status);
  };

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => publish({ state: 'checking', message: 'Checking for updates...' }));
  autoUpdater.on('update-available', (info) =>
    publish({ state: 'downloading', message: `Version ${info.version} found. Downloading...`, percent: 0 }));
  autoUpdater.on('update-not-available', () => publish({ state: 'current', message: 'You have the latest version.' }));
  autoUpdater.on('download-progress', (p) =>
    publish({ state: 'downloading', message: `Downloading update... ${Math.round(p.percent)}%`, percent: p.percent }));
  autoUpdater.on('update-downloaded', (info) =>
    publish({ state: 'ready', message: `Version ${info.version} is ready to install.` }));
  autoUpdater.on('error', () =>
    publish({ state: 'error', message: 'Could not check for updates. Check your internet connection.' }));

  const check = async () => {
    if (!app.isPackaged) {
      publish({ state: 'disabled', message: 'Updates are only available in the installed app.' });
      return status;
    }
    if (status.state === 'checking' || status.state === 'downloading' || status.state === 'ready') return status;
    try {
      await autoUpdater.checkForUpdates();
    } catch {
      publish({ state: 'error', message: 'Could not check for updates. Check your internet connection.' });
    }
    return status;
  };

  const register = () => {
    ipcMain.handle('update:get-version', () => app.getVersion());
    ipcMain.handle('update:get-status', () => status);
    ipcMain.handle('update:check', () => check());
    ipcMain.handle('update:install', () => {
      if (status.state === 'ready') autoUpdater.quitAndInstall();
    });
  };

  return { register, check };
};

module.exports = { createUpdater };
