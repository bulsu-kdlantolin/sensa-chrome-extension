import React, { useEffect, useRef, useState } from "react"
import { useUIHoverAudio } from "../hooks/useUIHoverAudio"

interface ReadingSpeedOverlayProps {
  onClose: () => void
  initialSpeed?: number
  onSpeedChange?: (speed: number) => void
  isDark?: boolean // 🚨 Added isDark to match the Dock's theme
}

export default function ReadingSpeedOverlay({ onClose, initialSpeed = 1, onSpeedChange, isDark = false }: ReadingSpeedOverlayProps) {
  const [speed, setSpeed] = useState(initialSpeed)
  const { playHoverAudio, cancelHoverAudio } = useUIHoverAudio()
  
  // Dragging State
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [initialOffsetLoaded, setInitialOffsetLoaded] = useState(false)
  const [isMounted, setIsMounted] = useState(false) // For mount animations
  
  const offsetRef = useRef(offset)
  const draggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const offsetStartRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    // Trigger entrance animation
    requestAnimationFrame(() => setIsMounted(true))
  }, [])

  useEffect(() => {
    offsetRef.current = offset
  }, [offset])

  useEffect(() => {
    chrome.storage.local.get(["sensa_reading_speed_overlay_offset"], (result) => {
      if (result.sensa_reading_speed_overlay_offset) {
        setOffset(result.sensa_reading_speed_overlay_offset)
      }
      setInitialOffsetLoaded(true)
    })
  }, [])

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!draggingRef.current) return
      const dx = event.clientX - dragStartRef.current.x
      const dy = event.clientY - dragStartRef.current.y
      setOffset({ x: offsetStartRef.current.x + dx, y: offsetStartRef.current.y + dy })
    }

    const onUp = () => {
      if (!draggingRef.current) return
      draggingRef.current = false
      chrome.storage.local.set({ sensa_reading_speed_overlay_offset: offsetRef.current })
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)

    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [])

  const onHeaderMouseDown = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement
    if (target.closest("button, input, textarea, select, label")) return
    event.preventDefault()
    draggingRef.current = true
    dragStartRef.current = { x: event.clientX, y: event.clientY }
    offsetStartRef.current = { x: offsetRef.current.x, y: offsetRef.current.y }
  }

  const getHoverHandlers = (label: string) => ({
    onMouseEnter: () => playHoverAudio(label),
    onMouseLeave: cancelHoverAudio,
    onFocus: () => playHoverAudio(label),
    onBlur: cancelHoverAudio
  })

  const speedStops = [1, 1.25, 1.5, 1.75, 2]

  const handleDecrease = () => {
    setSpeed((prev) => Math.max(0.5, prev - 0.25))
  }

  const handleIncrease = () => {
    setSpeed((prev) => Math.min(3, prev + 0.25))
  }

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSpeed(parseFloat(e.target.value))
  }

  const formattedSpeed = speed.toFixed(2).replace(/\.00$/, '')

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      setIsMounted(false)
      setTimeout(onClose, 300) // Wait for exit animation
    }
  }

  const commitSpeed = () => {
    onSpeedChange?.(speed)
  }

  // 🚨 High Contrast Theme Variables
  const modalBg = isDark ? "bg-[#1C1C1E]" : "bg-white"
  const textColor = isDark ? "text-white" : "text-black"
  const secondaryText = isDark ? "text-gray-400" : "text-gray-500"
  const borderColor = isDark ? "border-[#0A44FF]" : "border-[#0A44FF]"
  const sliderUnfilled = isDark ? "#333333" : "#E5E7EB"

  return (
    <div 
      onClick={handleBackdropClick} 
      className={`fixed inset-0 z-[999999] flex items-center justify-center bg-black/60 backdrop-blur-md font-sans transition-opacity duration-300 ${isMounted ? 'opacity-100' : 'opacity-0'}`}
      aria-modal="true"
      role="dialog"
    >
      
      {/* Modal Container */}
      <div
        className={`relative w-[440px] ${modalBg} rounded-[32px] border-4 ${borderColor} p-8 text-center shadow-[0_24px_60px_rgba(0,0,0,0.5)] transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${isMounted ? 'scale-100 translate-y-0' : 'scale-90 translate-y-8'}`}
        onMouseDown={onHeaderMouseDown}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${isMounted ? 1 : 0.95})`,
          cursor: draggingRef.current ? "grabbing" : "grab",
          visibility: initialOffsetLoaded ? "visible" : "hidden"
        }}
      >
        
        {/* Visual Drag Handle */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-16 h-1.5 rounded-full bg-gray-400/30 pointer-events-none" />

        {/* Header */}
        <h2 className={`text-[28px] font-extrabold mb-8 tracking-tight ${textColor} mt-2`}>
          Reading Speed
        </h2>
        
        {/* Close Button (X) */}
        <button 
          onClick={() => {
            setIsMounted(false)
            setTimeout(onClose, 300)
          }}
          className={`absolute top-6 right-6 ${secondaryText} hover:${textColor} transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0A44FF]/50 rounded-full p-1`}
          aria-label="Close"
          {...getHoverHandlers("Close")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* Large Speed Display */}
        <div className="mb-8">
          <span className={`text-[72px] font-black tracking-tighter leading-none ${textColor}`}>
            {formattedSpeed}x
          </span>
        </div>

        {/* Main Slider Controls */}
        <div className="flex items-center gap-5 mb-10 px-2">
          {/* Minus Button */}
          <button 
            onClick={handleDecrease}
            className="w-[56px] h-[56px] flex-shrink-0 flex items-center justify-center bg-[#0A44FF] hover:bg-[#0836CC] text-white rounded-full transition-transform active:scale-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0A44FF]/50 shadow-lg"
            aria-label="Decrease speed"
            {...getHoverHandlers("Decrease speed")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          {/* 🚨 Chunky High-Contrast Slider */}
          <div className="flex-1 relative flex items-center">
            <input 
              type="range" 
              min="0.5" 
              max="3" 
              step="0.05"
              value={speed}
              onChange={(e) => {
                handleSliderChange(e)
                onSpeedChange?.(parseFloat(e.target.value))
              }}
              aria-label="Reading Speed"
              className="reading-speed-slider w-full h-[16px] rounded-full appearance-none cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0A44FF]/50"
              onMouseEnter={() => playHoverAudio("Reading Speed Slider")}
              onMouseLeave={cancelHoverAudio}
              style={{
                // Visual Mode Deep Blue Fill
                background: `linear-gradient(to right, #0A44FF 0%, #0A44FF ${((speed - 0.5) / (3 - 0.5)) * 100}%, ${sliderUnfilled} ${((speed - 0.5) / (3 - 0.5)) * 100}%, ${sliderUnfilled} 100%)`
              }}
            />
            {/* 🚨 WCAG Custom Thumb Styling injected directly */}
            <style dangerouslySetInnerHTML={{ __html: `
              .reading-speed-slider::-webkit-slider-thumb {
                appearance: none;
                width: 36px;
                height: 36px;
                background: #FFFFFF;
                border: 4px solid #0A44FF;
                border-radius: 50%;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                transition: transform 0.1s;
              }
              .reading-speed-slider::-webkit-slider-thumb:hover {
                transform: scale(1.1);
              }
              .reading-speed-slider::-moz-range-thumb {
                width: 36px;
                height: 36px;
                background: #FFFFFF;
                border: 4px solid #0A44FF;
                border-radius: 50%;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                transition: transform 0.1s;
              }
              .reading-speed-slider::-moz-range-thumb:hover {
                transform: scale(1.1);
              }
            `}} />
          </div>

          {/* Plus Button */}
          <button 
            onClick={handleIncrease}
            className="w-[56px] h-[56px] flex-shrink-0 flex items-center justify-center bg-[#0A44FF] hover:bg-[#0836CC] text-white rounded-full transition-transform active:scale-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0A44FF]/50 shadow-lg"
            aria-label="Increase speed"
            {...getHoverHandlers("Increase speed")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>

        {/* Quick Select Pills (Minimum 44px height for WCAG) */}
        <div className="flex justify-between gap-2.5">
          {speedStops.map((stop) => (
            <button
              key={stop}
              onClick={() => {
                setSpeed(stop)
                onSpeedChange?.(stop)
              }}
              aria-pressed={speed === stop}
              {...getHoverHandlers(`${stop}x`) }
              className={`flex-1 h-[48px] rounded-full text-[16px] font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0A44FF]/50 ${
                speed === stop 
                  ? "bg-[#0A44FF] text-white shadow-lg scale-105" 
                  : isDark 
                    ? "bg-white/10 text-gray-200 hover:bg-white/20"
                    : "bg-gray-100 text-gray-800 hover:bg-gray-200"
              }`}
            >
              {stop}x
            </button>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="mt-10 flex justify-end gap-4">
          <button
            onClick={() => {
              setIsMounted(false)
              setTimeout(onClose, 300)
            }}
            className={`px-6 py-3 rounded-full border-2 ${isDark ? 'border-gray-600 hover:bg-gray-800 text-white' : 'border-gray-300 hover:bg-gray-100 text-gray-800'} text-[16px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gray-400`}
            {...getHoverHandlers("Cancel")}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              commitSpeed()
              setIsMounted(false)
              setTimeout(onClose, 300)
            }}
            className="px-8 py-3 rounded-full bg-[#0A44FF] text-[16px] font-bold text-white hover:bg-[#0836CC] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0A44FF]/50 shadow-lg"
            {...getHoverHandlers("Apply")}
          >
            Apply
          </button>
        </div>

      </div>
    </div>
  )
}