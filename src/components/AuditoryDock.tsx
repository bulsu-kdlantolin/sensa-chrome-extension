import React, { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Tooltip } from "./Tooltip"

// ============================================================================
// 🎯 ZERO-LAG SITE AUDIO VISUALIZER (Hunter-Seeker + TS Fixed)
// ============================================================================
const SiteAudioRadar = ({ isActive, isDark }: { isActive: boolean, isDark: boolean }) => {
  const barsRef = useRef<(HTMLDivElement | null)[]>([])
  const currentHeights = useRef([4, 6, 8, 6, 4])
  const tickRef = useRef(0)

  useEffect(() => {
    let animationId: number
    let audioCtx: AudioContext | null = null
    let analyser: AnalyserNode | null = null
    let dataArray: Uint8Array | null = null
    let currentMediaEl: HTMLMediaElement | null = null
    
    // 🚨 TS FIX: Explicitly type this as a browser number, not a NodeJS Timeout
    let hunterInterval: number | undefined

    const colors = [
      "rgba(253, 186, 116, 1)", 
      "rgba(249, 115, 22, 1)",  
      "rgba(255, 122, 47, 1)",  
      "rgba(249, 115, 22, 1)",  
      "rgba(253, 186, 116, 1)", 
    ]

    const shapeMask = [0.35, 0.7, 1.0, 0.7, 0.35]
    const maxHeights = [10, 14, 20, 14, 10]
    const idleHeights = [4, 6, 8, 6, 4]

    const lerp = (start: number, end: number, amt: number) => (1 - amt) * start + amt * end

    const attachToMedia = (mediaEl: HTMLMediaElement) => {
      try {
        if ((mediaEl as any)._sensaAnalyser) {
          analyser = (mediaEl as any)._sensaAnalyser
          dataArray = new Uint8Array(analyser!.frequencyBinCount)
          currentMediaEl = mediaEl
          return
        }

        if (!audioCtx) {
          audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
        }
        
        if (audioCtx.state === 'suspended') {
          audioCtx.resume()
        }

        analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.4 
        
        const source = audioCtx.createMediaElementSource(mediaEl)
        source.connect(analyser)
        analyser.connect(audioCtx.destination) 
        
        ;(mediaEl as any)._sensaAnalyser = analyser
        dataArray = new Uint8Array(analyser.frequencyBinCount)
        currentMediaEl = mediaEl

      } catch (e) {
        console.warn("Sensa: Media is cross-origin protected or already bound.", e)
      }
    }

    if (isActive) {
      // 🚨 HUNTER-SEEKER: Uses window.setInterval to bypass the NodeJS TS error
      hunterInterval = window.setInterval(() => {
        const allMedia = Array.from(document.querySelectorAll("video, audio")) as HTMLMediaElement[]
        const playingMedia = allMedia.find(m => !m.paused && m.currentTime > 0 && !m.muted) || allMedia[0]

        if (playingMedia && playingMedia !== currentMediaEl) {
          attachToMedia(playingMedia)
        }
      }, 1500)

      const draw = () => {
        tickRef.current += 0.05
        const tick = tickRef.current
        let energy = 0

        if (isActive && analyser && dataArray) {
          analyser.getByteFrequencyData(dataArray as any)
          
          let sum = 0;
          for (let i = 2; i < 40; i++) sum += dataArray[i];
          energy = (sum / 38) / 255; 
        }

        barsRef.current.forEach((bar, i) => {
          if (!bar) return
          let targetHeight = idleHeights[i]

          if (isActive && energy > 0.01) {
            const noiseSpike = (energy * 30) * shapeMask[i]
            targetHeight = Math.min(maxHeights[i], idleHeights[i] + noiseSpike)
          } else {
            const breath = Math.sin(tick - i * 0.5) * 1.5
            targetHeight = idleHeights[i] + breath
          }

          const isRising = targetHeight > currentHeights.current[i]
          const amt = energy > 0.01 ? (isRising ? 0.5 : 0.15) : 0.05
          currentHeights.current[i] = lerp(currentHeights.current[i], targetHeight, amt)

          bar.style.height = `${currentHeights.current[i]}px`
          bar.style.backgroundColor = colors[i]
        })

        animationId = requestAnimationFrame(draw)
      }
      draw()
    }

    return () => {
      if (animationId) cancelAnimationFrame(animationId)
      // Safely clear the browser interval
      if (hunterInterval !== undefined) window.clearInterval(hunterInterval)
    }
  }, [isActive])

  return (
    <div className="flex items-center justify-center gap-[2px] w-full h-full">
      {[0, 1, 2, 3, 4].map((index) => (
        <div
          key={index}
          ref={(el) => (barsRef.current[index] = el)}
          className="w-[3px] rounded-full transition-transform"
          style={{ height: "4px", backgroundColor: "currentColor", willChange: "height" }}
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
      <div className={`flex flex-col items-center ${pillBg} rounded-full p-[6px] border-2 border-[#FF7A2F] shadow-lg gap-[8px]`}>
        
        {/* 🎯 FIXED VISUAL SOUND RADAR (Toggle removed, permanently ON) */}
        <div 
          className={`relative group w-[40px] h-[40px] flex items-center justify-center rounded-full ${hoverInactive} transition-colors ${iconColorInactive} cursor-default`}
        >
          <Tooltip label="Audio Visualizer" isDark={isDark} />
          <div className="flex items-center justify-center h-[20px] w-[28px]">
            <SiteAudioRadar isActive={true} isDark={isDark} />
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
        <div className={`flex flex-col items-center ${pillBg} rounded-full p-[6px] border-2 border-[#FF7A2F] shadow-lg gap-[6px]`}>
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
      <div className={`flex flex-col items-center ${pillBg} rounded-full p-[6px] border-2 border-[#FF7A2F] shadow-lg gap-[8px]`}>
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