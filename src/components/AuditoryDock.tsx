/**
 * @file AuditoryDock.tsx
 * @description Auditory accommodation dock providing real-time audio visualization, live speech-to-text captions, and sensory settings.
 *
 * Architectural Overview:
 * 1. Audio Capture & Visualizer (`SiteAudioSystem`):
 *    - Connects directly to page `<audio>` and `<video>` HTML5 elements via `.captureStream()`.
 *    - Also listens for Web Audio API frequency packets sent by the injected `audioInterceptorMain` content script (for HTML5 games or Web Audio sites).
 *    - Performs FFT analysis to render smooth, framerate-independent audio visualizer bars.
 *
 * 2. Loud Noise Spike Detection:
 *    - Monitors raw instantaneous audio energy (independent of visualizer smoothing).
 *    - When sudden audio spikes occur (ratio > 2.0x baseline), it triggers a non-intrusive screen-edge flash overlay to alert deaf or hard-of-hearing users.
 *
 * 3. Dock UI & Overlays:
 *    - Renders a floating glassmorphism dock with controls for toggling live captions, opening transcript history, focus mode, and adjusting text size/transparency.
 */

import React, { useEffect, useRef, useState } from "react"
import { Tooltip as SharedTooltip } from "./Tooltip"
import { useUIHoverAudio } from "../hooks/useUIHoverAudio"

/**
 * Real-time site audio visualizer and loud noise spike detection engine.
 * Connects to HTML5 media elements and Web Audio API streams.
 */
