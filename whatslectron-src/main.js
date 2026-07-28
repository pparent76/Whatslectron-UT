const { app, BrowserWindow, session, dialog, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { URL, pathToFileURL } = require('node:url');
const { shell } = require('electron');
const { execFile } = require('node:child_process');
const { readFile, stat } = require('node:fs/promises');
const { basename, extname } = require('node:path');


const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

// Active explicitement les événements tactiles
app.commandLine.appendSwitch('touch-events', 'enabled');
app.commandLine.appendSwitch('enable-touch-events');

const downloadDir =
  '/home/phablet/.cache/whatslectron.pparent/downloads';

function safeFilename(name) {
  return String(name || 'download')
    .replace(/[\/\\?%*:|"<>]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
}

async function loadInitialPage(win) {
  const load = async () => {
    let timer;

    try {
      await Promise.race([
        win.loadURL('https://web.whatsapp.com'),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            win.webContents.stop();
            reject(new Error('Timeout'));
          }, 7_000);
        })
      ]);

      clearTimeout(timer);
      return true;
    } catch (err) {
      clearTimeout(timer);
      console.error('[load]', err.message);
      return false;
    }
  };

  if (await load()) return;
  if (await load()) return;

  await win.loadFile(path.join(__dirname, 'load-error.html'));
}

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
      contextIsolation: false, // selon ton setup existant
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: true,
    }
  });
  
  win.webContents.on('will-navigate', (event, url) => {
  if (url === 'https://retry.local/') {
    event.preventDefault();
    loadInitialPage(win);
  }
  });
  
  win.webContents.session.on('will-download', (event, item) => {
  try {
    const filename = safeFilename(item.getFilename());
    const defaultPath = path.join(downloadDir, filename);

    console.log('[download] url:', item.getURL());
    console.log('[download] mime:', item.getMimeType());
    console.log('[download] filename:', filename);
    console.log('[download] defaultPath:', defaultPath);

    item.setSavePath(defaultPath);

    item.on('done', (_event, state) => {
      const savePath = item.getSavePath();
      console.log('[download] done:', state, savePath);

      if (state !== 'completed') {
        console.log('[download] not opening, state:', state);
        return;
      }

      const fileUrl = pathToFileURL(savePath).toString();

      console.log('[download] opening:', fileUrl);

      shell.openExternal(fileUrl).catch(err => {
        console.error('[download] openExternal failed:', err);
      });
    });
  } catch (err) {
    console.error('[download] failed:', err);
    event.preventDefault();
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
          textFontSize: app.commandLine.getSwitchValue('text-font-size'),
          spanFontSize: app.commandLine.getSwitchValue('span-font-size'),
      };
 
      console.log("!!!!!!!!test!!!!!!!!!!!!!!!!!");
      console.log(`${JSON.stringify(params)}`);
      const injectableCode = `
      if (window.location.hostname === 'web.whatsapp.com') {
          window.__cmdParams = ${JSON.stringify(params)};

          ${jsCode}
        }
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
  loadInitialPage(win);
  
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    if (permission === 'notifications') {
      callback(true); 
      return;
    }

    if (permission === 'media') {
      const isFocused = win.isFocused();
      callback(isFocused);
      return;
    }

    callback(false);
  });
    
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


//Handle import files
ipcMain.handle('pick-file', async () => {
  const MIME_BY_EXT = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.heic': 'image/heic',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.apng': 'image/apng',
    '.avif': 'image/avif',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo',
    '.3gp': 'video/3gpp',
    '.m4v': 'video/x-m4v',
    '.mpg': 'video/mpeg',
    '.mpeg': 'video/mpeg'
  };

  const filePath = await new Promise((resolve, reject) => {
    console.log("!!!!!!!!!!!!!!!!!!!! Select file !!!!!!!!!!!!!!!");
    execFile(
      '/opt/click.ubuntu.com/whatslectron.pparent/current/utils/select-file.sh',
      [],
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(stdout.trim());
      }
    );
  });

  if (!filePath) {
    return { canceled: true };
  }

  const [data, stats] = await Promise.all([
    readFile(filePath),
    stat(filePath)
  ]);

  const fileType =
    MIME_BY_EXT[extname(filePath).toLowerCase()] ||
    'application/octet-stream';

  console.log("!!!!!!!!!!!!!!!!!!!! File info !!!!!!!!!!!!!!!");
  console.log(filePath);  
  console.log(stats);  
  console.log(fileType); 
  
  return {
    canceled: false,
    data: data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength
    ),
    name: basename(filePath),
    type: fileType,
    lastModified: stats.mtimeMs
  };
});


