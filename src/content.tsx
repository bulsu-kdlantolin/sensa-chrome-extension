import cssText from "data-text:~style.css"
import type { PlasmoCSConfig } from "plasmo"
import { useState, useRef, useEffect } from "react"
import VisualDock from "./components/VisualDock"
import AuditoryDock from "./components/AuditoryDock"
import VisualSettingsModal from "./components/VisualSettingsModal" // NEW IMPORT
import AuditorySettingsModal from "./components/AuditorySettingsModal"
import TranscriptHistoryOverlay from "./components/TranscriptHistoryOverlay"
import ReadingSpeedOverlay from "./components/ReadingSpeedOverlay"
import CaptionLanguageOverlay from "./components/CaptionLanguageOverlay"
import TextSizeOverlay from "./components/TextSizeOverlay"
import CaptionTransparencyOverlay from "./components/CaptionTransparencyOverlay"
import FocusModeOverlay from "./components/FocusModeOverlay"
import LiveCaptionBox from "./components/LiveCaptionBox"
import type { SensaUserProfile } from "./lib/storage"
import { useSpeech } from "./hooks/useSpeech"
import { useLiveCaptions } from "./hooks/useLiveCaptions"
import {
  startModeSelectionVoiceListener,
  stopModeSelectionVoiceListener
} from "./lib/modeSelectionVoiceBridge"
import {
  startWelcomeVoiceListener,
  stopWelcomeVoiceListener
} from "./lib/welcomeVoiceBridge"
import {
  startVisualModeVoiceListener,
  stopVisualModeVoiceListener
} from "./lib/visualModeVoiceBridge"

import { audioInterceptorScript } from "./audioInterceptor"

// ==========================================
// 🎮 INJECT WEB AUDIO API INTERCEPTOR
// ==========================================
const injectAudioInterceptor = () => {
  const script = document.createElement('script')
  script.textContent = audioInterceptorScript
  if (document.documentElement) {
    document.documentElement.prepend(script)
  } else {
    document.head?.appendChild(script)
  }
  setTimeout(() => script.remove(), 100)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectAudioInterceptor)
} else {
  injectAudioInterceptor()
}

// ==========================================
// ⚡ HIDDEN WAKE-UP PING FOR RENDER BACKEND
// ==========================================
try {
  const lastPing = sessionStorage.getItem("sensa_backend_ping")
  if (!lastPing || Date.now() - Number(lastPing) > 5 * 60 * 1000) {
    sessionStorage.setItem("sensa_backend_ping", String(Date.now()))
    fetch("https://sensa-chrome-extension-backend.onrender.com/").catch(() => {})
  }
} catch {}

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"]
}

export const getStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

interface AuditorySettingsState {
  fontFamily: string
  showOriginalText: boolean
  textColor: string
  captionBgColor: string
  outputDevice: string
}

const DEFAULT_AUDITORY_SETTINGS: AuditorySettingsState = {
  fontFamily: "Arial",
  showOriginalText: true,
  textColor: "#FFFFFF",
  captionBgColor: "#000000",
  outputDevice: "Default - Speaker"
}

const hexToRgb = (hex: string) => {
  const cleaned = hex.trim().replace(/^#/, "")
  if (!/^([A-Fa-f0-9]{6})$/.test(cleaned)) return null

  const value = Number.parseInt(cleaned, 16)
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  }
}

