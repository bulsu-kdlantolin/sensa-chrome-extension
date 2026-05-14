import React, { useEffect, useRef, useState } from "react"

// ============================================================================
// 🎯 PREMIUM TOOLTIP (Fixed to pop out to the LEFT instead of off-screen)
// ============================================================================
export const Tooltip = ({ 
  label, 
  isDark, 
  isRed = false,
  isAuditory = false
}: { 
  label: string
  isDark: boolean
  isRed?: boolean
  isAuditory?: boolean
}) => {
  return (
    <span 
      className={`
        absolute right-full mr-3 px-3 py-1.5 text-xs font-semibold rounded-lg
        opacity-0 pointer-events-none group-hover:opacity-100
        transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]
        whitespace-nowrap z-50 shadow-xl
        translate-x-2 group-hover:translate-x-0
        ${isDark 
          ? 'bg-gradient-to-b from-[#2C2C2E]/95 to-[#1C1C1E]/95 backdrop-blur-xl text-white/90 border border-white/10' 
          : 'bg-gradient-to-b from-white/95 to-gray-50/95 backdrop-blur-xl text-gray-800 border border-black/5'
        }
        ${isRed ? '!bg-gradient-to-b !from-red-500/95 !to-red-600/95 !text-white !border-red-400/20' : ''}
      `}
    >
      {label}
    </span>
  )
}

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

    let gameAudioArray: Uint8Array | null = null
    let lastGameAudioTick = 0

    const shapeMask = [0.35, 0.7, 1.0, 0.7, 0.35]
    const maxHeights = [10, 14, 20, 14, 10]
    const idleHeights = [4, 6, 8, 6, 4]
    
    const borderBaseColor = isDark ? 'rgba(255,122,47,0.4)' : 'rgba(255,122,47,0.5)'

    const lerp = (start: number, end: number, amt: number) => (1 - amt) * start + amt * end

    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'SENSA_GAME_AUDIO_FREQUENCY') {
        if (!gameAudioArray || gameAudioArray.length !== event.data.frequencies.length) {
          gameAudioArray = new Uint8Array(event.data.frequencies)
        } else {
          gameAudioArray.set(event.data.frequencies)
        }
        lastGameAudioTick = Date.now() 
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

        let activeData: Uint8Array | null = null

        const hasGamePacket = gameAudioArray && Date.now() - lastGameAudioTick < 100
        let gameSignal = 0
        if (hasGamePacket && gameAudioArray) {
          let gameSum = 0
          for (let i = 2; i < 40; i++) gameSum += gameAudioArray[i]
          gameSignal = gameSum / 38
        }

        if (hasGamePacket && gameAudioArray && gameSignal > 3) {
          activeData = gameAudioArray
        } else if (analyser && dataArray) {
          analyser.getByteFrequencyData(dataArray as any)
          activeData = dataArray
        } else if (hasGamePacket && gameAudioArray) {
          activeData = gameAudioArray
        }

        if (activeData) {
          let sum = 0;
          for (let i = 2; i < 40; i++) sum += activeData[i]
          visualizerEnergy = (sum / 38) / 255 

          for (let i = 2; i < 11; i++) voiceMusicBaseline += activeData[i]  
          voiceMusicBaseline = Math.max(1, voiceMusicBaseline / 9) 

          for (let i = 12; i < 26; i++) greenPingPeak = Math.max(greenPingPeak, activeData[i]) 
          for (let i = 28; i < 60; i++) redAlarmPeak = Math.max(redAlarmPeak, activeData[i])   

          for (let i = 2; i < 70; i++) totalBroadbandEnergy += activeData[i]
          totalBroadbandEnergy /= 68

          let weightedSum = 0, totalWeight = 0
          for (let i = 2; i < 90; i++) {
            weightedSum += i * activeData[i]
            totalWeight += activeData[i]
          }
          if (totalWeight > 0) {
            dominantFrequencyIndex = weightedSum / totalWeight
          }
        }

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

        const dockPills = document.querySelectorAll('.sensa-dock-pill') as NodeListOf<HTMLElement>
        dockPills.forEach(pill => {
          pill.style.borderColor = smoothedColor
          if (visualizerEnergy > 0.05) {
            // Added premium inset shadow during audio playback
            pill.style.boxShadow = `0 0 24px ${smoothedColor}70, inset 0 0 12px ${smoothedColor}20` 
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
        htmlPill.style.borderColor = borderBaseColor
        htmlPill.style.boxShadow = ''
      })
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

// ============================================================================
// MAIN AUDITORY DOCK COMPONENT (Premium Theme Integration)
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

export default function AuditoryDock({
  isDark,
  isMinimized,
  isCaptionsActive,
  onToggleCaptions,
  onMinimizeToggle,
  onOpenCaptionLanguage,
  onOpenTextSize,
  onOpenCaptionTransparency,
  isFocusMode,
  onToggleFocusMode,
  onOpenSettings,
  onClose
}: AuditoryDockProps) {
  
  // 🌟 PREMIUM GLASSMORPHISM: Merged your transform-gpu with Vercel's elegant gradients
  const glassPanelClass = isDark 
    ? "bg-gradient-to-b from-[#2A2A2E]/80 to-[#1C1C1E]/80 backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.06)] transform-gpu backface-hidden" 
    : "bg-gradient-to-b from-white/95 to-gray-50/90 backdrop-blur-3xl shadow-[0_8px_32px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.9)] transform-gpu backface-hidden"
    
  // 🌟 PREMIUM SPRING PHYSICS: Applied the snappy cubic-bezier to your exact button dimensions
  const springTransition = "transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]"

  const btnBaseClass = `relative group !w-[44px] !h-[44px] !min-w-[44px] !min-h-[44px] !p-0 !m-0 flex items-center justify-center rounded-full shrink-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF7A2F]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent box-border will-change-[transform] transform-gpu backface-hidden ${springTransition}`
  
  const btnHoverClass = isDark 
    ? "hover:bg-[#FF7A2F]/15 text-gray-300 hover:text-white" 
    : "hover:bg-[#FF7A2F]/10 text-gray-600 hover:text-[#FF7A2F]"

  // 🌟 PREMIUM ACTIVE BUTTONS: Fiery Orange Gradient with outer/inner drop-shadows
  const activeButtonClass = `
    bg-gradient-to-br from-[#FF7A2F] to-[#E86A25] 
    text-white shadow-[0_4px_20px_rgba(255,122,47,0.4),inset_0_1px_0_rgba(255,255,255,0.2)]
    hover:shadow-[0_4px_25px_rgba(255,122,47,0.6),inset_0_1px_0_rgba(255,255,255,0.3)]
    scale-105 ring-[0px] ring-[#FF7A2F]/0
  `

  // Subtle separator line
  const dividerClass = isDark 
    ? "w-6 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent my-0.5" 
    : "w-6 h-px bg-gradient-to-r from-transparent via-black/10 to-transparent my-0.5"

  return (
    <div 
      className="flex flex-col w-fit shrink-0 box-border relative z-50"
      role="toolbar" 
      aria-label="Auditory and Caption Controls"
    >
      
      {/* ========================================================= */}
      {/* 🔝 TOP SECTION: VISUALIZER & CAPTIONS */}
      {/* ========================================================= */}
      <div className={`relative flex flex-col items-center rounded-[28px] p-2 gap-1.5 shrink-0 z-30 transition-all duration-300 ${glassPanelClass}`}>
        
        {/* ISOLATED GLOW LAYER */}
        <div 
          className="sensa-dock-pill absolute inset-0 rounded-[28px] border-[1.5px] pointer-events-none transition-colors duration-150" 
          style={{ 
            borderColor: isDark ? 'rgba(255,122,47,0.3)' : 'rgba(255,122,47,0.4)',
            willChange: 'border-color, box-shadow' 
          }} 
        />

        {/* Visualizer Frame */}
        <div className={`${btnBaseClass} bg-transparent cursor-default relative z-10`}>
          <Tooltip label="Sound Visualizer" isDark={isDark} isAuditory />
          <SiteAudioSystem isActive={true} isDark={isDark} />
          <svg viewBox="0 0 24 24" fill="currentColor" className={`absolute !w-[18px] !h-[18px] shrink-0 opacity-10 pointer-events-none ${isDark ? 'text-white' : 'text-black'}`}>
            <rect x="5" y="10" width="2" height="4" rx="1" />
            <rect x="9" y="7" width="2" height="10" rx="1" />
            <rect x="13" y="4" width="2" height="16" rx="1" />
            <rect x="17" y="8" width="2" height="8" rx="1" />
          </svg>
        </div>

        <div className={dividerClass} />

        <button
          type="button"
          onClick={onToggleCaptions}
          aria-pressed={isCaptionsActive}
          className={`${btnBaseClass} relative z-10 active:scale-90 ${
            isCaptionsActive 
              ? activeButtonClass 
              : `bg-gradient-to-br from-[#FF7A2F] to-[#E86A25] text-white/90 shadow-[0_2px_12px_rgba(255,122,47,0.3)] hover:shadow-[0_4px_20px_rgba(255,122,47,0.5)] hover:scale-105`
          }`}
        >
          <Tooltip label={isCaptionsActive ? "Turn Off Captions" : "Turn On Captions"} isDark={isDark} isAuditory />
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

      {/* ========================================================= */}
      {/* ↔️ MIDDLE SECTION: SETTINGS */}
      {/* ========================================================= */}
      <div 
        className={`grid w-full transform-gpu backface-hidden will-change-[grid-template-rows] ${springTransition} ${
          isMinimized ? "grid-rows-[0fr] mt-0" : "grid-rows-[1fr] mt-3"
        }`}
      >
        <div className="min-h-0 flex justify-center w-full">
          <div 
            className={`relative flex flex-col items-center rounded-[28px] p-2 gap-1.5 w-fit origin-top transform-gpu backface-hidden will-change-[opacity,transform] ${springTransition} ${glassPanelClass} ${
              isMinimized 
                ? "opacity-0 scale-75 -translate-y-4 pointer-events-none" 
                : "opacity-100 scale-100 translate-y-0 pointer-events-auto"
            }`}
          >
            {/* ISOLATED GLOW LAYER */}
            <div 
              className="sensa-dock-pill absolute inset-0 rounded-[28px] border-[1.5px] pointer-events-none transition-colors duration-150" 
              style={{ 
                borderColor: isDark ? 'rgba(255,122,47,0.3)' : 'rgba(255,122,47,0.4)',
                willChange: 'border-color, box-shadow' 
              }} 
            />

            <button
              onClick={onOpenCaptionLanguage}
              className={`${btnBaseClass} ${btnHoverClass} relative z-10 active:scale-90 hover:scale-105`}
              aria-label="Caption Language"
            >
              <Tooltip label="Caption Language" isDark={isDark} isAuditory />
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
              <Tooltip label="Text Size" isDark={isDark} isAuditory />
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
              <Tooltip label="Caption Transparency" isDark={isDark} isAuditory />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="!w-[22px] !h-[22px] shrink-0">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <rect x="7" y="13" width="10" height="4" rx="1" />
              </svg>
            </button>

            <div className={dividerClass} />

            <button
              onClick={onToggleFocusMode}
              aria-pressed={isFocusMode}
              className={`${btnBaseClass} relative z-10 active:scale-90 ${
                isFocusMode 
                  ? activeButtonClass 
                  : `${btnHoverClass} hover:scale-105`
              }`}
            >
              <Tooltip label="Focus Mode" isDark={isDark} isAuditory />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="!w-[22px] !h-[22px] shrink-0">
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
              className={`${btnBaseClass} ${btnHoverClass} relative z-10 active:scale-90 hover:scale-105`}
              aria-label="Settings"
            >
              <Tooltip label="Settings" isDark={isDark} isAuditory />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="!w-[24px] !h-[24px] shrink-0">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 🔽 BOTTOM SECTION: WINDOW CONTROLS */}
      {/* ========================================================= */}
      <div className={`relative flex flex-col items-center rounded-[28px] p-2 gap-1.5 shrink-0 mt-3 z-20 transition-all duration-300 transform-gpu backface-hidden ${glassPanelClass}`}>
        
        {/* ISOLATED GLOW LAYER */}
        <div 
          className="sensa-dock-pill absolute inset-0 rounded-[28px] border-[1.5px] pointer-events-none transition-colors duration-150" 
          style={{ 
            borderColor: isDark ? 'rgba(255,122,47,0.3)' : 'rgba(255,122,47,0.4)',
            willChange: 'border-color, box-shadow' 
          }} 
        />

        <button
          type="button"
          onClick={onMinimizeToggle}
          aria-expanded={!isMinimized}
          className={`${btnBaseClass} ${btnHoverClass} relative z-10 active:scale-90 hover:scale-105 transform-gpu backface-hidden`}
          aria-label={isMinimized ? "Expand Menu" : "Minimize Menu"}
        >
          <Tooltip label={isMinimized ? "Expand" : "Minimize"} isDark={isDark} isAuditory />
          
          <svg 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className={`!w-[22px] !h-[22px] shrink-0 transform-gpu backface-hidden will-change-transform ${springTransition} ${isMinimized ? "rotate-180" : "rotate-0"}`} 
            aria-hidden="true"
          >
            <polyline points="7 15 12 10 17 15" />
            <polyline points="7 9 12 4 17 9" />
          </svg>
        </button>

        <div className={dividerClass} />

        <button
          type="button"
          onClick={onClose}
          className={`${btnBaseClass} relative z-10 transition-colors text-gray-500 hover:text-white dark:text-gray-400 active:scale-90 hover:scale-105 ${isDark ? 'hover:bg-red-500/80' : 'hover:bg-red-500/90'}`}
          aria-label="Close Toolbar"
        >
          <Tooltip label="Close" isRed isDark={isDark} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="!w-[24px] !h-[24px] shrink-0" aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}