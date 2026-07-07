/**
 * @file CaptionLanguageOverlay.tsx
 * @description Interactive modal overlay for selecting source audio language (Deepgram Nova-3) and target translation language (DeepL).
 *
 * Architectural Overview:
 * 1. Internationalization Support:
 *    - Exports `SOURCE_LANGUAGE_OPTIONS` supporting 45+ languages transcribed via Deepgram's Nova-3 AI model.
 *    - Exports `LANGUAGE_OPTIONS` supporting 120+ translation target locales powered by DeepL API.
 *
 * 2. User Experience & Navigation:
 *    - Provides real-time search filtering across language codes and full names.
 *    - Persists selections to Chrome local storage (`sensa_caption_language` / `sensa_source_language`) and supports draggable viewport positioning.
 */

import React, { useEffect, useMemo, useRef, useState } from "react"

interface CaptionLanguageOverlayProps {
  isDark: boolean
  onClose: () => void
  initialLanguage?: string
  onLanguageChange?: (language: string) => void
}

// All DeepL languages (123 total) sorted by global popularity
const LANGUAGE_OPTIONS = [
  // Top tier: most widely spoken globally
  { code: "EN-US", label: "English (American)" },
  { code: "EN-GB", label: "English (British)" },
  { code: "ES", label: "Spanish" },
  { code: "ES-419", label: "Spanish (Latin American)" },
  { code: "ZH-HANS", label: "Chinese (Simplified)" },
  { code: "ZH-HANT", label: "Chinese (Traditional)" },
  { code: "HI", label: "Hindi" },
  { code: "AR", label: "Arabic" },
  { code: "FR", label: "French" },
  { code: "FR-CA", label: "French (Canadian)" },
  { code: "PT-BR", label: "Portuguese (Brazilian)" },
  { code: "PT-PT", label: "Portuguese (European)" },
  { code: "RU", label: "Russian" },
  { code: "JA", label: "Japanese" },
  { code: "DE", label: "German" },
  { code: "DE-CH", label: "German (Swiss)" },
  { code: "BN", label: "Bengali" },
  { code: "KO", label: "Korean" },
  { code: "IT", label: "Italian" },
  { code: "ID", label: "Indonesian" },
  { code: "TR", label: "Turkish" },
  { code: "VI", label: "Vietnamese" },
  { code: "PA", label: "Punjabi" },
  { code: "TA", label: "Tamil" },
  { code: "TE", label: "Telugu" },
  { code: "MR", label: "Marathi" },
  { code: "GU", label: "Gujarati" },
  { code: "ML", label: "Malayalam" },
  // Second tier: regional & moderately widespread
  { code: "TH", label: "Thai" },
  { code: "NL", label: "Dutch" },
  { code: "EL", label: "Greek" },
  { code: "PL", label: "Polish" },
  { code: "UK", label: "Ukrainian" },
  { code: "CS", label: "Czech" },
  { code: "SV", label: "Swedish" },
  { code: "NB", label: "Norwegian Bokmål" },
  { code: "FI", label: "Finnish" },
  { code: "DA", label: "Danish" },
  { code: "HU", label: "Hungarian" },
  { code: "RO", label: "Romanian" },
  { code: "BG", label: "Bulgarian" },
  { code: "SK", label: "Slovak" },
  { code: "SL", label: "Slovenian" },
  { code: "HR", label: "Croatian" },
  { code: "SR", label: "Serbian" },
  { code: "HE", label: "Hebrew" },
  { code: "FA", label: "Persian" },
  { code: "KA", label: "Georgian" },
  // Third tier: less common but supported
  { code: "KK", label: "Kazakh" },
  { code: "UZ", label: "Uzbek" },
  { code: "AZ", label: "Azerbaijani" },
  { code: "MS", label: "Malay" },
  { code: "TL", label: "Tagalog (Filipino)" },
  { code: "JV", label: "Javanese" },
  { code: "SW", label: "Swahili" },
  { code: "MY", label: "Burmese" },
  { code: "KMR", label: "Kurdish (Kurmanji)" },
  { code: "CKB", label: "Kurdish (Sorani)" },
  { code: "KY", label: "Kyrgyz" },
  { code: "TK", label: "Turkmen" },
  { code: "TG", label: "Tajik" },
  { code: "MN", label: "Mongolian" },
  { code: "LV", label: "Latvian" },
  { code: "LT", label: "Lithuanian" },
  { code: "ET", label: "Estonian" },
  { code: "MK", label: "Macedonian" },
  { code: "BE", label: "Belarusian" },
  { code: "HY", label: "Armenian" },
  { code: "UR", label: "Urdu" },
  { code: "AS", label: "Assamese" },
  { code: "BHO", label: "Bhojpuri" },
  { code: "GOM", label: "Konkani" },
  { code: "MAI", label: "Maithili" },
  { code: "IS", label: "Icelandic" },
  { code: "CA", label: "Catalan" },
  { code: "GL", label: "Galician" },
  { code: "EU", label: "Basque" },
  { code: "AF", label: "Afrikaans" },
  { code: "LB", label: "Luxembourgish" },
  { code: "GA", label: "Irish" },
  { code: "CY", label: "Welsh" },
  { code: "OC", label: "Occitan" },
  { code: "BR", label: "Breton" },
  { code: "LMO", label: "Lombard" },
  { code: "SCN", label: "Sicilian" },
  { code: "SU", label: "Sundanese" },
  { code: "CEB", label: "Cebuano" },
  { code: "PAM", label: "Kapampangan" },
  { code: "PAG", label: "Pangasinan" },
  { code: "ACE", label: "Acehnese" },
  // Rare/specialized languages
  { code: "BA", label: "Bashkir" },
  { code: "SQ", label: "Albanian" },
  { code: "AN", label: "Aragonese" },
  { code: "AY", label: "Aymara" },
  { code: "BS", label: "Bosnian" },
  { code: "YUE", label: "Cantonese" },
  { code: "LA", label: "Latin" },
  { code: "EO", label: "Esperanto" },
  { code: "GN", label: "Guarani" },
  { code: "HT", label: "Haitian Creole" },
  { code: "HA", label: "Hausa" },
  { code: "IG", label: "Igbo" },
  { code: "MG", label: "Malagasy" },
  { code: "MT", label: "Maltese" },
  { code: "MI", label: "Maori" },
  { code: "NE", label: "Nepali" },
  { code: "OM", label: "Oromo" },
  { code: "PS", label: "Pashto" },
  { code: "QU", label: "Quechua" },
  { code: "SA", label: "Sanskrit" },
  { code: "ST", label: "Sesotho" },
  { code: "TS", label: "Tsonga" },
  { code: "TN", label: "Tswana" },
  { code: "WO", label: "Wolof" },
  { code: "XH", label: "Xhosa" },
  { code: "YI", label: "Yiddish" },
  { code: "ZU", label: "Zulu" },
  { code: "LN", label: "Lingala" },
  { code: "PRS", label: "Dari" }
]

