import React, { useEffect, useRef, useState } from "react"
import { Tooltip } from "./Tooltip"

// ============================================================================
// 🎯 SITE-ONLY DUAL ENGINE: Unfiltered Transient + Game Audio Interceptor
// ============================================================================
const SiteAudioSystem = ({ isActive, isDark }: { isActive: boolean, isDark: boolean }) => {
  const barsRef = useRef<(HTMLDivElement | null)[]>([])
  const currentHeights = useRef([4, 6, 8, 6, 4])
  const tickRef = useRef(0)

  useEffect(() => {
    let animationId: number
    let audioCtx: AudioContext | null = null
    let analyser: AnalyserNode | null = null
    let dataArray: Uint8Array | null = null
    let hunterInterval: number | undefined

    // 🚨 NEW: Variables to catch Copilot's intercepted game audio
    let gameAudioArray: Uint8Array | null = null
    let lastGameAudioTick = 0

    const shapeMask = [0.35, 0.7, 1.0, 0.7, 0.35]
    const maxHeights = [10, 14, 20, 14, 10]
    const idleHeights = [4, 6, 8, 6, 4]

    // 🎨 The 3 State Palettes[cite: 1]
    const palettes = {
      orange: {
        bars: ["rgba(253,186,116,1)", "rgba(249,115,22,1)", "rgba(255,122,47,1)", "rgba(249,115,22,1)", "rgba(253,186,116,1)"],
        border: "#FF7A2F",
        shadow: "" 
      },
      green: {
        bars: ["#86EFAC", "#22C55E", "#16A34A", "#22C55E", "#86EFAC"],
        border: "#22C55E",
        shadow: "0 0 25px rgba(34, 197, 94, 0.8)"
      },
      red: {
        bars: ["#FCA5A5", "#EF4444", "#DC2626", "#EF4444", "#FCA5A5"],
        border: "#EF4444",
        shadow: "0 0 25px rgba(239, 68, 68, 0.8)"
      }
    }

    const lerp = (start: number, end: number, amt: number) => (1 - amt) * start + amt * end

    // Listen for Copilot's Game Audio Interceptor
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'SENSA_GAME_AUDIO_FREQUENCY') {
        if (!gameAudioArray || gameAudioArray.length !== event.data.frequencies.length) {
          gameAudioArray = new Uint8Array(event.data.frequencies)
        } else {
          gameAudioArray.set(event.data.frequencies)
        }
        lastGameAudioTick = Date.now() // Track when we last heard the game
      }
    }

    window.addEventListener('message', handleMessage)

    const attachToSiteMedia = (mediaEl: HTMLMediaElement) => {
      try {
        if ((mediaEl as any)._sensaConnected) return

        if (!audioCtx) {
          audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
          analyser = audioCtx.createAnalyser()
          analyser.fftSize = 256
          analyser.smoothingTimeConstant = 0.02 
          
          analyser.connect(audioCtx.destination)
          dataArray = new Uint8Array(analyser.frequencyBinCount)
        }
        
        if (audioCtx.state === 'suspended') audioCtx.resume()

        const source = audioCtx.createMediaElementSource(mediaEl)
        source.connect(analyser!) 
        
        ;(mediaEl as any)._sensaConnected = true
      } catch (e) {
        console.warn("Sensa: Media is cross-origin protected or already bound.", e)
      }
    }

    if (isActive) {
      hunterInterval = window.setInterval(() => {
        const allMedia = Array.from(document.querySelectorAll("video, audio")) as HTMLMediaElement[]
        allMedia.forEach(media => {
          if (!media.paused && media.currentTime > 0 && !media.muted) attachToSiteMedia(media)
        })
      }, 1500)

      let activeTheme: 'orange' | 'green' | 'red' = 'orange'
      let themeHoldFrames = 0
      let smoothedColor = "#FF7A2F" 

      const draw = () => {
        tickRef.current += 0.05
        const tick = tickRef.current

        let visualizerEnergy = 0
        let voiceMusicBaseline = 0
        let greenPingPeak = 0
        let redAlarmPeak = 0
        let totalBroadbandEnergy = 0
        let dominantFrequencyIndex = 20 

        // 🚨 Choose which audio source to listen to.
        // Guard against "source lock" by only prioritizing game audio when it has real signal.
        let activeData: Uint8Array | null = null

        const hasGamePacket = gameAudioArray && Date.now() - lastGameAudioTick < 100
        let gameSignal = 0
        if (hasGamePacket && gameAudioArray) {
          let gameSum = 0
          for (let i = 2; i < 40; i++) gameSum += gameAudioArray[i]
          gameSignal = gameSum / 38
        }

        // Only trust interceptor data if it is actively carrying sound.
        if (hasGamePacket && gameAudioArray && gameSignal > 3) {
          activeData = gameAudioArray
        } else if (analyser && dataArray) {
          // Fallback to standard DOM media (YouTube/videos/music players)
          analyser.getByteFrequencyData(dataArray as any)
          activeData = dataArray
        } else if (hasGamePacket && gameAudioArray) {
          // Last-resort fallback for pages with only WebAudio game sound.
          activeData = gameAudioArray
        }

        if (activeData) {
          // Overall Volume (For Visualizer)
          let sum = 0;
          for (let i = 2; i < 40; i++) sum += activeData[i]
          visualizerEnergy = (sum / 38) / 255 

          // 1. Establish the "Noise Floor"
          for (let i = 2; i < 11; i++) voiceMusicBaseline += activeData[i]  
          voiceMusicBaseline = Math.max(1, voiceMusicBaseline / 9) 

          // 2. Scan for specific UI Pings and Alarms
          for (let i = 12; i < 26; i++) greenPingPeak = Math.max(greenPingPeak, activeData[i]) 
          for (let i = 28; i < 60; i++) redAlarmPeak = Math.max(redAlarmPeak, activeData[i])   

          // 3. Scan for "Violent Sounds"
          for (let i = 2; i < 70; i++) totalBroadbandEnergy += activeData[i]
          totalBroadbandEnergy /= 68

          // 4. Calculate dominant frequency for color mapping
          let weightedSum = 0, totalWeight = 0
          for (let i = 2; i < 90; i++) {
            weightedSum += i * activeData[i]
            totalWeight += activeData[i]
          }
          if (totalWeight > 0) {
            dominantFrequencyIndex = weightedSum / totalWeight
          }
        }

        // ==========================================
        // 🎨 FREQUENCY-BASED COLOR MAPPING[cite: 1]
        // ==========================================
        let targetColor = "#FF7A2F" 

        if (dominantFrequencyIndex < 15) {
          targetColor = "#FF9660"
        } else if (dominantFrequencyIndex < 30) {
          targetColor = "#FFB347"
        } else if (dominantFrequencyIndex < 50) {
          targetColor = "#FFD700"
        } else if (dominantFrequencyIndex < 70) {
          targetColor = "#FF8C00"
        } else {
          targetColor = "#FF4444"
        }

        smoothedColor = targetColor 

        // ==========================================
        // RADAR TRIGGER LOGIC[cite: 1]
        // ==========================================
        const isViolentSound = totalBroadbandEnergy > 160 
        
        if ((redAlarmPeak > 60 && redAlarmPeak > voiceMusicBaseline * 1.3) || isViolentSound) {
          activeTheme = 'red'
          themeHoldFrames = 50 
        } 
        else if (greenPingPeak > 60 && greenPingPeak > voiceMusicBaseline * 1.25 && !isViolentSound) {
          if (activeTheme !== 'red' || themeHoldFrames === 0) {
            activeTheme = 'green'
            themeHoldFrames = 50 
          }
        }

        if (themeHoldFrames > 0) {
          themeHoldFrames--
        } else {
          activeTheme = 'orange'
        }

        const currentStyle = palettes[activeTheme]

        // ==========================================
        // UI UPDATE 1: COLOR CHANGING BARS[cite: 1]
        // ==========================================
        barsRef.current.forEach((bar, i) => {
          if (!bar) return
          let targetHeight = idleHeights[i]

          if (visualizerEnergy > 0.01) {
            const noiseSpike = (visualizerEnergy * 28) * shapeMask[i] 
            targetHeight = Math.min(maxHeights[i], idleHeights[i] + noiseSpike)
          } else {
            const breath = Math.sin(tick - i * 0.5) * 1.5
            targetHeight = idleHeights[i] + breath
          }

          const isRising = targetHeight > currentHeights.current[i]
          const amt = visualizerEnergy > 0.01 ? (isRising ? 0.9 : 0.12) : 0.05
          currentHeights.current[i] = lerp(currentHeights.current[i], targetHeight, amt)

          bar.style.height = `${currentHeights.current[i]}px`
          bar.style.backgroundColor = smoothedColor
        })

        // ==========================================
        // UI UPDATE 2: DOCK BORDERS[cite: 1]
        // ==========================================
        const dockPills = document.querySelectorAll('.sensa-dock-pill') as NodeListOf<HTMLElement>
        dockPills.forEach(pill => {
          pill.style.borderColor = smoothedColor
          if (visualizerEnergy > 0.05) {
            pill.style.boxShadow = `0 0 20px ${smoothedColor}70`
          } else {
            pill.style.boxShadow = ''
          }
        })

        animationId = requestAnimationFrame(draw)
      }
      draw()
    }

    return () => {
      window.removeEventListener('message', handleMessage)
      if (animationId) cancelAnimationFrame(animationId)
      if (hunterInterval !== undefined) window.clearInterval(hunterInterval)
      document.querySelectorAll('.sensa-dock-pill').forEach((pill) => {
        const htmlPill = pill as HTMLElement
        htmlPill.style.borderColor = ''
        htmlPill.style.boxShadow = ''
      })
    }
  }, [isActive])

  return (
    <div className="flex items-center justify-center gap-[2px] w-full h-full">
      {[0, 1, 2, 3, 4].map((index) => (
        <div
          key={index}
          ref={(el) => (barsRef.current[index] = el)}
          className="w-[3px] rounded-full transition-colors duration-150"
          style={{ height: "4px", backgroundColor: "currentColor", willChange: "height, background-color" }}
        />
      ))}
    </div>
  )
}

