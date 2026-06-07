import React, { useState, useEffect, useRef } from "react"
import ColorPickerPopup from "./ColorPickerPopup"
import { useUIHoverAudio } from "../hooks/useUIHoverAudio"

const DEFAULT_HIGHLIGHT_COLOR = "#FFFE00"
const DEFAULT_INPUT_DEVICE_ID = "default"
const DEFAULT_OUTPUT_DEVICE_ID = "default"
const DEFAULT_WAKE_WORD = "Sensa"
const WAKE_WORD_LISTEN_MS = 8000
const WAKE_WORD_BAR_IDLE = [3, 5, 7, 5, 3]
const WAKE_WORD_BAR_COLOR = "#FFFFFF"

const extractFirstWakeWord = (text: string) => {
  const cleaned = text.trim().replace(/[^a-zA-Z0-9\s'-]/gi, "")
  const tokens = cleaned.split(/\s+/).filter(Boolean)
  if (!tokens.length) return ""
  
  const fillers = ["set", "to", "my", "word", "is", "the", "a", "this", "wake", "hello", "hey", "change", "please", "can", "you", "make"]
  const filtered = tokens.filter(t => !fillers.includes(t.toLowerCase()) && t.length >= 2)
  
  const target = filtered.length > 0 ? filtered[filtered.length - 1] : tokens[tokens.length - 1]
  if (!target) return ""
  return target.charAt(0).toUpperCase() + target.slice(1).toLowerCase()
}

function WakeWordMicButton({
  isListening,
  speechActive,
  onClick,
  disabled,
}: {
  isListening: boolean
  speechActive: boolean
  onClick: () => void
  disabled?: boolean
}) {
  const barsRef = useRef<(HTMLDivElement | null)[]>([])
  const currentHeights = useRef([...WAKE_WORD_BAR_IDLE])
  const tickRef = useRef(0)
  const isListeningRef = useRef(isListening)
  const speechActiveRef = useRef(speechActive)

  useEffect(() => {
    isListeningRef.current = isListening
  }, [isListening])

  useEffect(() => {
    speechActiveRef.current = speechActive
  }, [speechActive])

  useEffect(() => {
    if (!isListening) return

    let animationId = 0
    const idleHeights = [3, 5, 7, 5, 3]
    const maxHeights = [10, 15, 20, 15, 10]

    const draw = () => {
      animationId = requestAnimationFrame(draw)
      if (!isListeningRef.current || document.visibilityState !== "visible") return

      tickRef.current += 1
      const tick = tickRef.current
      const active = speechActiveRef.current

      barsRef.current.forEach((bar, i) => {
        if (!bar) return
        let targetHeight = idleHeights[i]

        if (active) {
          const distFromCenter = Math.abs(i - 2)
          const wave = (Math.sin(tick * 0.22 + i * 0.85) + 1) * 0.5
          const voiceSpike = (maxHeights[i] - idleHeights[i]) * wave * (1 - distFromCenter * 0.12)
          targetHeight = idleHeights[i] + voiceSpike
        }

        currentHeights.current[i] += (targetHeight - currentHeights.current[i]) * 0.28
        const intensity = (currentHeights.current[i] - idleHeights[i]) / (maxHeights[i] - idleHeights[i])
        const opacity = active ? Math.max(0.95, intensity + 0.75) : 0.5

        bar.style.height = `${Math.round(currentHeights.current[i])}px`
        bar.style.backgroundColor = WAKE_WORD_BAR_COLOR
        bar.style.boxShadow = active
          ? `0 0 ${5 + intensity * 10}px rgba(255, 255, 255, 0.9)`
          : "none"
        bar.style.opacity = `${opacity}`
      })
    }

    draw()

    return () => {
      if (animationId) cancelAnimationFrame(animationId)
      currentHeights.current = [...idleHeights]
      barsRef.current.forEach((bar, i) => {
        if (!bar) return
        bar.style.height = `${idleHeights[i]}px`
        bar.style.boxShadow = "none"
        bar.style.opacity = "0.45"
      })
    }
  }, [isListening, speechActive])

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      disabled={disabled}
      aria-label={isListening ? "Stop recording wake word" : "Record wake word with microphone"}
      aria-pressed={isListening}
      className={`absolute inset-y-0 right-1.5 my-auto flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#0A44FF]/50 disabled:cursor-not-allowed disabled:opacity-40 ${
        isListening
          ? "bg-gradient-to-br from-[#0A44FF] to-[#0099FF] text-white shadow-md shadow-[#0A44FF]/30"
          : "text-[#0A44FF]/70 hover:bg-[#0A44FF]/10 hover:text-[#0A44FF]"
      }`}
    >
      {isListening ? (
        <div className="flex items-center justify-center gap-[2px] w-[22px] h-[22px]" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((index) => (
            <div
              key={index}
              ref={(el) => { barsRef.current[index] = el }}
              className="w-[3px] rounded-full"
              style={{ height: WAKE_WORD_BAR_IDLE[index], backgroundColor: WAKE_WORD_BAR_COLOR, opacity: 0.5 }}
            />
          ))}
        </div>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
          <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
          <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
          <line x1="12" y1="19" x2="12" y2="22" />
        </svg>
      )}
    </button>
  )
}

interface VisualSettingsModalProps {
  onClose: () => void
  isDark?: boolean
}