const colorWithOpacity = (hex: string, opacity: number) => {
  const rgb = hexToRgb(hex)
  const alpha = Math.max(0.1, Math.min(1, opacity))

  if (!rgb) {
    return `rgba(0, 0, 0, ${alpha})`
  }

  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

const getSpeechRate = (readingSpeed: number) => {
  if (!Number.isFinite(readingSpeed)) return 1

  const clamped = Math.max(0.75, Math.min(2.5, readingSpeed))
  if (clamped <= 1) return clamped

  return 1 + (clamped - 1) * 0.4
}

export default function FloatingDockManager() {
  const [activeMode, setActiveMode] = useState<"visual" | "auditory" | null>(null)
  const [userThemePref, setUserThemePref] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)

  // NEW STATE: Tracks if the settings popup is open
  const [isVisualSettingsOpen, setIsVisualSettingsOpen] = useState(false)
  const [isVisualSettingsOpenViaVoice, setIsVisualSettingsOpenViaVoice] = useState(false)
  const [isAuditorySettingsOpen, setIsAuditorySettingsOpen] = useState(false)
  const [isPopupOpen, setIsPopupOpen] = useState(false)

  useEffect(() => {
    const handleConnect = (port: chrome.runtime.Port) => {
      if (port.name === "sensa-popup") {
        setIsPopupOpen(true)
        port.onDisconnect.addListener(() => {
          setIsPopupOpen(false)
          stopVisualModeVoiceListener()
          stopWelcomeVoiceListener()
          stopModeSelectionVoiceListener()
          setIsModeSelectionVoiceActive(false)
        })
      }
    }
    chrome.runtime.onConnect.addListener(handleConnect)
    return () => {
      chrome.runtime.onConnect.removeListener(handleConnect)
    }
  }, [])
  const [isCaptionLanguageOpen, setIsCaptionLanguageOpen] = useState(false)
  const [isTranscriptHistoryOpen, setIsTranscriptHistoryOpen] = useState(false)
  const [isTextSizeOpen, setIsTextSizeOpen] = useState(false)
  const [isCaptionTransparencyOpen, setIsCaptionTransparencyOpen] = useState(false)
  const [auditorySettings, setAuditorySettings] = useState<AuditorySettingsState>(DEFAULT_AUDITORY_SETTINGS)
  const [captionLanguage, setCaptionLanguage] = useState("en-US")
  const [textSize, setTextSize] = useState(32)
  const [captionTransparency, setCaptionTransparency] = useState(75)
  const [isFocusMode, setIsFocusMode] = useState(false)
  const [isCaptionsActive, setIsCaptionsActive] = useState(false)
  const [isReadingSpeedOpen, setIsReadingSpeedOpen] = useState(false)
  const [isReadingSpeedOpenViaVoice, setIsReadingSpeedOpenViaVoice] = useState(false)
  const [readingSpeed, setReadingSpeed] = useState(1)
  const [isVoiceCommandActive, setIsVoiceCommandActive] = useState(false)
  const [isModeSelectionVoiceActive, setIsModeSelectionVoiceActive] = useState(false)
  const [visualInputDeviceId, setVisualInputDeviceId] = useState("default")
  const [isVisualAutoscrollEnabled, setIsVisualAutoscrollEnabled] = useState(true)
  const [isHighlightMouseScreenReaderEnabled, setIsHighlightMouseScreenReaderEnabled] = useState(true)
  const [isImageAltReaderEnabled, setIsImageAltReaderEnabled] = useState(true)

  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)

  const dragRef = useRef<HTMLDivElement>(null)
  const dragStartPos = useRef({ x: 0, y: 0 })
  const activeModeRef = useRef<"visual" | "auditory" | null>(null)

  const isSettingsOverlayOpen =
    isVisualSettingsOpen ||
    isAuditorySettingsOpen ||
    isCaptionLanguageOpen ||
    isTranscriptHistoryOpen ||
    isTextSizeOpen ||
    isCaptionTransparencyOpen ||
    isReadingSpeedOpen
  const isAuditoryModeActive = activeMode === "auditory"

  const [highlightColor, setHighlightColor] = useState("#FFFE00")
  const selectedVoiceURIRef = useRef<string>("")
  const selectedVoiceNameRef = useRef<string>("")
  const speakOverlayFeedback = (message: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis || !window.SpeechSynthesisUtterance) {
      return
    }

    chrome.storage.local.get(["sensa_visual_voice_uri", "sensa_visual_voice_name", "sensa_visual_voice_guide_enabled"], (res) => {
      if (res.sensa_visual_voice_guide_enabled === false) {
        return
      }

      if (typeof res.sensa_visual_voice_uri === "string") {
        selectedVoiceURIRef.current = res.sensa_visual_voice_uri
      }
      if (typeof res.sensa_visual_voice_name === "string") {
        selectedVoiceNameRef.current = res.sensa_visual_voice_name
      }

      window.speechSynthesis.resume()
      window.speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(message)
      const availableVoices = window.speechSynthesis.getVoices()

      if (availableVoices.length > 0) {
        const preferredVoice =
          availableVoices.find((voice) => voice.voiceURI === selectedVoiceURIRef.current) ||
          availableVoices.find((voice) => voice.name === selectedVoiceNameRef.current || voice.name?.includes(selectedVoiceNameRef.current)) ||
          availableVoices[0]

        if (preferredVoice) {
          utterance.voice = preferredVoice
          utterance.lang = preferredVoice.lang
        }
      }

      utterance.rate = 1
      utterance.pitch = 1
      utterance.volume = 1
      window.speechSynthesis.speak(utterance)
    })
  }

  const { isPlaying, isPaused, togglePlayPause, next, prev, restart } = useSpeech(
    readingSpeed,
    highlightColor,
    isSettingsOverlayOpen,
    isVisualAutoscrollEnabled,
    activeMode === "visual"
  )
  const targetLanguage = (captionLanguage.split("-")[0] ?? "EN").toUpperCase()
  const { captions, error: captionsError } = useLiveCaptions(
    isAuditoryModeActive && isCaptionsActive,
    targetLanguage,
    auditorySettings.showOriginalText,
    isCaptionsActive  // Pass the UI toggle state so captions clear when turned off
  )

  useEffect(() => {
    // Load saved voice preferences and keep in sync
    chrome.storage.local.get(["sensa_visual_voice_uri", "sensa_visual_voice_name"], (res) => {
      if (typeof res.sensa_visual_voice_uri === "string") selectedVoiceURIRef.current = res.sensa_visual_voice_uri
      if (typeof res.sensa_visual_voice_name === "string") selectedVoiceNameRef.current = res.sensa_visual_voice_name
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

  useEffect(() => {
    activeModeRef.current = activeMode
  }, [activeMode])

  const syncActiveMode = (mode: "visual" | "auditory" | null) => {
    setActiveMode(mode)
    chrome.storage.local.set({
      sensa_visual_active: mode === "visual",
      sensa_auditory_active: mode === "auditory"
    })
  }

  const deactivateDock = () => {
    setActiveMode(null)
    chrome.storage.local.set({
      sensa_visual_active: false,
      sensa_auditory_active: false,
      sensa_voice_command_active: false
    })
    chrome.runtime.sendMessage({ type: "sensa-activate-mode", mode: null })
  }

  // --- THE BRIDGE ---
  useEffect(() => {
    chrome.storage.local.get(["sensa_visual_active", "sensa_auditory_active", "sensa_user_profile", "sensa_visual_reading_speed", "sensa_visual_highlight_color", "sensa_visual_input_device_id", "sensa_visual_autoscroll_enabled", "sensa_visual_highlight_mouse_screen_reader", "sensa_visual_image_alt_reader_enabled", "sensa_auditory_caption_language", "sensa_auditory_text_size", "sensa_auditory_caption_transparency", "sensa_auditory_focus_mode", "sensa_auditory_settings", "sensa_voice_command_active"], (res) => {
      const storedMode = res.sensa_visual_active ? "visual" : res.sensa_auditory_active ? "auditory" : null
      setActiveMode(storedMode)
      if (res.sensa_user_profile?.globalSettings?.theme === "dark") setUserThemePref(true)
      if (typeof res.sensa_auditory_caption_language === "string") setCaptionLanguage(res.sensa_auditory_caption_language)
      if (typeof res.sensa_auditory_text_size === "number") setTextSize(res.sensa_auditory_text_size)
      if (typeof res.sensa_auditory_caption_transparency === "number") setCaptionTransparency(res.sensa_auditory_caption_transparency)
      if (typeof res.sensa_auditory_focus_mode === "boolean") setIsFocusMode(res.sensa_auditory_focus_mode)
      if (res.sensa_auditory_settings) {
        setAuditorySettings({ ...DEFAULT_AUDITORY_SETTINGS, ...res.sensa_auditory_settings })
      }
      if (typeof res.sensa_visual_highlight_color === "string") {
        setHighlightColor(res.sensa_visual_highlight_color)
      }
      if (typeof res.sensa_visual_reading_speed === "number") {
        setReadingSpeed(res.sensa_visual_reading_speed)
      } else if (typeof res.sensa_user_profile?.visualState?.readingSpeed === "number") {
        setReadingSpeed(res.sensa_user_profile.visualState.readingSpeed)
      }
      if (typeof res.sensa_visual_input_device_id === "string") {
        setVisualInputDeviceId(res.sensa_visual_input_device_id)
      }
      if (typeof res.sensa_visual_autoscroll_enabled === "boolean") {
        setIsVisualAutoscrollEnabled(res.sensa_visual_autoscroll_enabled)
      }
      if (typeof res.sensa_visual_highlight_mouse_screen_reader === "boolean") {
        setIsHighlightMouseScreenReaderEnabled(res.sensa_visual_highlight_mouse_screen_reader)
      } else {
        setIsHighlightMouseScreenReaderEnabled(true)
        chrome.storage.local.set({ sensa_visual_highlight_mouse_screen_reader: true })
      }
      if (typeof res.sensa_visual_image_alt_reader_enabled === "boolean") {
        setIsImageAltReaderEnabled(res.sensa_visual_image_alt_reader_enabled)
      }
      if (typeof res.sensa_voice_command_active === "boolean") {
        setIsVoiceCommandActive(res.sensa_voice_command_active)
      }
    })

    const handleRuntimeMessage = (
      message: { type?: string; mode?: "visual" | "auditory" | null; action?: "start" | "stop" },
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void
    ) => {
      if (message.type === "sensa-health-check") {
        sendResponse({ ok: true, activeMode: activeModeRef.current })
        return true
      }

      if (message.type === "sensa-mode-selection-voice") {
        if (message.action === "start") {
          void startModeSelectionVoiceListener().then((started) => {
            setIsModeSelectionVoiceActive(started)
            sendResponse({ ok: started })
          })
        } else {
          stopModeSelectionVoiceListener()
          setIsModeSelectionVoiceActive(false)
          sendResponse({ ok: true })
        }
        return true
      }

      if (message.type === "sensa-welcome-voice") {
        if (message.action === "start") {
          void startWelcomeVoiceListener().then((started) => {
            sendResponse({ ok: started })
          })
        } else {
          stopWelcomeVoiceListener()
          sendResponse({ ok: true })
        }
        return true
      }

      if (message.type === "sensa-visual-mode-voice") {
        if (message.action === "start") {
          void startVisualModeVoiceListener().then((started) => {
            sendResponse({ ok: started })
          })
        } else {
          stopVisualModeVoiceListener()
          sendResponse({ ok: true })
        }
        return true
      }

      if (message.type !== "sensa-activate-mode") return

      const prevMode = activeModeRef.current
      syncActiveMode(message.mode ?? null)
      if (message.mode === "visual") {
        setIsAuditorySettingsOpen(false)
        setIsCaptionLanguageOpen(false)
        setIsTextSizeOpen(false)
        setIsCaptionTransparencyOpen(false)
        setIsCaptionsActive(false)
      }
      if (message.mode === "auditory") {
        setIsVisualSettingsOpen(false)
        setIsReadingSpeedOpen(false)
        setIsVoiceCommandActive(false)
      }
      if (message.mode === null) {
        setIsVisualSettingsOpen(false)
        setIsAuditorySettingsOpen(false)
        setIsCaptionLanguageOpen(false)
        setIsTextSizeOpen(false)
        setIsCaptionTransparencyOpen(false)
        setIsReadingSpeedOpen(false)
        setIsVoiceCommandActive(false)
        setIsCaptionsActive(false)
      }
    }

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.sensa_visual_active !== undefined) {
        const nextVisual = !!changes.sensa_visual_active.newValue
        const prevVisual = activeModeRef.current === "visual"
        const nextAuditory = changes.sensa_auditory_active !== undefined
          ? !!changes.sensa_auditory_active.newValue
          : (activeModeRef.current === "auditory")

        if (nextVisual && !prevVisual) {
          setActiveMode("visual")
          setIsAuditorySettingsOpen(false)
          setIsCaptionLanguageOpen(false)
          setIsTextSizeOpen(false)
          setIsCaptionTransparencyOpen(false)
          speakOverlayFeedback("Visual mode activated")
        } else if (!nextVisual && prevVisual) {
          setActiveMode(null)
          setIsVisualSettingsOpen(false)
          setIsReadingSpeedOpen(false)
          setIsVoiceCommandActive(false)
          if (!nextAuditory) {
            speakOverlayFeedback("Visual mode deactivated")
          }
        }
      }
      if (changes.sensa_visual_highlight_color !== undefined && typeof changes.sensa_visual_highlight_color.newValue === "string") {
        setHighlightColor(changes.sensa_visual_highlight_color.newValue)
      }
      if (changes.sensa_auditory_active !== undefined) {
        if (changes.sensa_auditory_active.newValue) {
          setActiveMode("auditory")
          setIsVisualSettingsOpen(false)
          setIsReadingSpeedOpen(false)
          setIsVoiceCommandActive(false)
        } else if (activeModeRef.current === "auditory") {
          setActiveMode(null)
          setIsAuditorySettingsOpen(false)
          setIsCaptionLanguageOpen(false)
          setIsTextSizeOpen(false)
          setIsCaptionTransparencyOpen(false)
          setIsCaptionsActive(false)
        }
      }
      if (changes.sensa_auditory_caption_language !== undefined && typeof changes.sensa_auditory_caption_language.newValue === "string") {
        setCaptionLanguage(changes.sensa_auditory_caption_language.newValue)
      }
      if (changes.sensa_auditory_text_size !== undefined && typeof changes.sensa_auditory_text_size.newValue === "number") {
        setTextSize(changes.sensa_auditory_text_size.newValue)
      }
      if (changes.sensa_auditory_caption_transparency !== undefined && typeof changes.sensa_auditory_caption_transparency.newValue === "number") {
        setCaptionTransparency(changes.sensa_auditory_caption_transparency.newValue)
      }
      if (changes.sensa_auditory_settings !== undefined) {
        setAuditorySettings({
          ...DEFAULT_AUDITORY_SETTINGS,
          ...(changes.sensa_auditory_settings.newValue as Partial<AuditorySettingsState>)
        })
      }
      if (changes.sensa_auditory_focus_mode !== undefined && typeof changes.sensa_auditory_focus_mode.newValue === "boolean") {
        setIsFocusMode(changes.sensa_auditory_focus_mode.newValue)
      }
      if (changes.sensa_user_profile !== undefined) {
        const nextProfile = changes.sensa_user_profile.newValue as SensaUserProfile
        setUserThemePref(nextProfile.globalSettings.theme === "dark")
      }
      if (changes.sensa_visual_reading_speed !== undefined && typeof changes.sensa_visual_reading_speed.newValue === "number") {
        setReadingSpeed(changes.sensa_visual_reading_speed.newValue)
      }
      if (changes.sensa_visual_input_device_id !== undefined && typeof changes.sensa_visual_input_device_id.newValue === "string") {
        setVisualInputDeviceId(changes.sensa_visual_input_device_id.newValue)
      }
      if (changes.sensa_visual_autoscroll_enabled !== undefined && typeof changes.sensa_visual_autoscroll_enabled.newValue === "boolean") {
        setIsVisualAutoscrollEnabled(changes.sensa_visual_autoscroll_enabled.newValue)
      }
      if (changes.sensa_visual_highlight_mouse_screen_reader !== undefined && typeof changes.sensa_visual_highlight_mouse_screen_reader.newValue === "boolean") {
        setIsHighlightMouseScreenReaderEnabled(changes.sensa_visual_highlight_mouse_screen_reader.newValue)
      }
      if (changes.sensa_visual_image_alt_reader_enabled !== undefined && typeof changes.sensa_visual_image_alt_reader_enabled.newValue === "boolean") {
        setIsImageAltReaderEnabled(changes.sensa_visual_image_alt_reader_enabled.newValue)
      }
      if (changes.sensa_voice_command_active !== undefined && typeof changes.sensa_voice_command_active.newValue === "boolean") {
        setIsVoiceCommandActive(changes.sensa_voice_command_active.newValue)
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange)
    chrome.runtime.onMessage.addListener(handleRuntimeMessage)

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange)
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage)
      stopModeSelectionVoiceListener()
      setIsModeSelectionVoiceActive(false)
    }
  }, [])

  // Automatically turn off live captions when switching tabs to prevent invalid state / active stream errors
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden" && isCaptionsActive) {
        setIsCaptionsActive(false)
        chrome.runtime.sendMessage({ type: "STOP_CAPTURE" }).catch(() => {})
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [isCaptionsActive])

  // --- DRAG PHYSICS ---
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    setIsDragging(true)
    dragStartPos.current = { x: e.clientX - position.x, y: e.clientY - position.y }
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return
      setPosition({ x: e.clientX - dragStartPos.current.x, y: e.clientY - dragStartPos.current.y })
    }
    const handleMouseUp = () => setIsDragging(false)

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging])

  // --- HIGHLIGHT MOUSE SCREEN READER ---
  useEffect(() => {
    if (!isHighlightMouseScreenReaderEnabled || activeMode !== "visual" || isSettingsOverlayOpen) {
      // Stop reading if settings opened
      window.speechSynthesis.cancel()
      return
    }

    let lastSelectedText = ""

    const handleTextSelection = () => {
      const selection = window.getSelection()

      // Only process if there's actual text selected
      if (!selection || selection.toString().trim().length === 0) {
        // No selection = user clicked blank space, stop reading
        window.speechSynthesis.cancel()
        lastSelectedText = ""
        return
      }

      const selectedText = selection.toString().trim()

      // Only read if selection is different from before
      if (selectedText === lastSelectedText) {
        return
      }

      lastSelectedText = selectedText

      // Cancel previous speech and read new selection
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(selectedText)
      utterance.rate = getSpeechRate(readingSpeed)

      // Apply preferred voice if available (try URI first, then name)
      const availableVoices = window.speechSynthesis.getVoices()
      if (availableVoices.length > 0) {
        let preferred = availableVoices.find((v) => v.voiceURI === selectedVoiceURIRef.current)
        if (!preferred && selectedVoiceNameRef.current) {
          preferred = availableVoices.find((v) => v.name === selectedVoiceNameRef.current || v.name?.includes(selectedVoiceNameRef.current))
        }
        if (preferred) utterance.voice = preferred
      }

      window.speechSynthesis.speak(utterance)
    }

    // When selection changes (including collapse on click), stop if empty
    const handleSelectionChange = () => {
      const sel = window.getSelection()
      if (!sel || sel.toString().trim().length === 0) {
        window.speechSynthesis.cancel()
        lastSelectedText = ""
      }
    }

    // Click on blank space should cancel reading. Use capture to run early.
    const handleDocumentClick = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement | null
      if (!target) return
      // Ignore clicks on interactive form controls, our extension UI, or the visual dock
      if (target.closest('input, button, select, textarea, label, .sensa-popup, .sensa-modal, [data-sensa-visual-dock], [data-sensa-auditory-dock]')) return
      const sel = window.getSelection()
      if (!sel || sel.toString().trim().length === 0) {
        // Only cancel if highlight reader was actively reading something
        if (lastSelectedText) {
          window.speechSynthesis.cancel()
          lastSelectedText = ""
        }
      }
    }

    document.addEventListener("mouseup", handleTextSelection)
    document.addEventListener("selectionchange", handleSelectionChange)
    document.addEventListener("click", handleDocumentClick, true)

    return () => {
      document.removeEventListener("mouseup", handleTextSelection)
      document.removeEventListener("selectionchange", handleSelectionChange)
      document.removeEventListener("click", handleDocumentClick, true)
      window.speechSynthesis.cancel()
    }
  }, [isHighlightMouseScreenReaderEnabled, activeMode, readingSpeed, isSettingsOverlayOpen])

  // --- IMAGE ALT TEXT READER ---
  useEffect(() => {
    if (!isImageAltReaderEnabled || activeMode !== "visual" || isSettingsOverlayOpen) {
      return
    }

    let hoverTimer: number | null = null
    let currentImg: HTMLImageElement | null = null

    const handleMouseOver = (ev: MouseEvent) => {
      const target = ev.target as HTMLElement
      if (target.tagName === 'IMG') {
        const img = target as HTMLImageElement
        const altText = img.alt?.trim()
        if (altText) {
          currentImg = img
          hoverTimer = window.setTimeout(() => {
            window.speechSynthesis.cancel()
            const utterance = new SpeechSynthesisUtterance("Image: " + altText)
            utterance.rate = getSpeechRate(readingSpeed)

            const availableVoices = window.speechSynthesis.getVoices()
            if (availableVoices.length > 0) {
              let preferred = availableVoices.find((v) => v.voiceURI === selectedVoiceURIRef.current)
              if (!preferred && selectedVoiceNameRef.current) {
                preferred = availableVoices.find((v) => v.name === selectedVoiceNameRef.current || v.name?.includes(selectedVoiceNameRef.current))
              }
              if (preferred) utterance.voice = preferred
            }
            window.speechSynthesis.speak(utterance)
          }, 800) // 800ms hover delay
        }
      }
    }

    const handleMouseOut = (ev: MouseEvent) => {
      if (currentImg && ev.target === currentImg) {
        if (hoverTimer) {
          window.clearTimeout(hoverTimer)
          hoverTimer = null
        }
        window.speechSynthesis.cancel()
        currentImg = null
      }
    }

    document.addEventListener("mouseover", handleMouseOver, true)
    document.addEventListener("mouseout", handleMouseOut, true)

    return () => {
      document.removeEventListener("mouseover", handleMouseOver, true)
      document.removeEventListener("mouseout", handleMouseOut, true)
      if (hoverTimer) window.clearTimeout(hoverTimer)
    }
  }, [isImageAltReaderEnabled, activeMode, readingSpeed, isSettingsOverlayOpen])


  // --- RENDER LOGIC & THEME SCOPING ---
  if (!activeMode) return null

  const isVisualActive = activeMode === "visual"
  const isAuditoryActive = isAuditoryModeActive
  const isDark = isVisualActive ? false : userThemePref

  // Notice how the return now uses <> ... </> to group the Modal and the Dock separately
  return (
    <>
      {/* Overlays mounted outside the UI root so coordinates stay viewport-relative */}
      {isAuditoryActive && isFocusMode && <FocusModeOverlay intensity={0.7} />}

      {isAuditoryActive && isCaptionsActive && (
        <LiveCaptionBox
          captions={captions}
          error={captionsError}
          fontSize={textSize}
          textColor={auditorySettings.textColor || DEFAULT_AUDITORY_SETTINGS.textColor}
          bgColor={colorWithOpacity(
            auditorySettings.captionBgColor || DEFAULT_AUDITORY_SETTINGS.captionBgColor,
            captionTransparency / 100
          )}
          fontFamily={auditorySettings.fontFamily || DEFAULT_AUDITORY_SETTINGS.fontFamily}
          showOriginalText={auditorySettings.showOriginalText}
        />
      )}

      <div className="sensa-ui-root">
        {/* 1. THE SETTINGS MODAL (Floats dead center, outside the drag logic) */}
        {isVisualSettingsOpen && (
          <VisualSettingsModal
            onClose={() => {
              setIsVisualSettingsOpen(false)
              setIsVisualSettingsOpenViaVoice(false)
              speakOverlayFeedback("Settings overlay closed")
            }}
            isDark={isDark}
            isVoiceCommandActive={isVoiceCommandActive}
            onToggleVoiceCommand={() => {
              setIsVoiceCommandActive(prev => {
                const next = !prev
                chrome.storage.local.set({ sensa_voice_command_active: next })
                return next
              })
            }}
          />
        )}

        {isReadingSpeedOpen && (
          <ReadingSpeedOverlay
            initialSpeed={readingSpeed}
            onSpeedChange={(newSpeed) => {
              setReadingSpeed(newSpeed)
              chrome.storage.local.set({ sensa_visual_reading_speed: newSpeed })
            }}
            onClose={() => {
              setIsReadingSpeedOpen(false)
              setIsReadingSpeedOpenViaVoice(false)
              speakOverlayFeedback("Reading speed overlay closed")
            }}
            isDark={isDark}
            isVoiceCommandActive={isVoiceCommandActive}
            onToggleVoiceCommand={() => {
              setIsVoiceCommandActive(prev => {
                const next = !prev
                chrome.storage.local.set({ sensa_voice_command_active: next })
                return next
              })
            }}
          />
        )}

        {isAuditorySettingsOpen && (
          <AuditorySettingsModal
            isDark={isDark}
            onClose={() => setIsAuditorySettingsOpen(false)}
          />
        )}

        {isCaptionLanguageOpen && (
          <CaptionLanguageOverlay
            isDark={isDark}
            initialLanguage={captionLanguage}
            onLanguageChange={(language) => {
              setCaptionLanguage(language)
              chrome.storage.local.set({ sensa_auditory_caption_language: language })
            }}
            onClose={() => setIsCaptionLanguageOpen(false)}
          />
        )}

        {isTranscriptHistoryOpen && (
          <TranscriptHistoryOverlay
            isDark={isDark}
            captions={captions}
            onClose={() => setIsTranscriptHistoryOpen(false)}
          />
        )}

        {isTextSizeOpen && (
          <TextSizeOverlay
            isDark={isDark}
            initialSize={textSize}
            onSizeChange={(size) => {
              setTextSize(size)
              chrome.storage.local.set({ sensa_auditory_text_size: size })
            }}
            onClose={() => setIsTextSizeOpen(false)}
          />
        )}

        {isCaptionTransparencyOpen && (
          <CaptionTransparencyOverlay
            isDark={isDark}
            initialTransparency={captionTransparency}
            onTransparencyChange={(value) => {
              setCaptionTransparency(value)
              chrome.storage.local.set({ sensa_auditory_caption_transparency: value })
            }}
            onClose={() => setIsCaptionTransparencyOpen(false)}
          />
        )}

        {/* 2. THE DRAGGABLE DOCK */}
        <div
          ref={dragRef}
          onMouseDown={handleMouseDown}
          style={{
            transform: `translate(calc(0px + ${position.x}px), calc(-50% + ${position.y}px))`,
            cursor: isDragging ? 'grabbing' : 'grab'
          }}
          className="fixed right-4 top-1/2 z-[99999] font-sans"
        >
          {isVisualActive && (
            <VisualDock
              isDark={isDark}
              isMinimized={isMinimized}
              readingSpeed={readingSpeed}
              isPlaying={isPlaying}            // <-- NEW PROP
              isPaused={isPaused}              // <-- NEW PROP
              isVoiceCommandActive={isVoiceCommandActive}
              canRestart={isPlaying || isPaused}
              isVoiceCommandsSuspended={isSettingsOverlayOpen || isReadingSpeedOpen || isModeSelectionVoiceActive || isPopupOpen}
              onTogglePlay={togglePlayPause}   // <-- NEW PROP
              onToggleVoiceCommand={() => {
                setIsVoiceCommandActive(prev => {
                  const next = !prev
                  chrome.storage.local.set({ sensa_voice_command_active: next })
                  return next
                })
              }}
              onNext={next}                    // <-- NEW PROP
              onPrev={prev}                    // <-- NEW PROP
              onRestart={restart}
              onMinimizeToggle={() => setIsMinimized(!isMinimized)}
              onOpenReadingSpeed={(viaVoice) => {
                setIsReadingSpeedOpen(true)
                if (viaVoice) setIsReadingSpeedOpenViaVoice(true)
                speakOverlayFeedback("Reading speed overlay opened")
              }}
              onOpenSettings={(viaVoice) => {
                setIsVisualSettingsOpen(true)
                if (viaVoice) setIsVisualSettingsOpenViaVoice(true)
              }}
              onClose={() => {
                deactivateDock()
                chrome.runtime.sendMessage({ type: "sensa-activate-mode", mode: null })
              }}
            />
          )}

          {isAuditoryActive && (
            <AuditoryDock
              isDark={isDark}
              isMinimized={isMinimized}
              isCaptionsActive={isCaptionsActive}
              onToggleCaptions={() => setIsCaptionsActive((prev) => !prev)}
              onMinimizeToggle={() => setIsMinimized(!isMinimized)}
              onOpenCaptionLanguage={() => {
                // Defer opening so the original click event doesn't immediately hit the modal backdrop
                setTimeout(() => setIsCaptionLanguageOpen(true), 0)
              }}
              onOpenTranscriptHistory={() => setIsTranscriptHistoryOpen(true)}
              onOpenTextSize={() => setIsTextSizeOpen(true)}
              onOpenCaptionTransparency={() => setIsCaptionTransparencyOpen(true)}
              isFocusMode={isFocusMode}
              onToggleFocusMode={() => {
                const next = !isFocusMode
                setIsFocusMode(next)
                chrome.storage.local.set({ sensa_auditory_focus_mode: next })
              }}
              onOpenSettings={() => setIsAuditorySettingsOpen(true)}
              onClose={() => {
                deactivateDock()
                setIsCaptionLanguageOpen(false)
                setIsTranscriptHistoryOpen(false)
                setIsTextSizeOpen(false)
                setIsCaptionTransparencyOpen(false)
                setIsCaptionsActive(false)
              }}
            />
          )}
        </div>
      </div>
    </>
  )
}