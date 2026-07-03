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

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
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
      onClick={handleBackdropClick}
      onKeyDown={(e) => e.stopPropagation()}
      onKeyUp={(e) => e.stopPropagation()}
      className={`fixed inset-0 z-[999999] flex items-center justify-center bg-black/60 backdrop-blur-md font-sans px-4 transition-opacity duration-300 ${isMounted ? 'opacity-100' : 'opacity-0'}`}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`relative w-full max-w-[480px] ${modalBg} rounded-[26px] border ${isDark ? "border-white/10" : "border-black/5"} p-6 shadow-[0_24px_60px_rgba(0,0,0,0.40)] transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${isMounted ? 'scale-100 translate-y-0' : 'scale-95 translate-y-6'}`}
        onMouseDown={onHeaderMouseDown}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${isMounted ? 1 : 0.95})`,
          cursor: draggingRef.current ? "grabbing" : "grab",
          visibility: initialOffsetLoaded ? "visible" : "hidden"
        }}
      >
        {/* Visual Drag Handle */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 rounded-full bg-gray-400/30 pointer-events-none" />

        <h2 className="mt-1 text-[24px] leading-tight font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-[#FF7A2F] to-[#FF9F0A]">Language Settings</h2>
        
        {/* Animated Tab Switcher */}
        <div className={`relative mt-4 mb-4 flex rounded-xl p-1 border shadow-inner ${isDark ? "bg-[#1C1C20] border-white/10" : "bg-gray-100/90 border-gray-200"}`}>
          {/* Animated Sliding Pill Indicator */}
          <div
            className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-lg bg-gradient-to-r from-[#FF7A2F] to-[#FF9F0A] shadow-[0_2px_8px_rgba(255,122,47,0.35)] transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
            style={{
              left: activeTab === "source" ? "4px" : "calc(50%)"
            }}
          />

          <button
            type="button"
            onClick={() => { setActiveTab("source"); setSearchTerm(""); }}
            className={`relative z-10 flex-1 py-2 text-[14px] font-bold rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 focus-visible:outline-none active:scale-[0.98] ${
              activeTab === "source" ? "text-white" : `text-gray-400 hover:${textColor}`
            }`}
          >
            <span className="text-[15px] transition-transform duration-300 hover:scale-110">🎙️</span>
            <span>Source Audio</span>
          </button>

          <button
            type="button"
            onClick={() => { setActiveTab("target"); setSearchTerm(""); }}
            className={`relative z-10 flex-1 py-2 text-[14px] font-bold rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 focus-visible:outline-none active:scale-[0.98] ${
              activeTab === "target" ? "text-white" : `text-gray-400 hover:${textColor}`
            }`}
          >
            <span className="text-[15px] transition-transform duration-300 hover:scale-110">🌐</span>
            <span>Translate To</span>
          </button>
        </div>

        <p className={`text-[13px] leading-relaxed mb-5 transition-all duration-200 ${secondaryText}`}>
          {activeTab === "source" ? "Spoken language detected in the video/audio:" : "Language for translation subtitles:"}{" "}
          <span className={`${textColor} font-bold`}>{activeLabel}</span>
        </p>

        <button
          onClick={() => {
            setIsMounted(false)
            setTimeout(onClose, 300)
          }}
          className={`absolute top-6 right-6 bg-transparent hover:bg-black/5 dark:hover:bg-white/10 text-gray-400 hover:${textColor} transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A2F]/50 rounded-full p-2`}
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* 🚨 God-Tier Search Input */}
        <div className="relative mb-5">
          <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none text-gray-400">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
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
            placeholder={activeTab === "source" ? "Search 30 speech audio languages..." : "Search 123 translation languages..."}
            className={`w-full ${inputBg} border-2 ${inputBorder} ${textColor} rounded-[16px] text-[15px] font-medium h-[46px] pl-12 pr-4 focus:outline-none focus:border-[#FF7A2F] focus:ring-4 focus:ring-[#FF7A2F]/20 transition-all placeholder:text-gray-500`}
          />
        </div>

        {/* 🚨 Scrollable List Container */}
        <div className={`border-2 rounded-[20px] overflow-hidden ${isDark ? "border-gray-800 bg-[#151515]" : "border-gray-200 bg-gray-50"}`}>
          <div className="max-h-[250px] overflow-y-auto custom-scrollbar">
            {filteredLanguages.map((language) => {
              const isSelected = language.code === currentSelected
              return (
                <button
                  key={language.code}
                  type="button"
                  onClick={() => {
                    if (activeTab === "target") {
                      setSelectedLanguage(language.code)
                    } else {
                      setSelectedSourceLanguage(language.code)
                    }
                  }}
                  aria-selected={isSelected}
                  className={`w-full text-left min-h-[46px] px-5 py-2.5 transition-colors flex items-center justify-between border-b last:border-0 ${isDark ? "border-gray-800" : "border-gray-200"} focus-visible:outline-none focus-visible:bg-[#FF7A2F]/20 ${
                    isSelected
                      ? "bg-[#FF7A2F] text-white"
                      : isDark
                        ? "text-gray-200 hover:bg-white/5"
                        : "text-gray-800 hover:bg-[#FF7A2F]/10"
                  }`}
                >
                  <span className="font-bold text-[15px]">{language.label}</span>
                </button>
              )
            })}

            {filteredLanguages.length === 0 && (
              <div className={`px-4 py-12 text-center text-[15px] font-bold ${secondaryText}`}>
                No languages found.
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex justify-end gap-3.5">
          <button
            onClick={() => {
              setIsMounted(false)
              setTimeout(onClose, 300)
            }}
            className={`px-5 py-2.5 rounded-full border-2 ${isDark ? 'border-white/10 hover:bg-white/10 hover:border-white/20 text-white' : 'border-gray-300 hover:bg-gray-100 hover:border-gray-400 text-gray-800'} text-[14px] font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-gray-400 active:scale-95 hover:-translate-y-0.5`}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              // Persist source and target languages
              chrome.storage.local.set({ 
                sensa_source_lang: selectedSourceLanguage, 
                sensa_target_lang: selectedLanguage, 
                sensa_auditory_caption_language: selectedLanguage 
              })
              // Inform background/offscreen immediately so live capture uses both new target and source languages
              try {
                const tgt = (selectedLanguage.split("-")[0] || selectedLanguage).toUpperCase()
                chrome.runtime.sendMessage({ type: "UPDATE_CAPTION_LANGUAGE", targetLang: tgt })
              } catch (e) {}
              try {
                chrome.runtime.sendMessage({ type: "UPDATE_SOURCE_LANGUAGE", sourceLang: selectedSourceLanguage })
              } catch (e) {}
              onLanguageChange?.(selectedLanguage)
              onSourceLanguageChange?.(selectedSourceLanguage)
              setIsMounted(false)
              setTimeout(onClose, 300)
            }}
            className="px-6 py-2.5 rounded-full bg-[#FF7A2F] text-[14px] font-bold text-white hover:bg-[#E86A25] hover:shadow-xl hover:shadow-[#FF7A2F]/35 hover:-translate-y-0.5 transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF7A2F]/50 shadow-lg shadow-[#FF7A2F]/30 active:scale-95"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  )
}