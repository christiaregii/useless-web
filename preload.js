/**
 * Watch Party - Preload Script (Person A: Media/UI)
 * Safely exposes system bridges to renderer process.
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    openVideoFile: () => ipcRenderer.invoke('dialog:open-video'),
    copyToClipboard: (text) => ipcRenderer.invoke('clipboard:copy', text),
    readFromClipboard: () => ipcRenderer.invoke('clipboard:read')
});
