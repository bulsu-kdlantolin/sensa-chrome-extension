import { useState, useEffect } from "react"

export default function VisualMode() {
  const [isListening, setIsListening] = useState(false)

  // --- THE TWO-WAY BRIDGE ---
  useEffect(() => {
    // 1. Check status the exact millisecond the popup opens
    chrome.storage.local.get(["sensa_visual_active"], (res) => {
      setIsListening(!!res.sensa_visual_active)
    })

    // 2. Listen for the web page telling us it closed
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.sensa_visual_active !== undefined) {
        setIsListening(changes.sensa_visual_active.newValue)
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [])

  // Send signal to web page
  const handleToggle = () => {
    const newState = !isListening
    chrome.runtime.sendMessage({ type: "sensa-activate-mode", mode: newState ? "visual" : null })
    chrome.storage.local.set({
      sensa_visual_active: newState,
      // Enforce single active mode: turning visual on must turn auditory off.
      ...(newState ? { sensa_auditory_active: false } : {})
    })
  }

  // Apple-style spring animation curve
  const springTransition = "transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 w-full h-full bg-white select-none">
      
      {/* 🚨 CSS Injection for active soundwave bouncing */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes soundwave {
          0%, 100% { transform: scaleY(0.5); opacity: 0.5; }
          50% { transform: scaleY(1.2); opacity: 1; }
        }
        .animate-wave-1 { animation: soundwave 0.8s ease-in-out infinite 0.0s; }
        .animate-wave-2 { animation: soundwave 0.8s ease-in-out infinite 0.2s; }
        .animate-wave-3 { animation: soundwave 0.8s ease-in-out infinite 0.4s; }
        .animate-wave-4 { animation: soundwave 0.8s ease-in-out infinite 0.6s; }
      `}} />

      <div className="flex items-center justify-center gap-6 mb-10 mt-4">
        
        {/* Left Soundwave */}
        <div className={`flex items-center gap-2 transition-colors duration-500 ${isListening ? 'text-[#0A44FF]' : 'text-gray-200'}`}>
          <div className={`w-[4px] h-3 bg-current rounded-full origin-center ${isListening ? 'animate-wave-1' : ''}`} />
          <div className={`w-[4px] h-6 bg-current rounded-full origin-center ${isListening ? 'animate-wave-2' : ''}`} />
          <div className={`w-[4px] h-10 bg-current rounded-full origin-center ${isListening ? 'animate-wave-3' : ''}`} />
          <div className={`w-[4px] h-4 bg-current rounded-full origin-center ${isListening ? 'animate-wave-4' : ''}`} />
        </div>

        {/* 🚨 Hyper-Tactile Microphone Button */}
        <button
          style={{ WebkitTapHighlightColor: 'transparent' }}
          onClick={handleToggle}
          aria-pressed={isListening}
          aria-label={isListening ? "Deactivate Visual Mode" : "Activate Visual Mode"}
          className={`w-[128px] h-[128px] rounded-full flex items-center justify-center relative group outline-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-4 focus-visible:ring-[#0A44FF]/60 transform-gpu active:scale-90 ${springTransition}
            ${isListening 
              ? "bg-[#0A44FF] shadow-[0_0_40px_rgba(10,68,255,0.7)] scale-105" 
              : "bg-[#0A44FF] ring-[8px] ring-[#0A44FF]/10 shadow-[0_12px_30px_rgba(0,0,0,0.15)] hover:scale-105 hover:bg-[#0836CC] hover:ring-[#0A44FF]/20"
            }`}
        >
          {/* Inner Glow to make it pop for low vision users */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/20 to-transparent pointer-events-none" />

          {isListening ? (
            <svg focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-[60px] h-[60px] pointer-events-none select-none drop-shadow-md">
              <line x1="2" y1="2" x2="22" y2="22" />
              <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
              <path d="M5 10v2a7 7 0 0 0 12 5" />
              <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          ) : (
            <svg focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-[60px] h-[60px] pointer-events-none select-none drop-shadow-md">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          )}
        </button>

        {/* Right Soundwave */}
        <div className={`flex items-center gap-2 transition-colors duration-500 ${isListening ? 'text-[#0A44FF]' : 'text-gray-200'}`}>
          <div className={`w-[4px] h-4 bg-current rounded-full origin-center ${isListening ? 'animate-wave-4' : ''}`} />
          <div className={`w-[4px] h-10 bg-current rounded-full origin-center ${isListening ? 'animate-wave-3' : ''}`} />
          <div className={`w-[4px] h-6 bg-current rounded-full origin-center ${isListening ? 'animate-wave-2' : ''}`} />
          <div className={`w-[4px] h-3 bg-current rounded-full origin-center ${isListening ? 'animate-wave-1' : ''}`} />
        </div>
      </div>

      {/* 🚨 High Contrast Status Text */}
      <h2 className={`text-[22px] font-black text-center whitespace-pre-line leading-tight tracking-tight transition-colors duration-300 ${isListening ? "text-[#0A44FF]" : "text-gray-800"}`}>
        {isListening ? "Click or Speak\nto Deactivate" : "Click or Speak\nto Activate"}
      </h2>
    </div>
  )
}