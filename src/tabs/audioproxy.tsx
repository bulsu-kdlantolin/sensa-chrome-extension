/**
 * @file audioproxy.tsx
 * @description Offscreen document responsible for tab audio capturing, playback, FFT analysis, and WebSocket streaming.
 *
 * Architectural Overview:
 * 1. Why an Offscreen Document?
 *    - In Manifest V3, Service Workers cannot access DOM audio APIs (`AudioContext`, `<audio>`, `MediaStream`).
 *    - This offscreen document is spawned by `background.ts` to host the Web Audio API processing pipeline.
 *
 * 2. Media Capture & Playback:
 *    - Receives `EXECUTE_OFFSCREEN_CAPTURE` containing a `streamId` from `chrome.tabCapture.getMediaStreamId()`.
 *    - Connects the stream to an `<audio>` element so the user continues to hear tab audio without interruption.
 *
 * 3. Speech-to-Text WebSocket Streaming:
 *    - When STT is enabled, extracts 16kHz mono linear16 PCM audio buffers using `ScriptProcessorNode`.
 *    - Streams raw PCM packets over WebSocket (`wss://sensa-chrome-extension-backend.onrender.com`) to Deepgram / DeepL.
 *    - Forwards returned transcription packets back to `background.ts` -> active tab via `FORWARD_TO_TAB`.
 */

import { useEffect } from "react"

const STT_WS_URL = "wss://sensa-chrome-extension-backend.onrender.com"

/**
 * Offscreen audio proxy component. Runs invisibly in the background.
 */
