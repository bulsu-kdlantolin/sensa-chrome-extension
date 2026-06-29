import { useEffect, useMemo, useRef, useState } from "react"
import { useUIHoverAudio } from "../hooks/useUIHoverAudio"

interface WelcomeProps {
  theme: "light" | "dark"
  onGetStarted: () => void
}

export default function VisualWelcomeOverlay({ theme, onGetStarted }: WelcomeProps) {
  const isDark = theme === "dark"
  const { playHoverAudio, cancelHoverAudio } = useUIHoverAudio()
  const [isSkipping, setIsSkipping] = useState(false)
  const [typedWordCount, setTypedWordCount] = useState(0)
  const [startDescription, setStartDescription] = useState(false)
  const [visibleFeatureCount, setVisibleFeatureCount] = useState(0)
  const [showButton, setShowButton] = useState(false)
  const [reminderTrigger, setReminderTrigger] = useState<{ skipped: boolean } | null>(null)
  const [voiceSettingsLoaded, setVoiceSettingsLoaded] = useState(false)
  const [voiceReady, setVoiceReady] = useState(false)
  const selectedVoiceURIRef = useRef<string>("")
  const selectedVoiceNameRef = useRef<string>("")
  const narrationActiveRef = useRef(false)
  const narrationCanceledRef = useRef(false)
  const pendingUtteranceRef = useRef<string | null>(null)
  const voiceRetryTimerRef = useRef<number | null>(null)
  const voiceReadyRetryRef = useRef<number | null>(null)
  const descriptionFallbackRef = useRef<number | null>(null)
  const commandReminderIntervalRef = useRef<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const onGetStartedRef = useRef(onGetStarted)
  onGetStartedRef.current = onGetStarted


  const titleText = "Welcome to Visual Mode"
  const descriptionText = "Assisting visually impaired users with specialized accessibility tools and features."
  const featuresIntroText = "Here are the main features you'll use."
  const commandReminderText = "When you are ready, you can say, Get Started, to proceed to the Visual Mode interface."
  const descriptionWords = useMemo(() => descriptionText.split(" "), [descriptionText])
  const typedDescription = descriptionWords.slice(0, typedWordCount).join(" ")

  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext
      audioCtxRef.current = Ctor ? new Ctor() : null
    }

    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => undefined)
    }

    return audioCtxRef.current
  }

  const playTypingSfx = () => {
    const ctx = getAudioContext()
    if (!ctx) return

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = "triangle"
    osc.frequency.setValueAtTime(980, ctx.currentTime)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.07, ctx.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.07)
  }

  const playPopSfx = () => {
    const ctx = getAudioContext()
    if (!ctx) return

    const makeClick = (freq: number, startAt: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = "square"
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startAt)
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + startAt)
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + startAt + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startAt + 0.05)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + startAt)
      osc.stop(ctx.currentTime + startAt + 0.06)
    }

    makeClick(900, 0)
    makeClick(1200, 0.07)
  }

  const playHoverSfx = () => {
    const ctx = getAudioContext()
    if (!ctx) return

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = "sine"
    osc.frequency.setValueAtTime(720, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + 0.08)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.1)
  }

  const features = useMemo(
    () => [
      {
        title: "Voice Control",
        description: "Navigate the web effortlessly using hands-free voice commands.",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="22" />
          </svg>
        )
      },
      {
        title: "Smart Reader",
        description: "Listen to any web page aloud with adjustable reading speeds.",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
          </svg>
        )
      },
      {
        title: "Screen Magnifier",
        description: "Zoom into text and images with an interactive magnifying glass.",
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="11" y1="8" x2="11" y2="14" />
            <line x1="8" y1="11" x2="14" y2="11" />
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
      setVoiceSettingsLoaded(true)
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
    if (!voiceSettingsLoaded) return

    const hasSelection = Boolean(selectedVoiceURIRef.current || selectedVoiceNameRef.current)
    if (!hasSelection) {
      setVoiceReady(true)
      return
    }

    let attempts = 0
    const checkReady = () => {
      const voices = window.speechSynthesis.getVoices()
      const readyVoice =
        voices.find((voice) => voice.voiceURI === selectedVoiceURIRef.current) ||
        voices.find((voice) => voice.name === selectedVoiceNameRef.current) ||
        voices.find((voice) => selectedVoiceNameRef.current && voice.name.includes(selectedVoiceNameRef.current))

      if (readyVoice) {
        setVoiceReady(true)
        return true
      }

      return false
    }

    if (checkReady()) return

    const handleVoicesChanged = () => {
      if (checkReady()) {
        window.speechSynthesis.onvoiceschanged = null
      }
    }

    window.speechSynthesis.onvoiceschanged = handleVoicesChanged

    const intervalId = window.setInterval(() => {
      if (checkReady() || attempts++ >= 50) {
        window.clearInterval(intervalId)
      }
    }, 200)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [voiceSettingsLoaded])

  useEffect(() => {
    if (!voiceReady || narrationCanceledRef.current) return
    const pending = pendingUtteranceRef.current
    if (pending) {
      pendingUtteranceRef.current = null
      speakWithResolvedVoice(pending, () => { })
    }
  }, [voiceReady])

  useEffect(() => {
    if (isSkipping) return
    if (!startDescription) return
    if (typedWordCount >= descriptionWords.length) return

    const timer = window.setTimeout(() => {
      setTypedWordCount((count) => Math.min(count + 1, descriptionWords.length))
    }, 140)

    return () => window.clearTimeout(timer)
  }, [descriptionWords.length, isSkipping, startDescription, typedWordCount])

  useEffect(() => {
    if (!startDescription) return
    if (typedWordCount === 0) return
    playTypingSfx()
  }, [startDescription, typedWordCount])

  const speakWithResolvedVoice = (text: string, onDone: () => void) => {
    if (!text.trim()) {
      onDone()
      return
    }

    if (!voiceSettingsLoaded) {
      pendingUtteranceRef.current = text
      if (voiceRetryTimerRef.current === null) {
        voiceRetryTimerRef.current = window.setTimeout(() => {
          voiceRetryTimerRef.current = null
          const pending = pendingUtteranceRef.current
          pendingUtteranceRef.current = null
          if (pending && !narrationCanceledRef.current) {
            speakWithResolvedVoice(pending, onDone)
          }
        }, 200)
      }
      return
    }

    if (!voiceReady && (selectedVoiceURIRef.current || selectedVoiceNameRef.current)) {
      pendingUtteranceRef.current = text
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
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel()
    }
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
    if (!voiceSettingsLoaded) return
    if ((selectedVoiceURIRef.current || selectedVoiceNameRef.current) && !voiceReady) return

    narrationActiveRef.current = true
    narrationCanceledRef.current = false

    if (descriptionFallbackRef.current !== null) {
      window.clearTimeout(descriptionFallbackRef.current)
      descriptionFallbackRef.current = null
    }

    // Safety: ensure the visual flow continues even if speech blocks.
    descriptionFallbackRef.current = window.setTimeout(() => {
      if (!isSkipping) setStartDescription(true)
    }, 1200)

    speakWithResolvedVoice(titleText, () => {
      setStartDescription(true)
    })

    return () => {
      narrationCanceledRef.current = true
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel()
      }
      if (descriptionFallbackRef.current !== null) {
        window.clearTimeout(descriptionFallbackRef.current)
        descriptionFallbackRef.current = null
      }
    }
  }, [features, isSkipping, titleText, voiceReady, voiceSettingsLoaded])

  useEffect(() => {
    if (isSkipping) return
    if (!startDescription) return
    if (typedWordCount < descriptionWords.length) return

    speakWithResolvedVoice(descriptionText, () => {
      speakWithResolvedVoice(featuresIntroText, () => {
        const revealAndSpeak = (index: number) => {
          if (index >= features.length) {
            setShowButton(true)
            setReminderTrigger({ skipped: false })
            return
          }

          playPopSfx()
          setVisibleFeatureCount(index + 1)
          const feature = features[index]
          speakWithResolvedVoice(`${feature.title}. ${feature.description}`, () => {
            revealAndSpeak(index + 1)
          })
        }

        revealAndSpeak(0)
      })
    })
  }, [descriptionText, descriptionWords.length, features, isSkipping, startDescription, typedWordCount])

  useEffect(() => {
    if (!reminderTrigger) return

    const playReminder = () => {
      speakWithResolvedVoice(commandReminderText, () => { })
    }

    if (reminderTrigger.skipped) {
      const timeout = window.setTimeout(() => {
        playReminder()
      }, 800)

      const interval = window.setInterval(() => {
        playReminder()
      }, 30000)

      return () => {
        window.clearTimeout(timeout)
        window.clearInterval(interval)
      }
    } else {
      playReminder()

      const interval = window.setInterval(() => {
        playReminder()
      }, 30000)

      return () => {
        window.clearInterval(interval)
      }
    }
  }, [reminderTrigger])

  useEffect(() => {
    return () => {
      narrationCanceledRef.current = true
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel()
      }
      if (commandReminderIntervalRef.current !== null) {
        window.clearInterval(commandReminderIntervalRef.current)
        commandReminderIntervalRef.current = null
      }
      if (voiceReadyRetryRef.current !== null) {
        window.clearInterval(voiceReadyRetryRef.current)
        voiceReadyRetryRef.current = null
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => undefined)
        audioCtxRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    const resumeAudio = () => {
      const ctx = getAudioContext()
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(() => undefined)
      }
    }

    window.addEventListener("pointerdown", resumeAudio)
    window.addEventListener("keydown", resumeAudio)
    return () => {
      window.removeEventListener("pointerdown", resumeAudio)
      window.removeEventListener("keydown", resumeAudio)
    }
  }, [])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) return
      setIsSkipping(true)
      narrationCanceledRef.current = true
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel()
      }
    }

    const handleBlur = () => {
      setIsSkipping(true)
      narrationCanceledRef.current = true
      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        window.speechSynthesis.cancel()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    window.addEventListener("blur", handleBlur)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      window.removeEventListener("blur", handleBlur)
    }
  }, [])

  const handleManualProceed = () => {
    setIsSkipping(true)
    narrationCanceledRef.current = true
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel()
    }
    playPopSfx()
    chrome.storage.local.set({
      sensa_visual_entered_from_welcome: true
    }, () => {
      onGetStartedRef.current()
    })
  }

  useEffect(() => {
    let retryTimer: number | null = null
    let isMounted = true

    const sendVoiceBridgeMessage = (action: "start" | "stop", retries = 0) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs?.find(t => t.url && (t.url.startsWith("http://") || t.url.startsWith("https://"))) || tabs?.[0]
        const tabId = activeTab?.id
        if (!tabId) return

        if (activeTab.url && (activeTab.url.startsWith("chrome://") || activeTab.url.startsWith("edge://") || activeTab.url.startsWith("about:"))) {
          return
        }

        chrome.tabs.sendMessage(tabId, { type: "sensa-welcome-voice", action }, (response) => {
          const err = chrome.runtime.lastError?.message
          // Retry start if content script wasn't ready (message failed)
          if (action === "start" && err && retries < 3 && isMounted) {
            retryTimer = window.setTimeout(() => {
              if (isMounted) sendVoiceBridgeMessage("start", retries + 1)
            }, 800)
          }
        })
      })
    }

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.sensa_welcome_proceed_trigger && changes.sensa_welcome_proceed_trigger.newValue === true) {
        chrome.storage.local.set({ sensa_welcome_proceed_trigger: false }, () => {
          handleManualProceed()
        })
      }
    }

    chrome.storage.local.set({ sensa_welcome_proceed_trigger: false }, () => {
      sendVoiceBridgeMessage("start")
    })

    chrome.storage.onChanged.addListener(handleStorageChange)

    return () => {
      isMounted = false
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      chrome.storage.onChanged.removeListener(handleStorageChange)
      sendVoiceBridgeMessage("stop")
      chrome.storage.local.remove("sensa_welcome_proceed_trigger")
    }
  }, [])

  const handleSkipStep = () => {
    setIsSkipping(true)
    narrationCanceledRef.current = true
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel()
    }
    playPopSfx()
    setStartDescription(true)
    setTypedWordCount(descriptionWords.length)
    setVisibleFeatureCount(features.length)
    setShowButton(true)
    setReminderTrigger({ skipped: true })
  }

  return (
    <div
      className={`w-[350px] h-[550px] min-w-[350px] min-h-[550px] flex flex-col items-center justify-start font-sans relative overflow-hidden select-none transition-colors duration-500 ${isDark ? 'bg-[#1C1C1E] text-white' : 'bg-gray-50 text-gray-900'}`}
      onClick={handleSkipStep}
    >

      {/* 🚨 CSS INJECTION FOR CINEMATIC ENTRANCE & BUTTON PROGRESS */}
      <style dangerouslySetInnerHTML={{
        __html: `
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
        
        @keyframes pop-in {
          0% { opacity: 0; transform: translateY(10px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-pop { animation: pop-in 0.7s cubic-bezier(0.23,1,0.32,1) forwards; opacity: 0; }
        
        .fade-in-1 { animation: fade-in-up 0.8s cubic-bezier(0.23,1,0.32,1) 0.1s forwards; opacity: 0; }
        .fade-in-2 { animation: fade-in-up 0.8s cubic-bezier(0.23,1,0.32,1) 0.2s forwards; opacity: 0; }
        .fade-in-3 { animation: fade-in-up 0.8s cubic-bezier(0.23,1,0.32,1) 0.3s forwards; opacity: 0; }
        .fade-in-4 { animation: fade-in-up 0.8s cubic-bezier(0.23,1,0.32,1) 0.4s forwards; opacity: 0; }
      `}} />

      {/* 🌌 AMBIENT BLUE BACKGROUND ENGINE */}
      <div className={`absolute -top-16 -left-16 w-64 h-64 rounded-full mix-blend-multiply filter blur-[60px] animate-float-blue-1 pointer-events-none transform-gpu ${isDark ? 'bg-[#0A44FF]/30' : 'bg-[#0A44FF]/20'}`} />
      <div className={`absolute -bottom-16 -right-16 w-64 h-64 rounded-full mix-blend-multiply filter blur-[60px] animate-float-blue-2 pointer-events-none transform-gpu ${isDark ? 'bg-[#0A44FF]/15' : 'bg-[#0A44FF]/10'}`} />

      {/* 🛡️ CONTENT WRAPPER */}
      <div className="relative z-10 flex flex-col items-center justify-start w-full h-full pt-6 pb-6 px-6">

        {/* Header (No Logo, Perfectly Centered) */}
        <div className="flex flex-col items-center w-full mb-5">
          <h1 className="text-[34px] font-black tracking-tight leading-none mb-2.5 fade-in-1 text-center bg-gradient-to-r from-[#0A44FF] to-[#0099FF] bg-clip-text text-transparent px-2 pb-1 overflow-visible">
            Visual Mode
          </h1>
          <p className={`text-[14.5px] font-medium text-center leading-relaxed fade-in-2 px-1 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
            {typedDescription}
          </p>
        </div>

        {/* 👁️ FEATURE HIGHLIGHT CARDS */}
        <div className="w-full fade-in-3 mb-auto">
          <div className="grid grid-cols-1 gap-3.5 w-full overflow-visible py-1 content-start">
            {features.slice(0, visibleFeatureCount).map((feature) => (
              <div
                key={feature.title}
                className={`group flex items-center gap-4 rounded-[20px] px-5 py-3.5 shadow-md transition-all cursor-pointer animate-pop min-h-[74px] shrink-0 ${isDark ? 'bg-[#2C2C2E] border-2 border-gray-700 hover:border-[#0A44FF] hover:bg-[#2C2C2E]/90 hover:shadow-[0_12px_26px_rgba(10,68,255,0.25)]' : 'bg-white border-2 border-transparent hover:border-[#0A44FF] hover:shadow-[0_12px_26px_rgba(10,68,255,0.2)]'}`}
                onMouseEnter={() => { playHoverSfx(); playHoverAudio(`${feature.title}. ${feature.description}`) }}
                onFocus={() => { playHoverSfx(); playHoverAudio(`${feature.title}. ${feature.description}`) }}
                onMouseLeave={cancelHoverAudio}
                onBlur={cancelHoverAudio}
                tabIndex={0}
              >
                <div className={`w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-[#0A44FF] ${isDark ? 'bg-[#0A44FF]/20' : 'bg-[#0A44FF]/10'}`}>
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
        <div className={`w-full h-[56px] shrink-0 mt-auto transition-all duration-500 ${showButton ? 'opacity-100 pointer-events-auto fade-in-4' : 'opacity-0 pointer-events-none'}`}>
          <button
            onClick={handleManualProceed}
            className="w-full h-full relative overflow-hidden rounded-full bg-[#0A44FF] shadow-[0_12px_30px_rgba(10,68,255,0.3)] hover:shadow-[0_16px_40px_rgba(10,68,255,0.4)] hover:scale-[1.03] active:scale-95 transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] group focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0A44FF]/50"
            onMouseEnter={() => { playHoverSfx(); playHoverAudio("Get Started") }}
            onFocus={() => { playHoverSfx(); playHoverAudio("Get Started") }}
            onMouseLeave={cancelHoverAudio}
            onBlur={cancelHoverAudio}
          >
            {/* Button Text & Icon */}
            <div className="relative z-10 flex items-center justify-center w-full h-full gap-3 text-white font-black text-[17px] tracking-wide">
              Get Started
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-1">
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </div>
          </button>
        </div>

      </div>
    </div>
  )
}