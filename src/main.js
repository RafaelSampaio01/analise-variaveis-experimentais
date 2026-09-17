'use strict';

const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const fssync = require('node:fs');
const { SerialPort } = require('serialport');
const { Collector } = require('./collector');
const { sensors, inputPorts, REQUIRED_FIRMWARE } = require('./protocol');
const { findAvrdude, flashArduinoUno, validateHex } = require('./firmware');
const csv = require('./csv');
const electronUpdater = require('electron-updater');
const { autoUpdater } = electronUpdater;

const collector = new Collector(SerialPort);
let window;
let quitting = false;
const smoke = process.argv.includes('--smoke-test');
let pageZoomFactor = 1;

let appUpdateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  availableVersion: '',
  progress: 0,
  message: ''
};
let updaterConfigured = false;

function emitAppUpdate(patch = {}) {
  appUpdateState = { ...appUpdateState, ...patch, currentVersion: app.getVersion() };
  if (window && !window.isDestroyed()) {
    window.webContents.send('app-update-event', { ...appUpdateState });
  }
  return { ...appUpdateState };
}

function setupOnlineUpdater() {
  if (smoke) return;
  if (!app.isPackaged) {
    emitAppUpdate({ status: 'dev', message: 'Atualização online é verificada apenas no aplicativo empacotado.' });
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('checking-for-update', () => emitAppUpdate({ status: 'checking', progress: 0, message: 'Verificando atualizações…' }));
  autoUpdater.on('update-available', info => emitAppUpdate({ status: 'available', availableVersion: info.version || '', progress: 0, message: `Nova versão ${info.version || ''} disponível.` }));
  autoUpdater.on('update-not-available', info => emitAppUpdate({ status: 'current', availableVersion: '', progress: 0, message: `Sistema atualizado em ${info?.version || app.getVersion()}.` }));
  autoUpdater.on('download-progress', progress => emitAppUpdate({ status: 'downloading', progress: Math.max(0, Math.min(100, Number(progress.percent) || 0)), message: 'Baixando atualização…' }));
  autoUpdater.on('update-downloaded', info => emitAppUpdate({ status: 'downloaded', availableVersion: info.version || appUpdateState.availableVersion, progress: 100, message: 'Atualização pronta para instalar.' }));
  autoUpdater.on('error', error => emitAppUpdate({ status: 'error', progress: 0, message: error?.message || 'Falha ao verificar atualização.' }));

  updaterConfigured = true;
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(error => emitAppUpdate({ status: 'error', message: error.message }));
  }, 6000);
}

async function checkOnlineUpdate() {
  if (!app.isPackaged) return emitAppUpdate({ status: 'dev', message: 'Modo de desenvolvimento: atualização online desativada.' });
  if (!updaterConfigured) setupOnlineUpdater();
  try {
    emitAppUpdate({ status: 'checking', progress: 0, message: 'Verificando atualizações…' });
    await autoUpdater.checkForUpdates();
  } catch (error) {
    emitAppUpdate({ status: 'error', message: error.message });
  }
  return { ...appUpdateState };
}

function clampPageZoom(value) {
  return Math.max(0.6, Math.min(1.8, Math.round(value * 10) / 10));
}

function firmwareDirectories() {
  const dirs = [];

  if (app.isPackaged) {
    if (process.env.PORTABLE_EXECUTABLE_DIR) {
      dirs.push(path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'firmware'));
    }

    dirs.push(path.join(path.dirname(process.execPath), 'firmware'));
    dirs.push(path.join(process.resourcesPath, 'firmware'));
  } else {
    dirs.push(path.join(__dirname, '..', 'firmware'));
  }

  return [...new Set(dirs)];
}

function manualDirectories() {
  const dirs = [];

  if (app.isPackaged) {
    if (process.env.PORTABLE_EXECUTABLE_DIR) {
      dirs.push(path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'manual'));
    }

    dirs.push(path.join(path.dirname(process.execPath), 'manual'));
    dirs.push(path.join(process.resourcesPath, 'manual'));
  } else {
    dirs.push(path.join(__dirname, '..', 'manual'));
  }

  return [...new Set(dirs)];
}

