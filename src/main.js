const { app, BrowserWindow, dialog, ipcMain, net, protocol, session } = require('electron');
const { randomBytes } = require('crypto');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const { pathToFileURL } = require('url');
const { createDb } = require('./db');
const { createUpdater } = require('./updater');

const ASSET_SCHEME = 'schedule-asset';
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];

protocol.registerSchemesAsPrivileged([
  { scheme: ASSET_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

let db;
let libraryDir;
let mainWindow;
let audioServer;
let audioProxyBase;
let navEnabled = true;

// Arrow keys plus the PageUp/PageDown that most presentation clickers send.
const NAV_KEYS = { ArrowRight: 'next', PageDown: 'next', ArrowLeft: 'prev', PageUp: 'prev' };

function uniqueFilename(dir, filename) {
  const { name, ext } = path.parse(filename);
  let candidate = filename;
  let counter = 1;
  while (fs.existsSync(path.join(dir, candidate))) {
    candidate = `${name}-${counter++}${ext}`;
  }
  return candidate;
}

const POPUP_HOSTS = ['google.com', 'youtube.com', 'canva.com', 'canva.link', 'gstatic.com'];
const YOUTUBE_SIGN_IN_URL = 'https://accounts.google.com/ServiceLogin?service=youtube&continue=' +
  encodeURIComponent('https://www.youtube.com/');

function isTrustedPopup(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' &&
      POPUP_HOSTS.some((h) => parsed.hostname === h || parsed.hostname.endsWith('.' + h));
  } catch (e) {
    return false;
  }
}

function isId(value) {
  return Number.isInteger(value) && value > 0;
}

function registerIpc() {
  ipcMain.on('nav:set-enabled', (_e, enabled) => { navEnabled = enabled === true; });
  ipcMain.handle('youtube:sign-in', () => {
    // Sign-in runs in its own window that shares this session; closing it reloads the frame.
    const signIn = new BrowserWindow({
      parent: mainWindow,
      width: 520,
      height: 760,
      autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    signIn.webContents.setWindowOpenHandler(({ url }) =>
      (isTrustedPopup(url) ? { action: 'allow' } : { action: 'deny' }));
    signIn.on('closed', () => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send('auth-popup-closed');
    });
    signIn.loadURL(YOUTUBE_SIGN_IN_URL);
  });
  ipcMain.handle('audio:get-proxy-base', () => audioProxyBase);
  ipcMain.handle('schedules:list', () => db.listSchedules());
  ipcMain.handle('schedules:create', (_e, name, grade) => db.createSchedule(name, grade));
  ipcMain.handle('schedules:update', (_e, id, name, grade) => {
    if (!isId(id)) throw new Error('Invalid schedule.');
    return db.updateSchedule(id, name, grade);
  });
  ipcMain.handle('schedules:delete', (_e, id) => {
    if (!isId(id)) throw new Error('Invalid schedule.');
    return db.deleteSchedule(id);
  });

  ipcMain.handle('items:get', (_e, scheduleId) => {
    if (!isId(scheduleId)) throw new Error('Invalid schedule.');
    return db.getItems(scheduleId);
  });
  ipcMain.handle('items:save', (_e, scheduleId, items) => {
    if (!isId(scheduleId)) throw new Error('Invalid schedule.');
    return db.saveItems(scheduleId, items);
  });

  ipcMain.handle('images:list', () => db.listImages());
  ipcMain.handle('images:upload', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Visual Assets', extensions: IMAGE_EXTENSIONS }]
    });
    if (result.canceled || result.filePaths.length === 0) return null;

    const source = result.filePaths[0];
    const ext = path.extname(source).slice(1).toLowerCase();
    if (!IMAGE_EXTENSIONS.includes(ext)) throw new Error('Unsupported image type.');

    fs.mkdirSync(libraryDir, { recursive: true });
    const filename = uniqueFilename(libraryDir, path.basename(source));
    fs.copyFileSync(source, path.join(libraryDir, filename));
    return db.addImage(path.parse(path.basename(source)).name, filename);
  });
}

