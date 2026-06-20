import React, { useState, useEffect, useRef } from "react"
import ColorPickerPopup from "./ColorPickerPopup"
import { useUIHoverAudio } from "../hooks/useUIHoverAudio"

const getLevenshteinDistance = (a: string, b: string): number => {
  const tmp: number[][] = []
  for (let i = 0; i <= a.length; i++) {
    tmp.push([i])
  }
  for (let j = 0; j <= b.length; j++) {
    tmp[0][j] = j
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
  }
  return tmp[a.length][b.length]
}

declare global {
  interface Window {
    sensa_utterances?: SpeechSynthesisUtterance[]
  }
}

const fuzzyMatch = (text: string, target: string, maxDistance = 2): boolean => {
  if (text.includes(target)) return true
  const tokens = text.split(/\s+/).filter(Boolean)
  const targetTokens = target.split(/\s+/).filter(Boolean)
  if (targetTokens.length === 1) {
    for (const t of tokens) {
      if (getLevenshteinDistance(t, target) <= maxDistance) return true
    }
  } else {
    const n = targetTokens.length
    for (let i = 0; i <= tokens.length - n; i++) {
      const ngram = tokens.slice(i, i + n).join(" ")
      if (getLevenshteinDistance(ngram, target) <= maxDistance) return true
    }
  }
  return false
}

const simplifyVoiceName = (name: string): string => {
  let simplified = name
  simplified = simplified.replace(/Deutsch/gi, "German")
  simplified = simplified.replace(/français/gi, "French")
  simplified = simplified.replace(/português do brasil/gi, "Portuguese")
  simplified = simplified.replace(/português/gi, "Portuguese")
  simplified = simplified.replace(/español.*españa.*/gi, "Spanish Male")
  simplified = simplified.replace(/español.*estados unidos.*/gi, "Spanish Female")
  simplified = simplified.replace(/español/gi, "Spanish")
  simplified = simplified.replace(/italiano/gi, "Italian")
  simplified = simplified.replace(/nederlands/gi, "Dutch")
  simplified = simplified.replace(/Nederland/gi, "")
  simplified = simplified.replace(/polski/gi, "Polish")
  simplified = simplified.replace(/русский/gi, "Russian")
  simplified = simplified.replace(/普通话.*中国大陆.*/gi, "Mainland Mandarin")
  simplified = simplified.replace(/普通话/gi, "Mandarin")
  simplified = simplified.replace(/[粵粤]語.*香港.*/gi, "Cantonese")
  simplified = simplified.replace(/[粵粤]語/gi, "Cantonese")
  simplified = simplified.replace(/國語.*臺灣.*/gi, "Taiwanese Mandarin")
  simplified = simplified.replace(/國語.*台湾.*/gi, "Taiwanese Mandarin")
  simplified = simplified.replace(/國語/gi, "Taiwanese Mandarin")
  simplified = simplified.replace(/国语/gi, "Taiwanese Mandarin")
  simplified = simplified.replace(/中文.*香港.*/gi, "Cantonese")
  simplified = simplified.replace(/中文.*台灣.*/gi, "Taiwanese Mandarin")
  simplified = simplified.replace(/中文.*台湾.*/gi, "Taiwanese Mandarin")
  simplified = simplified.replace(/中文.*中国.*/gi, "Mainland Mandarin")
  simplified = simplified.replace(/中文/gi, "Chinese")
  simplified = simplified.replace(/日本語/gi, "Japanese")
  simplified = simplified.replace(/한국어/gi, "Korean")
  simplified = simplified.replace(/hanguge/gi, "Korean")
  simplified = simplified.replace(/한국의/gi, "Korean")
  simplified = simplified.replace(/हिन्दी/gi, "Hindi")
  simplified = simplified.replace(/suomi/gi, "Finnish")
  simplified = simplified.replace(/svenska/gi, "Swedish")
  simplified = simplified.replace(/dansk/gi, "Danish")
  simplified = simplified.replace(/norsk/gi, "Norwegian")
  
  simplified = simplified.replace(/ - English \([^)]+\)/i, "")
  simplified = simplified.replace(/ English \([^)]+\)/i, "")
  simplified = simplified.replace(/ \([a-z]{2}-[A-Z]{2}\)/i, "")
  simplified = simplified.replace(/ Desktop/i, "")
  simplified = simplified.replace(/[\(\)]/g, "")
  simplified = simplified.replace(/\s+/g, " ")
  
  return simplified.trim() || name
}

