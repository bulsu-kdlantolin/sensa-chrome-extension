/**
 * @file TextSizeOverlay.tsx
 * @description Interactive modal overlay for adjusting the typography scale and font size of live subtitles in Auditory Mode.
 *
 * Architectural Overview:
 * 1. Typography Customization & Scaling:
 *    - Controls live subtitle font size (`sensa_caption_font_size`), clamping values between 12px and 72px for optimal readability across various video player sizes.
 *    - Synchronizes continuous range slider inputs and direct numerical text box entries with Chrome local storage.
 *
 * 2. Draggable Modal Viewport:
 *    - Implements mouse drag positioning (`sensa_text_size_offset`) to allow users to reposition the styling panel without obstructing subtitle viewing areas.
 */

import React, { useEffect, useRef, useState } from "react"

interface TextSizeOverlayProps {
  isDark: boolean
  onClose: () => void
  initialSize?: number
  onSizeChange?: (size: number) => void
}

export default function TextSizeOverlay({ isDark, onClose, initialSize = 32, onSizeChange }: TextSizeOverlayProps) {
  const [fontSize, setFontSize] = useState(initialSize)
  const [sizeInput, setSizeInput] = useState(String(initialSize))
  
  // Dragging & Animation State
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [initialOffsetLoaded, setInitialOffsetLoaded] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  
  const offsetRef = useRef(offset)
  const draggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const offsetStartRef = useRef({ x: 0, y: 0 })

  const clampSize = (value: number) => Math.min(72, Math.max(12, value))

  const commitSize = (value: number) => {
    const normalized = clampSize(value)
    setFontSize(normalized)
    setSizeInput(String(normalized))
    onSizeChange?.(normalized)
    return normalized
  }

  // Trigger entrance animation
  useEffect(() => {
    requestAnimationFrame(() => setIsMounted(true))
  }, [])

  useEffect(() => {
    setFontSize(initialSize)
    setSizeInput(String(initialSize))
  }, [initialSize])

  useEffect(() => {
    offsetRef.current = offset
  }, [offset])

  useEffect(() => {
    chrome.storage.local.get(["sensa_text_size_overlay_offset"], (result) => {
      if (result.sensa_text_size_overlay_offset) {
        setOffset(result.sensa_text_size_overlay_offset)
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
      chrome.storage.local.set({ sensa_text_size_overlay_offset: offsetRef.current })
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

  const decrease = () => commitSize(fontSize - 2)
  const increase = () => commitSize(fontSize + 2)

  const handleInputChange = (value: string) => {
    if (!/^\d{0,2}$/.test(value)) return
    if (value !== "" && Number.parseInt(value, 10) > 72) return

    setSizeInput(value)
    if (value === "") return
    commitSize(Number.parseInt(value, 10))
  }

  const normalizeInput = () => {
    if (sizeInput === "") {
      commitSize(12)
      return
    }
    commitSize(Number.parseInt(sizeInput, 10))
  }

  // Theme variables tuned for a text size control panel
  const modalBg = isDark ? "bg-[#17171A]" : "bg-white"
  const textColor = isDark ? "text-white" : "text-gray-950"
  const secondaryText = isDark ? "text-gray-400" : "text-gray-500"
  const inputBg = isDark ? "bg-[#2C2C2E]" : "bg-gray-50"
  const inputBorder = isDark ? "border-white/10" : "border-gray-200"
  const previewBgClass = isDark
    ? "bg-gradient-to-br from-[#202026] via-[#121214] to-[#080809]"
    : "bg-gradient-to-br from-[#F7F7FA] via-[#EEF1F6] to-[#E6EAF0]"
  const previewGlowClass = isDark
    ? "opacity-35 bg-[radial-gradient(circle_at_top_right,rgba(255,122,47,0.24),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.08),transparent_35%)]"
    : "opacity-55 bg-[radial-gradient(circle_at_top_right,rgba(255,122,47,0.16),transparent_40%),radial-gradient(circle_at_bottom_left,rgba(10,68,255,0.08),transparent_34%)]"
  const previewBadgeClass = isDark
    ? "border-white/10 bg-black/35 text-white/80"
    : "border-black/10 bg-white/75 text-gray-700"
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
        className={`relative w-full max-w-[480px] ${modalBg} rounded-[26px] border ${isDark ? "border-white/10" : "border-gray-200"} p-6 shadow-[0_24px_60px_rgba(0,0,0,0.40)] transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${isMounted ? 'scale-100 translate-y-0' : 'scale-95 translate-y-6'}`}
        onMouseDown={onHeaderMouseDown}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${isMounted ? 1 : 0.95})`,
          cursor: draggingRef.current ? "grabbing" : "grab",
          visibility: initialOffsetLoaded ? "visible" : "hidden"
        }}
      >
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-14 h-1.5 rounded-full bg-gray-500/35 pointer-events-none" />

        <div className="flex items-start justify-between gap-4 mb-4 mt-2">
          <div>
            <h2 className="mt-1 text-[24px] leading-tight font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-[#FF7A2F] to-[#FF9F0A]">
              Caption Size
            </h2>
            <p className={`mt-2 text-[13px] leading-relaxed max-w-[32rem] ${secondaryText}`}>
              Adjust how large captions appear so the text remains readable without overwhelming the page.
            </p>
          </div>

          <button
            onClick={() => {
              setIsMounted(false)
              setTimeout(onClose, 300)
            }}
            className={`shrink-0 bg-transparent hover:bg-black/5 dark:hover:bg-white/10 text-gray-400 hover:${textColor} transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A2F]/50 rounded-full p-2 active:scale-90`}
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className={`relative rounded-[20px] overflow-hidden mb-6 h-[170px] border ${isDark ? "border-white/10" : "border-black/5"} ${previewBgClass} shadow-inner flex items-center justify-center`}>
          <div className={`absolute inset-0 ${previewGlowClass}`} />
          <div className={`absolute top-3.5 left-3.5 inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.22em] backdrop-blur-sm ${previewBadgeClass}`}>
            Live Preview
          </div>

          <div
            className={`relative inline-flex w-fit max-w-[82%] items-center justify-center text-center font-bold leading-snug transition-all duration-200 overflow-visible ${isDark ? 'text-white' : 'text-gray-950'}`}
            style={{ fontSize: `${fontSize}px` }}
          >
            <span className="block truncate">Text</span>
          </div>
        </div>

        {/* 🚨 Hyper-Tactile Controls */}
        <div className="flex items-center justify-center gap-4 mb-6">
          <button
            onClick={decrease}
            aria-label="Decrease font size"
            className="w-[44px] h-[44px] rounded-full bg-[#FF7A2F] hover:bg-[#E86A25] hover:shadow-[0_4px_20px_rgba(255,122,47,0.5)] hover:-translate-y-0.5 text-white flex items-center justify-center transition-all duration-200 active:scale-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF7A2F]/50 shadow-[0_2px_12px_rgba(255,122,47,0.3)] shrink-0"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          <div className={`w-[124px] h-[68px] rounded-[18px] border-2 flex items-center justify-center px-3 transition-all duration-200 focus-within:border-[#FF7A2F] focus-within:ring-4 focus-within:ring-[#FF7A2F]/20 hover:border-[#FF7A2F]/30 hover:shadow-md ${inputBg} ${inputBorder}`}>
            <input
              type="text"
              inputMode="numeric"
              value={sizeInput}
              onChange={(event) => handleInputChange(event.target.value)}
              onBlur={normalizeInput}
              className={`w-full bg-transparent text-center text-[42px] leading-none font-black outline-none tracking-tighter ${textColor}`}
              aria-label="Font size in pixels"
            />
          </div>

          <button
            onClick={increase}
            aria-label="Increase font size"
            className="w-[44px] h-[44px] rounded-full bg-[#FF7A2F] hover:bg-[#E86A25] hover:shadow-[0_4px_20px_rgba(255,122,47,0.5)] hover:-translate-y-0.5 text-white flex items-center justify-center transition-all duration-200 active:scale-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF7A2F]/50 shadow-[0_2px_12px_rgba(255,122,47,0.3)] shrink-0"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-[22px] h-[22px]">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-4">
          <button
            onClick={() => {
              setIsMounted(false)
              setTimeout(onClose, 300)
            }}
            className={`px-5 py-2.5 rounded-full border-2 ${isDark ? 'border-white/10 hover:bg-white/10 hover:border-white/20 text-white' : 'border-gray-300 hover:bg-gray-100 hover:border-gray-400 text-gray-800'} text-[14px] font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gray-400 active:scale-95 hover:-translate-y-0.5`}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              normalizeInput()
              setIsMounted(false)
              setTimeout(onClose, 300)
            }}
            className="px-6 py-2.5 rounded-full bg-[#FF7A2F] text-[14px] font-bold text-white hover:bg-[#E86A25] hover:shadow-xl hover:shadow-[#FF7A2F]/35 hover:-translate-y-0.5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF7A2F]/50 shadow-lg shadow-[#FF7A2F]/30 active:scale-95"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}