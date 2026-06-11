import { useEffect, useMemo, useRef, useState } from "react"
import sensaLogo from "data-base64:../../assets/sensa-logo.png"
import { useUIHoverAudio } from "../hooks/useUIHoverAudio"

const getLevenshteinDistance = (a: string, b: string): number => {
  const tmp: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    tmp.push([i]);
  }
  for (let j = 0; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return tmp[a.length][b.length];
};

const fuzzyMatch = (text: string, target: string, maxDistance = 2): boolean => {
  if (text.includes(target)) return true;

  const tokens = text.split(/\s+/).filter(Boolean);
  const targetTokens = target.split(/\s+/).filter(Boolean);

  if (targetTokens.length === 1) {
    for (const t of tokens) {
      if (getLevenshteinDistance(t, target) <= maxDistance) return true;
    }
  } else {
    const n = targetTokens.length;
    for (let i = 0; i <= tokens.length - n; i++) {
      const ngram = tokens.slice(i, i + n).join(" ");
      if (getLevenshteinDistance(ngram, target) <= maxDistance) return true;
    }
  }
  return false;
};

const normalizeInput = (rawText: string): string => {
  let text = rawText.toLowerCase();
  text = text.replace(/[^a-z0-9\s]/gi, " ");
  text = text.replace(/\s+/g, " ").trim();
  const fillerWords = new Set(["the", "a", "please", "hey", "can", "you", "change", "set", "to", "my", "select", "sincere", "sansa", "sensor", "sensia"]);
  const tokens = text.split(" ").filter(t => !fillerWords.has(t));
  return tokens.join(" ");
};

interface ModeSelectionProps {
  theme: "light" | "dark"
  onSelectMode: (mode: "visual" | "auditory") => void
}

