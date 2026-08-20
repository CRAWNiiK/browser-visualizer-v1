const POPOUT_URL = './popout.html';
const POPOUT_FEATURES = 'width=480,height=360,resizable=yes,scrollbars=no';

/**
 * Manage a real OS-level popout window (window.open). The popup is a separate
 * browser window you can move to any screen and resize freely.
 *
 * Audio is shared as *data*, not a MediaStream: browsers can't transfer
 * MediaStreams between windows (Chrome reports them as non-transferable), so
 * the main window pushes each analysed frame — frequency bins + waveform,
 * plain structured-cloneable typed arrays — over postMessage every frame.
 * Settings are pushed on every change.
 */
export function initPopout({ getSettings, getAudioData }) {
  let win = null;
  let pollTimer = null;

  function open() {
    if (win && !win.closed) {
      win.focus();
      return { blocked: false };
    }
    // Must be called from a user gesture or the browser may block it.
    win = window.open(POPOUT_URL, 'soundwave-popout', POPOUT_FEATURES);
    if (!win) return { blocked: true };

    pollTimer = setInterval(() => {
      if (win.closed) {
        clearInterval(pollTimer);
        pollTimer = null;
        win = null;
      }
    }, 500);
    return { blocked: false };
  }

  function close() {
    if (win && !win.closed) win.close();
    win = null;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function sendAudioData(data) {
    if (!win || win.closed) return;
    win.postMessage({ type: 'audio', bins: data.bins, wave: data.wave }, '*');
  }

  function sync(settings) {
    if (win && !win.closed) win.postMessage({ type: 'settings', settings }, '*');
  }

  function stopAudio() {
    if (win && !win.closed) win.postMessage({ type: 'stop' }, '*');
  }

  // When the popup finishes loading it says "ready"; push the current state.
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'ready') {
      sync(getSettings());
      const data = getAudioData();
      if (data) sendAudioData(data);
    }
  });

  return {
    open,
    close,
    sendAudioData,
    sync,
    stopAudio,
    isOpen: () => !!win && !win.closed,
  };
}