function registerAssetProtocol() {
  protocol.handle(ASSET_SCHEME, (request) => {
    const url = new URL(request.url);
    const filename = path.basename(decodeURIComponent(url.pathname));
    const ext = path.extname(filename).slice(1).toLowerCase();
    const filePath = path.join(libraryDir, filename);
    if (!IMAGE_EXTENSIONS.includes(ext) || !fs.existsSync(filePath)) {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function startAudioProxy() {
  const token = randomBytes(24).toString('hex');
  audioServer = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const [, route, requestToken, fileId] = url.pathname.split('/');
    const resourceKey = url.searchParams.get('resourcekey') || '';
    if (
      route !== 'audio' ||
      requestToken !== token ||
      !/^[a-z0-9_-]+$/i.test(fileId || '') ||
      (resourceKey && !/^[a-z0-9_-]+$/i.test(resourceKey)) ||
      !['GET', 'HEAD'].includes(request.method)
    ) {
      response.writeHead(404);
      response.end();
      return;
    }

    const driveUrl = new URL('https://drive.google.com/uc');
    driveUrl.searchParams.set('export', 'download');
    driveUrl.searchParams.set('id', fileId);
    if (resourceKey) driveUrl.searchParams.set('resourcekey', resourceKey);

    const headers = new Headers();
    if (request.headers.range) headers.set('Range', request.headers.range);
    if (request.headers['if-range']) headers.set('If-Range', request.headers['if-range']);

    const controller = new AbortController();
    response.on('close', () => {
      if (!response.writableEnded) controller.abort();
    });

    try {
      const upstream = await net.fetch(driveUrl, { method: request.method, headers, signal: controller.signal });
      const forwardedHeaders = {};
      for (const name of ['accept-ranges', 'cache-control', 'content-length', 'content-range', 'content-type', 'etag', 'last-modified']) {
        const value = upstream.headers.get(name);
        if (value) forwardedHeaders[name] = value;
      }
      response.writeHead(upstream.status, forwardedHeaders);
      if (request.method === 'HEAD' || !upstream.body) {
        response.end();
        return;
      }

      const body = Readable.fromWeb(upstream.body);
      body.on('error', (error) => {
        if (error.name !== 'AbortError') console.error('Unable to stream Google Drive audio:', error);
        if (!response.headersSent) response.writeHead(502);
        response.destroy();
      });
      body.pipe(response);
    } catch (error) {
      if (error.name !== 'AbortError') console.error('Unable to stream Google Drive audio:', error);
      if (!response.headersSent) {
        response.writeHead(502);
        response.end('Unable to stream audio');
      }
    }
  });

  return new Promise((resolve, reject) => {
    audioServer.once('error', reject);
    audioServer.listen(0, '127.0.0.1', () => {
      const address = audioServer.address();
      audioProxyBase = `http://127.0.0.1:${address.port}/audio/${token}`;
      resolve();
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: '#1a1a24',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.setMenuBarVisibility(false);
  // Allow sign-in popups from presentation providers; they share the session so cookies persist.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!isTrustedPopup(url)) return { action: 'deny' };
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        parent: mainWindow,
        width: 500,
        height: 700,
        autoHideMenuBar: true,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
      }
    };
  });
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (!navEnabled || input.type !== 'keyDown' || input.isAutoRepeat) return;
    if (input.control || input.alt || input.meta || input.shift) return;
    const direction = NAV_KEYS[input.key];
    if (!direction) return;
    event.preventDefault();
    mainWindow.webContents.send('navigate-step', direction);
  });
  mainWindow.webContents.on('did-create-window', (child) => {
    child.on('closed', () => {
      if (!mainWindow.isDestroyed()) mainWindow.webContents.send('auth-popup-closed');
    });
  });
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(async () => {
  const userData = app.getPath('userData');
  libraryDir = path.join(userData, 'library');
  fs.mkdirSync(libraryDir, { recursive: true });
  db = createDb(path.join(userData, 'appdata.db'));

  // Google refuses sign-in from user agents that identify as Electron.
  const chromeUa = session.defaultSession.getUserAgent()
    .replace(/\s?Electron\/\S+/, '')
    .replace(/\s?music-visual-schedule\/\S+/i, '')
    .replace(/\s?MusicVisualSchedule\/\S+/i, '');
  session.defaultSession.setUserAgent(chromeUa);

  session.defaultSession.setPermissionRequestHandler((_wc, _perm, callback) => callback(false));

  // YouTube rejects embeds without a referrer (error 153); the app loads from file://, so supply one.
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['https://www.youtube-nocookie.com/embed/*', 'https://www.youtube.com/embed/*'] },
    (details, callback) => {
      const requestHeaders = { ...details.requestHeaders, Referer: 'https://www.youtube-nocookie.com/' };
      callback({ requestHeaders });
    }
  );

  // Presentation sites (e.g. Canva) often forbid being framed; this is a local classroom display, so allow it.
  session.defaultSession.webRequest.onHeadersReceived({ urls: ['https://*/*', 'http://*/*'] }, (details, callback) => {
    if (details.resourceType !== 'subFrame') return callback({});
    const headers = {};
    for (const [name, values] of Object.entries(details.responseHeaders || {})) {
      const lower = name.toLowerCase();
      if (lower === 'x-frame-options') continue;
      if (lower === 'content-security-policy') {
        const cleaned = values.map((v) => v.split(';').filter((d) => !/^\s*frame-ancestors\b/i.test(d)).join(';'));
        headers[name] = cleaned;
      } else {
        headers[name] = values;
      }
    }
    callback({ responseHeaders: headers });
  });

  const updater = createUpdater(() => mainWindow);
  updater.register();
  registerIpc();
  registerAssetProtocol();
  await startAudioProxy();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  if (audioServer) audioServer.close();
});

app.on('window-all-closed', () => {
  if (db) db.close();
  app.quit();
});
