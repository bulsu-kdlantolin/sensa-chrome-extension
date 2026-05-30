import { useEffect, useMemo, useRef, useState } from "react"

interface WelcomeProps {
  theme: "light" | "dark"
  onGetStarted: () => void
}

export default function VisualWelcomeOverlay({ theme, onGetStarted }: WelcomeProps) {
  const isDark = theme === "dark"
  const [isSkipping, setIsSkipping] = useState(false)
  const [typedWordCount, setTypedWordCount] = useState(0)
  const [startDescription, setStartDescription] = useState(false)
  const [visibleFeatureCount, setVisibleFeatureCount] = useState(0)
  const [showButton, setShowButton] = useState(false)
  const selectedVoiceURIRef = useRef<string>("")
  const selectedVoiceNameRef = useRef<string>("")
  const narrationActiveRef = useRef(false)
  const narrationCanceledRef = useRef(false)
  const pendingUtteranceRef = useRef<string | null>(null)
  const voiceRetryTimerRef = useRef<number | null>(null)
  const voiceReadyRetryRef = useRef<number | null>(null)
  const BUTTON_TIMER_MS = 30000

  const titleText = "Welcome to Visual Mode"
  const descriptionText = "Sensa will intelligently read web pages aloud and simplify navigation for you."
  const descriptionWords = useMemo(() => descriptionText.split(" "), [descriptionText])
  const typedDescription = descriptionWords.slice(0, typedWordCount).join(" ")

  const features = useMemo(
    () => [
      {
        title: "Smart Reader",
        description: "Listen to any page with adjustable voice speeds.",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        )
      },
      {
        title: "Voice Control",
        description: "Navigate effortlessly using hands-free commands.",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
          </svg>
        )
      }
    ],
    []
  )

  useEffect(() => {
    chrome.storage.local.get(["sensa_visual_voice_uri", "sensa_visual_voice_name"], (res) => {
      if (typeof res.sensa_visual_voice_uri === "string") {
        selectedVoiceURIRef.current = res.sensa_visual_voice_uri
      }
      if (typeof res.sensa_visual_voice_name === "string") {
        selectedVoiceNameRef.current = res.sensa_visual_voice_name
      }
    })

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.sensa_visual_voice_uri && typeof changes.sensa_visual_voice_uri.newValue === "string") {
        selectedVoiceURIRef.current = changes.sensa_visual_voice_uri.newValue
      }
      if (changes.sensa_visual_voice_name && typeof changes.sensa_visual_voice_name.newValue === "string") {
        selectedVoiceNameRef.current = changes.sensa_visual_voice_name.newValue
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange)
    }
  }, [])

  useEffect(() => {
    if (isSkipping) return
    if (!startDescription) return
    if (typedWordCount >= descriptionWords.length) return

    const timer = window.setTimeout(() => {
      setTypedWordCount((count) => Math.min(count + 1, descriptionWords.length))
    }, 140)

    return () => window.clearTimeout(timer)
  }, [descriptionWords.length, isSkipping, startDescription, typedWordCount])

  const speakWithResolvedVoice = (text: string, onDone: () => void) => {
    if (!text.trim()) {
      onDone()
      return
    }

    const voices = window.speechSynthesis.getVoices()
    if (!voices.length) {
      pendingUtteranceRef.current = text
      if (voiceRetryTimerRef.current === null) {
        voiceRetryTimerRef.current = window.setTimeout(() => {
          voiceRetryTimerRef.current = null
          const pending = pendingUtteranceRef.current
          pendingUtteranceRef.current = null
          if (pending && !narrationCanceledRef.current) {
            speakWithResolvedVoice(pending, onDone)
          }
        }, 300)
      }
      window.speechSynthesis.onvoiceschanged = () => {
        const pending = pendingUtteranceRef.current
        pendingUtteranceRef.current = null
        if (pending && !narrationCanceledRef.current) {
          speakWithResolvedVoice(pending, onDone)
        }
      }
      return
    }

    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    const preferredVoice =
      voices.find((voice) => voice.voiceURI === selectedVoiceURIRef.current) ||
      voices.find((voice) => voice.name === selectedVoiceNameRef.current) ||
      voices.find((voice) => selectedVoiceNameRef.current && voice.name.includes(selectedVoiceNameRef.current))

    // If a specific voice is selected, wait for it to become available.
    if (!preferredVoice && (selectedVoiceURIRef.current || selectedVoiceNameRef.current)) {
      pendingUtteranceRef.current = text
      if (voiceReadyRetryRef.current === null) {
        let attempts = 0
        voiceReadyRetryRef.current = window.setInterval(() => {
          if (narrationCanceledRef.current) {
            window.clearInterval(voiceReadyRetryRef.current as number)
            voiceReadyRetryRef.current = null
            return
          }

          const refreshedVoices = window.speechSynthesis.getVoices()
          const readyVoice =
            refreshedVoices.find((voice) => voice.voiceURI === selectedVoiceURIRef.current) ||
            refreshedVoices.find((voice) => voice.name === selectedVoiceNameRef.current) ||
            refreshedVoices.find((voice) => selectedVoiceNameRef.current && voice.name.includes(selectedVoiceNameRef.current))

          if (readyVoice || attempts++ >= 20) {
            window.clearInterval(voiceReadyRetryRef.current as number)
            voiceReadyRetryRef.current = null
            const pending = pendingUtteranceRef.current
            pendingUtteranceRef.current = null
            if (pending && !narrationCanceledRef.current) {
              speakWithResolvedVoice(pending, onDone)
            }
          }
        }, 200)
      }
      return
    }

    if (preferredVoice) {
      utterance.voice = preferredVoice
      utterance.lang = preferredVoice.lang
    }

    utterance.onend = () => {
      if (narrationCanceledRef.current) return
      onDone()
    }
    utterance.onerror = () => {
      if (narrationCanceledRef.current) return
      onDone()
    }

    window.speechSynthesis.speak(utterance)
  }

  useEffect(() => {
    if (isSkipping) return
    if (narrationActiveRef.current) return

    narrationActiveRef.current = true
    narrationCanceledRef.current = false

    const revealAndSpeak = (index: number) => {
      if (index >= features.length) {
        setShowButton(true)
        return
      }

      setVisibleFeatureCount(index + 1)
      const feature = features[index]
      speakWithResolvedVoice(`${feature.title}. ${feature.description}`, () => {
        revealAndSpeak(index + 1)
      })
    }

    speakWithResolvedVoice(titleText, () => {
      setStartDescription(true)
    })

    return () => {
      narrationCanceledRef.current = true
      window.speechSynthesis.cancel()
    }
  }, [features, isSkipping, titleText])

  useEffect(() => {
    if (isSkipping) return
    if (!startDescription) return
    if (typedWordCount < descriptionWords.length) return

    speakWithResolvedVoice(descriptionText, () => {
      const revealAndSpeak = (index: number) => {
        if (index >= features.length) {
          setShowButton(true)
          return
        }

        setVisibleFeatureCount(index + 1)
        const feature = features[index]
        speakWithResolvedVoice(`${feature.title}. ${feature.description}`, () => {
          revealAndSpeak(index + 1)
        })
      }

      revealAndSpeak(0)
    })
  }, [descriptionText, descriptionWords.length, features, isSkipping, startDescription, typedWordCount])

  useEffect(() => {
    if (!showButton || isSkipping) return

    const timer = window.setTimeout(() => {
      onGetStarted()
    }, BUTTON_TIMER_MS)

    return () => window.clearTimeout(timer)
  }, [showButton, isSkipping, onGetStarted, BUTTON_TIMER_MS])

  useEffect(() => {
    return () => {
      narrationCanceledRef.current = true
      window.speechSynthesis.cancel()
      if (voiceReadyRetryRef.current !== null) {
        window.clearInterval(voiceReadyRetryRef.current)
        voiceReadyRetryRef.current = null
      }
    }
  }, [])

  const handleManualProceed = () => {
    setIsSkipping(true)
    narrationCanceledRef.current = true
    window.speechSynthesis.cancel()
    onGetStarted()
  }

  return (
    <div className={`w-[350px] h-[550px] min-w-[350px] min-h-[550px] flex flex-col items-center justify-between font-sans relative overflow-hidden select-none transition-colors duration-500 ${isDark ? 'bg-[#1C1C1E] text-white' : 'bg-gray-50 text-gray-900'}`}>
      
      {/* 🚨 CSS INJECTION FOR CINEMATIC ENTRANCE & BUTTON PROGRESS */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes float-blue-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(20px, 30px) scale(1.1); }
        }
        @keyframes float-blue-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-20px, -30px) scale(1.1); }
        }
        @keyframes fade-in-up {
          0% { opacity: 0; transform: translateY(24px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes progress-fill {
          0% { width: 0%; }
          100% { width: 100%; }
        }
        
        .animate-float-blue-1 { animation: float-blue-1 8s ease-in-out infinite; }
        .animate-float-blue-2 { animation: float-blue-2 8s ease-in-out infinite 0.5s; }
        
        /* The 6-second timer fill */
        .animate-button-progress { animation: progress-fill 30s linear forwards; }
        
        .fade-in-1 { animation: fade-in-up 0.8s cubic-bezier(0.23,1,0.32,1) 0.1s forwards; opacity: 0; }
        .fade-in-2 { animation: fade-in-up 0.8s cubic-bezier(0.23,1,0.32,1) 0.2s forwards; opacity: 0; }
        .fade-in-3 { animation: fade-in-up 0.8s cubic-bezier(0.23,1,0.32,1) 0.3s forwards; opacity: 0; }
        .fade-in-4 { animation: fade-in-up 0.8s cubic-bezier(0.23,1,0.32,1) 0.4s forwards; opacity: 0; }
      `}} />

      {/* 🌌 AMBIENT BLUE BACKGROUND ENGINE */}
      <div className={`absolute -top-16 -left-16 w-64 h-64 rounded-full mix-blend-multiply filter blur-[60px] animate-float-blue-1 pointer-events-none transform-gpu ${isDark ? 'bg-[#0A44FF]/30' : 'bg-[#0A44FF]/20'}`} />
      <div className={`absolute -bottom-16 -right-16 w-64 h-64 rounded-full mix-blend-multiply filter blur-[60px] animate-float-blue-2 pointer-events-none transform-gpu ${isDark ? 'bg-[#0A44FF]/15' : 'bg-[#0A44FF]/10'}`} />

      {/* 🛡️ CONTENT WRAPPER */}
      <div className="relative z-10 flex flex-col items-center w-full h-full pt-[54px] pb-10 px-8">
        
        {/* Header (No Logo, Perfectly Centered) */}
        <div className="flex flex-col items-center w-full mt-2 mb-2">
          <h1 className="text-[40px] font-black tracking-tighter leading-none mb-3 fade-in-1 text-center">
            Visual Mode
          </h1>
          <p className={`text-[16px] font-semibold text-center leading-snug fade-in-2 px-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
            {typedDescription}
          </p>
        </div>

        {/* 👁️ FEATURE HIGHLIGHT CARDS */}
        <div className="w-full mt-4 mb-6 fade-in-3">
          <div className="grid grid-cols-1 gap-3 w-full max-h-[220px] overflow-y-auto pr-1">
            {features.slice(0, visibleFeatureCount).map((feature) => (
              <div
                key={feature.title}
                className={`flex items-center gap-4 rounded-[20px] px-4 py-4 shadow-md transition-colors ${isDark ? 'bg-[#2C2C2E] border-2 border-gray-700' : 'bg-white border-2 border-transparent'}`}
              >
                <div className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center text-[#0A44FF] ${isDark ? 'bg-[#0A44FF]/20' : 'bg-[#0A44FF]/10'}`}>
                  {feature.icon}
                </div>
                <div className="flex flex-col">
                  <p className={`text-[15px] font-black uppercase tracking-wide leading-tight ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    {feature.title}
                  </p>
                  <p className={`text-[13px] font-medium leading-snug mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 🚀 SENSA BLUE PROGRESS BUTTON */}
        {showButton && (
          <button
            onClick={handleManualProceed}
            className="w-full h-[60px] relative overflow-hidden fade-in-4 rounded-full bg-[#0A44FF] shadow-[0_12px_30px_rgba(10,68,255,0.3)] hover:shadow-[0_16px_40px_rgba(10,68,255,0.4)] hover:scale-[1.03] active:scale-95 transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] group focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0A44FF]/50"
          >
            {/* Animated Progress Fill Layer */}
            <div className="absolute top-0 left-0 h-full bg-white/25 animate-button-progress pointer-events-none" />

            {/* Button Text & Icon */}
            <div className="relative z-10 flex items-center justify-center w-full h-full gap-3 text-white font-black text-[17px] tracking-wide">
              Enter Visual Mode
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </div>
          </button>
        )}

      </div>
    </div>
  )
}