const SiteAudioSystem = ({ isActive, isDark, isCaptionsActive, dockRootRef }: { isActive: boolean, isDark: boolean, isCaptionsActive?: boolean, dockRootRef?: React.RefObject<HTMLDivElement> }) => {
  const barsRef = useRef<(HTMLDivElement | null)[]>([])
  const currentHeights = useRef([4, 6, 8, 6, 4])
  const tickRef = useRef(0)
  const smoothedEnergyRef = useRef(0)
  const slowEnergyRef = useRef(0)
  const flashIntensityRef = useRef(0)
  const loudNoiseEnabledRef = useRef(true)
  const warmupFramesRef = useRef(0)
  const hasTriggeredAtMaxRef = useRef(false)

  useEffect(() => {
    // Load loud noise alerts preference (defaults to true unless explicitly disabled)
    chrome.storage.local.get(["sensa_loud_noise_alerts"], (res) => {
      if (res.sensa_loud_noise_alerts !== undefined) {
        loudNoiseEnabledRef.current = res.sensa_loud_noise_alerts !== false && res.sensa_loud_noise_alerts !== "false"
      }
    })
    const onStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.sensa_loud_noise_alerts) {
        const newVal = changes.sensa_loud_noise_alerts.newValue
        loudNoiseEnabledRef.current = newVal !== false && newVal !== "false"
        // If turned off, immediately hide the flash overlay
        if (!loudNoiseEnabledRef.current) {
          flashIntensityRef.current = 0
          hasTriggeredAtMaxRef.current = false
          const overlay = document.getElementById('sensa-loud-noise-flash')
          if (overlay) {
            overlay.style.setProperty('opacity', '0', 'important')
            overlay.style.setProperty('display', 'none', 'important')
          }
        }
      }
    }
    chrome.storage.onChanged.addListener(onStorageChange)

    let animationId: number
    let audioCtx: AudioContext | null = null
    let analyser: AnalyserNode | null = null
    let dataArray: Uint8Array | null = null
    let hunterInterval: number | undefined
    let connectedMediaCount = 0
    const connectedInThisSession = new Map<HTMLMediaElement, string>()

    let gameAudioArray: Uint8Array | null = null
    let lastGameAudioTick = 0
    let lastTime = performance.now()

    const shapeMask = [0.35, 0.7, 1.0, 0.7, 0.35]
    const maxHeights = [10, 14, 20, 14, 10]
    const idleHeights = [4, 6, 8, 6, 4]
    const ENERGY_GATE = 0.02
    const GAME_SIGNAL_MIN = 18

    const borderBaseColor = isDark ? 'rgba(255,122,47,0.4)' : 'rgba(255,122,47,0.5)'

    const getDockPills = (): HTMLElement[] => {
      if (dockRootRef?.current) {
        const list = Array.from(dockRootRef.current.querySelectorAll('.sensa-dock-pill')) as HTMLElement[]
        if (list.length > 0) return list
      }
      const anchor = barsRef.current[0]
      if (anchor) {
        const dockEl = anchor.closest('[data-sensa-auditory-dock]')
        if (dockEl) {
          const list = Array.from(dockEl.querySelectorAll('.sensa-dock-pill')) as HTMLElement[]
          if (list.length > 0) return list
        }
        const root = anchor.getRootNode() as Document | ShadowRoot | null
        if (root && 'querySelectorAll' in root) {
          const list = Array.from(root.querySelectorAll('.sensa-dock-pill')) as HTMLElement[]
          if (list.length > 0) return list
        }
      }
      return Array.from(document.querySelectorAll('.sensa-dock-pill')) as HTMLElement[]
    }

    const lerp = (start: number, end: number, amt: number) => (1 - amt) * start + amt * end

    const handleMessage = (event: MessageEvent) => {
      if (!event.data) return
      if (event.data.type === 'SENSA_GAME_AUDIO_FREQUENCY' || event.data.type === 'AUDIO_FREQUENCY_UPDATE') {
        if (!gameAudioArray || gameAudioArray.length !== event.data.frequencies.length) {
          gameAudioArray = new Uint8Array(event.data.frequencies)
        } else {
          gameAudioArray.set(event.data.frequencies)
        }
        lastGameAudioTick = Date.now()
      }
    }

    const handleRuntimeMessage = (message: any) => {
      if (message && message.type === 'AUDIO_FREQUENCY_UPDATE' && message.frequencies) {
        if (!gameAudioArray || gameAudioArray.length !== message.frequencies.length) {
          gameAudioArray = new Uint8Array(message.frequencies)
        } else {
          gameAudioArray.set(message.frequencies)
        }
        lastGameAudioTick = Date.now()
      }
    }

    window.addEventListener('message', handleMessage)
    chrome.runtime.onMessage.addListener(handleRuntimeMessage)

    const findAllMediaElements = (root: any = document): HTMLMediaElement[] => {
      const mediaElements: HTMLMediaElement[] = []
      try {
        root.querySelectorAll('video, audio').forEach((el: any) => mediaElements.push(el))
        root.querySelectorAll('*').forEach((el: any) => {
          if (el.shadowRoot) {
            mediaElements.push(...findAllMediaElements(el.shadowRoot))
          }
        })
      } catch (e) {}
      return mediaElements
    }

    const attachToSiteMediaSafe = (mediaEl: HTMLMediaElement) => {
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

        if (!lastConnectedSrc) {
          connectedMediaCount += 1
        }
        connectedInThisSession.set(mediaEl, currentSrc)
      } catch (e) {
        console.warn("Sensa: Media captureStream protected or unavailable.", e)
      }
    }

    const isMediaPlaying = () => {
      const allMedia = findAllMediaElements(document)
      return allMedia.some(
        (media) => !media.paused && media.currentTime > 0 && !media.muted && media.readyState >= 2
      )
    }

    let lastRequestTime = 0
    const handleVisibilityOrFocus = () => {
      if (document.hidden) {
        smoothedEnergyRef.current = 0
        flashIntensityRef.current = 0
        hasTriggeredAtMaxRef.current = false
        const flash = document.getElementById('sensa-loud-noise-flash')
        if (flash) {
          flash.style.opacity = '0'
        }
        getDockPills().forEach(pill => {
          pill.style.boxShadow = ''
        })
        return
      }

      if ((document.visibilityState === 'visible' || document.hasFocus()) && isActive) {
        if (Date.now() - lastRequestTime < 1000) return
        lastRequestTime = Date.now()

        if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => { })
        }
        scanAndAttachMedia()
        if (!isCaptionsActive) {
          chrome.runtime.sendMessage({ type: "START_RADAR_CAPTURE" }).catch(() => { })
        }
      }
    }

    const scanAndAttachMedia = () => {
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => { })
      }
      findAllMediaElements(document).forEach(media => {
        if (!media.paused && media.currentTime > 0 && !media.muted) attachToSiteMediaSafe(media)
      })
    }

    const handleShortsNavigation = () => {
      setTimeout(scanAndAttachMedia, 400)
      setTimeout(scanAndAttachMedia, 1000)
    }

    if (isActive && !isCaptionsActive) {
      chrome.runtime.sendMessage({ type: "START_RADAR_CAPTURE" }).catch(() => { })
    }
    if (isActive) {
      document.addEventListener('visibilitychange', handleVisibilityOrFocus)
      window.addEventListener('focus', handleVisibilityOrFocus)
      window.addEventListener('yt-navigate-finish', handleShortsNavigation)
      window.addEventListener('popstate', handleShortsNavigation)

      // Ensure body fallback overlay exists
      let pageOverlay = document.getElementById('sensa-loud-noise-flash-page')
      if (!pageOverlay) {
        pageOverlay = document.createElement('div')
        pageOverlay.id = 'sensa-loud-noise-flash-page'
        pageOverlay.style.cssText = 'position:fixed !important;top:0 !important;left:0 !important;right:0 !important;bottom:0 !important;width:100vw !important;height:100vh !important;pointer-events:none !important;z-index:2147483647 !important;box-sizing:border-box !important;opacity:0;display:none;transition:opacity 0.05s ease-out;'
        try { (document.body || document.documentElement).appendChild(pageOverlay) } catch {}
      }

      // Collect all active flash overlay targets across Shadow DOM, Page Body, and Fullscreen container
      const getFlashOverlays = (): HTMLElement[] => {
        const list: HTMLElement[] = []
        // 1. Primary: inside Sensa Shadow DOM (guaranteed top layer, immune to site CSS)
        const rootNode = dockRootRef?.current?.getRootNode() as Document | ShadowRoot | null
        if (rootNode && 'querySelector' in rootNode) {
          const shadowEl = rootNode.querySelector('#sensa-loud-noise-flash') as HTMLElement | null
          if (shadowEl) list.push(shadowEl)
        }
        // 2. Secondary: in document body
        const pageEl = document.getElementById('sensa-loud-noise-flash-page')
        if (pageEl) list.push(pageEl)
        // 3. Tertiary: in fullscreen element if active
        const fsEl = document.fullscreenElement || (document as any).webkitFullscreenElement || null
        if (fsEl) {
          const fsTarget = fsEl.tagName && fsEl.tagName.toUpperCase() === 'VIDEO' && fsEl.parentElement
            ? fsEl.parentElement
            : fsEl
          let fsFlash = fsTarget.querySelector('#sensa-loud-noise-flash-fs') as HTMLElement | null
          if (!fsFlash) {
            fsFlash = document.createElement('div')
            fsFlash.id = 'sensa-loud-noise-flash-fs'
            fsFlash.style.cssText = 'position:fixed !important;top:0 !important;left:0 !important;right:0 !important;bottom:0 !important;width:100% !important;height:100% !important;pointer-events:none !important;z-index:2147483647 !important;box-sizing:border-box !important;opacity:0;display:none;'
            try { fsTarget.appendChild(fsFlash) } catch {}
          }
          if (fsFlash) list.push(fsFlash)
        }
        return list
      }

      let activeMediaEl: HTMLMediaElement | null = null

      hunterInterval = window.setInterval(() => {
        if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => { })
        }
        const allMedia = findAllMediaElements(document)
        allMedia.forEach(media => {
          if (!media.paused && media.currentTime > 0 && !media.muted) {
            attachToSiteMediaSafe(media)
            activeMediaEl = media
          }
        })
      }, 1500)

      let activeTheme: 'orange' | 'green' | 'red' = 'orange'
      let themeHoldFrames = 0
      let smoothedColor = "#FF7A2F"

      const draw = () => {
        const time = performance.now()
        // Prevent massive jumps if tab is inactive for a long time
        const dt = Math.min((time - lastTime) / 1000, 0.1)
        lastTime = time

        // Normalize ticks to 60fps equivalent for consistent physics
        tickRef.current += dt * 60
        const tick = tickRef.current

        let rawEnergy = 0
        let voiceMusicBaseline = 0
        let greenPingPeak = 0
        let redAlarmPeak = 0
        let totalBroadbandEnergy = 0
        let dominantFrequencyIndex = 20

        let activeData: Uint8Array | null = null
        const hasGamePacket = gameAudioArray && Date.now() - lastGameAudioTick < 350

        if (hasGamePacket && gameAudioArray) {
          activeData = gameAudioArray
        } else if (analyser && dataArray && connectedMediaCount > 0) {
          analyser.getByteFrequencyData(dataArray as any)
          activeData = dataArray
        }

        if (activeData) {
          let sum = 0
          for (let i = 2; i < 40; i++) sum += activeData[i]
          const currentVol = activeMediaEl ? (activeMediaEl.muted ? 0 : activeMediaEl.volume) : 1.0
          rawEnergy = ((sum / 38) / 255) * currentVol

          for (let i = 2; i < 11; i++) voiceMusicBaseline += activeData[i]
          voiceMusicBaseline = Math.max(1, voiceMusicBaseline / 9)

          for (let i = 12; i < 26; i++) greenPingPeak = Math.max(greenPingPeak, activeData[i])
          for (let i = 28; i < 60; i++) redAlarmPeak = Math.max(redAlarmPeak, activeData[i])

          for (let i = 2; i < 70; i++) totalBroadbandEnergy += activeData[i]
          totalBroadbandEnergy /= 68

          let weightedSum = 0
          let totalWeight = 0
          for (let i = 2; i < 90; i++) {
            weightedSum += i * activeData[i]
            totalWeight += activeData[i]
          }
          if (totalWeight > 0) {
            dominantFrequencyIndex = weightedSum / totalWeight
          }
        }

        // Responsive smoothing for natural speech cadence
        smoothedEnergyRef.current =
          smoothedEnergyRef.current * 0.72 + rawEnergy * 0.28
        const visualizerEnergy = smoothedEnergyRef.current
        const hasAudio = visualizerEnergy >= ENERGY_GATE || rawEnergy >= ENERGY_GATE

        // Framerate-independent decay (always decay so it fades if toggled off mid-flash)
        flashIntensityRef.current *= Math.pow(0.94, dt * 60)

        const instantEnergy = Math.max(visualizerEnergy, rawEnergy * 0.85)

        // Balanced sensitivity curve: normalized 0..1 response with lively bounce in the middle, peaks on screams
        const normalizedSignal = hasAudio
          ? Math.min(1.0, Math.max(0, (instantEnergy - 0.02) * 1.65))
          : 0

        barsRef.current.forEach((bar, i) => {
          if (!bar) return
          let targetHeight = idleHeights[i]

          if (hasAudio && normalizedSignal > 0) {
            // Natural proportionate height: low vol is gentle, normal speech bounces in the middle, screaming hits max
            targetHeight = idleHeights[i] + (maxHeights[i] - idleHeights[i]) * normalizedSignal
          } else {
            // Organic, staggered wave using the Delta-Time tick
            const breath = Math.sin(tick * 0.03 - i * 0.15) * 1.2
            targetHeight = idleHeights[i] + breath
          }

          const isRising = targetHeight > currentHeights.current[i]
          const baseAmt = hasAudio ? (isRising ? 0.70 : 0.25) : 0.10

          // Framerate-independent lerp
          const amt = 1 - Math.pow(1 - baseAmt, dt * 60)
          currentHeights.current[i] = lerp(currentHeights.current[i], targetHeight, amt)

          // Subpixel rendering via float values. NO Math.round() clamping!
          bar.style.height = `${currentHeights.current[i].toFixed(2)}px`
        })

        // Volume-based dynamic color: Orangish -> Yellowish -> Reddish
        const middleBarHeight = currentHeights.current[2]

        // Red is strictly reserved for max length volume detection (>= 18.5px out of 20px)
        const isMaxLength = hasAudio && middleBarHeight >= 18.5

        if (hasAudio) {
          if (isMaxLength) {
            smoothedColor = "#FF3B30" // Reddish (ONLY at max length volume detection)
            activeTheme = 'red'
          } else if (middleBarHeight >= 11.8) {
            smoothedColor = "#FFD000" // Vibrant Yellowish (conversational & medium volume)
            activeTheme = 'orange'
          } else {
            smoothedColor = "#FF7A2F" // Warm Orangish (low volume)
            activeTheme = 'orange'
          }
        } else {
          smoothedColor = "#FF7A2F"
          activeTheme = 'orange'
        }

        barsRef.current.forEach((bar) => {
          if (bar) bar.style.backgroundColor = smoothedColor
        })

        // Loud noise border alert: ONLY triggers at MAX RED LENGTH, and only once each time it reaches max red length
        if (isMaxLength) {
          if (!hasTriggeredAtMaxRef.current) {
            hasTriggeredAtMaxRef.current = true
            if (loudNoiseEnabledRef.current !== false) {
              flashIntensityRef.current = 1.0
            }
          }
        } else if (middleBarHeight < 16.0) {
          // Re-arms as soon as volume drops below the max red threshold
          hasTriggeredAtMaxRef.current = false
        }

        // Fully synchronize auditory dock glow with real-time visualizer audio reactions
        const dockPills = getDockPills()
        const audioRatio = Math.max(0, Math.min(1.0, (middleBarHeight - idleHeights[2]) / (maxHeights[2] - idleHeights[2])))

        if (hasAudio && audioRatio > 0.02) {
          // Dynamic glow synced seamlessly with every single audio reaction
          const glowBlur = (12 + audioRatio * 20).toFixed(1)
          const glowSpread = (2 + audioRatio * 8).toFixed(1)
          const outerAlpha = (0.22 + audioRatio * 0.45).toFixed(2)
          const innerAlpha = (0.08 + audioRatio * 0.18).toFixed(2)

          const hexOuter = Math.round(Number(outerAlpha) * 255).toString(16).padStart(2, '0')
          const hexInner = Math.round(Number(innerAlpha) * 255).toString(16).padStart(2, '0')

          const glowStyle = `0 0 ${glowBlur}px ${glowSpread}px ${smoothedColor}${hexOuter}, inset 0 0 10px ${smoothedColor}${hexInner}`

          dockPills.forEach(pill => {
            pill.style.boxShadow = glowStyle
          })
        } else {
          dockPills.forEach(pill => {
            if (pill.style.boxShadow) {
              pill.style.boxShadow = ''
            }
          })
        }
        // Screen-edge flash rendering across all targets (Shadow DOM, Page Body, Fullscreen)
        const fi = flashIntensityRef.current
        const overlays = getFlashOverlays()
        if (fi > 0.01) {
          const borderColor = `rgba(255, 59, 48, ${(fi * 0.95).toFixed(3)})`
          const glowColor = `rgba(255, 59, 48, ${(fi * 0.70).toFixed(3)})`
          const haloColor = `rgba(255, 59, 48, ${(fi * 0.25).toFixed(3)})`
          const spread = (70 + fi * 60).toFixed(1)
          const bleed = (25 + fi * 35).toFixed(1)

          overlays.forEach(el => {
            el.style.setProperty('display', 'block', 'important')
            el.style.setProperty('border', `10px solid ${borderColor}`, 'important')
            el.style.setProperty('box-shadow', `inset 0 0 ${spread}px ${bleed}px ${glowColor}, 0 0 40px ${glowColor}`, 'important')
            el.style.setProperty('background', `radial-gradient(circle at center, transparent 60%, ${haloColor} 100%)`, 'important')
            el.style.setProperty('opacity', '1', 'important')
          })
        } else {
          overlays.forEach(el => {
            el.style.setProperty('opacity', '0', 'important')
            el.style.setProperty('display', 'none', 'important')
            el.style.removeProperty('border')
            el.style.removeProperty('box-shadow')
            el.style.removeProperty('background')
          })
        }
        animationId = requestAnimationFrame(draw)
      }

      animationId = requestAnimationFrame(draw)
    }

    return () => {
      try { chrome.storage.onChanged.removeListener(onStorageChange) } catch {}
      try { window.removeEventListener('message', handleMessage) } catch {}
      try { chrome.runtime.onMessage.removeListener(handleRuntimeMessage) } catch {}
      try { document.removeEventListener('visibilitychange', handleVisibilityOrFocus) } catch {}
      try { window.removeEventListener('focus', handleVisibilityOrFocus) } catch {}
      try { window.removeEventListener('yt-navigate-finish', handleShortsNavigation) } catch {}
      try { window.removeEventListener('popstate', handleShortsNavigation) } catch {}
      try {
        const pageEl = document.getElementById('sensa-loud-noise-flash-page')
        if (pageEl) pageEl.remove()
      } catch {}
      try {
        const fsFlash = document.getElementById('sensa-loud-noise-flash-fs')
        if (fsFlash) fsFlash.remove()
      } catch {}
      if (animationId) cancelAnimationFrame(animationId)
      if (hunterInterval !== undefined) window.clearInterval(hunterInterval)
      if (audioCtx) {
        try { audioCtx.close().catch(() => undefined) } catch {}
      }
      smoothedEnergyRef.current = 0
      slowEnergyRef.current = 0
      flashIntensityRef.current = 0
      try {
        const existingFlash = document.getElementById('sensa-loud-noise-flash')
        if (existingFlash) {
          existingFlash.style.opacity = '0'
          existingFlash.style.display = 'none'
        }
      } catch {}
      try {
        getDockPills().forEach((pill) => {
          const htmlPill = pill as HTMLElement
          htmlPill.style.borderColor = borderBaseColor
          htmlPill.style.boxShadow = ''
        })
      } catch {}
      try {
        findAllMediaElements(document).forEach((mediaEl) => {
          delete (mediaEl as any)._sensaConnected
          delete (mediaEl as any)._sensaStream
        })
      } catch {}
      if (isActive) {
        try { chrome.runtime.sendMessage({ type: "STOP_OFFSCREEN_CAPTURE" }).catch(() => { }) } catch {}
      }
    }
  }, [isActive])

  return (
    <div className="flex items-center justify-center gap-[2.5px] !w-[28px] !h-[20px] shrink-0">
      {[0, 1, 2, 3, 4].map((index) => (
        <div
          key={index}
          ref={(el) => (barsRef.current[index] = el)}
          className="!w-[3.5px] rounded-full transition-colors duration-150"
          style={{ height: "4px", backgroundColor: "currentColor", willChange: "height, background-color" }}
        />
      ))}
    </div>
  )
}

