const { app, BrowserWindow, session, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { URL } = require('url');
const { shell } = require('electron');

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
  
  win.webContents.on('dom-ready', () => {
  try {

      const userScriptPath = path.join(__dirname, 'ubuntutheme.js');
      const jsCode = fs.readFileSync(userScriptPath, 'utf8');

      const params = {
          keyboardHeight: app.commandLine.getSwitchValue('keyboard-height'),
          forceScale: app.commandLine.getSwitchValue('force-device-scale-factor'),
      };
 
      console.log("!!!!!!!!test!!!!!!!!!!!!!!!!!");
      console.log(`${JSON.stringify(params)}`);
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
  });
      
  
  win.webContents.setUserAgent(USER_AGENT);
  win.loadURL('https://web.whatsapp.com');
  

    
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
    
    
    //Handle external opening
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (!url) {
          return { action: 'deny' };
        }

        try {
          const parsedUrl = new URL(url);

          // Vérifie si c'est un sous-domaine de whatsapp.com
          const isWhatsAppDomain =
            parsedUrl.hostname === 'whatsapp.com' ||
            parsedUrl.hostname.endsWith('.whatsapp.com');

          if (isWhatsAppDomain) {

            // Nouvelle fenêtre avec la MÊME session
            const childWindow = new BrowserWindow({
              width: 1000,
              height: 600,
              webPreferences: {
                session: win.webContents.session, // share cookies
              }
            });

            childWindow.loadURL(url);
            childWindow.show();
            childWindow.maximize();

            return { action: 'deny' };
          }

        } catch (err) {
          console.error('URL invalide:', url);
        }

        // Sinon → ouvrir en externe
        shell.openExternal(url);
        
        return { action: 'deny' };
      });
  

    
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
}); 