// Deepgram Nova-2 supported speech recognition languages
export const SOURCE_LANGUAGE_OPTIONS = [
  { code: "en", label: "English" },
  { code: "ko", label: "Korean" },
  { code: "ja", label: "Japanese" },
  { code: "zh", label: "Chinese" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "ru", label: "Russian" },
  { code: "it", label: "Italian" },
  { code: "hi", label: "Hindi" },
  { code: "nl", label: "Dutch" },
  { code: "tr", label: "Turkish" },
  { code: "id", label: "Indonesian" },
  { code: "vi", label: "Vietnamese" },
  { code: "th", label: "Thai" },
  { code: "pl", label: "Polish" },
  { code: "uk", label: "Ukrainian" },
  { code: "sv", label: "Swedish" },
  { code: "no", label: "Norwegian" },
  { code: "da", label: "Danish" },
  { code: "fi", label: "Finnish" },
  { code: "cs", label: "Czech" },
  { code: "ro", label: "Romanian" },
  { code: "el", label: "Greek" },
  { code: "hu", label: "Hungarian" },
  { code: "ar", label: "Arabic" },
  { code: "he", label: "Hebrew" },
  { code: "ms", label: "Malay" },
  { code: "tl", label: "Tagalog (Filipino)" }
]

interface CaptionLanguageOverlayProps {
  isDark: boolean
  onClose: () => void
  initialLanguage?: string
  initialSourceLanguage?: string
  onLanguageChange?: (language: string) => void
  onSourceLanguageChange?: (language: string) => void
}

