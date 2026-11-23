/** Copy the song portion belonging to this output chunk, leaving silence outside it. */
export function copyTimedAudio(song, chunk, position, shift, songOffset) {
  const inputStart = songOffset + Math.max(0, position - shift);
  const outputStart = Math.max(0, shift - position);
  const count = Math.min(chunk.length - outputStart, song.length - inputStart);
  if (count <= 0) return;
  for (let channel = 0; channel < chunk.numberOfChannels; channel++) {
    chunk.getChannelData(channel).set(song.getChannelData(channel).subarray(inputStart, inputStart + count), outputStart);
  }
}
