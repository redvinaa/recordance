import test from 'node:test';
import assert from 'node:assert/strict';
import { copyTimedAudio } from '../src/audio-timing.js';

function buffer(channels) {
  return { numberOfChannels: channels.length, length: channels[0].length, getChannelData: channel => channels[channel] };
}

test('export chunks match the preview timeline for early and late music', () => {
  const rate = 10, songLength = 27, duration = 50;
  const song = buffer([Float32Array.from({ length: songLength }, (_, i) => i + 1), Float32Array.from({ length: songLength }, (_, i) => i + 101)]);
  // Include a selected song start, offsets spanning chunks, and the song's end.
  for (const startOffset of [0, 7, 26, 27]) for (const shift of [-13, -3, 0, 3, 13]) {
    const output = [new Float32Array(duration), new Float32Array(duration)];
    for (let position = 0; position < duration; position += rate) {
      const chunk = buffer(output.map(channel => channel.subarray(position, Math.min(position + rate, duration))));
      copyTimedAudio(song, chunk, position, shift, startOffset);
    }
    for (let position = 0; position < duration; position++) {
      const elapsed = position - shift;
      const songPosition = startOffset + elapsed;
      for (let channel = 0; channel < output.length; channel++) {
        const expected = elapsed >= 0 && songPosition < songLength ? song.getChannelData(channel)[songPosition] : 0;
        assert.equal(output[channel][position], expected, `shift=${shift}, start=${startOffset}, sample=${position}, channel=${channel}`);
      }
    }
  }
});
