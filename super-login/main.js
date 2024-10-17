const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');

let mainWindow;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      // Comment out the preload script since it's missing
      // preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true,
      contextIsolation: false, // To allow integration with Electron APIs
    },
  });

  mainWindow.loadFile('index.html');
}

// Wait for the app to be ready before creating windows
app.on('ready', createMainWindow);

// Handle opening of the device login page inside the Electron app
ipcMain.on('open-login-window', (event, loginUrl) => {
  const loginWindow = new BrowserWindow({
    width: 500,
    height: 600,
    webPreferences: {
      nodeIntegration: false, // We don't need node integration in this window
      contextIsolation: true, // Isolate contexts for better security
    },
  });

  // Load the Azure device login URL inside the Electron window
  loginWindow.loadURL(loginUrl);
});

// Handle opening customer URL in external browser
ipcMain.on('open-customer-url', (event, customerUrl) => {
  // Use Electron shell to open the URL in the external browser
  shell.openExternal(customerUrl);
});

// Quit the application when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Re-create a window in the app when the dock icon is clicked (macOS)
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});