function manualPdfPath() {
  for (const directory of manualDirectories()) {
    try {
      if (!fssync.existsSync(directory)) continue;
      const pdf = fssync.readdirSync(directory)
        .filter(name => /\.pdf$/i.test(name))
        .sort((a, b) => a.localeCompare(b, 'pt-BR'))[0];
      if (pdf) return path.join(directory, pdf);
    } catch {
      // Continua procurando nas demais pastas.
    }
  }
  return null;
}

function bundledFirmwarePath() {
  for (const directory of firmwareDirectories()) {
    try {
      const preferred = path.join(directory, 'firm_keystudio.ino.hex');
      if (fssync.existsSync(preferred)) return preferred;

      if (!fssync.existsSync(directory)) continue;

      const hex = fssync.readdirSync(directory)
        .filter(name => /\.hex$/i.test(name))
        .sort((a, b) => a.localeCompare(b, 'pt-BR'))[0];

      if (hex) return path.join(directory, hex);
    } catch {
      // Continua procurando nas demais pastas.
    }
  }

  return path.join(firmwareDirectories()[0], 'firm_keystudio.ino.hex');
}

function handle(name, fn) {
  ipcMain.handle(name, async (event, ...args) => {
    if (event.sender !== window?.webContents || event.senderFrame !== window.webContents.mainFrame) throw new Error('Origem inválida.');
    return fn(...args);
  });
}

handle('bootstrap', () => ({
  sensors: sensors.map(sensor => ({ ...sensor, inputs: inputPorts(sensor.id) })),
  state: collector.state,
  rows: collector.rows,
  requiredFirmware: REQUIRED_FIRMWARE,
  appVersion: app.getVersion(),
  appUpdate: { ...appUpdateState, currentVersion: app.getVersion() }
}));

handle('ports', () => collector.list());
handle('auto-connect', () => collector.autoConnect());
handle('connect', options => collector.connect(options));
handle('disconnect', () => {
  if (collector.state.busy) throw new Error('Aguarde a operação atual.');
  return collector.close();
});
handle('configure', config => collector.configure(config));
handle('play', () => collector.play());
handle('pause', () => collector.pause());
handle('clear', () => collector.clear());

handle('page-zoom', action => {
  if (!window || window.isDestroyed()) return 1;

  if (action === 'reset') pageZoomFactor = 1;
  else if (action === 'in') pageZoomFactor = clampPageZoom(pageZoomFactor + 0.1);
  else if (action === 'out') pageZoomFactor = clampPageZoom(pageZoomFactor - 0.1);
  else throw new Error('Comando de zoom inválido.');

  window.webContents.setZoomFactor(pageZoomFactor);
  return pageZoomFactor;
});

handle('open-manual', async () => {
  const filePath = manualPdfPath();
  if (!filePath) throw new Error('Nenhum PDF foi encontrado na pasta manual.');

  const error = await shell.openPath(filePath);
  if (error) throw new Error(`Não foi possível abrir o manual: ${error}`);

  return { name: path.basename(filePath), folder: path.dirname(filePath) };
});

handle('app-update-state', () => ({ ...appUpdateState, currentVersion: app.getVersion() }));
handle('app-update-check', () => checkOnlineUpdate());
handle('app-update-download', async () => {
  if (!app.isPackaged) throw new Error('Atualização online não é executada no modo de desenvolvimento.');
  if (appUpdateState.status !== 'available') throw new Error('Nenhuma atualização está pronta para download.');
  emitAppUpdate({ status: 'downloading', progress: 0, message: 'Iniciando download…' });
  await autoUpdater.downloadUpdate();
  return { ...appUpdateState };
});
handle('app-update-install', () => {
  if (appUpdateState.status !== 'downloaded') throw new Error('A atualização ainda não terminou de baixar.');
  setImmediate(() => autoUpdater.quitAndInstall(false, true));
  return true;
});

