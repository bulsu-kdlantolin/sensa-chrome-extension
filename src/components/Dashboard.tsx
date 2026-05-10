import { useState, useEffect, useRef } from "react"
import sensaLogo from "data-base64:../../assets/sensa-logo.png"
import VisualMode from "./VisualMode"
import AuditoryMode from "./AuditoryMode"

interface DashboardProps {
  selectedMode: "visual" | "auditory" | null
  theme: "light" | "dark"
  onModeChange: (mode: "visual" | "auditory") => void
  onThemeChange: (newTheme: "light" | "dark") => void
  onReset: () => void
}

export default function Dashboard({ selectedMode, theme, onModeChange, onThemeChange, onReset }: DashboardProps) {
  const [currentViewMode, setCurrentViewMode] = useState<"visual" | "auditory">(selectedMode ?? "visual")
  const [websiteLabel, setWebsiteLabel] = useState("Detecting...")
  const [websiteStatus, setWebsiteStatus] = useState<"online" | "offline" | "unsupported">("offline")
  const [extensionStatus, setExtensionStatus] = useState<"online" | "offline">("offline")
  const [unavailableApis, setUnavailableApis] = useState<string[]>([])
  
  const [isMounted, setIsMounted] = useState(false)
  const [hasHydratedInitialMode, setHasHydratedInitialMode] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsMounted(true))
    })
  }, [])

  useEffect(() => {
    chrome.storage.local.get(["sensa_last_tab"], (res) => {
      const nextMode = res.sensa_last_tab ?? selectedMode ?? "visual"
      setCurrentViewMode(nextMode)

      if (!hasHydratedInitialMode) {
        requestAnimationFrame(() => setHasHydratedInitialMode(true))
      }
    })
  }, [selectedMode, hasHydratedInitialMode])

  const handleViewSwap = (newMode: "visual" | "auditory") => {
    if (newMode === currentViewMode) return
    setCurrentViewMode(newMode)
    
    chrome.storage.local.set({
      sensa_last_tab: newMode,
      sensa_visual_active: false,
      sensa_auditory_active: false
    })
    chrome.runtime.sendMessage({ type: "sensa-activate-mode", mode: null })
    onModeChange(newMode)
  }

  useEffect(() => {
    let isComponentMounted = true

    const checkApiConnectivity = async () => {
      const unavailable: string[] = []
      if (!navigator.onLine) return ["Network API"]

      const probeApi = async (name: string, url: string) => {
        const controller = new AbortController()
        const timeoutId = window.setTimeout(() => controller.abort(), 4000)
        try {
          const response = await fetch(url, { method: "GET", cache: "no-store", signal: controller.signal })
          if (response.status >= 500) unavailable.push(name)
        } catch {
          unavailable.push(name)
        } finally {
          window.clearTimeout(timeoutId)
        }
      }

      await probeApi("Connectivity API", "https://clients3.google.com/generate_204")
      await probeApi("Google Fonts API", "https://www.googleapis.com/webfonts/v1/webfonts")
      return unavailable
    }

    const updateStatuses = async () => {
      let nextWebsiteLabel = "No active tab"
      let nextWebsiteStatus: "online" | "offline" | "unsupported" = "offline"
      let nextExtensionStatus: "online" | "offline" = "offline"
      let nextBridgeOnline = false

      try {
        const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
        const activeTab = tabs?.[0]

        if (activeTab?.url) {
          try {
            const parsed = new URL(activeTab.url)
            const isWeb = parsed.protocol === "http:" || parsed.protocol === "https:"
            nextWebsiteLabel = isWeb ? parsed.hostname : parsed.protocol.replace(":", "")
            nextWebsiteStatus = isWeb ? "online" : "unsupported"
          } catch {
            nextWebsiteLabel = activeTab.url
            nextWebsiteStatus = "unsupported"
          }
        }

        if (typeof activeTab?.id === "number") {
          try {
            const response = await chrome.tabs.sendMessage(activeTab.id, { type: "sensa-health-check" })
            nextBridgeOnline = !!response?.ok
          } catch {
            nextBridgeOnline = false
          }
        }
      } catch {
        nextWebsiteLabel = "Unavailable"
        nextWebsiteStatus = "offline"
      }

      const apiUnavailable = await checkApiConnectivity()
      const nextUnavailable = [...(nextBridgeOnline ? [] : ["Extension Bridge"]), ...apiUnavailable]
      nextExtensionStatus = nextUnavailable.length === 0 ? "online" : "offline"

      if (!isComponentMounted) return
      setWebsiteLabel(nextWebsiteLabel)
      setWebsiteStatus(nextWebsiteStatus)
      setExtensionStatus(nextExtensionStatus)
      setUnavailableApis(nextUnavailable)
    }

    updateStatuses()
    const intervalId = window.setInterval(updateStatuses, 15000)
    const handleOnline = () => updateStatuses()
    const handleOffline = () => updateStatuses()

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    return () => {
      isComponentMounted = false
      window.clearInterval(intervalId)
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
    }
  }, [currentViewMode])


  const isAuditory = currentViewMode === "auditory"
  const isAuditoryDark = theme === "dark" 
  const isDark = isAuditory ? isAuditoryDark : false 

  const allowInitialMotion = isMounted && hasHydratedInitialMode
  const syncColors = allowInitialMotion ? "transition-colors duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]" : "transition-none"
  const syncTransform = allowInitialMotion ? "transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]" : "transition-none"

  return (
    <div className={`w-[350px] h-[550px] flex flex-col font-sans relative overflow-hidden ${syncColors} ${isDark ? 'bg-[#1C1C1E] text-gray-200' : 'bg-gray-50 text-black'}`}>
      
      {/* --- 🚨 REFINED NAVBAR --- */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2 z-20">
        <div className="flex items-center gap-3">
          <img src={sensaLogo} alt="Sensa Logo" className="w-[50px] h-[50px] object-contain drop-shadow-sm" />
          <h1 className="text-[24px] font-black tracking-tight leading-none mt-0.5">Sensa</h1>
        </div>
        
        {/* THEME TOGGLE */}
        {isAuditory ? (
          <button
            onClick={() => onThemeChange(isDark ? "light" : "dark")}
            aria-label={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
            className={`relative flex items-center w-[58px] h-[30px] rounded-full p-[3px] transition-colors duration-500 shrink-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF7A2F]/50
              ${isDark ? 'bg-black/40 border border-white/10 shadow-inner' : 'bg-gray-200 border border-black/5 shadow-inner'}`}
          >
            <div className="absolute inset-0 flex justify-between items-center px-1.5 pointer-events-none">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`w-[14px] h-[14px] transition-opacity duration-500 ${isDark ? 'text-gray-600' : 'opacity-0'}`}>
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M4.93 19.07l1.41-1.41 M17.66 6.34l1.41-1.41" />
              </svg>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`w-[14px] h-[14px] transition-opacity duration-500 ${isDark ? 'opacity-0' : 'text-gray-400'}`}>
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            </div>
            <div
              className={`relative w-[22px] h-[22px] rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.2)] flex items-center justify-center transform transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] z-10
                ${isDark ? 'translate-x-[28px] bg-[#2C2C2E] border border-gray-600' : 'translate-x-0 bg-white border border-gray-100'}`}
            >
              <div className={`absolute transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] transform ${isDark ? 'opacity-0 scale-50 -rotate-90' : 'opacity-100 scale-100 rotate-0'}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#FF7A2F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-[13px] h-[13px]">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M4.93 19.07l1.41-1.41 M17.66 6.34l1.41-1.41" />
                </svg>
              </div>
              <div className={`absolute transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] transform ${isDark ? 'opacity-100 scale-100 rotate-0' : 'opacity-0 scale-50 rotate-90'}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="#FF7A2F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-[13px] h-[13px]">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              </div>
            </div>
          </button>
        ) : null}
      </div>

      {/* --- DYNAMIC MODE SWITCHER PILL --- */}
      <div className="px-5 flex justify-center mb-5 z-20 mt-3">
        <div 
          className={`relative flex w-full h-[52px] rounded-full p-1.5 transition-colors duration-500
            ${isDark ? 'bg-black/30 shadow-inner border border-white/5' : 'bg-gray-200/60 shadow-inner border border-black/5'}`}
        >
          <div
            className={`absolute top-1.5 bottom-1.5 w-[calc(50%-6px)] rounded-full ${syncTransform}
              ${isAuditory 
                ? 'translate-x-[100%] bg-[#FF7A2F] shadow-[0_4px_16px_rgba(255,122,47,0.4)]' 
                : 'translate-x-0 bg-[#0A44FF] shadow-[0_4px_16px_rgba(10,68,255,0.4)]'
              }`}
          />
          <button
            onClick={() => handleViewSwap("visual")}
            className={`flex-1 relative z-10 flex items-center justify-center gap-2 font-black text-[15px] tracking-wide ${syncColors} focus-visible:outline-none rounded-full
              ${!isAuditory ? 'text-white' : (isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-800')}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-[18px] h-[18px]">
              <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            Visual
          </button>
          <button
            onClick={() => handleViewSwap("auditory")}
            className={`flex-1 relative z-10 flex items-center justify-center gap-2 font-black text-[15px] tracking-wide ${syncColors} focus-visible:outline-none rounded-full
              ${isAuditory ? 'text-white' : (isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-800')}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-[18px] h-[18px]">
              <path d="M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0"/>
              <path d="M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 1 1 0 4"/>
            </svg>
            Auditory
          </button>
        </div>
      </div>

      {/* --- PURE OPACITY CROSSFADE --- */}
      <div className="flex-1 w-full relative z-10 [&>div>div]:!bg-transparent">
        <div className={`absolute inset-0 w-full h-full flex will-change-opacity transition-opacity duration-500 ease-in-out ${!isAuditory ? 'opacity-100 pointer-events-auto z-10' : 'opacity-0 pointer-events-none z-0'}`}>
          <VisualMode />
        </div>
        <div className={`absolute inset-0 w-full h-full flex will-change-opacity transition-opacity duration-500 ease-in-out ${isAuditory ? 'opacity-100 pointer-events-auto z-10' : 'opacity-0 pointer-events-none z-0'}`}>
          <AuditoryMode isDark={isAuditoryDark} />
        </div>
      </div>

      {/* --- 🚨 UPGRADED FOOTER (Dynamic Island Status Pill) --- */}
      <div className="px-5 mt-auto pb-4 z-20 flex flex-col gap-3">
        
        <div className={`w-full flex items-center justify-between px-4 py-2.5 rounded-[14px] transition-colors duration-500 ${isDark ? 'bg-[#2C2C2E]/60 border border-white/5' : 'bg-white border border-black/5 shadow-sm'}`}>
          
          <div className="flex flex-col overflow-hidden">
            <span className={`text-[9px] font-black uppercase tracking-widest ${syncColors} ${isAuditory ? 'text-[#FF7A2F]' : 'text-[#0A44FF]'}`}>
              Target Website
            </span>
            <span className={`text-[13px] font-semibold mt-0.5 truncate max-w-[140px] ${syncColors} ${websiteStatus === "online" ? (isDark ? 'text-gray-200' : 'text-gray-800') : 'text-gray-400'}`}>
              {websiteLabel}
            </span>
          </div>

          <div className={`h-8 w-px mx-2 transition-colors duration-500 ${isDark ? 'bg-gray-600/30' : 'bg-gray-200'}`}></div>

          <div className="flex flex-col items-end shrink-0">
            <span className={`text-[9px] font-black uppercase tracking-widest ${syncColors} ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              Extension Status
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`text-[13px] font-semibold ${syncColors} ${extensionStatus === "online" ? (isDark ? 'text-green-400' : 'text-green-500') : 'text-red-500'}`}>
                {extensionStatus === "online" ? "Connected" : "Offline"}
              </span>
              <span className={`w-2 h-2 rounded-full ${syncColors} ${extensionStatus === "online" ? (isDark ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.3)]' : 'bg-green-500') : 'bg-red-500 animate-pulse'}`}></span>
            </div>
          </div>
        </div>

        {/* Minimal Dev Link */}
        <button 
          onClick={onReset}
          className={`self-center text-[11px] font-medium tracking-wide transition-colors ${isDark ? 'text-gray-600 hover:text-gray-400' : 'text-gray-400 hover:text-gray-600'} focus:outline-none`}
        >
          Reset Environment (Dev)
        </button>

      </div>

    </div>
  )
}