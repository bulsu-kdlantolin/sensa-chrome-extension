import React, { useEffect, useMemo, useRef, useState } from "react"

interface CaptionLanguageOverlayProps {
    isDark: boolean
    onClose: () => void
    initialLanguage?: string
    onLanguageChange?: (language: string) => void
}

// All major DeepL languages mapped to exact API codes
const LANGUAGE_OPTIONS = [
    { code: "AR", label: "Arabic" },
    { code: "BG", label: "Bulgarian" },
    { code: "CS", label: "Czech" },
    { code: "DA", label: "Danish" },
    { code: "DE", label: "German" },
    { code: "EL", label: "Greek" },
    { code: "EN-US", label: "English (US)" },
    { code: "EN-GB", label: "English (UK)" },
    { code: "ES", label: "Spanish" },
    { code: "FI", label: "Finnish" },
    { code: "FR", label: "French" },
    { code: "HI", label: "Hindi" },
    { code: "HU", label: "Hungarian" },
    { code: "ID", label: "Indonesian" },
    { code: "IT", label: "Italian" },
    { code: "JA", label: "Japanese" },
    { code: "KO", label: "Korean" },
    { code: "NL", label: "Dutch" },
    { code: "PL", label: "Polish" },
    { code: "PT-BR", label: "Portuguese (Brazil)" },
    { code: "PT-PT", label: "Portuguese (Europe)" },
    { code: "RO", label: "Romanian" },
    { code: "RU", label: "Russian" },
    { code: "SK", label: "Slovak" },
    { code: "SV", label: "Swedish" },
    { code: "TL", label: "Tagalog (Filipino)" },
    { code: "TR", label: "Turkish" },
    { code: "UK", label: "Ukrainian" },
    { code: "ZH", label: "Chinese (Simplified)" }
]

export default function CaptionLanguageOverlay({
    isDark,
    onClose,
    initialLanguage = "EN-US",
    onLanguageChange
}: CaptionLanguageOverlayProps) {
    const [selectedLanguage, setSelectedLanguage] = useState(initialLanguage)
    const [searchTerm, setSearchTerm] = useState("")

    // Draggable/persisted position
    const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
    const [initialOffsetLoaded, setInitialOffsetLoaded] = useState(false)
    const offsetRef = useRef(offset)
    const draggingRef = useRef(false)
    const dragStartRef = useRef({ x: 0, y: 0 })
    const offsetStartRef = useRef({ x: 0, y: 0 })

    useEffect(() => {
        setSelectedLanguage(initialLanguage)
    }, [initialLanguage])

    useEffect(() => {
        offsetRef.current = offset
    }, [offset])

    useEffect(() => {
        chrome.storage.local.get(["sensa_caption_language_overlay_offset"], (result) => {
            if (result.sensa_caption_language_overlay_offset) {
                setOffset(result.sensa_caption_language_overlay_offset)
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
            chrome.storage.local.set({ sensa_caption_language_overlay_offset: offsetRef.current })
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

    const filteredLanguages = useMemo(() => {
        const needle = searchTerm.trim().toLowerCase()
        if (!needle) return LANGUAGE_OPTIONS
        return LANGUAGE_OPTIONS.filter((item) => {
            return item.label.toLowerCase().includes(needle) || item.code.toLowerCase().includes(needle)
        })
    }, [searchTerm])

    const activeLabel = useMemo(() => {
        const match = LANGUAGE_OPTIONS.find((item) => item.code === selectedLanguage)
        return match?.label ?? selectedLanguage
    }, [selectedLanguage])

    const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) onClose()
    }

    const panelClass = isDark
        ? "bg-gray-950 text-gray-100 border-[#FF7A2F]"
        : "bg-white text-black border-[#FF7A2F]"
    const inputClass = isDark
        ? "bg-gray-900 border-gray-700 text-gray-100 placeholder:text-gray-500"
        : "bg-white border-gray-300 text-gray-800 placeholder:text-gray-400"

    return (
        <div onClick={handleBackdropClick} className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/45 backdrop-blur-sm font-sans px-[16px]">
            <div
                className={`relative w-full max-w-[420px] rounded-[34px] border-[3px] p-[28px] shadow-2xl ${panelClass}`}
                onMouseDown={onHeaderMouseDown}
                style={{ transform: `translate(${offset.x}px, ${offset.y}px)`, cursor: "grab", visibility: initialOffsetLoaded ? "visible" : "hidden" }}
            >
                <h2 className="text-[28px] font-bold mb-[10px] tracking-tight">Caption Language</h2>
                <p className={`text-[14px] mb-[20px] ${isDark ? "text-gray-400" : "text-gray-500"}`}>Current: {activeLabel}</p>

                <button
                    onClick={onClose}
                    className={`absolute top-[24px] right-[24px] transition-colors focus:outline-none ${isDark ? "text-gray-100 hover:text-gray-300" : "text-black hover:text-gray-500"}`}
                >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-[28px] h-[28px]">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>

                <div className="mb-[16px]">
                    <input
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder="Search language"
                        className={`w-full border rounded-[14px] text-[14px] px-[14px] py-[10px] focus:outline-none focus:ring-2 focus:ring-[#FF7A2F] ${inputClass}`}
                    />
                </div>

                <div className={`border rounded-2xl overflow-hidden ${isDark ? "border-gray-800" : "border-gray-200"}`}>
                    <div className="max-h-[240px] overflow-y-auto">
                        {filteredLanguages.map((language) => {
                            const isSelected = language.code === selectedLanguage
                            return (
                                <button
                                    key={language.code}
                                    type="button"
                                    onClick={() => setSelectedLanguage(language.code)}
                                    className={`w-full text-left px-[16px] py-[14px] transition-colors flex items-center justify-between ${
                                        isSelected
                                            ? "bg-[#FF7A2F] text-white"
                                            : isDark
                                                ? "bg-gray-900 text-gray-200 hover:bg-gray-800"
                                                : "bg-white text-gray-800 hover:bg-orange-50"
                                    }`}
                                >
                                    <span className="font-medium text-[14px]">{language.label}</span>
                                    <span className={`text-[11px] ${isSelected ? "text-white/90" : isDark ? "text-gray-400" : "text-gray-500"}`}>{language.code}</span>
                                </button>
                            )
                        })}

                        {filteredLanguages.length === 0 && (
                            <div className={`px-[16px] py-[32px] text-center text-[14px] ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                                No language found.
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-[28px] flex justify-end gap-[12px]">
                    <button
                        onClick={onClose}
                        className={`px-[16px] py-[10px] rounded-full border text-[14px] font-semibold transition-colors ${isDark ? "border-gray-700 text-gray-300 hover:bg-gray-800" : "border-gray-300 text-gray-700 hover:bg-gray-100"}`}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            onLanguageChange?.(selectedLanguage)
                            onClose()
                        }}
                        className="px-[20px] py-[10px] rounded-full bg-[#FF7A2F] text-[14px] font-semibold text-white hover:bg-[#F26A1B] transition-colors"
                    >
                        Apply
                    </button>
                </div>
            </div>
        </div>
    )
}