handle('save-data', async () => {
  const result = await dialog.showSaveDialog(window, {
    defaultPath: 'coleta.csv',
    filters: [{ name: 'CSV', extensions: ['csv'] }, { name: 'Texto', extensions: ['txt'] }]
  });
  if (result.canceled) return null;
  await fs.writeFile(result.filePath, csv.encode(collector.rows), 'utf8');
  return path.basename(result.filePath);
});

handle('open-data', async (analysis = false) => {
  if (!analysis && (collector.state.running || collector.state.busy)) throw new Error('Pause a coleta antes de abrir um arquivo.');

  const result = await dialog.showOpenDialog(window, {
    properties: ['openFile'],
    filters: [{ name: 'Dados do coletor', extensions: ['csv', 'txt'] }]
  });
  if (result.canceled) return null;

  const file = result.filePaths[0];
  if ((await fs.stat(file)).size > 50 * 1024 * 1024) throw new Error('Arquivo excede o limite de 50 MB.');

  const buffer = await fs.readFile(file);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder('windows-1252').decode(buffer);
  }

  const rows = csv.decode(text);
  if (rows.length > 250000) throw new Error('Arquivo excede o limite de 250.000 amostras.');

  if (!analysis) {
    if (collector.state.running || collector.state.busy) throw new Error('Pause a coleta antes de substituir os dados.');
    collector.rows = rows;
  }

  return { name: path.basename(file), rows };
});

handle('firmware-tool-info', async () => {
  const tool = await findAvrdude();
  return tool ? { available: true, source: tool.source, executable: tool.executable } : { available: false };
});

handle('bundled-firmware-info', async () => {
  const filePath = bundledFirmwarePath();
  const exists = fssync.existsSync(filePath);
  if (!exists) return { available: false, name: 'firm_keystudio.ino.hex' };
  await validateHex(filePath);
  const stat = await fs.stat(filePath);
  return { available: true, name: path.basename(filePath), size: stat.size, folder: path.dirname(filePath) };
});

handle('flash-bundled-firmware', async options => {
  if (!options || typeof options.port !== 'string' || !options.port) throw new Error('Porta inválida para atualização.');

  if (collector.state.running) await collector.pause();
  if (collector.state.connected) await collector.close({ silent: true });

  const hexPath = bundledFirmwarePath();
  const lines = [];
  const result = await flashArduinoUno({
    port: options.port,
    hexPath,
    onOutput: line => {
      lines.push(line);
      if (lines.length > 120) lines.shift();
      if (window && !window.isDestroyed()) window.webContents.send('firmware-event', { type: 'log', value: line });
    }
  });

  return { ...result, log: lines };
});

