/**
 * @file VisualSettingsModal.tsx
 * @description Configuration modal for Visual Mode, managing TTS voice selection, reading speed, highlight styling, and custom voice commands.
 *
 * Architectural Overview:
 * 1. Screen Reader Customization:
 *    - Manages TTS reading speed (`sensa_visual_reading_speed`), sentence highlight color (`sensa_visual_highlight_color`), and automatic vertical scrolling (`sensa_visual_autoscroll`).
 *    - Enumerates available system speech voices (`window.speechSynthesis.getVoices`) with search/filter capabilities.
 *
 * 2. Voice Command Customization:
 *    - Allows users to define custom trigger phrases for activating/deactivating modes and controlling speech navigation (`sensa_custom_voice_commands`).
 *
 * 3. Sensory Feedback & Persistence:
 *    - Controls sound effects (`sensa_visual_sound_effects_enabled`) and voice guide announcements (`sensa_visual_voice_guide_enabled`).
 *    - Persists all settings to Chrome local storage and syncs across active tabs.
 */

import React, { useState, useEffect, useRef } from "react"
import ColorPickerPopup from "./ColorPickerPopup"
import { useUIHoverAudio } from "../hooks/useUIHoverAudio"
import { startVisualModeVoiceListener, stopVisualModeVoiceListener } from "../lib/visualModeVoiceBridge"
import { isBraveBrowser } from "../lib/browserUtils"
import { ttsEchoFilter } from "../lib/ttsEchoFilter"
import { resolveVoice, updateSelectedVoice, speakWithUserVoice, simplifyVoiceName } from "../lib/voiceResolver"

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
  const [isBrave, setIsBrave] = useState(false)

  useEffect(() => {
    isBraveBrowser().then(setIsBrave)
  }, [])

  const [showColorPicker, setShowColorPicker] = useState(false)
  const [highlightColor, setHighlightColor] = useState(DEFAULT_HIGHLIGHT_COLOR)
  const [isAutoscrollEnabled, setIsAutoscrollEnabled] = useState(true)
  const [isHighlightMouseScreenReaderEnabled, setIsHighlightMouseScreenReaderEnabled] = useState(true)
  const [isImageAltReaderEnabled, setIsImageAltReaderEnabled] = useState(true)
  const [magnifierSize, setMagnifierSize] = useState(240)
  const [magnifierZoom, setMagnifierZoom] = useState(2.0)

  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>("")
  const [speakingVoiceURI, setSpeakingVoiceURI] = useState<string | null>(null)

  const defaultVoiceURIRef = useRef<string>("")
  const defaultVoiceLabelRef = useRef<string>("")
  const defaultVoiceAppliedRef = useRef(false)
  const [isVoiceDropdownOpen, setIsVoiceDropdownOpen] = useState(false)
  const isReadingVoiceListRef = useRef(false)

  useEffect(() => {
    const uriToScroll = speakingVoiceURI || (isVoiceDropdownOpen ? selectedVoiceURI : null)
    if (uriToScroll && isVoiceDropdownOpen) {
      const safeId = `voice-option-${uriToScroll.replace(/[^a-zA-Z0-9]/g, '_')}`
      setTimeout(() => {
        const element = document.getElementById(safeId)
        if (element) {
          const container = element.closest('ul')
          if (container) {
            const containerHeight = container.clientHeight
            const elementTop = element.offsetTop
            const elementHeight = element.offsetHeight
            if (containerHeight > 0) {
              container.scrollTop = elementTop - containerHeight / 2 + elementHeight / 2
            }
          } else {
            element.scrollIntoView({ behavior: 'auto', block: 'center' })
          }
        }
      }, 50)
    }
  }, [speakingVoiceURI, selectedVoiceURI, isVoiceDropdownOpen])
  const pauseSettingsRecognitionRef = useRef<(() => void) | null>(null)
  const resumeSettingsRecognitionRef = useRef<(() => void) | null>(null)
  const settingsRecognitionArmedRef = useRef(false)
  const isVoiceCommandActiveRef = useRef(isVoiceCommandActive)
  const startReadingVoiceListRef = useRef<() => void>(() => {})

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

  const modalBoxRef = useRef<HTMLDivElement>(null)
  const voiceBtnRef = useRef<HTMLButtonElement>(null)
  const colorBtnRef = useRef<HTMLButtonElement>(null)
  const [voiceMenuPos, setVoiceMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })
  const [colorPickerPos, setColorPickerPos] = useState<{ top: number; right: number; width: number; height: number }>({ top: 0, right: 0, width: 40, height: 40 })

  useEffect(() => {
    if (isVoiceDropdownOpen) {
      const btnRect = voiceBtnRef.current?.getBoundingClientRect()
      const modalRect = modalBoxRef.current?.getBoundingClientRect()
      if (btnRect && modalRect) {
        const scale = isMounted ? 1 : 0.95
        setVoiceMenuPos({
          top: (btnRect.bottom - modalRect.top) / scale + 6,
          right: (modalRect.right - btnRect.right) / scale
        })
      }
    }
  }, [isVoiceDropdownOpen, isMounted])

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
    speakWithUserVoice(message, { cancelPrevious: true })
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

    const isSpeechBusy = () => window.speechSynthesis.speaking || window.speechSynthesis.pending

    const checkReminder = () => {
      if (document.visibilityState !== "visible" || isSpeechBusy()) {
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
        if (isVoiceGuideEnabledRef.current && !isSpeechBusy()) {
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
      "sensa_voice_command_active",
      "sensa_visual_magnifier_size",
      "sensa_visual_magnifier_zoom"
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
      if (typeof res.sensa_visual_highlight_mouse_screen_reader === "boolean") {
        setIsHighlightMouseScreenReaderEnabled(res.sensa_visual_highlight_mouse_screen_reader)
      } else {
        setIsHighlightMouseScreenReaderEnabled(true)
        chrome.storage.local.set({ sensa_visual_highlight_mouse_screen_reader: true })
      }
      if (typeof res.sensa_visual_image_alt_reader_enabled === "boolean") setIsImageAltReaderEnabled(res.sensa_visual_image_alt_reader_enabled)
      if (typeof res.sensa_visual_magnifier_size === "number") setMagnifierSize(res.sensa_visual_magnifier_size)
      if (typeof res.sensa_visual_magnifier_zoom === "number") setMagnifierZoom(res.sensa_visual_magnifier_zoom)
      setIsStorageLoaded(true)
    })
  }, [])

  useEffect(() => {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.sensa_visual_voice_uri && typeof changes.sensa_visual_voice_uri.newValue === "string") {
        setSelectedVoiceURI(changes.sensa_visual_voice_uri.newValue)
        selectedVoiceURIRef.current = changes.sensa_visual_voice_uri.newValue
      }
      if (changes.sensa_visual_voice_guide_enabled && typeof changes.sensa_visual_voice_guide_enabled.newValue === "boolean") {
        setIsVoiceGuideEnabled(changes.sensa_visual_voice_guide_enabled.newValue)
        isVoiceGuideEnabledRef.current = changes.sensa_visual_voice_guide_enabled.newValue
      }
      if (changes.sensa_visual_sound_effects_enabled && typeof changes.sensa_visual_sound_effects_enabled.newValue === "boolean") {
        setIsSoundEffectsEnabled(changes.sensa_visual_sound_effects_enabled.newValue)
      }
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
      // Filter out Vernon because it essentially just aliases to Microsoft Mark on Windows anyway
      // Also filter out Harley in Brave as requested
      const availableVoices = window.speechSynthesis.getVoices().filter(v => {
        if (v.name.includes("Vernon")) return false;
        if (isBrave && v.name.toLowerCase().includes("harley")) return false;
        return true;
      })
      if (availableVoices.length > 0) {
        const defaultVoice = availableVoices.find((v) => v.name.includes("Google US English")) || availableVoices.find((v) => (v.lang === "en-US" || v.lang.startsWith("en")) && !v.name.includes("David")) || availableVoices.find((v) => v.lang === "en-US" || v.lang.startsWith("en")) || availableVoices[0]
        defaultVoiceURIRef.current = defaultVoice?.voiceURI || ""
        defaultVoiceLabelRef.current = defaultVoice?.name || ""
        setVoices(availableVoices)

        chrome.storage.local.get(["sensa_visual_voice_uri", "sensa_visual_voice_name"], (stored) => {
          const hasValidStored =
            typeof stored.sensa_visual_voice_uri === "string" &&
            stored.sensa_visual_voice_uri.length > 0;
          
          if (hasValidStored) {
            setSelectedVoiceURI(stored.sensa_visual_voice_uri)
            selectedVoiceURIRef.current = stored.sensa_visual_voice_uri
          } else if (defaultVoice?.voiceURI) {
            setSelectedVoiceURI(defaultVoice.voiceURI)
            selectedVoiceURIRef.current = defaultVoice.voiceURI
            if (!defaultVoiceAppliedRef.current) {
              chrome.storage.local.set({ sensa_visual_voice_uri: defaultVoice.voiceURI, sensa_visual_voice_name: defaultVoice.name || "" })
              defaultVoiceAppliedRef.current = true
            }
          }
        })
      }
    }
    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices
  }, [isBrave])
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
    if (isBrave) return // Skip SpeechRecognition entirely in Brave — it triggers mic permission prompts

    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionCtor) return

    let isComponentMounted = true
    let restartTimer: number | null = null

    let ignoreSpeechUntil = 0
    let lastCommandName = ""
    let lastCommandTime = 0
    let consumedKeywords: { word: string; expires: number }[] = []
    let currentResultIndex = 0
    let recognition: any = null
    let isPermanentlyDead = false

    const isExtensionContextValid = (): boolean => {
      try {
        return typeof chrome !== "undefined" && typeof chrome.runtime !== "undefined" && typeof chrome.runtime.id === "string"
      } catch {
        return false
      }
    }

    const scheduleRestart = () => {
      if (!isComponentMounted || isPermanentlyDead) return
      if (!isExtensionContextValid()) {
        isPermanentlyDead = true
        teardownRecognition()
        return
      }
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
      const rec = recognition
      recognition = null
      try {
        rec.onresult = null
        rec.onerror = null
        rec.onend = null
        rec.onstart = null
        ;(rec as any).onsoundstart = null
        if (typeof rec.abort === 'function') {
          rec.abort()
        } else {
          rec.stop()
        }
      } catch { }
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
      selectedVoiceURIRef.current = nextVoice.voiceURI
      setSpeakingVoiceURI(nextVoice.voiceURI)
      updateSelectedVoice(nextVoice.voiceURI, nextVoice.name || "")
      setIsVoiceDropdownOpen(true)
      window.speechSynthesis.cancel()
      speakFeedback(`${simplifyVoiceName(nextVoice.name || "")} selected`)
      setSettingsState((state) => {
        state.selectedVoiceURI = nextVoice.voiceURI
        state.isVoiceDropdownOpen = true
      })
      setTimeout(() => {
        setSpeakingVoiceURI((prev) => prev === nextVoice.voiceURI ? null : prev)
      }, 1500)
    }

    const LANG_MAP: Record<string, string[]> = {
      korean: ["ko", "한국어", "korean"],
      russian: ["ru", "русский", "russian"],
      german: ["de", "deutsch", "german"],
      italian: ["it", "italiano", "italian"],
      french: ["fr", "français", "french"],
      spanish: ["es", "español", "spanish"],
      portuguese: ["pt", "português", "portuguese"],
      japanese: ["ja", "日本語", "japanese"],
      chinese: ["zh", "中文", "chinese"],
      mandarin: ["zh", "普通话", "國語", "国语", "mandarin"],
      cantonese: ["zh-hk", "粵語", "粤语", "cantonese"],
      hindi: ["hi", "हिन्दी", "hindi"],
      dutch: ["nl", "nederlands", "dutch"],
      polish: ["pl", "polski", "polish"],
      tagalog: ["tl", "fil", "filipino", "tagalog"],
      filipino: ["fil", "tl", "filipino", "tagalog"],
      vietnamese: ["vi", "tiếng việt", "vietnamese"],
      thai: ["th", "ไทย", "thai"],
      turkish: ["tr", "türkçe", "turkish"],
      arabic: ["ar", "العربية", "arabic"],
      greek: ["el", "ελληνικά", "greek"],
      hebrew: ["he", "עברית", "hebrew"],
      swedish: ["sv", "svenska", "swedish"],
      finnish: ["fi", "suomi", "finnish"],
      danish: ["da", "dansk", "danish"],
      norwegian: ["no", "norsk", "norwegian"],
      czech: ["cs", "čeština", "czech"],
      hungarian: ["hu", "magyar", "hungarian"],
      indonesian: ["id", "bahasa indonesia", "indonesian"],
      ukrainian: ["uk", "українська", "ukrainian"],
      english: ["en", "english"]
    }

    const voiceSelectionMatches = (text: string) => {
      const cleanText = text.toLowerCase().trim()
      if (!cleanText) return false

      // Avoid matching generic brand/category words on their own
      const genericWords = [
        "google", "microsoft", "apple", "english", "voice", "voices", "select",
        "selection", "list", "male", "female", "natural", "desktop", "united", "states"
      ]
      if (genericWords.includes(cleanText)) {
        return false
      }

      let bestVoice: SpeechSynthesisVoice | null = null
      let maxScore = 0

      for (const voice of overlayStateRef.current.voices) {
        const fullTitle = (voice.name || "").toLowerCase()
        const simpleName = simplifyVoiceName(voice.name || "").toLowerCase()
        const lang = (voice.lang || "").toLowerCase()
        let score = 0

        // Exact full name or simple name match
        if (cleanText === fullTitle || cleanText === simpleName) {
          score += 300
        }

        // Check mapping for language keywords
        for (const [langName, aliases] of Object.entries(LANG_MAP)) {
          if (cleanText.includes(langName)) {
            if (aliases.some(a => lang.startsWith(a) || fullTitle.includes(a) || simpleName.includes(a))) {
              score += 150
            }
          }
        }

        // Check specific voice names (David, Mark, Zira, Samantha, Alex, Victoria, etc.)
        const specificNames = [
          "david", "mark", "zira", "samantha", "alex", "victoria", "daniel",
          "fred", "karen", "mora", "rishi", "george", "hazel", "susan", "catherine"
        ]
        for (const nameKey of specificNames) {
          if (cleanText.includes(nameKey) && (fullTitle.includes(nameKey) || simpleName.includes(nameKey))) {
            score += 150
          }
        }

        // Provider matching (google, microsoft, apple)
        if (cleanText.includes("google") && fullTitle.includes("google")) score += 10
        if (cleanText.includes("microsoft") && fullTitle.includes("microsoft")) score += 10
        if (cleanText.includes("apple") && fullTitle.includes("apple")) score += 10

        if (score > maxScore) {
          maxScore = score
          bestVoice = voice
        }
      }

      // Require threshold score of >= 100 to prevent premature matching on partial interim words (e.g. 'google russ', 'google kore')
      if (!bestVoice || maxScore < 100) return false

      const matchedVoice = bestVoice

      // Cancel ongoing sequential TTS narration instantly if user speaks a voice name
      window.speechSynthesis.cancel()
      isReadingVoiceListRef.current = false

      setSelectedVoiceURI(matchedVoice.voiceURI)
      selectedVoiceURIRef.current = matchedVoice.voiceURI
      setSpeakingVoiceURI(matchedVoice.voiceURI)
      updateSelectedVoice(matchedVoice.voiceURI, matchedVoice.name || "")
      setIsVoiceDropdownOpen(true)
      speakFeedback(`${simplifyVoiceName(matchedVoice.name || "")} selected`)
      setSettingsState((state) => {
        state.selectedVoiceURI = matchedVoice.voiceURI
        state.isVoiceDropdownOpen = true
      })
      setTimeout(() => {
        setSpeakingVoiceURI((prev) => prev === matchedVoice.voiceURI ? null : prev)
        setIsVoiceDropdownOpen(false)
        setSettingsState((state) => { state.isVoiceDropdownOpen = false })
      }, 1500)
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

        ; (instance as any).onsoundstart = () => {
        }

      instance.onresult = (event: any) => {
        if (!settingsRecognitionArmedRef.current) return

        // Gating: ONLY decide and execute on finalized speech results
        let hasFinal = false
        let liveText = ""
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const resItem = event.results[i]
          if (resItem?.isFinal) {
            hasFinal = true
            const item = resItem[0]
            if (item) {
              liveText += item.transcript + " "
            }
          }
        }

        if (!hasFinal) return

        liveText = liveText.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()

        if (!liveText) return

        let cleanText = liveText

        // Strip exact TTS guide narration so it does not interfere
        const ttsPatterns = [
          "here are the commands voice selection this opens the voice list reset this resets all settings to default close this exits settings",
          "voice selection opened reading voices",
          "voice selection opened you can choose from",
          "voice selection opened",
          "just say the name to select it or say close to exit",
          "just say the name to select it",
          "voice selection closed",
          "settings reset to default",
          "voice guide enabled",
          "voice guide disabled",
          "settings opened you can say commands to hear the list of available actions",
          "settings opened",
          "voice commands activated",
          "voice commands deactivated"
        ]
        for (const p of ttsPatterns) {
          cleanText = cleanText.replace(new RegExp(p, "gi"), " ")
        }

        // Suppress acoustic self-echo from TTS
        const { cleanText: echoFilteredText, isEcho, droppedWords } = ttsEchoFilter.filterTranscript(cleanText)
        if (isEcho) {
          console.log(`%c[Sensa Settings Echo Filter] 🛡️ Suppressed self-echo from TTS: "${droppedWords.join(', ')}" (Raw: "${liveText}")`, "color: #eab308; font-weight: bold;")
        }
        cleanText = echoFilteredText

        const now = Date.now()
        // Prune expired consumed keywords
        consumedKeywords = consumedKeywords.filter(k => k.expires > now)
        if (consumedKeywords.length > 0) {
          consumedKeywords.forEach(({ word }) => {
            const escapedKw = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            cleanText = cleanText.replace(new RegExp(`\\b${escapedKw}\\b`, 'gi'), " ")
          })
          cleanText = cleanText.replace(/\s+/g, " ").trim()
        }

        if (!cleanText) return

        const ts = new Date().toISOString().substring(11, 23)
        console.log(`%c[Sensa Settings Voice] 🎤 Heard: "${cleanText}" %c(Raw: "${liveText}")`, "color: #a855f7; font-weight: bold;", "color: #94a3b8;")

        if (now < ignoreSpeechUntil) return

        const paddedSpeech = ` ${cleanText} `
        const check = (...words: string[]) => words.some(w => paddedSpeech.includes(` ${w} `))
        const fuzzyCheck = (target: string, maxDistance = 1) => fuzzyMatch(cleanText, target, maxDistance)

        let matchedCmd = false

        const applyCommand = (commandName: string, keywordsToConsume: string[], action: () => void, customExpires = 1200) => {
          const timeSinceLastCommand = Date.now() - lastCommandTime
          if (commandName === lastCommandName && timeSinceLastCommand < 800) {
            console.log(`%c[Sensa Settings Voice] ⏸️ Ignored duplicate command: "${commandName}" (within 800ms cooldown)`, "color: #f59e0b; font-weight: bold;")
            return
          }

          ignoreSpeechUntil = Date.now() + 350
          lastCommandName = commandName
          lastCommandTime = Date.now()

          const expires = Date.now() + customExpires
          keywordsToConsume.forEach(kw => {
            consumedKeywords.push({ word: kw, expires })
          })

          matchedCmd = true
          console.log(`%c[Sensa Settings Voice] ⚡ Executed command: "${commandName}"`, "color: #10b981; font-weight: bold; background: rgba(16, 185, 129, 0.1); padding: 2px 6px; border-radius: 4px;")
          action()
        }

        const state = overlayStateRef.current

        // 1. Voice Dropdown Close: if voice dropdown is open, say "close" to close dropdown
        if (state.isVoiceDropdownOpen) {
          const closeDropdownMatch = cleanText.match(/\b(close voice selection|close dropdown|close|closed|clothes|clos|exit|shut|leave|cancel|dismiss|back|go back|done)\b/i)
          if (closeDropdownMatch) {
            applyCommand("close voice selection", ["close voice selection", "close dropdown", "voice selection"], () => {
              setIsVoiceDropdownOpen(false)
              setSettingsState((next) => { next.isVoiceDropdownOpen = false })
              window.speechSynthesis.cancel()
              isReadingVoiceListRef.current = false
              setSpeakingVoiceURI(null)
              speakFeedback("Voice selection closed")
            }, 300)
            return
          }
        } else {
          // 2. Settings Modal Close: ALWAYS allowed immediately, even if voice commands are inactive/standby
          const closeSettingsMatch = cleanText.match(/\b(close settings|close|closed|clothes|clos|exit|shut|leave|cancel|dismiss|back|go back|done|finish)\b/i)
          if (closeSettingsMatch || fuzzyCheck("close", 1)) {
            applyCommand("close settings", ["close settings", "close", "closed", "clothes", "clos", "exit", "shut", "leave", "cancel", "dismiss", "back", "done"], () => {
              window.speechSynthesis.cancel()
              isReadingVoiceListRef.current = false
              setSpeakingVoiceURI(null)
              teardownRecognition()
              setIsMounted(false)
              setTimeout(() => onCloseRef.current(), 150)
            })
            return
          }
        }

        // 3. If voice commands are inactive, only wake word "sensa" can activate them
        if (!isVoiceCommandActiveRef.current) {
          if (check("sensa", "sansa", "sensor", "sensia", "sincere", "center", "censor", "senser", "censer", "sens") || fuzzyCheck("sensa", 1)) {
            applyCommand("sensa", ["sensa", "sansa", "sensor", "sensia", "sincere", "center", "censor", "senser", "censer", "sens"], () => {
              playClickAudio("Voice commands activated")
              onToggleVoiceCommand?.()
            })
          }
          return
        }

        // 4. Voice command deactivation
        if (check("stop listening", "deactivate voice", "deactivate voice command", "deactivate listening")) {
          applyCommand("deactivate-voice", ["stop listening", "deactivate voice", "deactivate voice command", "deactivate listening"], () => {
            playClickAudio("Voice commands deactivated")
            onToggleVoiceCommand?.()
          })
          return
        }

        // 5. Active voice commands when dropdown is open
        if (state.isVoiceDropdownOpen) {
          if (check("next voice", "voice next", "next selection")) {
            applyCommand("next voice", ["next voice", "voice next", "next selection"], () => cycleVoice(1))
            return
          }
          if (check("previous voice", "prev voice", "last voice")) {
            applyCommand("previous voice", ["previous voice", "prev voice", "last voice"], () => cycleVoice(-1))
            return
          }
          if (voiceSelectionMatches(cleanText)) {
            applyCommand("select specific voice", [cleanText], () => {})
            return
          }
        } else {
          // 6. Active voice commands for main settings
          if (check("help", "commands")) {
            applyCommand("help", ["help", "commands"], () => {
              speakFeedback("Here are the commands. Voice selection. This opens the voice list. Reset. This resets all settings to default. Close. This exits settings.")
            })
            return
          }
          if (check("reset default", "reset defaults", "reset settings", "reset", "default") || fuzzyCheck("reset default", 1)) {
            applyCommand("reset to default", ["reset default", "reset defaults", "reset settings", "reset", "default"], () => {
              handleResetToDefault()
            })
            return
          }
          if (
            check("voice selection", "voice election", "vice election", "three selection", "free selection", "boys selection", "voice select", "select voice", "voice voices", "voices", "voice list", "open voice") ||
            fuzzyCheck("voice selection", 2) ||
            fuzzyCheck("select voice", 2) ||
            (paddedSpeech.includes(" voice ") && (paddedSpeech.includes(" selection ") || paddedSpeech.includes(" election ") || paddedSpeech.includes(" select ") || paddedSpeech.includes(" list ")))
          ) {
            applyCommand("open voice selection", ["voice selection", "voice election", "vice election", "voice select", "select voice", "open voice", "voices", "voice list"], () => {
              setIsVoiceDropdownOpen(true)
              setSettingsState((next) => { next.isVoiceDropdownOpen = true })
              if (isVoiceGuideEnabledRef.current) {
                startReadingVoiceListRef.current()
              }
            })
            return
          }
        }

        if (!matchedCmd) {
          console.log(`%c[Sensa Settings Voice] ❓ No command matched: "${cleanText}"`, "color: #64748b;")
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

    let startRetryTimer: number | null = null
    const safeStart = (retries = 0) => {
      if (!isComponentMounted || isPermanentlyDead) return
      if (!recognition) {
        buildRecognition()
      }
      try {
        recognition?.start()
      } catch (e: any) {
        if (retries < 10 && isComponentMounted && !isPermanentlyDead) {
          startRetryTimer = window.setTimeout(() => safeStart(retries + 1), 50)
        }
      }
    }

    if (isVoiceCommandActiveRef.current) {
      stopVisualModeVoiceListener()
    }
    buildRecognition()
    const startTimeout = window.setTimeout(() => {
      safeStart()
    }, 30)

    return () => {
      isComponentMounted = false
      settingsRecognitionArmedRef.current = false
      window.removeEventListener("click", reviveEngine)
      window.removeEventListener("focus", reviveEngine)
      window.removeEventListener("visibilitychange", handleVisibilityChange)
      if (restartTimer) window.clearTimeout(restartTimer)
      if (startRetryTimer) window.clearTimeout(startRetryTimer)
      window.clearTimeout(startTimeout)
      teardownRecognition()
    }
  }, [playClickAudio, isTabVisible, isBrave])

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

  const previewVoice = (voice: SpeechSynthesisVoice) => {
    if (isReadingVoiceListRef.current) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(simplifyVoiceName(voice.name))
    utterance.voice = voice
    utterance.lang = voice.lang
    window.speechSynthesis.speak(utterance)
  }

  const startReadingVoiceList = () => {
    if (!isVoiceGuideEnabledRef.current) return
    window.speechSynthesis.cancel()
    isReadingVoiceListRef.current = true
    window.sensa_utterances = []

    const currentVoices = overlayStateRef.current.voices
    if (!currentVoices || currentVoices.length === 0) return

    const userVoice = resolveVoice(currentVoices, selectedVoiceURIRef.current)

    const intro = new SpeechSynthesisUtterance("Voice selection opened. Reading voices:")
    if (userVoice) {
      intro.voice = userVoice
      intro.lang = userVoice.lang
    }
    window.sensa_utterances.push(intro)
    window.speechSynthesis.speak(intro)

    currentVoices.forEach((voice) => {
      const utterance = new SpeechSynthesisUtterance(simplifyVoiceName(voice.name))
      utterance.voice = voice
      utterance.lang = voice.lang
      utterance.onstart = () => setSpeakingVoiceURI(voice.voiceURI)
      utterance.onend = () => setSpeakingVoiceURI((prev) => prev === voice.voiceURI ? null : prev)
      window.sensa_utterances!.push(utterance)
      window.speechSynthesis.speak(utterance)
    })

    const outro = new SpeechSynthesisUtterance("Just say the name to select it, or say close to exit.")
    if (userVoice) {
      outro.voice = userVoice
      outro.lang = userVoice.lang
    }
    outro.onend = () => {
      isReadingVoiceListRef.current = false
      setSpeakingVoiceURI(null)
    }
    window.sensa_utterances.push(outro)
    window.speechSynthesis.speak(outro)
  }

  useEffect(() => {
    startReadingVoiceListRef.current = startReadingVoiceList
  })

  const handleVoiceChange = (voiceURI: string) => {
    playClickSfx()
    window.speechSynthesis.cancel()
    isReadingVoiceListRef.current = false
    setSpeakingVoiceURI(null)
    setSelectedVoiceURI(voiceURI)
    selectedVoiceURIRef.current = voiceURI
    const selected = voices.find((voice) => voice.voiceURI === voiceURI)
    updateSelectedVoice(voiceURI, selected?.name || "")
    speakWithUserVoice(`Voice set to ${selected ? simplifyVoiceName(selected.name) : 'selected voice'}`, { cancelPrevious: true })
  }

  const handleResetToDefault = () => {
    playClickSfx()
    window.speechSynthesis.cancel()
    isReadingVoiceListRef.current = false
    setSpeakingVoiceURI(null)
    const currentVoices = overlayStateRef.current.voices
    const defaultVoice = currentVoices.find((voice) => voice.name.includes("Google US English")) || currentVoices.find((voice) => (voice.lang === "en-US" || voice.lang.startsWith("en")) && !voice.name.includes("David")) || currentVoices.find((voice) => voice.lang === "en-US" || voice.lang.startsWith("en")) || currentVoices[0]
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
    selectedVoiceURIRef.current = defaultVoiceURI
    updateSelectedVoice(defaultVoiceURI, defaultVoice?.name || "")
    setMagnifierSize(240)
    setMagnifierZoom(2.0)
    chrome.storage.local.set({
      sensa_visual_highlight_color: DEFAULT_HIGHLIGHT_COLOR,
      sensa_visual_autoscroll_enabled: true,
      sensa_visual_highlight_mouse_screen_reader: true,
      sensa_visual_image_alt_reader_enabled: true,
      sensa_visual_voice_guide_enabled: true,
      sensa_visual_sound_effects_enabled: true,
      sensa_visual_voice_uri: defaultVoiceURI,
      sensa_visual_voice_name: defaultVoice?.name || "",
      sensa_visual_magnifier_size: 240,
      sensa_visual_magnifier_zoom: 2.0
    })
    speakWithUserVoice("Settings reset to default", { cancelPrevious: true })
  }

  const isBackdropMouseDownRef = useRef(false)
  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && isBackdropMouseDownRef.current) {
      isBackdropMouseDownRef.current = false
      playClickSfx()
      window.speechSynthesis.cancel()
      isReadingVoiceListRef.current = false
      setSpeakingVoiceURI(null)
      setIsMounted(false)
      setTimeout(onClose, 300)
    }
  }


  const modalBg = isDark ? "bg-[#141416]/96 backdrop-blur-3xl border-white/10" : "bg-white/95 backdrop-blur-3xl border-white/40"
  const textColor = isDark ? "text-gray-100" : "text-gray-900"
  const labelColor = isDark ? "text-gray-200" : "text-gray-700"
  const inputBg = isDark ? "bg-[#2C2C2E]/60 hover:bg-[#2C2C2E]" : "bg-white/60 hover:bg-white"
  const inputBorder = isDark ? "border-white/10" : "border-black/5"
  const secondaryText = isDark ? "text-gray-400" : "text-gray-500"
  const dividerClass = isDark ? "border-white/10" : "border-black/5"
  const iconColor = isDark ? "text-[#0A44FF]" : "text-[#0A44FF]"

  const renderToggleSwitch = (checked: boolean) => (
    <div 
      className={`w-12 h-7 rounded-full p-0.5 flex items-center transition-all duration-300 shadow-inner shrink-0 cursor-pointer ${checked ? "" : isDark ? "bg-gray-600" : "bg-gray-300"}`}
      style={checked ? { backgroundImage: "linear-gradient(to right, #0A44FF, #0099FF)" } : undefined}
    >
      <div className={`w-6 h-6 rounded-full bg-white shadow-md border border-black/5 transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${checked ? "translate-x-5" : "translate-x-0"}`} />
    </div>
  )

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
      className={`fixed inset-0 z-[999999] flex items-center justify-center bg-black/30 backdrop-blur-sm font-sans transition-opacity duration-300 ${isMounted ? 'opacity-100' : 'opacity-0'}`}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={modalBoxRef}
        data-sensa-extension-panel="true"
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
          <h2 
            className="text-[26px] font-bold tracking-tight px-1 pb-1"
            style={{ backgroundImage: "linear-gradient(to right, #0A44FF, #0099FF)", WebkitBackgroundClip: "text", color: "transparent" }}
          >
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

        <div
          className="flex flex-col gap-3 max-h-[540px] overflow-y-auto custom-scrollbar pr-2 -mr-2"
          onScroll={() => {
            if (isVoiceDropdownOpen) setIsVoiceDropdownOpen(false)
            if (showColorPicker) setShowColorPicker(false)
          }}
        >

          <label
            className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer`}
            {...getHoverHandlers("Voice Guide. Reads out actions and settings aloud.")}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 pointer-events-none">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" /></svg>
              <div className="flex flex-col">
                <span className={`text-[15px] font-semibold tracking-wide ${labelColor}`}>Voice Guide</span>
                <span className={`text-[11px] ${secondaryText}`}>Reads out actions and settings aloud</span>
              </div>
            </div>
            <span className="relative inline-flex items-center shrink-0 pointer-events-none">
              <input
                type="checkbox"
                className="sr-only"
                checked={isVoiceGuideEnabled}
                onChange={(e) => handleVoiceGuideToggle(e.target.checked)}
              />
              {renderToggleSwitch(isVoiceGuideEnabled)}
            </span>
          </label>

          <label
            className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer`}
            {...getHoverHandlers("Sound Effects. Play sounds on clicks and hovers.")}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 pointer-events-none">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><path d="M11 5 6 9H2v6h4l5 4z" /><path d="M19 9a5 5 0 0 1 0 6" /><path d="M21 7a9 9 0 0 1 0 10" /></svg>
              <div className="flex flex-col">
                <span className={`text-[15px] font-semibold tracking-wide ${labelColor}`}>Sound Effects</span>
                <span className={`text-[11px] ${secondaryText}`}>Play sounds on clicks and hovers</span>
              </div>
            </div>
            <span className="relative inline-flex items-center shrink-0 pointer-events-none">
              <input
                type="checkbox"
                className="sr-only"
                checked={isSoundEffectsEnabled}
                onChange={(e) => handleSoundEffectsToggle(e.target.checked)}
              />
              {renderToggleSwitch(isSoundEffectsEnabled)}
            </span>
          </label>

          <label
            className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer`}
            {...getHoverHandlers("Autoscroll Reading. Auto-scroll the page while reading.")}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 pointer-events-none">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M12 7l2 2-2 2" /><path d="M12 17l-2-2 2-2" /></svg>
              <div className="flex flex-col">
                <span className={`text-[15px] font-semibold tracking-wide ${labelColor}`}>Autoscroll Reading</span>
                <span className={`text-[11px] ${secondaryText}`}>Auto-scroll the page while reading</span>
              </div>
            </div>
            <span className="relative inline-flex items-center shrink-0 pointer-events-none">
              <input
                type="checkbox"
                className="sr-only"
                checked={isAutoscrollEnabled}
                onChange={(e) => handleAutoscrollToggle(e.target.checked)}
              />
              {renderToggleSwitch(isAutoscrollEnabled)}
            </span>
          </label>

          <label
            className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer`}
            {...getHoverHandlers("Mouse Reader. Read text highlighted by mouse.")}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 pointer-events-none">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" /><path d="M13 13l6 6" /></svg>
              <div className="flex flex-col">
                <span className={`text-[15px] font-semibold tracking-wide ${labelColor}`}>Mouse Reader</span>
                <span className={`text-[11px] ${secondaryText}`}>Read text highlighted by mouse</span>
              </div>
            </div>
            <span className="relative inline-flex items-center shrink-0 pointer-events-none">
              <input
                type="checkbox"
                className="sr-only"
                checked={isHighlightMouseScreenReaderEnabled}
                onChange={(e) => handleHighlightMouseScreenReaderToggle(e.target.checked)}
              />
              {renderToggleSwitch(isHighlightMouseScreenReaderEnabled)}
            </span>
          </label>

          <label
            className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors cursor-pointer`}
            {...getHoverHandlers("Image Reader. Read image descriptions out loud.")}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 pointer-events-none">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
              <div className="flex flex-col">
                <span className={`text-[15px] font-semibold tracking-wide ${labelColor}`}>Image Reader</span>
                <span className={`text-[11px] ${secondaryText}`}>Read image descriptions out loud</span>
              </div>
            </div>
            <span className="relative inline-flex items-center shrink-0 pointer-events-none">
              <input
                type="checkbox"
                className="sr-only"
                checked={isImageAltReaderEnabled}
                onChange={(e) => handleImageAltReaderToggle(e.target.checked)}
              />
              {renderToggleSwitch(isImageAltReaderEnabled)}
            </span>
          </label>

          <div
            className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} relative hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors`}
            {...getHoverHandlers("Highlight Color. Pick the color used while reading.")}
          >
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 ${iconColor}`}><path d="M14.5 4.5l5 5" /><path d="M11 8l-7 7-1 4 4-1 7-7" /><path d="M14 7l3 3" /></svg>
              <div className="flex flex-col">
                <span className={`text-[15px] font-semibold tracking-wide ${labelColor}`}>Highlight Color</span>
                <span className={`text-[11px] whitespace-nowrap ${secondaryText}`}>Pick the color used while reading</span>
              </div>
            </div>
            <div className="relative flex items-center justify-end shrink-0">
              <button
                ref={colorBtnRef}
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation()
                  playClickSfx()
                  if (!showColorPicker) {
                    const btnRect = e.currentTarget.getBoundingClientRect()
                    const modalRect = modalBoxRef.current?.getBoundingClientRect()
                    if (btnRect && modalRect) {
                      const scale = isMounted ? 1 : 0.95
                      setColorPickerPos({
                        top: (btnRect.top - modalRect.top) / scale,
                        right: (modalRect.right - btnRect.right) / scale,
                        width: btnRect.width / scale,
                        height: btnRect.height / scale
                      })
                    }
                  }
                  setShowColorPicker((prev) => !prev)
                  playClickAudio(showColorPicker ? "Highlight color closed" : "Highlight color opened")
                }}
                className="w-10 h-10 rounded-full cursor-pointer shadow-[0_4px_12px_rgba(0,0,0,0.15)] border-2 border-white/40 ring-2 ring-black/5 focus:outline-none focus:ring-4 focus:ring-[#0A44FF]/50 transition-all active:scale-90 hover:scale-105"
                style={{ backgroundColor: highlightColor }}
                aria-label="Pick highlight color"
              />
            </div>
          </div>

          <div
            className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} relative z-50 hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors`}
            {...getHoverHandlers("Voice Selection. Choose which voice reads the text.")}
          >
            <div className="flex items-center gap-3 min-w-0 shrink">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 shrink-0 ${iconColor}`}><line x1="4" y1="6" x2="4" y2="18" /><line x1="8" y1="10" x2="8" y2="14" /><line x1="12" y1="4" x2="12" y2="20" /><line x1="16" y1="8" x2="16" y2="16" /><line x1="20" y1="11" x2="20" y2="13" /></svg>
              <div className="flex flex-col min-w-0">
                <span className={`text-[15px] font-semibold tracking-wide ${labelColor}`}>Voice Selection</span>
                <span className={`text-[11px] ${secondaryText} truncate`}>Choose which voice reads the text</span>
              </div>
            </div>
            <div className="relative w-[160px] shrink-0 ml-4">
              <button
                ref={voiceBtnRef}
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  playClickSfx()
                  if (!isVoiceDropdownOpen) {
                    const btnRect = e.currentTarget.getBoundingClientRect()
                    const modalRect = modalBoxRef.current?.getBoundingClientRect()
                    if (btnRect && modalRect) {
                      const scale = isMounted ? 1 : 0.95
                      setVoiceMenuPos({
                        top: (btnRect.bottom - modalRect.top) / scale + 6,
                        right: (modalRect.right - btnRect.right) / scale
                      })
                    }
                  }
                  const willOpen = !isVoiceDropdownOpen
                  setIsVoiceDropdownOpen(willOpen)
                  if (willOpen) {
                    if (isVoiceGuideEnabledRef.current) {
                      startReadingVoiceList()
                    } else {
                      playClickAudio("Voice selection")
                    }
                  } else {
                    window.speechSynthesis.cancel()
                    isReadingVoiceListRef.current = false
                    setSpeakingVoiceURI(null)
                  }
                }}
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
            </div>
          </div>

          <div
            className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} relative hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors`}
            {...getHoverHandlers("Capture Area. Set the size of the magnifying bubble on screen.")}
          >
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 shrink-0 ${iconColor}`}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /></svg>
              <div className="flex flex-col">
                <span className={`text-[15px] font-semibold tracking-wide ${labelColor}`}>Capture Area</span>
                <span className={`text-[11px] ${secondaryText}`}>Set the size of the magnifying bubble on screen</span>
              </div>
            </div>
            <div className="flex items-center gap-3 ml-4 shrink-0">
              <input
                type="range" min="150" max="400" step="10"
                value={magnifierSize}
                onChange={(e) => {
                  const val = Number(e.target.value)
                  setMagnifierSize(val)
                  chrome.storage.local.set({ sensa_visual_magnifier_size: val })
                }}
                onPointerUp={() => {
                  playClickAudio(`${magnifierSize} pixels`)
                }}
                className="w-28 accent-[#0A44FF] cursor-pointer"
                aria-label="Magnifier Capture Area"
              />
              <span className={`text-[14px] font-bold w-14 text-right tracking-tight ${iconColor}`}>
                {magnifierSize}px
              </span>
            </div>
          </div>

          <div
            className={`flex items-center justify-between py-3 px-3 border-b ${dividerClass} relative hover:bg-black/5 dark:hover:bg-white/5 rounded-xl transition-colors`}
            {...getHoverHandlers("Magnifier Zoom. Set how much the lens magnifies the text.")}
          >
            <div className="flex items-center gap-3">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`w-5 h-5 shrink-0 ${iconColor}`}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></svg>
              <div className="flex flex-col">
                <span className={`text-[15px] font-semibold tracking-wide ${labelColor}`}>Magnifier Zoom</span>
                <span className={`text-[11px] ${secondaryText}`}>Set how much the lens magnifies the text</span>
              </div>
            </div>
            <div className="flex items-center gap-3 ml-4 shrink-0">
              <input
                type="range" min="1.5" max="4.0" step="0.25"
                value={magnifierZoom}
                onChange={(e) => {
                  const val = Number(e.target.value)
                  setMagnifierZoom(val)
                  chrome.storage.local.set({ sensa_visual_magnifier_zoom: val })
                }}
                onPointerUp={() => {
                  playClickAudio(`${magnifierZoom} times zoom`)
                }}
                className="w-28 accent-[#0A44FF] cursor-pointer"
                aria-label="Magnifier Zoom Level"
              />
              <span className={`text-[14px] font-bold w-14 text-right tracking-tight ${iconColor}`}>
                {magnifierZoom}x
              </span>
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

        {showColorPicker && (
          <div
            style={{
              position: 'absolute',
              top: `${colorPickerPos.top}px`,
              right: `${colorPickerPos.right}px`,
              width: `${colorPickerPos.width}px`,
              height: `${colorPickerPos.height}px`
            }}
            className="z-[999999] pointer-events-none"
          >
            <div className="pointer-events-auto w-full h-full relative">
              <ColorPickerPopup
                isDark={isDark} initialColor={highlightColor}
                onColorChange={handleHighlightChange} onClose={() => setShowColorPicker(false)}
                placement="end"
              />
            </div>
          </div>
        )}

        {isVoiceDropdownOpen && (
          <>
            <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setIsVoiceDropdownOpen(false); window.speechSynthesis.cancel(); isReadingVoiceListRef.current = false; setSpeakingVoiceURI(null) }} />
            <ul
              style={{
                position: 'absolute',
                top: `${voiceMenuPos.top}px`,
                right: `${voiceMenuPos.right}px`,
                width: '260px'
              }}
              className={`z-50 max-h-56 overflow-y-auto overflow-x-hidden ${modalBg} border ${inputBorder} rounded-xl shadow-2xl py-2 text-[13px] custom-scrollbar`}
              role="listbox"
            >
              {voices.map((voice) => {
                const isSelected = selectedVoiceURI === voice.voiceURI
                const isSpeaking = speakingVoiceURI === voice.voiceURI
                const isDefault = voice.voiceURI === defaultVoiceURIRef.current
                const displayName = simplifyVoiceName(voice.name)

                return (
                  <li
                    id={`voice-option-${voice.voiceURI.replace(/[^a-zA-Z0-9]/g, '_')}`}
                    key={voice.voiceURI}
                    role="option"
                    aria-selected={isSelected}
                    className={`px-3.5 py-2.5 cursor-pointer flex items-center justify-between gap-2 w-full text-left transition-all m-1 rounded-xl ${
                      isSelected
                        ? "bg-gradient-to-r from-[#0A44FF] to-[#0080FF] text-white shadow-md font-semibold"
                        : isSpeaking
                          ? "bg-[#0A44FF]/25 text-[#0A44FF] dark:text-blue-300 ring-2 ring-[#0A44FF]/50 font-semibold"
                          : isDark
                            ? "text-gray-100 hover:bg-white/10 hover:text-white font-medium"
                            : "text-gray-800 hover:bg-[#0A44FF]/10 hover:text-[#0A44FF] font-medium"
                    } ${isSpeaking && isSelected ? "ring-2 ring-white/80 shadow-[0_0_12px_rgba(10,68,255,0.5)]" : ""}`}
                    onMouseEnter={() => { playHoverSfx(); previewVoice(voice) }}
                    onClick={() => { handleVoiceChange(voice.voiceURI); setIsVoiceDropdownOpen(false) }}
                    style={{ fontFamily: `"${voice.name}", system-ui, sans-serif` }}
                  >
                    <span className="truncate flex-1">
                      {displayName}
                    </span>
                    {isDefault && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${
                        isSelected 
                          ? "bg-white/25 text-white" 
                          : isDark 
                            ? "bg-white/10 text-gray-300" 
                            : "bg-black/5 text-gray-600"
                      }`}>
                        Default
                      </span>
                    )}
                    {isSelected && (
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-white shrink-0">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )}

      </div>
    </div>
  )
}