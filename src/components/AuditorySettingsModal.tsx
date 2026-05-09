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
  outputDevice: string
}

const DEFAULT_SETTINGS: AuditorySettingsState = {
  fontFamily: "Arial",
  showOriginalText: true,
  textColor: "#000000",
  captionBgColor: "#FFFFFF",
  outputDevice: "default"
}

const FALLBACK_FONTS = [
  { family: "Arial" }, 
  { family: "Roboto" }, 
  { family: "Montserrat" }, 
  { family: "Open Sans" }, 
  { family: "Lato" }
]

export default function AuditorySettingsModal({ isDark, onClose }: AuditorySettingsModalProps) {
  const [settings, setSettings] = useState<AuditorySettingsState>(DEFAULT_SETTINGS)
  const [activeColorPicker, setActiveColorPicker] = useState<"text" | "bg" | null>(null)
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([])
  
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

  // Trigger entrance animation
  useEffect(() => {
    requestAnimationFrame(() => setIsMounted(true))
  }, [])

  // load saved settings
  useEffect(() => {
    chrome.storage.local.get(["sensa_auditory_settings"], (result) => {
      if (result.sensa_auditory_settings) {
        setSettings({ ...DEFAULT_SETTINGS, ...result.sensa_auditory_settings })
        setFontInput(result.sensa_auditory_settings.fontFamily || DEFAULT_SETTINGS.fontFamily)
      }
    })
  }, [])

  // enumerate audio output devices
  useEffect(() => {
    const loadDevices = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {}
      const devices = await navigator.mediaDevices.enumerateDevices()
      setOutputDevices(devices.filter((d) => d.kind === "audiooutput"))
    }

    loadDevices()
    const onChange = () => loadDevices()
    navigator.mediaDevices?.addEventListener?.("devicechange", onChange)
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", onChange)
  }, [])

  // Fetch ALL Google Fonts securely (No Limits!)
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

    return () => {
      cancelled = true
    }
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
  useEffect(() => {
    offsetRef.current = offset
  }, [offset])

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
    if (target.closest("button, input, select, textarea")) return
    e.preventDefault()
    draggingRef.current = true
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    offsetStartRef.current = { x: offsetRef.current.x, y: offsetRef.current.y }
  }

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      setIsMounted(false)
      setTimeout(onClose, 300)
    }
  }

  // 🚨 High Contrast Theme Variables
  const modalBg = isDark ? "bg-[#1C1C1E]" : "bg-white"
  const textColor = isDark ? "text-white" : "text-black"
  const labelColor = isDark ? "text-gray-200" : "text-gray-800"
  const inputBg = isDark ? "bg-[#2C2C2E]" : "bg-gray-50"
  const inputBorder = isDark ? "border-gray-700" : "border-gray-200"
  const secondaryText = isDark ? "text-gray-400" : "text-gray-500"

  return (
    <div 
      onClick={handleBackdropClick} 
      className={`fixed inset-0 z-[999999] flex items-center justify-center bg-black/60 backdrop-blur-md font-sans px-4 transition-opacity duration-300 ${isMounted ? 'opacity-100' : 'opacity-0'}`}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`relative w-full max-w-[480px] ${modalBg} rounded-[32px] border-4 border-[#FF7A2F] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.5)] transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${isMounted ? 'scale-100 translate-y-0' : 'scale-90 translate-y-8'}`}
        onMouseDown={onHeaderMouseDown}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${isMounted ? 1 : 0.95})`,
          cursor: draggingRef.current ? "grabbing" : "grab",
          visibility: initialOffsetLoaded ? "visible" : "hidden"
        }}
      >
        {/* Visual Drag Handle */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-16 h-1.5 rounded-full bg-gray-400/40 pointer-events-none" />

        <h2 className={`text-[28px] font-extrabold mb-8 tracking-tight mt-2 ${textColor}`}>Settings</h2>

        <button 
          onClick={() => {
            setIsMounted(false)
            setTimeout(onClose, 300)
          }}
          className={`absolute top-6 right-6 ${secondaryText} hover:${textColor} transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF7A2F]/50 rounded-full p-1 active:scale-90`}
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="flex flex-col gap-6">
          
          {/* Font picker */}
          <div className="flex items-center justify-between min-h-[48px] relative z-50">
            <span className={`text-[17px] font-bold tracking-wide ${labelColor}`}>Font Family</span>
            <div ref={fontPickerRef} className="relative w-[220px]">
              <input
                value={fontDropdownOpen ? fontSearch : fontInput}
                placeholder={fontDropdownOpen ? fontInput : "Search fonts..."}
                onChange={(e) => {
                  setFontSearch(e.target.value)
                  if (!fontDropdownOpen) setFontDropdownOpen(true)
                }}
                onFocus={() => {
                  setFontDropdownOpen(true)
                  setFontSearch("") 
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    const topMatch = filteredFonts[0]
                    if (topMatch) {
                      handleFontSelect(topMatch.family)
                    } else {
                      setFontInput(settings.fontFamily)
                      setFontDropdownOpen(false)
                      setFontSearch("")
                    }
                    ;(e.target as HTMLInputElement).blur()
                  }
                }}
                className={`w-full border-2 ${inputBorder} ${inputBg} ${textColor} rounded-[16px] text-[15px] font-medium h-[48px] pl-4 pr-10 focus:outline-none focus:border-[#FF7A2F] focus:ring-4 focus:ring-[#FF7A2F]/30 transition-all placeholder:text-gray-500`}
                aria-label="Search fonts"
              />
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()} 
                onClick={(e) => {
                  e.preventDefault()
                  setFontDropdownOpen((open) => !open)
                  if (!fontDropdownOpen) setFontSearch("")
                }}
                className={`absolute inset-y-0 right-4 flex items-center transition-transform duration-200 ${fontDropdownOpen ? "rotate-180" : ""} ${secondaryText}`}
                aria-label="Toggle font list"
              >
                <svg className="fill-current h-5 w-5" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </button>
              
              {fontDropdownOpen && (
                <div className={`absolute left-0 right-0 top-[calc(100%+8px)] z-[50] max-h-[280px] overflow-y-auto rounded-xl border-2 shadow-[0_10px_30px_rgba(0,0,0,0.3)] custom-scrollbar ${modalBg} ${inputBorder}`}>
                  {renderedFonts.length > 0 ? (
                    renderedFonts.map((font) => (
                      <button
                        key={font.family}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault()
                          handleFontSelect(font.family)
                        }}
                        className={`block w-full px-4 py-3 text-left text-[16px] border-b last:border-b-0 focus:outline-none transition-colors ${
                          settings.fontFamily === font.family
                            ? "bg-[#FF7A2F]/10 text-[#FF7A2F] font-bold"
                            : isDark
                              ? "border-gray-800 text-gray-200 hover:bg-white/5"
                              : "border-gray-100 text-gray-800 hover:bg-[#FF7A2F]/5"
                        }`}
                        style={{ fontFamily: `"${font.family}", system-ui, sans-serif` }}
                      >
                        {font.family}
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-6 text-center text-sm text-gray-400 font-medium">No fonts found</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Show original toggle */}
          <div className="flex items-center justify-between min-h-[48px]">
            <span className={`text-[17px] font-bold tracking-wide ${labelColor}`}>Original Text</span>
            <div className="w-[220px] flex justify-start">
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  className="sr-only peer" 
                  checked={settings.showOriginalText} 
                  onChange={(ev) => persistSettings({ showOriginalText: ev.target.checked })} 
                  aria-label="Toggle Original Text" 
                />
                <div className="w-14 h-8 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#FF7A2F]/50 rounded-full peer peer-checked:after:translate-x-6 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-[#FF7A2F] shadow-inner"></div>
              </label>
            </div>
          </div>

          {/* Text color */}
          <div className="flex items-center justify-between min-h-[48px] relative z-40">
            <span className={`text-[17px] font-bold tracking-wide ${labelColor}`}>Text Color</span>
            <div className="w-[220px] flex justify-start">
              <div className="relative flex items-center justify-center">
                <button 
                  type="button" 
                  onMouseDown={(event) => event.stopPropagation()} 
                  onClick={(event) => { 
                    event.stopPropagation()
                    setActiveColorPicker((c) => (c === "text" ? null : "text")) 
                  }} 
                  className="w-[44px] h-[44px] border-4 border-gray-200 rounded-full cursor-pointer shadow-md focus:outline-none focus:ring-4 focus:ring-[#FF7A2F]/50 transition-transform active:scale-90" 
                  style={{ backgroundColor: settings.textColor }} 
                  aria-label="Pick text color" 
                />
                {activeColorPicker === "text" && (
                  <ColorPickerPopup 
                    isDark={isDark} 
                    accent="orange" 
                    initialColor={settings.textColor} 
                    onColorChange={(color) => persistSettings({ textColor: color })} 
                    onClose={() => setActiveColorPicker(null)} 
                  />
                )}
              </div>
            </div>
          </div>

          {/* Caption bg color */}
          <div className="flex items-center justify-between min-h-[48px] relative z-30">
            <span className={`text-[17px] font-bold tracking-wide ${labelColor}`}>Background Color</span>
            <div className="w-[220px] flex justify-start">
              <div className="relative flex items-center justify-center">
                <button 
                  type="button" 
                  onMouseDown={(event) => event.stopPropagation()} 
                  onClick={(event) => { 
                    event.stopPropagation()
                    setActiveColorPicker((c) => (c === "bg" ? null : "bg")) 
                  }} 
                  className="w-[44px] h-[44px] border-4 border-gray-200 rounded-full cursor-pointer shadow-md focus:outline-none focus:ring-4 focus:ring-[#FF7A2F]/50 transition-transform active:scale-90" 
                  style={{ backgroundColor: settings.captionBgColor }} 
                  aria-label="Pick caption background color" 
                />
                {activeColorPicker === "bg" && (
                  <ColorPickerPopup 
                    isDark={isDark} 
                    accent="orange" 
                    initialColor={settings.captionBgColor} 
                    onColorChange={(color) => persistSettings({ captionBgColor: color })} 
                    onClose={() => setActiveColorPicker(null)} 
                  />
                )}
              </div>
            </div>
          </div>

          {/* Output device */}
          <div className="flex items-center justify-between min-h-[48px]">
            <span className={`text-[17px] font-bold tracking-wide ${labelColor}`}>Output Device</span>
            <div className="relative w-[220px]">
              <select 
                value={settings.outputDevice} 
                onChange={(e) => persistSettings({ outputDevice: e.target.value })} 
                aria-label="Select output device"
                className={`appearance-none w-full border-2 ${inputBorder} ${textColor} ${inputBg} h-[48px] pl-4 pr-10 rounded-xl text-[14px] font-medium focus:outline-none focus:border-[#FF7A2F] focus:ring-4 focus:ring-[#FF7A2F]/30 cursor-pointer shadow-sm transition-all`}
              >
                <option value="default">Default - Speaker</option>
                {outputDevices.map((d, i) => (
                  <option key={d.deviceId || `out-${i}`} value={d.deviceId}>
                    {d.label || `Speaker ${i + 1}`}
                  </option>
                ))}
              </select>
              <div className={`pointer-events-none absolute inset-y-0 right-4 flex items-center ${secondaryText}`}>
                <svg className="fill-current h-5 w-5" viewBox="0 0 20 20">
                  <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
                </svg>
              </div>
            </div>
          </div>

        </div>

        <div className="mt-10 flex justify-center">
          <button 
            onClick={() => { 
              chrome.storage.local.set({ sensa_auditory_settings: DEFAULT_SETTINGS })
              setSettings(DEFAULT_SETTINGS)
              setFontInput(DEFAULT_SETTINGS.fontFamily)
            }} 
            className="bg-[#FF7A2F] hover:bg-[#E86A25] text-white font-bold h-[48px] px-12 rounded-full transition-colors shadow-lg shadow-[#FF7A2F]/30 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF7A2F]/50 text-[16px] tracking-wide"
          >
            Reset to default
          </button>
        </div>
      </div>
    </div>
  )
}