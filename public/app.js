const $ = id => document.getElementById(id);
// A video-only preview isolates iOS fullscreen playback from the separate song player.
const diagnoseVideo = typeof location !== 'undefined' && new URLSearchParams(location.search).get('diagnose') === 'video';
const ui = Object.fromEntries(['song','songName','songStartOffset','startOffsetValue','startTicks','demo','camera','cameraLabel','cameraIcon','photo','photoIcon','photoPreview','live','liveFrame','front','back','mirror','mirrorRow','resolution','fps','cameraActual','level','levelBar','countdown','record','stop','stopLabel','preview','offset','offsetValue','save','again','status','statusText','cancelSave'].map(id => [id, $(id)]));
let stream, recorder, chunks = [], videoURL, songURL, songFile, videoBlob, songStart = 0, animation, exporting = false, exportController;
let audioContext, previewWaiting = false, musicPlayPending = false, previewGeneration = 0, syncNeedsAlignment = true, syncVersion = 0;
let facing = 'environment', recordedMirrored = false, recordedSongOffset = 0, photoURL, inReview = false, songReady = false;
let songIdentityReady = true, songId = null, songSelectionVersion = 0, pendingSongOffset = null;
let startDelay = 0, startPending = false, countdownTimer, startGeneration = 0, levelEnabled = false;
const delayButtons = [...document.querySelectorAll('.delay-option')];
const SETTINGS_KEY = 'recordance.settings.v1';
let settings = { positions: {}, selectedSong: null };
try {
  const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  if (saved && typeof saved === 'object') settings = { ...settings, ...saved, positions: saved.positions && typeof saved.positions === 'object' ? saved.positions : {} };
} catch { /* Local storage may be unavailable in private browsing. */ }
function saveSettings() {
  try {
    Object.assign(settings, { facing, mirror: ui.mirror.checked, resolution: ui.resolution.value, fps: ui.fps.value, startDelay, timing: offset() * 1000 });
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch { /* Settings remain usable for this session. */ }
}
function openSongDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('recordance', 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('songs')) request.result.createObjectStore('songs'); };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Song storage is unavailable.'));
  });
}
async function songDatabase(mode, action) {
  const db = await openSongDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('songs', mode), request = action(tx.objectStore('songs'));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || request.error || new Error('Song storage failed.')); };
  });
}
async function fingerprint(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
function applyPendingSongOffset() {
  if (!songReady || !songIdentityReady || pendingSongOffset == null) return;
  const value = Math.max(0, Math.min(Number(ui.songStartOffset.max), Number(pendingSongOffset) || 0));
  ui.songStartOffset.value = String(value);
  ui.startOffsetValue.textContent = formatSongTime(value);
  pendingSongOffset = null;
}
function updateSongAvailability() {
  const blocked = !songReady || !songIdentityReady || startPending || inReview || recorder?.state === 'recording';
  ui.songStartOffset.disabled = blocked; ui.demo.disabled = blocked;
  ready();
}
async function rememberSong(file, version) {
  try {
    const id = await fingerprint(file);
    if (version !== songSelectionVersion) return;
    const previous = await songDatabase('readonly', store => store.get(id));
    if (version !== songSelectionVersion) return;
    if (!previous) await songDatabase('readwrite', store => store.put({ blob: file, name: file.name, type: file.type, lastModified: file.lastModified }, id));
    if (version !== songSelectionVersion) return;
    songId = id; settings.selectedSong = id; pendingSongOffset = settings.positions[id] ?? 0;
    songIdentityReady = true; applyPendingSongOffset(); updateSongAvailability(); saveSettings();
  } catch (e) {
    if (version !== songSelectionVersion) return;
    songIdentityReady = true; updateSongAvailability();
    console.warn('Could not retain song:', e); message('This song could not be remembered on this device.');
  }
}
async function restoreSong() {
  const id = settings.selectedSong, version = songSelectionVersion;
  if (!id) return;
  try {
    const saved = await songDatabase('readonly', store => store.get(id));
    if (version !== songSelectionVersion) return;
    if (!saved?.blob) { settings.selectedSong = null; saveSettings(); return; }
    const file = new File([saved.blob], saved.name || 'Saved song', { type: saved.type || saved.blob.type, lastModified: saved.lastModified || 0 });
    selectSong(file, { id, startOffset: settings.positions[id] ?? 0 });
  } catch (e) { console.warn('Could not restore song:', e); message('Could not restore the saved song on this device.'); }
}
const music = new Audio();
music.preload = 'auto';
const message = text => { ui.statusText.textContent = text; ui.status.hidden = !text; };
// The signed square gives finer timing control near the centre of the slider.
const offset = () => { const x = Number(ui.offset.value); return x * Math.abs(x); };
const format = () => {
  const n = Math.round(offset() * 1000);
  const text = `${n > 0 ? '+' : ''}${n || 0} ms`;
  ui.offsetValue.textContent = text;
  ui.offset.setAttribute('aria-valuetext', text);
};
function ready() { ui.record.disabled = !stream || !songReady || !songIdentityReady || startPending || recorder?.state === 'recording'; ui.photo.disabled = !stream || startPending || inReview || recorder?.state === 'recording'; }
function error(e) { console.error(e); message(e?.message || String(e)); }
async function audioSetup() {
  if (!audioContext) audioContext = new AudioContext();
  if (audioContext.state !== 'running') await audioContext.resume();
}
function stopSync() {
  ++syncVersion; cancelAnimationFrame(animation); syncNeedsAlignment = true;
  music.pause();
}
// Align only on play, seek, buffering recovery or a timing adjustment.
function sync(forceAlignment = false) {
  cancelAnimationFrame(animation);
  if (diagnoseVideo) return;
  if (ui.preview.paused || ui.preview.seeking || previewWaiting) return;
  const elapsed = ui.preview.currentTime - songStart - offset();
  const target = recordedSongOffset + elapsed;
  if (elapsed < 0) {
    music.pause();
    animation = requestAnimationFrame(() => sync());
  } else if (Number.isFinite(music.duration) && target >= music.duration) {
    music.pause(); syncNeedsAlignment = false;
  } else {
    if (Math.abs(music.currentTime - target) > (forceAlignment || syncNeedsAlignment ? 0.001 : 0.03)) music.currentTime = target;
    music.playbackRate = ui.preview.playbackRate || 1;
    if (music.paused && musicPlayPending) { syncNeedsAlignment = true; return; }
    syncNeedsAlignment = false;
    if (music.paused) {
      const version = ++syncVersion;
      musicPlayPending = true;
      Promise.resolve(music.play()).then(() => {
        if (version !== syncVersion) {
          if (!ui.preview.paused && !ui.preview.seeking && !previewWaiting) syncNeedsAlignment = true;
          else music.pause();
        }
      }).catch(e => { if (e?.name !== 'AbortError') error(e); }).finally(() => {
        musicPlayPending = false;
        if (syncNeedsAlignment && !ui.preview.paused && !ui.preview.seeking && !previewWaiting) sync();
      });
    }
  }
}

let demoPlaying = false;
function stopDemo() { if (!demoPlaying) return; music.pause(); music.currentTime = Number(ui.songStartOffset.value); demoPlaying = false; ui.demo.classList.remove('is-playing'); ui.demo.setAttribute('aria-label', 'Preview song'); }
ui.demo.onclick = async () => {
  if (demoPlaying) { stopDemo(); return; }
  try {
    if (music.readyState < 1) await new Promise((resolve, reject) => { music.addEventListener('loadedmetadata', resolve, { once: true }); music.addEventListener('error', reject, { once: true }); });
    if (Number(ui.songStartOffset.value) >= music.duration) { message('The selected position is at the end of the song.'); return; }
    music.currentTime = Number(ui.songStartOffset.value);
    demoPlaying = true; ui.demo.classList.add('is-playing'); ui.demo.setAttribute('aria-label', 'Stop song preview');
    await music.play();
  } catch (e) { stopDemo(); error(e); }
};
music.addEventListener('ended', () => { if (demoPlaying) stopDemo(); });
function formatSongTime(value) {
  const total = Math.floor(value), hours = Math.floor(total / 3600);
  const minutes = Math.floor(total / 60) % 60, seconds = total % 60;
  return [hours ? `${hours}h` : '', minutes ? `${minutes}m` : '', `${seconds}s`].filter(Boolean).join(' ');
}
function updateSongDuration() {
  const duration = music.duration;
  if (!songFile || !Number.isFinite(duration) || duration <= 0) return;
  songReady = true;
  ui.songStartOffset.max = String(Math.min(duration, 3599));
  applyPendingSongOffset(); renderStartTicks(); updateSongAvailability();
}
function renderStartTicks() {
  ui.startTicks.replaceChildren();
  const duration = Number(ui.songStartOffset.max);
  if (!songReady || !Number.isFinite(duration) || duration <= 0) return;
  // Keep major marks about 56 pixels apart, with a shorter mark halfway.
  const width = Math.max(1, (ui.songStartOffset.clientWidth || 200) - 16);
  const target = duration * 56 / width;
  const steps = [2, 4, 10, 20, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200];
  let major = steps.find(step => step >= target) || steps[steps.length - 1];
  while (major < target) major *= 2;
  const half = major / 2;
  for (let i = 1; i * half < duration; i++) {
    const tick = document.createElement('span');
    tick.className = i % 2 === 0 ? 'start-tick major' : 'start-tick';
    tick.style.left = `${i * half / duration * 100}%`;
    ui.startTicks.append(tick);
  }
}
if (window.ResizeObserver) new ResizeObserver(renderStartTicks).observe(ui.songStartOffset);
else window.addEventListener('resize', renderStartTicks);
music.addEventListener('loadedmetadata', updateSongDuration);
music.addEventListener('durationchange', updateSongDuration);
music.addEventListener('error', () => { if (songFile) { songReady = false; ui.songStartOffset.disabled = true; ui.demo.disabled = true; ready(); message('Could not read this audio file.'); } });
ui.songStartOffset.oninput = () => {
  ui.startOffsetValue.textContent = formatSongTime(Number(ui.songStartOffset.value));
  if (demoPlaying) music.currentTime = Number(ui.songStartOffset.value);
  if (songId) { settings.positions[songId] = Number(ui.songStartOffset.value); saveSettings(); }
};
function selectSong(file, restored = null) {
  stopDemo();
  const version = ++songSelectionVersion;
  if (songURL) URL.revokeObjectURL(songURL);
  songReady = false; songIdentityReady = Boolean(restored); songId = restored?.id ?? null;
  pendingSongOffset = restored?.startOffset ?? null;
  ui.songStartOffset.disabled = true; ui.demo.disabled = true;
  ui.songStartOffset.value = '0'; ui.songStartOffset.max = '0'; ui.startOffsetValue.textContent = '0s'; ui.startTicks.replaceChildren();
  songFile = file; songURL = URL.createObjectURL(file); music.src = songURL;
  ui.songName.textContent = file.name; ready(); message('');
  if (!restored) { settings.selectedSong = null; saveSettings(); void rememberSong(file, version); }
}
ui.song.onchange = () => { const file = ui.song.files[0]; if (file) { ui.song.value = ''; selectSong(file); } };
function updateCameraControls() {
  ui.front.setAttribute('aria-pressed', String(facing === 'user'));
  ui.back.setAttribute('aria-pressed', String(facing === 'environment'));
  ui.mirrorRow.hidden = facing !== 'user';
  ui.live.classList.toggle('mirrored', facing === 'user' && ui.mirror.checked);
}
function clearPhoto() {
  ui.photoPreview.hidden = true; ui.photoPreview.removeAttribute('src'); ui.liveFrame.classList.remove('has-photo');
  ui.photoIcon.setAttribute('href', '#i-camera'); ui.photo.setAttribute('aria-label', 'Take photo');
  if (photoURL) { URL.revokeObjectURL(photoURL); photoURL = null; }
}
async function startCamera() {
  try {
    clearPhoto();
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access needs HTTPS or localhost. See the README for iPhone setup.');
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = null; ui.live.srcObject = null; ui.liveFrame.classList.add('empty'); ready();
    const video = { facingMode: { exact: facing } };
    if (ui.resolution.value !== 'auto') { const h = Number(ui.resolution.value); video.width = { ideal: Math.round(h * 16 / 9) }; video.height = { ideal: h }; }
    if (ui.fps.value !== 'auto') video.frameRate = { ideal: Number(ui.fps.value) };
    stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    const settings = stream.getVideoTracks()[0].getSettings();
    ui.cameraActual.textContent = [settings.width && settings.height ? `${settings.width}×${settings.height}` : '', settings.frameRate ? `${Math.round(settings.frameRate)} fps` : ''].filter(Boolean).join(' · ');
    ui.live.srcObject = stream; await ui.live.play(); ui.liveFrame.classList.remove('empty');
    ui.cameraLabel.textContent = 'Reset'; ui.cameraIcon.setAttribute('href', '#i-again'); ready(); message('');
  } catch (e) { stream = null; ready(); error(e); }
}
ui.camera.onclick = async () => { await enableLevel(); await startCamera(); };
async function setFacing(next) {
  if (next === facing) return;
  facing = next; updateCameraControls(); saveSettings();
  if (stream) await startCamera();
}
ui.front.onclick = () => setFacing('user');
ui.back.onclick = () => setFacing('environment');
ui.mirror.onchange = () => { updateCameraControls(); saveSettings(); };
ui.resolution.onchange = ui.fps.onchange = () => { saveSettings(); if (stream) startCamera(); };

function onOrientation(event) {
  if (event.beta == null || event.gamma == null) return;
  const beta = event.beta * Math.PI / 180, gamma = event.gamma * Math.PI / 180;
  const x = -Math.sin(gamma) * Math.cos(beta), y = Math.sin(beta);
  if (Math.hypot(x, y) < 0.15) { ui.level.hidden = true; return; }
  let angle = Math.atan2(x, y) * 180 / Math.PI + (screen.orientation?.angle ?? window.orientation ?? 0);
  angle = ((angle + 180) % 360 + 360) % 360 - 180;
  // A line has no preferred direction: upside-down is level too.
  if (angle > 90) angle -= 180;
  if (angle < -90) angle += 180;
  ui.level.hidden = false;
  ui.levelBar.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
  ui.level.classList.toggle('is-level', Math.abs(angle) < 2);
  ui.level.setAttribute('aria-label', `Camera level: ${Math.round(angle)} degrees`);
}
async function enableLevel() {
  if (levelEnabled || !window.DeviceOrientationEvent) return;
  try {
    if (typeof DeviceOrientationEvent.requestPermission === 'function' && await DeviceOrientationEvent.requestPermission() !== 'granted') return;
    levelEnabled = true;
    window.addEventListener('deviceorientation', onOrientation);
  } catch {
    // Motion is optional; camera and recording still work if permission is denied.
  }
}
delayButtons.forEach(button => button.onclick = () => {
  startDelay = Number(button.dataset.delay); saveSettings();
  delayButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
});
function lockRecordingControls(locked) {
  ui.front.disabled = ui.back.disabled = ui.mirror.disabled = ui.resolution.disabled = ui.fps.disabled = ui.camera.disabled = ui.song.disabled = ui.offset.disabled = ui.photo.disabled = locked;
  ui.songStartOffset.disabled = locked || !songReady || !songIdentityReady;
  ui.offsetValue.disabled = locked;
  delayButtons.forEach(button => { button.disabled = locked; });
  ui.demo.disabled = locked || !songReady || !songIdentityReady;
}
function resetRecordingControls() {
  startPending = false; clearInterval(countdownTimer); countdownTimer = null;
  ui.countdown.hidden = true; ui.record.hidden = false; ui.stop.hidden = true; ui.stopLabel.textContent = 'Stop';
  lockRecordingControls(false); ready();
}

function beep() {
  if (!audioContext || audioContext.state !== 'running') return;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  const now = audioContext.currentTime;
  oscillator.frequency.value = 880;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  oscillator.connect(gain); gain.connect(audioContext.destination);
  oscillator.start(now); oscillator.stop(now + 0.1);
}
function runCountdown(begin, generation) {
  if (!startDelay) { void begin(); return; }
  const end = performance.now() + startDelay * 1000;
  let lastRemaining = startDelay;
  ui.countdown.hidden = false; ui.countdown.textContent = String(lastRemaining); message(''); beep();
  countdownTimer = setInterval(() => {
    if (generation !== startGeneration) return;
    const remaining = Math.ceil((end - performance.now()) / 1000);
    if (remaining <= 0) void begin();
    else if (remaining !== lastRemaining) { lastRemaining = remaining; ui.countdown.textContent = String(remaining); beep(); }
  }, 100);
}

if (settings.facing === 'user' || settings.facing === 'environment') facing = settings.facing;
if (typeof settings.mirror === 'boolean') ui.mirror.checked = settings.mirror;
if (['auto', '720', '1080', '2160'].includes(settings.resolution)) ui.resolution.value = settings.resolution;
if (['auto', '30', '60'].includes(settings.fps)) ui.fps.value = settings.fps;
if ([0, 3, 5].includes(settings.startDelay)) startDelay = settings.startDelay;
if (Number.isFinite(settings.timing)) {
  const seconds = Math.min(1, Math.max(-1, settings.timing / 1000));
  ui.offset.value = String(Math.sign(seconds) * Math.sqrt(Math.abs(seconds)));
}
delayButtons.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.delay) === startDelay)));
updateCameraControls();
void restoreSong();
ui.record.onclick = async () => {
  if (startPending || !stream || !songReady || !songIdentityReady) return;
  const generation = ++startGeneration;
  try {
    if (!window.MediaRecorder) throw new Error('This browser does not support video recording.');
    recordedSongOffset = Number(ui.songStartOffset.value);
    clearPhoto(); startPending = true; lockRecordingControls(true); ready();
    ui.record.hidden = true; ui.stop.hidden = false; ui.stopLabel.textContent = 'Cancel';
    stopDemo(); if (startDelay) await audioSetup();
    if (generation !== startGeneration) return;
    // Unlock playback inside the tap gesture before a delayed start on iOS.
    music.pause(); music.currentTime = recordedSongOffset;
    if (recordedSongOffset < music.duration) {
      music.muted = true;
      try { await music.play(); } finally { music.pause(); music.muted = false; }
    }
    if (generation !== startGeneration) return;
    music.currentTime = recordedSongOffset;
    const begin = async () => {
      if (generation !== startGeneration) return;
      try {
        clearInterval(countdownTimer); countdownTimer = null; ui.countdown.hidden = true;
        recordedMirrored = facing === 'user' && ui.mirror.checked;
        chunks = []; recorder = new MediaRecorder(stream);
        recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        recorder.onerror = e => error(e.error || new Error('Recording failed.'));
        recorder.onstop = async () => {
          music.pause(); if (diagnoseVideo) music.muted = true; resetRecordingControls();
          if (!chunks.length) { message('No video was recorded. Please try again.'); return; }
          if (videoURL) URL.revokeObjectURL(videoURL);
          const original = new Blob(chunks, { type: recorder.mimeType || 'video/mp4' });
          // Release the camera before preparing and decoding the recording.
          stream?.getTracks().forEach(track => track.stop()); stream = null; ui.live.srcObject = null;
          ui.live.hidden = true; ui.preview.hidden = false;
          inReview = true; ui.liveFrame.classList.add('reviewing');
          ui.camera.hidden = true; ui.record.hidden = true; ui.save.hidden = false; ui.again.hidden = false;
          lockRecordingControls(true); ui.offset.disabled = false; ui.offsetValue.disabled = false;
          ui.save.disabled = ui.again.disabled = true; message('Preparing preview…');
          try {
            const { preparePreview } = await import('/fast-export.js?v=32');
            videoBlob = await preparePreview(original);
          } catch (e) {
            console.warn('Could not remux preview; using original recording.', e);
            videoBlob = original;
          }
          videoURL = URL.createObjectURL(videoBlob); ui.preview.src = videoURL;
          ui.save.disabled = ui.again.disabled = false;
          message(diagnoseVideo ? 'Diagnostic: preview plays without music.' : '');
        };
        recorder.start(); const recordingStart = performance.now();
        startPending = false; ui.stopLabel.textContent = 'Stop'; message('');
        if (recordedSongOffset < music.duration) {
          await music.play();
          songStart = (performance.now() - recordingStart) / 1000 - Math.max(0, music.currentTime - recordedSongOffset);
          if (recorder.state !== 'recording') music.pause();
        }
        else songStart = 0;
      } catch (e) {
        if (recorder?.state === 'recording') recorder.stop(); else resetRecordingControls();
        error(e);
      }
    };
    runCountdown(begin, generation);
  } catch (e) { if (generation === startGeneration) { resetRecordingControls(); error(e); } }
};
ui.photo.onclick = async () => {
  if (!stream || startPending || inReview || recorder?.state === 'recording') return;
  if (photoURL) { clearPhoto(); message(''); return; }
  const generation = ++startGeneration;
  try {
    clearPhoto(); startPending = true; lockRecordingControls(true); ready();
    ui.record.hidden = true; ui.stop.hidden = false; ui.stopLabel.textContent = 'Cancel';
    if (startDelay) await audioSetup();
    if (generation !== startGeneration) return;
    const capture = async () => {
      if (generation !== startGeneration) return;
      clearInterval(countdownTimer); countdownTimer = null; ui.countdown.hidden = true;
      try {
        const width = ui.live.videoWidth, height = ui.live.videoHeight;
        if (!width || !height) throw new Error('The camera is not ready yet.');
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (facing === 'user' && ui.mirror.checked) ctx.setTransform(-1, 0, 0, 1, width, 0);
        ctx.drawImage(ui.live, 0, 0, width, height);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.95));
        if (generation !== startGeneration) return;
        if (!blob) throw new Error('Could not capture a photo.');
        photoURL = URL.createObjectURL(blob); ui.photoPreview.src = photoURL;
        ui.photoPreview.hidden = false; ui.liveFrame.classList.add('has-photo');
        ui.photoIcon.setAttribute('href', '#i-camera-off'); ui.photo.setAttribute('aria-label', 'Discard photo and return to camera');
        resetRecordingControls(); message('');
      } catch (e) { if (generation === startGeneration) { resetRecordingControls(); error(e); } }
    };
    runCountdown(capture, generation);
  } catch (e) { if (generation === startGeneration) { resetRecordingControls(); error(e); } }
};

