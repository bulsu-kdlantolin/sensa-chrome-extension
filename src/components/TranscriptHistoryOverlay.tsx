/**
 * @file TranscriptHistoryOverlay.tsx
 * @description Slide-out sidebar modal for viewing chronological live caption logs and exporting transcription archives.
 *
 * Architectural Overview:
 * 1. Log Management & Scroll Lock:
 *    - Renders historical subtitle blocks (`CaptionBlock`) containing both original source transcriptions and translated target texts.
 *    - Implements intelligent scroll-lock physics (`isAtBottomRef`), automatically pinning the viewport to new incoming captions unless the user scrolls up to review earlier dialogue.
 *
 * 2. Archive Export Engine:
 *    - Converts caption history into formatted plain-text archives (`.txt`) and initiates client-side file downloads via `URL.createObjectURL`.
 */

import React, { useEffect, useRef, useState } from "react"
import type { CaptionBlock } from "../hooks/useLiveCaptions"
import { jsPDF } from "jspdf"

interface TranscriptHistoryOverlayProps {
  isDark: boolean
  captions: CaptionBlock[]
  onClose: () => void
}

export default function TranscriptHistoryOverlay({ isDark, captions, onClose }: TranscriptHistoryOverlayProps) {
  const [isMounted, setIsMounted] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const isAtBottomRef = useRef(true)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  const handleScroll = () => {
    if (!scrollContainerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current
    const distanceToBottom = scrollHeight - scrollTop - clientHeight
    const atBottom = distanceToBottom < 60
    if (isAtBottomRef.current !== atBottom) {
      isAtBottomRef.current = atBottom
      setIsAtBottom(atBottom)
    }
  }

  useEffect(() => {
    setIsMounted(true)
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
    return () => setIsMounted(false)
  }, [])

  useEffect(() => {
    if (scrollContainerRef.current && isAtBottomRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [captions])

  const exportAsTxt = () => {
    if (captions.length === 0) return

    const now = new Date()
    const formattedDate = now.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    })
    const formattedTime = now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    })
    const siteTitle = document.title || window.location.hostname || "Live Session"
    const siteUrl = window.location.href

    let textContent = ""
    textContent += "================================================================================\n"
    textContent += "                           SENSA LIVE TRANSCRIPTION\n"
    textContent += "================================================================================\n"
    textContent += `Generated On : ${formattedDate} at ${formattedTime}\n`
    textContent += `Source Page  : ${siteTitle}\n`
    textContent += `URL          : ${siteUrl}\n`
    textContent += `Total Items  : ${captions.length} dialogue entries\n`
    textContent += `Export Type  : Plain Text Archive (.txt) [UTF-8]\n`
    textContent += "================================================================================\n\n"

    captions.forEach((c, idx) => {
      const num = String(idx + 1).padStart(2, "0")
      textContent += `[Entry #${num}]\n`
      if (c.original) {
        textContent += `  Original   : ${c.original.trim()}\n`
      }
      if (c.translated) {
        textContent += `  Translated : ${c.translated.trim()}\n`
      }
      textContent += "\n--------------------------------------------------------------------------------\n\n"
    })

    textContent += "================================================================================\n"
    textContent += "          End of Live Transcription Archive • Powered by Sensa\n"
    textContent += "================================================================================\n"

    // Prefix with \uFEFF (UTF-8 Byte Order Mark) so Notepad and all OS text viewers decode Unicode/accents/symbols without mojibake
    const blob = new Blob(["\uFEFF" + textContent], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `Sensa_Transcript_${now.toISOString().slice(0, 10)}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const exportAsPdf = () => {
    if (captions.length === 0) return

    const now = new Date()
    const formattedDate = now.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric"
    })
    const formattedTime = now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit"
    })
    const siteDomain = window.location.hostname || "Live Page"

    // Universal multi-lingual font stack matching system rendering
    const FONT_BASE = 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif'

    const wrapCanvasText = (ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
      const paragraphs = text.split("\n")
      const lines: string[] = []

      for (const para of paragraphs) {
        if (!para.trim()) {
          lines.push("")
          continue
        }
        const words = para.split(" ")
        let currentLine = ""

        for (let i = 0; i < words.length; i++) {
          const word = words[i]
          const testLine = currentLine ? `${currentLine} ${word}` : word
          const metrics = ctx.measureText(testLine)

          if (metrics.width > maxWidth && currentLine) {
            lines.push(currentLine)
            currentLine = word
            while (ctx.measureText(currentLine).width > maxWidth && currentLine.length > 1) {
              let splitIdx = 1
              while (splitIdx < currentLine.length && ctx.measureText(currentLine.slice(0, splitIdx + 1)).width <= maxWidth) {
                splitIdx++
              }
              lines.push(currentLine.slice(0, splitIdx))
              currentLine = currentLine.slice(splitIdx)
            }
          } else {
            currentLine = testLine
          }
        }
        if (currentLine) {
          while (ctx.measureText(currentLine).width > maxWidth && currentLine.length > 1) {
            let splitIdx = 1
            while (splitIdx < currentLine.length && ctx.measureText(currentLine.slice(0, splitIdx + 1)).width <= maxWidth) {
              splitIdx++
            }
            lines.push(currentLine.slice(0, splitIdx))
            currentLine = currentLine.slice(splitIdx)
          }
          lines.push(currentLine)
        }
      }
      return lines
    }

    const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
      if (typeof ctx.roundRect === "function") {
        ctx.beginPath()
        ctx.roundRect(x, y, w, h, r)
        ctx.fill()
      } else {
        ctx.beginPath()
        ctx.moveTo(x + r, y)
        ctx.lineTo(x + w - r, y)
        ctx.arcTo(x + w, y, x + w, y + r, r)
        ctx.lineTo(x + w, y + h - r)
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
        ctx.lineTo(x + r, y + h)
        ctx.arcTo(x, y + h, x, y + h - r, r)
        ctx.lineTo(x, y + r)
        ctx.arcTo(x, y, x + r, y, r)
        ctx.closePath()
        ctx.fill()
      }
    }

    // A4 dimensions at 2x resolution (1190 x 1684 px) for razor-sharp vector-like print quality
    const CANVAS_WIDTH = 1190
    const CANVAS_HEIGHT = 1684
    const MARGIN = 80
    const CONTENT_WIDTH = CANVAS_WIDTH - MARGIN * 2

    const pages: HTMLCanvasElement[] = []

    const createPageCanvas = (): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } => {
      const canvas = document.createElement("canvas")
      canvas.width = CANVAS_WIDTH
      canvas.height = CANVAS_HEIGHT
      const ctx = canvas.getContext("2d")!
      ctx.fillStyle = "#FFFFFF"
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT)
      return { canvas, ctx }
    }

    let { canvas: currentPageCanvas, ctx } = createPageCanvas()
    pages.push(currentPageCanvas)

    // Render Page 1 Header
    ctx.fillStyle = "#FF7A2F" // Sensa Orange
    ctx.fillRect(0, 0, CANVAS_WIDTH, 115)

    ctx.fillStyle = "#FFFFFF"
    ctx.font = `bold 32px ${FONT_BASE}`
    ctx.fillText("SENSA LIVE TRANSCRIPT", MARGIN, 70)

    ctx.font = `18px ${FONT_BASE}`
    ctx.textAlign = "right"
    ctx.fillText(formattedDate, CANVAS_WIDTH - MARGIN, 70)
    ctx.textAlign = "left"

    let y = 160
    ctx.font = `bold 18px ${FONT_BASE}`
    ctx.fillStyle = "#64748B"
    ctx.fillText("SESSION DETAILS:", MARGIN, y)

    ctx.font = `18px ${FONT_BASE}`
    ctx.fillStyle = "#334155"
    ctx.fillText(`Target: ${siteDomain}   •   Time: ${formattedTime}   •   Total Entries: ${captions.length}`, MARGIN + 190, y)
    y += 24

    ctx.strokeStyle = "#E2E8F0"
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(MARGIN, y)
    ctx.lineTo(CANVAS_WIDTH - MARGIN, y)
    ctx.stroke()
    y += 35

    // Render entries
    captions.forEach((c, idx) => {
      ctx.font = `19px ${FONT_BASE}`
      const origLines = c.original ? wrapCanvasText(ctx, `Original: ${c.original.trim()}`, CONTENT_WIDTH - 40) : []
      ctx.font = `bold 21px ${FONT_BASE}`
      const transLines = c.translated ? wrapCanvasText(ctx, `Translated: ${c.translated.trim()}`, CONTENT_WIDTH - 40) : []

      const cardPadding = 30
      const origHeight = origLines.length > 0 ? origLines.length * 28 + 10 : 0
      const transHeight = transLines.length > 0 ? transLines.length * 30 + 10 : 0
      const entryHeight = 44 + origHeight + transHeight + cardPadding

      // If entry overflows page boundary, start fresh page canvas
      if (y + entryHeight > CANVAS_HEIGHT - 120) {
        const next = createPageCanvas()
        currentPageCanvas = next.canvas
        ctx = next.ctx
        pages.push(currentPageCanvas)
        y = 80 // top margin on subsequent pages
      }

      // Card Background
      ctx.fillStyle = "#F8FAFC" // Slate-50
      drawRoundedRect(ctx, MARGIN, y, CONTENT_WIDTH, entryHeight, 10)

      // Card Subtle Border
      ctx.strokeStyle = "#E2E8F0"
      ctx.lineWidth = 1.5
      if (typeof ctx.roundRect === "function") {
        ctx.beginPath()
        ctx.roundRect(MARGIN, y, CONTENT_WIDTH, entryHeight, 10)
        ctx.stroke()
      }

      // Badge
      ctx.font = `bold 17px ${FONT_BASE}`
      ctx.fillStyle = "#FF7A2F"
      ctx.fillText(`ENTRY #${idx + 1}`, MARGIN + 22, y + 32)

      let lineY = y + 62

      if (c.original) {
        ctx.font = `19px ${FONT_BASE}`
        ctx.fillStyle = "#64748B"
        for (const line of origLines) {
          ctx.fillText(line, MARGIN + 22, lineY)
          lineY += 28
        }
        lineY += 6
      }

      if (c.translated) {
        ctx.font = `bold 21px ${FONT_BASE}`
        ctx.fillStyle = "#0F172A" // Slate-900
        for (const line of transLines) {
          ctx.fillText(line, MARGIN + 22, lineY)
          lineY += 30
        }
      }

      y += entryHeight + 20
    })

    // Add running footers to every page canvas
    const totalPages = pages.length
    pages.forEach((pCanvas, pIndex) => {
      const pageCtx = pCanvas.getContext("2d")!
      const footerY = CANVAS_HEIGHT - 60

      pageCtx.strokeStyle = "#E2E8F0"
      pageCtx.lineWidth = 1
      pageCtx.beginPath()
      pageCtx.moveTo(MARGIN, footerY - 20)
      pageCtx.lineTo(CANVAS_WIDTH - MARGIN, footerY - 20)
      pageCtx.stroke()

      pageCtx.font = `16px ${FONT_BASE}`
      pageCtx.fillStyle = "#94A3B8"
      pageCtx.fillText("Generated by Sensa Accessibility Suite • Universal Language Live Captions", MARGIN, footerY + 8)

      pageCtx.textAlign = "right"
      pageCtx.fillText(`Page ${pIndex + 1} of ${totalPages}`, CANVAS_WIDTH - MARGIN, footerY + 8)
      pageCtx.textAlign = "left"
    })

    // Construct multi-page PDF using high-resolution raster canvases
    const doc = new jsPDF({ unit: "pt", format: "a4" })
    const pdfPageWidth = doc.internal.pageSize.getWidth()
    const pdfPageHeight = doc.internal.pageSize.getHeight()

    pages.forEach((pCanvas, pIndex) => {
      if (pIndex > 0) doc.addPage()
      const dataUrl = pCanvas.toDataURL("image/png")
      doc.addImage(dataUrl, "PNG", 0, 0, pdfPageWidth, pdfPageHeight, undefined, "FAST")
    })

    const filename = `Sensa_Transcript_${now.toISOString().slice(0, 10)}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}.pdf`
    doc.save(filename)
  }

  const modalBg = isDark ? "bg-[#17171A]" : "bg-white"
  const textColor = isDark ? "text-white" : "text-gray-950"
  const secondaryText = isDark ? "text-gray-400" : "text-gray-500"

  return (
    <div
      className="fixed right-0 top-0 bottom-0 z-[999999] flex font-sans"
      role="dialog"
      aria-label="Transcript Sidebar"
    >
      <div
        className={`relative w-[420px] h-full ${modalBg} border-l ${isDark ? "border-white/10" : "border-black/10"} shadow-[-20px_0_40px_rgba(0,0,0,0.15)] flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${isMounted ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className={`shrink-0 flex items-center justify-between p-6 border-b ${isDark ? "border-white/10" : "border-black/5"}`}>
          <div>
            <h2 className={`text-xl font-bold tracking-tight ${textColor}`}>Full Transcript</h2>
            <p className={`text-[13px] font-medium mt-1 ${secondaryText}`}>Your live caption history</p>
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

        <div className="relative flex-1 flex flex-col overflow-hidden">
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-6 flex flex-col gap-4 scroll-smooth"
          >
            {captions.length === 0 ? (
              <div className={`text-center py-10 italic ${secondaryText}`}>
                No captions recorded yet.
              </div>
            ) : (
              captions.map((b) => (
                <div key={b.id} className={`p-4 rounded-[14px] ${isDark ? "bg-white/5 border border-white/10" : "bg-black/5 border border-black/5"} flex flex-col gap-2`}>
                  {b.original && (
                    <div className={`text-[13px] font-medium opacity-75 ${textColor}`}>
                      {b.original}
                    </div>
                  )}
                  {b.translated && (
                    <div className={`text-[15px] font-bold leading-snug ${textColor}`}>
                      {b.translated}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {!isAtBottom && captions.length > 0 && (
            <button
              onClick={() => {
                if (scrollContainerRef.current) {
                  scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
                  isAtBottomRef.current = true
                  setIsAtBottom(true)
                }
              }}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 py-2 px-4 rounded-full bg-[#FF7A2F] text-white text-xs font-semibold shadow-[0_4px_14px_rgba(255,122,47,0.4)] hover:bg-[#E86A25] transition-all flex items-center gap-1.5 z-10 animate-fade-in"
            >
              <span>↓ Scroll to bottom</span>
            </button>
          )}
        </div>

        <div className={`shrink-0 p-5 border-t ${isDark ? "border-white/10" : "border-black/5"} flex flex-col gap-2.5`}>
          <div className="flex items-center gap-2.5 w-full">
            <button
              onClick={exportAsTxt}
              disabled={captions.length === 0}
              title="Download as formatted text file (.txt)"
              aria-label="Export transcript as text file"
              className={`flex-1 py-3 px-3 flex items-center justify-center gap-2 rounded-xl font-semibold text-[13px] tracking-wide transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                captions.length > 0
                  ? isDark
                    ? "bg-white/10 hover:bg-white/15 text-white border border-white/15 hover:border-white/25 active:scale-[0.98]"
                    : "bg-gray-100 hover:bg-gray-200 text-gray-800 border border-gray-300/80 active:scale-[0.98]"
                  : "bg-gray-200 dark:bg-gray-800 text-gray-400"
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              Export .TXT
            </button>

            <button
              onClick={exportAsPdf}
              disabled={captions.length === 0}
              title="Download as formatted PDF document (.pdf)"
              aria-label="Export transcript as PDF document"
              className={`flex-1 py-3 px-3 flex items-center justify-center gap-2 rounded-xl font-semibold text-[13px] tracking-wide text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                captions.length > 0
                  ? "bg-[#FF7A2F] hover:bg-[#E86A25] shadow-[0_4px_14px_rgba(255,122,47,0.35)] hover:shadow-[0_6px_20px_rgba(255,122,47,0.45)] hover:scale-[1.02] active:scale-[0.98]"
                  : "bg-gray-400 dark:bg-gray-700"
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <path d="M9 15h3a1.5 1.5 0 0 0 0-3H9v6" />
              </svg>
              Export .PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
