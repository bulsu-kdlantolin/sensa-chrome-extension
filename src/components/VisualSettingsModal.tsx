import React, { useState, useEffect, useRef } from "react"
import ColorPickerPopup from "./ColorPickerPopup"
import { useUIHoverAudio } from "../hooks/useUIHoverAudio"

const DEFAULT_HIGHLIGHT_COLOR = "#FFFE00"
const DEFAULT_INPUT_DEVICE_ID = "default"
const DEFAULT_OUTPUT_DEVICE_ID = "default"

interface VisualSettingsModalProps {
  onClose: () => void
  isDark?: boolean
}

export default function VisualSettingsModal({ onClose, isDark = false }: VisualSettingsModalProps) {
  const { playHoverAudio, playClickAudio, cancelHoverAudio } = useUIHoverAudio()
  const [isVoiceGuideEnabled, setIsVoiceGuideEnabled] = useState<boolean>(true)
  
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

  const getHoverHandlers = (label: string) => ({
    onMouseEnter: () => playHoverAudio(label),
    onMouseLeave: cancelHoverAudio,
    onFocus: () => playHoverAudio(label),
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
    if (isMounted) {
      playClickAudio("Settings opened")
    }
  }, [isMounted, playClickAudio])

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
    if (target.closest("button, input, select, textarea, ul, li")) return
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
      "sensa_visual_voice_uri",
      "sensa_visual_highlight_mouse_screen_reader"
    ], (res) => {
      if (typeof res.sensa_visual_highlight_color === "string") setHighlightColor(res.sensa_visual_highlight_color)
      if (typeof res.sensa_visual_input_device_id === "string") setSelectedInputDeviceId(res.sensa_visual_input_device_id)
      if (typeof res.sensa_visual_output_device_id === "string") setSelectedOutputDeviceId(res.sensa_visual_output_device_id)
      if (typeof res.sensa_visual_autoscroll_enabled === "boolean") setIsAutoscrollEnabled(res.sensa_visual_autoscroll_enabled)
      if (typeof res.sensa_visual_voice_guide_enabled === "boolean") setIsVoiceGuideEnabled(res.sensa_visual_voice_guide_enabled)
      if (typeof res.sensa_visual_voice_uri === "string") setSelectedVoiceURI(res.sensa_visual_voice_uri)
      if (typeof res.sensa_visual_highlight_mouse_screen_reader === "boolean") setIsHighlightMouseScreenReaderEnabled(res.sensa_visual_highlight_mouse_screen_reader)
    })
  }, [])

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
        await navigator.mediaDevices.getUserMedia({ audio: true })
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
    const lastExecutedRef = { current: {} as Record<string, number> }
    const lastTranscriptRef = { current: {} as Record<string, string> }

    const normalizeTranscript = (text: string) =>
      ` ${text.toLowerCase().replace(/[^a-z0-9\s]/gi, "").replace(/\s+/g, " ").trim()} `

    const checkCommand = (id: string, patterns: string[], transcript: string, cooldownMs = 500) => {
      const normalizedTranscript = normalizeTranscript(transcript)

      if (patterns.some((pattern) => normalizedTranscript.includes(` ${pattern} `))) {
        const now = Date.now()
        const lastExecuted = lastExecutedRef.current[id] || 0
        const lastTranscript = lastTranscriptRef.current[id] || ""
        if (normalizedTranscript === lastTranscript && now - lastExecuted < 2500) {
          return false
        }

        if (now - lastExecuted > cooldownMs) {
          lastExecutedRef.current[id] = now
          lastTranscriptRef.current[id] = normalizedTranscript
          return true
        }
      }

      return false
    }

    const scheduleRestart = () => {
      if (!isComponentMounted) return
      if (restartTimer) window.clearTimeout(restartTimer)
      restartTimer = window.setTimeout(() => {
        try { recognition.start() } catch {}
      }, 300)
    }

    const speakFeedback = (message: string) => {
      playClickAudio(message)
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

    const voiceSelectionMatches = (transcript: string) => {
      const normalizedTranscript = normalizeTranscript(transcript)
      const matchedVoice = overlayStateRef.current.voices.find((voice) => {
        const normalizedVoiceName = normalizeTranscript(voice.name || "")
        return normalizedTranscript.includes(normalizedVoiceName.trim()) || normalizedVoiceName.includes(normalizedTranscript.trim())
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

    recognition.onresult = (event: any) => {
      const results = Array.from(event.results ?? [])
      if (!results.length) return

      const transcripts = results
        .map((result: any) => result?.[0]?.transcript || "")
        .filter(Boolean)

      if (!transcripts.length) return

      const transcript = transcripts.slice(-2).join(" ")
      const state = overlayStateRef.current
      const normalizedTranscript = normalizeTranscript(transcript)
      const wantsOn = /\b(on|enable|enabled|turn on|activate|active)\b/.test(normalizedTranscript)
      const wantsOff = /\b(off|disable|disabled|turn off|deactivate)\b/.test(normalizedTranscript)

      if (state.isVoiceDropdownOpen) {
        if (checkCommand("voice-dropdown-close", ["close voice selection", "close dropdown", "cancel voice selection", "hide voices"], transcript, 350)) {
          setIsVoiceDropdownOpen(false)
          setSettingsState((next) => {
            next.isVoiceDropdownOpen = false
          })
          speakFeedback("Voice selection closed")
          return
        }

        if (checkCommand("voice-dropdown-next", ["next voice", "voice next", "next selection", "next voice option"], transcript, 350)) {
          cycleVoice(1)
          return
        }

        if (checkCommand("voice-dropdown-prev", ["previous voice", "prev voice", "voice previous", "last voice", "previous selection"], transcript, 350)) {
          cycleVoice(-1)
          return
        }

        if (voiceSelectionMatches(transcript)) return
        return
      }

      if (checkCommand("settings-close", ["close settings", "close", "cancel", "back", "exit"], transcript, 350)) {
        setIsMounted(false)
        setTimeout(() => onCloseRef.current(), 300)
        return
      }

      if (checkCommand("settings-reset", ["reset default", "reset defaults", "restore defaults", "reset settings"], transcript, 700)) {
        handleResetToDefault()
        return
      }

      if (checkCommand("settings-voice-guide", ["voice guide", "voice guidance"], transcript, 500)) {
        handleVoiceGuideToggle(wantsOff ? false : wantsOn ? true : !state.isVoiceGuideEnabled)
        return
      }

      if (checkCommand("settings-mouse-reader", ["mouse reader", "mouse highlight reader", "mouse highlight"], transcript, 500)) {
        handleHighlightMouseScreenReaderToggle(wantsOff ? false : wantsOn ? true : !state.isHighlightMouseScreenReaderEnabled)
        return
      }

      if (checkCommand("settings-autoscroll", ["autoscroll", "auto scroll", "scroll reading"], transcript, 500)) {
        handleAutoscrollToggle(wantsOff ? false : wantsOn ? true : !state.isAutoscrollEnabled)
        return
      }

      if (checkCommand("settings-color", ["highlight color", "color picker", "pick color"], transcript, 500)) {
        setShowColorPicker(true)
        speakFeedback("Highlight color opened")
        return
      }

      if (checkCommand("settings-voice-selection", ["voice selection", "select voice", "voice voices"], transcript, 500)) {
        setIsVoiceDropdownOpen(true)
        speakFeedback("Voice selection opened")
        return
      }

      if (checkCommand("settings-input-next", ["next input", "next microphone", "input next", "microphone next"], transcript, 450)) {
        cycleDevice("input", 1)
        return
      }

      if (checkCommand("settings-input-prev", ["previous input", "prev input", "previous microphone", "microphone previous"], transcript, 450)) {
        cycleDevice("input", -1)
        return
      }

      if (checkCommand("settings-output-next", ["next output", "next speaker", "output next", "speaker next"], transcript, 450)) {
        cycleDevice("output", 1)
        return
      }

      if (checkCommand("settings-output-prev", ["previous output", "prev output", "previous speaker", "speaker previous"], transcript, 450)) {
        cycleDevice("output", -1)
        return
      }
    }

    recognition.onerror = (event: any) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed" || event.error === "aborted") return
      scheduleRestart()
    }

    recognition.onend = () => scheduleRestart()

    try { recognition.start() } catch {}

    return () => {
      isComponentMounted = false
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
    playClickAudio("Highlight color changed")
  }

  const handleInputDeviceChange = (deviceId: string) => {
    setSelectedInputDeviceId(deviceId)
    chrome.storage.local.set({ sensa_visual_input_device_id: deviceId })
    const label = inputDevices.find(d => d.deviceId === deviceId)?.label || "Input device selected"
    playClickAudio(label)
  }

  const handleOutputDeviceChange = (deviceId: string) => {
    setSelectedOutputDeviceId(deviceId)
    chrome.storage.local.set({ sensa_visual_output_device_id: deviceId })
    const label = outputDevices.find(d => d.deviceId === deviceId)?.label || "Output device selected"
    playClickAudio(label)
  }

  const handleAutoscrollToggle = (enabled: boolean) => {
    setIsAutoscrollEnabled(enabled)
    chrome.storage.local.set({ sensa_visual_autoscroll_enabled: enabled })
    playClickAudio(enabled ? "Autoscroll enabled" : "Autoscroll disabled")
  }

  const handleHighlightMouseScreenReaderToggle = (enabled: boolean) => {
    setIsHighlightMouseScreenReaderEnabled(enabled)
    chrome.storage.local.set({ sensa_visual_highlight_mouse_screen_reader: enabled })
    playClickAudio(enabled ? "Mouse reader enabled" : "Mouse reader disabled")
  }

  const handleVoiceGuideToggle = (enabled: boolean) => {
    setIsVoiceGuideEnabled(enabled)
    chrome.storage.local.set({ sensa_visual_voice_guide_enabled: enabled })
    playClickAudio(enabled ? "Voice guide enabled" : "Voice guide disabled")
  }

  const handleVoiceChange = (voiceURI: string) => {
    setSelectedVoiceURI(voiceURI)
    const selected = voices.find((voice) => voice.voiceURI === voiceURI)
    chrome.storage.local.set({ sensa_visual_voice_uri: voiceURI, sensa_visual_voice_name: selected?.name || "" })
    playClickAudio(`Voice set to ${selected?.name || 'selected voice'}`)
  }

  const handleResetToDefault = () => {
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

    chrome.storage.local.set({
      sensa_visual_highlight_color: DEFAULT_HIGHLIGHT_COLOR,
      sensa_visual_input_device_id: DEFAULT_INPUT_DEVICE_ID,
      sensa_visual_output_device_id: DEFAULT_OUTPUT_DEVICE_ID,
      sensa_visual_autoscroll_enabled: true,
      sensa_visual_highlight_mouse_screen_reader: false,
      sensa_visual_voice_uri: defaultVoiceURI,
      sensa_visual_voice_name: defaultVoice?.name || ""
    })
    playClickAudio("Settings reset to default")
  }

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
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
                playClickAudio("Closing settings")
                setIsMounted(false)
                setTimeout(onClose, 300)
              }}
              // 🚨 THE FIX: Set close button background to transparent so it isn't highlighted by default
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
            
            {/* 🚨 THE FIX: Moved getHoverHandlers to the outer ROW div so hovering anywhere horizontally triggers the audio */}
            <div 
              className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer`}
              {...getHoverHandlers("Voice Guide")}
              onClick={() => handleVoiceGuideToggle(!isVoiceGuideEnabled)}
            >
              <div className="flex items-center gap-3">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
                <span className={`text-[15px] font-semibold tracking-wide ${labelColor}`}>Voice Guide</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer pointer-events-none">
                <input type="checkbox" className="sr-only peer" checked={isVoiceGuideEnabled} readOnly />
                {/* 🚨 THE FIX: Swapped translate-x-full to exact translate-x-[20px] math to perfect the spacing */}
                <div className={`w-12 h-7 bg-gray-300 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#0A44FF]/50 rounded-full peer peer-checked:after:translate-x-[20px] peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-200 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-[#0A44FF] peer-checked:to-[#0099FF] shadow-inner`}></div>
              </label>
            </div>

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
                  onClick={(e) => { e.stopPropagation(); setIsVoiceDropdownOpen((prev) => !prev); playClickAudio("Voice selection") }}
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
                          onMouseEnter={() => previewVoice(voice)}
                          onClick={() => { handleVoiceChange(voice.voiceURI); setIsVoiceDropdownOpen(false); playClickAudio(`${voice.name} selected`); window.speechSynthesis.cancel() }}
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
                  type="text" defaultValue="Sensa" aria-label="Wake Word"
                  className={`w-full border ${inputBorder} ${textColor} ${inputBg} shadow-sm h-11 pl-4 pr-10 rounded-xl text-[13px] font-medium focus:outline-none focus:ring-2 focus:ring-[#0A44FF]/40 transition-all hover:shadow-md`}
                />
                <div className={`absolute inset-y-0 right-4 flex items-center pointer-events-none ${secondaryText}`}>
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 opacity-50"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" /></svg>
                </div>
              </div>
            </div>

            <div 
              className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer`}
              {...getHoverHandlers("Mouse Highlight Reader")}
              onClick={() => handleHighlightMouseScreenReaderToggle(!isHighlightMouseScreenReaderEnabled)}
            >
              <div className="flex items-center gap-3">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>
                <span className={`text-[15px] font-semibold tracking-wide ${labelColor}`}>Mouse Reader</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer pointer-events-none">
                <input type="checkbox" className="sr-only peer" checked={isHighlightMouseScreenReaderEnabled} readOnly />
                <div className={`w-12 h-7 bg-gray-300 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#0A44FF]/50 rounded-full peer peer-checked:after:translate-x-[20px] peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-200 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-[#0A44FF] peer-checked:to-[#0099FF] shadow-inner`}></div>
              </label>
            </div>

            <div 
              className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer`}
              {...getHoverHandlers("Autoscroll reading")}
              onClick={() => handleAutoscrollToggle(!isAutoscrollEnabled)}
            >
              <div className="flex items-center gap-3">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><rect x="5" y="4" width="14" height="16" rx="2"/><path d="M12 7l2 2-2 2"/><path d="M12 17l-2-2 2-2"/></svg>
                <span className={`text-[15px] font-semibold tracking-wide ${labelColor}`}>Autoscroll Reading</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer pointer-events-none">
                <input type="checkbox" className="sr-only peer" checked={isAutoscrollEnabled} readOnly />
                <div className={`w-12 h-7 bg-gray-300 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-[#0A44FF]/50 rounded-full peer peer-checked:after:translate-x-[20px] peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-200 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-[#0A44FF] peer-checked:to-[#0099FF] shadow-inner`}></div>
              </label>
            </div>

            <div 
              className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} relative hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors`}
              {...getHoverHandlers("Highlight color")}
            >
              <div className="flex items-center gap-3">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><path d="M14.5 4.5l5 5"/><path d="M11 8l-7 7-1 4 4-1 7-7"/><path d="M14 7l3 3"/></svg>
                <span className={`text-[15px] font-semibold tracking-wide ${labelColor}`}>Highlight Color</span>
              </div>
              <div className="relative flex items-center justify-end w-[190px]">
                <button 
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); setShowColorPicker((prev) => !prev) }}
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
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
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
              // 🚨 THE FIX: Upgraded hover state to cast a premium, subtle blue glow.
              className={`flex items-center gap-2 bg-transparent hover:bg-[#0A44FF]/10 hover:text-[#0A44FF] hover:border-[#0A44FF]/30 dark:hover:bg-[#0A44FF]/20 dark:hover:border-[#0A44FF]/40 ${textColor} border ${inputBorder} font-semibold h-11 px-8 rounded-xl transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A44FF]/50 text-[14px] tracking-wide hover:shadow-sm`}
              {...getHoverHandlers("Reset to default")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><polyline points="3 3 3 8 8 8"/></svg>
              Restore Defaults
            </button>
          </div>

      </div>
    </div>
  )
}