// Demucs, the stem splitter the person installs on their own computer: where the app uses it, when it is worth
// turning on, and how to install it. "Modelos → Demucs" shows this; the studios show the one line that applies.

export type DemucsUse = { where: string; when: string; how: string };

export const DEMUCS_USES: DemucsUse[] = [
  {
    where: "Videos de letra → Sincronizar automático",
    when: "Cuando la música tapa la voz y la transcripción deja muchas palabras sin escuchar. La app te avisa si encontró menos del 70 % de la letra.",
    how: "Tildá «Escuchar solo la voz (Demucs)»: la transcripción escucha la voz separada.",
  },
  {
    where: "Videos de letra → Reloj",
    when: "Cuando no tenés los stems del tema. Si quien lo produjo te pasa la batería y la voz, subilas: son más exactas que cualquier separación.",
    how: "Sin stem de batería, «Armar reloj» separa el tema: la batería para el kick y la voz para las palabras.",
  },
  {
    where: "Explicativos con música propia",
    when: "Cuando usás tu propio tema y querés que los cortes caigan en el bombo. Con la música que arma la app no hace falta: su grilla ya se conoce.",
    how: "En Música, «Separar la batería con Demucs».",
  },
];

export const DEMUCS_NOT_NEEDED: string[] = [
  "Historias: el tema solo acerca los cortes a sus golpes y alcanza con el tema entero.",
  "Narraciones importadas y voces generadas: ya son solo voz.",
  "Publicidad: los clips se transcriben con la música de fondo; si un clip sale mal, pegá el texto a mano.",
];

export const DEMUCS_COST =
  "Instalado pesa unos 2 GB (PyTorch). La primera separación baja el modelo. Sin placa de video, un tema tarda unos minutos; cada tema se separa una sola vez y queda guardado en proyectos/.demucs.";

// Install in its own Python environment and point the app at it. With `demucs` already on the PATH (e.g. pipx),
// nothing goes in .env.
export const DEMUCS_INSTALL = [
  "python3 -m venv ~/demucs",
  '~/demucs/bin/pip install demucs soundfile "torchaudio<2.9"',
];
export const DEMUCS_ENV = "DEMUCS_BIN=~/demucs/bin/demucs";
// Newer torchaudio saves through TorchCodec, which Demucs does not install; on a Python too new for the pin, this.
export const DEMUCS_INSTALL_NEWER = "~/demucs/bin/pip install demucs soundfile torchcodec";

// The lyric sync heard too little of the lyrics: the music is probably covering the voice.
export const VOICE_STEM_SHARE = 0.7;
export function voiceStemHelps(matched: number, total: number): boolean {
  return total >= 8 && matched / total < VOICE_STEM_SHARE;
}
