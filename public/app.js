const $ = id => document.getElementById(id);
const ui = Object.fromEntries(['song','songName','demo','camera','cameraLabel','live','liveFrame','front','back','mirror','mirrorRow','resolution','fps','cameraActual','record','stop','setup','review','preview','play','seek','playTime','offset','offsetValue','save','again','status'].map(id => [id, $(id)]));
let stream, recorder, chunks = [], videoURL, songURL, songStart = 0, animation, exporting = false;
let audioContext, musicNode, videoNode, mix;
let facing = 'user', recordedMirrored = false, recordedFps = 30;
const music = new Audio();
music.preload = 'auto';
const message = text => { ui.status.textContent = text; };
const offset = () => Number(ui.offset.value) / 1000;
const format = () => { const n = Number(ui.offset.value); ui.offsetValue.textContent = `${n > 0 ? '+' : ''}${n} ms`; };
function ready() { ui.record.disabled = !stream || !songURL || recorder?.state === 'recording'; }
function error(e) { console.error(e); message(e?.message || String(e)); }
async function audioSetup() {
  if (!audioContext) {
    audioContext = new AudioContext();
    mix = audioContext.createMediaStreamDestination();
    musicNode = audioContext.createMediaElementSource(music);
    videoNode = audioContext.createMediaElementSource(ui.preview);
    musicNode.connect(audioContext.destination); musicNode.connect(mix);
    videoNode.connect(audioContext.destination); videoNode.connect(mix);
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
  songURL = URL.createObjectURL(file); music.src = songURL;
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
    ui.cameraLabel.textContent = 'Restart'; ready(); message('Camera ready.');
  } catch (e) { stream = null; ready(); error(e); }
}
ui.camera.onclick = startCamera;
async function setFacing(next) {
  if (next === facing) return;
  facing = next; updateCameraControls();
  if (stream) await startCamera();
}
ui.front.onclick = () => setFacing('user');
ui.back.onclick = () => setFacing('environment');
ui.mirror.onchange = updateCameraControls;
ui.resolution.onchange = ui.fps.onchange = () => { if (stream) startCamera(); };

