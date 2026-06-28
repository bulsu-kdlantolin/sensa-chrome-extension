import React, { useEffect, useRef, useState, useLayoutEffect } from "react"

interface CaptionOffset { x: number; y: number }

export interface CaptionBlock {
  id: string
  original: string
  translated: string
  isFinal: boolean
}

interface LiveCaptionBoxProps {
  captions: CaptionBlock[]
  error?: string | null
  fontSize: number
  textColor: string
  bgColor: string
  fontFamily?: string
  showOriginalText?: boolean
}

// 🚨 Industry Standard "Rule of Two"
const MAX_VISIBLE_BLOCKS = 2 

export default function LiveCaptionBox({
  captions, error, fontSize, textColor, bgColor, fontFamily, showOriginalText = true
}: LiveCaptionBoxProps) {
  const [offset, setOffset] = useState<CaptionOffset>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const offsetRef = useRef(offset)

  // 🚨 THE FIX: Stripped down to exactly what the API gives us. No artificial timers.
  const [displayBlocks, setDisplayBlocks] = useState<CaptionBlock[]>([])
  const blockHeights = useRef(new Map<string, number>())
  const blockRefs = useRef(new Map<string, HTMLDivElement | null>())

  // --- DRAG LOGIC ---
  useEffect(() => {
    chrome.storage.local.get(["sensa_live_caption_offset"], (result) => {
      const savedOffset = result.sensa_live_caption_offset
      if (typeof savedOffset?.x === "number" && typeof savedOffset?.y === "number") {
        setOffset({ x: savedOffset.x, y: savedOffset.y })
      }
    })
  }, [])

  useEffect(() => { offsetRef.current = offset }, [offset])

  const handleDragStart = (clientX: number, clientY: number) => {
    setIsDragging(true)
    dragStartRef.current = { x: clientX - offset.x, y: clientY - offset.y }
  }

  const handleMouseDown = (e: React.MouseEvent) => handleDragStart(e.clientX, e.clientY)
  const handleTouchStart = (e: React.TouchEvent) => handleDragStart(e.touches[0].clientX, e.touches[0].clientY)

  useEffect(() => {
    if (!isDragging) return
    
    const handleMouseMove = (e: MouseEvent) => {
      setOffset({ x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y })
    }
    const handleTouchMove = (e: TouchEvent) => {
      setOffset({ x: e.touches[0].clientX - dragStartRef.current.x, y: e.touches[0].clientY - dragStartRef.current.y })
    }
    
    const handleDragEnd = () => {
      setIsDragging(false)
      chrome.storage.local.set({ sensa_live_caption_offset: offsetRef.current })
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleDragEnd)
    window.addEventListener("touchmove", handleTouchMove, { passive: false })
    window.addEventListener("touchend", handleDragEnd)
    
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleDragEnd)
      window.removeEventListener("touchmove", handleTouchMove)
      window.removeEventListener("touchend", handleDragEnd)
    }
  }, [isDragging])

  // --- DATA SYNC LOGIC ---
  useEffect(() => {
    if (!captions) return

    // 🚨 THE FIX: Pure 1-to-1 mapping. Zero latency.
    setDisplayBlocks((prev) => {
      const nextMap = new Map(prev.map(b => [b.id, { ...b }]))
      
      captions.forEach(c => {
        nextMap.set(c.id, {
          id: c.id,
          original: c.original,
          translated: c.translated,
          isFinal: c.isFinal
        })
      })

      const ordered: CaptionBlock[] = captions.map(c => nextMap.get(c.id)!) 
      prev.forEach(b => { if (!nextMap.has(b.id)) ordered.push(b) })
      return ordered
    })
  }, [captions])

  useLayoutEffect(() => {
    displayBlocks.forEach(b => {
      const el = blockRefs.current.get(b.id)
      if (el) {
        const h = el.offsetHeight
        blockHeights.current.set(b.id, h)
      }
    })
  }, [displayBlocks, fontSize])


  // --- RENDER LOGIC ---
  const renderOriginal = (b: CaptionBlock, isLatest: boolean) => {
    if (!b.original) return null
    return (
      <div style={{ 
        width: "100%", 
        whiteSpace: "pre-wrap", 
        lineHeight: 1.25,
        // 🚨 THE FIX: Dim older original text while keeping current original text slightly soft
        color: textColor,
        opacity: isLatest ? (b.isFinal ? 0.75 : 0.45) : 0.4,
        fontStyle: b.isFinal ? "normal" : "italic",
        fontWeight: 500,
        transition: "opacity 300ms ease, font-style 150ms ease"
      }}>
        {b.original}
      </div>
    )
  }

  const renderTranslation = (b: CaptionBlock, isLatest: boolean) => {
    if (!b.translated) return null
    return (
      <div style={{ 
        // 🚨 THE FIX: Translated text always stays solid and bright across all caption blocks
        opacity: b.isFinal ? 1 : 0.7,
        fontStyle: b.isFinal ? "normal" : "italic",
        transition: "opacity 300ms ease, font-style 150ms ease", 
        color: textColor, 
        fontWeight: 700, 
        fontSize: `${fontSize}px`, 
        lineHeight: 1.3,
        letterSpacing: "-0.01em" 
      }}>
        {b.translated}
      </div>
    )
  }

  return (
    <div
      role="log"
      aria-live="polite"
      style={{
        position: "fixed",
        left: "50%",
        bottom: "20px",
        transform: `translate(calc(-50% + ${offset.x}px), ${offset.y}px)`,
        width: "min(92vw, 760px)",
        padding: "10px 14px", 
        borderRadius: "14px",
        backgroundColor: bgColor,
        color: textColor,
        fontFamily: fontFamily || "system-ui, Arial, sans-serif",
        boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
        userSelect: "none",
        cursor: isDragging ? "grabbing" : "grab",
        zIndex: 999999,
        display: "flex",
        flexDirection: "column",
        gap: "6px", 
        overflowY: "hidden", 
        overflowX: "hidden",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)", 
        border: "1px solid rgba(255,255,255,0.12)",
        wordBreak: "break-word",
        overflowWrap: "anywhere",
        textShadow: "0px 1px 3px rgba(0,0,0,0.4)" 
      }}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
    >
      {error ? (
        <div style={{ color: "#FCA5A5", textAlign: "center", fontSize: "0.9em", fontWeight: 500 }}>{error}</div>
      ) : displayBlocks.length === 0 ? (
        <div style={{ opacity: 0.6, textAlign: "center", fontSize: "0.9em", fontWeight: 500, fontStyle: "italic", padding: "4px 0" }}>
          Listening for speech...
        </div>
      ) : (
        displayBlocks.slice(-MAX_VISIBLE_BLOCKS).map((b, index, visibleBlocks) => {
          const isLatest = index === visibleBlocks.length - 1
          const minH = blockHeights.current.get(b.id)
          return (
            <div
              key={b.id}
              ref={el => blockRefs.current.set(b.id, el)}
              style={{
                transition: "transform 300ms ease",
                display: "flex",
                flexDirection: "column",
                gap: "2px", 
                padding: "6px 10px", 
                borderRadius: "8px",
                backgroundColor: isLatest ? "rgba(255,255,255,0.06)" : "transparent",
                transform: isLatest ? "scale(1)" : "scale(0.99)",
                minHeight: minH ? `${minH}px` : undefined,
                willChange: "transform"
              }}
            >
              {showOriginalText && (
                <div style={{ fontSize: `${Math.max(11, fontSize * 0.75)}px` }}>
                  {renderOriginal(b, isLatest)}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column" }}>
                {renderTranslation(b, isLatest)}
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}