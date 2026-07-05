/**
 * @file CaptionTransparencyOverlay.tsx
 * @description Interactive modal overlay for adjusting the background opacity of live subtitles in Auditory Mode.
 *
 * Architectural Overview:
 * 1. Opacity Customization & Persistence:
 *    - Manages live subtitle container transparency (`sensa_caption_transparency`), syncing real-time slider adjustments with Chrome local storage.
 *    - Provides discrete quick-select preset values (25%, 50%, 75%, 100%) alongside a continuous range slider.
 *
 * 2. Draggable Modal Viewport:
 *    - Supports mouse drag positioning (`sensa_transparency_offset`) to allow users to move the configuration panel without obscuring active subtitles.
 */

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

  const isBackdropMouseDownRef = useRef(false)
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && isBackdropMouseDownRef.current) {
      isBackdropMouseDownRef.current = false
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

  // Clean theme variables tuned for a caption opacity control panel
  const modalBg = isDark ? "bg-[#17171A]" : "bg-white"
  const textColor = isDark ? "text-white" : "text-gray-950"
  const secondaryText = isDark ? "text-gray-400" : "text-gray-500"
  const sliderUnfilled = isDark ? "#35353A" : "#E5E7EB"
  const previewBgClass = isDark
    ? "bg-gradient-to-br from-[#202026] via-[#121214] to-[#080809]"
    : "bg-gradient-to-br from-[#F7F7FA] via-[#EFEFF5] to-[#E7EAF0]"
  const previewGlowClass = isDark
    ? "opacity-35 bg-[radial-gradient(circle_at_top_right,rgba(255,122,47,0.25),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.08),transparent_35%)]"
    : "opacity-60 bg-[radial-gradient(circle_at_top_right,rgba(255,122,47,0.16),transparent_40%),radial-gradient(circle_at_bottom_left,rgba(10,68,255,0.08),transparent_34%)]"
  const previewBadgeClass = isDark
    ? "border-white/10 bg-black/35 text-white/80"
    : "border-black/10 bg-white/75 text-gray-700"
  const previewBaselineClass = isDark ? "from-black/45 to-transparent" : "from-white/65 to-transparent"
  const previewCaptionClass = isDark
    ? "text-white border-white/10"
    : "text-gray-950 border-black/10 shadow-[0_16px_40px_rgba(0,0,0,0.10)]"

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          isBackdropMouseDownRef.current = true
        } else {
          isBackdropMouseDownRef.current = false
        }
      }}
      onClick={handleBackdropClick}
      className={`fixed inset-0 z-[999999] flex items-center justify-center bg-black/45 backdrop-blur-sm font-sans px-4 transition-opacity duration-300 ${isMounted ? 'opacity-100' : 'opacity-0'}`}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`relative w-full max-w-[480px] ${modalBg} rounded-[26px] border border-white/10 p-6 shadow-[0_24px_60px_rgba(0,0,0,0.40)] transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${isMounted ? 'scale-100 translate-y-0' : 'scale-95 translate-y-6'}`}
        onMouseDown={onHeaderMouseDown}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${isMounted ? 1 : 0.95})`,
          cursor: draggingRef.current ? "grabbing" : "grab",
          visibility: initialOffsetLoaded ? "visible" : "hidden"
        }}
      >
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 rounded-full bg-gray-500/35 pointer-events-none" />

        <div className="flex items-start justify-between gap-4 mb-4 mt-2">
          <div>
            <h2 className="mt-1 text-[24px] leading-tight font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-[#FF7A2F] to-[#FF9F0A]">
              Caption Transparency
            </h2>
            <p className={`mt-2 text-[13px] leading-relaxed max-w-[32rem] ${secondaryText}`}>
              Control how solid the caption background appears so text stays readable without covering the page.
            </p>
          </div>
          <button
            onClick={() => {
              setIsMounted(false)
              setTimeout(onClose, 300)
            }}
            className={`shrink-0 bg-transparent hover:bg-black/5 dark:hover:bg-white/10 text-gray-400 hover:${textColor} transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A2F]/50 rounded-full p-2`}
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Preview */}
        <div className={`relative rounded-[20px] overflow-hidden mb-6 h-[170px] border ${isDark ? "border-white/10" : "border-black/5"} ${previewBgClass} shadow-inner`}>
          <div className={`absolute inset-0 ${previewGlowClass}`} />
          <div className={`absolute top-3.5 left-3.5 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] backdrop-blur-sm ${previewBadgeClass}`}>
            Live Preview
          </div>
          <div className={`absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t ${previewBaselineClass}`} />
          <div
            className={`absolute bottom-5 left-1/2 -translate-x-1/2 w-[88%] flex flex-col gap-1.5 transition-colors duration-200`}
            style={{ 
              backgroundColor: isDark ? `rgba(0, 0, 0, ${opacity})` : `rgba(255, 255, 255, ${opacity})`,
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
              padding: "10px 14px",
              borderRadius: "14px",
              color: isDark ? "#fff" : "#111"
            }}
          >
            <div style={{
              backgroundColor: "rgba(255,255,255,0.06)",
              padding: "6px 10px",
              borderRadius: "8px",
              display: "flex",
              flexDirection: "column",
              gap: "2px"
            }}>
              <div style={{ opacity: 0.75, fontSize: "11px", fontWeight: 500, fontStyle: "normal" }}>This is the original sentence</div>
              <div style={{ fontWeight: 700, fontSize: "14px", letterSpacing: "-0.01em", lineHeight: 1.3 }}>This is the translated caption</div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between mb-2.5">
          <h3 className={`text-[13px] font-semibold tracking-[0.18em] uppercase ${secondaryText}`}>Transparency Level</h3>
          <div className="text-[#FF7A2F] text-[24px] leading-none font-black tracking-tighter">
            {transparency}%
          </div>
        </div>

        {/* Slider */}
        <div className="relative flex items-center mb-4">
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={transparency}
            onChange={(event) => commitTransparency(Number.parseInt(event.target.value, 10))}
            className="caption-opacity-slider w-full h-[14px] rounded-full appearance-none cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF7A2F]/50"
            aria-label="Transparency Slider"
            style={{
              background: `linear-gradient(to right, #FF7A2F 0%, #FF7A2F ${transparency}%, ${sliderUnfilled} ${transparency}%, ${sliderUnfilled} 100%)`
            }}
          />
          <style dangerouslySetInnerHTML={{ __html: `
            .caption-opacity-slider::-webkit-slider-thumb {
              appearance: none;
              width: 30px;
              height: 30px;
              background: #FFFFFF;
              border: 3px solid #FF7A2F;
              border-radius: 50%;
              cursor: pointer;
              box-shadow: 0 3px 10px rgba(0,0,0,0.25);
              transition: transform 0.1s;
            }
            .caption-opacity-slider::-webkit-slider-thumb:hover {
              transform: scale(1.1);
            }
            .caption-opacity-slider::-moz-range-thumb {
              width: 30px;
              height: 30px;
              background: #FFFFFF;
              border: 3px solid #FF7A2F;
              border-radius: 50%;
              cursor: pointer;
              box-shadow: 0 3px 10px rgba(0,0,0,0.25);
              transition: transform 0.1s;
            }
            .caption-opacity-slider::-moz-range-thumb:hover {
              transform: scale(1.1);
            }
          ` }} />
        </div>

        <div className={`flex justify-between text-[12px] font-semibold uppercase tracking-[0.18em] mb-6 ${secondaryText}`}>
          <span>Transparent</span>
          <span>Opaque</span>
        </div>

        {/* Presets */}
        <div className="grid grid-cols-4 gap-2.5 mb-6">
          {PRESET_VALUES.map((value) => {
            const active = value === transparency
            return (
              <button
                key={value}
                onClick={() => commitTransparency(value)}
                aria-pressed={active}
                className={`h-[40px] rounded-full text-[14px] font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF7A2F]/50 active:scale-95 hover:-translate-y-0.5 hover:shadow-lg ${
                  active 
                    ? "bg-[#FF7A2F] text-white shadow-lg shadow-[#FF7A2F]/25 scale-105 hover:bg-[#E86A25] hover:shadow-[#FF7A2F]/35" 
                    : isDark 
                      ? "bg-white/8 text-gray-200 hover:bg-white/14 hover:text-white border border-white/10"
                      : "bg-gray-100 text-gray-800 hover:bg-gray-200 hover:border-gray-300 border border-gray-200"
                }`}
              >
                {value}%
              </button>
            )
          })}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-1">
          <button
            onClick={() => {
              setIsMounted(false)
              setTimeout(onClose, 300)
            }}
            className={`px-4 py-2.5 rounded-full border ${isDark ? 'border-white/10 hover:bg-white/10 hover:border-white/20 hover:text-white text-white' : 'border-gray-200 hover:bg-gray-100 hover:border-gray-300 text-gray-800'} text-[14px] font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gray-400 active:scale-95 hover:-translate-y-0.5`}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              commitTransparency(transparency)
              setIsMounted(false)
              setTimeout(onClose, 300)
            }}
            className="px-5 py-2.5 rounded-full bg-[#FF7A2F] text-[14px] font-semibold text-white hover:bg-[#E86A25] hover:shadow-xl hover:shadow-[#FF7A2F]/35 hover:-translate-y-0.5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF7A2F]/50 shadow-lg shadow-[#FF7A2F]/30 active:scale-95"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}