const { app, BrowserWindow, WebContentsView, session, dialog, ipcMain, ImageView } = require('electron');
const path = require('path');
const fs = require('fs');
const { URL, pathToFileURL } = require('node:url');
const { shell } = require('electron');
const { execFile } = require('node:child_process');
const { readFile, stat } = require('node:fs/promises');
const { basename, extname } = require('node:path');

app.setDesktopName("whatslectron.pparent");

const USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36';

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

async function loadInitialPage(webContents) {
  const load = async () => {
    let timer;

    try {
      await Promise.race([
        webContents.loadURL('https://web.whatsapp.com'),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            webContents.stop();
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

  await webContents.loadFile(path.join(__dirname, 'load-error.html'));
}

function createWindow() {
  const win = new BrowserWindow({
    autoHideMenuBar: true,
    width: 1000,
    height: 600,
    minWidth: 400,
    minHeight: 400,   
    show: true
  });
  const whatsAppView = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false, // selon ton setup existant
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: true,
    }
  });
  const screenshotView = new ImageView();
  const whatsAppContents = whatsAppView.webContents;
  let isWhatsAppViewAttached = false;

  const resizeWhatsAppView = () => {
    const { width, height } = win.getContentBounds();
    whatsAppView.setBounds({ x: 0, y: 0, width, height });
    screenshotView.setBounds({ x: 0, y: 0, width, height });
  };

  const setWhatsAppViewVisible = async visible => {
    if (visible === isWhatsAppViewAttached) return;

    if (visible) {
      whatsAppView.setVisible(true);
      screenshotView.setVisible(false);
    } else {
      try {
          const screenshot = await whatsAppContents.capturePage();
          const bounds = whatsAppView.getBounds();
          screenshotView.setBounds(bounds);
          const resized = screenshot.resize({
            width: bounds.width,
            height: bounds.height,
          });
          screenshotView.setImage(resized);
        } catch (error) {}
        screenshotView.setVisible(true);  
        whatsAppView.setVisible(false);
    }

    isWhatsAppViewAttached = visible;
  };

  win.contentView.addChildView(whatsAppView,0);
  win.contentView.addChildView(screenshotView,1);
  resizeWhatsAppView();
  setWhatsAppViewVisible(true);
  win.on('resize', resizeWhatsAppView);
  
  let microphoneActive = false;
  let rendererRestartInProgress = false;
  const isInBackground = () => BrowserWindow.getFocusedWindow() === null;

  function restartRendererForMicrophonePrivacy()
  {
    if (!isInBackground() || rendererRestartInProgress || win.isDestroyed()) return;

    rendererRestartInProgress = true;
    microphoneActive = false;
    console.warn('[privacy] microphone active in background; restarting renderer');

    whatsAppContents.once('render-process-gone', () => {
      if (whatsAppContents.isDestroyed()) return;

      whatsAppContents.reload();
      rendererRestartInProgress = false;
    });
    whatsAppContents.forcefullyCrashRenderer();
  };

  whatsAppContents.on('will-navigate', (event, url) => {
  if (url === 'https://retry.local/') {
    event.preventDefault();
    loadInitialPage(whatsAppContents);
  }
  });
  
  whatsAppContents.session.on('will-download', (event, item) => {
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
  
  whatsAppContents.on('dom-ready', () => {
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
      whatsAppContents.executeJavaScript(injectableCode)
        .then(() => console.log('[main] ubuntutheme.js injected'))
        .catch(err => console.error('[main] failed to inject ubuntutheme.js', err));

    } catch (err) {
      console.error('[main] could not load ubuntutheme.js', err);
    }
  });
      
  
  whatsAppContents.setUserAgent(USER_AGENT);
  loadInitialPage(whatsAppContents);
  
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
        setWhatsAppViewVisible(false);
        whatsAppContents.setAudioMuted(true);
        console.log('Audio coupé');
        if (microphoneActive) 
        {
          console.log('Microphone coupé');
          restartRendererForMicrophonePrivacy();
        }
        
          setTimeout(async () => {
            try {
              const result = await whatsAppContents.executeJavaScript(`
                ({
                  hidden: document.hidden,
                  visibilityState: document.visibilityState
                })
              `);

              console.log('visibility:', result);
            } catch (error) {
              console.error('Erreur lors de la récupération de la visibilité:', error);
            }
          }, 10000);
    
    });
    
    win.on('minimize', () => {
        setWhatsAppViewVisible(false);
        whatsAppContents.setAudioMuted(true);
        console.log('Audio coupé');
        if (microphoneActive) 
        {
          console.log('Microphone coupé');
          restartRendererForMicrophonePrivacy();
        }
    });    

    win.on('focus', () => {
        setWhatsAppViewVisible(true);
        whatsAppContents.setAudioMuted(false);
        console.log('Audio activé');
    });

    const downloadPath = '/home/phablet/.cache/whatslectron.pparent/downloads/';
    session.defaultSession.setDownloadPath(downloadPath);
    console.log("!!!!!!!!!!!!!!!!!!!!! Satrted new !!!!!!!!!!!!!!!!!!!!!");
    
    
    //Handle external opening
    whatsAppContents.setWindowOpenHandler(({ url }) => {
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
                session: whatsAppContents.session, // share cookies
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
    
    //Get microphone state change events from preload
    ipcMain.on('microphone-state-changed', (event, active) => {
      
      console.warn('[privacy] microphone state changed: ',active);
      if (event.sender !== whatsAppContents) return;

      microphoneActive = active === true;
      if (microphoneActive && isInBackground()) {
        restartRendererForMicrophonePrivacy();
      }
    }
    );
    
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

