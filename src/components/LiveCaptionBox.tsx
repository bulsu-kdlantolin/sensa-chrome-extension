/**
 * @file LiveCaptionBox.tsx
 * @description Floating, draggable live subtitle container displaying real-time speech-to-text transcriptions and translations.
 *
 * Architectural Overview:
 * 1. Subtitle Synchronization & Rendering:
 *    - Maps incoming `CaptionBlock` items 1-to-1 with zero latency.
 *    - Limits viewport rendering to a maximum of 2 visible blocks (`MAX_VISIBLE_BLOCKS`) to prevent obscuring underlying page content.
 *    - Distinguishes between interim streaming text (italicized) and finalized sentences (normal font style).
 *
 * 2. Draggable Overlay Positioning:
 *    - Supports mouse and touch drag interactions, persisting custom viewport coordinates (`sensa_live_caption_offset`) to Chrome local storage.
 *
 * 3. Language Mismatch Detection:
 *    - Monitors audio frequency energy (`AUDIO_FREQUENCY_UPDATE`) against caption arrival timestamps.
 *    - If continuous speech energy is detected for >8 seconds without transcription results, it displays a non-intrusive warning banner alerting the user that the wrong source language may be selected.
 */

import React, { useEffect, useRef, useState, useLayoutEffect } from "react"
import { SOURCE_LANGUAGE_OPTIONS } from "./CaptionLanguageOverlay"

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
  sourceLanguage?: string
  targetLanguage?: string
}

// Limit visible subtitle blocks to maintain visual clarity without overcrowding the viewport
const MAX_VISIBLE_BLOCKS = 2 

export default function LiveCaptionBox({
  captions, error, fontSize, textColor, bgColor, fontFamily, showOriginalText = true, sourceLanguage = "en", targetLanguage = "EN"
}: LiveCaptionBoxProps) {
  const sourceLangMatch = SOURCE_LANGUAGE_OPTIONS.find((item) => item.code.toLowerCase() === (sourceLanguage || "en").toLowerCase())
  const sourceLangLabel = sourceLangMatch?.label || "English"
  const [offset, setOffset] = useState<CaptionOffset>({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const offsetRef = useRef(offset)

  // Maintain direct mapping of transcription blocks to ensure zero-latency subtitle updates
  const [displayBlocks, setDisplayBlocks] = useState<CaptionBlock[]>([])
  const blockHeights = useRef(new Map<string, number>())
  const blockRefs = useRef(new Map<string, HTMLDivElement | null>())

  // --- NON-ENGLISH DETECTION ---
  const [showLangWarning, setShowLangWarning] = useState(false)
  const lastCaptionTimeRef = useRef<number>(Date.now())

  useEffect(() => {
    // Reset warning and timer whenever new captions arrive or any language setting changes
    lastCaptionTimeRef.current = Date.now()
    setShowLangWarning(false)
  }, [captions, sourceLanguage, targetLanguage])

  useEffect(() => {
    // Listen for audio frequency updates — if audio is playing but no captions arrive
    // for 8+ seconds, it likely means speech in a different language is being spoken
    const handleFrequencyCheck = (msg: any) => {
      if (msg.type !== "AUDIO_FREQUENCY_UPDATE") return
      const speechEnergy = msg.speechEnergy || 0

      // Only check if there's meaningful speech energy (someone is talking)
      if (speechEnergy > 15) {
        const silenceDuration = Date.now() - lastCaptionTimeRef.current
        if (silenceDuration > 8000 && !showLangWarning) {
          setShowLangWarning(true)
        }
      }
    }
    chrome.runtime.onMessage.addListener(handleFrequencyCheck)
    return () => chrome.runtime.onMessage.removeListener(handleFrequencyCheck)
  }, [showLangWarning])

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

    // Synchronize display blocks 1-to-1 with incoming transcription updates
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
        // Dim historical original text while keeping the active utterance legible
        color: textColor,
        fontSize: `${Math.max(12, fontSize * 0.75)}px`,
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
        // Maintain high opacity and visual prominence for translated target text
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

  const langBadge = (
    <div style={{
      display: "inline-flex",
      alignItems: "center",
      gap: `${Math.max(6, fontSize * 0.2)}px`,
      padding: `${Math.max(4, fontSize * 0.12)}px ${Math.max(10, fontSize * 0.3)}px`,
      borderRadius: "8px",
      backgroundColor: "rgba(255, 122, 47, 0.15)",
      border: "1px solid rgba(255, 122, 47, 0.35)",
      fontSize: `${Math.max(11, fontSize * 0.55)}px`,
      fontWeight: 600,
      color: "#FF9F0A",
      letterSpacing: "0.02em",
      marginTop: "2px",
      alignSelf: "center",
    }}>
      <span style={{
        width: `${Math.max(7, fontSize * 0.25)}px`,
        height: `${Math.max(7, fontSize * 0.25)}px`,
        borderRadius: "50%",
        backgroundColor: "#FF7A2F",
        boxShadow: "0 0 8px #FF7A2F",
        display: "inline-block",
        flexShrink: 0
      }} />
      <span>{sourceLangLabel} audio</span>
    </div>
  )

  const langWarningBanner = showLangWarning ? (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: `${Math.max(6, fontSize * 0.2)}px`,
      padding: `${Math.max(5, fontSize * 0.15)}px ${Math.max(12, fontSize * 0.35)}px`,
      borderRadius: "8px",
      backgroundColor: "rgba(251, 191, 36, 0.12)",
      border: "1px solid rgba(251, 191, 36, 0.25)",
      fontSize: `${Math.max(12, fontSize * 0.65)}px`,
      fontWeight: 500,
      color: "#FCD34D",
      textAlign: "center" as const,
      animation: "sensa-lang-fade-in 400ms ease",
    }}>
      <span style={{ fontSize: "1.15em" }}>⚠️</span>
      <span>Speech detected — live captions are currently listening for <strong>{sourceLangLabel} audio</strong></span>
    </div>
  ) : null

  return (
    <>
      <style>{`
        @keyframes sensa-lang-fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
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
          fontSize: `${fontSize}px`,
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
          <div style={{ color: "#FCA5A5", textAlign: "center", fontSize: `${Math.max(14, fontSize * 0.8)}px`, fontWeight: 500, padding: "4px 0" }}>{error}</div>
        ) : displayBlocks.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: `${Math.max(4, fontSize * 0.15)}px`, padding: "4px 0" }}>
            <div style={{ opacity: 0.7, textAlign: "center", fontSize: `${Math.max(14, fontSize * 0.8)}px`, fontWeight: 500, fontStyle: "italic" }}>
              Listening for speech...
            </div>
            {langBadge}
          </div>
        ) : (
          <>
            {langWarningBanner}
            {displayBlocks.slice(-MAX_VISIBLE_BLOCKS).map((b, index, visibleBlocks) => {
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
            })}
          </>
        )}
      </div>
    </>
  )
}