/**
 * Props for the AuditoryDock component.
 */
interface AuditoryDockProps {
  /** Whether dark mode theme is currently active */
  isDark: boolean
  /** Whether the dock is collapsed into a compact toolbar */
  isMinimized: boolean
  /** Whether real-time speech-to-text subtitles are currently streaming */
  isCaptionsActive: boolean
  /** Callback to toggle live captions on or off */
  onToggleCaptions: () => void
  /** Callback to toggle dock minimization */
  onMinimizeToggle: () => void
  /** Callback to open the target translation language selector */
  onOpenCaptionLanguage: () => void
  /** Callback to open the full transcript history drawer */
  onOpenTranscriptHistory: () => void
  /** Callback to open subtitle text size adjustment overlay */
  onOpenTextSize: () => void
  /** Callback to open subtitle background transparency overlay */
  onOpenCaptionTransparency: () => void
  /** Whether sensory Focus Mode (dimming surrounding page content) is enabled */
  isFocusMode: boolean
  /** Callback to toggle Focus Mode */
  onToggleFocusMode: () => void
  /** Callback to open the comprehensive Auditory Settings modal */
  onOpenSettings: () => void
  /** Callback to completely close and exit Auditory Mode */
  onClose: () => void
}

/**
 * Main floating toolbar component for Auditory Mode.
 */
