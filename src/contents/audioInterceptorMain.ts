/**
 * @file contents/audioInterceptorMain.ts
 * @description Runs in the webpage's MAIN execution world (`world: "MAIN"`) to monkey-patch AudioContext cleanly without CSP inline script violations.
 *
 * Architectural Overview:
 * 1. World: MAIN vs ISOLATED
 *    - Standard content scripts run in an ISOLATED world where `window.AudioContext` is separate from the webpage's JavaScript.
 *    - By setting `world: "MAIN"` via `PlasmoCSConfig`, Chrome executes this script directly inside the host webpage's JavaScript world at `document_start`.
 *    - This completely eliminates the need to create inline `<script>` tags (`script.textContent`), bypassing Content Security Policy (`script-src`) blocks on sites like Wikipedia.
 *
 * 2. Audio Interception:
 *    - Taps into `AudioContext` and `webkitAudioContext` to intercept synthesized game audio and stream FFT frequency data back to `content.tsx` via `window.postMessage`.
 */

import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  world: "MAIN",
  run_at: "document_start"
}

// Execute interception natively in MAIN world
;(function () {
  const interceptedContexts = new Set()
  const OriginalAudioContext = window.AudioContext
  const OriginalWebkitAudioContext = (window as any).webkitAudioContext

  function createInterceptedContext(OriginalClass: any) {
    if (!OriginalClass) return OriginalClass

    return class extends OriginalClass {
      constructor() {
        super()
        const ctx: any = this

        if (!interceptedContexts.has(ctx)) {
          interceptedContexts.add(ctx)

          try {
            // Create analyser to tap into audio
            const analyser = ctx.createAnalyser()
            analyser.fftSize = 256
            analyser.smoothingTimeConstant = 0.02

            // Intercept destination to inject analyser
            const origDestination = ctx.destination
            const splitter = ctx.createGain()
            splitter.connect(origDestination)
            splitter.connect(analyser)

            // Replace destination
            let destinationOverridden = false
            Object.defineProperty(ctx, "destination", {
              get: function () {
                if (!destinationOverridden) return splitter
                return origDestination
              },
              set: function (val) {
                destinationOverridden = true
              },
              configurable: true
            })

            // Send frequency data
            const dataArray = new Uint8Array(analyser.frequencyBinCount)
            let animId = 0
            const sendFrequencies = () => {
              analyser.getByteFrequencyData(dataArray)
              window.postMessage(
                {
                  type: "SENSA_GAME_AUDIO_FREQUENCY",
                  frequencies: Array.from(dataArray)
                },
                "*"
              )
              animId = requestAnimationFrame(sendFrequencies)
            }
            sendFrequencies()

            window.postMessage(
              {
                type: "SENSA_WEB_AUDIO_ACTIVE"
              },
              "*"
            )
          } catch (e) {
            console.warn("Sensa audio interceptor error:", e)
          }
        }
      }
    }
  }

  try {
    if (OriginalAudioContext) {
      window.AudioContext = createInterceptedContext(OriginalAudioContext)
    }
  } catch (e) {}

  try {
    if (OriginalWebkitAudioContext) {
      ;(window as any).webkitAudioContext = createInterceptedContext(
        OriginalWebkitAudioContext
      )
    }
  } catch (e) {}
})()
