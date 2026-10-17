// Publicidad's render: each piece (hook, meat, CTA) is rendered once with the storyboard renderer (render.ts) as a
// one-shot board, cached, and the ads are cut from the cached files by copying their encoded packets into a new
// mp4, so 50 + 5 + 3 renders make up to 750 ads. Every piece shares resolution, fps, codec and an audio track
// (alwaysAudio), which is what makes the copy possible. If a copy fails, the ad is rendered whole as a fallback.
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  EncodedAudioPacketSource,
  EncodedPacket,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  Input,
  Mp4OutputFormat,
  Output,
} from "mediabunny";
import type { Piece } from "../../shared/ads.ts";
import { speakerDisclosure } from "../../shared/adsSpeaker.ts";
import type { Board, Brief, Shot } from "../../shared/schema.ts";
import { renderVideo, type DrawStyle, type RenderResult, type ShotMedia } from "./render.ts";
import { TARGET_LUFS } from "./motionAudio.ts";

export type PieceLook = { format: Brief["format"]; style: DrawStyle; disclosure: string; fullFrame: boolean; headlines: boolean };

// One shot per piece: its line as the subtitle, its headline on top; no speaker name (one presenter, no cast).
export function pieceShot(piece: Piece): Shot {
  return {
    title: piece.kind,
    action: "",
    topic: "T1",
    beat: piece.kind === "hook" ? "negative" : piece.kind === "meat" ? "touching" : "good",
    speaker: "none",
    voiceover: piece.text,
    onScreenText: piece.onScreenText,
    seconds: piece.seconds,
    setups: [],
    kind: "single",
    screen: "",
    screenAt: "",
    visualPrompt: piece.visualPrompt,
    middlePrompt: "",
    endPrompt: "",
    editFrom: 0,
    editPrompt: "",
    videoPrompt: piece.videoPrompt,
    toolSettings: "",
    disclosure: "none",
    timeline: [],
  };
}

export const pieceBoard = (pieces: Piece[]): Board => ({ style: "", setups: [], shots: pieces.map(pieceShot), issues: [] });

// A piece's media, plus how loud its clip plays (0: muted, for a character clip whose lips did not match).
export type PieceMedia = ShotMedia & { clipGain?: number };

// "Que lo diga un personaje": a piece said by a cast character with its clip in says so in the corner (the character,
// and its voice when the clip speaks, are AI-made); otherwise the look's notice. In a whole-ad render (one notice for
// all), any such piece sets it.
export function pieceDisclosure(pieces: Piece[], media: PieceMedia[], fallback: string): string {
  const said = pieces.map((p, i) => (p.speaker && media[i]?.clip ? p.speaker.sound : null)).filter((s) => s !== null);
  if (!said.length) return fallback;
  return speakerDisclosure(said.includes("clip") ? "clip" : "voice");
}

function options(look: PieceLook, pieces: Piece[], media: PieceMedia[]) {
  const count = pieces.length;
  const clipGain: Record<number, number> = {};
  media.forEach((m, i) => {
    if (typeof m?.clipGain === "number") clipGain[i] = m.clipGain;
  });
  return {
    format: look.format,
    disclosure: pieceDisclosure(pieces, media, look.disclosure),
    clipGain,
    fullFrame: look.fullFrame,
    keepSound: true,
    speakers: {},
    headlines: look.headlines,
    style: look.style,
    spoken: Array.from({ length: count }, () => true),
    musicVolume: 0,
    sfxVolume: 1,
    beatSync: false,
    alwaysAudio: true,
    // Every piece at the same loudness: a hook, a meat and a CTA rendered apart never jump in level at the cuts.
    loudness: TARGET_LUFS,
  };
}

export function renderPiece(piece: Piece, media: PieceMedia, look: PieceLook, onProgress: (f: number) => void): Promise<RenderResult> {
  return renderVideo(pieceBoard([piece]), { 0: media }, options(look, [piece], [media]), onProgress);
}

