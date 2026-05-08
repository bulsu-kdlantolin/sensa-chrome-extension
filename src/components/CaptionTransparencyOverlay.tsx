import React, { useEffect, useRef, useState } from "react"

interface CaptionTransparencyOverlayProps {
  isDark: boolean
  onClose: () => void
  initialTransparency?: number
  onTransparencyChange?: (transparency: number) => void
}

const PRESET_VALUES = [25, 50, 75, 100]

export default function CaptionTransparencyOverlay({
  isDark,
  onClose,
  initialTransparency = 75,
  onTransparencyChange
}: CaptionTransparencyOverlayProps) {
  const [transparency, setTransparency] = useState(initialTransparency)
  
  // Dragging State
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [initialOffsetLoaded, setInitialOffsetLoaded] = useState(false)
  const [isMounted, setIsMounted] = useState(false) // For mount animations
  
  const offsetRef = useRef(offset)
  const draggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const offsetStartRef = useRef({ x: 0, y: 0 })

  const clampTransparency = (value: number) => Math.min(100, Math.max(0, value))

  const commitTransparency = (value: number) => {
    const normalized = clampTransparency(value)
    setTransparency(normalized)
    onTransparencyChange?.(normalized)
    return normalized
  }

  // Trigger entrance animation
  useEffect(() => {
    requestAnimationFrame(() => setIsMounted(true))
  }, [])

  useEffect(() => {
    setTransparency(initialTransparency)
  }, [initialTransparency])

  useEffect(() => {
    offsetRef.current = offset
  }, [offset])

  useEffect(() => {
    chrome.storage.local.get(["sensa_caption_transparency_overlay_offset"], (result) => {
      if (result.sensa_caption_transparency_overlay_offset) {
        setOffset(result.sensa_caption_transparency_overlay_offset)
      }
      setInitialOffsetLoaded(true)
    })
  }, [])

  useEffect(() => {
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return
      const dx = ev.clientX - dragStartRef.current.x
      const dy = ev.clientY - dragStartRef.current.y
      setOffset({ x: offsetStartRef.current.x + dx, y: offsetStartRef.current.y + dy })
    }

    const onUp = () => {
      if (!draggingRef.current) return
      draggingRef.current = false
      chrome.storage.local.set({ sensa_caption_transparency_overlay_offset: offsetRef.current })
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)

    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [])

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      setIsMounted(false)
      setTimeout(onClose, 300)
    }
  }

  const onHeaderMouseDown = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement
    if (target.closest("button, input, select, textarea")) return
    event.preventDefault()
    draggingRef.current = true
    dragStartRef.current = { x: event.clientX, y: event.clientY }
    offsetStartRef.current = { x: offsetRef.current.x, y: offsetRef.current.y }
  }

  const opacity = transparency / 100

  // 🚨 High Contrast Theme Variables
  const modalBg = isDark ? "bg-[#1C1C1E]" : "bg-white"
  const textColor = isDark ? "text-white" : "text-black"
  const secondaryText = isDark ? "text-gray-400" : "text-gray-500"
  const sliderUnfilled = isDark ? "#333333" : "#E5E7EB"

  return (
    <div 
      onClick={handleBackdropClick} 
      className={`fixed inset-0 z-[999999] flex items-center justify-center bg-black/60 backdrop-blur-md font-sans px-4 transition-opacity duration-300 ${isMounted ? 'opacity-100' : 'opacity-0'}`}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`relative w-full max-w-[480px] ${modalBg} rounded-[32px] border-4 border-[#FF7A2F] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.5)] transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${isMounted ? 'scale-100 translate-y-0' : 'scale-90 translate-y-8'}`}
        onMouseDown={onHeaderMouseDown}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${isMounted ? 1 : 0.95})`,
          cursor: draggingRef.current ? "grabbing" : "grab",
          visibility: initialOffsetLoaded ? "visible" : "hidden"
        }}
      >
        {/* Visual Drag Handle */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-16 h-1.5 rounded-full bg-gray-400/40 pointer-events-none" />

        <h2 className={`text-[32px] leading-none font-extrabold mb-6 tracking-tight mt-2 ${textColor}`}>
          Caption Transparency
        </h2>

        <button
          onClick={() => {
            setIsMounted(false)
            setTimeout(onClose, 300)
          }}
          className={`absolute top-6 right-6 ${secondaryText} hover:${textColor} transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF7A2F]/50 rounded-full p-1 active:scale-90`}
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* 🚨 Cinematic Preview Window */}
        <div className="relative rounded-[20px] overflow-hidden shadow-inner mb-8 h-[200px] border-2 border-black/20 bg-gradient-to-br from-gray-800 via-gray-900 to-black">
          {/* Subtle cinematic lighting effect */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent" />
          
          <div className="absolute top-4 right-4 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md text-white/90 text-[11px] font-extrabold tracking-widest border border-white/10">
            PREVIEW
          </div>

          <div 
            className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[85%] rounded-xl px-5 py-3.5 text-center text-white font-bold text-[17px] leading-snug shadow-2xl transition-colors duration-200"
            style={{ backgroundColor: `rgba(0, 0, 0, ${opacity})` }}
          >
            This is a sample caption to preview your changes.
          </div>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-[20px] font-bold ${textColor}`}>Transparency Level</h3>
          <div className="text-[#FF7A2F] text-[28px] leading-none font-black tracking-tighter">
            {transparency}%
          </div>
        </div>

        {/* 🚨 Chunky High-Contrast Slider */}
        <div className="relative flex items-center mb-6">
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={transparency}
            onChange={(event) => commitTransparency(Number.parseInt(event.target.value, 10))}
            className="caption-opacity-slider w-full h-[16px] rounded-full appearance-none cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF7A2F]/50"
            aria-label="Transparency Slider"
            style={{
              background: `linear-gradient(to right, #FF7A2F 0%, #FF7A2F ${transparency}%, ${sliderUnfilled} ${transparency}%, ${sliderUnfilled} 100%)`
            }}
          />
          {/* Injecting God-Tier Tactile Thumb CSS */}
          <style dangerouslySetInnerHTML={{ __html: `
            .caption-opacity-slider::-webkit-slider-thumb {
              appearance: none;
              width: 36px;
              height: 36px;
              background: #FFFFFF;
              border: 4px solid #FF7A2F;
              border-radius: 50%;
              cursor: pointer;
              box-shadow: 0 4px 12px rgba(0,0,0,0.3);
              transition: transform 0.1s;
            }
            .caption-opacity-slider::-webkit-slider-thumb:hover {
              transform: scale(1.1);
            }
            .caption-opacity-slider::-moz-range-thumb {
              width: 36px;
              height: 36px;
              background: #FFFFFF;
              border: 4px solid #FF7A2F;
              border-radius: 50%;
              cursor: pointer;
              box-shadow: 0 4px 12px rgba(0,0,0,0.3);
              transition: transform 0.1s;
            }
            .caption-opacity-slider::-moz-range-thumb:hover {
              transform: scale(1.1);
            }
          ` }} />
        </div>

        <div className={`flex justify-between text-[14px] font-bold uppercase tracking-wider mb-8 ${secondaryText}`}>
          <span>Transparent</span>
          <span>Opaque</span>
        </div>

        {/* 🚨 Premium Quick Select Pills */}
        <div className="flex justify-between gap-3 mb-10">
          {PRESET_VALUES.map((value) => {
            const active = value === transparency
            return (
              <button
                key={value}
                onClick={() => commitTransparency(value)}
                aria-pressed={active}
                className={`flex-1 h-[48px] rounded-full text-[16px] font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF7A2F]/50 active:scale-95 ${
                  active 
                    ? "bg-[#FF7A2F] text-white shadow-lg scale-105" 
                    : isDark 
                      ? "bg-white/10 text-gray-200 hover:bg-white/20"
                      : "bg-gray-100 text-gray-800 hover:bg-gray-200"
                }`}
              >
                {value}%
              </button>
            )
          })}
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-4">
          <button
            onClick={() => {
              setIsMounted(false)
              setTimeout(onClose, 300)
            }}
            className={`px-6 py-3 rounded-full border-2 ${isDark ? 'border-gray-600 hover:bg-gray-800 text-white' : 'border-gray-300 hover:bg-gray-100 text-gray-800'} text-[16px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gray-400 active:scale-95`}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              commitTransparency(transparency)
              setIsMounted(false)
              setTimeout(onClose, 300)
            }}
            className="px-8 py-3 rounded-full bg-[#FF7A2F] text-[16px] font-bold text-white hover:bg-[#E86A25] transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF7A2F]/50 shadow-lg shadow-[#FF7A2F]/30 active:scale-95"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}