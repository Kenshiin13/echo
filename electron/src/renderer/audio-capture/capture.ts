// Hidden audio capture window — no UI.
// Records 16 kHz mono PCM via getUserMedia + AudioWorklet,
// then sends raw 16-bit PCM to main as a Uint8Array (structured-clone, no base64).
// Also emits throttled RMS levels so the indicator can show a live waveform.

const TARGET_SAMPLE_RATE = 16000;

let mediaStream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let workletNode: AudioWorkletNode | null = null;
let chunks: Float32Array[] = [];

// Worklet computes RMS every 4 chunks (~32ms at 16kHz) alongside collecting PCM.
const workletCode = `
class PCMCollector extends AudioWorkletProcessor {
  constructor() { super(); this._tick = 0; }
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!ch) return true;
    // Always store the chunk for later encoding
    this.port.postMessage({ t: 'c', d: ch.slice() });
    // Throttle level to ~30 fps (every 4 batches of 128 samples at 16kHz ≈ 32ms)
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

async function startCapture() {
  chunks = [];

  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      sampleRate: TARGET_SAMPLE_RATE,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });

  audioCtx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });

  const blob = new Blob([workletCode], { type: "application/javascript" });
  const url = URL.createObjectURL(blob);
  await audioCtx.audioWorklet.addModule(url);
  URL.revokeObjectURL(url);

  const source = audioCtx.createMediaStreamSource(mediaStream);
  workletNode = new AudioWorkletNode(audioCtx, "pcm-collector");

  workletNode.port.onmessage = (e: MessageEvent<{ t: "c" | "l"; d?: Float32Array; rms?: number }>) => {
    if (e.data.t === "c") {
      chunks.push(e.data.d!);
    } else if (e.data.t === "l") {
      window.echo.sendAudioLevel(e.data.rms!);
    }
  };

  source.connect(workletNode);
  workletNode.connect(audioCtx.destination);
}

function stopCapture(): Uint8Array {
  workletNode?.disconnect();
  workletNode = null;

  mediaStream?.getTracks().forEach((t) => t.stop());
  mediaStream = null;

  audioCtx?.close();
  audioCtx = null;

  // Merge chunks
  const totalLen = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Float32Array(totalLen);
  let offset = 0;
  for (const c of chunks) { merged.set(c, offset); offset += c.length; }
  chunks = [];

  // Float32 → Int16
  const pcm16 = new Int16Array(merged.length);
  for (let i = 0; i < merged.length; i++) {
    pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(merged[i] * 32767)));
  }

  return new Uint8Array(pcm16.buffer);
}

window.echo.onAudioStart(async () => {
  try {
    await startCapture();
  } catch (err) {
    console.error("[audio-capture] start failed:", err);
  }
});

window.echo.onAudioStop(() => {
  try {
    const pcm = stopCapture();
    window.echo.sendAudioData(pcm);
  } catch (err) {
    console.error("[audio-capture] stop failed:", err);
    window.echo.sendAudioData(new Uint8Array(0)); // filtered as too-short in main
  }
});
