'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('collector', {
  bootstrap: () => ipcRenderer.invoke('bootstrap'),
  ports: () => ipcRenderer.invoke('ports'),
  autoConnect: () => ipcRenderer.invoke('auto-connect'),
  connect: options => ipcRenderer.invoke('connect', options),
  disconnect: () => ipcRenderer.invoke('disconnect'),
  configure: config => ipcRenderer.invoke('configure', config),
  play: () => ipcRenderer.invoke('play'),
  pause: () => ipcRenderer.invoke('pause'),
  clear: () => ipcRenderer.invoke('clear'),
  pageZoom: action => ipcRenderer.invoke('page-zoom', action),
  openManual: () => ipcRenderer.invoke('open-manual'),
  appUpdateState: () => ipcRenderer.invoke('app-update-state'),
  checkAppUpdate: () => ipcRenderer.invoke('app-update-check'),
  downloadAppUpdate: () => ipcRenderer.invoke('app-update-download'),
  installAppUpdate: () => ipcRenderer.invoke('app-update-install'),
  saveData: () => ipcRenderer.invoke('save-data'),
  openData: analysis => ipcRenderer.invoke('open-data', analysis),
  saveImage: data => ipcRenderer.invoke('save-image', data),
  firmwareToolInfo: () => ipcRenderer.invoke('firmware-tool-info'),
  bundledFirmwareInfo: () => ipcRenderer.invoke('bundled-firmware-info'),
  flashBundledFirmware: options => ipcRenderer.invoke('flash-bundled-firmware', options),
  selectFirmware: () => ipcRenderer.invoke('select-firmware'),
  flashFirmware: options => ipcRenderer.invoke('flash-firmware', options),
  subscribe: callback => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('collector-event', listener);
    return () => ipcRenderer.removeListener('collector-event', listener);
  },
  subscribeFirmware: callback => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('firmware-event', listener);
    return () => ipcRenderer.removeListener('firmware-event', listener);
  },
  subscribeAppUpdate: callback => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('app-update-event', listener);
    return () => ipcRenderer.removeListener('app-update-event', listener);
  }
});
