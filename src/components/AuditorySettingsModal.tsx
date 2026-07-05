import React, { useEffect, useState, useRef } from "react"
import ColorPickerPopup from "./ColorPickerPopup"

declare var process: any;

interface AuditorySettingsModalProps {
  isDark: boolean
  onClose: () => void
}

interface AuditorySettingsState {
  fontFamily: string
  showOriginalText: boolean
  textColor: string
  captionBgColor: string
}

const DEFAULT_SETTINGS: AuditorySettingsState = {
  fontFamily: "Arial",
  showOriginalText: true,
  textColor: "#FFFFFF",
  captionBgColor: "#000000",
}

const FALLBACK_FONTS = [
  { family: "Arial" }, 
  { family: "Roboto" }, 
  { family: "Montserrat" }, 
  { family: "Open Sans" }, 
  { family: "Lato" }
]

export default function AuditorySettingsModal({ isDark, onClose }: AuditorySettingsModalProps) {
  // Hover/click audio removed for Auditory settings (not needed here)
  const [settings, setSettings] = useState<AuditorySettingsState>(DEFAULT_SETTINGS)
  const [activeColorPicker, setActiveColorPicker] = useState<"text" | "bg" | null>(null)
  const [loudNoiseAlerts, setLoudNoiseAlerts] = useState(true)
  
  // Font picker specific states
  const [googleFonts, setGoogleFonts] = useState<Array<{ family: string }>>([])
  const [fontInput, setFontInput] = useState<string>(DEFAULT_SETTINGS.fontFamily)
  const [fontSearch, setFontSearch] = useState<string>("")
  const [fontDropdownOpen, setFontDropdownOpen] = useState(false)
  const fontPickerRef = useRef<HTMLDivElement>(null)

  // Dragging & Animation State
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [initialOffsetLoaded, setInitialOffsetLoaded] = useState(false)
  const [isMounted, setIsMounted] = useState(false)
  
  const offsetRef = useRef(offset)
  const draggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const offsetStartRef = useRef({ x: 0, y: 0 })

  const getHoverHandlers = (label: string) => ({
    onMouseEnter: () => {},
    onMouseLeave: () => {},
    onFocus: () => {},
    onBlur: () => {}
  })

  // Trigger entrance animation
  useEffect(() => {
    requestAnimationFrame(() => setIsMounted(true))
  }, [])

  // audio notification on open removed for auditory settings

  // load saved settings
  useEffect(() => {
    chrome.storage.local.get(["sensa_auditory_settings"], (result) => {
      if (result.sensa_auditory_settings) {
        setSettings({ ...DEFAULT_SETTINGS, ...result.sensa_auditory_settings })
        setFontInput(result.sensa_auditory_settings.fontFamily || DEFAULT_SETTINGS.fontFamily)
      }
    })
    chrome.storage.local.get(["sensa_loud_noise_alerts"], (res) => {
      if (typeof res.sensa_loud_noise_alerts === "boolean") {
        setLoudNoiseAlerts(res.sensa_loud_noise_alerts)
      }
    })
  }, [])

  // (audio output devices removed for auditory settings - not needed)

  // Fetch ALL Google Fonts
  useEffect(() => {
    const key = process.env.PLASMO_PUBLIC_GOOGLE_FONTS_API_KEY
    let cancelled = false

    ;(async () => {
      try {
        if (key) {
          const res = await fetch(`https://www.googleapis.com/webfonts/v1/webfonts?key=${key}&sort=popularity`)
          if (res.ok) {
            const data = await res.json()
            if (!cancelled && Array.isArray(data.items)) {
              setGoogleFonts(data.items.slice(0, 100).map((it: any) => ({ family: it.family })))
              return
            }
          }
        }

        chrome.runtime.sendMessage({ type: "FETCH_GOOGLE_FONTS" }, (response) => {
          if (!cancelled && response?.ok && Array.isArray(response.items)) {
            setGoogleFonts(response.items.slice(0, 100).map((it: any) => ({ family: it.family })))
          }
        })
      } catch (err) {
        console.error("Failed to load google fonts:", err)
      }
    })()

    return () => { cancelled = true }
  }, [])

  const persistSettings = (updates: Partial<AuditorySettingsState>) => {
    setSettings((current) => {
      const next = { ...current, ...updates }
      chrome.storage.local.set({ sensa_auditory_settings: next })
      return next
    })
  }

  const loadGoogleFont = (family: string) => {
    try {
      const fam = String(family).split(" ").join("+")
      const href = `https://fonts.googleapis.com/css2?family=${fam}&display=swap`
      const existing = Array.from(document.head.querySelectorAll("link[rel=stylesheet]"))
        .map((l) => l.getAttribute("href"))
        .filter(Boolean)
      if (!existing.includes(href)) {
        const link = document.createElement("link")
        link.rel = "stylesheet"
        link.href = href
        document.head.appendChild(link)
      }
    } catch (err) {
      console.error("Failed to load font:", family, err)
    }
  }

  // Filter logic
  const activeFontList = googleFonts.length > 0 ? googleFonts : FALLBACK_FONTS;
  const filteredFonts = activeFontList.filter((font) => 
    font.family.toLowerCase().includes(fontSearch.trim().toLowerCase())
  )
  
  const renderedFonts = filteredFonts.slice(0, 100)

  const handleFontSelect = (family: string) => {
    setFontSearch("")
    setFontInput(family)
    setFontDropdownOpen(false)
    loadGoogleFont(family)
    persistSettings({ fontFamily: family })
  }

  useEffect(() => {
    if (!fontDropdownOpen) return
    renderedFonts.forEach((font) => loadGoogleFont(font.family))
  }, [fontDropdownOpen, renderedFonts])

  useEffect(() => {
    const onGlobalClick = (event: MouseEvent) => {
      if (!fontPickerRef.current?.contains(event.target as Node)) {
        if (fontDropdownOpen) {
          setFontInput(settings.fontFamily)
          setFontSearch("")
          setFontDropdownOpen(false)
        }
      }
    }
    document.addEventListener("mousedown", onGlobalClick)
    return () => document.removeEventListener("mousedown", onGlobalClick)
  }, [fontDropdownOpen, settings.fontFamily])

  // Dragging logic
  useEffect(() => { offsetRef.current = offset }, [offset])

  useEffect(() => {
    chrome.storage.local.get(["sensa_auditory_settings_offset"], (result) => {
      if (result.sensa_auditory_settings_offset) {
        setOffset(result.sensa_auditory_settings_offset)
      }
      setInitialOffsetLoaded(true)
    })
  }, [])

  useEffect(() => {
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return
      const dx = ev.clientX - dragStartRef.current.x
      const dy = ev.clientY - dragStartRef.current.y
      setOffset({ x: offsetStartRef.current.x + dx, y: offsetStartRef.current.y + dy })
    }

    const onUp = () => {
      if (!draggingRef.current) return
      draggingRef.current = false
      chrome.storage.local.set({ sensa_auditory_settings_offset: offsetRef.current })
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [])

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest("button, input, select, textarea, ul, li, label")) return
    e.preventDefault()
    draggingRef.current = true
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    offsetStartRef.current = { x: offsetRef.current.x, y: offsetRef.current.y }
  }

  const isBackdropMouseDownRef = useRef(false)
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && isBackdropMouseDownRef.current) {
      isBackdropMouseDownRef.current = false
      setIsMounted(false)
      setTimeout(onClose, 300)
    }
  }

  // 🚨 THEME VARIABLES (Orange/Auditory Themed) - opaque surfaces
  const modalBg = isDark ? "bg-[#141416] border-white/10" : "bg-white border-black/5"
  const textColor = isDark ? "text-gray-100" : "text-gray-900"
  const labelColor = isDark ? "text-gray-200" : "text-gray-700"
  const inputBg = isDark ? "bg-[#2C2C2E] hover:bg-[#2C2C2E]" : "bg-white hover:bg-white"
  const inputBorder = isDark ? "border-white/10" : "border-black/5"
  const secondaryText = isDark ? "text-gray-400" : "text-gray-500"
  const dividerClass = isDark ? "border-white/10" : "border-black/5"
  const sectionHoverClass = isDark
    ? "hover:bg-white/8 hover:border-white/15 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
    : "hover:bg-black/5 hover:border-black/10"
  const iconColor = isDark ? "text-[#FF7A2F]" : "text-[#FF7A2F]"
  const toggleSwitchClass = isDark
    ? "relative inline-block w-12 h-7 rounded-full bg-[#3A3A3C] shadow-[inset_0_1px_3px_rgba(0,0,0,0.45)] peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#FF7A2F]/50 peer-checked:bg-gradient-to-r peer-checked:from-[#FF7A2F] peer-checked:to-[#FF9F0A] peer-checked:shadow-[0_2px_14px_rgba(255,122,47,0.4)] peer-checked:after:translate-x-[20px] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-[#E8E8ED] after:border after:border-white/20 after:rounded-full after:h-6 after:w-6 after:transition-all after:shadow-[0_1px_4px_rgba(0,0,0,0.35)] peer-checked:after:border-white/40"
    : "relative inline-block w-12 h-7 rounded-full bg-gray-300 shadow-inner peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#FF7A2F]/50 peer-checked:bg-gradient-to-r peer-checked:from-[#FF7A2F] peer-checked:to-[#FF9F0A] peer-checked:after:translate-x-[20px] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-gray-200 after:rounded-full after:h-6 after:w-6 after:transition-all"

  return (
    <div 
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          isBackdropMouseDownRef.current = true
        } else {
          isBackdropMouseDownRef.current = false
        }
      }}
      onClick={handleBackdropClick} 
      className={`fixed inset-0 z-[999999] flex items-center justify-center bg-black/30 backdrop-blur-sm font-sans px-4 transition-opacity duration-300 ${isMounted ? 'opacity-100' : 'opacity-0'}`}
      role="dialog"
      aria-modal="true"
    >
      <div className="relative">
        <div
          className={`relative w-[480px] ${modalBg} rounded-[32px] border p-8 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.3),_0_0_2px_rgba(255,255,255,0.2)_inset] transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] ${isMounted ? 'scale-100 translate-y-0' : 'scale-[0.95] translate-y-4'}`}
          onMouseDown={onHeaderMouseDown}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${isMounted ? 1 : 0.95})`,
            cursor: draggingRef.current ? "grabbing" : "grab",
            visibility: initialOffsetLoaded ? "visible" : "hidden"
          }}
        >
          {/* Subtle Drag Handle */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 rounded-full bg-gray-400/30 pointer-events-none" />

          <div className="flex justify-between items-center mb-8 mt-2">
            <h2 className="text-[26px] font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-[#FF7A2F] to-[#FF9F0A]">
              Auditory Settings
            </h2>
            <button 
              onClick={() => {
                setIsMounted(false)
                setTimeout(onClose, 300)
              }}
              className={`bg-transparent hover:bg-black/5 dark:hover:bg-white/10 text-gray-400 hover:${textColor} transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A2F]/50 rounded-full p-2`}
              aria-label="Close"
              {...getHoverHandlers("Close")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="flex flex-col gap-3">
            
            {/* FONT PICKER */}
            <div 
              className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} ${sectionHoverClass} rounded-xl transition-colors relative z-50`}
              {...getHoverHandlers("Font Family")}
            >
              <div className="flex items-center gap-3">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
                <div className="flex flex-col">
                  <span className={`text-[15px] font-semibold tracking-wide ${labelColor}`}>Font Family</span>
                  <span className={`text-[11px] ${secondaryText}`}>Font used for captions</span>
                </div>
              </div>
              <div ref={fontPickerRef} className="relative w-[190px]">
                <input
                  value={fontDropdownOpen ? fontSearch : fontInput}
                  placeholder={fontDropdownOpen ? fontInput : "Search fonts..."}
                  onChange={(e) => {
                    setFontSearch(e.target.value)
                    if (!fontDropdownOpen) setFontDropdownOpen(true)
                  }}
                  onFocus={() => { setFontDropdownOpen(true); setFontSearch("") }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      const topMatch = filteredFonts[0]
                      if (topMatch) { handleFontSelect(topMatch.family) } 
                      else { setFontInput(settings.fontFamily); setFontDropdownOpen(false); setFontSearch("") }
                      ;(e.target as HTMLInputElement).blur()
                    }
                  }}
                  className={`w-full text-left border ${inputBorder} ${textColor} ${inputBg} shadow-sm h-11 pl-4 pr-8 rounded-xl text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-[#FF7A2F]/40 transition-all hover:shadow-md placeholder:text-gray-500`}
                  aria-label="Search fonts"
                />
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()} 
                  onClick={(e) => { e.preventDefault(); setFontDropdownOpen((open) => !open); if (!fontDropdownOpen) setFontSearch("") }}
                  className={`absolute inset-y-0 right-3 flex items-center transition-transform duration-300 ${fontDropdownOpen ? "rotate-180" : ""} ${secondaryText}`}
                  aria-label="Toggle font list"
                >
                  <svg className="fill-current h-4 w-4" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                </button>
                
                {fontDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setFontDropdownOpen(false) }} />
                    <ul className={`absolute right-0 z-50 mt-2 w-[240px] max-h-56 overflow-y-auto ${modalBg} border ${inputBorder} rounded-xl shadow-2xl py-2 text-[13px] custom-scrollbar`} role="listbox">
                      {renderedFonts.length > 0 ? (
                        renderedFonts.map((font) => (
                          <li
                            key={font.family} role="option" aria-selected={settings.fontFamily === font.family}
                            onMouseDown={(e) => { e.preventDefault(); handleFontSelect(font.family) }}
                            className={`px-4 py-2.5 cursor-pointer block w-full text-left truncate transition-all font-medium m-1 rounded-lg ${settings.fontFamily === font.family ? "bg-gradient-to-r from-[#FF7A2F] to-[#FF9F0A] text-white shadow-md" : isDark ? "text-gray-200 hover:bg-[#FF7A2F]/20 hover:text-[#FF7A2F]" : "text-gray-700 hover:bg-[#FF7A2F]/10 hover:text-[#FF7A2F]"}`}
                            style={{ fontFamily: `"${font.family}", system-ui, sans-serif` }}
                          >
                            {font.family}
                          </li>
                        ))
                      ) : (
                        <div className="px-4 py-6 text-center text-sm text-gray-400 font-medium">No fonts found</div>
                      )}
                    </ul>
                  </>
                )}
              </div>
            </div>

            {/* LOUD NOISE ALERTS TOGGLE */}
            <label
              className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} ${sectionHoverClass} rounded-xl transition-colors cursor-pointer`}
              {...getHoverHandlers("Loud Noise Alerts")}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 pointer-events-none">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                <div className="flex flex-col">
                  <span className={`text-[15px] font-semibold tracking-wide ${labelColor}`}>Loud Noise Alerts</span>
                  <span className={`text-[11px] ${secondaryText}`}>Screen edges flash when loud sounds play</span>
                </div>
              </div>
              <span className="relative inline-flex items-center shrink-0 pointer-events-none">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={loudNoiseAlerts}
                  onChange={(e) => {
                    const val = e.target.checked
                    setLoudNoiseAlerts(val)
                    chrome.storage.local.set({ sensa_loud_noise_alerts: val })
                  }}
                />
                <span className={toggleSwitchClass} aria-hidden="true" />
              </span>
            </label>

            {/* ORIGINAL TEXT TOGGLE */}
            <label
              className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} ${sectionHoverClass} rounded-xl transition-colors cursor-pointer`}
              {...getHoverHandlers("Original Text")}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-3 pointer-events-none">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                <div className="flex flex-col">
                  <span className={`text-[15px] font-semibold tracking-wide ${labelColor}`}>Original Text</span>
                  <span className={`text-[11px] ${secondaryText}`}>Show the original language above translations</span>
                </div>
              </div>
              <span className="relative inline-flex items-center shrink-0 pointer-events-none">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={settings.showOriginalText}
                  onChange={(e) => persistSettings({ showOriginalText: e.target.checked })}
                />
                <span className={toggleSwitchClass} aria-hidden="true" />
              </span>
            </label>

            {/* TEXT COLOR */}
            <div 
              className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} ${sectionHoverClass} relative rounded-xl transition-colors`}
              {...getHoverHandlers("Text Color")}
            >
              <div className="flex items-center gap-3">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
                <div className="flex flex-col">
                  <span className={`text-[15px] font-semibold tracking-wide ${labelColor}`}>Text Color</span>
                  <span className={`text-[11px] ${secondaryText}`}>Color of the caption text</span>
                </div>
              </div>
              <div className="relative flex items-center justify-end w-[190px]">
                <button 
                  type="button" 
                  onMouseDown={(event) => event.stopPropagation()} 
                  onClick={(event) => { event.stopPropagation(); setActiveColorPicker((c) => (c === "text" ? null : "text")) }} 
                  className="w-10 h-10 rounded-full cursor-pointer shadow-[0_4px_12px_rgba(0,0,0,0.15)] border-2 border-white/40 ring-2 ring-black/5 focus:outline-none focus:ring-4 focus:ring-[#FF7A2F]/50 transition-all active:scale-90 hover:scale-105" 
                  style={{ backgroundColor: settings.textColor }} 
                  aria-label="Pick text color" 
                />
                {activeColorPicker === "text" && (
                  <ColorPickerPopup 
                    isDark={isDark} accent="orange" placement="end"
                    initialColor={settings.textColor} 
                    onColorChange={(color) => persistSettings({ textColor: color })} 
                    onClose={() => setActiveColorPicker(null)} 
                  />
                )}
              </div>
            </div>

            {/* CAPTION BG COLOR */}
            <div 
              className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} ${sectionHoverClass} relative rounded-xl transition-colors`}
              {...getHoverHandlers("Background Color")}
            >
              <div className="flex items-center gap-3">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
                <div className="flex flex-col">
                  <span className={`text-[15px] font-semibold tracking-wide ${labelColor}`}>Background Color</span>
                  <span className={`text-[11px] ${secondaryText}`}>Color behind the caption text</span>
                </div>
              </div>
              <div className="relative flex items-center justify-end w-[190px]">
                <button 
                  type="button" 
                  onMouseDown={(event) => event.stopPropagation()} 
                  onClick={(event) => { event.stopPropagation(); setActiveColorPicker((c) => (c === "bg" ? null : "bg")) }} 
                  className="w-10 h-10 rounded-full cursor-pointer shadow-[0_4px_12px_rgba(0,0,0,0.15)] border-2 border-white/40 ring-2 ring-black/5 focus:outline-none focus:ring-4 focus:ring-[#FF7A2F]/50 transition-all active:scale-90 hover:scale-105" 
                  style={{ backgroundColor: settings.captionBgColor }} 
                  aria-label="Pick caption background color" 
                />
                {activeColorPicker === "bg" && (
                  <ColorPickerPopup 
                    isDark={isDark} accent="orange" placement="end"
                    initialColor={settings.captionBgColor} 
                    onColorChange={(color) => persistSettings({ captionBgColor: color })} 
                    onClose={() => setActiveColorPicker(null)} 
                  />
                )}
              </div>
            </div>

            {/* Output Device removed per user request */}

          </div>

          <div className="mt-8 flex justify-center">
            <button 
              onClick={() => { 
                chrome.storage.local.set({ sensa_auditory_settings: DEFAULT_SETTINGS })
                setSettings(DEFAULT_SETTINGS)
                setFontInput(DEFAULT_SETTINGS.fontFamily)
                setLoudNoiseAlerts(true)
                chrome.storage.local.set({ sensa_loud_noise_alerts: true })
              }} 
              className={`flex items-center gap-2 bg-transparent hover:bg-[#FF7A2F]/10 hover:text-[#FF7A2F] hover:border-[#FF7A2F]/30 dark:hover:bg-[#FF7A2F]/20 dark:hover:border-[#FF7A2F]/40 ${textColor} border ${inputBorder} font-semibold h-11 px-8 rounded-xl transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A2F]/50 text-[14px] tracking-wide hover:shadow-sm`}
              {...getHoverHandlers("Reset to default")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><polyline points="3 3 3 8 8 8"/></svg>
              Reset
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}