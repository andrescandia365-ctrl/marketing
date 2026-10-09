export type ProbeStream = { codec_type?: string; nb_read_packets?: string; duration?: string; width?: number; height?: number; pix_fmt?: string };
export function probeStreams(file: string, run: (cmd: string, args: string[]) => { status: number | null; stdout: string }): ProbeStream[] | null;
export function checkStreams(streams: ProbeStream[], want: { frames: number; fps: number; width: number; height: number; sound: boolean }): string[];
