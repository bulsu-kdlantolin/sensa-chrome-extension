import { Tooltip } from "./Tooltip"
import type { FrequencyData } from "../hooks/useAudioFrequencyAnalysis"

interface AuditoryDockProps {
  isDark: boolean
  isMinimized: boolean
  isCaptionsActive: boolean
  onToggleCaptions: () => void
  onMinimizeToggle: () => void
  onOpenCaptionLanguage: () => void
  onOpenTextSize: () => void
  onOpenCaptionTransparency: () => void
  isFocusMode: boolean
  onToggleFocusMode: () => void
  onOpenSettings: () => void
  frequencyData?: FrequencyData
  onClose: () => void
}

export default function AuditoryDock({ isDark, isMinimized, isCaptionsActive, onToggleCaptions, onMinimizeToggle, onOpenCaptionLanguage, onOpenTextSize, onOpenCaptionTransparency, isFocusMode, onToggleFocusMode, onOpenSettings, frequencyData, onClose }: AuditoryDockProps) {
  const pillBg = isDark ? "bg-gray-900" : "bg-white"
  const iconColorInactive = isDark ? "text-gray-300" : "text-black"
  const hoverInactive = isDark ? "hover:bg-gray-800" : "hover:bg-gray-100"

  // 🎯 VISUAL SOUND RADAR: Generate animated bars from frequency data
  const getBarHeights = () => {
    if (!frequencyData?.frequencies || frequencyData.frequencies.length === 0) {
      return [0, 0, 0, 0]
    }

    // Split frequency data into 4 bands for visualization
    const len = frequencyData.frequencies.length
    const bandSize = Math.floor(len / 4)
    const bars = []

    for (let i = 0; i < 4; i++) {
      const start = i * bandSize
      const end = (i + 1) * bandSize
      const bandData = frequencyData.frequencies.slice(start, end)
      
      // Get average amplitude for this band (normalize to 0-100)
      const avg = bandData.reduce((a, b) => a + b, 0) / Math.max(1, bandData.length)
      bars.push(Math.min(100, (avg / 255) * 100))
    }

    return bars
  }

  const barHeights = getBarHeights()

  return (
    <div className="flex flex-col gap-[12px]">
      {/* TOP PILL */}
      <div className={`flex flex-col items-center ${pillBg} rounded-full p-[6px] border-2 border-[#FF7A2F] shadow-lg gap-[8px]`}>
        {/* 🎯 VISUAL SOUND RADAR: Animated Audio Visualizer */}
        <button className={`relative group w-[40px] h-[40px] flex items-center justify-center rounded-full ${hoverInactive} transition-colors ${iconColorInactive}`}>
          <Tooltip label="Audio Visualizer" isDark={isDark} />
          <div className="flex items-center justify-center gap-[3px] h-[24px]">
            {barHeights.map((height, idx) => (
              <div
                key={idx}
                className="w-[1.5px] bg-gradient-to-t from-[#FF7A2F] to-[#FFB366] rounded-full transition-all duration-100"
                style={{
                  height: `${Math.max(4, height)}px`,
                  opacity: 0.6 + (height / 100) * 0.4
                }}
              />
            ))}
          </div>
        </button>

        <button
          type="button"
          onClick={onToggleCaptions}
          aria-pressed={isCaptionsActive}
          className={`relative group w-[40px] h-[40px] flex items-center justify-center rounded-full text-white shadow-md transition-all ${isCaptionsActive ? "bg-[#E86A25] ring-2 ring-white/90 ring-offset-2 ring-offset-[#FF7A2F]" : "bg-[#FF7A2F] hover:bg-[#E86A25] opacity-85"}`}
        >
          <Tooltip label={isCaptionsActive ? "Turn Off Caption" : "Turn On Caption"} isDark={isDark} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-[20px] h-[20px]">
            <rect x="3" y="6" width="18" height="12" rx="2" />
            <path d="M10 10.5a2.5 2.5 0 0 0-3.5 0" />
            <path d="M10 13.5a2.5 2.5 0 0 1-3.5 0" />
            <path d="M17.5 10.5a2.5 2.5 0 0 0-3.5 0" />
            <path d="M17.5 13.5a2.5 2.5 0 0 1-3.5 0" />
          </svg>
          {isCaptionsActive && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-lime-300 border border-white" />
          )}
        </button>
      </div>

      {/* MIDDLE PILL */}
      {!isMinimized && (
        <div className={`flex flex-col items-center ${pillBg} rounded-full p-[6px] border-2 border-[#FF7A2F] shadow-lg gap-[6px]`}>
          <button
            onClick={onOpenCaptionLanguage}
            className={`relative group w-[40px] h-[40px] flex items-center justify-center rounded-full ${hoverInactive} transition-colors ${iconColorInactive}`}
          >
            <Tooltip label="Caption Language" isDark={isDark} />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[20px] h-[20px]">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
              <path d="M2 12h20" />
            </svg>
          </button>
          <button
            onClick={onOpenTextSize}
            className={`relative group w-[40px] h-[40px] flex items-center justify-center rounded-full ${hoverInactive} transition-colors ${iconColorInactive}`}
          >
            <Tooltip label="Text Size" isDark={isDark} />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-[20px] h-[20px]">
              <polyline points="4 7 4 4 20 4 20 7" />
              <line x1="12" y1="4" x2="12" y2="20" />
              <line x1="8" y1="20" x2="16" y2="20" />
            </svg>
          </button>
          <button
            onClick={onOpenCaptionTransparency}
            className={`relative group w-[40px] h-[40px] flex items-center justify-center rounded-full ${hoverInactive} transition-colors ${iconColorInactive}`}
          >
            <Tooltip label="Caption Transparency" isDark={isDark} />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[20px] h-[20px]">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <rect x="7" y="13" width="10" height="4" rx="1" />
            </svg>
          </button>
          <button
            onClick={onToggleFocusMode}
            className={`relative group w-[40px] h-[40px] flex items-center justify-center rounded-full transition-colors ${isFocusMode ? "bg-[#FF7A2F] text-white shadow-md hover:bg-[#E86A25]" : `${hoverInactive} ${iconColorInactive}`}`}
          >
            <Tooltip label="Focus Mode" isDark={isDark} />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-[20px] h-[20px]">
              <path d="M3 8V5a2 2 0 0 1 2-2h3" />
              <path d="M21 8V5a2 2 0 0 0-2-2h-3" />
              <path d="M3 16v3a2 2 0 0 0 2 2h3" />
              <path d="M21 16v3a2 2 0 0 1-2 2h-3" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            className={`relative group w-[40px] h-[40px] flex items-center justify-center rounded-full ${hoverInactive} transition-colors ${iconColorInactive}`}
          >
            <Tooltip label="Settings" isDark={isDark} />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-[24px] h-[24px]">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      )}

      {/* BOTTOM PILL */}
      <div className={`flex flex-col items-center ${pillBg} rounded-full p-[6px] border-2 border-[#FF7A2F] shadow-lg gap-[8px]`}>
        <button 
          onClick={onMinimizeToggle}
          className={`relative group w-[40px] h-[40px] flex items-center justify-center rounded-full ${hoverInactive} transition-colors ${iconColorInactive}`}
        >
          <Tooltip label={isMinimized ? "Expand" : "Minimize"} isDark={isDark} />
          {isMinimized ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-[20px] h-[20px]">
              <polyline points="7 15 12 10 17 15" />
              <polyline points="7 9 12 4 17 9" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-[20px] h-[20px]">
              <polyline points="7 9 12 14 17 9" />
              <polyline points="7 15 12 20 17 15" />
            </svg>
          )}
        </button>

        <button 
          onClick={onClose}
          className={`relative group w-[40px] h-[40px] flex items-center justify-center rounded-full ${hoverInactive} transition-colors ${iconColorInactive}`}
        >
          <Tooltip label="Close" isRed isDark={isDark} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-[24px] h-[24px]">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}