// ============================================================================
// YOUR ORIGINAL AUDITORY DOCK (100% untouched UI)
// ============================================================================
interface AuditoryDockProps {
  isDark: boolean
  isMinimized: boolean
  isCaptionsActive: boolean
  onToggleCaptions: () => void
  onMinimizeToggle: () => void
  onOpenCaptionLanguage: () => void
  onOpenTextSize: () => void
  onOpenCaptionTransparency: () => void
  isFocusMode: boolean
  onToggleFocusMode: () => void
  onOpenSettings: () => void
  onClose: () => void
}

export default function AuditoryDock({ isDark, isMinimized, isCaptionsActive, onToggleCaptions, onMinimizeToggle, onOpenCaptionLanguage, onOpenTextSize, onOpenCaptionTransparency, isFocusMode, onToggleFocusMode, onOpenSettings, onClose }: AuditoryDockProps) {
  const pillBg = isDark ? "bg-gray-900" : "bg-white"
  const iconColorInactive = isDark ? "text-gray-300" : "text-black"
  const hoverInactive = isDark ? "hover:bg-gray-800" : "hover:bg-gray-100"

  return (
    <div className="flex flex-col gap-[12px]">
      
      {/* TOP PILL */}
      <div className={`sensa-dock-pill transition-all duration-300 flex flex-col items-center ${pillBg} rounded-full p-[6px] border-2 border-[#FF7A2F] shadow-lg gap-[8px]`}>
        
        <div className={`relative group w-[40px] h-[40px] flex items-center justify-center rounded-full ${hoverInactive} transition-colors ${iconColorInactive} cursor-default`}>
          <Tooltip label="Audio Visualizer" isDark={isDark} />
          <div className="flex items-center justify-center h-[20px] w-[28px]">
            <SiteAudioSystem isActive={true} isDark={isDark} />
          </div>
          <svg viewBox="0 0 24 24" fill="currentColor" className="absolute w-[16px] h-[16px] opacity-20 pointer-events-none">
            <rect x="5" y="10" width="2" height="4" rx="1" />
            <rect x="9" y="7" width="2" height="10" rx="1" />
            <rect x="13" y="4" width="2" height="16" rx="1" />
            <rect x="17" y="8" width="2" height="8" rx="1" />
          </svg>
        </div>

        <button
          type="button"
          onClick={onToggleCaptions}
          aria-pressed={isCaptionsActive}
          className={`relative group w-[40px] h-[40px] flex items-center justify-center rounded-full text-white shadow-md transition-all ${isCaptionsActive ? "bg-[#E86A25] ring-2 ring-white/90 ring-offset-2 ring-offset-[#FF7A2F]" : "bg-[#FF7A2F] hover:bg-[#E86A25] opacity-85"}`}
        >
          <Tooltip label={isCaptionsActive ? "Turn Off Caption" : "Turn On Caption"} isDark={isDark} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-[20px] h-[20px]">
            <rect x="3" y="6" width="18" height="12" rx="2" />
            <path d="M10 10.5a2.5 2.5 0 0 0-3.5 0" />
            <path d="M10 13.5a2.5 2.5 0 0 1-3.5 0" />
            <path d="M17.5 10.5a2.5 2.5 0 0 0-3.5 0" />
            <path d="M17.5 13.5a2.5 2.5 0 0 1-3.5 0" />
          </svg>
          {isCaptionsActive && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-lime-300 border border-white" />
          )}
        </button>
      </div>

      {/* MIDDLE PILL */}
      {!isMinimized && (
        <div className={`sensa-dock-pill transition-all duration-300 flex flex-col items-center ${pillBg} rounded-full p-[6px] border-2 border-[#FF7A2F] shadow-lg gap-[6px]`}>
          <button
            onClick={onOpenCaptionLanguage}
            className={`relative group w-[40px] h-[40px] flex items-center justify-center rounded-full ${hoverInactive} transition-colors ${iconColorInactive}`}
          >
            <Tooltip label="Caption Language" isDark={isDark} />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[20px] h-[20px]">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
              <path d="M2 12h20" />
            </svg>
          </button>
          <button
            onClick={onOpenTextSize}
            className={`relative group w-[40px] h-[40px] flex items-center justify-center rounded-full ${hoverInactive} transition-colors ${iconColorInactive}`}
          >
            <Tooltip label="Text Size" isDark={isDark} />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-[20px] h-[20px]">
              <polyline points="4 7 4 4 20 4 20 7" />
              <line x1="12" y1="4" x2="12" y2="20" />
              <line x1="8" y1="20" x2="16" y2="20" />
            </svg>
          </button>
          <button
            onClick={onOpenCaptionTransparency}
            className={`relative group w-[40px] h-[40px] flex items-center justify-center rounded-full ${hoverInactive} transition-colors ${iconColorInactive}`}
          >
            <Tooltip label="Caption Transparency" isDark={isDark} />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[20px] h-[20px]">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <rect x="7" y="13" width="10" height="4" rx="1" />
            </svg>
          </button>
          <button
            onClick={onToggleFocusMode}
            className={`relative group w-[40px] h-[40px] flex items-center justify-center rounded-full transition-colors ${isFocusMode ? "bg-[#FF7A2F] text-white shadow-md hover:bg-[#E86A25]" : `${hoverInactive} ${iconColorInactive}`}`}
          >
            <Tooltip label="Focus Mode" isDark={isDark} />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[20px] h-[20px]">
              <path d="M3 8V5a2 2 0 0 1 2-2h3" />
              <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
              <path d="M3 16v3a2 2 0 0 0 2 2h3" />
              <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className={`relative group w-[40px] h-[40px] flex items-center justify-center rounded-full ${hoverInactive} transition-colors ${iconColorInactive}`}
          >
            <Tooltip label="Settings" isDark={isDark} />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-[24px] h-[24px]">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      )}

      {/* BOTTOM PILL */}
      <div className={`sensa-dock-pill transition-all duration-300 flex flex-col items-center ${pillBg} rounded-full p-[6px] border-2 border-[#FF7A2F] shadow-lg gap-[8px]`}>
        <button 
          onClick={onMinimizeToggle}
          className={`relative group w-[40px] h-[40px] flex items-center justify-center rounded-full ${hoverInactive} transition-colors ${iconColorInactive}`}
        >
          <Tooltip label={isMinimized ? "Expand" : "Minimize"} isDark={isDark} />
          {isMinimized ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-[20px] h-[20px]">
              <polyline points="7 15 12 10 17 15" />
              <polyline points="7 9 12 4 17 9" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-[20px] h-[20px]">
              <polyline points="7 9 12 14 17 9" />
              <polyline points="7 15 12 20 17 15" />
            </svg>
          )}
        </button>

        <button 
          onClick={onClose}
          className={`relative group w-[40px] h-[40px] flex items-center justify-center rounded-full ${hoverInactive} transition-colors ${iconColorInactive}`}
        >
          <Tooltip label="Close" isRed isDark={isDark} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-[24px] h-[24px]">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}