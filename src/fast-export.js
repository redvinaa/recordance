import { ALL_FORMATS, AudioBufferSource, BlobSource, BufferTarget, Conversion, Input, Mp4OutputFormat, Output, QUALITY_HIGH, canEncodeAudio } from 'mediabunny';

/** Assemble audio and the recorded video without waiting for playback. */
export async function exportRecording({ video, song, duration, delay, mirrored, onProgress }) {
  if (!window.AudioEncoder || !window.VideoDecoder || !(await canEncodeAudio('aac'))) {
    throw new Error('Fast export needs AAC encoding and WebCodecs. Update iOS and Safari to version 26 or later.');
  }
  const context = new AudioContext();
  let input;
  try {
    onProgress('Preparing music…');
    const songBuffer = await context.decodeAudioData(await song.arrayBuffer());
    input = new Input({ formats: ALL_FORMATS, source: new BlobSource(video) });
    const target = new BufferTarget();
    const output = new Output({ format: new Mp4OutputFormat(), target });
    const conversion = await Conversion.init({
      input, output, composable: true,
      audio: { discard: true },
      video: { flip: mirrored, allowTransformationMetadata: !mirrored, codec: 'avc', quality: QUALITY_HIGH },
    });
    if (!conversion.isValid || !conversion.utilizedTracks.length) throw new Error('This recording format cannot be exported on this device.');
    const audio = new AudioBufferSource({ codec: 'aac', bitrate: 192000 });
    output.addAudioTrack(audio);
    await output.start();
    const rate = songBuffer.sampleRate;
    const total = Math.ceil(duration * rate);
    const channels = Math.min(songBuffer.numberOfChannels, 2);
    const shift = Math.round(delay * rate);
    for (let pos = 0; pos < total; pos += rate) {
      const length = Math.min(rate, total - pos);
      const chunk = context.createBuffer(channels, length, rate);
      const inputStart = Math.max(0, pos - shift);
      const outputStart = Math.max(0, shift - pos);
      const count = Math.min(length - outputStart, songBuffer.length - inputStart);
      if (count > 0) for (let ch = 0; ch < channels; ch++) {
        chunk.getChannelData(ch).set(songBuffer.getChannelData(ch).subarray(inputStart, inputStart + count), outputStart);
      }
      onProgress(`Saving… ${Math.min(99, Math.round(pos / total * 100))}%`);
      await Promise.all([audio.add(chunk), conversion.execute({ until: (pos + length) / rate })]);
    }
    audio.close();
    if (conversion.state !== 'done') await conversion.execute();
    await output.finalize();
    return new Blob([target.buffer], { type: 'video/mp4' });
  } finally {
    input?.dispose();
    await context.close();
  }
}