export default function AudioProxy() {
  useEffect(() => {
    let socket: WebSocket | null = null
    let processor: ScriptProcessorNode | null = null
    let audioCtx: AudioContext | null = null
    let audioEl: HTMLAudioElement | null = null
    let analyser: AnalyserNode | null = null
    let visualizerInterval: ReturnType<typeof setInterval> | null = null
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
    let activeStream: MediaStream | null = null
    let intentionalStop = false

    let currentTargetLang = "EN"
    let currentSourceLang = "en"
    let reconnectWebSocketFn: (() => void) | null = null
    let debounceLangTimeout: ReturnType<typeof setTimeout> | null = null

    const stopCapture = () => {
      intentionalStop = true
      reconnectWebSocketFn = null
      try {
        if (debounceLangTimeout) {
          clearTimeout(debounceLangTimeout)
          debounceLangTimeout = null
        }
        if (reconnectTimeout) {
          clearTimeout(reconnectTimeout)
          reconnectTimeout = null
        }

        if (visualizerInterval) {
          clearInterval(visualizerInterval)
          visualizerInterval = null
        }
        if (processor) {
          processor.disconnect()
          processor.onaudioprocess = null
          processor = null
        }
        if (analyser) {
          analyser.disconnect()
          analyser = null
        }
        if (audioCtx && audioCtx.state === 'running') {
          audioCtx.suspend().catch(() => { })
        }
        if (audioEl) {
          audioEl.pause()
          audioEl.srcObject = null
          audioEl = null
        }
        if (activeStream) {
          activeStream.getTracks().forEach((track) => track.stop())
          activeStream = null
        }
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.close()
        }
        socket = null
      } catch (err) { }
    }

    const handleMessage = async (msg: any) => {
      if (msg.type === "STOP_OFFSCREEN_CAPTURE") {
        stopCapture()
        return
      }

      if (msg.type === "EXECUTE_OFFSCREEN_CAPTURE") {
        const { streamId, targetLang, sourceLang, targetTabId, deviceId } = msg
        currentTargetLang = targetLang || "EN"
        currentSourceLang = sourceLang || "en"

        const log = (message: string) => {
          chrome.runtime.sendMessage({
            type: "FORWARD_TO_TAB",
            tabId: targetTabId,
            payload: { type: "PROXY_LOG", message }
          }).catch(() => { })
        }

        try {
          log("1. Starting offscreen capture sequence...")
          stopCapture()
          intentionalStop = false

          log("2. Requesting getUserMedia from Chrome...")
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } } as any
          })
          activeStream = stream
          log("3. Audio stream acquired successfully!")

          log("4. Setting up Audio element to unmute the tab...")
          audioEl = new Audio()
          audioEl.srcObject = stream
          audioEl.autoplay = true

          if (deviceId && deviceId !== "default" && typeof (audioEl as any).setSinkId === "function") {
            (audioEl as any).setSinkId(deviceId).then(() => {
              log(`-> Output Device successfully routed to: ${deviceId}`)
            }).catch((e: any) => log(`-> Output Device routing failed: ${e}`))
          } else {
            log("-> Using default system audio output.")
          }

          if (!audioCtx) {
            log("-> Building Audio Graph...")
            audioCtx = new window.AudioContext({ sampleRate: 16000 })
          } else if (audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => { })
          }

          const source = audioCtx.createMediaStreamSource(stream)
          analyser = audioCtx.createAnalyser()
          analyser.fftSize = 256
          analyser.smoothingTimeConstant = 0.05
          const dataArray = new Uint8Array(analyser.frequencyBinCount)

          source.connect(analyser)

          if (visualizerInterval) clearInterval(visualizerInterval)
          visualizerInterval = setInterval(() => {
            if (!analyser || !audioCtx || intentionalStop) return
            analyser.getByteFrequencyData(dataArray)

            const nyquistFreq = audioCtx.sampleRate / 2
            const binWidth = nyquistFreq / analyser.frequencyBinCount
            const speechEndBin = Math.floor(800 / binWidth)
            const alarmStartBin = Math.floor(1500 / binWidth)

            let speechEnergy = 0
            let alarmEnergy = 0
            for (let i = 0; i < speechEndBin; i++) speechEnergy += dataArray[i]
            for (let i = alarmStartBin; i < dataArray.length; i++) alarmEnergy += dataArray[i]

            const avgSpeechEnergy = speechEnergy / Math.max(1, speechEndBin)
            const avgAlarmEnergy = alarmEnergy / Math.max(1, dataArray.length - alarmStartBin)
            const isAlarmDetected = avgAlarmEnergy > avgSpeechEnergy * 1.5 && avgAlarmEnergy > 40

            chrome.runtime.sendMessage({
              type: "FORWARD_TO_TAB",
              tabId: targetTabId,
              payload: {
                type: "AUDIO_FREQUENCY_UPDATE",
                frequencies: Array.from(dataArray),
                isAlarmDetected,
                speechEnergy: avgSpeechEnergy,
                alarmEnergy: avgAlarmEnergy
              }
            }).catch(() => { })
          }, 50)

          if (msg.enableSTT === false) {
            log("-> Radar capture mode active (STT disabled).")
            return
          }

          const connectWebSocket = () => {
            if (intentionalStop) return

            log("5. Connecting WebSocket to cloud backend...")
            socket = new WebSocket(`${STT_WS_URL}?targetLang=${encodeURIComponent(currentTargetLang)}&sourceLang=${encodeURIComponent(currentSourceLang)}`)

            let lastTranslatedText = ""
            let lastTranslateTime = 0

            socket.onopen = () => {
              log("6. WebSocket CONNECTED!")
              try {
                if (!audioCtx) return
                if (processor) {
                  try { processor.disconnect(); processor.onaudioprocess = null; } catch (e) {}
                  processor = null
                }
                if (audioCtx.state === 'suspended') {
                  audioCtx.resume().catch(() => {})
                }
                processor = audioCtx.createScriptProcessor(4096, 1, 1)
                source.connect(processor)
                const silentGain = audioCtx.createGain()
                silentGain.gain.value = 0
                processor.connect(silentGain)
                silentGain.connect(audioCtx.destination)

                let packetCount = 0

                processor.onaudioprocess = (e) => {
                  if (socket?.readyState !== WebSocket.OPEN) return

                  packetCount++
                  if (packetCount === 1) log("7. SUCCESS! First audio packet processed and sent to Node!")

                  const float32Array = e.inputBuffer.getChannelData(0)
                  const int16Array = new Int16Array(float32Array.length)
                  for (let i = 0; i < float32Array.length; i++) {
                    let s = Math.max(-1, Math.min(1, float32Array[i]))
                    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7fff
                  }
                  socket.send(int16Array.buffer)
                }
              } catch (audioErr: any) {
                log(`❌ AUDIO GRAPH ERROR: ${audioErr.message}`)
              }
            }

            socket.onerror = () => log("❌ WEBSOCKET ERROR! Cloud backend connection failed.")
            socket.onclose = () => {
              log("⚠️ WEBSOCKET CLOSED.")
              if (!intentionalStop) {
                log("🔄 Attempting to reconnect to backend in 2 seconds...")
                if (reconnectTimeout) clearTimeout(reconnectTimeout)
                reconnectTimeout = setTimeout(connectWebSocket, 2000)
              }
            }

            let lastInterimTime = 0
            let lastInterimWordCount = 0
            let pendingInterim: string | null = null
            let interimTimer: ReturnType<typeof setTimeout> | null = null

            const forwardCaption = (text: string, isFinal: boolean) => {
              chrome.runtime.sendMessage({
                type: "FORWARD_TO_TAB",
                tabId: targetTabId,
                payload: {
                  type: "CAPTION_UPDATE",
                  text,
                  source: "original",
                  isFinal
                }
              }).catch(() => { })
            }

            socket.onmessage = (event) => {
              try {
                const payload = JSON.parse(event.data)
                if (payload.type === "TRANSCRIPT" && payload.text) {
                  const rawText = payload.text
                  const isFinal = payload.isFinal

                  if (isFinal) {
                    // Final: render instantly, cancel any pending interim
                    if (interimTimer) { clearTimeout(interimTimer); interimTimer = null }
                    pendingInterim = null
                    lastInterimWordCount = 0
                    forwardCaption(rawText, true)

                    // Translate finalized sentence
                    const trimmed = rawText.trim()
                    if (trimmed && trimmed !== lastTranslatedText) {
                      lastTranslatedText = trimmed
                      lastTranslateTime = Date.now()

                      chrome.runtime.sendMessage(
                        { type: "TRANSLATE_TEXT", text: trimmed, targetLang: currentTargetLang },
                        (res) => {
                          if (chrome.runtime.lastError) return
                          if (res?.ok && res.translated) {
                            chrome.runtime.sendMessage({
                              type: "FORWARD_TO_TAB",
                              tabId: targetTabId,
                              payload: {
                                type: "CAPTION_UPDATE",
                                text: res.translated,
                                source: "translated",
                                isFinal: true
                              }
                            }).catch(() => { })
                          }
                        }
                      )
                    }
                  } else {
                    // Interim: only update when new words appear, max 2x/sec
                    const wordCount = rawText.trim().split(/\s+/).filter(Boolean).length
                    if (wordCount <= lastInterimWordCount) return // skip cosmetic-only corrections

                    pendingInterim = rawText
                    const now = Date.now()
                    const elapsed = now - lastInterimTime

                    if (elapsed >= 500) {
                      lastInterimTime = now
                      lastInterimWordCount = wordCount
                      forwardCaption(rawText, false)
                    } else if (!interimTimer) {
                      interimTimer = setTimeout(() => {
                        interimTimer = null
                        if (pendingInterim) {
                          lastInterimTime = Date.now()
                          lastInterimWordCount = pendingInterim.trim().split(/\s+/).filter(Boolean).length
                          forwardCaption(pendingInterim, false)
                        }
                      }, 500 - elapsed)
                    }
                  }
                }
              } catch (err) { }
            }
          }

          reconnectWebSocketFn = () => {
            if (intentionalStop) return
            log(`🔄 Reconnecting WebSocket with sourceLang=${currentSourceLang}, targetLang=${currentTargetLang}...`)
            if (reconnectTimeout) {
              clearTimeout(reconnectTimeout)
              reconnectTimeout = null
            }
            if (processor) {
              try {
                processor.disconnect()
                processor.onaudioprocess = null
              } catch (e) {}
              processor = null
            }
            if (socket) {
              socket.onclose = null
              socket.close()
              socket = null
            }
            if (audioCtx && audioCtx.state === 'suspended') {
              audioCtx.resume().catch(() => {})
            }
            connectWebSocket()
          }

          connectWebSocket()
        } catch (err: any) {
          log(`❌ CRITICAL OFFSCREEN ERROR: ${err.message}`)
          chrome.runtime.sendMessage({
            type: "FORWARD_TO_TAB",
            tabId: targetTabId,
            payload: { type: "CAPTION_ERROR", error: err.message }
          }).catch(() => { })
        }
      }

      const triggerDebouncedReconnect = () => {
        if (debounceLangTimeout) clearTimeout(debounceLangTimeout);
        debounceLangTimeout = setTimeout(() => {
          if (reconnectWebSocketFn && !intentionalStop) {
            reconnectWebSocketFn();
          }
        }, 150);
      };

      if (msg.type === "UPDATE_CAPTION_LANGUAGE_OFFSCREEN") {
        const newTarget = msg.targetLang || "EN";
        if (newTarget !== currentTargetLang) {
          currentTargetLang = newTarget;
          triggerDebouncedReconnect();
        }
      }

      if (msg.type === "UPDATE_SOURCE_LANGUAGE_OFFSCREEN") {
        const newSource = msg.sourceLang || "en";
        if (newSource !== currentSourceLang) {
          currentSourceLang = newSource;
          triggerDebouncedReconnect();
        }
      }
    }

    const listener = (msg: any) => {
      handleMessage(msg)
      return false
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => {
      chrome.runtime.onMessage.removeListener(listener)
      stopCapture()
    }
  }, [])

  return <div>Sensa Offscreen Audio Relay</div>
}