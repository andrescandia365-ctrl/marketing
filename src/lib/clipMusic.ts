// Reads an uploaded clip's sound once, offline, and says whether it seems to carry music (`shared/musicLike.ts`).
// Null when the clip has no sound track or the browser cannot decode it: then nothing is said.
import { ANALYSIS_RATE, likelyMusic, musicFeatures, type MusicFeatures } from "../../shared/musicLike.ts";

export async function clipMusic(blob: Blob): Promise<{ music: boolean; features: MusicFeatures } | null> {
  let buffer: AudioBuffer;
  try {
    // Decoding into a context at the analysis rate resamples the sound to it.
    buffer = await new OfflineAudioContext(1, 1, ANALYSIS_RATE).decodeAudioData(await blob.arrayBuffer());
  } catch {
    return null;
  }
  if (!buffer.length || !buffer.numberOfChannels) return null;
  const mono = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < mono.length; i++) mono[i] += data[i] / buffer.numberOfChannels;
  }
  const features = musicFeatures(mono, buffer.sampleRate);
  return { music: likelyMusic(features), features };
}