export default function AuditoryDock({
  isDark,
  isMinimized,
  isCaptionsActive,
  onToggleCaptions,
  onMinimizeToggle,
  onOpenCaptionLanguage,
  onOpenTranscriptHistory,
  onOpenTextSize,
  onOpenCaptionTransparency,
  isFocusMode,
  onToggleFocusMode,
  onOpenSettings,
  onClose
}: AuditoryDockProps) {

  const glassPanelClass = isDark
    ? "bg-[#1C1C1E]/85 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-3xl transform-gpu backface-hidden"
    : "bg-white/90 shadow-[0_8px_32px_rgba(0,0,0,0.15)] backdrop-blur-3xl transform-gpu backface-hidden"

  const controlPanelClass = isDark
    ? "bg-[#1C1C1E]/85 shadow-[0_8px_32px_rgba(0,0,0,0.6)] backdrop-blur-3xl transform-gpu backface-hidden"
    : "bg-white/90 shadow-[0_8px_32px_rgba(0,0,0,0.15)] backdrop-blur-3xl transform-gpu backface-hidden"

  const springTransition = "transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]"

  const btnBaseClass = `relative group !w-[44px] !h-[44px] !min-w-[44px] !min-h-[44px] !p-0 !m-0 flex items-center justify-center rounded-full shrink-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF7A2F]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent box-border will-change-[transform] transform-gpu backface-hidden ${springTransition}`

  const btnHoverClass = isDark
    ? "hover:bg-[#FF7A2F]/15 text-gray-300 hover:text-white"
    : "hover:bg-[#FF7A2F]/10 text-gray-600 hover:text-[#FF7A2F]"

  const closeBtnClass = `${btnBaseClass} text-gray-500 dark:text-gray-400 transition-all duration-200 active:scale-90 hover:scale-105 ${isDark ? 'hover:bg-red-500/80 hover:text-white' : 'hover:bg-red-500/90 hover:text-white'}`

  const activeButtonClass = `
    text-white shadow-[0_4px_20px_rgba(255,122,47,0.4),inset_0_1px_0_rgba(255,255,255,0.2)]
    hover:shadow-[0_4px_25px_rgba(255,122,47,0.6),inset_0_1px_0_rgba(255,255,255,0.3)]
    scale-105 ring-[0px] ring-[#FF7A2F]/0
  `

  const dividerClass = isDark
    ? "w-6 h-px my-0.5"
    : "w-6 h-px my-0.5"
    
  const dividerStyle = isDark
    ? { backgroundImage: "linear-gradient(to right, transparent, rgba(255,255,255,0.1), transparent)" }
    : { backgroundImage: "linear-gradient(to right, transparent, rgba(0,0,0,0.1), transparent)" }

  const dockRootRef = useRef<HTMLDivElement>(null)

  return (
    <div
      className="flex flex-col w-fit shrink-0 box-border relative z-50"
      ref={dockRootRef}
      role="toolbar"
      aria-label="Auditory and Caption Controls"
      data-sensa-auditory-dock
    >

      {/* Visualizer & Captions */}
      <div className={`relative flex flex-col items-center rounded-[28px] p-2 gap-1.5 shrink-0 z-30 transition-all duration-300 ${glassPanelClass}`}>

        {/* Glow layer */}
        <div
          className="sensa-dock-pill absolute inset-0 rounded-[28px] pointer-events-none transition-colors duration-150"
          style={{
            willChange: 'box-shadow'
          }}
        />

        {/* Visualizer Frame */}
        <div className={`${btnBaseClass} bg-transparent cursor-default relative z-10`}>
          <SharedTooltip label="Sound Visualizer" isDark={isDark} isAuditory />
          <SiteAudioSystem isActive={true} isDark={isDark} isCaptionsActive={isCaptionsActive} dockRootRef={dockRootRef} />
          <svg viewBox="0 0 24 24" fill="currentColor" className={`absolute !w-[18px] !h-[18px] shrink-0 opacity-10 pointer-events-none ${isDark ? 'text-white' : 'text-black'}`}>
            <rect x="5" y="10" width="2" height="4" rx="1" />
            <rect x="9" y="7" width="2" height="10" rx="1" />
            <rect x="13" y="4" width="2" height="16" rx="1" />
            <rect x="17" y="8" width="2" height="8" rx="1" />
          </svg>
        </div>

        <div className={dividerClass} style={dividerStyle} />

        <button
          type="button"
          onClick={onToggleCaptions}
          aria-pressed={isCaptionsActive}
          className={`${btnBaseClass} relative z-10 active:scale-90 ${isCaptionsActive
            ? activeButtonClass
            : `text-white/90 shadow-[0_2px_12px_rgba(255,122,47,0.3)] hover:shadow-[0_4px_20px_rgba(255,122,47,0.5)] hover:scale-105`
            }`}
          style={{ backgroundImage: "linear-gradient(to bottom right, #FF7A2F, #E86A25)" }}
        >
          <SharedTooltip label={isCaptionsActive ? "Turn Off Captions" : "Turn On Captions"} isDark={isDark} isAuditory />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="!w-[22px] !h-[22px] shrink-0">
            <rect x="3" y="6" width="18" height="12" rx="2" />
            <path d="M10 10.5a2.5 2.5 0 0 0-3.5 0" />
            <path d="M10 13.5a2.5 2.5 0 0 1-3.5 0" />
            <path d="M17.5 10.5a2.5 2.5 0 0 0-3.5 0" />
            <path d="M17.5 13.5a2.5 2.5 0 0 1-3.5 0" />
          </svg>
          {/* Active Indicator Badge */}
          {isCaptionsActive && (
            <span className="absolute top-0 right-0 !w-3 !h-3 rounded-full bg-white shadow-[0_0_10px_white]">
              <span className="absolute inset-0 rounded-full bg-white animate-ping opacity-75" />
            </span>
          )}
        </button>
      </div>

      {/* Settings */}
      <div
        className={`grid w-full transform-gpu backface-hidden will-change-[grid-template-rows] ${springTransition} ${isMinimized ? "grid-rows-[0fr] mt-0" : "grid-rows-[1fr] mt-3"
          }`}
      >
        <div className="min-h-0 flex justify-center w-full">
          <div
            className={`relative flex flex-col items-center rounded-[28px] p-2 gap-1.5 w-fit origin-top transform-gpu backface-hidden will-change-[opacity,transform] ${springTransition} ${glassPanelClass} ${isMinimized
              ? "opacity-0 scale-75 -translate-y-4 pointer-events-none"
              : "opacity-100 scale-100 translate-y-0 pointer-events-auto"
              }`}
          >
            {/* Glow layer */}
            <div
              className="sensa-dock-pill absolute inset-0 rounded-[28px] pointer-events-none transition-colors duration-150"
              style={{
                willChange: 'box-shadow'
              }}
            />

            <button
              onClick={onOpenTranscriptHistory}
              className={`${btnBaseClass} ${btnHoverClass} relative z-10 active:scale-90 hover:scale-105`}
              aria-label="Transcript History"
            >
              <SharedTooltip label="Transcript" isDark={isDark} isAuditory />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="!w-[22px] !h-[22px] shrink-0">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </button>

            <button
              onClick={onToggleFocusMode}
              aria-pressed={isFocusMode}
              className={`${btnBaseClass} relative z-10 active:scale-90 ${isFocusMode
                ? activeButtonClass
                : `${btnHoverClass} hover:scale-105`
                }`}
            >
              <SharedTooltip label="Focus Mode" isDark={isDark} isAuditory />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="!w-[22px] !h-[22px] shrink-0">
                <path d="M3 8V5a2 2 0 0 1 2-2h3" />
                <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
                <path d="M3 16v3a2 2 0 0 0 2 2h3" />
                <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>

            <div className={dividerClass} />

            <button
              onClick={onOpenCaptionLanguage}
              className={`${btnBaseClass} ${btnHoverClass} relative z-10 active:scale-90 hover:scale-105`}
              aria-label="Caption Language"
            >
              <SharedTooltip label="Caption Language" isDark={isDark} isAuditory />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="!w-[22px] !h-[22px] shrink-0">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
                <path d="M2 12h20" />
              </svg>
            </button>

            <button
              onClick={onOpenTextSize}
              className={`${btnBaseClass} ${btnHoverClass} relative z-10 active:scale-90 hover:scale-105`}
              aria-label="Text Size"
            >
              <SharedTooltip label="Text Size" isDark={isDark} isAuditory />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="!w-[22px] !h-[22px] shrink-0">
                <polyline points="4 7 4 4 20 4 20 7" />
                <line x1="12" y1="4" x2="12" y2="20" />
                <line x1="8" y1="20" x2="16" y2="20" />
              </svg>
            </button>

            <button
              onClick={onOpenCaptionTransparency}
              className={`${btnBaseClass} ${btnHoverClass} relative z-10 active:scale-90 hover:scale-105`}
              aria-label="Caption Transparency"
            >
              <SharedTooltip label="Caption Transparency" isDark={isDark} isAuditory />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="!w-[22px] !h-[22px] shrink-0">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <rect x="7" y="13" width="10" height="4" rx="1" />
              </svg>
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              className={`${btnBaseClass} ${btnHoverClass} relative z-10 active:scale-90 hover:scale-105`}
              aria-label="Settings"
            >
              <SharedTooltip label="Settings" isDark={isDark} isAuditory />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="!w-[24px] !h-[24px] shrink-0">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Window Controls */}
      <div className={`relative flex flex-col items-center rounded-[28px] p-2 gap-1.5 shrink-0 mt-3 z-20 transition-all duration-300 transform-gpu backface-hidden ${controlPanelClass}`}>

        {/* Glow layer */}
        <div
          className="sensa-dock-pill absolute inset-0 rounded-[28px] pointer-events-none transition-colors duration-150"
          style={{
            willChange: 'box-shadow'
          }}
        />

        <button
          type="button"
          onClick={onMinimizeToggle}
          aria-expanded={!isMinimized}
          className={`${btnBaseClass} ${btnHoverClass} relative z-10 active:scale-90 hover:scale-105 transform-gpu backface-hidden`}
          aria-label={isMinimized ? "Expand Menu" : "Minimize Menu"}
        >
          <SharedTooltip label={isMinimized ? "Expand" : "Minimize"} isDark={isDark} isAuditory />

          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="!w-[22px] !h-[22px] shrink-0 transform-gpu backface-hidden will-change-transform"
            style={{
              transform: `rotate(${isMinimized ? 180 : 0}deg) translateZ(0)`,
              transformOrigin: '50% 50%',
              willChange: 'transform',
              transition: 'transform 260ms cubic-bezier(0.2, 0.9, 0.2, 1)'
            }}
          >
            <polyline points="7 15 12 10 17 15" />
            <polyline points="7 9 12 4 17 9" />
          </svg>
        </button>

        <div className={dividerClass} />

        <button
          type="button"
          onClick={onClose}
          className={closeBtnClass}
          aria-label="Close Toolbar"
        >
          <SharedTooltip label="Close" isRed isDark={isDark} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="!w-5 !h-5 shrink-0" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}