export default function ModeSelection({ theme, onSelectMode }: ModeSelectionProps) {
  const isDark = theme === "dark"
  const { playHoverAudio, cancelHoverAudio } = useUIHoverAudio()
  const [typedDescriptionCount, setTypedDescriptionCount] = useState(0)
  const [typedWordCount, setTypedWordCount] = useState(0)
  const [startDescription, setStartDescription] = useState(false)
  const [startSubtitle, setStartSubtitle] = useState(false)
  const [visibleCards, setVisibleCards] = useState(0)
  const selectedVoiceURIRef = useRef<string>("")
  const selectedVoiceNameRef = useRef<string>("")
  const voiceSettingsLoadedRef = useRef(false)
  const narrationStageRef = useRef<"idle" | "titleDone" | "descriptionDone" | "subtitleDone" | "cardsDone">("idle")
  const narrationCanceledRef = useRef(false)
  const pendingUtteranceRef = useRef<string | null>(null)
  const voiceRetryTimerRef = useRef<number | null>(null)
  const voiceReadyRetryRef = useRef<number | null>(null)
  const voicesChangedHandlerRef = useRef<(() => void) | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const isTTSPlayingRef = useRef(false)
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const commandReminderIntervalRef = useRef<number | null>(null)

  const springTransition = "transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]"

  const titleText = "Welcome to Sensa"
  const descriptionText = "A tailored accessibility layer that reads, guides, and adapts to you."
  const subtitleText = "Select your primary accessibility mode"
  const descriptionWords = useMemo(() => descriptionText.split(" "), [descriptionText])
  const subtitleWords = useMemo(() => subtitleText.split(" "), [subtitleText])
  const typedDescription = descriptionWords.slice(0, typedDescriptionCount).join(" ")
  const typedSubtitle = subtitleWords.slice(0, typedWordCount).join(" ")

  const visualCardText = "Visual Mode. Support low vision with guided reading and speech."
  const auditoryCardText = "Auditory Mode. Support hearing loss with captions and visualizer."
  const commandReminderText = "You can say, Visual Mode, or, Auditory Mode, to choose a primary accessibility mode."

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
    gain.gain.exponentialRampToValueAtTime(0.045, ctx.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.06)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.07)
  }

  const playPopSfx = () => {
    const ctx = getAudioContext()
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.setValueAtTime(520, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.12)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.07, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.16)
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

  useEffect(() => {
    chrome.storage.local.get(["sensa_visual_voice_uri", "sensa_visual_voice_name"], (res) => {
      if (typeof res.sensa_visual_voice_uri === "string") {
        selectedVoiceURIRef.current = res.sensa_visual_voice_uri
      }
      if (typeof res.sensa_visual_voice_name === "string") {
        selectedVoiceNameRef.current = res.sensa_visual_voice_name
      }
      voiceSettingsLoadedRef.current = true
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
    const sendVoiceBridgeMessage = (action: "start" | "stop") => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        // Find the first tab with an HTTP/HTTPS protocol, or fallback to the first active tab in current view.
        const activeTab = tabs?.find(t => t.url && (t.url.startsWith("http://") || t.url.startsWith("https://"))) || tabs?.[0]
        const tabId = activeTab?.id
        if (!tabId) {
          console.warn("[Sensa Debug] No active tab ID found, voice bridge message NOT sent.")
          return
        }
        if (activeTab.url && (activeTab.url.startsWith("chrome://") || activeTab.url.startsWith("edge://") || activeTab.url.startsWith("about:"))) {
          console.warn(`[Sensa Debug] Tab URL ${activeTab.url} is a restricted page. Voice bridge cannot be used here.`)
          return
        }
        chrome.tabs.sendMessage(tabId, { type: "sensa-mode-selection-voice", action }, (response) => {
          const err = chrome.runtime.lastError?.message
          if (err) {
            console.error("[Sensa Debug] Failed to send message to tab voice bridge:", err)
          }
        })
      })
    }

    const handleProfileVoiceSelect = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      const profileChange = changes.sensa_user_profile
      if (!profileChange?.newValue) return

      const activeMode = (profileChange.newValue as { globalSettings?: { activeMode?: string } }).globalSettings?.activeMode
      if (activeMode !== "visual" && activeMode !== "auditory") return

      narrationCanceledRef.current = true
      window.speechSynthesis.cancel()
      isTTSPlayingRef.current = false
      playPopSfx()
    }

    const handleTabLogMessage = (msg: any) => {
      if (msg && msg.type === "sensa-tab-log") {
        const prefix = `[Sensa Tab Log -> ${msg.level.toUpperCase()}]`
        if (msg.level === "error") {
          console.error(prefix, msg.message)
        } else if (msg.level === "warn") {
          console.warn(prefix, msg.message)
        } else {
          console.log(prefix, msg.message)
        }
      }
    }

    window.speechSynthesis.cancel()

    chrome.storage.local.set({ sensa_mode_selection_listening: true }, () => {
      sendVoiceBridgeMessage("start")
    })

    chrome.storage.onChanged.addListener(handleProfileVoiceSelect)
    chrome.runtime.onMessage.addListener(handleTabLogMessage)

    return () => {
      window.speechSynthesis.cancel()
      chrome.storage.onChanged.removeListener(handleProfileVoiceSelect)
      chrome.runtime.onMessage.removeListener(handleTabLogMessage)
      chrome.storage.local.set({ sensa_mode_selection_listening: false })
      sendVoiceBridgeMessage("stop")
    }
  }, [])

  // SpeechRecognition is completely handled by the active tab content script voice bridge, not in the popup.

  const speakWithResolvedVoice = (text: string, onDone: () => void) => {
    if (!text.trim()) {
      onDone()
      return
    }

    if (!voiceSettingsLoadedRef.current) {
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

    const voices = window.speechSynthesis.getVoices()
    if (!voices.length) {
      if (voicesChangedHandlerRef.current) {
        window.speechSynthesis.removeEventListener("voiceschanged", voicesChangedHandlerRef.current)
        voicesChangedHandlerRef.current = null
      }
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
      const handleVoicesChanged = () => {
        const pending = pendingUtteranceRef.current
        pendingUtteranceRef.current = null
        if (pending && !narrationCanceledRef.current) {
          speakWithResolvedVoice(pending, onDone)
        }
      }
      voicesChangedHandlerRef.current = handleVoicesChanged
      window.speechSynthesis.addEventListener("voiceschanged", handleVoicesChanged)
      return
    }

    const preferredVoice =
      voices.find((voice) => voice.voiceURI === selectedVoiceURIRef.current) ||
      voices.find((voice) => voice.name === selectedVoiceNameRef.current) ||
      voices.find((voice) => selectedVoiceNameRef.current && voice.name.includes(selectedVoiceNameRef.current))

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

    window.speechSynthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    activeUtteranceRef.current = utterance
    if (preferredVoice) {
      utterance.voice = preferredVoice
      utterance.lang = preferredVoice.lang
    }

    utterance.onstart = () => {
      isTTSPlayingRef.current = true
    }

    utterance.onend = () => {
      isTTSPlayingRef.current = false
      if (narrationCanceledRef.current) return
      onDone()
    }

    utterance.onerror = () => {
      isTTSPlayingRef.current = false
      if (narrationCanceledRef.current) return
      onDone()
    }

    window.speechSynthesis.speak(utterance)
  }

  const speakCardSequence = (index: number) => {
    if (index >= 2) {
      narrationStageRef.current = "cardsDone"
      // Announce available commands after a short pause
      window.setTimeout(() => {
        if (narrationCanceledRef.current) return
        speakWithResolvedVoice(commandReminderText, () => {
          // Start the 20-second reminder interval
          if (commandReminderIntervalRef.current !== null) {
            window.clearInterval(commandReminderIntervalRef.current)
          }
          commandReminderIntervalRef.current = window.setInterval(() => {
            if (narrationCanceledRef.current || isTTSPlayingRef.current) return
            speakWithResolvedVoice(commandReminderText, () => {})
          }, 30000)
        })
      }, 800)
      return
    }

    playPopSfx()
    setVisibleCards(index + 1)
    const line = index === 0 ? visualCardText : auditoryCardText
    speakWithResolvedVoice(line, () => {
      speakCardSequence(index + 1)
    })
  }

  useEffect(() => {
    if (narrationStageRef.current !== "idle") return

    narrationCanceledRef.current = false

    const narrationTimer = window.setTimeout(() => {
      if (narrationCanceledRef.current || narrationStageRef.current !== "idle") return
      narrationStageRef.current = "titleDone"
      speakWithResolvedVoice(titleText, () => {
        setStartDescription(true)
      })
    }, 350)

    return () => {
      window.clearTimeout(narrationTimer)
      narrationCanceledRef.current = true
      window.speechSynthesis.cancel()
      if (voiceRetryTimerRef.current !== null) {
        window.clearTimeout(voiceRetryTimerRef.current)
        voiceRetryTimerRef.current = null
      }
      if (voiceReadyRetryRef.current !== null) {
        window.clearInterval(voiceReadyRetryRef.current)
        voiceReadyRetryRef.current = null
      }
      if (voicesChangedHandlerRef.current) {
        window.speechSynthesis.removeEventListener("voiceschanged", voicesChangedHandlerRef.current)
        voicesChangedHandlerRef.current = null
      }
    }
  }, [titleText])

  useEffect(() => {
    if (!startDescription) return
    if (typedDescriptionCount >= descriptionWords.length) return

    const timer = window.setTimeout(() => {
      setTypedDescriptionCount((count) => Math.min(count + 1, descriptionWords.length))
    }, 140)

    return () => window.clearTimeout(timer)
  }, [descriptionWords.length, startDescription, typedDescriptionCount])

  useEffect(() => {
    if (!startDescription) return
    if (typedDescriptionCount === 0) return
    playTypingSfx()
  }, [startDescription, typedDescriptionCount])

  useEffect(() => {
    if (!startDescription) return
    if (typedDescriptionCount < descriptionWords.length) return
    if (narrationStageRef.current !== "titleDone") return

    narrationStageRef.current = "descriptionDone"
    speakWithResolvedVoice(descriptionText, () => {
      setStartSubtitle(true)
    })
  }, [descriptionText, descriptionWords.length, startDescription, typedDescriptionCount])

  useEffect(() => {
    if (!startSubtitle) return
    if (typedWordCount >= subtitleWords.length) return

    const timer = window.setTimeout(() => {
      setTypedWordCount((count) => Math.min(count + 1, subtitleWords.length))
    }, 140)

    return () => window.clearTimeout(timer)
  }, [startSubtitle, subtitleWords.length, typedWordCount])

  useEffect(() => {
    if (!startSubtitle) return
    if (typedWordCount === 0) return
    playTypingSfx()
  }, [startSubtitle, typedWordCount])

  useEffect(() => {
    if (!startSubtitle) return
    if (typedWordCount < subtitleWords.length) return
    if (narrationStageRef.current !== "descriptionDone") return

    narrationStageRef.current = "subtitleDone"
    speakWithResolvedVoice(subtitleText, () => {
      speakCardSequence(0)
    })
  }, [auditoryCardText, startSubtitle, subtitleText, subtitleWords.length, typedWordCount, visualCardText])

  useEffect(() => {
    return () => {
      narrationCanceledRef.current = true
      window.speechSynthesis.cancel()
      pendingUtteranceRef.current = null
      if (commandReminderIntervalRef.current !== null) {
        window.clearInterval(commandReminderIntervalRef.current)
        commandReminderIntervalRef.current = null
      }
      if (voiceRetryTimerRef.current !== null) {
        window.clearTimeout(voiceRetryTimerRef.current)
        voiceRetryTimerRef.current = null
      }
      if (voiceReadyRetryRef.current !== null) {
        window.clearInterval(voiceReadyRetryRef.current)
        voiceReadyRetryRef.current = null
      }
      if (voicesChangedHandlerRef.current) {
        window.speechSynthesis.removeEventListener("voiceschanged", voicesChangedHandlerRef.current)
        voicesChangedHandlerRef.current = null
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

  const handleSkipStep = (event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest("button")) return

    window.speechSynthesis.cancel()
    isTTSPlayingRef.current = false

    if (narrationStageRef.current === "idle") {
      narrationStageRef.current = "titleDone"
      setStartDescription(true)
      setTypedDescriptionCount(descriptionWords.length)
      return
    }

    if (!startDescription) {
      setStartDescription(true)
      setTypedDescriptionCount(descriptionWords.length)
      return
    }

    if (typedDescriptionCount < descriptionWords.length) {
      setTypedDescriptionCount(descriptionWords.length)
      return
    }

    if (!startSubtitle) {
      setStartSubtitle(true)
      setTypedWordCount(subtitleWords.length)
      return
    }

    if (typedWordCount < subtitleWords.length) {
      setTypedWordCount(subtitleWords.length)
      return
    }

    if (narrationStageRef.current === "subtitleDone") {
      if (visibleCards < 1) {
        setVisibleCards(1)
        return
      }
      if (visibleCards < 2) {
        setVisibleCards(2)
        return
      }
    }
  }

  return (
    <div
      className={`w-[350px] h-[550px] min-w-[350px] min-h-[550px] px-6 pt-3 pb-3 flex flex-col items-center justify-start font-sans select-none relative overflow-hidden transition-colors duration-500 ${isDark ? 'bg-[#1C1C1E] text-gray-200' : 'bg-gray-50 text-black'}`}
      onClick={handleSkipStep}
    >

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes pop-in {
          0% { opacity: 0; transform: translateY(10px) scale(0.98); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .animate-pop { animation: pop-in 0.7s cubic-bezier(0.23,1,0.32,1) forwards; opacity: 0; }
      `}} />

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes float-blue {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(20px, 30px) scale(1.1); }
        }
        @keyframes float-orange {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-20px, -30px) scale(1.1); }
        }
        
        @keyframes logo-light-flow {
          0% {
            filter: drop-shadow(0 0 0px transparent);
            opacity: 0.9;
          }
          25% {
            filter: drop-shadow(-8px -8px 12px rgba(10, 68, 255, 0.6));
            opacity: 1;
          }
          50% {
            filter: drop-shadow(0 0 20px rgba(10, 68, 255, 0.4));
            opacity: 0.95;
          }
          75% {
            filter: drop-shadow(8px 8px 12px rgba(255, 122, 47, 0.6));
            opacity: 1;
          }
          100% {
            filter: drop-shadow(0 0 0px transparent);
            opacity: 0.9;
          }
        }
        
        .animate-float-blue { animation: float-blue 8s ease-in-out infinite; }
        .animate-float-orange { animation: float-orange 8s ease-in-out infinite 0.5s; }
        .animate-logo-light { animation: logo-light-flow 4s ease-in-out infinite; }
      `}} />

      <div className={`absolute -top-16 -left-16 w-64 h-64 rounded-full mix-blend-multiply filter blur-[60px] animate-float-blue pointer-events-none transform-gpu ${isDark ? 'bg-[#0A44FF]/25' : 'bg-[#0A44FF]/15'}`} />

      <div className={`absolute -bottom-16 -right-16 w-64 h-64 rounded-full mix-blend-multiply filter blur-[60px] animate-float-orange pointer-events-none transform-gpu ${isDark ? 'bg-[#FF7A2F]/25' : 'bg-[#FF7A2F]/15'}`} />

      <div className="relative z-10 w-full flex flex-col items-center">

        <div className="flex flex-col items-center gap-1 mb-1 transform-gpu">
          <img
            src={sensaLogo}
            alt="Sensa Logo"
            className="w-[98px] h-[98px] object-contain drop-shadow-md animate-logo-light"
          />
          <h1 className="text-[30px] font-black tracking-tight leading-tight animate-pop bg-gradient-to-r from-[#0A44FF] to-[#FF7A2F] bg-clip-text text-transparent pb-0.5" style={{ animationDelay: "0.05s" }}>
            Welcome to Sensa
          </h1>
          <p className={`text-[13px] font-medium text-center leading-relaxed tracking-wide mb-1 animate-pop ${isDark ? 'text-gray-300/95' : 'text-gray-600/95'}`} style={{ animationDelay: "0.1s" }}>
            {typedDescription}
          </p>
          <p className={`font-bold text-center leading-snug mb-3.5 animate-pop text-[14.5px] tracking-tight ${isDark ? 'text-gray-400/90' : 'text-gray-500/90'}`} style={{ animationDelay: "0.16s" }}>
            {typedSubtitle}
          </p>
        </div>

        <div className="w-full flex flex-col gap-3 px-2 py-2">

          {visibleCards >= 1 && (
            <button
              onClick={() => onSelectMode("visual")}
              onMouseEnter={() => { playHoverSfx(); playHoverAudio("Visual Mode. Support low vision with guided reading and speech.") }}
              onFocus={() => { playHoverSfx(); playHoverAudio("Visual Mode. Support low vision with guided reading and speech.") }}
              onMouseLeave={cancelHoverAudio}
              onBlur={cancelHoverAudio}
              className={`w-full h-[114px] group relative flex items-center px-[20px] pt-[12px] pb-[18px] rounded-[22px] border-[2px] text-left transform-gpu focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0A44FF]/50 active:scale-95 animate-pop ${springTransition}
                ${isDark
                  ? 'backdrop-blur-md bg-[#24262B]/85 border-[#3A3F4A] hover:border-[#0A44FF] hover:bg-[#262A31]/90 shadow-[0_10px_26px_rgba(0,0,0,0.35)] hover:shadow-[0_14px_32px_rgba(10,68,255,0.28)]'
                  : 'backdrop-blur-md bg-white/80 border-[#E2E6F0] hover:border-[#0A44FF] hover:bg-white/95 shadow-[0_8px_22px_rgba(0,0,0,0.08)] hover:shadow-[0_12px_28px_rgba(10,68,255,0.2)]'
                }`}
              style={{ animationDelay: "0.2s" }}
            >
              <div className={`w-[50px] h-[50px] rounded-2xl flex items-center justify-center shrink-0 mr-4 ${springTransition} group-hover:scale-110 ${isDark ? 'bg-[#0A44FF]/22 text-[#6AA2FF]' : 'bg-[#0A44FF]/12 text-[#0A44FF]'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </div>

              <div className="flex flex-col">
                <h2 className={`text-[19px] font-extrabold tracking-tight mb-0.5 ${springTransition} ${isDark ? 'text-white group-hover:text-[#6AA2FF]' : 'text-gray-900 group-hover:text-[#0A44FF]'}`}>
                  Visual Mode
                </h2>
                <p className={`text-[12px] font-medium leading-[16px] ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  Support low vision with guided reading and speech.
                </p>
              </div>
            </button>
          )}

          {visibleCards >= 2 && (
            <button
              onClick={() => onSelectMode("auditory")}
              onMouseEnter={() => { playHoverSfx(); playHoverAudio("Auditory Mode. Support hearing loss with captions and visualizer.") }}
              onFocus={() => { playHoverSfx(); playHoverAudio("Auditory Mode. Support hearing loss with captions and visualizer.") }}
              onMouseLeave={cancelHoverAudio}
              onBlur={cancelHoverAudio}
              className={`w-full h-[114px] group relative flex items-center px-[20px] pt-[12px] pb-[18px] rounded-[22px] border-[2px] text-left transform-gpu focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#FF7A2F]/50 active:scale-95 animate-pop ${springTransition}
                ${isDark
                  ? 'backdrop-blur-md bg-[#24262B]/85 border-[#3A3F4A] hover:border-[#FF7A2F] hover:bg-[#262A31]/90 shadow-[0_10px_26px_rgba(0,0,0,0.35)] hover:shadow-[0_14px_32px_rgba(255,122,47,0.28)]'
                  : 'backdrop-blur-md bg-white/80 border-[#E2E6F0] hover:border-[#FF7A2F] hover:bg-white/95 shadow-[0_8px_22px_rgba(0,0,0,0.08)] hover:shadow-[0_12px_28px_rgba(255,122,47,0.2)]'
                }`}
              style={{ animationDelay: "0.28s" }}
            >
              <div className={`w-[50px] h-[50px] rounded-2xl flex items-center justify-center shrink-0 mr-4 ${springTransition} group-hover:scale-110 ${isDark ? 'bg-[#FF7A2F]/22 text-[#FFC09B]' : 'bg-[#FF7A2F]/12 text-[#FF7A2F]'}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 8.5a6.5 6.5 0 1 1 13 0c0 6-6 6-6 10a3.5 3.5 0 1 1-7 0" />
                  <path d="M15 8.5a2.5 2.5 0 0 0-5 0v1a2 2 0 1 1 0 4" />
                </svg>
              </div>

              <div className="flex flex-col">
                <h2 className={`text-[19px] font-extrabold tracking-tight mb-0.5 ${springTransition} ${isDark ? 'text-white group-hover:text-[#FFC09B]' : 'text-gray-900 group-hover:text-[#FF7A2F]'}`}>
                  Auditory Mode
                </h2>
                <p className={`text-[12px] font-medium leading-[16px] ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                  Support hearing loss with captions and visualizer.
                </p>
              </div>
            </button>
          )}

        </div>
      </div>
    </div>
  )
}