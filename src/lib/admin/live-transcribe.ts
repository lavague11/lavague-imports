// Streaming speech-to-text for live invoice voice entry (OpenAI Realtime).
//
// Mints a short-lived transcription token from our server, opens a browser
// WebSocket to gpt-live-transcribe, streams mic audio as PCM16/24kHz, and surfaces
// partial (delta) and finalized (per-commit) transcript segments. gpt-live-transcribe
// has no server VAD, so this does client-side VAD and commits each utterance itself.
//
// All the OpenAI-specific protocol lives here; the caller just reacts to text. If a
// session can't be established, start() returns false so the caller can fall back to
// the chunked record→/transcribe path.

export interface LiveTranscriberEvents {
  /** The growing transcript of the segment currently being spoken. */
  onPartial: (text: string) => void;
  /** A finalized segment (after a pause/commit) — ready to match. */
  onSegment: (text: string) => void;
  /** A recoverable error: (message to show, phrase to speak). */
  onError: (shown: string, spoken: string) => void;
  /** OPENAI_API_KEY isn't configured on the server. */
  onConfigError?: () => void;
}

const WS_URL = "wss://api.openai.com/v1/realtime?intent=transcription";
const TARGET_RATE = 24000; // OpenAI transcription input: 16-bit PCM, 24kHz, mono
const SILENCE_MS = 650; // a pause this long after speech → commit the segment
const MAX_SEGMENT_MS = 8000; // commit long continuous speech so items don't wait
const VAD_RMS = 0.015; // frame RMS above this counts as speech

type Json = Record<string, unknown>;

export class LiveTranscriber {
  private ev: LiveTranscriberEvents;
  private ws: WebSocket | null = null;
  private ac: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private sink: GainNode | null = null;
  private src: MediaStreamAudioSourceNode | null = null;
  private running = false;
  private speaking = false;
  private lastVoice = 0;
  private segStart = 0;
  private hasAudioSinceCommit = false;
  private partial = "";

  constructor(ev: LiveTranscriberEvents) {
    this.ev = ev;
  }

  /** Open a realtime session and start streaming `stream`. Returns false if the
   *  session couldn't be set up (caller should fall back to chunked capture). */
  async start(stream: MediaStream): Promise<boolean> {
    let token: string | null = null;
    try {
      const r = await fetch("/admin/invoices/voice/realtime-token", { method: "POST" });
      const j = (await r.json()) as Json;
      if (j.configured === false) {
        this.ev.onConfigError?.();
        return false;
      }
      token = typeof j.token === "string" ? j.token : null;
    } catch {
      token = null;
    }
    if (!token) return false;

    const opened = await this.openWs(token);
    if (!opened) return false;

    try {
      await this.startCapture(stream);
    } catch {
      this.stop();
      return false;
    }
    this.running = true;
    return true;
  }

