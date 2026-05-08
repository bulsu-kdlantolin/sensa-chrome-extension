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

  // 🚨 High Contrast Theme Variables
  const modalBg = isDark ? "bg-[#1C1C1E]" : "bg-white"
  const textColor = isDark ? "text-white" : "text-black"
  const secondaryText = isDark ? "text-gray-400" : "text-gray-500"
  const inputBg = isDark ? "bg-[#2C2C2E]" : "bg-gray-100"
  const inputBorder = isDark ? "border-gray-700" : "border-gray-200"

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
          Caption Size
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
        <div className="relative rounded-[20px] overflow-hidden shadow-inner mb-8 h-[200px] border-2 border-black/20 bg-gradient-to-br from-gray-800 via-gray-900 to-black flex items-center justify-center">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-900/20 via-transparent to-transparent" />
          
          <div className="absolute top-4 right-4 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-md text-white/90 text-[11px] font-extrabold tracking-widest border border-white/10 z-10">
            PREVIEW
          </div>

          <div 
            className="relative px-6 py-4 text-center text-white font-bold leading-snug drop-shadow-[0_4px_8px_rgba(0,0,0,0.8)] transition-all duration-200 w-full"
            style={{ fontSize: `${fontSize}px` }}
          >
            Sample Caption
          </div>
        </div>

        {/* 🚨 Hyper-Tactile Controls */}
        <div className="flex items-center justify-center gap-6 mb-10">
          <button
            onClick={decrease}
            aria-label="Decrease font size"
            className="w-[64px] h-[64px] rounded-full bg-[#FF7A2F] hover:bg-[#E86A25] text-white flex items-center justify-center transition-all active:scale-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF7A2F]/50 shadow-lg shadow-[#FF7A2F]/30 shrink-0"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          <div className={`w-[140px] h-[80px] rounded-[20px] border-2 flex items-center justify-center px-4 transition-colors focus-within:border-[#FF7A2F] focus-within:ring-4 focus-within:ring-[#FF7A2F]/20 ${inputBg} ${inputBorder}`}>
            <input
              type="text"
              inputMode="numeric"
              value={sizeInput}
              onChange={(event) => handleInputChange(event.target.value)}
              onBlur={normalizeInput}
              className={`w-full bg-transparent text-center text-[52px] leading-none font-black outline-none tracking-tighter ${textColor}`}
              aria-label="Font size in pixels"
            />
          </div>

          <button
            onClick={increase}
            aria-label="Increase font size"
            className="w-[64px] h-[64px] rounded-full bg-[#FF7A2F] hover:bg-[#E86A25] text-white flex items-center justify-center transition-all active:scale-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF7A2F]/50 shadow-lg shadow-[#FF7A2F]/30 shrink-0"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
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
            className={`px-6 py-3 rounded-full border-2 ${isDark ? 'border-gray-600 hover:bg-gray-800 text-white' : 'border-gray-300 hover:bg-gray-100 text-gray-800'} text-[16px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gray-400 active:scale-95`}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              normalizeInput()
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