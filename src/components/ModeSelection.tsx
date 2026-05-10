import sensaLogo from "data-base64:../../assets/sensa-logo.png"

interface ModeSelectionProps {
  theme: "light" | "dark"
  onSelectMode: (mode: "visual" | "auditory") => void
}

export default function ModeSelection({ theme, onSelectMode }: ModeSelectionProps) {
  const isDark = theme === "dark"
  
  // Apple-style spring animation curve
  const springTransition = "transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"

  return (
    <div className={`w-[350px] h-[550px] min-w-[350px] min-h-[550px] px-6 py-8 flex flex-col items-center justify-center font-sans select-none relative overflow-hidden transition-colors duration-500 ${isDark ? 'bg-[#1C1C1E] text-gray-200' : 'bg-gray-50 text-black'}`}>
      
      {/* 🚨 CSS INJECTION FOR AMBIENT DUAL-TONE ORBS */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes float-blue {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(20px, 30px) scale(1.1); }
        }
        @keyframes float-orange {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-20px, -30px) scale(1.1); }
        }
        
        .animate-float-blue { animation: float-blue 8s ease-in-out infinite; }
        .animate-float-orange { animation: float-orange 8s ease-in-out infinite 0.5s; }
      `}} />

      {/* 🌌 AMBIENT DUAL-TONE BACKGROUND ENGINE */}
      {/* Sensa Blue Orb (Top Left - Visual) */}
      <div className={`absolute -top-16 -left-16 w-64 h-64 rounded-full mix-blend-multiply filter blur-[60px] animate-float-blue pointer-events-none transform-gpu ${isDark ? 'bg-[#0A44FF]/25' : 'bg-[#0A44FF]/15'}`} />
      
      {/* Sensa Orange Orb (Bottom Right - Auditory) */}
      <div className={`absolute -bottom-16 -right-16 w-64 h-64 rounded-full mix-blend-multiply filter blur-[60px] animate-float-orange pointer-events-none transform-gpu ${isDark ? 'bg-[#FF7A2F]/25' : 'bg-[#FF7A2F]/15'}`} />


      {/* 🛡️ CONTENT WRAPPER */}
      <div className="relative z-10 w-full flex flex-col items-center">
        
        {/* 🌟 Brand Header */}
        <div className="flex flex-col items-center mb-8 transform-gpu">
          <img 
            src={sensaLogo} 
            alt="Sensa Logo" 
            className="w-20 h-20 object-contain drop-shadow-md mb-4" 
          />
          <h1 className={`text-[28px] font-black tracking-tight leading-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
            Welcome to Sensa
          </h1>
          <p className={`text-[15px] font-medium mt-1 text-center ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            Select your primary accessibility mode
          </p>
        </div>

        <div className="w-full flex flex-col gap-5">

          {/* ========================================================= */}
          {/* 👁️ VISUAL MODE CARD (Sensa Blue) */}
          {/* ========================================================= */}
          <button
            onClick={() => onSelectMode("visual")}
            className={`w-full group relative flex items-center p-5 rounded-[24px] border-[3px] text-left transform-gpu focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0A44FF]/50 active:scale-95 ${springTransition}
              ${isDark 
                ? 'bg-[#2C2C2E] border-gray-700 hover:border-[#0A44FF] hover:bg-[#2C2C2E] shadow-lg hover:shadow-[0_12px_30px_rgba(10,68,255,0.25)]' 
                : 'bg-white border-white hover:border-[#0A44FF] shadow-[0_4px_20px_rgba(0,0,0,0.05)] hover:shadow-[0_12px_30px_rgba(10,68,255,0.2)]'
              }`}
          >
            {/* Card Icon */}
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 mr-4 ${springTransition} group-hover:scale-110 ${isDark ? 'bg-[#0A44FF]/20 text-[#3B82F6]' : 'bg-[#0A44FF]/10 text-[#0A44FF]'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </div>
            
            {/* Card Text */}
            <div className="flex flex-col">
              <h2 className={`text-[19px] font-black tracking-tight mb-0.5 ${springTransition} ${isDark ? 'text-white group-hover:text-[#3B82F6]' : 'text-gray-900 group-hover:text-[#0A44FF]'}`}>
                Visual Mode
              </h2>
              <p className={`text-[13px] font-medium leading-snug ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Optimize for low vision with auditory navigation & reading.
              </p>
            </div>
          </button>

          {/* ========================================================= */}
          {/* 🦻 AUDITORY MODE CARD (Sensa Orange) */}
          {/* ========================================================= */}
          <button
            onClick={() => onSelectMode("auditory")}
            className={`w-full group relative flex items-center p-5 rounded-[24px] border-[3px] text-left transform-gpu focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF7A2F]/50 active:scale-95 ${springTransition}
              ${isDark 
                ? 'bg-[#2C2C2E] border-gray-700 hover:border-[#FF7A2F] hover:bg-[#2C2C2E] shadow-lg hover:shadow-[0_12px_30px_rgba(255,122,47,0.25)]' 
                : 'bg-white border-white hover:border-[#FF7A2F] shadow-[0_4px_20px_rgba(0,0,0,0.05)] hover:shadow-[0_12px_30px_rgba(255,122,47,0.2)]'
              }`}
          >
            {/* Card Icon */}
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 mr-4 ${springTransition} group-hover:scale-110 ${isDark ? 'bg-[#FF7A2F]/20 text-[#FF9660]' : 'bg-[#FF7A2F]/10 text-[#FF7A2F]'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0"/>
                <path d="M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 1 1 0 4"/>
              </svg>
            </div>
            
            {/* Card Text */}
            <div className="flex flex-col">
              <h2 className={`text-[19px] font-black tracking-tight mb-0.5 ${springTransition} ${isDark ? 'text-white group-hover:text-[#FF9660]' : 'text-gray-900 group-hover:text-[#FF7A2F]'}`}>
                Auditory Mode
              </h2>
              <p className={`text-[13px] font-medium leading-snug ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Optimize for hearing impairments with live captions & alerts.
              </p>
            </div>
          </button>

        </div>
      </div>
    </div>
  )
}