// The fallback: the whole ad in one render from the pieces' own media.
export function renderAdWhole(pieces: Piece[], media: Record<string, PieceMedia>, look: PieceLook, onProgress: (f: number) => void): Promise<RenderResult> {
  const list = pieces.map((p) => media[p.id] ?? {});
  return renderVideo(pieceBoard(pieces), Object.fromEntries(list.map((m, i) => [i, m])), options(look, pieces, list), onProgress);
}

const bytes = (a: AllowSharedBufferSource) =>
  a instanceof ArrayBuffer || a instanceof SharedArrayBuffer ? new Uint8Array(a as ArrayBuffer) : new Uint8Array(a.buffer as ArrayBuffer, a.byteOffset, a.byteLength);
const same = (a: AllowSharedBufferSource | undefined, b: AllowSharedBufferSource | undefined) => {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const x = bytes(a);
  const y = bytes(b);
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

// Cuts the pieces together without decoding: their packets, shifted in time, into one mp4. Throws when the pieces
// were not encoded alike (then the caller renders the ad whole).
export async function concatPieces(blobs: Blob[]): Promise<Blob> {
  if (!blobs.length) throw new Error("No hay piezas para unir.");
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
  let video: EncodedVideoPacketSource | null = null;
  let audio: EncodedAudioPacketSource | null = null;
  let videoConfig: VideoDecoderConfig | null = null;
  let audioConfig: AudioDecoderConfig | null = null;
  let offset = 0;
  for (const blob of blobs) {
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    try {
      const vt = await input.getPrimaryVideoTrack();
      if (!vt || !vt.codec) throw new Error("Una pieza no tiene video legible.");
      const at = await input.getPrimaryAudioTrack();
      const vc = await vt.getDecoderConfig();
      const ac = at ? await at.getDecoderConfig() : null;
      if (!video) {
        video = new EncodedVideoPacketSource(vt.codec);
        output.addVideoTrack(video, { frameRate: 30 });
        if (at?.codec) {
          audio = new EncodedAudioPacketSource(at.codec);
          output.addAudioTrack(audio);
        }
        await output.start();
        videoConfig = vc;
        audioConfig = ac;
      } else {
        if (!vc || !videoConfig || vc.codec !== videoConfig.codec || vc.codedWidth !== videoConfig.codedWidth || vc.codedHeight !== videoConfig.codedHeight || !same(vc.description, videoConfig.description)) {
          throw new Error("Las piezas no se codificaron igual.");
        }
        if (Boolean(audio) !== Boolean(at) || (ac && audioConfig && (ac.codec !== audioConfig.codec || ac.sampleRate !== audioConfig.sampleRate || ac.numberOfChannels !== audioConfig.numberOfChannels))) {
          throw new Error("El sonido de las piezas no se codificó igual.");
        }
      }
      const duration = await input.computeDuration();
      let first = true;
      for await (const p of new EncodedPacketSink(vt).packets()) {
        if (p.timestamp >= duration) break;
        const shifted = new EncodedPacket(p.data, p.type, p.timestamp + offset, Math.min(p.duration, Math.max(duration - p.timestamp, 0)), p.sequenceNumber);
        await video.add(shifted, first && vc ? { decoderConfig: vc } : undefined);
        first = false;
      }
      if (audio && at) {
        let firstA = true;
        for await (const p of new EncodedPacketSink(at).packets()) {
          if (p.timestamp >= duration) break;
          const shifted = new EncodedPacket(p.data, p.type, p.timestamp + offset, p.duration, p.sequenceNumber);
          await audio.add(shifted, firstA && ac ? { decoderConfig: ac } : undefined);
          firstA = false;
        }
      }
      offset += duration;
    } finally {
      input.dispose();
    }
  }
  await output.finalize();
  return new Blob([output.target.buffer!], { type: "video/mp4" });
}
