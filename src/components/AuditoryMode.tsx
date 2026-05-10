import { useState, useEffect } from "react"

interface AuditoryModeProps {
  isDark: boolean
}

export default function AuditoryMode({ isDark }: AuditoryModeProps) {
  const [isCapturing, setIsCapturing] = useState(false)

  // --- THE TWO-WAY BRIDGE ---
  useEffect(() => {
    // 1. Check status the exact millisecond the popup opens
    chrome.storage.local.get(["sensa_auditory_active"], (res) => {
      setIsCapturing(!!res.sensa_auditory_active)
    })

    // 2. Listen for the web page telling us it closed
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.sensa_auditory_active !== undefined) {
        setIsCapturing(changes.sensa_auditory_active.newValue)
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [])

  // Send signal to web page
  const handleToggle = () => {
    const newState = !isCapturing
    setIsCapturing(newState)
    chrome.runtime.sendMessage({ type: "sensa-activate-mode", mode: newState ? "auditory" : null })
    chrome.storage.local.set({
      sensa_auditory_active: newState,
      // Enforce single active mode: turning auditory on must turn visual off.
      ...(newState ? { sensa_visual_active: false } : {})
    })
  }

  // Apple-style spring animation curve (for click/hover physics)
  const springTransition = "transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 w-full h-full select-none relative overflow-visible bg-transparent">
      
      {/* 🚨 CSS Injection for Sequential Broadcast Ping Animation */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(255,122,47,0.3); }
          50% { box-shadow: 0 0 55px rgba(255,122,47,0.8); }
        }
        
        /* The discrete radar ping: sharp appear, sharp disappear, then sleep */
        @keyframes arc-broadcast {
          0%   { opacity: 0.15; transform: scale(0.95); }
          15%  { opacity: 1; transform: scale(1.02); }
          35%  { opacity: 0.15; transform: scale(1.05); }
          100% { opacity: 0.15; transform: scale(1.05); }
        }
        
        /* Main button breathing */
        .animate-pulse-glow { animation: pulse-glow 2.4s ease-in-out 0s infinite backwards; }
        
        /* Anchors the scaling physics perfectly to the SVG dot at (5, 12) */
        .arc-wave { transform-origin: 5px 12px; }
        
        /* Sequential staggered ping: appears and disappears one by one */
        .arc-1 { animation: arc-broadcast 2.4s ease-in-out 0.0s infinite backwards; }
        .arc-2 { animation: arc-broadcast 2.4s ease-in-out 0.25s infinite backwards; }
        .arc-3 { animation: arc-broadcast 2.4s ease-in-out 0.5s infinite backwards; }
      `}} />

      {/* 🎙️ MAIN INTERACTION ZONE */}
      <div className="flex items-center justify-center gap-7 mb-10 pt-4 z-10 w-full relative overflow-visible">
        
        {/* 🚨 Left Soundwave (Rotated 180deg to radiate outwards left) */}
        <div className={`flex items-center justify-center shrink-0 transition-colors duration-500 ${isCapturing ? 'text-[#FF7A2F]' : (isDark ? 'text-gray-700' : 'text-gray-200')}`}>
          <svg viewBox="-3 -3 30 30" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="4" className="w-[72px] h-[72px] rotate-180 drop-shadow-sm overflow-visible">
            {/* Inner arc */}
            <path d="M 6 8 A 6 6 0 0 1 6 16" className={`arc-wave transition-opacity duration-500 ${isCapturing ? "arc-1" : "opacity-20"}`} />
            {/* Middle arc */}
            <path d="M 10 4 A 11 11 0 0 1 10 20" className={`arc-wave transition-opacity duration-500 ${isCapturing ? "arc-2" : "opacity-20"}`} />
            {/* Outer arc */}
            <path d="M 14 0 A 16 16 0 0 1 14 24" className={`arc-wave transition-opacity duration-500 ${isCapturing ? "arc-3" : "opacity-20"}`} />
          </svg>
        </div>

        {/* 🚨 Hyper-Tactile CC Button */}
        <button
          style={{ WebkitTapHighlightColor: 'transparent' }}
          onClick={handleToggle}
          aria-pressed={isCapturing}
          aria-label={isCapturing ? "Deactivate" : "Activate"}
          className={`w-[136px] h-[136px] shrink-0 rounded-full flex items-center justify-center relative group outline-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-0 focus-visible:ring-[#FF7A2F]/50 transform-gpu active:scale-90 ${springTransition}
            ${isCapturing 
              ? "bg-[#FF7A2F] scale-105 animate-pulse-glow" 
              : `bg-[#FF7A2F] ring-[10px] ${isDark ? "ring-white/10" : "ring-[#FF7A2F]/10"} shadow-[0_16px_35px_rgba(0,0,0,0.15)] hover:scale-105 hover:bg-[#E86A25] ${isDark ? "hover:ring-white/15" : "hover:ring-[#FF7A2F]/20"}`
            }`}
        >
          {/* Glassmorphic Inner Highlight to give the button 3D volume */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/25 to-transparent pointer-events-none" />

          {/* The CC Icon */}
          <div className={`w-[76px] h-[58px] bg-white rounded-[16px] flex items-center justify-center pointer-events-none select-none transition-transform group-hover:scale-110 duration-300 ${isCapturing ? 'drop-shadow-md' : 'shadow-[0_4px_12px_rgba(0,0,0,0.15)]'}`}>
            <span className={`font-black text-[32px] tracking-tighter transition-colors pointer-events-none text-[#FF7A2F]`}>
              CC
            </span>
          </div>
        </button>

        {/* 🚨 Right Soundwave (Normal orientation, radiating right) */}
        <div className={`flex items-center justify-center shrink-0 transition-colors duration-500 ${isCapturing ? 'text-[#FF7A2F]' : (isDark ? 'text-gray-700' : 'text-gray-200')}`}>
          <svg viewBox="-3 -3 30 30" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="4" className="w-[72px] h-[72px] drop-shadow-sm overflow-visible">
            {/* Inner arc */}
            <path d="M 6 8 A 6 6 0 0 1 6 16" className={`arc-wave transition-opacity duration-500 ${isCapturing ? "arc-1" : "opacity-20"}`} />
            {/* Middle arc */}
            <path d="M 10 4 A 11 11 0 0 1 10 20" className={`arc-wave transition-opacity duration-500 ${isCapturing ? "arc-2" : "opacity-20"}`} />
            {/* Outer arc */}
            <path d="M 14 0 A 16 16 0 0 1 14 24" className={`arc-wave transition-opacity duration-500 ${isCapturing ? "arc-3" : "opacity-20"}`} />
          </svg>
        </div>
      </div>

      {/* 📝 SLEEK INSTRUCTIONAL TEXT */}
      <h2 className={`relative z-20 transform-gpu text-[22px] font-semibold text-center whitespace-pre-line leading-relaxed tracking-wide transition-colors duration-500 ${isCapturing ? (isDark ? "text-white/90" : "text-[#FF7A2F]") : (isDark ? "text-gray-400" : "text-gray-500")}`}>
        {isCapturing ? "Click to Deactivate" : "Click to Activate"}
      </h2>

    </div>
  )
}