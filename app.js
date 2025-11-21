const BACKEND_HTTP = 'https://physically-holy-longhorn.ngrok-free.app';
const BACKEND_WS = 'wss://physically-holy-longhorn.ngrok-free.app/ws/control?role=mobile';
const DEFAULT_HEADERS = {
  'ngrok-skip-browser-warning': 'mobile-client'
};

const cameraEl = document.getElementById('cameraStream');
const canvasEl = document.getElementById('captureCanvas');
const wsStatusEl = document.getElementById('wsStatus');
const uploadStatusEl = document.getElementById('uploadStatus');
const reconnectBtn = document.getElementById('reconnectBtn');
const manualBtn = document.getElementById('manualBtn');

let mediaStream;
let websocket;
let reconnectTimer;

async function init() {
  await enableCamera();
  initWebSocket();
}

async function enableCamera() {
  if (mediaStream) {
    return;
  }
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'environment',
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });
    cameraEl.srcObject = mediaStream;
    updateUploadStatus('Ready', true);
  } catch (err) {
    console.error('Camera error', err);
    updateUploadStatus('Camera blocked', false);
    alert('Camera permission is required for remote capture. Please enable it and reload.');
  }
}

function initWebSocket() {
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.close();
  }
  websocket = new WebSocket(BACKEND_WS);
  websocket.addEventListener('open', () => {
    updateSocketStatus(true);
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
  });
  websocket.addEventListener('close', () => {
    updateSocketStatus(false);
    scheduleReconnect();
  });
  websocket.addEventListener('error', () => {
    updateSocketStatus(false);
    scheduleReconnect();
  });
  websocket.addEventListener('message', handleSocketMessage);
}

function scheduleReconnect() {
  if (reconnectTimer) {
    return;
  }
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    initWebSocket();
  }, 3000);
}

function handleSocketMessage(event) {
  try {
    const message = JSON.parse(event.data);
    if (message.type === 'capture') {
      captureAndSend();
    }
  } catch (err) {
    console.warn('Unable to parse message', err);
  }
}

async function captureAndSend() {
  if (!mediaStream) {
    await enableCamera();
  }
  const track = mediaStream?.getVideoTracks()?.[0];
  if (!track) {
    updateUploadStatus('No video track', false);
    return;
  }

  const settings = track.getSettings();
  const width = settings.width || 1280;
  const height = settings.height || 720;
  const context = canvasEl.getContext('2d');
  canvasEl.width = width;
  canvasEl.height = height;
  context.drawImage(cameraEl, 0, 0, width, height);
  const dataUrl = canvasEl.toDataURL('image/jpeg', 0.92);

  try {
    updateUploadStatus('Uploading...', true);
    const response = await fetch(`${BACKEND_HTTP}/api/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...DEFAULT_HEADERS
      },
      body: JSON.stringify({ imageData: dataUrl })
    });
    if (!response.ok) {
      throw new Error(`Upload failed (${response.status})`);
    }
    updateUploadStatus('Capture sent ✓', true);
  } catch (err) {
    console.error('Upload error', err);
    updateUploadStatus('Upload failed', false);
  }
}

function updateSocketStatus(connected) {
  wsStatusEl.textContent = connected ? 'Connected' : 'Disconnected';
  wsStatusEl.classList.toggle('badge--success', connected);
  wsStatusEl.classList.toggle('badge--danger', !connected);
}

function updateUploadStatus(message, positive) {
  uploadStatusEl.textContent = message;
  uploadStatusEl.classList.toggle('badge--success', Boolean(positive));
  uploadStatusEl.classList.toggle('badge--danger', positive === false);
}

reconnectBtn.addEventListener('click', () => {
  scheduleReconnect();
  updateUploadStatus('Reconnecting…', true);
});

manualBtn.addEventListener('click', captureAndSend);

init();
