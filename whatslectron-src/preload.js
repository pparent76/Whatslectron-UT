// preload.js
const { ipcRenderer } = require('electron');

console.log('[preload] TOP LEVEL loaded', location.href);
window.__PRELOAD_MARKER__ = 'loaded-' + Date.now();

//-----------------------------------------------
//   Microphone state tracking
//-----------------------------------------------
function monitorMicrophoneUse() {
  const mediaDevices = navigator.mediaDevices;
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== 'function') 
  return;

  const microphoneTracks = new Set();
  const nativeGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);
  let lastReportedState = false;

  //Report the microphone to the electron app
  const reportState = () => {
    for (const track of microphoneTracks) {
      if (track.readyState === 'ended') microphoneTracks.delete(track);
    }

    const active = microphoneTracks.size > 0;
    if (active === lastReportedState) return;

    lastReportedState = active;
    ipcRenderer.send('microphone-state-changed', active);
  };

  //Add a track in the list of monitored traacks
  const watchTrack = track => {
    if (!track || track.kind !== 'audio' || microphoneTracks.has(track)) return;

    microphoneTracks.add(track);
    track.addEventListener('ended', reportState, { once: true });
    reportState();
  };

  //Handle new microphone track
  mediaDevices.getUserMedia = async constraints => {
    const stream = await nativeGetUserMedia(constraints);
    stream.getAudioTracks().forEach(watchTrack);
    return stream;
  };

  // Monitor clone event 
  const nativeClone = MediaStreamTrack.prototype.clone;
  MediaStreamTrack.prototype.clone = function () {
    const clonedTrack = nativeClone.call(this);
    if (this.kind === 'audio' && microphoneTracks.has(this)) watchTrack(clonedTrack);
    return clonedTrack;
  };

  // Monitor stop event 
  const nativeStop = MediaStreamTrack.prototype.stop;
  MediaStreamTrack.prototype.stop = function () {
    nativeStop.call(this);
    if (microphoneTracks.has(this)) reportState();
  };
}

monitorMicrophoneUse();

//---------------------------------------------------------

function isFileInput(el) {
  return el instanceof HTMLInputElement && el.type === 'file';
}

function setFiles(input, files) {
  const dt = new DataTransfer();

  for (const f of files) {
    dt.items.add(f);
  }

  Object.defineProperty(input, 'files', {
    configurable: true,
    get: () => dt.files,
  });

  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

async function pickAndSet(input) {
  const result = await ipcRenderer.invoke('pick-file', {
    accept: input.accept,
    multiple: input.multiple,
  });

  if (!result || result.canceled) return;

  const files = (result.files || [result]).map(file =>
    new File([file.data], file.name, {
      type: file.type || '',
      lastModified: file.lastModified || Date.now(),
    })
  );

  setFiles(input, files);
}

function setupFileInputPicker() {
  const nativeClick = HTMLInputElement.prototype.click;

  HTMLInputElement.prototype.click = function () {
    if (!isFileInput(this)) {
      return nativeClick.call(this);
    }

    void pickAndSet(this);
    return undefined;
  };

  document.addEventListener('click', event => {
    const path = event.composedPath();

    const input = path.find(isFileInput);

    if (!input) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    void pickAndSet(input);
  }, true);

  window.showOpenFilePicker = async () => {
    throw new DOMException('Blocked by app', 'AbortError');
  };
}

setupFileInputPicker();