export default function CaptionLanguageOverlay({
  isDark,
  onClose,
  initialLanguage = "EN-US",
  initialSourceLanguage = "en",
  onLanguageChange,
  onSourceLanguageChange
}: CaptionLanguageOverlayProps) {
  const [activeTab, setActiveTab] = useState<"target" | "source">("source")
  const [selectedLanguage, setSelectedLanguage] = useState(initialLanguage)
  const [selectedSourceLanguage, setSelectedSourceLanguage] = useState(initialSourceLanguage)
  const [searchTerm, setSearchTerm] = useState("")

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

  useEffect(() => {
    setSelectedLanguage(initialLanguage)
  }, [initialLanguage])

  useEffect(() => {
    setSelectedSourceLanguage(initialSourceLanguage)
  }, [initialSourceLanguage])

  useEffect(() => {
    offsetRef.current = offset
  }, [offset])

  useEffect(() => {
    chrome.storage.local.get(["sensa_caption_language_overlay_offset", "sensa_source_lang", "sensa_target_lang", "sensa_auditory_caption_language"], (result) => {
      if (result.sensa_caption_language_overlay_offset) {
        setOffset(result.sensa_caption_language_overlay_offset)
      }
      if (result.sensa_source_lang && typeof result.sensa_source_lang === "string" && result.sensa_source_lang !== "AUTO") {
        setSelectedSourceLanguage(result.sensa_source_lang)
      }
      if (result.sensa_target_lang && typeof result.sensa_target_lang === "string") {
        setSelectedLanguage(result.sensa_target_lang)
      } else if (result.sensa_auditory_caption_language && typeof result.sensa_auditory_caption_language === "string") {
        setSelectedLanguage(result.sensa_auditory_caption_language)
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

  const currentOptions = activeTab === "target" ? LANGUAGE_OPTIONS : SOURCE_LANGUAGE_OPTIONS
  const currentSelected = activeTab === "target" ? selectedLanguage : selectedSourceLanguage

  const filteredLanguages = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase()
    if (!needle) return currentOptions
    return currentOptions.filter((item) => {
      return item.label.toLowerCase().includes(needle) || item.code.toLowerCase().includes(needle)
    })
  }, [searchTerm, currentOptions])

  const activeLabel = useMemo(() => {
    const match = currentOptions.find((item) => item.code === currentSelected)
    return match?.label ?? currentSelected
  }, [currentSelected, currentOptions])

  const saveAndApply = (newTarget: string, newSource: string) => {
    chrome.storage.local.set({ 
      sensa_source_lang: newSource, 
      sensa_target_lang: newTarget, 
      sensa_auditory_caption_language: newTarget 
    })
    try {
      const tgt = (newTarget.split("-")[0] || newTarget).toUpperCase()
      chrome.runtime.sendMessage({ type: "UPDATE_CAPTION_LANGUAGE", targetLang: tgt })
    } catch (e) {}
    try {
      chrome.runtime.sendMessage({ type: "UPDATE_SOURCE_LANGUAGE", sourceLang: newSource })
    } catch (e) {}
    onLanguageChange?.(newTarget)
    onSourceLanguageChange?.(newSource)
  }

  const isBackdropMouseDownRef = useRef(false)
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && isBackdropMouseDownRef.current) {
      isBackdropMouseDownRef.current = false
      saveAndApply(selectedLanguage, selectedSourceLanguage)
      setIsMounted(false)
      setTimeout(onClose, 300)
    }
  }

  // 🚨 High Contrast Theme Variables
  const modalBg = isDark ? "bg-[#17171A]" : "bg-white"
  const textColor = isDark ? "text-white" : "text-gray-950"
  const secondaryText = isDark ? "text-gray-400" : "text-gray-500"
  const inputBg = isDark ? "bg-[#2C2C2E]" : "bg-gray-100"
  const inputBorder = isDark ? "border-gray-700" : "border-gray-200"

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
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
      className={`fixed inset-0 z-[999999] flex items-center justify-center bg-black/60 backdrop-blur-md font-sans px-4 transition-opacity duration-300 ${isMounted ? 'opacity-100' : 'opacity-0'}`}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`relative w-full max-w-[480px] ${modalBg} rounded-[32px] border ${isDark ? "border-white/10" : "border-black/5"} p-8 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.35),_0_0_2px_rgba(255,255,255,0.15)_inset] transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${isMounted ? 'scale-100 translate-y-0' : 'scale-[0.95] translate-y-4'}`}
        onMouseDown={onHeaderMouseDown}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${isMounted ? 1 : 0.95})`,
          cursor: draggingRef.current ? "grabbing" : "grab",
          visibility: initialOffsetLoaded ? "visible" : "hidden"
        }}
      >
        {/* Visual Drag Handle */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 rounded-full bg-gray-400/30 pointer-events-none" />

        {/* Flex Header matching AuditorySettingsModal */}
        <div className="flex items-start justify-between gap-4 mb-5 mt-1">
          <div>
            <h2 className="text-[26px] font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-[#FF7A2F] to-[#FF9F0A]">
              Language Settings
            </h2>
            <p className={`mt-1.5 text-[13px] leading-relaxed max-w-[28rem] ${secondaryText}`}>
              {activeTab === "source" ? "Spoken language detected in the video/audio:" : "Language for translation subtitles:"}{" "}
              <span className={`${textColor} font-bold`}>{activeLabel}</span>
            </p>
          </div>
          <button
            onClick={() => {
              saveAndApply(selectedLanguage, selectedSourceLanguage)
              setIsMounted(false)
              setTimeout(onClose, 300)
            }}
            className={`shrink-0 bg-transparent hover:bg-black/5 dark:hover:bg-white/10 text-gray-400 hover:${textColor} transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A2F]/50 rounded-full p-2`}
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Simple & Premium Tab Switcher with Smooth Auditory/Visual Mode Spring Effects */}
        <div className={`relative mb-5 flex rounded-xl p-1 border ${isDark ? "bg-[#1C1C1E] border-white/10" : "bg-gray-100 border-gray-200/80"}`}>
          {/* Sliding Pill Indicator with 500ms Spring Curve */}
          <div
            className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg bg-[#FF7A2F] shadow-md transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"
            style={{
              left: activeTab === "source" ? "4px" : "calc(50%)"
            }}
          />

          <button
            type="button"
            onClick={() => { setActiveTab("source"); setSearchTerm(""); }}
            className={`relative z-10 flex-1 py-2 text-[13.5px] font-semibold rounded-lg transform-gpu transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] flex items-center justify-center gap-2 focus-visible:outline-none active:scale-[0.93] hover:scale-[1.02] ${
              activeTab === "source" ? "text-white" : `text-gray-400 hover:${textColor}`
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
            <span>Spoken Language</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("target"); setSearchTerm(""); }}
            className={`relative z-10 flex-1 py-2 text-[13.5px] font-semibold rounded-lg transform-gpu transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] flex items-center justify-center gap-2 focus-visible:outline-none active:scale-[0.93] hover:scale-[1.02] ${
              activeTab === "target" ? "text-white" : `text-gray-400 hover:${textColor}`
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" x2="22" y1="12" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
            <span>Translate To</span>
          </button>
        </div>

        {/* Simple & Premium Search Input */}
        <div className="relative mb-4">
          <div className="absolute inset-y-0 left-3.5 flex items-center pointer-events-none text-gray-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            onKeyUp={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            placeholder={activeTab === "source" ? "Search source audio language..." : "Search translation language..."}
            className={`w-full ${isDark ? "bg-[#242426] border-white/10 text-white placeholder:text-gray-500" : "bg-gray-100/80 border-gray-200 text-gray-900 placeholder:text-gray-400"} border rounded-xl text-[13.5px] font-medium h-11 pl-10 pr-9 focus:outline-none focus:border-[#FF7A2F] focus:ring-2 focus:ring-[#FF7A2F]/20 transition-all`}
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              onMouseDown={(e) => e.preventDefault()}
              className={`absolute inset-y-0 right-2.5 my-auto h-6 w-6 flex items-center justify-center rounded-full transition-colors ${
                isDark ? "hover:bg-white/10 text-gray-400 hover:text-white" : "hover:bg-gray-200 text-gray-500 hover:text-gray-900"
              } focus-visible:outline-none`}
              aria-label="Clear search"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* 🚨 Scrollable List Container (Height increased to max-h-[340px] to match AuditorySettingsModal) */}
        <div className={`border rounded-2xl overflow-hidden shadow-inner ${isDark ? "border-white/10 bg-[#141416]" : "border-gray-200 bg-gray-50/50"}`}>
          <div className="max-h-[340px] overflow-y-auto custom-scrollbar">
            {filteredLanguages.map((language) => {
              const isSelected = language.code === currentSelected
              return (
                <button
                  key={language.code}
                  type="button"
                  onClick={() => {
                    if (activeTab === "target") {
                      setSelectedLanguage(language.code)
                      saveAndApply(language.code, selectedSourceLanguage)
                    } else {
                      setSelectedSourceLanguage(language.code)
                      saveAndApply(selectedLanguage, language.code)
                    }
                  }}
                  aria-selected={isSelected}
                  className={`w-full text-left min-h-[48px] px-5 py-3 transition-all flex items-center justify-between border-b last:border-0 ${isDark ? "border-white/5" : "border-gray-200/60"} focus-visible:outline-none focus-visible:bg-[#FF7A2F]/20 ${
                    isSelected
                      ? "bg-gradient-to-r from-[#FF7A2F] to-[#FF9F0A] text-white font-bold shadow-md"
                      : isDark
                        ? "text-gray-200 hover:bg-white/5 hover:text-white hover:pl-6"
                        : "text-gray-800 hover:bg-[#FF7A2F]/10 hover:text-[#FF7A2F] hover:pl-6"
                  }`}
                >
                  <span className="font-semibold text-[15px]">{language.label}</span>
                  {isSelected && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-white">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              )
            })}

            {filteredLanguages.length === 0 && (
              <div className={`px-4 py-14 text-center text-[15px] font-medium ${secondaryText}`}>
                No languages found.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}