// Mantém seleção manual como fallback técnico, embora a interface normal use o firmware embutido.
handle('select-firmware', async () => {
  const result = await dialog.showOpenDialog(window, {
    properties: ['openFile'],
    filters: [{ name: 'Firmware Arduino', extensions: ['hex'] }]
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

handle('flash-firmware', async options => {
  if (!options || typeof options.port !== 'string' || typeof options.hexPath !== 'string') throw new Error('Parâmetros de atualização inválidos.');
  if (collector.state.running) await collector.pause();
  if (collector.state.connected) await collector.close({ silent: true });

  const lines = [];
  const result = await flashArduinoUno({
    port: options.port,
    hexPath: options.hexPath,
    onOutput: line => {
      lines.push(line);
      if (lines.length > 120) lines.shift();
      if (window && !window.isDestroyed()) window.webContents.send('firmware-event', { type: 'log', value: line });
    }
  });
  return { ...result, log: lines };
});

handle('save-image', async data => {
  if (typeof data !== 'string' || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data) || data.length > 30 * 1024 * 1024) throw new Error('Imagem inválida.');
  const result = await dialog.showSaveDialog(window, {
    defaultPath: 'grafico.png',
    filters: [{ name: 'PNG', extensions: ['png'] }]
  });
  if (result.canceled) return null;
  await fs.writeFile(result.filePath, Buffer.from(data.split(',')[1], 'base64'));
  return path.basename(result.filePath);
});

// Em altas taxas de aquisição, agrupa amostras por ~16 ms para reduzir
// o custo de IPC sem descartar nenhuma leitura. O Collector continua
// armazenando cada amostra individualmente.
let pendingSamples = [];
let sampleFlushTimer = null;

function flushSampleBatch() {
  sampleFlushTimer = null;
  if (!pendingSamples.length) return;
  const batch = pendingSamples;
  pendingSamples = [];
  if (window && !window.isDestroyed()) {
    window.webContents.send('collector-event', { type: 'samples', value: batch });
  }
}

collector.on('sample', value => {
  pendingSamples.push(value);
  if (!sampleFlushTimer) sampleFlushTimer = setTimeout(flushSampleBatch, 16);
});

for (const event of ['state', 'progress', 'notice', 'reset']) {
  collector.on(event, value => {
    if (event === 'reset') {
      pendingSamples = [];
      if (sampleFlushTimer) {
        clearTimeout(sampleFlushTimer);
        sampleFlushTimer = null;
      }
    }
    if (window && !window.isDestroyed()) window.webContents.send('collector-event', { type: event, value });
  });
}

async function createWindow() {
  let smokeDirectory;
  if (smoke) {
    smokeDirectory = await fs.mkdtemp(path.join(app.getPath('temp'), 'coletor-test-'));
    dialog.showSaveDialog = async (_window, options) => ({ canceled: false, filePath: path.join(smokeDirectory, options.defaultPath) });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path.join(smokeDirectory, 'coleta.csv')] });
  }

  window = new BrowserWindow({
    width: 1380,
    height: 920,
    minWidth: 960,
    minHeight: 700,
    show: false,
    backgroundColor: '#090d14',
    title: 'Análise de Variáveis Experimentais',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  if (!smoke) {
    window.once('ready-to-show', () => {
      if (!window || window.isDestroyed()) return;
      window.maximize();
      window.show();
    });
  }

  Menu.setApplicationMenu(null);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  await window.loadFile(path.join(__dirname, 'renderer/index.html'));
  pageZoomFactor = 1;
  window.webContents.setZoomFactor(pageZoomFactor);
  setupOnlineUpdater();

  if (smoke) {
    try {
      const result = await window.webContents.executeJavaScript(`(async () => {
        const api = window.collector;
        const boot = await api.bootstrap();
        if (boot.sensors.length !== 15) throw Error('Catálogo inválido');
        await api.connect({path:'DEMO'});
        await api.configure({sensor:5,input:'A0',comparison:2,reference:3,actuator:0,output:'D5',level:0});
        await api.play();
        await new Promise(r=>setTimeout(r,1200));
        await api.pause();
        const snapshot = await api.bootstrap();
        if (snapshot.rows.length < 2 || snapshot.state.running) throw Error('Coleta inválida');
        if (!document.querySelector('#latest').textContent.includes('V')) throw Error('Interface sem leitura');
        document.querySelector('#fullscreen-graph')?.click();
        return {samples:snapshot.rows.length, title:document.title};
      })()`);
      console.log('SMOKE OK', JSON.stringify(result));
      app.exit(0);
    } catch (error) {
      console.error(error);
      app.exit(1);
    }
  }
}

app.whenReady().then(createWindow).catch(error => {
  console.error(error);
  app.exit(1);
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', event => {
  if (quitting) return;
  event.preventDefault();
  quitting = true;
  const fallback = setTimeout(() => app.exit(0), 3000);
  collector.close({ silent: true }).finally(() => {
    clearTimeout(fallback);
    app.quit();
  });
});
