import React, { useEffect, useRef, useState } from "react"

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

export default function LiveCaptionBox({
  captions, error, fontSize, textColor, bgColor, fontFamily, showOriginalText = true
}: LiveCaptionBoxProps) {
  const [offset, setOffset] = useState<CaptionOffset>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const offsetRef = useRef(offset)

  useEffect(() => {
    chrome.storage.local.get(["sensa_live_caption_offset"], (result) => {
      const savedOffset = result.sensa_live_caption_offset
      if (typeof savedOffset?.x === "number" && typeof savedOffset?.y === "number") {
        setOffset({ x: savedOffset.x, y: savedOffset.y })
      }
    })
  }, [])

  useEffect(() => { offsetRef.current = offset }, [offset])

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    dragStartRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y }
  }

  useEffect(() => {
    if (!isDragging) return
    const handleMouseMove = (e: MouseEvent) => {
      setOffset({ x: e.clientX - dragStartRef.current.x, y: e.clientY - dragStartRef.current.y })
    }
    const handleMouseUp = () => {
      setIsDragging(false)
      chrome.storage.local.set({ sensa_live_caption_offset: offsetRef.current })
    }
    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
    return () => {
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }
  }, [isDragging])

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
        maxHeight: "42vh",
        padding: "14px 16px",
        borderRadius: "18px",
        backgroundColor: bgColor,
        color: textColor,
        fontSize: `${fontSize}px`,
        fontFamily: fontFamily || "system-ui, Arial, sans-serif",
        boxShadow: "0 14px 36px rgba(0,0,0,0.34)",
        userSelect: "none",
        cursor: isDragging ? "grabbing" : "grab",
        zIndex: 999999,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
        overflowY: "auto",
        overflowX: "hidden",
        backdropFilter: "blur(10px)",
        border: "1px solid rgba(255,255,255,0.12)",
        wordBreak: "break-word",
        overflowWrap: "anywhere"
      }}
      onMouseDown={handleMouseDown}
    >
      {error ? (
        <div style={{ color: "#FCA5A5", textAlign: "center", fontSize: "0.88em", lineHeight: 1.4 }}>{error}</div>
      ) : captions.length === 0 ? (
        <div style={{ opacity: 0.75, textAlign: "center", fontSize: "0.9em", lineHeight: 1.4 }}>Listening for speech...</div>
      ) : (
        captions.map((block, index) => {
          const isLatest = index === captions.length - 1
          const opacity = isLatest ? 1 : Math.max(0.55, 1 - (captions.length - 1 - index) * 0.16)
          return (
            <div
              key={block.id}
              style={{
                opacity,
                transition: "opacity 180ms ease, transform 180ms ease",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                padding: "12px 14px",
                borderRadius: "14px",
                backgroundColor: isLatest ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                transform: isLatest ? "scale(1)" : "scale(0.995)"
              }}
            >
              {showOriginalText && (
                <div style={{ fontSize: `${Math.max(12, fontSize * 0.78)}px`, opacity: 0.72, fontWeight: 500, lineHeight: 1.35 }}>
                  {block.original}
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.7em", letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.62, fontWeight: 700 }}>
                  Translation
                </span>
                {block.isFinal && !block.translated && (
                  <span style={{ fontSize: "0.82em", opacity: 0.65 }}>Translating...</span>
                )}
              </div>

              <div style={{ fontSize: `${Math.max(15, fontSize * 1.02)}px`, fontWeight: 700, lineHeight: 1.45 }}>
                {block.translated || (block.isFinal ? "..." : "")}
              </div>

            </div>
          )
        })
      )}
    </div>
  )
}