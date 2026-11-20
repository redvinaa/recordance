const $ = id => document.getElementById(id);
const ui = Object.fromEntries(['song','songName','demo','camera','cameraLabel','live','liveFrame','front','back','mirror','mirrorRow','resolution','fps','cameraActual','level','levelBar','countdown','record','stop','stopLabel','preview','offset','offsetValue','save','again','status'].map(id => [id, $(id)]));
let stream, recorder, chunks = [], videoURL, songURL, songFile, videoBlob, songStart = 0, animation, exporting = false;
let audioContext, musicNode;
let facing = 'user', recordedMirrored = false;
let startDelay = 0, startPending = false, countdownTimer, startGeneration = 0, levelEnabled = false;
const delayButtons = [...document.querySelectorAll('.delay-option')];
const music = new Audio();
music.preload = 'auto';
const message = text => { ui.status.textContent = text; };
const offset = () => Number(ui.offset.value) / 1000;
const format = () => { const n = Number(ui.offset.value); ui.offsetValue.textContent = `${n > 0 ? '+' : ''}${n} ms`; };
function ready() { ui.record.disabled = !stream || !songURL || startPending || recorder?.state === 'recording'; }
function error(e) { console.error(e); message(e?.message || String(e)); }
async function audioSetup() {
  if (!audioContext) {
    audioContext = new AudioContext();
    musicNode = audioContext.createMediaElementSource(music);
    musicNode.connect(audioContext.destination);
  }
  if (audioContext.state !== 'running') await audioContext.resume();
}
function stopSync() { cancelAnimationFrame(animation); music.pause(); }
// songStart is the time on the camera timeline when the song began. Positive
// adjustment delays the song relative to that original alignment.
function sync() {
  cancelAnimationFrame(animation);
  if (ui.preview.paused) return;
  const target = ui.preview.currentTime - songStart - offset();
  if (target < 0) {
    music.pause();
    // Wait for the video to reach the start of the song. Do not repeatedly
    // seek during normal playback: Safari may stall on frequent seeks.
    animation = requestAnimationFrame(sync);
  } else if (Number.isFinite(music.duration) && target >= music.duration) {
    music.pause();
  } else {
    if (Math.abs(music.currentTime - target) > 0.03) music.currentTime = target;
    if (music.paused) music.play().catch(error);
  }
}
let demoPlaying = false;
function stopDemo() { if (!demoPlaying) return; music.pause(); music.currentTime = 0; demoPlaying = false; ui.demo.classList.remove('is-playing'); ui.demo.setAttribute('aria-label', 'Preview song'); }
ui.demo.onclick = async () => {
  if (demoPlaying) { stopDemo(); return; }
  try {
    if (music.readyState < 1) await new Promise((resolve, reject) => { music.addEventListener('loadedmetadata', resolve, { once: true }); music.addEventListener('error', reject, { once: true }); });
    music.currentTime = Number.isFinite(music.duration) ? music.duration * 0.3 : 0;
    demoPlaying = true; ui.demo.classList.add('is-playing'); ui.demo.setAttribute('aria-label', 'Stop song preview');
    await music.play();
  } catch (e) { stopDemo(); error(e); }
};
music.addEventListener('ended', () => { if (demoPlaying) stopDemo(); });
ui.song.onchange = () => {
  stopDemo();
  const file = ui.song.files[0]; if (!file) return;
  if (songURL) URL.revokeObjectURL(songURL);
  songFile = file; songURL = URL.createObjectURL(file); music.src = songURL;
  ui.songName.textContent = file.name; ui.demo.disabled = false; ready(); message('');
};
function updateCameraControls() {
  ui.front.setAttribute('aria-pressed', String(facing === 'user'));
  ui.back.setAttribute('aria-pressed', String(facing === 'environment'));
  ui.mirrorRow.hidden = facing !== 'user';
  ui.live.classList.toggle('mirrored', facing === 'user' && ui.mirror.checked);
}
async function startCamera() {
  try {
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
    ui.cameraLabel.textContent = 'Restart'; ready(); message('');
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
  ui.front.disabled = ui.back.disabled = ui.mirror.disabled = ui.resolution.disabled = ui.fps.disabled = ui.camera.disabled = ui.song.disabled = ui.offset.disabled = locked;
  delayButtons.forEach(button => { button.disabled = locked; });
  ui.demo.disabled = locked || !songURL;
}
function resetRecordingControls() {
  startPending = false; clearInterval(countdownTimer); countdownTimer = null;
  ui.countdown.hidden = true; ui.record.hidden = false; ui.stop.hidden = true; ui.stopLabel.textContent = 'Stop';
  lockRecordingControls(false); ready();
}

updateCameraControls();
ui.record.onclick = async () => {
  if (startPending || !stream || !songFile) return;
  const generation = ++startGeneration;
  try {
    if (!window.MediaRecorder) throw new Error('This browser does not support video recording.');
    startPending = true; lockRecordingControls(true); ready();
    ui.record.hidden = true; ui.stop.hidden = false; ui.stopLabel.textContent = 'Cancel';
    stopDemo(); await audioSetup();
    if (generation !== startGeneration) return;
    // Unlock playback inside the tap gesture before a delayed start on iOS.
    music.pause(); music.currentTime = 0; music.muted = true;
    try { await music.play(); } finally { music.pause(); music.muted = false; }
    if (generation !== startGeneration) return;
    music.currentTime = 0;
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
          ui.preview.src = videoURL; ui.live.hidden = true; ui.preview.hidden = false;
          ui.liveFrame.classList.add('reviewing');
          ui.camera.hidden = true; ui.record.hidden = true; ui.save.hidden = false; ui.again.hidden = false;
          lockRecordingControls(true); ui.offset.disabled = false; message('');
        };
        recorder.start(250); const recordingStart = performance.now();
        startPending = false; ui.stopLabel.textContent = 'Stop'; message('');
        await music.play(); songStart = (performance.now() - recordingStart) / 1000;
      } catch (e) {
        if (recorder?.state === 'recording') recorder.stop(); else resetRecordingControls();
        error(e);
      }
    };
    if (!startDelay) { await begin(); return; }
    const end = performance.now() + startDelay * 1000;
    ui.countdown.hidden = false; ui.countdown.textContent = String(startDelay); message('');
    countdownTimer = setInterval(() => {
      const remaining = Math.ceil((end - performance.now()) / 1000);
      if (remaining <= 0) void begin(); else ui.countdown.textContent = String(remaining);
    }, 100);
  } catch (e) { if (generation === startGeneration) { resetRecordingControls(); error(e); } }
};
ui.stop.onclick = () => {
  if (startPending) { ++startGeneration; music.pause(); music.muted = false; resetRecordingControls(); message('Countdown cancelled.'); }
  else if (recorder?.state === 'recording') recorder.stop();
};
ui.preview.onplay = async () => { try { await audioSetup(); sync(); } catch (e) { error(e); } };
ui.preview.onpause = stopSync;
ui.preview.onseeked = () => { if (!ui.preview.paused) sync(); };
ui.preview.onended = stopSync;
ui.offset.oninput = () => { format(); if (!ui.preview.paused) sync(); };
ui.again.onclick = () => { stopSync(); ui.preview.pause(); ui.preview.removeAttribute('src'); ui.preview.load(); ui.preview.hidden = true; ui.live.hidden = false; ui.liveFrame.classList.remove('reviewing'); ui.camera.hidden = false; ui.record.hidden = false; ui.save.hidden = true; ui.again.hidden = true; lockRecordingControls(false); ready(); message(''); };
ui.save.onclick = async () => {
  if (exporting) return;
  try {
    exporting = true; ui.save.disabled = true; ui.again.disabled = true; ui.offset.disabled = true;
    ui.preview.pause();
    if (!videoBlob || !songFile || !Number.isFinite(ui.preview.duration) || !ui.preview.duration) throw new Error('Video is not ready to save yet.');
    message('Preparing export…');
    const { exportRecording } = await import('/fast-export.js?v=15');
    const blob = await exportRecording({ video: videoBlob, song: songFile, duration: ui.preview.duration, delay: songStart + offset(), mirrored: recordedMirrored, onProgress: message });
    if (!blob.size) throw new Error('The exported video is empty.');
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `recordance-${Date.now()}.mp4`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    message('Export ready. Use the browser download or share sheet to save it to Photos.');
  } catch (e) { error(e); }
  finally { exporting = false; ui.save.disabled = false; ui.again.disabled = false; ui.offset.disabled = false; }
};
format();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js?v=15').catch(console.warn);
