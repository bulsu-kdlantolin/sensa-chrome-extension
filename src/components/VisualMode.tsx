import { useState, useEffect, useRef } from "react"

interface VisualModeProps {
  isActiveView?: boolean
}

export default function VisualMode({ isActiveView = true }: VisualModeProps) {
  const [isListening, setIsListening] = useState(false)
  const [isSoundEffectsEnabled, setIsSoundEffectsEnabled] = useState(true)
  const selectedVoiceURIRef = useRef("")
  const selectedVoiceNameRef = useRef("")
  const audioCtxRef = useRef<AudioContext | null>(null)
  const isSoundEffectsEnabledRef = useRef(true)
  const hoverSpeakLockRef = useRef(0)
  const isActiveViewRef = useRef(isActiveView)

  useEffect(() => {
    isActiveViewRef.current = isActiveView
  }, [isActiveView])

  const getAudioContext = () => {
    if (!isSoundEffectsEnabledRef.current) return null
    if (!audioCtxRef.current) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext
      audioCtxRef.current = Ctor ? new Ctor() : null
    }

    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => undefined)
    }

    return audioCtxRef.current
  }

  useEffect(() => {
    isSoundEffectsEnabledRef.current = isSoundEffectsEnabled
  }, [isSoundEffectsEnabled])

  useEffect(() => {
    chrome.storage.local.get(["sensa_visual_sound_effects_enabled"], (res) => {
      if (typeof res.sensa_visual_sound_effects_enabled === "boolean") {
        setIsSoundEffectsEnabled(res.sensa_visual_sound_effects_enabled)
      }
    })

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.sensa_visual_sound_effects_enabled?.newValue !== undefined) {
        const next = !!changes.sensa_visual_sound_effects_enabled.newValue
        setIsSoundEffectsEnabled(next)
        if (!next && audioCtxRef.current) {
          audioCtxRef.current.close().catch(() => undefined)
          audioCtxRef.current = null
        }
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [])

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

  const playActivateSfx = () => {
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

  const playDeactivateSfx = () => {
    const ctx = getAudioContext()
    if (!ctx) return

    const makeClick = (freq: number, startAt: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = "triangle"
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startAt)
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + startAt)
      gain.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + startAt + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startAt + 0.06)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + startAt)
      osc.stop(ctx.currentTime + startAt + 0.07)
    }

    makeClick(720, 0)
    makeClick(480, 0.08)
  }

  const waitForVoices = () =>
    new Promise<SpeechSynthesisVoice[]>((resolve) => {
      const existingVoices = window.speechSynthesis.getVoices()
      if (existingVoices.length > 0) {
        resolve(existingVoices)
        return
      }

      const timeoutId = window.setTimeout(() => {
        window.speechSynthesis.removeEventListener("voiceschanged", handleVoicesChanged)
        resolve(window.speechSynthesis.getVoices())
      }, 1200)

      const handleVoicesChanged = () => {
        window.clearTimeout(timeoutId)
        window.speechSynthesis.removeEventListener("voiceschanged", handleVoicesChanged)
        resolve(window.speechSynthesis.getVoices())
      }

      window.speechSynthesis.addEventListener("voiceschanged", handleVoicesChanged)
    })

  const getStoredVoicePreference = () =>
    new Promise<{ voiceURI: string; voiceName: string; voiceGuideEnabled: boolean }>((resolve) => {
      chrome.storage.local.get(["sensa_visual_voice_uri", "sensa_visual_voice_name", "sensa_visual_voice_guide_enabled"], (res) => {
        resolve({
          voiceURI: typeof res.sensa_visual_voice_uri === "string" ? res.sensa_visual_voice_uri : "",
          voiceName: typeof res.sensa_visual_voice_name === "string" ? res.sensa_visual_voice_name : "",
          voiceGuideEnabled: typeof res.sensa_visual_voice_guide_enabled === "boolean" ? res.sensa_visual_voice_guide_enabled : true
        })
      })
    })

  const speakFeedback = async (message: string) => {
    if (!isActiveViewRef.current) return;
    if (typeof window === "undefined" || !window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      return
    }

    const storedVoicePreference = await getStoredVoicePreference()
    if (!storedVoicePreference.voiceGuideEnabled) {
      return
    }

    if (storedVoicePreference.voiceURI) {
      selectedVoiceURIRef.current = storedVoicePreference.voiceURI
    }
    if (storedVoicePreference.voiceName) {
      selectedVoiceNameRef.current = storedVoicePreference.voiceName
    }

    const availableVoices = await waitForVoices()
    let preferredVoice = availableVoices.find((voice) => voice.voiceURI === selectedVoiceURIRef.current)

    if (!preferredVoice && selectedVoiceNameRef.current) {
      preferredVoice = availableVoices.find(
        (voice) => voice.name === selectedVoiceNameRef.current || voice.name?.includes(selectedVoiceNameRef.current)
      )
    }

    if (!preferredVoice) {
      return
    }

    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(message)
    utterance.voice = preferredVoice

    utterance.rate = 1
    utterance.pitch = 1
    utterance.volume = 1
    window.speechSynthesis.speak(utterance)
  }

  const buildVisualModeAnnouncement = async () => {
    let websiteLabel = "No active tab"
    try {
      const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
      const activeTab = tabs?.[0]
      if (activeTab?.url) {
        try {
          const parsed = new URL(activeTab.url)
          websiteLabel = parsed.hostname || activeTab.url
        } catch {
          websiteLabel = activeTab.url
        }
      }
    } catch {
      websiteLabel = "Unavailable"
    }

    const storageState = await new Promise<{ isActive: boolean }>((resolve) => {
      chrome.storage.local.get(["sensa_visual_active"], (res) => {
        resolve({ isActive: !!res.sensa_visual_active })
      })
    })
    const statusLabel = storageState.isActive ? "Connected" : "Offline"
    return `We are now in the Visual Mode interface. Target website: ${websiteLabel}. Extension status: ${statusLabel}.`
  }

  // --- THE TWO-WAY BRIDGE ---
  useEffect(() => {
    chrome.storage.local.get(["sensa_visual_active"], (res) => {
      setIsListening(!!res.sensa_visual_active)
    })

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.sensa_visual_active !== undefined) {
        setIsListening(changes.sensa_visual_active.newValue)
      }
      if (changes.sensa_visual_activated_via_voice?.newValue === true) {
        window.close()
        chrome.storage.local.remove("sensa_visual_activated_via_voice")
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
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
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => undefined)
        audioCtxRef.current = null
      }
    }
  }, [])


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
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [])

  const handleToggle = () => {
    if (isListening) {
      playDeactivateSfx()
    } else {
      playActivateSfx()
    }
    const newState = !isListening
    setIsListening(newState)
    chrome.runtime.sendMessage({ type: "sensa-activate-mode", mode: newState ? "visual" : null })
    chrome.storage.local.set({
      sensa_visual_active: newState,
      sensa_voice_command_active: false,
      ...(newState ? { sensa_auditory_active: false } : {})
    })
  }

  const speakWithHoverLock = (message: string) => {
    const now = Date.now()
    if (now - hoverSpeakLockRef.current < 900) return
    hoverSpeakLockRef.current = now
    void speakFeedback(message)
  }

  const cancelHoverSpeak = () => {
    window.speechSynthesis.cancel()
  }

  const handleHoverSpeak = () => {
    speakWithHoverLock(isListening ? "Deactivate Visual Mode" : "Activate Visual Mode")
  }

  const handleHintHoverSpeak = () => {
    speakWithHoverLock(isListening ? "Click or speak to deactivate" : "Click or speak to activate")
  }

  const callbacksRef = useRef({ isListening, handleToggle, playActivateSfx, playDeactivateSfx, speakFeedback })

  useEffect(() => {
    callbacksRef.current = { isListening, handleToggle, playActivateSfx, playDeactivateSfx, speakFeedback }
  }, [isListening, handleToggle, playActivateSfx, playDeactivateSfx, speakFeedback])

  useEffect(() => {
    const sendVoiceBridgeMessage = (action: "start" | "stop") => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs?.find(t => t.url && (t.url.startsWith("http://") || t.url.startsWith("https://"))) || tabs?.[0]
        const tabId = activeTab?.id
        if (!tabId) return

        if (activeTab.url && (activeTab.url.startsWith("chrome://") || activeTab.url.startsWith("edge://") || activeTab.url.startsWith("about:"))) {
          return
        }

        chrome.tabs.sendMessage(tabId, { type: "sensa-visual-mode-voice", action }, () => {
          const err = chrome.runtime.lastError?.message
        })
      })
    }

    if (isActiveView) {
      sendVoiceBridgeMessage("start")
    } else {
      sendVoiceBridgeMessage("stop")
    }

    return () => {
      sendVoiceBridgeMessage("stop")
    }
  }, [isActiveView])

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!isActiveViewRef.current) return;
      chrome.storage.local.get(["sensa_visual_active"], (res) => {
        if (!isActiveViewRef.current) return;
        void callbacksRef.current.speakFeedback(
          res.sensa_visual_active 
            ? "You can say, deactivate, to disable visual mode." 
            : "You can say, activate, to enable visual mode."
        )
      })
    }, 30000)
    return () => window.clearInterval(interval)
  }, [])

  const springTransition = "transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"

  return (
    // 🚨 BUG EXTERMINATION: Changed overflow-hidden to overflow-visible so the glow doesn't get clipped!
    <div className="flex-1 flex flex-col items-center justify-center px-6 w-full h-full bg-transparent select-none relative overflow-visible">
      
      {/* 🚨 ISOLATED CSS INJECTION */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes visual-soundwave {
          0%, 100% { transform: scaleY(0.5); opacity: 0.5; }
          50% { transform: scaleY(1.2); opacity: 1; }
        }
        @keyframes visual-pulse-glow {
          0%, 100% { box-shadow: 0 0 25px rgba(10,68,255,0.3); }
          50% { box-shadow: 0 0 65px rgba(10,68,255,0.8); }
        }
        
        .animate-visual-wave-1 { animation: visual-soundwave 0.8s ease-in-out infinite 0.0s; }
        .animate-visual-wave-2 { animation: visual-soundwave 0.8s ease-in-out infinite 0.2s; }
        .animate-visual-wave-3 { animation: visual-soundwave 0.8s ease-in-out infinite 0.4s; }
        .animate-visual-wave-4 { animation: visual-soundwave 0.8s ease-in-out infinite 0.6s; }
        
        /* 🚨 PERFECT SYNC: Glow is now exactly 1.6s (exactly 2x the 0.8s wave cycle) */
        .animate-visual-pulse-glow { animation: visual-pulse-glow 1.6s ease-in-out infinite backwards; }
      `}} />

      <div className="flex flex-col items-center justify-center w-full relative z-10 overflow-visible pb-2">

        <div className="flex items-center justify-center gap-6 mb-10 mt-4 w-full relative overflow-visible">
          
          {/* LEFT SOUNDWAVE */}
          <div className={`flex items-center gap-2.5 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] shrink-0 ${isListening ? 'opacity-100 scale-100 text-[#0A44FF]' : 'opacity-0 scale-75 pointer-events-none text-gray-300'}`}>
            <div className={`w-[5px] h-4 bg-current rounded-full origin-center ${isListening ? 'animate-visual-wave-1' : ''}`} />
            <div className={`w-[5px] h-8 bg-current rounded-full origin-center ${isListening ? 'animate-visual-wave-2' : ''}`} />
            <div className={`w-[5px] h-12 bg-current rounded-full origin-center ${isListening ? 'animate-visual-wave-3' : ''}`} />
            <div className={`w-[5px] h-5 bg-current rounded-full origin-center ${isListening ? 'animate-visual-wave-4' : ''}`} />
          </div>

          {/* MAIN MIC BUTTON */}
          <button
            style={{ WebkitTapHighlightColor: 'transparent' }}
            onClick={handleToggle}
            onMouseEnter={() => {
              playHoverSfx()
              handleHoverSpeak()
            }}
            onMouseLeave={cancelHoverSpeak}
            onFocus={() => {
              playHoverSfx()
              handleHoverSpeak()
            }}
            onBlur={cancelHoverSpeak}
            aria-pressed={isListening}
            aria-label={isListening ? "Deactivate Visual Mode" : "Activate Visual Mode"}
            className={`w-[136px] h-[136px] shrink-0 rounded-full flex items-center justify-center relative group outline-none focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-offset-4 focus-visible:ring-[#0A44FF]/60 transform-gpu active:scale-90 ${springTransition}
              ${isListening 
                ? "bg-[#0A44FF] animate-visual-pulse-glow" 
                : "bg-[#0A44FF] ring-[10px] ring-[#0A44FF]/10 shadow-[0_16px_35px_rgba(0,0,0,0.15)] hover:scale-105 hover:bg-[#0836CC] hover:ring-[#0A44FF]/20"
              }`}
          >
            <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/25 to-transparent pointer-events-none" />

            <div className="relative z-10 flex items-center justify-center w-full h-full pointer-events-none">
              {isListening ? (
                <svg focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-[60px] h-[60px] drop-shadow-md">
                  <line x1="2" y1="2" x2="22" y2="22" />
                  <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2" />
                  <path d="M5 10v2a7 7 0 0 0 12 5" />
                  <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33" />
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
              ) : (
                <svg focusable="false" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-[60px] h-[60px] drop-shadow-md transition-transform group-hover:scale-110 duration-300">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
              )}
            </div>
          </button>

          {/* RIGHT SOUNDWAVE */}
          <div className={`flex items-center gap-2.5 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] shrink-0 ${isListening ? 'opacity-100 scale-100 text-[#0A44FF]' : 'opacity-0 scale-75 pointer-events-none text-gray-300'}`}>
            <div className={`w-[5px] h-5 bg-current rounded-full origin-center ${isListening ? 'animate-visual-wave-4' : ''}`} />
            <div className={`w-[5px] h-12 bg-current rounded-full origin-center ${isListening ? 'animate-visual-wave-3' : ''}`} />
            <div className={`w-[5px] h-8 bg-current rounded-full origin-center ${isListening ? 'animate-visual-wave-2' : ''}`} />
            <div className={`w-[5px] h-4 bg-current rounded-full origin-center ${isListening ? 'animate-visual-wave-1' : ''}`} />
          </div>
        </div>

        <h2
          className={`relative transform-gpu text-[22px] font-semibold text-center whitespace-nowrap leading-relaxed tracking-wide transition-all duration-200 rounded-md px-2 py-1 cursor-default ${isListening ? "text-[#0A44FF]" : "text-gray-500"} hover:ring-2 hover:ring-[#0A44FF]/30 hover:shadow-[0_0_0_4px_rgba(10,68,255,0.12)]`}
          onMouseEnter={handleHintHoverSpeak}
          onMouseLeave={cancelHoverSpeak}
          onFocus={handleHintHoverSpeak}
          onBlur={cancelHoverSpeak}
          tabIndex={0}
        >
          {isListening ? "Click or Speak to Deactivate" : "Click or Speak to Activate"}
        </h2>

      </div>
    </div>
  )
}