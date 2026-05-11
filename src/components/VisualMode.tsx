import { useState, useEffect } from "react"

export default function VisualMode() {
  const [isListening, setIsListening] = useState(false)

  // --- THE TWO-WAY BRIDGE ---
  useEffect(() => {
    chrome.storage.local.get(["sensa_visual_active"], (res) => {
      setIsListening(!!res.sensa_visual_active)
    })

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.sensa_visual_active !== undefined) {
        setIsListening(changes.sensa_visual_active.newValue)
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [])

  const handleToggle = () => {
    const newState = !isListening
    setIsListening(newState)
    chrome.runtime.sendMessage({ type: "sensa-activate-mode", mode: newState ? "visual" : null })
    chrome.storage.local.set({
      sensa_visual_active: newState,
      ...(newState ? { sensa_auditory_active: false } : {})
    })
  }

  const springTransition = "transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"

  return (
    // 🚨 BUG EXTERMINATION: Changed overflow-hidden to overflow-visible so the glow doesn't get clipped!
    <div className="flex-1 flex flex-col items-center justify-center px-6 w-full h-full bg-transparent select-none relative overflow-visible">
      
      {/* 🚨 ISOLATED CSS INJECTION */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes visual-soundwave {
          0%, 100% { transform: scaleY(0.5); opacity: 0.5; }
          50% { transform: scaleY(1.2); opacity: 1; }
        }
        @keyframes visual-pulse-glow {
          0%, 100% { box-shadow: 0 0 25px rgba(10,68,255,0.3); }
          50% { box-shadow: 0 0 65px rgba(10,68,255,0.8); }
        }
        
        .animate-visual-wave-1 { animation: visual-soundwave 0.8s ease-in-out infinite 0.0s; }
        .animate-visual-wave-2 { animation: visual-soundwave 0.8s ease-in-out infinite 0.2s; }
        .animate-visual-wave-3 { animation: visual-soundwave 0.8s ease-in-out infinite 0.4s; }
        .animate-visual-wave-4 { animation: visual-soundwave 0.8s ease-in-out infinite 0.6s; }
        
        /* 🚨 PERFECT SYNC: Glow is now exactly 1.6s (exactly 2x the 0.8s wave cycle) */
        .animate-visual-pulse-glow { animation: visual-pulse-glow 1.6s ease-in-out infinite backwards; }
      `}} />

      <div className="flex flex-col items-center justify-center w-full relative z-10">

        <div className="flex items-center justify-center gap-6 mb-10 mt-4 w-full relative overflow-visible">
          
          {/* LEFT SOUNDWAVE */}
          <div className={`flex items-center gap-2.5 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] shrink-0 ${isListening ? 'opacity-100 scale-100 text-[#0A44FF]' : 'opacity-0 scale-75 pointer-events-none text-gray-300'}`}>
            <div className={`w-[5px] h-4 bg-current rounded-full origin-center ${isListening ? 'animate-visual-wave-1' : ''}`} />
            <div className={`w-[5px] h-8 bg-current rounded-full origin-center ${isListening ? 'animate-visual-wave-2' : ''}`} />
            <div className={`w-[5px] h-12 bg-current rounded-full origin-center ${isListening ? 'animate-visual-wave-3' : ''}`} />
            <div className={`w-[5px] h-5 bg-current rounded-full origin-center ${isListening ? 'animate-visual-wave-4' : ''}`} />
          </div>

          {/* MAIN MIC BUTTON */}
          <button
            style={{ WebkitTapHighlightColor: 'transparent' }}
            onClick={handleToggle}
            aria-pressed={isListening}
            aria-label={isListening ? "Deactivate Visual Mode" : "Activate Visual Mode"}
            className={`w-[136px] h-[136px] shrink-0 rounded-full flex items-center justify-center relative group outline-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-4 focus-visible:ring-[#0A44FF]/60 transform-gpu active:scale-90 ${springTransition}
              ${isListening 
                ? "bg-[#0A44FF] scale-105 animate-visual-pulse-glow" 
                : "bg-[#0A44FF] ring-[10px] ring-[#0A44FF]/10 shadow-[0_16px_35px_rgba(0,0,0,0.15)] hover:scale-105 hover:bg-[#0836CC] hover:ring-[#0A44FF]/20"
              }`}
          >
            <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/25 to-transparent pointer-events-none" />

            <div className="relative z-10 flex items-center justify-center w-full h-full pointer-events-none">
              {isListening ? (
                <svg focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-[60px] h-[60px] drop-shadow-md">
                  <line x1="2" y1="2" x2="22" y2="22" />
                  <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
                  <path d="M5 10v2a7 7 0 0 0 12 5" />
                  <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
              ) : (
                <svg focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-[60px] h-[60px] drop-shadow-md transition-transform group-hover:scale-110 duration-300">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
              )}
            </div>
          </button>

          {/* RIGHT SOUNDWAVE */}
          <div className={`flex items-center gap-2.5 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] shrink-0 ${isListening ? 'opacity-100 scale-100 text-[#0A44FF]' : 'opacity-0 scale-75 pointer-events-none text-gray-300'}`}>
            <div className={`w-[5px] h-5 bg-current rounded-full origin-center ${isListening ? 'animate-visual-wave-4' : ''}`} />
            <div className={`w-[5px] h-12 bg-current rounded-full origin-center ${isListening ? 'animate-visual-wave-3' : ''}`} />
            <div className={`w-[5px] h-8 bg-current rounded-full origin-center ${isListening ? 'animate-visual-wave-2' : ''}`} />
            <div className={`w-[5px] h-4 bg-current rounded-full origin-center ${isListening ? 'animate-visual-wave-1' : ''}`} />
          </div>
        </div>

        <h2 className={`relative transform-gpu text-[22px] font-semibold text-center whitespace-pre-line leading-relaxed tracking-wide transition-colors duration-500 ${isListening ? "text-[#0A44FF]" : "text-gray-500"}`}>
          {isListening ? "Click or Speak to Deactivate" : "Click or Speak to Activate"}
        </h2>

      </div>
    </div>
  )
}