const DEFAULT_HIGHLIGHT_COLOR = "#FFFE00"

interface VisualSettingsModalProps {
  onClose: () => void
  isDark?: boolean
  isVoiceCommandActive?: boolean
  onToggleVoiceCommand?: () => void
  openedViaVoice?: boolean
}

export default function VisualSettingsModal({ onClose, isDark = false, isVoiceCommandActive = false, onToggleVoiceCommand, openedViaVoice = false }: VisualSettingsModalProps) {
  const { playHoverAudio, playClickAudio, cancelHoverAudio } = useUIHoverAudio()
  const audioCtxRef = useRef<AudioContext | null>(null)
  const [isVoiceGuideEnabled, setIsVoiceGuideEnabled] = useState<boolean>(true)
  const isVoiceGuideEnabledRef = useRef(true)
  const highlightSoundDebounceRef = useRef<number | null>(null)
  const [isSoundEffectsEnabled, setIsSoundEffectsEnabled] = useState<boolean>(true)
  const isSoundEffectsEnabledRef = useRef<boolean>(true)
  const [isStorageLoaded, setIsStorageLoaded] = useState(false)

  const [showColorPicker, setShowColorPicker] = useState(false)
  const [highlightColor, setHighlightColor] = useState(DEFAULT_HIGHLIGHT_COLOR)
  const [isAutoscrollEnabled, setIsAutoscrollEnabled] = useState(true)
  const [isHighlightMouseScreenReaderEnabled, setIsHighlightMouseScreenReaderEnabled] = useState(false)
  const [isImageAltReaderEnabled, setIsImageAltReaderEnabled] = useState(true)

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>("")
  const [speakingVoiceURI, setSpeakingVoiceURI] = useState<string | null>(null)
  
  const defaultVoiceURIRef = useRef<string>("")
  const defaultVoiceLabelRef = useRef<string>("")
  const defaultVoiceAppliedRef = useRef(false)
  const [isVoiceDropdownOpen, setIsVoiceDropdownOpen] = useState(false)

  useEffect(() => {
    if (speakingVoiceURI && isVoiceDropdownOpen) {
      const safeId = `voice-option-${speakingVoiceURI.replace(/[^a-zA-Z0-9]/g, '_')}`
      const element = document.getElementById(safeId)
      if (element) {
        element.scrollIntoView({ behavior: 'auto', block: 'center' })
      }
    }
  }, [speakingVoiceURI, isVoiceDropdownOpen])
  const pauseSettingsRecognitionRef = useRef<(() => void) | null>(null)
  const resumeSettingsRecognitionRef = useRef<(() => void) | null>(null)
  const settingsRecognitionArmedRef = useRef(false)
  const isVoiceCommandActiveRef = useRef(isVoiceCommandActive)

  const [isMounted, setIsMounted] = useState(false)
  const onCloseRef = useRef(onClose)
  const overlayStateRef = useRef({
    isVoiceGuideEnabled,
    isSoundEffectsEnabled,
    showColorPicker,
    highlightColor,
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
  const speakSettingsGuideRef = useRef<(message: string) => void>(() => { })
  const lastUISpeechTimeRef = useRef(0)

  useEffect(() => {
    selectedVoiceURIRef.current = selectedVoiceURI
  }, [selectedVoiceURI])

  const speakSettingsGuide = React.useCallback((message: string) => {
    if (!message.trim()) return
    lastUISpeechTimeRef.current = Date.now()
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
    if (!isMounted || !isStorageLoaded || hasAnnouncedOpenRef.current) return
    playPopSfx()
    if (!isVoiceGuideEnabledRef.current) {
      hasAnnouncedOpenRef.current = true
      return
    }
    const voiceUri = selectedVoiceURI || defaultVoiceURIRef.current
    if (!voiceUri) return
    hasAnnouncedOpenRef.current = true
    if (isVoiceCommandActive) {
      speakSettingsGuide("Settings opened. You can say commands to hear the list of available actions.")
    } else {
      speakSettingsGuide("Settings opened")
    }
  }, [isMounted, isStorageLoaded, selectedVoiceURI, speakSettingsGuide, isVoiceCommandActive])

  useEffect(() => {
    if (!isVoiceCommandActive) return

    let loopTimer: number | null = null
    let lastReminderTime = Date.now()

    const checkReminder = () => {
      if (document.visibilityState !== "visible") {
        loopTimer = window.setTimeout(checkReminder, 1000)
        return
      }

      if (Date.now() - lastUISpeechTimeRef.current < 10000) {
        loopTimer = window.setTimeout(checkReminder, 1000)
        return
      }

      const now = Date.now()

      if (now - lastReminderTime >= 60000) {
        lastReminderTime = now
        if (isVoiceGuideEnabledRef.current) {
          speakSettingsGuide("You can say commands to hear the list of available actions.")
        }
      }

      loopTimer = window.setTimeout(checkReminder, 1000)
    }

    loopTimer = window.setTimeout(checkReminder, 1000)

    return () => {
      if (loopTimer) window.clearTimeout(loopTimer)
    }
  }, [speakSettingsGuide, isVoiceCommandActive])

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
      isSoundEffectsEnabled,
      showColorPicker,
      highlightColor,
      isAutoscrollEnabled,
      isHighlightMouseScreenReaderEnabled,
      voices,
      selectedVoiceURI,
      isVoiceDropdownOpen,
    }
  }, [
    highlightColor,
    isAutoscrollEnabled,
    isHighlightMouseScreenReaderEnabled,
    isVoiceDropdownOpen,
    isVoiceGuideEnabled,
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
      "sensa_visual_image_alt_reader_enabled",
      "sensa_visual_wake_word",
      "sensa_voice_command_active"
    ], (res) => {
      if (typeof res.sensa_visual_highlight_color === "string") setHighlightColor(res.sensa_visual_highlight_color)
      if (typeof res.sensa_visual_autoscroll_enabled === "boolean") setIsAutoscrollEnabled(res.sensa_visual_autoscroll_enabled)
      if (typeof res.sensa_visual_voice_guide_enabled === "boolean") {
        setIsVoiceGuideEnabled(res.sensa_visual_voice_guide_enabled)
        isVoiceGuideEnabledRef.current = res.sensa_visual_voice_guide_enabled
      }
      if (typeof res.sensa_visual_sound_effects_enabled === "boolean") setIsSoundEffectsEnabled(res.sensa_visual_sound_effects_enabled)
      if (typeof res.sensa_visual_voice_uri === "string") setSelectedVoiceURI(res.sensa_visual_voice_uri)
      if (typeof res.sensa_visual_autoscroll_enabled === "boolean") setIsAutoscrollEnabled(res.sensa_visual_autoscroll_enabled)
      if (typeof res.sensa_visual_highlight_mouse_screen_reader === "boolean") setIsHighlightMouseScreenReaderEnabled(res.sensa_visual_highlight_mouse_screen_reader)
      if (typeof res.sensa_visual_image_alt_reader_enabled === "boolean") setIsImageAltReaderEnabled(res.sensa_visual_image_alt_reader_enabled)
      setIsStorageLoaded(true)
    })
  }, [])

  useEffect(() => {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
    }
    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [])

  useEffect(() => {
    isVoiceCommandActiveRef.current = isVoiceCommandActive
  }, [isVoiceCommandActive])

  const resumeSettingsVoiceRecognition = () => {
    window.setTimeout(() => resumeSettingsRecognitionRef.current?.(), 350)
  }

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
  const [isTabVisible, setIsTabVisible] = useState(!document.hidden)

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabVisible(!document.hidden)
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [])

  useEffect(() => {
    if (!isTabVisible) return

    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionCtor) return

    let isComponentMounted = true
    let restartTimer: number | null = null

    let ignoreSpeechUntil = 0
    let consumedString = ""
    let currentResultIndex = 0
    let recognition: any = null
    let isPermanentlyDead = false

    const scheduleRestart = () => {
      if (!isComponentMounted || isPermanentlyDead) return
      if (restartTimer) window.clearTimeout(restartTimer)
      restartTimer = window.setTimeout(() => {
        if (!recognition || !isComponentMounted) return
        try { 
          recognition.start() 
        } catch (e: any) { 
          if (e && e.name === 'InvalidStateError') {
            restartTimer = window.setTimeout(scheduleRestart, 400)
            return
          }
          restartTimer = window.setTimeout(scheduleRestart, 1000)
        }
      }, 300)
    }





    const teardownRecognition = () => {
      if (!recognition) return
      try { recognition.stop() } catch {}
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      recognition.onstart = null
      ;(recognition as any).onsoundstart = null
      recognition = null
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

    const voiceSelectionMatches = (text: string) => {
      const cleanText = text.toLowerCase()
      if (cleanText.split(' ').length < 2) return false
      const matches = overlayStateRef.current.voices.filter((voice) => {
        const name = (voice.name || "").toLowerCase()
        const simpleName = simplifyVoiceName(voice.name || "").toLowerCase()
        if (cleanText === name || cleanText === simpleName) return true
        return cleanText.includes(name) || name.includes(cleanText) || cleanText.includes(simpleName) || simpleName.includes(cleanText)
      })
      if (matches.length === 0) return false
      
      if (matches.length > 1 && (cleanText === "google" || cleanText === "microsoft" || cleanText === "apple" || cleanText === "english")) {
        return false
      }
      
      const matchedVoice = matches[0]
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

    const buildRecognition = () => {
      const instance = new SpeechRecognitionCtor()
      instance.continuous = true
      instance.interimResults = true
      instance.lang = "en-US"

      instance.onstart = () => {
        settingsRecognitionArmedRef.current = true
      }
      
      ;(instance as any).onsoundstart = () => {
      }

      instance.onresult = (event: any) => {
        if (!settingsRecognitionArmedRef.current) return

        if (!isVoiceCommandActiveRef.current) {
          let liveText = ""
          for (let i = event.resultIndex; i < event.results.length; i++) {
            liveText += event.results[i][0].transcript + " "
          }
          liveText = liveText.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()
          
          let newSpeech = liveText
          if (liveText.startsWith(consumedString) && consumedString.length > 0) {
            newSpeech = liveText.slice(consumedString.length).trim()
          }

          const paddedSpeech = ` ${newSpeech} `
          const check = (...words: string[]) => words.some(w => paddedSpeech.includes(` ${w} `))
          const fuzzyCheck = (target: string, maxDistance = 1) => fuzzyMatch(newSpeech, target, maxDistance)

          if (check("sensa", "sansa", "sensor", "sensia", "sincere", "center", "censor", "senser", "censer", "sens", "wake", "listen", "start") || fuzzyCheck("sensa", 1)) {
            ignoreSpeechUntil = Date.now() + 800
            consumedString = liveText
            playClickAudio("Voice commands activated")
            onToggleVoiceCommand?.()
          }
          return
        }

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

        if (Date.now() < ignoreSpeechUntil) {
          consumedString = liveText
          return
        }
        const paddedSpeech = ` ${newSpeech} `
        const check = (...words: string[]) => words.some(w => paddedSpeech.includes(` ${w} `))
        const fuzzyCheck = (target: string, maxDistance = 1) => fuzzyMatch(newSpeech, target, maxDistance)

        if (check("stop listening", "stop voice", "sleep", "mute", "quiet", "deactivate voice", "deactivate voice command", "deactivate listening")) {
          ignoreSpeechUntil = Date.now() + 800
          consumedString = liveText
          playClickAudio("Voice commands deactivated")
          onToggleVoiceCommand?.()
          return
        }


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
          if (check("help", "commands", "options", "what can i say")) {
            commandFired = true
            speakFeedback("Here are the commands. Voice selection. This opens the voice list. Reset. This resets all settings to default. Close. This exits settings.")
          } else if (check("close settings", "close", "cancel", "back", "exit") || fuzzyCheck("close", 1) || fuzzyCheck("exit", 1)) {
            commandFired = true
            setIsMounted(false)
            setTimeout(() => onCloseRef.current(), 300)
          } else if (check("reset default", "reset defaults", "restore defaults", "restore default", "reset settings", "restore", "reset", "default") || fuzzyCheck("restore default", 1) || fuzzyCheck("reset default", 1)) {
            commandFired = true
            handleResetToDefault()
          } else if (check("voice selection", "select voice", "voice voices")) {
            commandFired = true
            setIsVoiceDropdownOpen(true)
            
            if (isVoiceGuideEnabledRef.current) {
              window.speechSynthesis.cancel()
              window.sensa_utterances = []
              
              const allVoices = window.speechSynthesis.getVoices()
              const defaultUri = selectedVoiceURIRef.current || defaultVoiceURIRef.current
              const defaultVoiceObj = (defaultUri ? allVoices.find((v) => v.voiceURI === defaultUri) : undefined) || allVoices.find((v) => v.name.includes("Google US English"))

              const intro = new SpeechSynthesisUtterance("Voice selection opened. You can choose from:")
              if (defaultVoiceObj) {
                intro.voice = defaultVoiceObj
                intro.lang = defaultVoiceObj.lang
              }
              window.sensa_utterances.push(intro)
              window.speechSynthesis.speak(intro)

              overlayStateRef.current.voices.forEach((voice) => {
                const utterance = new SpeechSynthesisUtterance(simplifyVoiceName(voice.name))
                utterance.voice = voice
                utterance.lang = voice.lang
                utterance.onstart = () => setSpeakingVoiceURI(voice.voiceURI)
                utterance.onend = () => setSpeakingVoiceURI((prev) => prev === voice.voiceURI ? null : prev)
                window.sensa_utterances!.push(utterance)
                window.speechSynthesis.speak(utterance)
              })

              const outro = new SpeechSynthesisUtterance("Just say the name to select it.")
              if (defaultVoiceObj) {
                outro.voice = defaultVoiceObj
                outro.lang = defaultVoiceObj.lang
              }
              window.sensa_utterances.push(outro)
              window.speechSynthesis.speak(outro)
            }
          }
        }

        if (commandFired) {
          consumedString = liveText
        }
      }

      instance.onerror = (event: any) => {
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          window.setTimeout(scheduleRestart, 1500)
          return
        }
        if (event.error === "aborted") {
          scheduleRestart()
          return
        }
        scheduleRestart()
      }

      instance.onend = () => {
        scheduleRestart()
      }

      recognition = instance
    }

    pauseSettingsRecognitionRef.current = () => {
      if (restartTimer) {
        window.clearTimeout(restartTimer)
        restartTimer = null
      }
      try { recognition?.stop() } catch { }
    }

    resumeSettingsRecognitionRef.current = () => {
      if (!isComponentMounted) return
      scheduleRestart()
    }

    const reviveEngine = () => {
      if (isPermanentlyDead) {
        isPermanentlyDead = false
        scheduleRestart()
      }
    }
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") reviveEngine()
    }
    
    window.addEventListener("click", reviveEngine)
    window.addEventListener("focus", reviveEngine)
    window.addEventListener("visibilitychange", handleVisibilityChange)

    buildRecognition()
    const startTimeout = window.setTimeout(() => {
      try { recognition?.start() } catch (e) {}
    }, 150)

    return () => {
      isComponentMounted = false
      settingsRecognitionArmedRef.current = false
      window.removeEventListener("click", reviveEngine)
      window.removeEventListener("focus", reviveEngine)
      window.removeEventListener("visibilitychange", handleVisibilityChange)
      if (restartTimer) window.clearTimeout(restartTimer)

      window.clearTimeout(startTimeout)
      if (recognition) {
        try { recognition.stop() } catch (e) {}
      }
    }
  }, [playClickAudio, isTabVisible])

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

  const handleImageAltReaderToggle = (enabled: boolean) => {
    playToggleSfx(enabled)
    setIsImageAltReaderEnabled(enabled)
    chrome.storage.local.set({ sensa_visual_image_alt_reader_enabled: enabled })
    playClickAudio(enabled ? "Image reader enabled" : "Image reader disabled")
  }

  const handleVoiceGuideToggle = (enabled: boolean) => {
    playToggleSfx(enabled)
    setIsVoiceGuideEnabled(enabled)
    isVoiceGuideEnabledRef.current = enabled
    chrome.storage.local.set({ sensa_visual_voice_guide_enabled: enabled })
    if (enabled) {
      speakSettingsGuide("Voice guide enabled")
    } else {
      speakSettingsGuide("Voice guide disabled")
    }
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
    const currentVoices = overlayStateRef.current.voices
    const defaultVoice = currentVoices.find((voice) => voice.name.includes("Google US English")) || currentVoices[0]
    const defaultVoiceURI = defaultVoice?.voiceURI || ""
    setShowColorPicker(false)
    setIsVoiceDropdownOpen(false)
    setHighlightColor(DEFAULT_HIGHLIGHT_COLOR)
    setIsAutoscrollEnabled(true)
    setIsHighlightMouseScreenReaderEnabled(true)
    setIsImageAltReaderEnabled(true)
    setIsVoiceGuideEnabled(true)
    setIsSoundEffectsEnabled(true)
    setSelectedVoiceURI(defaultVoiceURI)
    chrome.storage.local.set({
      sensa_visual_highlight_color: DEFAULT_HIGHLIGHT_COLOR,
      sensa_visual_autoscroll_enabled: true,
      sensa_visual_highlight_mouse_screen_reader: true,
      sensa_visual_image_alt_reader_enabled: true,
      sensa_visual_voice_guide_enabled: true,
      sensa_visual_sound_effects_enabled: true,
      sensa_visual_voice_uri: defaultVoiceURI,
      sensa_visual_voice_name: defaultVoice?.name || ""
    })
    playClickAudio("Settings reset to default")
  }

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      playClickSfx()
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
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" /></svg>
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
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><path d="M11 5 6 9H2v6h4l5 4z" /><path d="M19 9a5 5 0 0 1 0 6" /><path d="M21 7a9 9 0 0 1 0 10" /></svg>
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

          <label
            className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer`}
            {...getHoverHandlers("Autoscroll reading")}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 pointer-events-none">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M12 7l2 2-2 2" /><path d="M12 17l-2-2 2-2" /></svg>
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

          <label
            className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer`}
            {...getHoverHandlers("Mouse Highlight Reader")}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 pointer-events-none">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /><path d="M13 13l6 6" /></svg>
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
            {...getHoverHandlers("Image Reader")}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 pointer-events-none">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
              <span className={`text-[15px] font-semibold tracking-wide ${labelColor}`}>Image Reader</span>
            </div>
            <span className="relative inline-flex items-center shrink-0 pointer-events-none">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={isImageAltReaderEnabled}
                onChange={(e) => handleImageAltReaderToggle(e.target.checked)}
              />
              <span className={toggleSwitchClass} aria-hidden="true" />
            </span>
          </label>

          <div
            className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} relative hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors`}
            {...getHoverHandlers("Highlight color")}
          >
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><path d="M14.5 4.5l5 5" /><path d="M11 8l-7 7-1 4 4-1 7-7" /><path d="M14 7l3 3" /></svg>
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
            className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} relative z-50 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors`}
            {...getHoverHandlers("Voice Selection")}
          >
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><line x1="4" y1="6" x2="4" y2="18" /><line x1="8" y1="10" x2="8" y2="14" /><line x1="12" y1="4" x2="12" y2="20" /><line x1="16" y1="8" x2="16" y2="16" /><line x1="20" y1="11" x2="20" y2="13" /></svg>
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
                    if (voices.length === 0) return "Loading..."
                    const selected = voices.find((v) => v.voiceURI === selectedVoiceURI)
                    if (!selected) return "Select a voice"
                    const isDefault = selected.voiceURI === defaultVoiceURIRef.current
                    return `${simplifyVoiceName(selected.name)}${isDefault ? " (Default)" : ""}`
                  })()}
                </span>
                <div className={`pointer-events-none absolute inset-y-0 right-3 flex items-center ${secondaryText}`}>
                  <svg className={`fill-current h-4 w-4 transition-transform duration-300 ${isVoiceDropdownOpen ? "rotate-180" : ""}`} viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                </div>
              </button>

              {isVoiceDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setIsVoiceDropdownOpen(false); window.speechSynthesis.cancel() }} />
                  <ul className={`absolute right-0 z-50 mt-2 w-[240px] max-h-56 overflow-y-auto ${modalBg} border ${inputBorder} rounded-xl shadow-2xl py-2 text-[13px] custom-scrollbar`} role="listbox">
                    {voices.map((voice) => (
                      <li
                        id={`voice-option-${voice.voiceURI.replace(/[^a-zA-Z0-9]/g, '_')}`}
                        key={voice.voiceURI}
                        role="option"
                        aria-selected={selectedVoiceURI === voice.voiceURI}
                        className={`px-4 py-2.5 cursor-pointer block w-full text-left truncate transition-all font-medium m-1 rounded-lg ${
                          speakingVoiceURI === voice.voiceURI
                            ? "bg-[#0A44FF]/30 text-[#0A44FF] shadow-inner border border-[#0A44FF]/50"
                            : selectedVoiceURI === voice.voiceURI
                              ? "bg-gradient-to-r from-[#0A44FF] to-[#0099FF] text-white shadow-md"
                              : isDark
                                ? "text-gray-200 hover:bg-[#0A44FF]/20 hover:text-[#0A44FF]"
                                : "text-gray-700 hover:bg-[#0A44FF]/10 hover:text-[#0A44FF]"
                        }`}
                        onMouseEnter={() => { playHoverSfx(); previewVoice(voice) }}
                        onClick={() => { handleVoiceChange(voice.voiceURI); setIsVoiceDropdownOpen(false); window.speechSynthesis.cancel() }}
                        style={{ fontFamily: `"${voice.name}", system-ui, sans-serif` }}
                      >
                        {simplifyVoiceName(voice.name)}{voice.voiceURI === defaultVoiceURIRef.current ? " (Default)" : ""}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>



        </div>

        <div className="mt-8 flex justify-center">
          <button
            type="button"
            onClick={handleResetToDefault}
            className={`flex items-center gap-2 bg-transparent hover:bg-[#0A44FF]/10 hover:text-[#0A44FF] hover:border-[#0A44FF]/30 dark:hover:bg-[#0A44FF]/20 dark:hover:border-[#0A44FF]/40 ${textColor} border ${inputBorder} font-semibold h-11 px-8 rounded-xl transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A44FF]/50 text-[14px] tracking-wide hover:shadow-sm`}
            {...getHoverHandlers("Reset")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><polyline points="3 3 3 8 8 8" /></svg>
            Reset
          </button>
        </div>

      </div>
    </div>
  )
}