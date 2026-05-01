import cssText from "data-text:~style.css"
import type { PlasmoCSConfig } from "plasmo"
import { useState, useRef, useEffect } from "react"
import VisualDock from "./components/VisualDock"
import AuditoryDock from "./components/AuditoryDock"
import VisualSettingsModal from "./components/VisualSettingsModal" // NEW IMPORT
import AuditorySettingsModal from "./components/AuditorySettingsModal"
import ReadingSpeedOverlay from "./components/ReadingSpeedOverlay"
import CaptionLanguageOverlay from "./components/CaptionLanguageOverlay"
import TextSizeOverlay from "./components/TextSizeOverlay"
import CaptionTransparencyOverlay from "./components/CaptionTransparencyOverlay"
import FocusModeOverlay from "./components/FocusModeOverlay"
import LiveCaptionBox from "./components/LiveCaptionBox"
import type { SensaUserProfile } from "./lib/storage"
import { useSpeech } from "./hooks/useSpeech"
import { useVoiceNavigation } from "./hooks/useVoiceNavigation"
import { useLiveCaptions } from "./hooks/useLiveCaptions"

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
  textColor: "#000000",
  captionBgColor: "#FFFFFF",
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

export default function FloatingDockManager() {
  const [activeMode, setActiveMode] = useState<"visual" | "auditory" | null>(null)
  const [userThemePref, setUserThemePref] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  
  // NEW STATE: Tracks if the settings popup is open
  const [isVisualSettingsOpen, setIsVisualSettingsOpen] = useState(false) 
  const [isAuditorySettingsOpen, setIsAuditorySettingsOpen] = useState(false)
  const [isCaptionLanguageOpen, setIsCaptionLanguageOpen] = useState(false)
  const [isTextSizeOpen, setIsTextSizeOpen] = useState(false)
  const [isCaptionTransparencyOpen, setIsCaptionTransparencyOpen] = useState(false)
  const [auditorySettings, setAuditorySettings] = useState<AuditorySettingsState>(DEFAULT_AUDITORY_SETTINGS)
  const [captionLanguage, setCaptionLanguage] = useState("en-US")
  const [textSize, setTextSize] = useState(32)
  const [captionTransparency, setCaptionTransparency] = useState(75)
  const [isFocusMode, setIsFocusMode] = useState(false)
  const [isCaptionsActive, setIsCaptionsActive] = useState(false)
  const [isReadingSpeedOpen, setIsReadingSpeedOpen] = useState(false)
  const [readingSpeed, setReadingSpeed] = useState(1)
  const [isVoiceCommandActive, setIsVoiceCommandActive] = useState(false)
  const [visualInputDeviceId, setVisualInputDeviceId] = useState("default")
  const [isVisualAutoscrollEnabled, setIsVisualAutoscrollEnabled] = useState(true)
  
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  
  const dragRef = useRef<HTMLDivElement>(null)
  const dragStartPos = useRef({ x: 0, y: 0 })
  const activeModeRef = useRef<"visual" | "auditory" | null>(null)

  const isSettingsOverlayOpen =
    isVisualSettingsOpen ||
    isAuditorySettingsOpen ||
    isCaptionLanguageOpen ||
    isTextSizeOpen ||
    isCaptionTransparencyOpen ||
    isReadingSpeedOpen
  const isAuditoryModeActive = activeMode === "auditory"

  const [highlightColor, setHighlightColor] = useState("#FFFE00")
  const { isPlaying, isPaused, togglePlayPause, next, prev, restart } = useSpeech(
    readingSpeed,
    highlightColor,
    isSettingsOverlayOpen,
    isVisualAutoscrollEnabled
  )
  const { lastCommand } = useVoiceNavigation(isVoiceCommandActive, visualInputDeviceId)
  const targetLanguage = (captionLanguage.split("-")[0] ?? "EN").toUpperCase()
  const { captions, error: captionsError } = useLiveCaptions(
    isAuditoryModeActive,
    targetLanguage,
    auditorySettings.showOriginalText
  )

  useEffect(() => {
    activeModeRef.current = activeMode
  }, [activeMode])

  const syncActiveMode = (mode: "visual" | "auditory" | null) => {
    setActiveMode(mode)
    chrome.storage.local.set({ sensa_visual_active: false, sensa_auditory_active: false })
    if (mode === "visual") {
      chrome.storage.local.set({ sensa_visual_active: true, sensa_auditory_active: false })
      return
    }
    if (mode === "auditory") {
      chrome.storage.local.set({ sensa_visual_active: false, sensa_auditory_active: true })
      return
    }
  }

  const deactivateDock = () => {
    setActiveMode(null)
    chrome.storage.local.set({
      sensa_visual_active: false,
      sensa_auditory_active: false
    })
    chrome.runtime.sendMessage({ type: "sensa-activate-mode", mode: null })
  }

  // --- THE BRIDGE ---
  useEffect(() => {
    chrome.storage.local.get(["sensa_visual_active", "sensa_auditory_active", "sensa_user_profile", "sensa_visual_reading_speed", "sensa_visual_highlight_color", "sensa_visual_input_device_id", "sensa_visual_autoscroll_enabled", "sensa_auditory_caption_language", "sensa_auditory_text_size", "sensa_auditory_caption_transparency", "sensa_auditory_focus_mode", "sensa_auditory_settings"], (res) => {
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
    })

    const handleRuntimeMessage = (message: { type?: string; mode?: "visual" | "auditory" | null }) => {
      if (message.type !== "sensa-activate-mode") return

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
        if (changes.sensa_visual_active.newValue) {
          setActiveMode("visual")
          setIsAuditorySettingsOpen(false)
          setIsCaptionLanguageOpen(false)
          setIsTextSizeOpen(false)
          setIsCaptionTransparencyOpen(false)
        } else {
          if (activeModeRef.current === "visual") {
            setActiveMode(null)
            setIsVisualSettingsOpen(false)
            setIsReadingSpeedOpen(false)
          }
          setIsVoiceCommandActive(false)
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
    }

    chrome.storage.onChanged.addListener(handleStorageChange)
    chrome.runtime.onMessage.addListener(handleRuntimeMessage)

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange)
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage)
    }
  }, [])

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


  // --- RENDER LOGIC & THEME SCOPING ---
  if (!activeMode) return null

  const isVisualActive = activeMode === "visual"
  const isAuditoryActive = isAuditoryModeActive
  const isDark = isVisualActive ? false : userThemePref

  // Notice how the return now uses <> ... </> to group the Modal and the Dock separately
  return (
    <>
      {/* 1. THE SETTINGS MODAL (Floats dead center, outside the drag logic) */}
      {isVisualSettingsOpen && (
        <VisualSettingsModal onClose={() => setIsVisualSettingsOpen(false)} />
      )}

      {isReadingSpeedOpen && (
        <ReadingSpeedOverlay
          initialSpeed={readingSpeed}
          onSpeedChange={(newSpeed) => {
            setReadingSpeed(newSpeed)
            chrome.storage.local.set({ sensa_visual_reading_speed: newSpeed })
          }}
          onClose={() => setIsReadingSpeedOpen(false)}
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
            onTogglePlay={togglePlayPause}   // <-- NEW PROP
            onToggleVoiceCommand={() => setIsVoiceCommandActive(prev => !prev)}
            onNext={next}                    // <-- NEW PROP
            onPrev={prev}                    // <-- NEW PROP
            onRestart={restart}
            onMinimizeToggle={() => setIsMinimized(!isMinimized)} 
            onOpenReadingSpeed={() => setIsReadingSpeedOpen(true)}
            onOpenSettings={() => setIsVisualSettingsOpen(true)} 
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
            onOpenCaptionLanguage={() => setIsCaptionLanguageOpen(true)}
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
              setIsTextSizeOpen(false)
              setIsCaptionTransparencyOpen(false)
              setIsCaptionsActive(false)
            }} 
          />
        )}
      </div>
    </>
  )
}