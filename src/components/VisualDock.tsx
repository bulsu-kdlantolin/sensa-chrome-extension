import React, { useEffect, useRef } from "react"
import { Tooltip } from "./Tooltip"
import { useUIHoverAudio } from "../hooks/useUIHoverAudio"

// ============================================================================
// 🎙️ THE GOD-TIER MIC ICON
// ============================================================================
const GodTierMicIcon = ({ isActive }: { isActive: boolean }) => {
  const barsRef = useRef<(HTMLDivElement | null)[]>([])
  const currentHeights = useRef([4, 6, 8, 6, 4])
  const tickRef = useRef(0)

  useEffect(() => {
    let animationId: number
    let audioCtx: AudioContext | null = null
    let analyser: AnalyserNode | null = null
    let stream: MediaStream | null = null

    const colors = [
      "rgba(147, 197, 253, 1)", 
      "rgba(59, 130, 246, 1)",  
      "rgba(10, 68, 255, 1)",   
      "rgba(59, 130, 246, 1)",  
      "rgba(147, 197, 253, 1)", 
    ]

    const shapeMask = [0.35, 0.7, 1.0, 0.7, 0.35]
    const maxHeights = [10, 16, 24, 16, 10]
    const idleHeights = [4, 6, 8, 6, 4]

    const lerp = (start: number, end: number, amt: number) => (1 - amt) * start + amt * end

    const startMic = async () => {
      try {
        if (isActive) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true })
          audioCtx = new window.AudioContext()
          analyser = audioCtx.createAnalyser()
          analyser.fftSize = 64
          analyser.smoothingTimeConstant = 0.5
          const source = audioCtx.createMediaStreamSource(stream)
          source.connect(analyser)
        }

        const dataArray = analyser ? new Uint8Array(analyser.frequencyBinCount) : null

        const draw = () => {
          tickRef.current += 0.05
          const tick = tickRef.current
          let energy = 0

          if (isActive && analyser && dataArray) {
            analyser.getByteFrequencyData(dataArray)
            for (let i = 2; i < 12; i++) {
              energy += dataArray[i]
            }
            energy = (energy / 10) / 255
          }

          barsRef.current.forEach((bar, i) => {
            if (!bar) return

            let targetHeight = idleHeights[i]

            if (isActive) {
              const voiceSpike = (energy * 30) * shapeMask[i]
              targetHeight = Math.min(maxHeights[i], idleHeights[i] + voiceSpike)
            } else {
              const breath = Math.sin(tick - i * 0.5) * 1.5
              targetHeight = idleHeights[i] + breath
            }

            const isRising = targetHeight > currentHeights.current[i]
            const amt = isActive ? (isRising ? 0.4 : 0.1) : 0.05
            
            currentHeights.current[i] = lerp(currentHeights.current[i], targetHeight, amt)

            const intensity = currentHeights.current[i] / maxHeights[i]
            const shadowRadius = isActive ? intensity * 12 : intensity * 4
            const opacity = isActive ? Math.max(0.6, intensity + 0.2) : 0.5

            bar.style.height = `${currentHeights.current[i]}px`
            bar.style.backgroundColor = colors[i]
            bar.style.boxShadow = `0 0 ${shadowRadius}px ${colors[i].replace('1)', `${opacity})`)}`
            bar.style.opacity = `${opacity}`
          })

          animationId = requestAnimationFrame(draw)
        }
        draw()
      } catch (err) {
        console.error("Mic access denied or failed.", err)
      }
    }

    startMic()

    return () => {
      if (animationId) cancelAnimationFrame(animationId)
      if (stream) stream.getTracks().forEach((track) => track.stop())
      if (audioCtx) audioCtx.close()
    }
  }, [isActive])

  return (
    <div className="flex items-center justify-center gap-[2px] w-6 h-6">
      {[0, 1, 2, 3, 4].map((index) => (
        <div
          key={index}
          ref={(el) => (barsRef.current[index] = el)}
          className="w-[3px] rounded-full transition-transform"
          style={{ 
            height: "4px", 
            backgroundColor: "currentColor",
            willChange: "height, box-shadow" 
          }}
        />
      ))}
    </div>
  )
}