updateCameraControls();
ui.record.onclick = async () => {
  try {
    if (!window.MediaRecorder) throw new Error('This browser does not support video recording.');
    stopDemo(); await audioSetup(); music.pause(); music.currentTime = 0;
    recordedMirrored = facing === 'user' && ui.mirror.checked;
    recordedFps = stream.getVideoTracks()[0].getSettings().frameRate || 30;
    ui.front.disabled = ui.back.disabled = ui.mirror.disabled = ui.resolution.disabled = ui.fps.disabled = ui.camera.disabled = true;
    chunks = []; recorder = new MediaRecorder(stream);
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onerror = e => error(e.error || new Error('Recording failed.'));
    recorder.onstop = () => {
      music.pause();
      ui.front.disabled = ui.back.disabled = ui.mirror.disabled = ui.resolution.disabled = ui.fps.disabled = ui.camera.disabled = false;
      if (!chunks.length) { message('No video was recorded. Please try again.'); return; }
      if (videoURL) URL.revokeObjectURL(videoURL);
      videoURL = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || 'video/mp4' }));
      ui.preview.src = videoURL; ui.preview.classList.toggle('mirrored', recordedMirrored); ui.setup.hidden = true; ui.review.hidden = false;
      ui.record.hidden = false; ui.stop.hidden = true; ready(); message('Preview your recording and adjust the music timing.');
    };
    recorder.start(250);
    const recordingStart = performance.now();
    await music.play();
    songStart = (performance.now() - recordingStart) / 1000;
    ui.record.hidden = true; ui.stop.hidden = false; message('Recording…');
  } catch (e) { if (recorder?.state === 'recording') recorder.stop(); else ui.front.disabled = ui.back.disabled = ui.mirror.disabled = ui.resolution.disabled = ui.fps.disabled = ui.camera.disabled = false; error(e); }
};
ui.stop.onclick = () => { if (recorder?.state === 'recording') recorder.stop(); };
ui.play.onclick = () => { if (ui.preview.paused) ui.preview.play().catch(error); else ui.preview.pause(); };
ui.preview.onplay = async () => { ui.play.textContent = '❚❚'; ui.play.setAttribute('aria-label', 'Pause video'); try { await audioSetup(); sync(); } catch (e) { error(e); } };
ui.preview.onpause = () => { stopSync(); ui.play.textContent = '▶'; ui.play.setAttribute('aria-label', 'Play video'); };
ui.preview.onseeked = () => { if (!ui.preview.paused) sync(); };
ui.preview.onended = stopSync;
ui.preview.ontimeupdate = () => { if (Number.isFinite(ui.preview.duration) && ui.preview.duration > 0) ui.seek.value = Math.round(ui.preview.currentTime / ui.preview.duration * 1000); const t = Math.floor(ui.preview.currentTime || 0); ui.playTime.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
ui.seek.oninput = () => { if (Number.isFinite(ui.preview.duration)) ui.preview.currentTime = Number(ui.seek.value) / 1000 * ui.preview.duration; };
ui.offset.oninput = () => { format(); if (!ui.preview.paused) sync(); };
ui.again.onclick = () => { stopSync(); ui.preview.pause(); ui.preview.removeAttribute('src'); ui.preview.load(); ui.review.hidden = true; ui.setup.hidden = false; ready(); message(''); };
ui.save.onclick = async () => {
  if (exporting) return;
  let exportRecorder, canvasStream, drawFrame;
  try {
    exporting = true; ui.save.disabled = true; ui.again.disabled = true; ui.offset.disabled = true; ui.play.disabled = ui.seek.disabled = true;
    await audioSetup();
    if (!ui.preview.videoWidth || !ui.preview.duration || !Number.isFinite(ui.preview.duration)) throw new Error('Video is not ready to save yet. Play the preview once and try again.');
    const canvas = document.createElement('canvas'); canvas.width = ui.preview.videoWidth; canvas.height = ui.preview.videoHeight;
    if (!canvas.captureStream) throw new Error('This browser cannot export video. Try a current version of Safari on iPhone.');
    const ctx = canvas.getContext('2d');
    if (recordedMirrored) ctx.setTransform(-1, 0, 0, 1, canvas.width, 0);
    canvasStream = canvas.captureStream(Math.min(60, recordedFps));
    mix.stream.getAudioTracks().forEach(track => canvasStream.addTrack(track));
    const candidates = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp8,opus','video/webm'];
    const mimeType = candidates.find(t => MediaRecorder.isTypeSupported(t));
    exportRecorder = mimeType ? new MediaRecorder(canvasStream, { mimeType }) : new MediaRecorder(canvasStream);
    const parts = [];
    const finished = new Promise((resolve, reject) => {
      exportRecorder.ondataavailable = e => { if (e.data.size) parts.push(e.data); };
      exportRecorder.onerror = e => reject(e.error || new Error('Export failed.'));
      exportRecorder.onstop = () => resolve(new Blob(parts, { type: exportRecorder.mimeType || 'video/mp4' }));
    });
    ui.preview.pause(); ui.preview.currentTime = 0;
    await new Promise(resolve => { if (ui.preview.readyState >= 2) resolve(); else ui.preview.addEventListener('loadeddata', resolve, { once: true }); });
    ctx.drawImage(ui.preview, 0, 0, canvas.width, canvas.height);
    exportRecorder.start(250);
    const draw = () => { if (!exporting || ui.preview.paused) return; ctx.drawImage(ui.preview, 0, 0, canvas.width, canvas.height); drawFrame = requestAnimationFrame(draw); };
    const ended = new Promise(resolve => ui.preview.addEventListener('ended', resolve, { once: true }));
    await ui.preview.play(); draw(); message('Saving in real time — keep this page open until it finishes.');
    await ended; exportRecorder.stop();
    const blob = await finished;
    if (!blob.size) throw new Error('The exported video is empty.');
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `recordance-${Date.now()}.${blob.type.includes('webm') ? 'webm' : 'mp4'}`;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    message('Export ready. Use the browser download or share sheet to save it to Photos.');
  } catch (e) { if (exportRecorder?.state === 'recording') exportRecorder.stop(); error(e); }
  finally { exporting = false; cancelAnimationFrame(drawFrame); canvasStream?.getVideoTracks().forEach(t => t.stop()); ui.save.disabled = false; ui.again.disabled = false; ui.offset.disabled = false; ui.play.disabled = ui.seek.disabled = false; }
};
format();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js?v=8').catch(console.warn);
