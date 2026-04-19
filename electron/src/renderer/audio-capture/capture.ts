// Hidden audio capture window — no UI.
// Two modes (selected by main process at window creation):
//   • push-to-talk: records between audio:start and audio:stop, sends one PCM buffer.
//   • voice-activation: Silero VAD (via @ricky0123/vad-web) runs continuously;
//     each detected utterance is sent to main as its own PCM buffer.
// RMS levels are emitted in both modes so the indicator can show a waveform.

import { MicVAD } from "@ricky0123/vad-web";

const TARGET_SAMPLE_RATE = 16000;

// ── push-to-talk state ───────────────────────────────────────────────────────

let ptMediaStream: MediaStream | null = null;
let ptAudioCtx: AudioContext | null = null;
let ptWorkletNode: AudioWorkletNode | null = null;
let ptChunks: Float32Array[] = [];

const workletCode = `
class PCMCollector extends AudioWorkletProcessor {
  constructor() { super(); this._tick = 0; }
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!ch) return true;
    this.port.postMessage({ t: 'c', d: ch.slice() });
    if (++this._tick % 4 === 0) {
      let sq = 0;
      for (let i = 0; i < ch.length; i++) sq += ch[i] * ch[i];
      this.port.postMessage({ t: 'l', rms: Math.sqrt(sq / ch.length) });
    }
    return true;
  }
}
registerProcessor('pcm-collector', PCMCollector);
`;

async function ptStart(deviceId: string | null) {
  ptChunks = [];
  ptMediaStream = await openMicStream(deviceId, {
    channelCount: 1,
    sampleRate: TARGET_SAMPLE_RATE,
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
  });
  ptAudioCtx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
  const blob = new Blob([workletCode], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  await ptAudioCtx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);

  const source = ptAudioCtx.createMediaStreamSource(ptMediaStream);
  ptWorkletNode = new AudioWorkletNode(ptAudioCtx, "pcm-collector");
  ptWorkletNode.port.onmessage = (e: MessageEvent<{ t: "c" | "l"; d?: Float32Array; rms?: number }>) => {
    if (e.data.t === "c") ptChunks.push(e.data.d!);
    else if (e.data.t === "l") window.echo.sendAudioLevel(e.data.rms!);
  };
  source.connect(ptWorkletNode);
  ptWorkletNode.connect(ptAudioCtx.destination);
}

function ptStop(): Uint8Array {
  ptWorkletNode?.disconnect();
  ptWorkletNode = null;
  ptMediaStream?.getTracks().forEach((t) => t.stop());
  ptMediaStream = null;
  ptAudioCtx?.close();
  ptAudioCtx = null;

  const totalLen = ptChunks.reduce((n, c) => n + c.length, 0);
  const merged = new Float32Array(totalLen);
  let offset = 0;
  for (const c of ptChunks) { merged.set(c, offset); offset += c.length; }
  ptChunks = [];

  return float32ToInt16Bytes(merged);
}

// ── voice-activation (Silero VAD) state ──────────────────────────────────────

let micVad: MicVAD | null = null;
let vadFrameCount = 0;
let vadMaxSpeechProb = 0;

async function openMicStream(
  deviceId: string | null,
  base: MediaTrackConstraints,
): Promise<MediaStream> {
  const constraints: MediaTrackConstraints = deviceId
    ? { ...base, deviceId: { exact: deviceId } }
    : base;
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: constraints });
  } catch (err) {
    // If the configured device is unplugged or no longer valid, fall back to
    // the OS default so transcription keeps working rather than dying silently.
    if (deviceId) {
      console.warn(`[audio-capture] device ${deviceId} unavailable (${err}); falling back to default`);
      return await navigator.mediaDevices.getUserMedia({ audio: base });
    }
    throw err;
  }
}

