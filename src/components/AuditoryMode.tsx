import { useState, useEffect } from "react"

interface AuditoryModeProps {
  isDark: boolean
}

export default function AuditoryMode({ isDark }: AuditoryModeProps) {
  const [isCapturing, setIsCapturing] = useState(false)
  const [activationPhase, setActivationPhase] = useState<"idle" | "activating" | "active">("idle")
  const [waveResetToken, setWaveResetToken] = useState(0)

  useEffect(() => {
    chrome.storage.local.get(["sensa_auditory_active"], (res) => {
      setIsCapturing(!!res.sensa_auditory_active)
    })

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.sensa_auditory_active !== undefined) {
        setIsCapturing(changes.sensa_auditory_active.newValue)
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [])

  const handleToggle = () => {
    const newState = !isCapturing
    setIsCapturing(newState)
    if (newState) {
      setActivationPhase("activating")
      setWaveResetToken((value) => value + 1)
      window.setTimeout(() => {
        setActivationPhase((currentPhase) => (currentPhase === "activating" ? "active" : currentPhase))
      }, 420)
    } else {
      setActivationPhase("idle")
    }
    chrome.runtime.sendMessage({ type: "sensa-activate-mode", mode: newState ? "auditory" : null })
    chrome.storage.local.set({
      sensa_auditory_active: newState,
      ...(newState ? { sensa_visual_active: false } : {})
    })
  }

  const springTransition = "transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]"

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 w-full h-full select-none relative overflow-visible bg-transparent">
      
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes auditory-pulse-glow {
          0%, 100% { box-shadow: 0 0 20px rgba(255,122,47,0.3); }
          50% { box-shadow: 0 0 65px rgba(255,122,47,0.8); }
        }
        
        @keyframes auditory-arc {
          0% { opacity: 0; }
          25% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }

        @keyframes auditory-arc-intro {
          0% { opacity: 0; transform: scale(0.9); }
          100% { opacity: 1; transform: scale(1); }
        }
        
        .animate-auditory-glow { animation: auditory-pulse-glow 2.4s ease-in-out infinite; }
        .a-arc-1 { animation: auditory-arc 2.4s ease-in-out infinite 0.0s; }
        .a-arc-2 { animation: auditory-arc 2.4s ease-in-out infinite 0.2s; }
        .a-arc-3 { animation: auditory-arc 2.4s ease-in-out infinite 0.4s; }
        .a-arc-intro { animation: auditory-arc-intro 420ms cubic-bezier(0.23, 1, 0.32, 1) forwards; }
      `}} />

      <div className="flex flex-col items-center justify-center w-full relative z-10">

        <div className="flex items-center justify-center gap-6 mb-10 mt-4 w-full relative overflow-visible">
          
          {/* LEFT ARC-WAVES */}
          <div className={`flex items-center justify-center shrink-0 ${springTransition} ${isCapturing ? 'opacity-100 scale-100 text-[#FF7A2F]' : 'opacity-0 scale-75 pointer-events-none text-gray-300'}`}>
              <svg key={`left-${isCapturing}-${waveResetToken}`} viewBox="-3 -3 30 30" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="4" className="w-[72px] h-[72px] rotate-180 overflow-visible">
                <path d="M 6 8 A 6 6 0 0 1 6 16" className={`transition-opacity duration-300 ${isCapturing ? (activationPhase === "active" ? "a-arc-1" : "a-arc-intro opacity-100") : "opacity-0"}`} />
                <path d="M 10 4 A 11 11 0 0 1 10 20" className={`transition-opacity duration-300 ${isCapturing ? (activationPhase === "active" ? "a-arc-2" : "a-arc-intro opacity-100") : "opacity-0"}`} />
                <path d="M 14 0 A 16 16 0 0 1 14 24" className={`transition-opacity duration-300 ${isCapturing ? (activationPhase === "active" ? "a-arc-3" : "a-arc-intro opacity-100") : "opacity-0"}`} />
            </svg>
          </div>

          <button
            style={{ WebkitTapHighlightColor: 'transparent' }}
            onClick={handleToggle}
            aria-pressed={isCapturing}
            aria-label={isCapturing ? "Deactivate" : "Activate"}
            className={`w-[136px] h-[136px] shrink-0 rounded-full flex items-center justify-center relative group outline-none focus-visible:outline-none transform-gpu active:scale-90 ${springTransition}
              ${isCapturing 
                ? "bg-[#FF7A2F] scale-105 shadow-[0_10px_40px_rgba(255,122,47,0.4)] ring-[0px] ring-[#FF7A2F]/0" 
                : `bg-[#FF7A2F] scale-100 ring-[8px] ${isDark ? "ring-white/10" : "ring-[#FF7A2F]/10"} shadow-[0_16px_35px_rgba(0,0,0,0.15)] hover:scale-105 hover:bg-[#E86A25] ${isDark ? "hover:ring-white/15" : "hover:ring-[#FF7A2F]/20"}`
              }`}
          >
            {/* GLOW LAYER: Smooth 1 second fade over the constant pulse */}
            <div className={`absolute inset-0 rounded-full pointer-events-none transition-opacity duration-500 ease-out animate-auditory-glow ${isCapturing ? 'opacity-100' : 'opacity-0'}`} />

            <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/25 to-transparent pointer-events-none" />

            <div className="relative z-10 flex items-center justify-center w-full h-full pointer-events-none">
              <div className={`absolute w-[76px] h-[58px] bg-white rounded-[16px] flex items-center justify-center select-none shadow-[0_4px_12px_rgba(0,0,0,0.15)] ${springTransition} ${isCapturing ? 'opacity-100 scale-100' : 'opacity-0 scale-150'}`}>
                <span className="font-black text-[32px] tracking-tighter text-[#FF7A2F]">CC</span>
              </div>

              <div className={`absolute w-[76px] h-[58px] border-[3px] border-white rounded-[16px] flex items-center justify-center select-none shadow-[0_4px_12px_rgba(0,0,0,0.1)] ${springTransition} ${isCapturing ? 'opacity-0 scale-50' : 'opacity-100 scale-100 group-hover:scale-110'}`}>
                <span className="font-black text-[32px] tracking-tighter text-white">CC</span>
              </div>
            </div>
          </button>

          {/* RIGHT ARC-WAVES */}
          <div className={`flex items-center justify-center shrink-0 ${springTransition} ${isCapturing ? 'opacity-100 scale-100 text-[#FF7A2F]' : 'opacity-0 scale-75 pointer-events-none text-gray-300'}`}>
            <svg key={`right-${isCapturing}-${waveResetToken}`} viewBox="-3 -3 30 30" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="4" className="w-[72px] h-[72px] overflow-visible">
                <path d="M 6 8 A 6 6 0 0 1 6 16" className={`transition-opacity duration-300 ${isCapturing ? (activationPhase === "active" ? "a-arc-1" : "a-arc-intro opacity-100") : "opacity-0"}`} />
                <path d="M 10 4 A 11 11 0 0 1 10 20" className={`transition-opacity duration-300 ${isCapturing ? (activationPhase === "active" ? "a-arc-2" : "a-arc-intro opacity-100") : "opacity-0"}`} />
                <path d="M 14 0 A 16 16 0 0 1 14 24" className={`transition-opacity duration-300 ${isCapturing ? (activationPhase === "active" ? "a-arc-3" : "a-arc-intro opacity-100") : "opacity-0"}`} />
            </svg>
          </div>
        </div>

        <h2 className={`relative z-20 transform-gpu text-[22px] font-semibold text-center whitespace-pre-line leading-relaxed tracking-wide transition-colors duration-500 ${isCapturing ? (isDark ? "text-white/90" : "text-[#FF7A2F]") : (isDark ? "text-gray-400" : "text-gray-500")}`}>
          {isCapturing ? "Click to Deactivate" : "Click to Activate"}
        </h2>

      </div>
    </div>
  )
}