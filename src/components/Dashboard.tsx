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
  const [currentViewMode, setCurrentViewMode] = useState<"visual" | "auditory">("visual")
  const [websiteLabel, setWebsiteLabel] = useState("Detecting...")
  const [websiteStatus, setWebsiteStatus] = useState<"online" | "offline" | "unsupported">("offline")
  const [extensionStatus, setExtensionStatus] = useState<"online" | "offline">("offline")
  const [unavailableApis, setUnavailableApis] = useState<string[]>([])
  
  // 🚨 Replaced the clunky timeout hack with a clean mount flag
  // This prevents the slider from animating on initial load, but allows pure CSS physics afterward
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    // Wait for initial render, then unlock transitions
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsMounted(true))
    })
  }, [])

  // --- AUTO-SAVE LOGIC ---
  useEffect(() => {
    chrome.storage.local.get(["sensa_last_tab"], (res) => {
      if (res.sensa_last_tab) {
        setCurrentViewMode(res.sensa_last_tab)
      } else if (selectedMode) {
        setCurrentViewMode(selectedMode)
      }
    })
  }, [selectedMode])

  const handleViewSwap = (newMode: "visual" | "auditory") => {
    if (newMode === currentViewMode) return
    setCurrentViewMode(newMode)
    
    // Tab switch is navigation only: deactivate running mode(s), do not auto-activate target mode.
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
          const response = await fetch(url, {
            method: "GET",
            cache: "no-store",
            signal: controller.signal
          })
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
      const nextUnavailable = [
        ...(nextBridgeOnline ? [] : ["Extension Bridge"]),
        ...apiUnavailable
      ]
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

  // Enforce Visual Mode scope: Always Light Mode
  const isAuditory = currentViewMode === "auditory"
  const isDark = isAuditory ? theme === "dark" : false

  // 🚨 SYNCHRONIZED SPRING PHYSICS
  const syncColors = isMounted ? "transition-colors duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]" : "transition-none"
  const syncTransform = isMounted ? "transition-transform duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]" : "transition-none"

  return (
    <div className={`w-[350px] h-[550px] flex flex-col font-sans relative overflow-hidden ${syncColors} ${isDark ? 'bg-[#1C1C1E] text-gray-200' : 'bg-white text-black'}`}>
      
      {/* --- NAVBAR --- */}
      <div className="flex items-center justify-between px-4 pt-3 pb-2 z-20">
        <div className="flex items-center gap-3">
          <img src={sensaLogo} alt="Sensa Logo" className="w-14 h-14 object-contain" />
          <h1 className="text-3xl font-extrabold tracking-tight">Sensa</h1>
        </div>
        
        {isAuditory ? (
          <button
            onClick={() => onThemeChange(isDark ? "light" : "dark")}
            className={`relative flex items-center w-16 h-8 rounded-full p-1 transition-colors duration-300 border focus:outline-none focus-visible:ring-4 focus-visible:ring-[#FF7A2F]/50
              ${isDark ? 'bg-[#2C2C2E] border-[#3C3C3E]' : 'bg-slate-200 border-slate-300'}`}
          >
            <div
              className={`absolute w-6 h-6 bg-white rounded-full shadow-md flex items-center justify-center transform transition-transform duration-300 ease-out
                ${isDark ? 'translate-x-8' : 'translate-x-0'}`}
            >
              {isDark ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <circle cx="12" cy="12" r="4"></circle>
                  <path d="M12 2v2"></path>
                  <path d="M12 20v2"></path>
                  <path d="M4.93 4.93l1.41 1.41"></path>
                  <path d="M17.66 17.66l1.41 1.41"></path>
                  <path d="M2 12h2"></path>
                  <path d="M20 12h2"></path>
                  <path d="M4.93 19.07l1.41-1.41"></path>
                  <path d="M17.66 6.34l1.41-1.41"></path>
                </svg>
              )}
            </div>
          </button>
        ) : null}
      </div>

      {/* --- DYNAMIC MODE SWITCHER PILL --- */}
      <div className="px-6 flex justify-center mb-4 z-20 mt-2">
        <div className={`relative flex w-[85%] h-12 rounded-full p-[4px] border-[3px] ${syncColors}
          ${isAuditory ? (isDark ? 'bg-[#2C2C2E] border-[#FF7A2F]' : 'bg-white border-[#FF7A2F]') : 'bg-white border-[#0A44FF]'}`}
        >
          {/* Sliding Background */}
          <div
            className={`absolute top-[3px] bottom-[3px] w-[calc(50%-4px)] rounded-full ${syncTransform} shadow-sm
              ${isAuditory ? 'translate-x-[100%] bg-[#FF7A2F]' : 'translate-x-0 bg-[#0A44FF]'}`}
          />
          <button
            onClick={() => handleViewSwap("visual")}
            className={`flex-1 relative z-10 font-bold text-[15px] ${syncColors} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#0A44FF]/50 rounded-full
              ${!isAuditory ? 'text-white' : (isDark ? 'text-gray-300' : 'text-black')}`}
          >
            Visual
          </button>
          <button
            onClick={() => handleViewSwap("auditory")}
            className={`flex-1 relative z-10 font-bold text-[15px] ${syncColors} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#FF7A2F]/50 rounded-full
              ${isAuditory ? 'text-white' : (isDark ? 'text-gray-300' : 'text-black')}`}
          >
            Auditory
          </button>
        </div>
      </div>

      {/* --- FLEX SLIDER --- */}
      {/* 🚨 REMOVED overflow-x-hidden HERE to destroy the invisible wall clipping the glow */}
      <div className="flex-1 w-full relative z-10">
        <div
          className={`absolute top-0 left-0 w-[200%] h-full flex ${syncTransform}`}
          style={{ transform: isAuditory ? "translateX(-50%)" : "translateX(0)" }}>
          <div className="w-1/2 h-full flex shrink-0">
            <VisualMode />
          </div>
          <div className="w-1/2 h-full flex shrink-0">
            <AuditoryMode isDark={isDark} />
          </div>
        </div>
      </div>

      {/* --- FOOTER --- */}
      <div className="px-6 flex flex-col items-center gap-2 mt-auto pb-4 z-20">
        <p className={`text-[14px] font-bold ${syncColors} ${isAuditory ? 'text-[#FF7A2F]' : 'text-[#0A44FF]'}`}>
          Website:
          <span className={`font-semibold ml-1.5 ${websiteStatus === "online" ? (isDark ? 'text-gray-200' : 'text-gray-800') : 'text-gray-500'}`}>
            {websiteLabel}
          </span>
        </p>
        <p className={`text-[14px] font-bold flex items-center justify-center ${syncColors} ${isAuditory ? 'text-[#FF7A2F]' : 'text-[#0A44FF]'}`}>
          Status:
          <span className={`font-semibold ml-2 flex items-center ${extensionStatus === "online" ? (isDark ? 'text-green-400' : 'text-green-600') : (isDark ? 'text-red-400' : 'text-red-600')}`}>
            {extensionStatus === "online" ? "Online" : "Offline"}
            <span className={`inline-block w-2 h-2 rounded-full ml-1.5 ${extensionStatus === "online" ? (isDark ? 'bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]' : 'bg-green-500') : (isDark ? 'bg-red-400 animate-pulse' : 'bg-red-500 animate-pulse')}`}></span>
          </span>
        </p>
        {extensionStatus === "offline" && unavailableApis.length > 0 && (
          <p className={`text-xs text-center font-medium mt-1 ${isDark ? 'text-red-300' : 'text-red-600'}`}>
            Unavailable: {unavailableApis.join(", ")}
          </p>
        )}
      </div>

      <div className="px-6 pb-6 pt-1 z-20">
        <button 
          onClick={onReset}
          className={`w-full py-2.5 rounded-xl text-[13px] font-bold ${syncColors} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 active:scale-95 transition-transform
            ${isDark ? 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-800'}`}
        >
          Reset Environment (Dev)
        </button>
      </div>

    </div>
  )
}