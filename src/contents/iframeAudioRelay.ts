/**
 * @file iframeAudioRelay.ts
 * @description Dedicated content script with `all_frames: true` to detect and capture audio frequency spectrums inside cross-origin <iframe> tags and relay them directly to the top-level Auditory Dock within the same tab via local `postMessage` (preventing multi-tab cross-talk).
 */

import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: true
}

// Only execute if inside an iframe (window !== window.top)
if (window !== window.top) {
  let audioCtx: AudioContext | null = null
  let analyser: AnalyserNode | null = null
  let dataArray: Uint8Array<ArrayBuffer> | null = null
  const connectedInThisSession = new Map<HTMLMediaElement, string>()

  const findAllMediaElements = (root: any = document): HTMLMediaElement[] => {
    const mediaElements: HTMLMediaElement[] = []
    try {
      root.querySelectorAll('video, audio').forEach((el: any) => mediaElements.push(el))
      root.querySelectorAll('*').forEach((el: any) => {
        if (el.shadowRoot) {
          mediaElements.push(...findAllMediaElements(el.shadowRoot))
        }
      })
    } catch (e) { }
    return mediaElements
  }

  const attachToIframeMedia = (mediaEl: HTMLMediaElement) => {
    try {
      const currentSrc = mediaEl.currentSrc || mediaEl.src || "unknown"
      const lastConnectedSrc = connectedInThisSession.get(mediaEl)
      if (lastConnectedSrc === currentSrc && lastConnectedSrc !== "unknown") return

      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => { })
      }

      const captureFunc = (mediaEl as any).captureStream || (mediaEl as any).mozCaptureStream
      if (!captureFunc) return

      const stream = captureFunc.call(mediaEl) as MediaStream
      if (!stream || stream.getAudioTracks().length === 0) return

      if (!audioCtx) {
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
        analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.02
        dataArray = new Uint8Array(analyser.frequencyBinCount)
      }

      if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => { })

      const source = audioCtx.createMediaStreamSource(stream)
      source.connect(analyser!)
      connectedInThisSession.set(mediaEl, currentSrc)
    } catch (e) { }
  }

  window.setInterval(() => {
    try {
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => { })
      }

      const allMedia = findAllMediaElements(document)
      allMedia.forEach(media => {
        if (!media.paused && media.currentTime > 0 && !media.muted) {
          attachToIframeMedia(media)
        }
      })

      if (analyser && dataArray && audioCtx) {
        analyser.getByteFrequencyData(dataArray as any)
        let total = 0
        for (let i = 0; i < dataArray.length; i++) total += dataArray[i]
        if (total > 0) {
          const payload = {
            type: "AUDIO_FREQUENCY_UPDATE",
            frequencies: Array.from(dataArray)
          }
          try {
            window.top?.postMessage(payload, "*")
          } catch (e) { }
          try {
            chrome.runtime.sendMessage(payload).catch(() => { })
          } catch (e) { }
        }
      }
    } catch (e) { }
  }, 50)
}