async function vadStart(deviceId: string | null) {
  if (micVad) {
    console.info("[audio-capture] VAD already running — ignoring enable");
    return;
  }

  console.info("[audio-capture] Starting Silero VAD …");

  // Watchdog: if MicVAD.new() doesn't resolve within 10s, log a warning so
  // we can tell whether it hung vs. failed silently.
  let vadResolved = false;
  setTimeout(() => {
    if (!vadResolved) console.warn("[audio-capture] MicVAD.new() has not resolved after 10s — likely hung");
  }, 10000);

  try {
    micVad = await MicVAD.new({
      model: "v5",
      baseAssetPath: "./",
      onnxWASMBasePath: "./",
      additionalAudioConstraints: deviceId ? { deviceId: { exact: deviceId } } : undefined,
      // Force single-threaded ORT. vad-web 0.0.30 bundles onnxruntime-web 1.24
      // which only ships threaded WASM; that spawns a Web Worker with
      // SharedArrayBuffer, which in Electron's file:// context hangs indefinitely
      // during worker handshake. Disabling threads is enough for a ~2 MB Silero
      // model — CPU cost is negligible.
      ortConfig: (ort) => {
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.proxy = false;
        ort.env.logLevel = "warning";
      },
      onFrameProcessed: (probs, frame) => {
        vadFrameCount++;
        const p = (probs as { isSpeech?: number }).isSpeech ?? 0;
        if (p > vadMaxSpeechProb) vadMaxSpeechProb = p;
        // Every ~100 frames (≈3s at 32ms/frame) dump a heartbeat so we can see
        // whether the VAD is actually receiving audio and what it thinks.
        if (vadFrameCount % 100 === 0) {
          console.info(`[audio-capture] VAD heartbeat frames=${vadFrameCount} lastProb=${p.toFixed(3)} max=${vadMaxSpeechProb.toFixed(3)}`);
        }
        if (!frame || frame.length === 0) return;
        let sq = 0;
        for (let i = 0; i < frame.length; i++) sq += frame[i] * frame[i];
        window.echo.sendAudioLevel(Math.sqrt(sq / frame.length));
      },
      onSpeechStart: () => {
        console.info("[audio-capture] VAD: speech start");
        window.echo.sendVadSpeechStart();
      },
      onSpeechEnd: (audio: Float32Array) => {
        console.info(`[audio-capture] VAD: speech end, ${audio.length} samples`);
        window.echo.sendAudioData(float32ToInt16Bytes(audio));
      },
      onVADMisfire: () => {
        console.info("[audio-capture] VAD misfire (too short)");
        window.echo.sendVadMisfire();
      },
    });
  } catch (err) {
    console.error("[audio-capture] MicVAD.new failed:", err);
    throw err;
  }
  vadResolved = true;

  micVad.start();
  console.info("[audio-capture] Silero VAD running — listening for speech");
}

function vadStop() {
  micVad?.pause();
  micVad?.destroy?.();
  micVad = null;
}

// ── shared helpers ───────────────────────────────────────────────────────────

function float32ToInt16Bytes(f32: Float32Array): Uint8Array {
  const pcm16 = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(f32[i] * 32767)));
  }
  return new Uint8Array(pcm16.buffer);
}

// ── IPC wiring ───────────────────────────────────────────────────────────────

window.echo.onAudioStart(async (deviceId) => {
  try {
    await ptStart(deviceId);
  } catch (err) {
    console.error("[audio-capture] push-to-talk start failed:", err);
  }
});

window.echo.onAudioStop(() => {
  try {
    const pcm = ptStop();
    window.echo.sendAudioData(pcm);
  } catch (err) {
    console.error("[audio-capture] push-to-talk stop failed:", err);
    window.echo.sendAudioData(new Uint8Array(0));
  }
});

console.info("[audio-capture] renderer script loaded, IPC handlers registered");

window.echo.onVadEnable(async (deviceId) => {
  console.info(`[audio-capture] onVadEnable fired (device=${deviceId ?? "default"})`);
  try {
    await vadStart(deviceId);
  } catch (err) {
    console.error("[audio-capture] VAD start failed:", err);
  }
});

window.echo.onVadDisable(() => {
  console.info("[audio-capture] onVadDisable fired");
  try { vadStop(); } catch (err) {
    console.error("[audio-capture] VAD stop failed:", err);
  }
});
