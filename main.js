/**
 * Watch Party - Main Process (Person A: Media/UI)
 * Manages Electron application lifecycle, native windows, and secure IPC.
 */

const { app, BrowserWindow, ipcMain, dialog, clipboard, session } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 820,
        minWidth: 960,
        minHeight: 600,
        backgroundColor: '#0b0f19',
        title: 'Watch Party',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        },
        autoHideMenuBar: true
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    mainWindow.webContents.on('did-finish-load', () => {
        console.log('[Main] Renderer window loaded successfully');
    });

    mainWindow.webContents.on('console-message', (event, level, message) => {
        console.log(`[Renderer] ${message}`);
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// App lifecycle
app.whenReady().then(() => {
    // Grant media permissions for webcam when requested inside the app
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === 'media') {
            callback(true);
            return;
        }
        callback(false);
    });

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Native File Picker IPC
ipcMain.handle('dialog:open-video', async () => {
    if (!mainWindow) return { canceled: true };

    const result = await dialog.showOpenDialog(mainWindow, {
        title: 'Select Movie File',
        properties: ['openFile'],
        filters: [
            { name: 'Video Files', extensions: ['mp4', 'webm', 'mkv', 'mov', 'ogg'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (result.canceled || !result.filePaths.length) {
        return { canceled: true };
    }

    const filePath = result.filePaths[0];
    const fileName = path.basename(filePath);
    let fileSize = null;
    let fileBuffer = null;
    try {
        const stats = fs.statSync(filePath);
        fileSize = stats.size;
        // For local files, read file buffer into memory or Uint8Array so renderer creates a pure Blob URL
        fileBuffer = fs.readFileSync(filePath);
    } catch (err) {
        console.error('[Main] Error reading video file:', err);
    }

    return {
        canceled: false,
        fileName,
        fileSize,
        fileBuffer // Node Buffer sent across IPC as Uint8Array
    };
});

// Clipboard IPC helpers
ipcMain.handle('clipboard:copy', (_, text) => {
    if (typeof text === 'string') {
        clipboard.writeText(text);
        return true;
    }
    return false;
});

ipcMain.handle('clipboard:read', () => {
    return clipboard.readText();
});
