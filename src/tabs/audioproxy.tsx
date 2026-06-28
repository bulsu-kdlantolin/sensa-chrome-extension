import { useEffect } from "react"

const STT_WS_URL = "wss://sensa-chrome-extension-backend.onrender.com"

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

    const stopCapture = () => {
      intentionalStop = true
      try {
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
          audioCtx.suspend().catch(() => {})
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
      } catch (err) {}
    }

    const handleMessage = async (msg: any) => {
      if (msg.type === "STOP_OFFSCREEN_CAPTURE") {
        stopCapture()
        return
      }

      if (msg.type === "EXECUTE_OFFSCREEN_CAPTURE") {
        const { streamId, targetLang, targetTabId, deviceId } = msg
        currentTargetLang = targetLang || "EN"

        const log = (message: string) => {
          chrome.runtime.sendMessage({
            type: "FORWARD_TO_TAB",
            tabId: targetTabId,
            payload: { type: "PROXY_LOG", message }
          }).catch(() => {})
        }

        try {
          log("1. Starting offscreen capture sequence...")
          stopCapture()

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

          intentionalStop = false

          const connectWebSocket = () => {
            if (intentionalStop) return
            
            log("5. Connecting WebSocket to cloud backend...")
            socket = new WebSocket(STT_WS_URL)

            socket.onopen = () => {
              log("6. WebSocket CONNECTED!")
              try {
                if (!audioCtx) {
                  log("-> Building Audio Graph...")
                  audioCtx = new window.AudioContext({ sampleRate: 16000 })
                } else if (audioCtx.state === 'suspended') {
                  audioCtx.resume().catch(() => {})
                }
                const source = audioCtx.createMediaStreamSource(stream)
                processor = audioCtx.createScriptProcessor(4096, 1, 1)
                
                // 🎯 VISUAL SOUND RADAR
                analyser = audioCtx.createAnalyser()
                analyser.fftSize = 2048
                const dataArray = new Uint8Array(analyser.frequencyBinCount)

                source.connect(processor)
                source.connect(analyser)
                processor.connect(audioCtx.destination) 

                let packetCount = 0
                let frequencyCheckCounter = 0
                  
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
                    
                    // 🎯 Hardware Accelerated Visualizer Loop
                    frequencyCheckCounter++
                    if (frequencyCheckCounter > 5) {
                      frequencyCheckCounter = 0
                      analyser!.getByteFrequencyData(dataArray)
                      
                      const nyquistFreq = audioCtx!.sampleRate / 2
                      const binWidth = nyquistFreq / analyser!.frequencyBinCount
                      
                      const speechEndBin = Math.floor(800 / binWidth)
                      const alarmStartBin = Math.floor(1500 / binWidth)
                      
                      let speechEnergy = 0
                      let alarmEnergy = 0
                      
                      for (let i = 0; i < speechEndBin; i++) {
                        speechEnergy += dataArray[i]
                      }
                      
                      for (let i = alarmStartBin; i < dataArray.length; i++) {
                        alarmEnergy += dataArray[i]
                      }
                      
                      const avgSpeechEnergy = speechEnergy / Math.max(1, speechEndBin)
                      const avgAlarmEnergy = alarmEnergy / Math.max(1, dataArray.length - alarmStartBin)
                      
                      const isAlarmDetected = avgAlarmEnergy > avgSpeechEnergy * 1.5 && avgAlarmEnergy > 40
                      
                      chrome.runtime.sendMessage({
                        type: "FORWARD_TO_TAB",
                        tabId: targetTabId,
                        payload: {
                          type: "AUDIO_FREQUENCY_UPDATE",
                          frequencies: Array.from(dataArray.slice(0, 128)),
                          isAlarmDetected,
                          speechEnergy: avgSpeechEnergy,
                          alarmEnergy: avgAlarmEnergy
                        }
                      }).catch(() => {})
                    }
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

            socket.onmessage = (event) => {
              try {
                const payload = JSON.parse(event.data)
                if (payload.type === "TRANSCRIPT" && payload.text) {
                  const rawText = payload.text
                  const isFinal = payload.isFinal // 🚨 Extract isFinal flag from Node payload
                  
                  // 🚨 Forward the flag to the React UI for smooth scrolling
                  chrome.runtime.sendMessage({ 
                    type: "FORWARD_TO_TAB", 
                    tabId: targetTabId, 
                    payload: { 
                      type: "CAPTION_UPDATE", 
                      text: rawText, 
                      source: "original",
                      isFinal: isFinal 
                    } 
                  })

                  // 🚨 Restrict translation to final sentences only to save DeepL quota
                  if (isFinal) {
                    chrome.runtime.sendMessage(
                      { type: "TRANSLATE_TEXT", text: rawText, targetLang: currentTargetLang },
                      (res) => {
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
                          })
                        }
                      }
                    )
                  }
                }
              } catch (err) {}
            }
          }

          connectWebSocket()
        } catch (err: any) {
          log(`❌ CRITICAL OFFSCREEN ERROR: ${err.message}`)
        }
      }

      if (msg.type === "UPDATE_CAPTION_LANGUAGE_OFFSCREEN") {
        currentTargetLang = msg.targetLang || "EN"
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage)
      stopCapture()
    }
  }, [])

  return <div>Sensa Offscreen Audio Relay</div>
}