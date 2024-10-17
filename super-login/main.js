const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

let mainWindow;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // To allow integration with Electron APIs
    },
  });

  mainWindow.loadFile('index.html');
}

// Ensure output directory exists
function ensureOutputDirectory() {
  const outputDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir); // Create the directory if it doesn't exist
  }
}

// Handle Salesforce CLI query execution
ipcMain.on('run-salesforce-query', (event) => {
  const outputFilePath = path.join(__dirname, 'output', 'salesforce.csv');
  ensureOutputDirectory(); // Ensure the output directory exists before writing

  const queryCommand = `sfdx force:data:soql:query -o 'Altra' --query "SELECT Subscription_ID__c, Assessed_Machines__c, Asset__c, CreatedById, Current_Licence__c, Customer_Name__c, Deployment_Date__c, Name, Deployment_Status__c, Deployment_Type__c, Discovered_Machines__c, Install_Date__c, LastModifiedById, Last_Updated__c, Licence_GUID__c, Managed_App_Location__c, OwnerId, Provisioning_Status__c, Renewal_Date__c, Renewal_Licence__c FROM Deployment__c" -r csv > "${outputFilePath}"`;

  console.log(`Executing command: ${queryCommand}`);

  exec(queryCommand, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      event.reply('query-error', error.message);
      return;
    }
    if (stderr) {
      console.error(`stderr: ${stderr}`);
      event.reply('query-error', stderr);
      return;
    }
    console.log('Salesforce query completed successfully.');
    event.reply('query-success', outputFilePath);
    checkFileExists(outputFilePath, event); // Check file after query completes
  });
});

// Check if the Salesforce CSV file exists
ipcMain.on('check-file-exists', (event) => {
  const outputFilePath = path.join(__dirname, 'output', 'salesforce.csv');
  checkFileExists(outputFilePath, event);
});

// Function to check if the file exists
function checkFileExists(filePath, event) {
  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      event.reply('file-exists-status', false); // File does not exist
    } else {
      event.reply('file-exists-status', true); // File exists
    }
  });
}

// Handle opening of the device login page inside the Electron app
ipcMain.on('open-login-window', (event, loginUrl) => {
  const loginWindow = new BrowserWindow({
    width: 500,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  loginWindow.loadURL(loginUrl);
});

// Handle opening customer URL in external browser
ipcMain.on('open-customer-url', (event, customerUrl) => {
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

// Wait for the app to be ready before creating windows
app.on('ready', createMainWindow);
