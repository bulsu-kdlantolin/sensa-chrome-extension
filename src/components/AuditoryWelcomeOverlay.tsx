import { useEffect } from "react"

interface WelcomeProps {
  theme: "light" | "dark"
  onGetStarted: () => void
}

export default function AuditoryWelcomeOverlay({ theme, onGetStarted }: WelcomeProps) {
  const isDark = theme === "dark"

  return (
    <div className={`w-[350px] h-[550px] min-w-[350px] min-h-[550px] flex flex-col items-center justify-between font-sans relative overflow-hidden select-none transition-colors duration-500 ${isDark ? 'bg-[#1C1C1E] text-white' : 'bg-gray-50 text-gray-900'}`}>
      
      {/* 🚨 CSS INJECTION FOR CINEMATIC ENTRANCE & AMBIENT ORANGE ORBS */}
      <style dangerouslySetInnerHTML={{ __html: `
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
      `}} />

      {/* 🌌 AMBIENT ORANGE BACKGROUND ENGINE */}
      <div className={`absolute -bottom-16 -right-16 w-64 h-64 rounded-full mix-blend-multiply filter blur-[60px] animate-float-orange-1 pointer-events-none transform-gpu ${isDark ? 'bg-[#FF7A2F]/30' : 'bg-[#FF7A2F]/20'}`} />
      <div className={`absolute -top-16 -left-16 w-64 h-64 rounded-full mix-blend-multiply filter blur-[60px] animate-float-orange-2 pointer-events-none transform-gpu ${isDark ? 'bg-[#FF7A2F]/15' : 'bg-[#FF7A2F]/10'}`} />

      {/* 🛡️ CONTENT WRAPPER */}
      <div className="relative z-10 flex flex-col items-center w-full h-full pt-[60px] pb-8 px-8">
        
        {/* Header (No Logo, Perfectly Centered) */}
        <div className="flex flex-col items-center w-full mt-2">
          <h1 className="text-[40px] font-black tracking-tighter leading-none mb-4 fade-in-1 text-center">
            Auditory Mode
          </h1>
          <p className={`text-[16px] font-semibold text-center leading-snug fade-in-2 px-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Sensa provides live captions and visual sound insights for you.
          </p>
        </div>

        {/* 🦻 FEATURE HIGHLIGHT CARDS */}
        <div className="grid grid-cols-1 gap-3 w-full mt-auto mb-auto fade-in-3">
          
          {/* Live Captions Card */}
          <div className={`flex items-center gap-4 rounded-[20px] px-4 py-4 shadow-md transition-colors pop-in-1 ${isDark ? 'bg-[#2C2C2E] border-2 border-gray-700' : 'bg-white border-2 border-transparent'}`}>
            <div className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center text-[#FF7A2F] ${isDark ? 'bg-[#FF7A2F]/20' : 'bg-[#FF7A2F]/10'}`}>
              <svg viewBox="0 0 24 24" className="w-7 h-7" aria-hidden="true">
                <rect x="3" y="6" width="18" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
                <text x="7" y="15" fill="currentColor" fontSize="6.5" fontWeight="700" fontFamily="system-ui, sans-serif">C</text>
                <text x="12.5" y="15" fill="currentColor" fontSize="6.5" fontWeight="700" fontFamily="system-ui, sans-serif">C</text>
              </svg>
            </div>
            <div className="flex flex-col">
              <p className={`text-[15px] font-black uppercase tracking-wide leading-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>Live Captions</p>
              <p className={`text-[13px] font-medium leading-snug mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Follow spoken content instantly with readable captions.</p>
            </div>
          </div>

          {/* Sound Visualization Card */}
          <div className={`flex items-center gap-4 rounded-[20px] px-4 py-4 shadow-md transition-colors pop-in-2 ${isDark ? 'bg-[#2C2C2E] border-2 border-gray-700' : 'bg-white border-2 border-transparent'}`}>
            <div className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center text-[#FF7A2F] ${isDark ? 'bg-[#FF7A2F]/20' : 'bg-[#FF7A2F]/10'}`}>
              <svg viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
                <path d="M 7 10 A 5 5 0 0 1 7 18" />
                <path d="M 12 6 A 9 9 0 0 1 12 22" />
                <path d="M 17 2 A 13 13 0 0 1 17 26" />
              </svg>
            </div>
            <div className="flex flex-col">
              <p className={`text-[15px] font-black uppercase tracking-wide leading-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>Sound Alerts</p>
              <p className={`text-[13px] font-medium leading-snug mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Visualize audio activity with clear visual cues.</p>
            </div>
          </div>

        </div>

        {/* 🚀 SENSA ORANGE INSTANT BUTTON (No Timer) */}
        <button
          onClick={onGetStarted}
          className="w-full h-[60px] relative overflow-hidden fade-in-4 rounded-full bg-[#FF7A2F] shadow-[0_12px_30px_rgba(255,122,47,0.3)] hover:shadow-[0_16px_40px_rgba(255,122,47,0.4)] hover:scale-[1.03] hover:bg-[#E86A25] active:scale-95 transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] group focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF7A2F]/50"
        >
          {/* Button Text & Icon */}
          <div className="relative z-10 flex items-center justify-center w-full h-full gap-3 text-white font-black text-[17px] tracking-wide">
            Enter Auditory Mode
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1">
              <path d="M5 12h14" />
              <path d="m12 5 7 7-7 7" />
            </svg>
          </div>
        </button>

      </div>
    </div>
  )
}