// ============================================================================
// MAIN VISUAL DOCK COMPONENT
// ============================================================================
interface VisualDockProps {
  isDark: boolean
  isMinimized: boolean
  readingSpeed: number
  isPlaying: boolean
  isPaused: boolean
  isVoiceCommandActive: boolean
  canRestart: boolean
  onTogglePlay: () => void
  onToggleVoiceCommand: () => void
  onNext: () => void
  onPrev: () => void
  onRestart: () => void
  onMinimizeToggle: () => void
  onOpenReadingSpeed: () => void
  onOpenSettings: () => void
  onClose: () => void
}

export default function VisualDock({
  isDark,
  isMinimized,
  readingSpeed,
  isPlaying,
  isPaused,
  isVoiceCommandActive,
  canRestart,
  onTogglePlay,
  onToggleVoiceCommand,
  onNext,
  onPrev,
  onRestart,
  onMinimizeToggle,
  onOpenReadingSpeed,
  onOpenSettings,
  onClose,
}: VisualDockProps) {
  const { playHoverAudio, cancelHoverAudio } = useUIHoverAudio()
  
  // 🚨 Premium UI Design System Variables
  const glassPanelClass = isDark 
    ? "bg-[#1C1C1E]/80 backdrop-blur-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)]" 
    : "bg-white/80 backdrop-blur-2xl border border-black/5 shadow-[0_8px_32px_rgba(0,0,0,0.12)]"
    
  const btnBaseClass = "relative group w-10 h-10 flex items-center justify-center rounded-full transition-all duration-300 ease-out flex-shrink-0"
  
  const btnHoverClass = isDark 
    ? "hover:bg-white/10 text-gray-300 hover:text-white" 
    : "hover:bg-black/5 text-gray-600 hover:text-black"
    
  const btnAccentClass = "bg-[#0A44FF] text-white shadow-md shadow-[#0A44FF]/20 hover:bg-[#0836CC] hover:shadow-lg hover:shadow-[#0A44FF]/40 hover:scale-105 active:scale-95"

  const readingSpeedLabel = `${readingSpeed.toFixed(2).replace(/\.00$/, "")}X`
  
  const getHoverHandlers = (label: string) => ({
    onMouseEnter: () => playHoverAudio(label),
    onMouseLeave: cancelHoverAudio
  })

  return (
    <div className="flex flex-col gap-2.5">
      
      {/* --- TOP SECTION: MICROPHONE & VISUALIZER --- */}
      <div className={`flex flex-col items-center rounded-[24px] p-1.5 gap-1.5 ${glassPanelClass}`}>
        <button 
          type="button" 
          onClick={onToggleVoiceCommand}
          className={`${btnBaseClass} ${btnHoverClass} bg-transparent active:scale-95`} 
          {...getHoverHandlers("Audio Visualizer")}
        >
          <Tooltip label="Audio Visualizer" isDark={isDark} />
          <GodTierMicIcon isActive={isVoiceCommandActive} />
        </button>

        {/* 🚨 UPDATED: Removed pulse. Added elegant glowing ring and solid drop shadow */}
        <button
          type="button"
          onClick={onToggleVoiceCommand}
          className={`${btnBaseClass} bg-[#0A44FF] text-white transition-all duration-500 active:scale-95 ${
            isVoiceCommandActive 
              ? "shadow-[0_0_24px_rgba(10,68,255,0.6)] ring-4 ring-[#0A44FF]/20 bg-[#0A44FF]" 
              : "shadow-md hover:bg-[#0836CC] hover:shadow-lg hover:shadow-[#0A44FF]/40 hover:scale-105"
          }`}
          aria-label={isVoiceCommandActive ? "Stop Listening" : "Speak"}
          {...getHoverHandlers(isVoiceCommandActive ? "Stop Listening" : "Speak")}
        >
          <Tooltip label={isVoiceCommandActive ? "Stop Listening" : "Speak"} isDark={isDark} />
          <div className="relative flex items-center justify-center w-full h-full">
            <svg 
              viewBox="0 0 24 24" 
              fill="currentColor" 
              className={`absolute w-4 h-4 transition-all duration-300 ${isVoiceCommandActive ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}
            >
              <rect x="7" y="7" width="10" height="10" rx="2" />
            </svg>
            <svg 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              className={`absolute w-5 h-5 transition-all duration-300 ${isVoiceCommandActive ? 'opacity-0 scale-150' : 'opacity-100 scale-100'}`}
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          </div>
        </button>
      </div>

      {/* --- MIDDLE SECTION: PLAYBACK CONTROLS --- */}
      {!isMinimized && (
        <div className={`flex flex-col items-center rounded-[24px] p-1.5 gap-1.5 ${glassPanelClass}`}>
          <button
            type="button"
            onClick={onTogglePlay}
            className={`${btnBaseClass} ${btnAccentClass}`}
            aria-label={isPlaying && !isPaused ? "Pause speech" : "Play speech"}
            {...getHoverHandlers(isPlaying && !isPaused ? "Pause" : "Play")}
          >
            <Tooltip label={isPlaying && !isPaused ? "Pause" : "Play"} isDark={isDark} />
            {isPlaying && !isPaused ? (
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <rect x="7" y="6" width="3" height="12" rx="1" />
                <rect x="14" y="6" width="3" height="12" rx="1" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 ml-1">
                <polygon points="6 4 19 12 6 20 6 4" />
              </svg>
            )}
          </button>

          <button
            type="button"
            onClick={onNext}
            className={`${btnBaseClass} ${btnHoverClass} active:scale-95`}
            aria-label="Next segment"
            {...getHoverHandlers("Next")}
          >
            <Tooltip label="Next" isDark={isDark} />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <polygon points="5 4 15 12 5 20 5 4" />
              <line x1="19" y1="5" x2="19" y2="19" />
            </svg>
          </button>

          <button
            type="button"
            onClick={onPrev}
            className={`${btnBaseClass} ${btnHoverClass} active:scale-95`}
            aria-label="Previous segment"
            {...getHoverHandlers("Previous")}
          >
            <Tooltip label="Previous" isDark={isDark} />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <polygon points="19 20 9 12 19 4 19 20" />
              <line x1="5" y1="19" x2="5" y2="5" />
            </svg>
          </button>

          <button
            type="button"
            onClick={onRestart}
            disabled={!canRestart}
            className={`${btnBaseClass} ${btnHoverClass} ${canRestart ? "active:scale-95" : "opacity-30 cursor-not-allowed hover:bg-transparent"}`}
            aria-label="Restart from beginning"
            {...getHoverHandlers("Restart")}
          >
            <Tooltip label="Restart" isDark={isDark} />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <polyline points="21 3 21 8 16 8" />
            </svg>
          </button>

          {/* Separator Line */}
          <div className={`w-6 h-px my-1 ${isDark ? 'bg-white/10' : 'bg-black/10'}`} />

          <button
            type="button"
            onClick={onOpenReadingSpeed}
            className={`${btnBaseClass} ${btnHoverClass} font-bold text-xs tracking-wider active:scale-95`}
            {...getHoverHandlers("Reading Speed")}
          >
            <Tooltip label="Reading Speed" isDark={isDark} />
            {readingSpeedLabel}
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className={`${btnBaseClass} ${btnHoverClass} active:scale-95`}
            {...getHoverHandlers("Settings")}
          >
            <Tooltip label="Settings" isDark={isDark} />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      )}

      {/* --- BOTTOM SECTION: WINDOW CONTROLS --- */}
      <div className={`flex flex-col items-center rounded-[24px] p-1.5 gap-1.5 ${glassPanelClass}`}>
        <button
          type="button"
          onClick={onMinimizeToggle}
          className={`${btnBaseClass} ${btnHoverClass} active:scale-95`}
          {...getHoverHandlers(isMinimized ? "Expand" : "Minimize")}
        >
          <Tooltip label={isMinimized ? "Expand" : "Minimize"} isDark={isDark} />
          {isMinimized ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <polyline points="7 15 12 10 17 15" />
              <polyline points="7 9 12 4 17 9" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <polyline points="7 9 12 14 17 9" />
              <polyline points="7 15 12 20 17 15" />
            </svg>
          )}
        </button>

        <button
          type="button"
          onClick={onClose}
          className={`${btnBaseClass} hover:bg-red-500 hover:text-white transition-colors text-gray-500 dark:text-gray-400 active:scale-95`}
          {...getHoverHandlers("Close")}
        >
          <Tooltip label="Close" isRed isDark={isDark} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}