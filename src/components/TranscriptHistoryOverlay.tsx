import React, { useEffect, useRef, useState } from "react"
import type { CaptionBlock } from "../hooks/useLiveCaptions"

interface TranscriptHistoryOverlayProps {
  isDark: boolean
  captions: CaptionBlock[]
  onClose: () => void
}

export default function TranscriptHistoryOverlay({ isDark, captions, onClose }: TranscriptHistoryOverlayProps) {
  const [isMounted, setIsMounted] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setIsMounted(true)
    return () => setIsMounted(false)
  }, [])

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [captions])

  const exportTranscript = () => {
    if (captions.length === 0) return

    let textContent = "--- Sensa Live Transcript ---\n\n"
    captions.forEach(c => {
      if (c.original) textContent += `Original: ${c.original}\n`
      if (c.translated) textContent += `Translated: ${c.translated}\n`
      textContent += "\n"
    })

    const blob = new Blob([textContent], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `Sensa_Transcript_${new Date().toISOString().replace(/[:.]/g, "-")}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
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

        <div 
          ref={scrollContainerRef}
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

        <div className={`shrink-0 p-6 border-t ${isDark ? "border-white/10" : "border-black/5"}`}>
          <button
            onClick={exportTranscript}
            disabled={captions.length === 0}
            className={`w-full py-3.5 px-4 flex items-center justify-center gap-2 rounded-xl font-semibold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              captions.length > 0 
                ? "bg-gradient-to-br from-[#FF7A2F] to-[#E86A25] shadow-[0_4px_14px_rgba(255,122,47,0.3)] hover:shadow-[0_6px_20px_rgba(255,122,47,0.4)] hover:scale-[1.02] active:scale-[0.98]"
                : "bg-gray-400 dark:bg-gray-700"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download Transcript (.txt)
          </button>
        </div>
      </div>
    </div>
  )
}
