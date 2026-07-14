/**
 * @file Dashboard.tsx
 * @description Primary extension dashboard interface providing tabbed navigation between Visual Mode and Auditory Mode.
 *
 * Architectural Overview:
 * 1. Interface Orchestration:
 *    - Manages top-level theme switching (light/dark) and view mode toggling (`visual` vs `auditory`).
 *    - Implements smooth CSS opacity crossfades between `VisualMode` and `AuditoryMode` without re-mounting components.
 *
 * 2. Connectivity & Health Monitoring:
 *    - Probes external endpoints (Google Fonts API, network connectivity) and content script health (`sensa-health-check`) every 15 seconds.
 *    - Renders a live marquee label (`WebsiteLabel`) for long domain names and an animated radar ping indicating extension connection health.
 *
 * 3. Sensory Feedback:
 *    - Announces interface state on open via `useUIHoverAudio`, tailored for blind/low-vision users.
 */

import { useState, useEffect, useRef } from "react"
import sensaLogo from "data-base64:../../assets/sensa-logo.png"
import VisualMode from "./VisualMode"
import AuditoryMode from "./AuditoryMode"
import { useUIHoverAudio } from "../hooks/useUIHoverAudio"
// Small helper component: measured marquee label
function WebsiteLabel({ label, isDark, syncColors, websiteStatus }: { label: string; isDark: boolean; syncColors: string; websiteStatus: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const textRef = useRef<HTMLDivElement | null>(null)
  const styleIdRef = useRef<string | null>(null)
  const [shouldScroll, setShouldScroll] = useState(false)

  useEffect(() => {
    const container = containerRef.current
    const text = textRef.current
    if (!container || !text) return

    const measure = () => {
      const cw = container.clientWidth
      const tw = text.scrollWidth
      if (tw > cw + 8) {
        setShouldScroll(true)

        // Start with the text in its natural position (visible start), then move left
        const distance = tw - cw + 8 // how much to move left so the whole text scrolls through
        const speed = 25 // px per second (slower)
        const pauseStart = 2.0 // seconds to pause before moving (longer initial pause)
        const pauseEnd = 1.2 // seconds to hold at end
        const moveDuration = Math.max(4, distance / speed)
        const duration = moveDuration + pauseStart + pauseEnd
        const id = `sensa-marquee-${Date.now()}`
        styleIdRef.current = id

        text.style.display = 'inline-block'
        text.style.willChange = 'transform'
        text.style.transform = `translateX(0)`
        // Ensure left alignment so long text isn't centered and cut off
        container.style.textAlign = 'left'
        // Add a small left padding on the text so the first character isn't visually clipped
        text.style.paddingLeft = '6px'

        // Keyframes: hold at 0 for pauseStart, move left over moveDuration, then hold at end for pauseEnd
        const moveStartPct = (pauseStart / duration) * 100
        const moveEndPct = ((pauseStart + moveDuration) / duration) * 100
        const keyframes = `@keyframes ${id} { 0% { transform: translateX(0); } ${moveStartPct}% { transform: translateX(0); } ${moveEndPct}% { transform: translateX(-${distance}px); } 100% { transform: translateX(-${distance}px); } }`
        const styleEl = document.createElement('style')
        styleEl.id = id
        styleEl.textContent = keyframes
        document.head.appendChild(styleEl)

        // Apply animation: move left, hold briefly, then reset
        text.style.animation = `${id} ${duration}s linear infinite`
      } else {
        setShouldScroll(false)
        if (styleIdRef.current) {
          const prev = document.getElementById(styleIdRef.current)
          prev?.remove()
          styleIdRef.current = null
        }
        text.style.animation = ''
        text.style.transform = ''
        text.style.display = ''
        text.style.willChange = ''
        container.style.textAlign = ''
        text.style.paddingLeft = ''
      }
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(container)
    ro.observe(text)
    window.addEventListener('orientationchange', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('orientationchange', measure)
      if (styleIdRef.current) {
        const prev = document.getElementById(styleIdRef.current)
        prev?.remove()
        styleIdRef.current = null
      }
    }
  }, [label])

  return (
    <div className={`relative w-[130px] h-[20px] overflow-hidden`} ref={containerRef}>
      <div
        ref={textRef}
        className={`${syncColors} text-[14px] font-bold whitespace-nowrap ${websiteStatus === 'online' ? (isDark ? 'text-white' : 'text-gray-900') : 'text-gray-400'}`}
        aria-label={label}
      >
        {label}
      </div>
    </div>
  )
}

interface DashboardProps {
  selectedMode: "visual" | "auditory" | null
  theme: "light" | "dark"
  onModeChange: (mode: "visual" | "auditory") => void
  onThemeChange: (newTheme: "light" | "dark") => void
  onReset: () => void
}

export default function Dashboard({ selectedMode, theme, onModeChange, onThemeChange, onReset }: DashboardProps) {
  const { playHoverAudio, playClickAudio, cancelHoverAudio } = useUIHoverAudio()
  const [currentViewMode, setCurrentViewMode] = useState<"visual" | "auditory">(selectedMode ?? "visual")
  const [websiteLabel, setWebsiteLabel] = useState("Detecting...")
  const [websiteStatus, setWebsiteStatus] = useState<"online" | "offline" | "unsupported">("offline")
  const [extensionStatus, setExtensionStatus] = useState<"online" | "offline">("offline")
  const [unavailableApis, setUnavailableApis] = useState<string[]>([])
  const [isVisualActive, setIsVisualActive] = useState(false)

  const [isMounted, setIsMounted] = useState(false)
  const [hasHydratedInitialMode, setHasHydratedInitialMode] = useState(false)
  const hasAnnouncedVisualOnOpenRef = useRef(false)
  const announceTimerRef = useRef<number | null>(null)

  useEffect(() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setIsMounted(true))
    })
  }, [])

  const getHoverHandlers = (label: string) => ({
    onMouseEnter: () => playHoverAudio(label),
    onMouseLeave: cancelHoverAudio,
    onFocus: () => playHoverAudio(label),
    onBlur: cancelHoverAudio
  })

  const websiteHoverText = `Target website: ${websiteLabel}`
  const extensionHoverText = `Extension Status: ${extensionStatus === "online" ? "Connected" : "Offline"}`
  const extensionStatusSpeech = extensionStatus === "online" ? "Connected" : "Offline"

  const getModeInterfaceAnnouncement = (mode: "visual" | "auditory", isWelcome = false, isListening = false) => {
    if (mode === "auditory") return "Auditory Mode Interface"

    const baseMessage = isWelcome
      ? `We are now in the Visual Mode interface. Target website: ${websiteLabel}. Extension status: ${extensionStatusSpeech}.`
      : `Visual Mode Interface. Target website: ${websiteLabel}. Extension status: ${extensionStatusSpeech}.`

    const commandHint = isListening
      ? "You can say, deactivate, to disable visual mode."
      : "You can say, activate, to enable visual mode."

    return `${baseMessage} ${commandHint}`
  }

  useEffect(() => {
    chrome.storage.local.get(["sensa_last_tab", "sensa_visual_active"], (res) => {
      const nextMode = selectedMode ?? res.sensa_last_tab ?? "visual"
      setCurrentViewMode(nextMode)
      if (res.sensa_visual_active !== undefined) setIsVisualActive(!!res.sensa_visual_active)

      if (!hasHydratedInitialMode) {
        requestAnimationFrame(() => setHasHydratedInitialMode(true))
      }
    })
  }, [selectedMode, hasHydratedInitialMode])

  useEffect(() => {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.sensa_visual_active !== undefined) {
        setIsVisualActive(!!changes.sensa_visual_active.newValue)
      }
      if (changes.sensa_last_tab?.newValue !== undefined) {
        setCurrentViewMode(changes.sensa_last_tab.newValue)
      } else if (changes.sensa_visual_active?.newValue === true) {
        setCurrentViewMode("visual")
      } else if (changes.sensa_auditory_active?.newValue === true) {
        setCurrentViewMode("auditory")
      }
    }
    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [])

  // Announce visual mode on popup open only (not auditory).
  useEffect(() => {
    if (!hasHydratedInitialMode) return
    if (currentViewMode !== "visual") return
    if (hasAnnouncedVisualOnOpenRef.current) return

    let isCancelled = false

    chrome.storage.local.get(["sensa_visual_entered_from_welcome"], (res) => {
      if (isCancelled || currentViewMode !== "visual") return
      const isFromWelcome = !!res.sensa_visual_entered_from_welcome
      if (isFromWelcome) {
        chrome.storage.local.set({ sensa_visual_entered_from_welcome: false })
      }

      announceTimerRef.current = window.setTimeout(() => {
        chrome.storage.local.get(["sensa_visual_active"], (r) => {
          if (isCancelled || currentViewMode !== "visual") return
          hasAnnouncedVisualOnOpenRef.current = true
          const message = getModeInterfaceAnnouncement("visual", isFromWelcome, !!r.sensa_visual_active)
          playClickAudio(message)
        })
      }, 500)
    })

    return () => {
      isCancelled = true
      if (announceTimerRef.current !== null) {
        window.clearTimeout(announceTimerRef.current)
      }
    }
  }, [hasHydratedInitialMode, currentViewMode, websiteLabel, extensionStatusSpeech, playClickAudio])

  const handleViewSwap = (newMode: "visual" | "auditory") => {
    if (newMode === currentViewMode) return
    cancelHoverAudio()
    setCurrentViewMode(newMode)
    playClickAudio(getModeInterfaceAnnouncement(newMode, false, false))

    chrome.storage.local.set({
      sensa_last_tab: newMode,
      sensa_visual_active: false,
      sensa_auditory_active: false
    })
    chrome.runtime.sendMessage({ type: "sensa-activate-mode", mode: null }, () => {
      const _ = chrome.runtime.lastError
    })
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
            if (!navigator.onLine) {
              nextWebsiteStatus = "offline"
            } else {
              nextWebsiteStatus = isWeb ? "online" : "unsupported"
            }
          } catch {
            nextWebsiteLabel = activeTab.url
            nextWebsiteStatus = "unsupported"
          }
        }

        if (typeof activeTab?.id === "number" && nextWebsiteStatus === "online") {
          nextBridgeOnline = await new Promise<boolean>((resolve) => {
            const targetTabId = activeTab.id!
            chrome.tabs.sendMessage(targetTabId, { type: "sensa-health-check" }, async (response) => {
              if (chrome.runtime.lastError) {
                try {
                  const manifest = chrome.runtime.getManifest()
                  const jsFiles = manifest?.content_scripts?.[0]?.js || []
                  if (jsFiles.length > 0) {
                    await chrome.scripting.executeScript({
                      target: { tabId: targetTabId },
                      files: jsFiles
                    })
                    await new Promise(r => setTimeout(r, 200))
                    chrome.tabs.sendMessage(targetTabId, { type: "sensa-health-check" }, (retryResp) => {
                      if (chrome.runtime.lastError) {
                        resolve(false)
                      } else {
                        resolve(!!retryResp?.ok)
                      }
                    })
                    return
                  }
                } catch {
                  // Injection forbidden or failed
                }
                resolve(false)
                return
              }
              resolve(!!response?.ok)
            })
          })
        } else if (nextWebsiteStatus === "unsupported") {
          nextBridgeOnline = true // Not required on restricted/system pages
        }
      } catch {
        nextWebsiteLabel = "Unavailable"
        nextWebsiteStatus = "offline"
      }

      const apiUnavailable = await checkApiConnectivity()
      const isBridgeRequired = nextWebsiteStatus === "online"
      const nextUnavailable = [...(isBridgeRequired && !nextBridgeOnline ? ["Extension Bridge"] : []), ...apiUnavailable]
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

      {/* Top navigation bar and theme toggle */}
      <div className="flex items-center justify-between px-5 pt-3.5 pb-1 z-20">
        <div className="flex items-center gap-2.5">
          <img src={sensaLogo} alt="Sensa Logo" className="w-[58px] h-[58px] object-contain drop-shadow-sm shrink-0" />
          <h1 className="text-[24px] font-black tracking-tight leading-none -translate-y-[1px]">Sensa</h1>
        </div>

        {/* THEME TOGGLE */}
        {isAuditory ? (
          <button
            onClick={() => onThemeChange(isDark ? "light" : "dark")}
            aria-label={`Switch to ${isDark ? 'Light' : 'Dark'} Mode`}
            className={`relative flex items-center self-center translate-y-[1px] w-[58px] h-[30px] rounded-full p-[3px] transition-colors duration-500 shrink-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF7A2F]/50
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

      {/* Mode selector pill allowing animated swapping between Visual and Auditory modes */}
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
            type="button"
            onClick={() => handleViewSwap("visual")}
            aria-label="Switch to Visual Mode Interface"
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
            type="button"
            onClick={() => handleViewSwap("auditory")}
            aria-label="Switch to Auditory Mode Interface"
            className={`flex-1 relative z-10 flex items-center justify-center gap-2 font-black text-[15px] tracking-wide ${syncColors} focus-visible:outline-none rounded-full
              ${isAuditory ? 'text-white' : (isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-800')}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="w-[18px] h-[18px]">
              <path d="M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0" />
              <path d="M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 1 1 0 4" />
            </svg>
            Auditory
          </button>
        </div>
      </div>

      {/* Viewport crossfade animation switching between Visual and Auditory interfaces */}
      <div className="flex-1 w-full relative z-10 [&>div>div]:!bg-transparent">
        <div className={`absolute inset-0 w-full h-full flex will-change-opacity transition-opacity duration-500 ease-in-out ${!isAuditory ? 'opacity-100 pointer-events-auto z-10' : 'opacity-0 pointer-events-none z-0'}`}>
          <VisualMode isActiveView={!isAuditory} />
        </div>
        <div className={`absolute inset-0 w-full h-full flex will-change-opacity transition-opacity duration-500 ease-in-out ${isAuditory ? 'opacity-100 pointer-events-auto z-10' : 'opacity-0 pointer-events-none z-0'}`}>
          <AuditoryMode isDark={isAuditoryDark} />
        </div>
      </div>

      {/* Bottom status bar displaying target website connectivity and extension health */}
      <div className="px-5 mt-auto pb-5 z-20 flex flex-col gap-3 items-center">

        {/* CSS Injection for the Status Radar Ping */}
        <style dangerouslySetInnerHTML={{
          __html: `
          @keyframes radar-ping {
            0% { transform: scale(1); opacity: 0.8; }
            70%, 100% { transform: scale(2.5); opacity: 0; }
          }
          .animate-radar-ping { animation: radar-ping 2s cubic-bezier(0, 0, 0.2, 1) infinite; }
        `}} />

        <div className={`w-full flex items-center justify-center gap-4 px-5 py-3.5 rounded-[18px] transition-colors duration-500 text-center ${isDark ? 'bg-[#2C2C2E]/80 border border-white/5 shadow-[0_8px_24px_rgba(0,0,0,0.3)]' : 'bg-white border border-black/5 shadow-[0_8px_24px_rgba(0,0,0,0.06)]'}`}>

          <div
            className={`flex flex-col items-center overflow-hidden text-center min-w-0 flex-1 rounded-md px-2 py-1 transition-all duration-200 cursor-default ${!isAuditory ? (isDark ? "hover:bg-white/10" : "hover:bg-black/5") : ""} ${!isAuditory ? "hover:ring-2 hover:ring-[#0A44FF]/40 hover:shadow-[0_0_0_4px_rgba(10,68,255,0.12)]" : ""}`}
            tabIndex={!isAuditory ? 0 : -1}
            {...(!isAuditory ? getHoverHandlers(websiteHoverText) : {})}
          >
            <span className={`text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${syncColors} ${isAuditory ? 'text-[#FF7A2F]' : 'text-[#0A44FF]'}`}>
              Target Website
            </span>
            {/* Scrolling label: measures overflow and applies a looping marquee animation */}
            <div ref={(el) => { /* placeholder for typing */ }} className="mt-1">
              <div
                ref={(el) => (null)}
              />
            </div>
            <WebsiteLabel
              label={websiteLabel}
              isDark={isDark}
              syncColors={syncColors}
              websiteStatus={websiteStatus}
            />
          </div>

          <div className={`h-10 w-[2px] rounded-full mx-0 transition-colors duration-500 ${isDark ? 'bg-gray-600/40' : 'bg-gray-100'}`}></div>

          <div
            className={`flex flex-col items-center text-center min-w-0 flex-1 rounded-md px-2 py-1 transition-all duration-200 cursor-default ${!isAuditory ? (isDark ? "hover:bg-white/10" : "hover:bg-black/5") : ""} ${!isAuditory ? "hover:ring-2 hover:ring-[#0A44FF]/30 hover:shadow-[0_0_0_4px_rgba(10,68,255,0.1)]" : ""}`}
            tabIndex={!isAuditory ? 0 : -1}
            {...(!isAuditory ? getHoverHandlers(extensionHoverText) : {})}
          >
            {/* Extension health status indicator */}
            <span className={`text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${syncColors} ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Extension Status
            </span>
            <div className="flex items-center justify-center gap-2 mt-0.5">
              <span className={`text-[14px] font-bold ${syncColors} ${extensionStatus === "online" ? (isDark ? 'text-green-400' : 'text-green-600') : 'text-red-500'}`}>
                {extensionStatus === "online" ? "Connected" : "Offline"}
              </span>

              {/* Animated status pulse indicator */}
              <div className="relative flex items-center justify-center w-2.5 h-2.5">
                {/* Expanding Outer Ring */}
                <span className={`absolute inline-flex w-full h-full rounded-full animate-radar-ping ${extensionStatus === "online" ? (isDark ? 'bg-green-400' : 'bg-green-500') : 'bg-red-500'}`}></span>
                {/* Solid Inner Core */}
                <span className={`relative inline-flex rounded-full w-2.5 h-2.5 ${extensionStatus === "online" ? (isDark ? 'bg-green-400 shadow-[0_0_10px_rgba(74,222,128,0.4)]' : 'bg-green-500') : 'bg-red-500'}`}></span>
              </div>

            </div>
          </div>
        </div>

        <button
          onClick={onReset}
          className={`self-center text-[12px] font-semibold tracking-wide transition-colors ${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'} focus:outline-none`}
        >
          Reset Environment (Dev)
        </button>

      </div>

    </div>
  )
}