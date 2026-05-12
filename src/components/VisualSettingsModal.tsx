import React, { useState, useEffect, useRef } from "react"
import ColorPickerPopup from "./ColorPickerPopup"
import { useUIHoverAudio } from "../hooks/useUIHoverAudio"

const DEFAULT_HIGHLIGHT_COLOR = "#FFFE00"
const DEFAULT_INPUT_DEVICE_ID = "default"
const DEFAULT_OUTPUT_DEVICE_ID = "default"

interface VisualSettingsModalProps {
  onClose: () => void
  isDark?: boolean // 🚨 Added isDark for theming consistency
}

export default function VisualSettingsModal({ onClose, isDark = false }: VisualSettingsModalProps) {
  const { playHoverAudio, cancelHoverAudio } = useUIHoverAudio()
  
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
  const [isVoiceDropdownOpen, setIsVoiceDropdownOpen] = useState(false)

  // Mount animation state
  const [isMounted, setIsMounted] = useState(false)

  const getHoverHandlers = (label: string) => ({
    onMouseEnter: () => playHoverAudio(label),
    onMouseLeave: cancelHoverAudio,
    onFocus: () => playHoverAudio(label),
    onBlur: cancelHoverAudio
  })

  // Draggable offset state
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
      "sensa_visual_voice_uri",
      "sensa_visual_highlight_mouse_screen_reader"
    ], (res) => {
      if (typeof res.sensa_visual_highlight_color === "string") setHighlightColor(res.sensa_visual_highlight_color)
      if (typeof res.sensa_visual_input_device_id === "string") setSelectedInputDeviceId(res.sensa_visual_input_device_id)
      if (typeof res.sensa_visual_output_device_id === "string") setSelectedOutputDeviceId(res.sensa_visual_output_device_id)
      if (typeof res.sensa_visual_autoscroll_enabled === "boolean") setIsAutoscrollEnabled(res.sensa_visual_autoscroll_enabled)
      if (typeof res.sensa_visual_voice_uri === "string") setSelectedVoiceURI(res.sensa_visual_voice_uri)
      if (typeof res.sensa_visual_highlight_mouse_screen_reader === "boolean") setIsHighlightMouseScreenReaderEnabled(res.sensa_visual_highlight_mouse_screen_reader)
    })
  }, [])

  React.useEffect(() => {
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices()
      if (availableVoices.length > 0) {
        setVoices(availableVoices)
        setSelectedVoiceURI((prev) => {
          if (prev) return prev
          const defaultVoice = availableVoices.find(v => v.name.includes("Google US English")) || availableVoices[0]
          return defaultVoice?.voiceURI || ""
        })
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

  const handleHighlightChange = (color: string) => {
    setHighlightColor(color)
    chrome.storage.local.set({ sensa_visual_highlight_color: color })
  }

  const handleInputDeviceChange = (deviceId: string) => {
    setSelectedInputDeviceId(deviceId)
    chrome.storage.local.set({ sensa_visual_input_device_id: deviceId })
  }

  const handleOutputDeviceChange = (deviceId: string) => {
    setSelectedOutputDeviceId(deviceId)
    chrome.storage.local.set({ sensa_visual_output_device_id: deviceId })
  }

  const handleAutoscrollToggle = (enabled: boolean) => {
    setIsAutoscrollEnabled(enabled)
    chrome.storage.local.set({ sensa_visual_autoscroll_enabled: enabled })
  }

  const handleHighlightMouseScreenReaderToggle = (enabled: boolean) => {
    setIsHighlightMouseScreenReaderEnabled(enabled)
    chrome.storage.local.set({ sensa_visual_highlight_mouse_screen_reader: enabled })
  }

  const handleVoiceChange = (voiceURI: string) => {
    setSelectedVoiceURI(voiceURI)
    const selected = voices.find((voice) => voice.voiceURI === voiceURI)
    chrome.storage.local.set({
      sensa_visual_voice_uri: voiceURI,
      sensa_visual_voice_name: selected?.name || ""
    })
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

  // 🚨 High Contrast Theme Variables
  const modalBg = isDark ? "bg-[#1C1C1E]" : "bg-white"
  const textColor = isDark ? "text-white" : "text-black"
  const labelColor = isDark ? "text-gray-200" : "text-gray-800"
  const inputBg = isDark ? "bg-[#2C2C2E]" : "bg-gray-50"
  const inputBorder = isDark ? "border-gray-600" : "border-gray-300"
  const secondaryText = isDark ? "text-gray-400" : "text-gray-500"

  return (
    <div 
      onClick={handleBackdropClick} 
      className={`fixed inset-0 z-[999999] flex items-center justify-center bg-black/60 backdrop-blur-md font-sans transition-opacity duration-300 ${isMounted ? 'opacity-100' : 'opacity-0'}`}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`relative w-[480px] ${modalBg} rounded-[32px] border-4 border-[#0A44FF] p-8 shadow-[0_24px_60px_rgba(0,0,0,0.5)] transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${isMounted ? 'scale-100 translate-y-0' : 'scale-90 translate-y-8'}`}
        onMouseDown={onHeaderMouseDown}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${isMounted ? 1 : 0.95})`,
          cursor: draggingRef.current ? "grabbing" : "grab",
          visibility: initialOffsetLoaded ? "visible" : "hidden"
        }}
      >
        {/* Visual Drag Handle */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-16 h-1.5 rounded-full bg-gray-400/40 pointer-events-none" />

        <h2 className={`text-[28px] font-extrabold mb-8 tracking-tight mt-2 ${textColor}`}>Settings</h2>
        
        <button 
          onClick={() => {
            setIsMounted(false)
            setTimeout(onClose, 300)
          }}
          className={`absolute top-6 right-6 ${secondaryText} hover:${textColor} transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0A44FF]/50 rounded-full p-1`}
          aria-label="Close settings"
          {...getHoverHandlers("Close")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="flex flex-col gap-6">
          
          {/* 🚨 WCAG: 48px height toggles with high contrast text */}
          <div className="flex items-center justify-between min-h-[48px]">
            <span className={`text-[17px] font-bold tracking-wide ${labelColor}`}>Voice Guide</span>
            <div className="w-[200px] flex justify-start">
              <label className="relative inline-flex items-center cursor-pointer" {...getHoverHandlers("Voice Guide")}>
                <input type="checkbox" className="sr-only peer" defaultChecked aria-label="Toggle Voice Guide" />
                <div className="w-14 h-8 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#0A44FF]/50 rounded-full peer peer-checked:after:translate-x-6 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-[#0A44FF] shadow-inner"></div>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between relative z-50 min-h-[48px]">
            <span className={`text-[17px] font-bold tracking-wide ${labelColor}`}>Voice Selection</span>
            <div className="relative w-[200px]">
              <button 
                type="button"
                onClick={() => setIsVoiceDropdownOpen((prev) => !prev)}
                className={`w-full text-left border-2 ${inputBorder} ${textColor} ${inputBg} h-[48px] pl-4 pr-10 rounded-xl text-[15px] font-medium focus:outline-none focus:border-[#0A44FF] focus:ring-4 focus:ring-[#0A44FF]/30 cursor-pointer shadow-sm transition-all`}
                aria-haspopup="listbox"
                aria-expanded={isVoiceDropdownOpen}
                {...getHoverHandlers("Voice Selection")}
              >
                <span className="block truncate">
                  {voices.find(v => v.voiceURI === selectedVoiceURI)?.name || "Loading voices..."}
                </span>
                <div className={`pointer-events-none absolute inset-y-0 right-4 flex items-center ${secondaryText}`}>
                  <svg className={`fill-current h-5 w-5 transition-transform ${isVoiceDropdownOpen ? "rotate-180" : ""}`} viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
              </button>

              {isVoiceDropdownOpen && (
                <>
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={(e) => {
                      e.stopPropagation()
                      setIsVoiceDropdownOpen(false)
                      window.speechSynthesis.cancel()
                    }} 
                  />
                  <ul 
                    className={`absolute z-50 mt-2 w-full max-h-60 overflow-y-auto ${modalBg} border-2 border-[#0A44FF] rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.3)] py-2 text-[15px] custom-scrollbar`}
                    role="listbox"
                  >
                    {voices.map((voice) => (
                      <li
                        key={voice.voiceURI}
                        role="option"
                        aria-selected={selectedVoiceURI === voice.voiceURI}
                        onMouseEnter={() => previewVoice(voice)}
                        onClick={() => {
                          handleVoiceChange(voice.voiceURI)
                          setIsVoiceDropdownOpen(false)
                          window.speechSynthesis.cancel()
                        }}
                        className={`px-4 py-3 cursor-pointer truncate transition-colors font-medium border-b border-gray-100 last:border-0 ${
                          selectedVoiceURI === voice.voiceURI 
                            ? "bg-[#0A44FF]/10 text-[#0A44FF] font-bold" 
                            : isDark 
                              ? "text-gray-200 hover:bg-white/10" 
                              : "text-gray-700 hover:bg-[#0A44FF]/5 hover:text-[#0A44FF]"
                        }`}
                      >
                        {voice.name}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between min-h-[48px]">
            <span className={`text-[17px] font-bold tracking-wide ${labelColor}`}>Wake Word</span>
            <div className="relative w-[200px]">
              <input 
                type="text" 
                defaultValue="Sensa" 
                aria-label="Wake Word"
                className={`w-full border-2 ${inputBorder} ${textColor} ${inputBg} h-[48px] pl-4 pr-10 rounded-xl text-[15px] font-medium focus:outline-none focus:border-[#0A44FF] focus:ring-4 focus:ring-[#0A44FF]/30 shadow-sm transition-all`}
                {...getHoverHandlers("Wake Word")}
              />
              <div className={`absolute inset-y-0 right-4 flex items-center pointer-events-none ${secondaryText}`}>
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between relative min-h-[48px]">
            <span className={`text-[17px] font-bold tracking-wide ${labelColor}`}>Highlight color</span>
            <div className="w-[200px] flex justify-start">
              <div className="relative flex items-center justify-center">
                <button 
                  type="button"
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    setShowColorPicker((prev) => !prev)
                  }}
                  className="w-[44px] h-[44px] border-4 border-gray-200 rounded-full cursor-pointer shadow-md focus:outline-none focus:ring-4 focus:ring-[#0A44FF]/50 transition-transform active:scale-90"
                  style={{ backgroundColor: highlightColor }}
                  aria-label="Pick highlight color"
                  {...getHoverHandlers("Highlight color")}
                />
                {showColorPicker && (
                  <ColorPickerPopup
                    isDark={isDark}
                    initialColor={highlightColor}
                    onColorChange={handleHighlightChange}
                    onClose={() => setShowColorPicker(false)}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between min-h-[48px]">
            <span className={`text-[17px] font-bold tracking-wide ${labelColor}`}>Autoscroll reading</span>
            <div className="w-[200px] flex justify-start">
              <label className="relative inline-flex items-center cursor-pointer" {...getHoverHandlers("Autoscroll reading")}>
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={isAutoscrollEnabled}
                  onChange={(event) => handleAutoscrollToggle(event.target.checked)}
                  aria-label="Toggle Autoscroll"
                />
                <div className="w-14 h-8 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#0A44FF]/50 rounded-full peer peer-checked:after:translate-x-6 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-[#0A44FF] shadow-inner"></div>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between min-h-[48px]">
            <span className={`text-[17px] font-bold tracking-wide ${labelColor}`}>Mouse Highlight Reader</span>
            <div className="w-[200px] flex justify-start">
              <label className="relative inline-flex items-center cursor-pointer" {...getHoverHandlers("Mouse Highlight Reader")}>
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={isHighlightMouseScreenReaderEnabled}
                  onChange={(event) => handleHighlightMouseScreenReaderToggle(event.target.checked)}
                  aria-label="Toggle Mouse Highlight Reader"
                />
                <div className={`w-14 h-8 rounded-full peer peer-checked:after:translate-x-6 peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all shadow-inner peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#0A44FF]/50 ${isDark ? 'peer-checked:bg-[#0A44FF] bg-gray-600' : 'peer-checked:bg-[#0A44FF] bg-gray-300'}`}></div>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between min-h-[48px]">
            <span className={`text-[17px] font-bold tracking-wide ${labelColor}`}>Input Device</span>
            <div className="relative w-[200px]">
              <select
                value={selectedInputDeviceId}
                onChange={(event) => handleInputDeviceChange(event.target.value)}
                aria-label="Input Device"
                className={`appearance-none w-full border-2 ${inputBorder} ${textColor} ${inputBg} h-[48px] pl-4 pr-10 rounded-xl text-[14px] font-medium focus:outline-none focus:border-[#0A44FF] focus:ring-4 focus:ring-[#0A44FF]/30 cursor-pointer shadow-sm transition-all`}
                {...getHoverHandlers("Input Device")}>
                <option value="default">Default - Microphone</option>
                {inputDevices.map((device, index) => (
                  <option key={device.deviceId || `input-${index}`} value={device.deviceId}>
                    {device.label || `Microphone ${index + 1}`}
                  </option>
                ))}
              </select>
              <div className={`pointer-events-none absolute inset-y-0 right-4 flex items-center ${secondaryText}`}>
                <svg className="fill-current h-5 w-5" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between min-h-[48px]">
            <span className={`text-[17px] font-bold tracking-wide ${labelColor}`}>Output Device</span>
            <div className="relative w-[200px]">
              <select
                value={selectedOutputDeviceId}
                onChange={(event) => handleOutputDeviceChange(event.target.value)}
                aria-label="Output Device"
                className={`appearance-none w-full border-2 ${inputBorder} ${textColor} ${inputBg} h-[48px] pl-4 pr-10 rounded-xl text-[14px] font-medium focus:outline-none focus:border-[#0A44FF] focus:ring-4 focus:ring-[#0A44FF]/30 cursor-pointer shadow-sm transition-all`}
                {...getHoverHandlers("Output Device")}>
                <option value="default">Default - Speaker</option>
                {outputDevices.map((device, index) => (
                  <option key={device.deviceId || `output-${index}`} value={device.deviceId}>
                    {device.label || `Speaker ${index + 1}`}
                  </option>
                ))}
              </select>
              <div className={`pointer-events-none absolute inset-y-0 right-4 flex items-center ${secondaryText}`}>
                <svg className="fill-current h-5 w-5" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
              </div>
            </div>
          </div>

        </div>

        <div className="mt-10 flex justify-center">
          <button 
            type="button"
            onClick={handleResetToDefault}
            className="bg-[#0A44FF] hover:bg-[#0836CC] text-white font-bold h-[48px] px-12 rounded-full transition-colors shadow-lg shadow-[#0A44FF]/30 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0A44FF]/50 text-[16px] tracking-wide" 
            {...getHoverHandlers("Reset to default")}
          >
            Reset to default
          </button>
        </div>

      </div>
    </div>
  )
}