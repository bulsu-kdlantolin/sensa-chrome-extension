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
                            // Downloads the top 100 most popular, highly legible fonts in the world
                            setGoogleFonts(data.items.slice(0, 100).map((it: any) => ({ family: it.family })))
                            return
                        }
                    }
                }

                chrome.runtime.sendMessage({ type: "FETCH_GOOGLE_FONTS" }, (response) => {
                    if (!cancelled && response?.ok && Array.isArray(response.items)) {
                        // Downloads the top 100 most popular, highly legible fonts in the world
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
    
    // Only draw the top 100 matches to match the loaded Google Fonts cap.
    const renderedFonts = filteredFonts.slice(0, 100)

    // Clean execution of font selection
    const handleFontSelect = (family: string) => {
        setFontSearch("")
        setFontInput(family)
        setFontDropdownOpen(false)
        loadGoogleFont(family)
        persistSettings({ fontFamily: family })
    }

    // Preload the fonts that are currently visible in the dropdown so their
    // labels render in the actual font, not the fallback font.
    useEffect(() => {
        if (!fontDropdownOpen) return
        renderedFonts.forEach((font) => loadGoogleFont(font.family))
    }, [fontDropdownOpen, renderedFonts])

    // Close the dropdown when clicking outside
    useEffect(() => {
        const onGlobalClick = (event: MouseEvent) => {
            if (!fontPickerRef.current?.contains(event.target as Node)) {
                if (fontDropdownOpen) {
                    setFontInput(settings.fontFamily) // Revert to safe saved font
                    setFontSearch("")
                    setFontDropdownOpen(false)
                }
            }
        }

        document.addEventListener("mousedown", onGlobalClick)
        return () => document.removeEventListener("mousedown", onGlobalClick)
    }, [fontDropdownOpen, settings.fontFamily])

    // Draggable/persisted position
    const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
    const [initialOffsetLoaded, setInitialOffsetLoaded] = useState(false)
    const offsetRef = useRef(offset)
    const draggingRef = useRef(false)
    const dragStartRef = useRef({ x: 0, y: 0 })
    const offsetStartRef = useRef({ x: 0, y: 0 })

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

    const panelClass = isDark ? "bg-gray-950 text-gray-100 border-[#FF7A2F]" : "bg-white text-black border-[#FF7A2F]"
    const fieldClass = isDark ? "bg-gray-900 border-gray-700 text-gray-100" : "bg-white border-gray-300 text-gray-800"
    const selectChevronClass = isDark ? "text-gray-400" : "text-gray-500"

    return (
        <div onClick={(e) => e.target === e.currentTarget && onClose()} className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/45 backdrop-blur-sm font-sans px-[16px]">
            <div
                className={`relative w-full max-w-[420px] rounded-[34px] border-[3px] p-[28px] shadow-2xl ${panelClass}`}
                onMouseDown={onHeaderMouseDown}
                style={{ transform: `translate(${offset.x}px, ${offset.y}px)`, cursor: "grab", visibility: initialOffsetLoaded ? "visible" : "hidden" }}
            >
                <h2 className="text-[28px] font-bold mb-[28px] tracking-tight">Settings</h2>

                <button onClick={onClose} className={`absolute top-[24px] right-[24px] transition-colors focus:outline-none ${isDark ? "text-gray-100 hover:text-gray-300" : "text-black hover:text-gray-500"}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-[28px] h-[28px]">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>

                <div className="flex flex-col gap-[20px]">
                    {/* Font picker */}
                    <div className="flex items-center justify-between gap-[16px]">
                        <span className="text-[17px] font-medium">Font</span>
                        <div ref={fontPickerRef} className="relative w-[150px]">
                            <input
                                value={fontDropdownOpen ? fontSearch : fontInput}
                                placeholder={fontDropdownOpen ? fontInput : "Search..."}
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
                                className={`w-full border rounded-xl text-[14px] px-[12px] py-[8px] pr-[40px] focus:outline-none focus:ring-2 focus:ring-[#FF7A2F] ${fieldClass}`}
                            />
                            <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()} 
                                onClick={(e) => {
                                    e.preventDefault()
                                    setFontDropdownOpen((open) => !open)
                                    if (!fontDropdownOpen) setFontSearch("")
                                }}
                                className={`absolute inset-y-0 right-[10px] flex items-center text-gray-500 transition-transform duration-200 ${fontDropdownOpen ? "rotate-180" : ""} ${isDark ? "text-gray-400" : "text-gray-500"}`}
                                aria-label="Toggle font list"
                            >
                                <svg className="fill-current h-[16px] w-[16px]" viewBox="0 0 20 20">
                                    <path d="M5.23 7.21L10 11.98l4.77-4.77 1.06 1.06L10 14.11 4.17 8.27z" />
                                </svg>
                            </button>
                            
                            {fontDropdownOpen && (
                                <div className={`absolute left-0 right-0 top-[calc(100%+8px)] z-[50] max-h-[280px] overflow-y-auto rounded-xl border shadow-xl ${fieldClass}`}>
                                    {renderedFonts.length > 0 ? (
                                        renderedFonts.map((font) => (
                                            <button
                                                key={font.family}
                                                type="button"
                                                // 🚨 THE FIX: Bind to onMouseDown to instantly trigger the selection
                                                // before the browser has time to drop the click event!
                                                onMouseDown={(e) => {
                                                    e.preventDefault() // Keeps the input from losing focus
                                                    handleFontSelect(font.family)
                                                }}
                                                className={`block w-full px-[12px] py-[10px] text-left text-[14px] border-b last:border-b-0 hover:bg-[#FF7A2F]/20 transition-colors ${isDark ? "border-gray-800" : "border-gray-100"}`}
                                                style={{ fontFamily: `${font.family}, system-ui, sans-serif` }}
                                            >
                                                {font.family}
                                            </button>
                                        ))
                                    ) : (
                                        <div className="px-[12px] py-[10px] text-sm text-gray-400 italic">No fonts found</div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Show original toggle */}
                    <div className="flex items-center justify-between gap-[16px]">
                        <span className="text-[17px] font-medium">Show Original Text</span>
                        <div className="w-[150px] flex justify-start pl-1">
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" className="sr-only peer" checked={settings.showOriginalText} onChange={(ev) => persistSettings({ showOriginalText: ev.target.checked })} />
                                <div className="w-[48px] h-[24px] bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:bg-[#FF7A2F] transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-gray-300 after:rounded-full after:h-[20px] after:w-[20px] after:transition-all peer-checked:after:translate-x-[26px]"></div>
                            </label>
                        </div>
                    </div>

                    {/* Text color */}
                    <div className="flex items-center justify-between gap-[16px]">
                        <span className="text-[17px] font-medium">Text Color</span>
                        <div className="w-[150px] flex justify-start pl-1 relative">
                            <div className="relative h-[32px] w-[32px] flex items-center justify-center">
                                <button type="button" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setActiveColorPicker((c) => (c === "text" ? null : "text")) }} className={`h-[32px] w-[32px] rounded-full border shadow-sm ${isDark ? "border-gray-500" : "border-black"}`} style={{ backgroundColor: settings.textColor }} aria-label="Pick text color" />
                                {activeColorPicker === "text" && (
                                    <ColorPickerPopup isDark={isDark} accent="orange" initialColor={settings.textColor} onColorChange={(color) => persistSettings({ textColor: color })} onClose={() => setActiveColorPicker(null)} />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Caption bg color */}
                    <div className="flex items-center justify-between gap-[16px]">
                        <span className="text-[17px] font-medium">Caption BG Color</span>
                        <div className="w-[150px] flex justify-start pl-1 relative">
                            <div className="relative h-[32px] w-[32px] flex items-center justify-center">
                                <button type="button" onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setActiveColorPicker((c) => (c === "bg" ? null : "bg")) }} className={`h-[32px] w-[32px] rounded-full border shadow-sm ${isDark ? "border-gray-500" : "border-black"}`} style={{ backgroundColor: settings.captionBgColor }} aria-label="Pick caption background color" />
                                {activeColorPicker === "bg" && (
                                    <ColorPickerPopup isDark={isDark} accent="orange" initialColor={settings.captionBgColor} onColorChange={(color) => persistSettings({ captionBgColor: color })} onClose={() => setActiveColorPicker(null)} />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Output device */}
                    <div className="flex items-center justify-between gap-[16px]">
                        <span className="text-[17px] font-medium">Output Device</span>
                        <div className="flex items-center gap-[8px]">
                            <div className="relative w-[150px]">
                                <select value={settings.outputDevice} onChange={(e) => persistSettings({ outputDevice: e.target.value })} className={`appearance-none w-full border rounded-xl text-[12px] px-[12px] py-[8px] pr-[40px] focus:outline-none focus:ring-2 focus:ring-[#FF7A2F] ${fieldClass}`}>
                                    <option value="default">Default - Speaker</option>
                                    {outputDevices.map((d, i) => (
                                        <option key={d.deviceId || `out-${i}`} value={d.deviceId}>{(d.label || `Output ${i + 1}`) + ` (${d.deviceId})`}</option>
                                    ))}
                                </select>
                                <div className={`pointer-events-none absolute inset-y-0 right-[12px] flex items-center ${selectChevronClass}`}>
                                    <svg className="fill-current h-[16px] w-[16px]" viewBox="0 0 20 20"><path d="M5.23 7.21L10 11.98l4.77-4.77 1.06 1.06L10 14.11 4.17 8.27z" /></svg>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>

                <div className="mt-[40px] flex justify-center">
                    <button onClick={() => { chrome.storage.local.set({ sensa_auditory_settings: DEFAULT_SETTINGS }); setSettings(DEFAULT_SETTINGS); setFontInput(DEFAULT_SETTINGS.fontFamily); }} className="bg-[#FF7A2F] hover:bg-[#F26A1B] text-white font-bold py-[12px] px-[32px] rounded-full transition-colors shadow-md text-[14px]">Reset to default</button>
                </div>
            </div>
        </div>
    )
}