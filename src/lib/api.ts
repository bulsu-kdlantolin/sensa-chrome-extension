/**
 * @file api.ts
 * @description Client-side WebSocket bridge for streaming raw PCM audio to the Sensa backend for real-time speech-to-text transcription.
 *
 * Architectural Overview:
 * 1. Audio Playback & Sink Routing:
 *    - Captures media stream from Chrome tab capture and routes it through an HTML5 `<audio>` element so the user continues hearing tab audio without interruption.
 *    - Respects custom audio output sink device preferences (`setSinkId`) stored in `sensa_auditory_settings`.
 *
 * 2. PCM Audio Processing & WebSocket Streaming:
 *    - Uses `AudioContext` and `ScriptProcessorNode` (with a zero-gain sink to prevent feedback loops) to extract raw Float32 audio samples.
 *    - Downsamples Float32 to 16-bit PCM and streams binary buffers over WebSocket (`STT_WS_URL`) to the Node.js translation proxy.
 */

export interface STTConnection {
  socket: WebSocket | null
  close: () => void
}

const STT_WS_URL = "wss://sensa-chrome-extension-backend.onrender.com"

export function connectToLocalServer(
  mediaStream: MediaStream,
  audioCtx: AudioContext,
  onTranscript: (text: string) => void
): STTConnection {
  const socket = new WebSocket(STT_WS_URL)

  let isClosed = false
  let processor: ScriptProcessorNode | null = null
  let audioEl: HTMLAudioElement | null = null

  socket.addEventListener("open", () => {
    console.log("Connected to Sensa STT backend")

    // 1. Audio Playback Bridge: Play captured audio via HTML5 Audio element to preserve user listening experience
    audioEl = new Audio()
    audioEl.srcObject = mediaStream
    // Try to apply saved output device
    try {
      chrome.storage.local.get(["sensa_auditory_settings"], async (res) => {
        try {
          const cfg = res?.sensa_auditory_settings
          const deviceId = cfg?.outputDevice
          if (deviceId && deviceId !== "default" && typeof (audioEl as any).setSinkId === "function") {
            await (audioEl as any).setSinkId(deviceId)
          }
        } catch {}
        audioEl!.play().catch(console.error)
      })
    } catch (err) {
      audioEl.play().catch(console.error)
    }

    // 2. PCM Extraction: Tap audio stream for speech-to-text processing
    const source = audioCtx.createMediaStreamSource(mediaStream)
    processor = audioCtx.createScriptProcessor(4096, 1, 1)

    // 3. Feedback Prevention: Connect processor through a zero-gain node to satisfy Web Audio API routing rules without echo
    const silentGain = audioCtx.createGain()
    silentGain.gain.value = 0 

    source.connect(processor)
    processor.connect(silentGain)
    silentGain.connect(audioCtx.destination)

    // 4. PCM Streaming: Convert float32 audio samples to 16-bit PCM and transmit over WebSocket
    processor.onaudioprocess = (e) => {
      if (isClosed || socket.readyState !== WebSocket.OPEN) return
      const float32Array = e.inputBuffer.getChannelData(0)
      const int16Array = new Int16Array(float32Array.length)
      for (let i = 0; i < float32Array.length; i++) {
        let s = Math.max(-1, Math.min(1, float32Array[i]))
        int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff
      }
      socket.send(int16Array.buffer)
    }
  })

  socket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(event.data)
      if (payload.type === "TRANSCRIPT" && payload.text) {
        onTranscript(payload.text)
      }
    } catch (err) {}
  })

  socket.addEventListener("error", () => console.error("STT WS Error"))
  
  return {
    socket,
    close: () => {
      isClosed = true
      if (processor) processor.disconnect()
      if (audioEl) { audioEl.pause(); audioEl.srcObject = null }
      if (socket.readyState === WebSocket.OPEN) socket.close()
    }
  }
}