ui.stop.onclick = () => {
  if (startPending) { ++startGeneration; music.pause(); music.muted = false; resetRecordingControls(); message('Countdown cancelled.'); }
  else if (recorder?.state === 'recording') recorder.stop();
};
ui.preview.onplaying = () => {
  ++previewGeneration;
  if (ui.preview.paused || ui.preview.seeking) return;
  previewWaiting = false; if (syncNeedsAlignment) sync();
};
ui.preview.onwaiting = () => { ++previewGeneration; previewWaiting = true; stopSync(); };
ui.preview.onseeking = () => { ++previewGeneration; stopSync(); };
ui.preview.onseeked = () => {
  if (!ui.preview.paused && ui.preview.readyState >= 3) {
    previewWaiting = false; if (syncNeedsAlignment) sync();
  }
};
ui.preview.onratechange = () => { music.playbackRate = ui.preview.playbackRate || 1; };
ui.preview.onpause = () => { ++previewGeneration; previewWaiting = false; stopSync(); };
ui.preview.onended = stopSync;
ui.offset.oninput = () => { format(); saveSettings(); if (!ui.preview.paused) sync(); };
ui.offset.onchange = () => { if (!ui.preview.paused) sync(true); };
ui.offsetValue.onclick = () => { if (ui.offset.disabled) return; ui.offset.value = '0'; ui.offset.oninput(); ui.offset.onchange(); };
ui.again.onclick = async () => {
  inReview = false; stopSync(); music.muted = false; ui.preview.pause(); ui.preview.removeAttribute('src'); ui.preview.load();
  ui.preview.hidden = true; ui.live.hidden = false; ui.liveFrame.classList.remove('reviewing');
  ui.camera.hidden = false; ui.record.hidden = false; ui.save.hidden = true; ui.again.hidden = true;
  lockRecordingControls(false); ready(); message('');
  await startCamera();
};
ui.cancelSave.onclick = () => { if (exportController) { exportController.abort(); ui.cancelSave.disabled = true; message('Cancelling…'); } };
ui.save.onclick = async () => {
  if (exporting) return;
  try {
    exporting = true; exportController = new AbortController(); ui.cancelSave.hidden = false; ui.cancelSave.disabled = false;
    ui.save.disabled = true; ui.again.disabled = true; ui.offset.disabled = true; ui.offsetValue.disabled = true;
    ui.preview.pause();
    if (!videoBlob || !songFile || !Number.isFinite(ui.preview.duration) || !ui.preview.duration) throw new Error('Video is not ready to save yet.');
    message('Preparing export…');
    const { exportRecording } = await import('/fast-export.js?v=32');
    const blob = await exportRecording({ video: videoBlob, song: songFile, duration: ui.preview.duration, delay: songStart + offset(), startOffset: recordedSongOffset, mirrored: recordedMirrored, onProgress: text => { if (!exportController.signal.aborted) message(text); }, signal: exportController.signal });
    exportController.signal.throwIfAborted();
    if (!blob.size) throw new Error('The exported video is empty.');
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `recordance-${Date.now()}.mp4`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    message('');
  } catch (e) { if (exportController?.signal.aborted) message(''); else error(e); }
  finally { exporting = false; exportController = null; ui.cancelSave.hidden = true; ui.save.disabled = false; ui.again.disabled = false; ui.offset.disabled = false; ui.offsetValue.disabled = false; }
};
format();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js?v=32').catch(console.warn);
