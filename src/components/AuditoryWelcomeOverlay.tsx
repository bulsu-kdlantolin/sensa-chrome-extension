import { useEffect } from "react"

interface WelcomeProps {
  theme: "light" | "dark"
  onGetStarted: () => void
}

export default function AuditoryWelcomeOverlay({ theme, onGetStarted }: WelcomeProps) {
  const isDark = theme === "dark"

  useEffect(() => {
    window.speechSynthesis.cancel()
  }, [])

  return (
    <div className={`w-[350px] h-[550px] min-w-[350px] min-h-[550px] flex flex-col items-center justify-start font-sans relative overflow-hidden select-none transition-colors duration-500 ${isDark ? 'bg-[#1C1C1E] text-white' : 'bg-gray-50 text-gray-900'}`}>

      {/* 🚨 CSS INJECTION FOR CINEMATIC ENTRANCE & AMBIENT ORANGE ORBS */}
      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes float-orange-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-20px, -30px) scale(1.1); }
        }
        @keyframes float-orange-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(20px, 30px) scale(1.1); }
        }
        @keyframes fade-in-up {
          0% { opacity: 0; transform: translateY(24px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes pop-in {
          0% { opacity: 0; transform: translateY(10px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        
        .animate-float-orange-1 { animation: float-orange-1 8s ease-in-out infinite; }
        .animate-float-orange-2 { animation: float-orange-2 8s ease-in-out infinite 0.5s; }
        
        .fade-in-1 { animation: fade-in-up 0.8s cubic-bezier(0.23,1,0.32,1) 0.1s forwards; opacity: 0; }
        .fade-in-2 { animation: fade-in-up 0.8s cubic-bezier(0.23,1,0.32,1) 0.2s forwards; opacity: 0; }
        .fade-in-3 { animation: fade-in-up 0.8s cubic-bezier(0.23,1,0.32,1) 0.3s forwards; opacity: 0; }
        .fade-in-4 { animation: fade-in-up 0.8s cubic-bezier(0.23,1,0.32,1) 0.4s forwards; opacity: 0; }
        .pop-in-1 { animation: pop-in 0.7s cubic-bezier(0.23,1,0.32,1) 0.3s forwards; opacity: 0; }
        .pop-in-2 { animation: pop-in 0.7s cubic-bezier(0.23,1,0.32,1) 0.45s forwards; opacity: 0; }
        .pop-in-3 { animation: pop-in 0.7s cubic-bezier(0.23,1,0.32,1) 0.6s forwards; opacity: 0; }
      `}} />

      {/* 🌌 AMBIENT ORANGE BACKGROUND ENGINE */}
      <div className={`absolute -bottom-16 -right-16 w-64 h-64 rounded-full mix-blend-multiply filter blur-[60px] animate-float-orange-1 pointer-events-none transform-gpu ${isDark ? 'bg-[#FF7A2F]/30' : 'bg-[#FF7A2F]/20'}`} />
      <div className={`absolute -top-16 -left-16 w-64 h-64 rounded-full mix-blend-multiply filter blur-[60px] animate-float-orange-2 pointer-events-none transform-gpu ${isDark ? 'bg-[#FF7A2F]/15' : 'bg-[#FF7A2F]/10'}`} />

      {/* 🛡️ CONTENT WRAPPER */}
      <div className="relative z-10 flex flex-col items-center justify-start w-full h-full pt-6 pb-6 px-6">

        {/* Header (No Logo, Perfectly Centered) */}
        <div className="flex flex-col items-center w-full mb-5">
          <h1 className="text-[34px] font-black tracking-tight leading-none mb-2.5 fade-in-1 text-center bg-gradient-to-r from-[#FF7A2F] to-[#FF9E66] bg-clip-text text-transparent px-2 pb-1 overflow-visible">
            Auditory Mode
          </h1>
          <p className={`text-[14.5px] font-medium text-center leading-relaxed fade-in-2 px-1 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
            Assisting deaf and hard-of-hearing users with specialized accessibility tools and features.
          </p>
        </div>

        {/* 🦻 FEATURE HIGHLIGHT CARDS */}
        <div className="w-full fade-in-3 mb-auto">
          <div className="grid grid-cols-1 gap-2 w-full overflow-visible py-1 content-start">

            {/* Live Captions Card */}
            <div
              tabIndex={0}
              className={`group flex items-center gap-3.5 rounded-[18px] px-3.5 py-2 shadow-md cursor-pointer transition-all duration-300 pop-in-1 min-h-[62px] shrink-0 outline-none focus-visible:ring-4 focus-visible:ring-[#FF7A2F]/50
                ${isDark
                  ? 'bg-[#2C2C2E] border-2 border-gray-700 hover:border-[#FF7A2F] hover:bg-[#2C2C2E]/90 hover:shadow-[0_12px_26px_rgba(255,122,47,0.25)]'
                  : 'bg-white border-2 border-transparent hover:border-[#FF7A2F] hover:shadow-[0_12px_26px_rgba(255,122,47,0.15)]'
                }`}
            >
              <div className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-[#FF7A2F] transition-transform duration-300 group-hover:scale-110 ${isDark ? 'bg-[#FF7A2F]/20' : 'bg-[#FF7A2F]/10'}`}>
                <svg viewBox="0 0 24 24" className="w-6 h-6" aria-hidden="true">
                  <rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
                  <text x="7" y="15" fill="currentColor" fontSize="6.5" fontWeight="700" fontFamily="system-ui, sans-serif">C</text>
                  <text x="12.5" y="15" fill="currentColor" fontSize="6.5" fontWeight="700" fontFamily="system-ui, sans-serif">C</text>
                </svg>
              </div>
              <div className="flex flex-col">
                <p className={`text-[15px] font-black uppercase tracking-wide leading-tight transition-colors duration-200 ${isDark ? 'text-white group-hover:text-[#FFC09B]' : 'text-gray-900 group-hover:text-[#FF7A2F]'}`}>Live Captions</p>
                <p className={`text-[13px] font-medium leading-snug mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Follow any spoken content instantly with real-time multilingual captions.</p>
              </div>
            </div>

            {/* Audio Visualizer Card */}
            <div
              tabIndex={0}
              className={`group flex items-center gap-3.5 rounded-[18px] px-3.5 py-2 shadow-md cursor-pointer transition-all duration-300 pop-in-2 min-h-[62px] shrink-0 outline-none focus-visible:ring-4 focus-visible:ring-[#FF7A2F]/50
                ${isDark
                  ? 'bg-[#2C2C2E] border-2 border-gray-700 hover:border-[#FF7A2F] hover:bg-[#2C2C2E]/90 hover:shadow-[0_12px_26px_rgba(255,122,47,0.25)]'
                  : 'bg-white border-2 border-transparent hover:border-[#FF7A2F] hover:shadow-[0_12px_26px_rgba(255,122,47,0.15)]'
                }`}
            >
              <div className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-[#FF7A2F] transition-transform duration-300 group-hover:scale-110 ${isDark ? 'bg-[#FF7A2F]/20' : 'bg-[#FF7A2F]/10'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 10v4" />
                  <path d="M8 6v12" />
                  <path d="M12 3v18" />
                  <path d="M16 6v12" />
                  <path d="M20 10v4" />
                </svg>
              </div>
              <div className="flex flex-col">
                <p className={`text-[15px] font-black uppercase tracking-wide leading-tight transition-colors duration-200 ${isDark ? 'text-white group-hover:text-[#FFC09B]' : 'text-gray-900 group-hover:text-[#FF7A2F]'}`}>Audio Visualizer</p>
                <p className={`text-[13px] font-medium leading-snug mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Experience sound dynamically with interactive frequency animations.</p>
              </div>
            </div>

            {/* Noise Alerts Card */}
            <div
              tabIndex={0}
              className={`group flex items-center gap-3.5 rounded-[18px] px-3.5 py-2 shadow-md cursor-pointer transition-all duration-300 pop-in-3 min-h-[62px] shrink-0 outline-none focus-visible:ring-4 focus-visible:ring-[#FF7A2F]/50
                ${isDark
                  ? 'bg-[#2C2C2E] border-2 border-gray-700 hover:border-[#FF7A2F] hover:bg-[#2C2C2E]/90 hover:shadow-[0_12px_26px_rgba(255,122,47,0.25)]'
                  : 'bg-white border-2 border-transparent hover:border-[#FF7A2F] hover:shadow-[0_12px_26px_rgba(255,122,47,0.15)]'
                }`}
            >
              <div className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-[#FF7A2F] transition-transform duration-300 group-hover:scale-110 ${isDark ? 'bg-[#FF7A2F]/20' : 'bg-[#FF7A2F]/10'}`}>
                <svg viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
                  <path d="M 7 10 A 5 5 0 0 1 7 18" />
                  <path d="M 12 6 A 9 9 0 0 1 12 22" />
                  <path d="M 17 2 A 13 13 0 0 1 17 26" />
                </svg>
              </div>
              <div className="flex flex-col">
                <p className={`text-[15px] font-black uppercase tracking-wide leading-tight transition-colors duration-200 ${isDark ? 'text-white group-hover:text-[#FFC09B]' : 'text-gray-900 group-hover:text-[#FF7A2F]'}`}>Noise Alerts</p>
                <p className={`text-[13px] font-medium leading-snug mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Receive immediate visual cues and warnings whenever loud sounds occur.</p>
              </div>
            </div>

          </div>
        </div>

        {/* 🚀 SENSA ORANGE INSTANT BUTTON (No Timer) */}
        <div className="w-full h-[56px] shrink-0 mt-auto">
          <button
            onClick={onGetStarted}
            className="w-full h-full relative overflow-hidden fade-in-4 rounded-full bg-[#FF7A2F] shadow-[0_12px_30px_rgba(255,122,47,0.3)] hover:shadow-[0_16px_40px_rgba(255,122,47,0.4)] hover:scale-[1.03] hover:bg-[#E86A25] active:scale-95 transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] group focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF7A2F]/50"
          >
            {/* Button Text & Icon */}
            <div className="relative z-10 flex items-center justify-center w-full h-full gap-3 text-white font-black text-[17px] tracking-wide">
              Get Started
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </div>
          </button>
        </div>

      </div>
    </div>
  )
}