  private openWs(token: string): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      let ws: WebSocket;
      try {
        ws = new WebSocket(WS_URL, ["realtime", "openai-insecure-api-key." + token]);
      } catch {
        resolve(false);
        return;
      }
      this.ws = ws;
      const to = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      }, 6000);
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "session.update",
            session: {
              type: "transcription",
              audio: {
                input: {
                  format: { type: "audio/pcm", rate: TARGET_RATE },
                  transcription: { model: "gpt-live-transcribe" },
                  turn_detection: null,
                },
              },
            },
          }),
        );
        if (!settled) {
          settled = true;
          clearTimeout(to);
          resolve(true);
        }
      };
      ws.onmessage = (m) => this.onMessage(m);
      ws.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(to);
          resolve(false);
        }
      };
      ws.onclose = () => {
        if (this.running) this.ev.onError("Live connection dropped — tap to retry.", "Connection dropped.");
      };
    });
  }

  private onMessage(m: MessageEvent) {
    let d: Json;
    try {
      d = JSON.parse(typeof m.data === "string" ? m.data : "") as Json;
    } catch {
      return;
    }
    const t = typeof d.type === "string" ? d.type : "";
    if (t === "conversation.item.input_audio_transcription.delta") {
      if (typeof d.delta === "string") {
        this.partial += d.delta;
        this.ev.onPartial(this.partial.trim());
      }
    } else if (t === "conversation.item.input_audio_transcription.completed") {
      const text = (typeof d.transcript === "string" ? d.transcript : "").trim();
      this.partial = "";
      if (text) this.ev.onSegment(text);
    } else if (t === "conversation.item.input_audio_transcription.failed") {
      this.partial = "";
      this.ev.onError("Transcription failed — keep talking.", "Transcription failed.");
    }
  }

  private async startCapture(stream: MediaStream) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error("no AudioContext");
    const ac = new Ctor({ sampleRate: TARGET_RATE });
    this.ac = ac;
    if (ac.state === "suspended") {
      try {
        await ac.resume();
      } catch {
        /* ignore */
      }
    }
    const ratio = ac.sampleRate / TARGET_RATE; // >1 when the context runs faster than 24k

    // Inline AudioWorklet (blob URL) that forwards each Float32 frame to the main
    // thread. A zero-gain sink keeps the graph "pulled" without audible feedback.
    const code =
      "class Cap extends AudioWorkletProcessor{process(i){const c=i[0]&&i[0][0];if(c&&c.length)this.port.postMessage(c.slice(0));return true}}registerProcessor('cap',Cap);";
    const url = URL.createObjectURL(new Blob([code], { type: "application/javascript" }));
    await ac.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);

    const src = ac.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ac, "cap");
    const sink = ac.createGain();
    sink.gain.value = 0;
    src.connect(node);
    node.connect(sink);
    sink.connect(ac.destination);
    this.src = src;
    this.node = node;
    this.sink = sink;

    this.segStart = Date.now();
    this.lastVoice = Date.now();
    node.port.onmessage = (e) => this.onFrames(e.data as Float32Array, ratio);
  }

  private onFrames(frame: Float32Array, ratio: number) {
    if (!this.running || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    let sum = 0;
    for (let i = 0; i < frame.length; i += 1) sum += frame[i] * frame[i];
    const rms = Math.sqrt(sum / Math.max(1, frame.length));
    const now = Date.now();
    if (rms > VAD_RMS) {
      this.speaking = true;
      this.lastVoice = now;
    }

    const pcm = toPcm16(frame, ratio);
    if (pcm.length) {
      this.appendPcm(pcm);
      this.hasAudioSinceCommit = true;
    }

    const silence = now - this.lastVoice;
    if (
      this.hasAudioSinceCommit &&
      ((this.speaking && silence > SILENCE_MS) || now - this.segStart > MAX_SEGMENT_MS)
    ) {
      this.commit();
    }
  }

  private appendPcm(pcm: Int16Array) {
    const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    let bin = "";
    const CH = 0x2000;
    for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode(...bytes.subarray(i, i + CH));
    try {
      this.ws?.send(JSON.stringify({ type: "input_audio_buffer.append", audio: btoa(bin) }));
    } catch {
      /* ignore a transient send failure */
    }
  }

  private commit() {
    if (!this.hasAudioSinceCommit) return;
    try {
      this.ws?.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    } catch {
      /* ignore */
    }
    this.hasAudioSinceCommit = false;
    this.speaking = false;
    this.segStart = Date.now();
  }

  /** Stop streaming: flush a final segment, tear down audio, close the socket. */
  stop() {
    this.running = false;
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.hasAudioSinceCommit) {
      try {
        this.ws.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
      } catch {
        /* ignore */
      }
    }
    try {
      this.src?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      this.node?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      this.sink?.disconnect();
    } catch {
      /* ignore */
    }
    try {
      void this.ac?.close();
    } catch {
      /* ignore */
    }
    const ws = this.ws;
    // Give a trailing commit's "completed" a moment to arrive before closing.
    setTimeout(() => {
      try {
        ws?.close();
      } catch {
        /* ignore */
      }
    }, 450);
    this.ws = null;
    this.ac = null;
    this.node = null;
    this.sink = null;
    this.src = null;
  }
}

/** Convert a Float32 frame to Int16 PCM, resampling to 24kHz when the source rate
 *  differs (ratio = sourceRate / 24000). Linear interpolation is plenty for speech. */
function toPcm16(frame: Float32Array, ratio: number): Int16Array {
  const clamp = (s: number) => (s < -1 ? -1 : s > 1 ? 1 : s);
  if (Math.abs(ratio - 1) < 0.01) {
    const out = new Int16Array(frame.length);
    for (let i = 0; i < frame.length; i += 1) {
      const s = clamp(frame[i]);
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }
  const outLen = Math.max(0, Math.floor(frame.length / ratio));
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i += 1) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const a = frame[i0] ?? 0;
    const b = frame[i0 + 1] ?? a;
    const s = clamp(a + (b - a) * frac);
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}
