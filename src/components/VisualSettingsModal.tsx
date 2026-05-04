import React, { useState, useEffect, useRef } from "react"
import ColorPickerPopup from "./ColorPickerPopup"
import { useUIHoverAudio } from "../hooks/useUIHoverAudio"

interface VisualSettingsModalProps {
  onClose: () => void
}

export default function VisualSettingsModal({ onClose }: VisualSettingsModalProps) {
  const { playHoverAudio, cancelHoverAudio } = useUIHoverAudio()
  
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [highlightColor, setHighlightColor] = useState("#FFFE00")
  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([])
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([])
  const [selectedInputDeviceId, setSelectedInputDeviceId] = useState("default")
  const [selectedOutputDeviceId, setSelectedOutputDeviceId] = useState("default")
  const [isAutoscrollEnabled, setIsAutoscrollEnabled] = useState(true)
  
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>("")
  
  // 🚨 NEW: State to control our custom Voice Dropdown
  const [isVoiceDropdownOpen, setIsVoiceDropdownOpen] = useState(false)

  const getHoverHandlers = (label: string) => ({
    onMouseEnter: () => playHoverAudio(label),
    onMouseLeave: cancelHoverAudio
  })

  // Draggable/persisted position for modal
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [initialOffsetLoaded, setInitialOffsetLoaded] = useState(false)
  const offsetRef = useRef(offset)
  const draggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const offsetStartRef = useRef({ x: 0, y: 0 })

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
      "sensa_visual_voice_uri" 
    ], (res) => {
      if (typeof res.sensa_visual_highlight_color === "string") setHighlightColor(res.sensa_visual_highlight_color)
      if (typeof res.sensa_visual_input_device_id === "string") setSelectedInputDeviceId(res.sensa_visual_input_device_id)
      if (typeof res.sensa_visual_output_device_id === "string") setSelectedOutputDeviceId(res.sensa_visual_output_device_id)
      if (typeof res.sensa_visual_autoscroll_enabled === "boolean") setIsAutoscrollEnabled(res.sensa_visual_autoscroll_enabled)
      if (typeof res.sensa_visual_voice_uri === "string") setSelectedVoiceURI(res.sensa_visual_voice_uri)
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

  const handleVoiceChange = (voiceURI: string) => {
    setSelectedVoiceURI(voiceURI)
    const selected = voices.find((voice) => voice.voiceURI === voiceURI)
    chrome.storage.local.set({
      sensa_visual_voice_uri: voiceURI,
      sensa_visual_voice_name: selected?.name || ""
    })
  }

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose()
  }

  // 🚨 NEW: The hover-preview engine!
  const previewVoice = (voice: SpeechSynthesisVoice) => {
    // 1. Instantly kill any currently playing preview so they don't overlap
    window.speechSynthesis.cancel()
    
    // 2. Create a new utterance using the voice's own name
    const utterance = new SpeechSynthesisUtterance(voice.name)
    utterance.voice = voice
    
    // 3. Speak it!
    window.speechSynthesis.speak(utterance)
  }

  return (
    <div onClick={handleBackdropClick} className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/40 backdrop-blur-sm font-sans">
      
      <div
        className="relative w-[440px] bg-white rounded-[40px] border-[3px] border-[#0A44FF] p-8 shadow-2xl text-black"
        onMouseDown={onHeaderMouseDown}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          cursor: "grab",
          visibility: initialOffsetLoaded ? "visible" : "hidden"
        }}
      >
        <h2 className="text-[28px] font-bold mb-8 tracking-tight">Settings</h2>
        
        <button 
          onClick={onClose}
          className="absolute top-6 right-6 text-black hover:text-gray-500 transition-colors focus:outline-none"
          {...getHoverHandlers("Close")}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <div className="flex flex-col gap-5">
          
          <div className="flex items-center justify-between">
            <span className="text-[17px] font-medium">Voice Guide</span>
            <div className="w-[190px] flex justify-start pl-1">
              <label className="relative inline-flex items-center cursor-pointer" {...getHoverHandlers("Voice Guide")}>
                <input type="checkbox" className="sr-only peer" defaultChecked />
                <div className="w-12 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[26px] peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#3B82F6]"></div>
              </label>
            </div>
          </div>

          {/* 🚨 THE UPGRADED CUSTOM VOICE DROPDOWN */}
          <div className="flex items-center justify-between relative z-50">
            <span className="text-[17px] font-medium">Voice Selection</span>
            <div className="relative w-[190px]">
              
              {/* The "Select" Button */}
              <button 
                type="button"
                onClick={() => setIsVoiceDropdownOpen((prev) => !prev)}
                className="w-full text-left border border-gray-300 text-gray-700 py-2 pl-3 pr-8 rounded-xl text-sm focus:outline-none focus:border-[#3B82F6] cursor-pointer bg-white"
                {...getHoverHandlers("Voice Selection")}
              >
                <span className="block truncate">
                  {voices.find(v => v.voiceURI === selectedVoiceURI)?.name || "Loading voices..."}
                </span>
                <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-500">
                  <svg className="fill-current h-4 w-4" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
              </button>

              {/* The Floating Custom List */}
              {isVoiceDropdownOpen && (
                <>
                  {/* Invisible backdrop to close the dropdown when clicking outside */}
                  <div 
                    className="fixed inset-0 z-40" 
                    onClick={(e) => {
                      e.stopPropagation()
                      setIsVoiceDropdownOpen(false)
                      window.speechSynthesis.cancel() // Stop talking when menu closes
                    }} 
                  />
                  
                  <ul className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-gray-300 rounded-xl shadow-xl py-1 text-sm custom-scrollbar">
                    {voices.map((voice) => (
                      <li
                        key={voice.voiceURI}
                        onMouseEnter={() => previewVoice(voice)} // 🚨 Triggers the speech preview!
                        onClick={() => {
                          handleVoiceChange(voice.voiceURI)
                          setIsVoiceDropdownOpen(false)
                          window.speechSynthesis.cancel() // Stop previewing once selected
                        }}
                        className={`px-3 py-2 cursor-pointer truncate transition-colors ${
                          selectedVoiceURI === voice.voiceURI 
                            ? "bg-blue-100 text-blue-700 font-medium" 
                            : "text-gray-700 hover:bg-blue-50 hover:text-blue-600"
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

          <div className="flex items-center justify-between">
            <span className="text-[17px] font-medium">Wake Word</span>
            <div className="relative w-[190px]">
              <input 
                type="text" 
                defaultValue="Sensa" 
                className="w-full border border-gray-300 text-gray-700 py-2 pl-3 pr-8 rounded-xl text-sm focus:outline-none focus:border-[#3B82F6]"
                {...getHoverHandlers("Wake Word")}
              />
              <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-400">
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="22" />
                </svg>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between relative">
            <span className="text-[17px] font-medium">Highlight color</span>
            <div className="w-[190px] flex justify-start pl-1">
              <div className="relative flex items-center justify-center">
                <button 
                  type="button"
                  onMouseDown={(event) => event.stopPropagation()}
                  onMouseEnter={() => playHoverAudio("Highlight color")}
                  onMouseLeave={cancelHoverAudio}
                  onClick={(event) => {
                    event.stopPropagation()
                    setShowColorPicker((prev) => !prev)
                  }}
                  className="w-6 h-6 border border-black rounded-full cursor-pointer shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500"
                  style={{ backgroundColor: highlightColor }}
                  aria-label="Pick highlight color"
                />
                {showColorPicker && (
                  <ColorPickerPopup
                    isDark={false}
                    initialColor={highlightColor}
                    onColorChange={handleHighlightChange}
                    onClose={() => setShowColorPicker(false)}
                  />
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[17px] font-medium">Autoscroll reading</span>
            <div className="w-[190px] flex justify-start pl-1">
              <label className="relative inline-flex items-center cursor-pointer" {...getHoverHandlers("Autoscroll reading")}>
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={isAutoscrollEnabled}
                  onChange={(event) => handleAutoscrollToggle(event.target.checked)}
                />
                <div className="w-12 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-[26px] peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#3B82F6]"></div>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[17px] font-medium">Input Device</span>
            <div className="relative w-[190px]">
              <select
                value={selectedInputDeviceId}
                onChange={(event) => handleInputDeviceChange(event.target.value)}
                className="appearance-none w-full border border-gray-300 text-gray-700 py-2 px-3 rounded-xl text-xs focus:outline-none focus:border-[#3B82F6] cursor-pointer bg-white"
                {...getHoverHandlers("Input Device")}>
                <option value="default">Default - Microphone</option>
                {inputDevices.map((device, index) => (
                  <option key={device.deviceId || `input-${index}`} value={device.deviceId}>
                    {device.label || `Microphone ${index + 1}`}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-500">
                <svg className="fill-current h-4 w-4" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-[17px] font-medium">Output Device</span>
            <div className="relative w-[190px]">
              <select
                value={selectedOutputDeviceId}
                onChange={(event) => handleOutputDeviceChange(event.target.value)}
                className="appearance-none w-full border border-gray-300 text-gray-700 py-2 px-3 rounded-xl text-xs focus:outline-none focus:border-[#3B82F6] cursor-pointer bg-white"
                {...getHoverHandlers("Output Device")}>
                <option value="default">Default - Speaker</option>
                {outputDevices.map((device, index) => (
                  <option key={device.deviceId || `output-${index}`} value={device.deviceId}>
                    {device.label || `Speaker ${index + 1}`}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-gray-500">
                <svg className="fill-current h-4 w-4" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
              </div>
            </div>
          </div>

        </div>

        <div className="mt-10 flex justify-center">
          <button className="bg-[#4338CA] hover:bg-[#3730A3] text-white font-bold py-3 px-10 rounded-full transition-colors shadow-md text-sm" {...getHoverHandlers("Reset to default")}>
            Reset to default
          </button>
        </div>

      </div>
    </div>
  )
}