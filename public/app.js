const $ = id => document.getElementById(id);
const ui = Object.fromEntries(['song','songName','camera','mic','live','record','stop','setup','review','preview','offset','offsetValue','save','again','status'].map(id => [id, $(id)]));
let stream, recorder, chunks = [], videoURL, songURL, songStart = 0, animation, exporting = false;
let audioContext, musicNode, videoNode, mix;
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
function sync(force = false) {
  const target = ui.preview.currentTime - songStart - offset();
  if (target < 0 || target >= music.duration) { music.pause(); }
  else {
    if (force || Math.abs(music.currentTime - target) > 0.18) music.currentTime = target;
    if (!ui.preview.paused && music.paused) music.play().catch(error);
  }
  if (!ui.preview.paused) animation = requestAnimationFrame(() => sync());
}
ui.song.onchange = () => {
  const file = ui.song.files[0]; if (!file) return;
  if (songURL) URL.revokeObjectURL(songURL);
  songURL = URL.createObjectURL(file); music.src = songURL;
  ui.songName.textContent = file.name; ready(); message('');
};
ui.camera.onclick = async () => {
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access needs HTTPS or localhost. See the README for iPhone setup.');
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: ui.mic.checked });
    ui.live.srcObject = stream; await ui.live.play();
    ui.camera.textContent = 'Restart camera'; ready(); message('Camera ready.');
  } catch (e) { stream = null; ready(); error(e); }
};
ui.mic.onchange = () => { if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; ui.live.srcObject = null; ready(); message('Restart the camera to change microphone settings.'); } };
ui.record.onclick = async () => {
  try {
    if (!window.MediaRecorder) throw new Error('This browser does not support video recording.');
    await audioSetup(); music.pause(); music.currentTime = 0;
    chunks = []; recorder = new MediaRecorder(stream);
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onerror = e => error(e.error || new Error('Recording failed.'));
    recorder.onstop = () => {
      music.pause();
      if (!chunks.length) { message('No video was recorded. Please try again.'); return; }
      if (videoURL) URL.revokeObjectURL(videoURL);
      videoURL = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || 'video/mp4' }));
      ui.preview.src = videoURL; ui.setup.hidden = true; ui.review.hidden = false;
      ui.record.hidden = false; ui.stop.hidden = true; ready(); message('Preview your recording and adjust the music timing.');
    };
    recorder.start(250);
    const recordingStart = performance.now();
    await music.play();
    songStart = (performance.now() - recordingStart) / 1000;
    ui.record.hidden = true; ui.stop.hidden = false; message('Recording…');
  } catch (e) { if (recorder?.state === 'recording') recorder.stop(); error(e); }
};
ui.stop.onclick = () => { if (recorder?.state === 'recording') recorder.stop(); };
ui.preview.onplay = async () => { try { await audioSetup(); stopSync(); sync(true); } catch (e) { error(e); } };
ui.preview.onpause = stopSync;
ui.preview.onseeked = () => { if (!ui.preview.paused) { stopSync(); sync(true); } };
ui.preview.onended = stopSync;
ui.offset.oninput = () => { format(); if (!ui.preview.paused) { stopSync(); sync(true); } };
ui.again.onclick = () => { stopSync(); ui.preview.pause(); ui.preview.removeAttribute('src'); ui.preview.load(); ui.review.hidden = true; ui.setup.hidden = false; ready(); message(''); };
ui.save.onclick = async () => {
  if (exporting) return;
  let exportRecorder, canvasStream, drawFrame;
  try {
    exporting = true; ui.save.disabled = true; ui.again.disabled = true; ui.offset.disabled = true; ui.preview.controls = false;
    await audioSetup();
    if (!ui.preview.videoWidth || !ui.preview.duration || !Number.isFinite(ui.preview.duration)) throw new Error('Video is not ready to save yet. Play the preview once and try again.');
    const canvas = document.createElement('canvas'); canvas.width = ui.preview.videoWidth; canvas.height = ui.preview.videoHeight;
    if (!canvas.captureStream) throw new Error('This browser cannot export video. Try a current version of Safari on iPhone.');
    const ctx = canvas.getContext('2d'); canvasStream = canvas.captureStream(30);
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
  finally { exporting = false; cancelAnimationFrame(drawFrame); canvasStream?.getVideoTracks().forEach(t => t.stop()); ui.save.disabled = false; ui.again.disabled = false; ui.offset.disabled = false; ui.preview.controls = true; }
};
format();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(console.warn);
