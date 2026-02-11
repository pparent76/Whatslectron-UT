const { app, BrowserWindow, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

// Active explicitement les événements tactiles
app.commandLine.appendSwitch('touch-events', 'enabled');
app.commandLine.appendSwitch('enable-touch-events');

function createWindow() {
  const win = new BrowserWindow({
    autoHideMenuBar: true,
    width: 1000,
    height: 600,
    minWidth: 400,
    minHeight: 400,   
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    }
  });
  
  win.once('ready-to-show', () => {
  win.maximize();
  setTimeout(() => {
    win.maximize();
  }, "5000");
  });
  
  win.webContents.setUserAgent(USER_AGENT);
  win.loadURL('https://web.whatsapp.com');
  
  try {

      const userScriptPath = path.join(__dirname, 'ubuntutheme.js');
      const jsCode = fs.readFileSync(userScriptPath, 'utf8');

      const params = {
          gridUnitPx: app.commandLine.getSwitchValue('grid-unit-px'),
          forceScale: app.commandLine.getSwitchValue('force-device-scale-factor'),
      };
 
      injectableCode = `
      window.__cmdParams = ${JSON.stringify(params)};

      ${jsCode}
      `;

      // Injecter le script utilisateur
      win.webContents.executeJavaScript(injectableCode)
        .then(() => console.log('[main] ubuntutheme.js injected'))
        .catch(err => console.error('[main] failed to inject ubuntutheme.js', err));

    } catch (err) {
      console.error('[main] could not load ubuntutheme.js', err);
    }
    
    
    win.on('blur', () => {
        win.webContents.setAudioMuted(true);
        console.log('Audio coupé');
    });
    
    win.on('minimize', () => {
        win.webContents.setAudioMuted(true);
        console.log('Audio coupé');
    });    

    win.on('focus', () => {
        win.webContents.setAudioMuted(false);
        console.log('Audio activé');
    });

    const downloadPath = '/home/phablet/.cache/whatslectron.pparent/downloads/';
    session.defaultSession.setDownloadPath(downloadPath);
    console.log("!!!!!!!!!!!!!!!!!!!!! Satrted new !!!!!!!!!!!!!!!!!!!!!");
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
}); 


