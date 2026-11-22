const $ = id => document.getElementById(id);
const ui = Object.fromEntries(['song','songName','songStartOffset','startOffsetValue','startTicks','demo','camera','cameraLabel','cameraIcon','photo','photoIcon','photoPreview','live','liveFrame','front','back','mirror','mirrorRow','resolution','fps','cameraActual','level','levelBar','countdown','record','stop','stopLabel','preview','offset','offsetValue','save','again','status'].map(id => [id, $(id)]));
let stream, recorder, chunks = [], videoURL, songURL, songFile, videoBlob, songStart = 0, animation, exporting = false;
let audioContext, musicNode, syncMonitor, previewWaiting = false, previewStalled = false, musicPlayPending = false, previewGeneration = 0;
let facing = 'environment', recordedMirrored = false, recordedSongOffset = 0, photoURL, inReview = false, songReady = false;
let startDelay = 0, startPending = false, countdownTimer, startGeneration = 0, levelEnabled = false;
const delayButtons = [...document.querySelectorAll('.delay-option')];
const music = new Audio();
music.preload = 'auto';
const message = text => { ui.status.textContent = text; };
const offset = () => Number(ui.offset.value) / 1000;
const format = () => { const n = Number(ui.offset.value); ui.offsetValue.textContent = `${n > 0 ? '+' : ''}${n} ms`; };
function ready() { ui.record.disabled = !stream || !songReady || startPending || recorder?.state === 'recording'; ui.photo.disabled = !stream || startPending || inReview || recorder?.state === 'recording'; }
function error(e) { console.error(e); message(e?.message || String(e)); }
async function audioSetup() {
  if (!audioContext) {
    audioContext = new AudioContext();
    musicNode = audioContext.createMediaElementSource(music);
    musicNode.connect(audioContext.destination);
  }
  if (audioContext.state !== 'running') await audioContext.resume();
}
function stopSync() {
  cancelAnimationFrame(animation); clearInterval(syncMonitor); syncMonitor = null;
  music.pause();
}
// Align against the recorded start and adjustment; do not seek repeatedly per frame.
function sync() {
  cancelAnimationFrame(animation);
  if (ui.preview.paused || ui.preview.seeking || previewWaiting || previewStalled) return;
  const elapsed = ui.preview.currentTime - songStart - offset();
  const target = recordedSongOffset + elapsed;
  if (elapsed < 0) {
    music.pause();
    animation = requestAnimationFrame(sync);
  } else if (Number.isFinite(music.duration) && target >= music.duration) {
    music.pause();
  } else {
    if (Math.abs(music.currentTime - target) > 0.03 && !music.seeking) music.currentTime = target;
    music.playbackRate = ui.preview.playbackRate || 1;
    if (music.paused && !musicPlayPending) {
      musicPlayPending = true;
      Promise.resolve(music.play()).catch(e => { if (e?.name !== 'AbortError') error(e); }).finally(() => { musicPlayPending = false; });
    }
  }
}
function monitorSync() {
  clearInterval(syncMonitor);
  let lastTime = ui.preview.currentTime, lastAdvance = performance.now(), lastCorrection = 0;
  syncMonitor = setInterval(() => {
    if (ui.preview.paused || ui.preview.seeking || previewWaiting) return;
    const now = performance.now(), current = ui.preview.currentTime;
    if (Math.abs(current - lastTime) > 0.01) {
      lastTime = current; lastAdvance = now;
      if (previewStalled) { previewStalled = false; sync(); lastCorrection = now; }
    } else if (now - lastAdvance > 1200) {
      if (!previewStalled) { previewStalled = true; cancelAnimationFrame(animation); music.pause(); }
      return;
    }
    const elapsed = current - songStart - offset();
    const target = recordedSongOffset + elapsed;
    if (elapsed >= 0 && (!Number.isFinite(music.duration) || target < music.duration) &&
        !music.seeking && now - lastCorrection > 1500 &&
        (Math.abs(music.currentTime - target) > 0.35 || (music.paused && !musicPlayPending))) {
      lastCorrection = now; sync();
    }
  }, 500);
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
  ui.songStartOffset.disabled = startPending || inReview || recorder?.state === 'recording';
  ui.demo.disabled = ui.songStartOffset.disabled;
  renderStartTicks();
  ready();
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
};
ui.song.onchange = () => {
  stopDemo();
  const file = ui.song.files[0]; if (!file) return;
  if (songURL) URL.revokeObjectURL(songURL);
  songReady = false; ui.songStartOffset.disabled = true; ui.demo.disabled = true;
  ui.songStartOffset.value = '0'; ui.songStartOffset.max = '0'; ui.startOffsetValue.textContent = '0s'; ui.startTicks.replaceChildren();
  songFile = file; songURL = URL.createObjectURL(file); music.src = songURL;
  ui.songName.textContent = file.name; ready(); message('');
};
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
  facing = next; updateCameraControls();
  if (stream) await startCamera();
}
ui.front.onclick = () => setFacing('user');
ui.back.onclick = () => setFacing('environment');
ui.mirror.onchange = updateCameraControls;
ui.resolution.onchange = ui.fps.onchange = () => { if (stream) startCamera(); };

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
  startDelay = Number(button.dataset.delay);
  delayButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
});
function lockRecordingControls(locked) {
  ui.front.disabled = ui.back.disabled = ui.mirror.disabled = ui.resolution.disabled = ui.fps.disabled = ui.camera.disabled = ui.song.disabled = ui.offset.disabled = ui.photo.disabled = locked;
  ui.songStartOffset.disabled = locked || !songReady;
  ui.offsetValue.disabled = locked;
  delayButtons.forEach(button => { button.disabled = locked; });
  ui.demo.disabled = locked || !songReady;
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

updateCameraControls();
ui.record.onclick = async () => {
  if (startPending || !stream || !songReady) return;
  const generation = ++startGeneration;
  try {
    if (!window.MediaRecorder) throw new Error('This browser does not support video recording.');
    recordedSongOffset = Number(ui.songStartOffset.value);
    clearPhoto(); startPending = true; lockRecordingControls(true); ready();
    ui.record.hidden = true; ui.stop.hidden = false; ui.stopLabel.textContent = 'Cancel';
    stopDemo(); await audioSetup();
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
        recorder.onstop = () => {
          music.pause(); resetRecordingControls();
          if (!chunks.length) { message('No video was recorded. Please try again.'); return; }
          if (videoURL) URL.revokeObjectURL(videoURL);
          videoBlob = new Blob(chunks, { type: recorder.mimeType || 'video/mp4' });
          videoURL = URL.createObjectURL(videoBlob);
          // Release the camera before decoding the recording, especially on iPhone.
          stream?.getTracks().forEach(track => track.stop()); stream = null; ui.live.srcObject = null;
          ui.preview.src = videoURL; ui.live.hidden = true; ui.preview.hidden = false;
          inReview = true; ui.liveFrame.classList.add('reviewing');
          ui.camera.hidden = true; ui.record.hidden = true; ui.save.hidden = false; ui.again.hidden = false;
          lockRecordingControls(true); ui.offset.disabled = false; ui.offsetValue.disabled = false; message('');
        };
        recorder.start(250); const recordingStart = performance.now();
        startPending = false; ui.stopLabel.textContent = 'Stop'; message('');
        if (recordedSongOffset < music.duration) { await music.play(); songStart = (performance.now() - recordingStart) / 1000; }
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
ui.preview.onplay = async () => { try { await audioSetup(); } catch (e) { error(e); } };
ui.preview.onplaying = async () => {
  const generation = ++previewGeneration;
  try {
    await audioSetup();
    if (generation !== previewGeneration || ui.preview.paused || ui.preview.seeking) return;
    previewWaiting = false; previewStalled = false; sync(); monitorSync();
  } catch (e) { error(e); }
};
ui.preview.onwaiting = () => { ++previewGeneration; previewWaiting = true; stopSync(); };
ui.preview.onseeking = () => { ++previewGeneration; stopSync(); };
ui.preview.onseeked = () => {
  if (!ui.preview.paused && ui.preview.readyState >= 3) {
    previewWaiting = false; previewStalled = false; sync(); monitorSync();
  }
};
ui.preview.onratechange = () => { if (!ui.preview.paused) sync(); };
ui.preview.onpause = () => { ++previewGeneration; previewWaiting = false; previewStalled = false; stopSync(); };
ui.preview.onended = stopSync;
ui.offset.oninput = () => { format(); if (!ui.preview.paused) sync(); };
ui.offsetValue.onclick = () => { if (ui.offset.disabled) return; ui.offset.value = '0'; ui.offset.oninput(); };
ui.again.onclick = async () => {
  inReview = false; stopSync(); ui.preview.pause(); ui.preview.removeAttribute('src'); ui.preview.load();
  ui.preview.hidden = true; ui.live.hidden = false; ui.liveFrame.classList.remove('reviewing');
  ui.camera.hidden = false; ui.record.hidden = false; ui.save.hidden = true; ui.again.hidden = true;
  lockRecordingControls(false); ready(); message('');
  await startCamera();
};
ui.save.onclick = async () => {
  if (exporting) return;
  try {
    exporting = true; ui.save.disabled = true; ui.again.disabled = true; ui.offset.disabled = true; ui.offsetValue.disabled = true;
    ui.preview.pause();
    if (!videoBlob || !songFile || !Number.isFinite(ui.preview.duration) || !ui.preview.duration) throw new Error('Video is not ready to save yet.');
    message('Preparing export…');
    const { exportRecording } = await import('/fast-export.js?v=23');
    const blob = await exportRecording({ video: videoBlob, song: songFile, duration: ui.preview.duration, delay: songStart + offset(), startOffset: recordedSongOffset, mirrored: recordedMirrored, onProgress: message });
    if (!blob.size) throw new Error('The exported video is empty.');
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `recordance-${Date.now()}.mp4`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    message('Export ready. Use the browser download or share sheet to save it to Photos.');
  } catch (e) { error(e); }
  finally { exporting = false; ui.save.disabled = false; ui.again.disabled = false; ui.offset.disabled = false; ui.offsetValue.disabled = false; }
};
format();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js?v=23').catch(console.warn);
