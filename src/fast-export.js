import { ALL_FORMATS, AudioBufferSource, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output, QUALITY_HIGH, canEncodeAudio } from 'mediabunny';
import { copyTimedAudio } from './audio-timing.js';

/** Assemble audio and the recorded video without waiting for playback. */
export async function exportRecording({ video, song, duration, delay, startOffset = 0, mirrored, onProgress, signal }) {
  signal?.throwIfAborted();
  if (!window.AudioEncoder || !window.VideoDecoder || !(await canEncodeAudio('aac'))) {
    throw new Error('Fast export needs AAC encoding and WebCodecs. Update iOS and Safari to version 26 or later.');
  }
  signal?.throwIfAborted();
  const context = new AudioContext();
  let input, output, conversion, cancelPromise;
  const cancel = () => { cancelPromise = Promise.allSettled([conversion?.cancel(), output?.cancel()]); };
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    onProgress('Preparing music…');
    const songData = await song.arrayBuffer();
    signal?.throwIfAborted();
    const songBuffer = await context.decodeAudioData(songData);
    signal?.throwIfAborted();
    input = new Input({ formats: ALL_FORMATS, source: new BlobSource(video) });
    const target = new BufferTarget();
    output = new Output({ format: new Mp4OutputFormat(), target });
    conversion = await Conversion.init({
      input, output, composable: true,
      audio: { discard: true },
      video: { flip: mirrored, allowTransformationMetadata: !mirrored, codec: 'avc', quality: QUALITY_HIGH },
    });
    signal?.throwIfAborted();
    if (!conversion.isValid || !conversion.utilizedTracks.length) throw new Error('This recording format cannot be exported on this device.');
    const audio = new AudioBufferSource({ codec: 'aac', bitrate: 192000 });
    output.addAudioTrack(audio);
    await output.start();
    const rate = songBuffer.sampleRate;
    const total = Math.ceil(duration * rate);
    const channels = Math.min(songBuffer.numberOfChannels, 2);
    const shift = Math.round(delay * rate);
    const songOffset = Math.max(0, Math.round(startOffset * rate));
    for (let pos = 0; pos < total; pos += rate) {
      signal?.throwIfAborted();
      const length = Math.min(rate, total - pos);
      const chunk = context.createBuffer(channels, length, rate);
      copyTimedAudio(songBuffer, chunk, pos, shift, songOffset);
      onProgress(`Saving… ${Math.min(99, Math.round(pos / total * 100))}%`);
      await Promise.all([audio.add(chunk), conversion.execute({ until: (pos + length) / rate })]);
    }
    signal?.throwIfAborted();
    audio.close();
    if (conversion.state !== 'done') await conversion.execute();
    await output.finalize();
    signal?.throwIfAborted();
    return new Blob([target.buffer], { type: 'video/mp4' });
  } finally {
    signal?.removeEventListener('abort', cancel);
    if (cancelPromise) await cancelPromise;
    if (signal?.aborted) {
      if (conversion && conversion.state !== 'canceled' && conversion.state !== 'done') await conversion.cancel().catch(() => {});
      if (output && output.state !== 'canceled' && output.state !== 'finalized') await output.cancel().catch(() => {});
    }
    input?.dispose();
    await context.close();
  }
}

/** Make a seekable MP4 preview without decoding or re-encoding the video. */
export async function preparePreview(video) {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(video) });
  try {
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
    const conversion = await Conversion.init({ input, output, audio: { discard: true }, copy: { mode: 'forced' } });
    if (!conversion.isValid || !conversion.utilizedTracks.length) throw new Error('Recording cannot be remuxed for preview.');
    await conversion.execute();
    if (!target.buffer?.byteLength) throw new Error('The prepared preview is empty.');
    return new Blob([target.buffer], { type: 'video/mp4' });
  } finally {
    input.dispose();
  }
}