export default function VisualSettingsModal({ onClose, isDark = false }: VisualSettingsModalProps) {
  const { playHoverAudio, playClickAudio, cancelHoverAudio } = useUIHoverAudio()
  const audioCtxRef = useRef<AudioContext | null>(null)
  const [isVoiceGuideEnabled, setIsVoiceGuideEnabled] = useState<boolean>(true)
  const isVoiceGuideEnabledRef = useRef(true)
  const highlightSoundDebounceRef = useRef<number | null>(null)
  const [isSoundEffectsEnabled, setIsSoundEffectsEnabled] = useState<boolean>(true)
  const isSoundEffectsEnabledRef = useRef<boolean>(true)
  
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [highlightColor, setHighlightColor] = useState(DEFAULT_HIGHLIGHT_COLOR)
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([])
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedInputDeviceId, setSelectedInputDeviceId] = useState(DEFAULT_INPUT_DEVICE_ID)
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState(DEFAULT_OUTPUT_DEVICE_ID)
  const [isAutoscrollEnabled, setIsAutoscrollEnabled] = useState(true)
  const [isHighlightMouseScreenReaderEnabled, setIsHighlightMouseScreenReaderEnabled] = useState(false)
  
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>("")
  const defaultVoiceURIRef = useRef<string>("")
  const defaultVoiceLabelRef = useRef<string>("")
  const defaultVoiceAppliedRef = useRef(false)
  const [isVoiceDropdownOpen, setIsVoiceDropdownOpen] = useState(false)
  const [wakeWord, setWakeWord] = useState(DEFAULT_WAKE_WORD)
  const [isCapturingWakeWord, setIsCapturingWakeWord] = useState(false)
  const [wakeWordSpeechActive, setWakeWordSpeechActive] = useState(false)
  const wakeWordCaptureRef = useRef<any>(null)
  const isWakeWordCapturingRef = useRef(false)
  const wakeWordCapturedRef = useRef(false)
  const wakeWordLatestTranscriptRef = useRef("")
  const wakeWordCaptureStartTimerRef = useRef<number | null>(null)
  const wakeWordListenTimeoutRef = useRef<number | null>(null)
  const wakeWordCaptureStartedAtRef = useRef(0)
  const pauseSettingsRecognitionRef = useRef<(() => void) | null>(null)
  const resumeSettingsRecognitionRef = useRef<(() => void) | null>(null)
  const settingsRecognitionArmedRef = useRef(false)

  const [isMounted, setIsMounted] = useState(false)
  const onCloseRef = useRef(onClose)
  const overlayStateRef = useRef({
    isVoiceGuideEnabled,
    showColorPicker,
    highlightColor,
    inputDevices,
    outputDevices,
    selectedInputDeviceId,
    selectedOutputDeviceId,
    isAutoscrollEnabled,
    isHighlightMouseScreenReaderEnabled,
    voices,
    selectedVoiceURI,
    isVoiceDropdownOpen,
  })

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
    isVoiceGuideEnabledRef.current = isVoiceGuideEnabled
  }, [isVoiceGuideEnabled])

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

  const playClickSfx = () => {
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

  const playToggleSfx = (enabled: boolean) => {
    if (enabled) playClickSfx()
    else playHoverSfx()
  }

  const selectedVoiceURIRef = useRef(selectedVoiceURI)
  const hasAnnouncedOpenRef = useRef(false)
  const speakSettingsGuideRef = useRef<(message: string) => void>(() => {})

  useEffect(() => {
    selectedVoiceURIRef.current = selectedVoiceURI
  }, [selectedVoiceURI])

  const speakSettingsGuide = React.useCallback((message: string) => {
    if (!message.trim()) return
    const speakNow = () => {
      const voices = window.speechSynthesis.getVoices()
      if (!voices.length) return false
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(message)
      const uri = selectedVoiceURIRef.current || defaultVoiceURIRef.current
      const preferred =
        (uri ? voices.find((voice) => voice.voiceURI === uri) : undefined) ||
        voices.find((voice) => voice.name.includes("Google US English"))
      if (preferred) {
        utterance.voice = preferred
        utterance.lang = preferred.lang
      }
      window.speechSynthesis.speak(utterance)
      return true
    }
    if (speakNow()) return
    const onVoicesChanged = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged)
      speakNow()
    }
    window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged)
  }, [])

  useEffect(() => {
    speakSettingsGuideRef.current = speakSettingsGuide
  }, [speakSettingsGuide])

  const announceIfVoiceGuide = (message: string) => {
    if (!isVoiceGuideEnabledRef.current) return
    speakSettingsGuide(message)
  }

  const getHoverHandlers = (label: string) => ({
    onMouseEnter: () => {
      playHoverSfx()
      if (isVoiceGuideEnabledRef.current) playHoverAudio(label)
    },
    onMouseLeave: cancelHoverAudio,
    onFocus: () => {
      playHoverSfx()
      if (isVoiceGuideEnabledRef.current) playHoverAudio(label)
    },
    onBlur: cancelHoverAudio
  })

  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [initialOffsetLoaded, setInitialOffsetLoaded] = useState(false)
  const offsetRef = useRef(offset)
  const draggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const offsetStartRef = useRef({ x: 0, y: 0 })

  useEffect(() => {
    requestAnimationFrame(() => setIsMounted(true))
  }, [])

  useEffect(() => {
    if (!isMounted || hasAnnouncedOpenRef.current) return
    playPopSfx()
    if (!isVoiceGuideEnabledRef.current) {
      hasAnnouncedOpenRef.current = true
      return
    }
    const voiceUri = selectedVoiceURI || defaultVoiceURIRef.current
    if (!voiceUri) return
    hasAnnouncedOpenRef.current = true
    speakSettingsGuide("Settings opened")
  }, [isMounted, selectedVoiceURI, speakSettingsGuide])

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
      if (highlightSoundDebounceRef.current !== null) {
        window.clearTimeout(highlightSoundDebounceRef.current)
        highlightSoundDebounceRef.current = null
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => undefined)
        audioCtxRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    overlayStateRef.current = {
      isVoiceGuideEnabled,
      showColorPicker,
      highlightColor,
      inputDevices,
      outputDevices,
      selectedInputDeviceId,
      selectedOutputDeviceId,
      isAutoscrollEnabled,
      isHighlightMouseScreenReaderEnabled,
      voices,
      selectedVoiceURI,
      isVoiceDropdownOpen,
    }
  }, [
    highlightColor,
    inputDevices,
    isAutoscrollEnabled,
    isHighlightMouseScreenReaderEnabled,
    isVoiceDropdownOpen,
    isVoiceGuideEnabled,
    outputDevices,
    selectedInputDeviceId,
    selectedOutputDeviceId,
    selectedVoiceURI,
    showColorPicker,
    voices,
  ])

  useEffect(() => {
    offsetRef.current = offset
  }, [offset])

  useEffect(() => {
    chrome.storage.local.get(["sensa_visual_settings_offset"], (res) => {
      if (res.sensa_visual_settings_offset) setOffset(res.sensa_visual_settings_offset)
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
      chrome.storage.local.set({ sensa_visual_settings_offset: offsetRef.current })
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
    if (target.closest("button, input, select, textarea, ul, li, label, [data-toggle-row]")) return
    e.preventDefault()
    draggingRef.current = true
    dragStartRef.current = { x: e.clientX, y: e.clientY }
    offsetStartRef.current = { x: offsetRef.current.x, y: offsetRef.current.y }
  }

  React.useEffect(() => {
    chrome.storage.local.get([
      "sensa_visual_highlight_color", 
      "sensa_visual_input_device_id", 
      "sensa_visual_output_device_id", 
      "sensa_visual_autoscroll_enabled",
      "sensa_visual_voice_guide_enabled",
      "sensa_visual_sound_effects_enabled",
      "sensa_visual_voice_uri",
      "sensa_visual_highlight_mouse_screen_reader",
      "sensa_visual_wake_word"
    ], (res) => {
      if (typeof res.sensa_visual_highlight_color === "string") setHighlightColor(res.sensa_visual_highlight_color)
      if (typeof res.sensa_visual_input_device_id === "string") setSelectedInputDeviceId(res.sensa_visual_input_device_id)
      if (typeof res.sensa_visual_output_device_id === "string") setSelectedOutputDeviceId(res.sensa_visual_output_device_id)
      if (typeof res.sensa_visual_autoscroll_enabled === "boolean") setIsAutoscrollEnabled(res.sensa_visual_autoscroll_enabled)
      if (typeof res.sensa_visual_voice_guide_enabled === "boolean") {
        setIsVoiceGuideEnabled(res.sensa_visual_voice_guide_enabled)
        isVoiceGuideEnabledRef.current = res.sensa_visual_voice_guide_enabled
      }
      if (typeof res.sensa_visual_sound_effects_enabled === "boolean") setIsSoundEffectsEnabled(res.sensa_visual_sound_effects_enabled)
      if (typeof res.sensa_visual_voice_uri === "string") setSelectedVoiceURI(res.sensa_visual_voice_uri)
      if (typeof res.sensa_visual_highlight_mouse_screen_reader === "boolean") setIsHighlightMouseScreenReaderEnabled(res.sensa_visual_highlight_mouse_screen_reader)
      if (typeof res.sensa_visual_wake_word === "string" && res.sensa_visual_wake_word.trim()) {
        setWakeWord(res.sensa_visual_wake_word.trim())
      }
    })
  }, [])

  const resumeSettingsVoiceRecognition = () => {
    window.setTimeout(() => resumeSettingsRecognitionRef.current?.(), 350)
  }

  const stopWakeWordCapture = (options?: { resumeSettings?: boolean }) => {
    if (wakeWordCaptureStartTimerRef.current !== null) {
      window.clearTimeout(wakeWordCaptureStartTimerRef.current)
      wakeWordCaptureStartTimerRef.current = null
    }
    if (wakeWordListenTimeoutRef.current !== null) {
      window.clearTimeout(wakeWordListenTimeoutRef.current)
      wakeWordListenTimeoutRef.current = null
    }
    isWakeWordCapturingRef.current = false
    wakeWordCapturedRef.current = false
    wakeWordLatestTranscriptRef.current = ""
    setWakeWordSpeechActive(false)
    setIsCapturingWakeWord(false)
    const recognition = wakeWordCaptureRef.current
    if (recognition) {
      wakeWordCaptureRef.current = null
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      try { recognition.stop() } catch {}
    }
    if (options?.resumeSettings !== false) {
      resumeSettingsVoiceRecognition()
    }
  }

  const announceWakeWordListenFailed = () => {
    announceIfVoiceGuide("No wake word heard, try again")
  }

  const applyCapturedWakeWord = (rawTranscript: string) => {
    if (wakeWordCapturedRef.current) return false
    const word = extractFirstWakeWord(rawTranscript)
    if (!word) return false
    wakeWordCapturedRef.current = true
    setWakeWord(word)
    chrome.storage.local.set({ sensa_visual_wake_word: word })
    playClickSfx()
    announceIfVoiceGuide(`Wake word set to ${word}`)
    stopWakeWordCapture()
    return true
  }

  const tryApplyWakeWordFromTranscript = (rawTranscript: string) => {
    if (wakeWordCapturedRef.current) return true
    return applyCapturedWakeWord(rawTranscript)
  }

  const beginWakeWordRecognition = () => {
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionCtor || !isWakeWordCapturingRef.current) return

    window.speechSynthesis.cancel()
    wakeWordCapturedRef.current = false
    wakeWordLatestTranscriptRef.current = ""
    setWakeWordSpeechActive(false)

    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = "en-US"
    wakeWordCaptureRef.current = recognition
    wakeWordCaptureStartedAtRef.current = Date.now()

    let captured = false
    const getListenElapsed = () => Date.now() - wakeWordCaptureStartedAtRef.current
    const hasListenTimeRemaining = () => getListenElapsed() < WAKE_WORD_LISTEN_MS

    const finishListenTimeout = () => {
      if (captured || wakeWordCapturedRef.current || !isWakeWordCapturingRef.current) return
      if (wakeWordLatestTranscriptRef.current && tryApplyWakeWordFromTranscript(wakeWordLatestTranscriptRef.current)) {
        captured = true
        return
      }
      stopWakeWordCapture()
      announceWakeWordListenFailed()
    }

    if (wakeWordListenTimeoutRef.current !== null) {
      window.clearTimeout(wakeWordListenTimeoutRef.current)
    }
    wakeWordListenTimeoutRef.current = window.setTimeout(finishListenTimeout, WAKE_WORD_LISTEN_MS)

    const restartListening = () => {
      if (captured || wakeWordCapturedRef.current || !isWakeWordCapturingRef.current || !hasListenTimeRemaining()) return
      if (wakeWordCaptureRef.current !== recognition) return
      try {
        recognition.start()
      } catch {
        window.setTimeout(() => {
          if (captured || wakeWordCapturedRef.current || !isWakeWordCapturingRef.current || !hasListenTimeRemaining()) return
          if (wakeWordCaptureRef.current !== recognition) return
          try { recognition.start() } catch {}
        }, 300)
      }
    }

    const markSpeechActive = () => setWakeWordSpeechActive(true)
    const markSpeechInactive = () => setWakeWordSpeechActive(false)

    recognition.onsoundstart = markSpeechActive
    recognition.onspeechstart = markSpeechActive
    recognition.onsoundend = markSpeechInactive
    recognition.onspeechend = () => {
      markSpeechInactive()
      if (captured || wakeWordCapturedRef.current) return
      const pending = wakeWordLatestTranscriptRef.current
      if (pending && tryApplyWakeWordFromTranscript(pending)) {
        captured = true
      }
    }

    recognition.onresult = (event: any) => {
      if (captured || wakeWordCapturedRef.current) return
      
      let newSpeech = ""
      for(let i = event.resultIndex; i < event.results.length; i++){
        newSpeech += event.results[i][0].transcript + " "
      }
      
      if (newSpeech.trim()) {
        wakeWordLatestTranscriptRef.current = newSpeech
        if (tryApplyWakeWordFromTranscript(newSpeech)) {
          captured = true
        }
      }
    }

    recognition.onerror = (event: any) => {
      if (event.error === "aborted") return
      if (event.error === "no-speech" || event.error === "audio-capture") {
        restartListening()
        return
      }
      if (!hasListenTimeRemaining()) {
        stopWakeWordCapture()
        announceIfVoiceGuide("Could not hear your wake word, try again")
        return
      }
      restartListening()
    }

    recognition.onend = () => {
      if (captured || wakeWordCapturedRef.current || !isWakeWordCapturingRef.current) return
      if (wakeWordCaptureRef.current !== recognition) return
      const pending = wakeWordLatestTranscriptRef.current
      if (pending && tryApplyWakeWordFromTranscript(pending)) {
        captured = true
        return
      }
      if (!hasListenTimeRemaining()) {
        wakeWordCaptureRef.current = null
        stopWakeWordCapture()
        announceWakeWordListenFailed()
        return
      }
      restartListening()
    }

    try {
      recognition.start()
    } catch {
      stopWakeWordCapture()
      announceIfVoiceGuide("Could not start microphone")
    }
  }

  const primeMicrophoneForWakeWord = async () => {
    const audio = {
      deviceId: selectedInputDeviceId && selectedInputDeviceId !== DEFAULT_INPUT_DEVICE_ID
        ? { exact: selectedInputDeviceId }
        : undefined,
      noiseSuppression: true,
      echoCancellation: true,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: 48000
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio })
    stream.getTracks().forEach((track) => track.stop())
  }

  const startWakeWordCapture = async () => {
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionCtor) {
      announceIfVoiceGuide("Speech recognition is not supported in this browser")
      return
    }
    stopWakeWordCapture({ resumeSettings: false })
    isWakeWordCapturingRef.current = true
    setIsCapturingWakeWord(true)
    playClickSfx()
    window.speechSynthesis.cancel()
    pauseSettingsRecognitionRef.current?.()
    try {
      await primeMicrophoneForWakeWord()
    } catch {
      stopWakeWordCapture()
      announceIfVoiceGuide("Microphone access is required to set a wake word")
      return
    }
    wakeWordCaptureStartTimerRef.current = window.setTimeout(() => {
      wakeWordCaptureStartTimerRef.current = null
      if (!isWakeWordCapturingRef.current) return
      beginWakeWordRecognition()
    }, 350)
  }

  const handleWakeWordMicToggle = () => {
    playClickSfx()
    if (isCapturingWakeWord) {
      stopWakeWordCapture()
      announceIfVoiceGuide("Wake word recording cancelled")
      return
    }
    startWakeWordCapture()
  }

  const handleWakeWordChange = (value: string) => {
    const trimmed = value.replace(/\s+/g, " ").trimStart()
    setWakeWord(trimmed)
    if (trimmed) {
      chrome.storage.local.set({ sensa_visual_wake_word: trimmed })
    }
  }

  useEffect(() => () => stopWakeWordCapture({ resumeSettings: false }), [])

  React.useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices()
      if (availableVoices.length > 0) {
        const defaultVoice = availableVoices.find((v) => v.name.includes("Google US English")) || availableVoices[0]
        defaultVoiceURIRef.current = defaultVoice?.voiceURI || ""
        defaultVoiceLabelRef.current = defaultVoice?.name || ""
        setVoices(availableVoices)
        setSelectedVoiceURI((prev) => {
          if (prev) return prev
          return defaultVoice?.voiceURI || ""
        })
        if (defaultVoice?.voiceURI && !defaultVoiceAppliedRef.current) {
          chrome.storage.local.get(["sensa_visual_voice_uri", "sensa_visual_voice_name"], (stored) => {
            const hasStored = typeof stored.sensa_visual_voice_uri === "string" && stored.sensa_visual_voice_uri.length > 0
            if (!hasStored) {
              chrome.storage.local.set({ sensa_visual_voice_uri: defaultVoice.voiceURI, sensa_visual_voice_name: defaultVoice.name || "" })
            }
            defaultVoiceAppliedRef.current = true
          })
        }
      }
    }
    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices
  }, [])

  React.useEffect(() => {
    const loadDevices = async () => {
      if (!navigator.mediaDevices?.enumerateDevices) return
      try {
        await navigator.mediaDevices.getUserMedia({
          audio: {
            noiseSuppression: true,
            echoCancellation: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: 48000
          }
        })
      } catch {}
      const devices = await navigator.mediaDevices.enumerateDevices()
      setInputDevices(devices.filter((d) => d.kind === "audioinput"))
      setOutputDevices(devices.filter((d) => d.kind === "audiooutput"))
    }
    loadDevices()
    const handleDeviceChange = () => loadDevices()
    navigator.mediaDevices?.addEventListener?.("devicechange", handleDeviceChange)
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", handleDeviceChange)
  }, [])

  useEffect(() => {
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionCtor) return

    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = "en-US"

    let isComponentMounted = true
    let restartTimer: number | null = null
    let consumedString = ""
    let currentResultIndex = 0

    const scheduleRestart = () => {
      if (!isComponentMounted || isWakeWordCapturingRef.current) return
      if (restartTimer) window.clearTimeout(restartTimer)
      restartTimer = window.setTimeout(() => {
        if (isWakeWordCapturingRef.current) return
        try { recognition.start() } catch {}
      }, 300)
    }

    pauseSettingsRecognitionRef.current = () => {
      if (restartTimer) {
        window.clearTimeout(restartTimer)
        restartTimer = null
      }
      try { recognition.stop() } catch {}
    }

    resumeSettingsRecognitionRef.current = () => {
      if (!isComponentMounted || isWakeWordCapturingRef.current) return
      scheduleRestart()
    }

    const speakFeedback = (message: string) => {
      if (!isVoiceGuideEnabledRef.current) return
      speakSettingsGuideRef.current(message)
    }

    const setSettingsState = (updater: (state: typeof overlayStateRef.current) => void) => {
      const nextState = { ...overlayStateRef.current }
      updater(nextState)
      overlayStateRef.current = nextState
    }

    const cycleVoice = (step: 1 | -1) => {
      const state = overlayStateRef.current
      if (!state.voices.length) return
      const currentIndex = Math.max(state.voices.findIndex((voice) => voice.voiceURI === state.selectedVoiceURI), 0)
      const nextVoice = state.voices[(currentIndex + step + state.voices.length) % state.voices.length]
      if (!nextVoice) return
      setSelectedVoiceURI(nextVoice.voiceURI)
      chrome.storage.local.set({ sensa_visual_voice_uri: nextVoice.voiceURI, sensa_visual_voice_name: nextVoice.name || "" })
      setIsVoiceDropdownOpen(false)
      window.speechSynthesis.cancel()
      speakFeedback(`${nextVoice.name} selected`)
      setSettingsState((state) => {
        state.selectedVoiceURI = nextVoice.voiceURI
        state.isVoiceDropdownOpen = false
      })
    }

    const cycleDevice = (kind: "input" | "output", step: 1 | -1) => {
      const state = overlayStateRef.current
      const devices = kind === "input" ? state.inputDevices : state.outputDevices
      const currentId = kind === "input" ? state.selectedInputDeviceId : state.selectedOutputDeviceId
      const defaultDevice = {
        deviceId: DEFAULT_INPUT_DEVICE_ID,
        label: kind === "input" ? "Default - Microphone" : "Default - Speaker",
      }
      const options = [defaultDevice, ...devices]
      if (!options.length) return
      const currentIndex = Math.max(options.findIndex((device) => device.deviceId === currentId), 0)
      const nextDevice = options[(currentIndex + step + options.length) % options.length]
      if (!nextDevice) return
      if (kind === "input") {
        setSelectedInputDeviceId(nextDevice.deviceId)
        chrome.storage.local.set({ sensa_visual_input_device_id: nextDevice.deviceId })
      } else {
        setSelectedOutputDeviceId(nextDevice.deviceId)
        chrome.storage.local.set({ sensa_visual_output_device_id: nextDevice.deviceId })
      }
      speakFeedback(nextDevice.label || `${kind} device selected`)
    }

    const voiceSelectionMatches = (text: string) => {
      const cleanText = text.toLowerCase()
      const matchedVoice = overlayStateRef.current.voices.find((voice) => {
        const name = (voice.name || "").toLowerCase()
        return cleanText.includes(name) || name.includes(cleanText)
      })
      if (!matchedVoice) return false
      setSelectedVoiceURI(matchedVoice.voiceURI)
      chrome.storage.local.set({ sensa_visual_voice_uri: matchedVoice.voiceURI, sensa_visual_voice_name: matchedVoice.name || "" })
      setIsVoiceDropdownOpen(false)
      window.speechSynthesis.cancel()
      speakFeedback(`${matchedVoice.name} selected`)
      setSettingsState((state) => {
        state.selectedVoiceURI = matchedVoice.voiceURI
        state.isVoiceDropdownOpen = false
      })
      return true
    }

    recognition.onstart = () => {
      settingsRecognitionArmedRef.current = true
    }

    recognition.onresult = (event: any) => {
      if (!settingsRecognitionArmedRef.current || isWakeWordCapturingRef.current) return

      if (event.resultIndex !== currentResultIndex) {
        consumedString = ""
        currentResultIndex = event.resultIndex
      }

      let liveText = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        liveText += event.results[i][0].transcript + " "
      }
      liveText = liveText.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()

      let newSpeech = liveText
      if (liveText.startsWith(consumedString) && consumedString.length > 0) {
        newSpeech = liveText.slice(consumedString.length).trim()
      }

      if (!newSpeech) return
      const paddedSpeech = ` ${newSpeech} `
      const check = (...words: string[]) => words.some(w => paddedSpeech.includes(` ${w} `))

      const state = overlayStateRef.current
      let commandFired = false

      if (state.isVoiceDropdownOpen) {
        if (check("close voice selection", "close dropdown", "cancel", "hide voices")) {
          commandFired = true
          setIsVoiceDropdownOpen(false)
          setSettingsState((next) => { next.isVoiceDropdownOpen = false })
          speakFeedback("Voice selection closed")
        } else if (check("next voice", "voice next", "next selection")) {
          commandFired = true
          cycleVoice(1)
        } else if (check("previous voice", "prev voice", "last voice")) {
          commandFired = true
          cycleVoice(-1)
        } else if (voiceSelectionMatches(newSpeech)) {
          commandFired = true
        }
      } else {
        const wantsOn = check("on", "enable", "enabled", "turn on", "activate")
        const wantsOff = check("off", "disable", "disabled", "turn off", "deactivate")

        if (check("close settings", "close", "cancel", "back", "exit")) {
          commandFired = true
          setIsMounted(false)
          setTimeout(() => onCloseRef.current(), 300)
        } else if (check("reset default", "reset defaults", "restore defaults", "reset settings")) {
          commandFired = true
          handleResetToDefault()
        } else if (check("voice guide", "voice guidance")) {
          commandFired = true
          handleVoiceGuideToggle(wantsOff ? false : wantsOn ? true : !state.isVoiceGuideEnabled)
        } else if (check("mouse reader", "mouse highlight reader", "mouse highlight")) {
          commandFired = true
          handleHighlightMouseScreenReaderToggle(wantsOff ? false : wantsOn ? true : !state.isHighlightMouseScreenReaderEnabled)
        } else if (check("autoscroll", "auto scroll", "scroll reading")) {
          commandFired = true
          handleAutoscrollToggle(wantsOff ? false : wantsOn ? true : !state.isAutoscrollEnabled)
        } else if (check("highlight color", "color picker", "pick color")) {
          commandFired = true
          setShowColorPicker(true)
          speakFeedback("Highlight color opened")
        } else if (check("voice selection", "select voice", "voice voices")) {
          commandFired = true
          setIsVoiceDropdownOpen(true)
          speakFeedback("Voice selection opened")
        } else if (check("next input", "next microphone", "input next")) {
          commandFired = true
          cycleDevice("input", 1)
        } else if (check("previous input", "prev input", "previous microphone")) {
          commandFired = true
          cycleDevice("input", -1)
        } else if (check("next output", "next speaker", "output next")) {
          commandFired = true
          cycleDevice("output", 1)
        } else if (check("previous output", "prev output", "previous speaker")) {
          commandFired = true
          cycleDevice("output", -1)
        }
      }

      if (commandFired) {
        consumedString = liveText
      }
    }

    recognition.onerror = (event: any) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed" || event.error === "aborted") return
      scheduleRestart()
    }

    recognition.onend = () => scheduleRestart()

    const initialStartTimer = window.setTimeout(() => {
      if (!isComponentMounted || isWakeWordCapturingRef.current) return
      try { recognition.start() } catch {}
    }, 1500)

    return () => {
      isComponentMounted = false
      settingsRecognitionArmedRef.current = false
      window.clearTimeout(initialStartTimer)
      pauseSettingsRecognitionRef.current = null
      resumeSettingsRecognitionRef.current = null
      if (restartTimer) window.clearTimeout(restartTimer)
      try { recognition.stop() } catch {}
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
    }
  }, [playClickAudio])

  const handleHighlightChange = (color: string) => {
    const normalizedNew = color.toUpperCase()
    const normalizedPrev = (highlightColor || "").toUpperCase()
    if (normalizedNew === normalizedPrev) return
    setHighlightColor(color)
    chrome.storage.local.set({ sensa_visual_highlight_color: color })
    if (highlightSoundDebounceRef.current !== null) {
      window.clearTimeout(highlightSoundDebounceRef.current)
    }
    highlightSoundDebounceRef.current = window.setTimeout(() => {
      highlightSoundDebounceRef.current = null
      playClickSfx()
      playClickAudio("Highlight color changed")
    }, 220)
  }

  const handleInputDeviceChange = (deviceId: string) => {
    playClickSfx()
    setSelectedInputDeviceId(deviceId)
    chrome.storage.local.set({ sensa_visual_input_device_id: deviceId })
    const label = inputDevices.find(d => d.deviceId === deviceId)?.label || "Input device selected"
    playClickAudio(label)
  }

  const handleOutputDeviceChange = (deviceId: string) => {
    playClickSfx()
    setSelectedOutputDeviceId(deviceId)
    chrome.storage.local.set({ sensa_visual_output_device_id: deviceId })
    const label = outputDevices.find(d => d.deviceId === deviceId)?.label || "Output device selected"
    playClickAudio(label)
  }

  const handleAutoscrollToggle = (enabled: boolean) => {
    playToggleSfx(enabled)
    setIsAutoscrollEnabled(enabled)
    chrome.storage.local.set({ sensa_visual_autoscroll_enabled: enabled })
    playClickAudio(enabled ? "Autoscroll enabled" : "Autoscroll disabled")
  }

  const handleHighlightMouseScreenReaderToggle = (enabled: boolean) => {
    playToggleSfx(enabled)
    setIsHighlightMouseScreenReaderEnabled(enabled)
    chrome.storage.local.set({ sensa_visual_highlight_mouse_screen_reader: enabled })
    playClickAudio(enabled ? "Mouse reader enabled" : "Mouse reader disabled")
  }

  const handleVoiceGuideToggle = (enabled: boolean) => {
    playToggleSfx(enabled)
    setIsVoiceGuideEnabled(enabled)
    chrome.storage.local.set({ sensa_visual_voice_guide_enabled: enabled })
    playClickAudio(enabled ? "Voice guide enabled" : "Voice guide disabled")
  }

  const handleSoundEffectsToggle = (enabled: boolean) => {
    setIsSoundEffectsEnabled(enabled)
    chrome.storage.local.set({ sensa_visual_sound_effects_enabled: enabled })
    playClickAudio(enabled ? "Sound effects enabled" : "Sound effects disabled")
    if (!enabled && audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => undefined)
      audioCtxRef.current = null
    }
  }

  const handleVoiceChange = (voiceURI: string) => {
    playClickSfx()
    setSelectedVoiceURI(voiceURI)
    const selected = voices.find((voice) => voice.voiceURI === voiceURI)
    chrome.storage.local.set({ sensa_visual_voice_uri: voiceURI, sensa_visual_voice_name: selected?.name || "" })
    playClickAudio(`Voice set to ${selected?.name || 'selected voice'}`)
  }

  const handleResetToDefault = () => {
    playClickSfx()
    const defaultVoice = voices.find((voice) => voice.name.includes("Google US English")) || voices[0]
    const defaultVoiceURI = defaultVoice?.voiceURI || ""
    setShowColorPicker(false)
    setIsVoiceDropdownOpen(false)
    setHighlightColor(DEFAULT_HIGHLIGHT_COLOR)
    setSelectedInputDeviceId(DEFAULT_INPUT_DEVICE_ID)
    setSelectedOutputDeviceId(DEFAULT_OUTPUT_DEVICE_ID)
    setIsAutoscrollEnabled(true)
    setIsHighlightMouseScreenReaderEnabled(false)
    setSelectedVoiceURI(defaultVoiceURI)
    setWakeWord(DEFAULT_WAKE_WORD)
    stopWakeWordCapture()
    chrome.storage.local.set({
      sensa_visual_highlight_color: DEFAULT_HIGHLIGHT_COLOR,
      sensa_visual_input_device_id: DEFAULT_INPUT_DEVICE_ID,
      sensa_visual_output_device_id: DEFAULT_OUTPUT_DEVICE_ID,
      sensa_visual_autoscroll_enabled: true,
      sensa_visual_highlight_mouse_screen_reader: false,
      sensa_visual_voice_uri: defaultVoiceURI,
      sensa_visual_voice_name: defaultVoice?.name || "",
      sensa_visual_wake_word: DEFAULT_WAKE_WORD
    })
    playClickAudio("Settings reset to default")
  }

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      playClickSfx()
      announceIfVoiceGuide("Closing settings")
      setIsMounted(false)
      setTimeout(onClose, 300)
    }
  }

  const previewVoice = (voice: SpeechSynthesisVoice) => {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(voice.name)
    utterance.voice = voice
    window.speechSynthesis.speak(utterance)
  }

  const modalBg = isDark ? "bg-[#141416]/96 backdrop-blur-3xl border-white/10" : "bg-white/95 backdrop-blur-3xl border-white/40"
  const textColor = isDark ? "text-gray-100" : "text-gray-900"
  const labelColor = isDark ? "text-gray-200" : "text-gray-700"
  const inputBg = isDark ? "bg-[#2C2C2E]/60 hover:bg-[#2C2C2E]" : "bg-white/60 hover:bg-white"
  const inputBorder = isDark ? "border-white/10" : "border-black/5"
  const secondaryText = isDark ? "text-gray-400" : "text-gray-500"
  const dividerClass = isDark ? "border-white/10" : "border-black/5"
  const iconColor = isDark ? "text-[#0A44FF]" : "text-[#0A44FF]"
  const toggleSwitchClass = isDark
    ? "relative inline-block w-12 h-7 rounded-full bg-gray-600 shadow-inner peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#0A44FF]/50 peer-checked:bg-gradient-to-r peer-checked:from-[#0A44FF] peer-checked:to-[#0099FF] peer-checked:after:translate-x-[20px] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-white/20 after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:after:border-white"
    : "relative inline-block w-12 h-7 rounded-full bg-gray-300 shadow-inner peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#0A44FF]/50 peer-checked:bg-gradient-to-r peer-checked:from-[#0A44FF] peer-checked:to-[#0099FF] peer-checked:after:translate-x-[20px] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border after:border-gray-200 after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:after:border-white"

  return (
    <div 
      onClick={handleBackdropClick} 
      className={`fixed inset-0 z-[999999] flex items-center justify-center bg-black/30 backdrop-blur-sm font-sans transition-opacity duration-300 ${isMounted ? 'opacity-100' : 'opacity-0'}`}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`relative w-[480px] ${modalBg} rounded-[32px] border p-8 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.3),_0_0_2px_rgba(255,255,255,0.2)_inset] transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] ${isMounted ? 'scale-100 translate-y-0' : 'scale-[0.95] translate-y-4'}`}
        onMouseDown={onHeaderMouseDown}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${isMounted ? 1 : 0.95})`,
          cursor: draggingRef.current ? "grabbing" : "grab",
          visibility: initialOffsetLoaded ? "visible" : "hidden"
        }}
      >
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 rounded-full bg-gray-400/30 pointer-events-none" />

        <div className="flex justify-between items-center mb-8 mt-2">
          <h2 className="text-[26px] font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-[#0A44FF] to-[#0099FF]">
            Visual Settings
          </h2>
          <button 
            onClick={() => {
              playClickSfx()
              announceIfVoiceGuide("Closing settings")
              setIsMounted(false)
              setTimeout(onClose, 300)
            }}
            className={`bg-transparent hover:bg-black/5 dark:hover:bg-white/10 text-gray-400 hover:${textColor} transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A44FF]/50 rounded-full p-2`}
            aria-label="Close settings"
            {...getHoverHandlers("Close")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-3">
          
          <label
            className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer`}
            {...getHoverHandlers("Voice Guide")}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 pointer-events-none">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
              <span className={`text-[15px] font-semibold tracking-wide ${labelColor}`}>Voice Guide</span>
            </div>
            <span className="relative inline-flex items-center shrink-0 pointer-events-none">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={isVoiceGuideEnabled}
                onChange={(e) => handleVoiceGuideToggle(e.target.checked)}
              />
              <span className={toggleSwitchClass} aria-hidden="true" />
            </span>
          </label>

          <label
            className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer`}
            {...getHoverHandlers("Sound Effects")}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 pointer-events-none">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M19 9a5 5 0 0 1 0 6"/><path d="M21 7a9 9 0 0 1 0 10"/></svg>
              <span className={`text-[15px] font-semibold tracking-wide ${labelColor}`}>Sound Effects</span>
            </div>
            <span className="relative inline-flex items-center shrink-0 pointer-events-none">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={isSoundEffectsEnabled}
                onChange={(e) => handleSoundEffectsToggle(e.target.checked)}
              />
              <span className={toggleSwitchClass} aria-hidden="true" />
            </span>
          </label>

          <div 
            className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} relative z-50 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors`}
            {...getHoverHandlers("Voice Selection")}
          >
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><line x1="4" y1="6" x2="4" y2="18"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="12" y1="4" x2="12" y2="20"/><line x1="16" y1="8" x2="16" y2="16"/><line x1="20" y1="11" x2="20" y2="13"/></svg>
              <span className={`text-[15px] font-semibold tracking-wide ${labelColor}`}>Voice Selection</span>
            </div>
            <div className="relative w-[190px]">
              <button 
                type="button"
                onClick={(e) => { e.stopPropagation(); playClickSfx(); setIsVoiceDropdownOpen((prev) => !prev); playClickAudio("Voice selection") }}
                className={`w-full text-left border ${inputBorder} ${textColor} ${inputBg} shadow-sm h-11 pl-4 pr-8 rounded-xl text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-[#0A44FF]/40 cursor-pointer transition-all hover:shadow-md`}
                aria-haspopup="listbox"
                aria-expanded={isVoiceDropdownOpen}
              >
                <span className="block truncate">
                  {(() => {
                    const selected = voices.find((v) => v.voiceURI === selectedVoiceURI)
                    if (!selected) return "Loading..."
                    const isDefault = selected.voiceURI === defaultVoiceURIRef.current
                    return `${selected.name}${isDefault ? " (Default)" : ""}`
                  })()}
                </span>
                <div className={`pointer-events-none absolute inset-y-0 right-3 flex items-center ${secondaryText}`}>
                  <svg className={`fill-current h-4 w-4 transition-transform duration-300 ${isVoiceDropdownOpen ? "rotate-180" : ""}`} viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
              </button>

              {isVoiceDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setIsVoiceDropdownOpen(false); window.speechSynthesis.cancel() }} />
                  <ul className={`absolute right-0 z-50 mt-2 w-[240px] max-h-56 overflow-y-auto ${modalBg} border ${inputBorder} rounded-xl shadow-2xl py-2 text-[13px] custom-scrollbar`} role="listbox">
                    {voices.map((voice) => (
                      <li 
                        key={voice.voiceURI}
                        role="option"
                        aria-selected={selectedVoiceURI === voice.voiceURI}
                        className={`px-4 py-2.5 cursor-pointer block w-full text-left truncate transition-all font-medium m-1 rounded-lg ${selectedVoiceURI === voice.voiceURI ? "bg-gradient-to-r from-[#0A44FF] to-[#0099FF] text-white shadow-md" : isDark ? "text-gray-200 hover:bg-[#0A44FF]/20 hover:text-[#0A44FF]" : "text-gray-700 hover:bg-[#0A44FF]/10 hover:text-[#0A44FF]"}`}
                        onMouseEnter={() => { playHoverSfx(); previewVoice(voice) }}
                        onClick={() => { handleVoiceChange(voice.voiceURI); setIsVoiceDropdownOpen(false); window.speechSynthesis.cancel() }}
                        style={{ fontFamily: `"${voice.name}", system-ui, sans-serif` }}
                      >
                        {voice.name}{voice.voiceURI === defaultVoiceURIRef.current ? " (Default)" : ""}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>

          <div 
            className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors`}
            {...getHoverHandlers("Wake Word")}
          >
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><path d="M12 2l1.6 3.6L17 7l-3.4 1.4L12 12l-1.6-3.6L7 7l3.4-1.4L12 2z"/><path d="M4 14l.9 2 2 .9-2 .9-.9 2-.9-2-2-.9 2-.9.9-2z"/></svg>
              <span className={`text-[15px] font-semibold tracking-wide ${labelColor}`}>Wake Word</span>
            </div>
            <div className="relative w-[190px]">
              <input
                type="text"
                value={wakeWord}
                onChange={(e) => handleWakeWordChange(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                placeholder="e.g. Sensa"
                aria-label="Wake Word"
                disabled={isCapturingWakeWord}
                className={`w-full border ${inputBorder} ${textColor} ${inputBg} shadow-sm h-11 pl-4 pr-12 rounded-xl text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-[#0A44FF]/40 transition-all hover:shadow-md disabled:opacity-70 ${
                  isCapturingWakeWord ? "ring-2 ring-[#0A44FF]/50" : ""
                }`}
              />
              <WakeWordMicButton
                isListening={isCapturingWakeWord}
                speechActive={wakeWordSpeechActive}
                onClick={handleWakeWordMicToggle}
                disabled={!(window as any).SpeechRecognition && !(window as any).webkitSpeechRecognition}
              />
            </div>
          </div>

          <label
            className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer`}
            {...getHoverHandlers("Mouse Highlight Reader")}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 pointer-events-none">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>
              <span className={`text-[15px] font-semibold tracking-wide ${labelColor}`}>Mouse Reader</span>
            </div>
            <span className="relative inline-flex items-center shrink-0 pointer-events-none">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={isHighlightMouseScreenReaderEnabled}
                onChange={(e) => handleHighlightMouseScreenReaderToggle(e.target.checked)}
              />
              <span className={toggleSwitchClass} aria-hidden="true" />
            </span>
          </label>

          <label
            className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer`}
            {...getHoverHandlers("Autoscroll reading")}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 pointer-events-none">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><rect x="5" y="4" width="14" height="16" rx="2"/><path d="M12 7l2 2-2 2"/><path d="M12 17l-2-2 2-2"/></svg>
              <span className={`text-[15px] font-semibold tracking-wide ${labelColor}`}>Autoscroll Reading</span>
            </div>
            <span className="relative inline-flex items-center shrink-0 pointer-events-none">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={isAutoscrollEnabled}
                onChange={(e) => handleAutoscrollToggle(e.target.checked)}
              />
              <span className={toggleSwitchClass} aria-hidden="true" />
            </span>
          </label>

          <div 
            className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} relative hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors`}
            {...getHoverHandlers("Highlight color")}
          >
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><path d="M14.5 4.5l5 5"/><path d="M11 8l-7 7-1 4 4-1 7-7"/><path d="M14 7l3 3"/></svg>
              <span className={`text-[15px] font-semibold tracking-wide ${labelColor}`}>Highlight Color</span>
            </div>
            <div className="relative flex items-center justify-end w-[190px]">
              <button 
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); playClickSfx(); setShowColorPicker((prev) => !prev); playClickAudio(showColorPicker ? "Highlight color closed" : "Highlight color opened") }}
                className="w-10 h-10 rounded-full cursor-pointer shadow-[0_4px_12px_rgba(0,0,0,0.15)] border-2 border-white/40 ring-2 ring-black/5 focus:outline-none focus:ring-4 focus:ring-[#0A44FF]/50 transition-all active:scale-90 hover:scale-105"
                style={{ backgroundColor: highlightColor }}
                aria-label="Pick highlight color"
              />
              {showColorPicker && (
                <ColorPickerPopup
                  isDark={isDark} initialColor={highlightColor}
                  onColorChange={handleHighlightChange} onClose={() => setShowColorPicker(false)}
                  placement="end"
                />
              )}
            </div>
          </div>

          <div 
            className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors`}
            {...getHoverHandlers("Input Device")}
          >
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
              <span className={`text-[15px] font-semibold tracking-wide ${labelColor}`}>Input Device</span>
            </div>
            <div className="relative w-[190px]">
              <select
                value={selectedInputDeviceId} onChange={(e) => handleInputDeviceChange(e.target.value)} aria-label="Input Device"
                className={`appearance-none w-full border ${inputBorder} ${textColor} ${inputBg} shadow-sm h-11 pl-4 pr-8 rounded-xl text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-[#0A44FF]/40 cursor-pointer transition-all hover:shadow-md`}
              >
                <option value="default">Default - Microphone</option>
                {inputDevices.map((d, i) => <option key={d.deviceId || `in-${i}`} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>)}
              </select>
              <div className={`pointer-events-none absolute inset-y-0 right-3 flex items-center ${secondaryText}`}>
                <svg className="fill-current h-4 w-4" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
              </div>
            </div>
          </div>

          <div 
            className={`flex items-center justify-between py-3 px-3 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors`}
            {...getHoverHandlers("Output Device")}
          >
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              <span className={`text-[15px] font-semibold tracking-wide ${labelColor}`}>Output Device</span>
            </div>
            <div className="relative w-[190px]">
              <select
                value={selectedOutputDeviceId} onChange={(e) => handleOutputDeviceChange(e.target.value)} aria-label="Output Device"
                className={`appearance-none w-full border ${inputBorder} ${textColor} ${inputBg} shadow-sm h-11 pl-4 pr-8 rounded-xl text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-[#0A44FF]/40 cursor-pointer transition-all hover:shadow-md`}
              >
                <option value="default">Default - Speaker</option>
                {outputDevices.map((d, i) => <option key={d.deviceId || `out-${i}`} value={d.deviceId}>{d.label || `Speaker ${i + 1}`}</option>)}
              </select>
              <div className={`pointer-events-none absolute inset-y-0 right-3 flex items-center ${secondaryText}`}>
                <svg className="fill-current h-4 w-4" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
              </div>
            </div>
          </div>

        </div>

        <div className="mt-8 flex justify-center">
          <button 
            type="button"
            onClick={handleResetToDefault}
            className={`flex items-center gap-2 bg-transparent hover:bg-[#0A44FF]/10 hover:text-[#0A44FF] hover:border-[#0A44FF]/30 dark:hover:bg-[#0A44FF]/20 dark:hover:border-[#0A44FF]/40 ${textColor} border ${inputBorder} font-semibold h-11 px-8 rounded-xl transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A44FF]/50 text-[14px] tracking-wide hover:shadow-sm`}
            {...getHoverHandlers("Reset to default")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><polyline points="3 3 3 8 8 8"/></svg>
            Restore Defaults
          </button>
        </div>

      </div>
    </div>
  )
}