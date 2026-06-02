import React, { useEffect, useRef, useState } from "react"
import { useUIHoverAudio } from "../hooks/useUIHoverAudio"

interface ReadingSpeedOverlayProps {
  onClose: () => void
  initialSpeed?: number
  onSpeedChange?: (speed: number) => void
  isDark?: boolean // 🚨 Added isDark to match the Dock's theme
}

export default function ReadingSpeedOverlay({ onClose, initialSpeed = 1, onSpeedChange, isDark = false }: ReadingSpeedOverlayProps) {
  const [speed, setSpeed] = useState(initialSpeed)
  const { playHoverAudio, playClickAudio, cancelHoverAudio } = useUIHoverAudio()
  const onCloseRef = useRef(onClose)
  const onSpeedChangeRef = useRef(onSpeedChange)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const [isSoundEffectsEnabled, setIsSoundEffectsEnabled] = useState(true)
  const isSoundEffectsEnabledRef = useRef(true)
  
  // Dragging State
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [initialOffsetLoaded, setInitialOffsetLoaded] = useState(false)
  const [isMounted, setIsMounted] = useState(false) // For mount animations
  
  const offsetRef = useRef(offset)
  const draggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const offsetStartRef = useRef({ x: 0, y: 0 })
  const speedRef = useRef(speed)
  const lastExecutedRef = useRef<Record<string, number>>({})
  const lastTranscriptRef = useRef<Record<string, string>>({})

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

  useEffect(() => {
    // Trigger entrance animation
    requestAnimationFrame(() => setIsMounted(true))
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
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    onSpeedChangeRef.current = onSpeedChange
  }, [onSpeedChange])

  useEffect(() => {
    speedRef.current = speed
  }, [speed])

  useEffect(() => {
    offsetRef.current = offset
  }, [offset])

  useEffect(() => {
    chrome.storage.local.get(["sensa_reading_speed_overlay_offset"], (result) => {
      if (result.sensa_reading_speed_overlay_offset) {
        setOffset(result.sensa_reading_speed_overlay_offset)
      }
      setInitialOffsetLoaded(true)
    })
  }, [])

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!draggingRef.current) return
      const dx = event.clientX - dragStartRef.current.x
      const dy = event.clientY - dragStartRef.current.y
      setOffset({ x: offsetStartRef.current.x + dx, y: offsetStartRef.current.y + dy })
    }

    const onUp = () => {
      if (!draggingRef.current) return
      draggingRef.current = false
      chrome.storage.local.set({ sensa_reading_speed_overlay_offset: offsetRef.current })
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)

    return () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
  }, [])

  const onHeaderMouseDown = (event: React.MouseEvent) => {
    const target = event.target as HTMLElement
    if (target.closest("button, input, textarea, select, label")) return
    event.preventDefault()
    draggingRef.current = true
    dragStartRef.current = { x: event.clientX, y: event.clientY }
    offsetStartRef.current = { x: offsetRef.current.x, y: offsetRef.current.y }
  }

  const getHoverHandlers = (label: string) => ({
    onMouseEnter: () => {
      playHoverSfx()
      playHoverAudio(label)
    },
    onMouseLeave: cancelHoverAudio,
    onFocus: () => {
      playHoverSfx()
      playHoverAudio(label)
    },
    onBlur: cancelHoverAudio
  })

  const speedStops = [1, 1.25, 1.5, 1.75, 2]

  const handleDecrease = () => {
    setSpeed((prev) => {
      const next = Math.max(0.5, +(prev - 0.25).toFixed(2))
      onSpeedChange?.(next)
      playClickSfx()
      playClickAudio(`${next.toFixed(2).replace(/\.00$/, '')}x`)
      return next
    })
  }

  const handleIncrease = () => {
    setSpeed((prev) => {
      const next = Math.min(3, +(prev + 0.25).toFixed(2))
      onSpeedChange?.(next)
      playClickSfx()
      playClickAudio(`${next.toFixed(2).replace(/\.00$/, '')}x`)
      return next
    })
  }

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSpeed(parseFloat(e.target.value))
  }

  const formattedSpeed = speed.toFixed(2).replace(/\.00$/, '')

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      setIsMounted(false)
      playClickSfx()
      playClickAudio("Closing speed settings")
      setTimeout(onClose, 300) // Wait for exit animation
    }
  }

  const commitSpeed = () => {
    onSpeedChange?.(speed)
  }

  useEffect(() => {
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionCtor) return

    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = "en-US"

    let isComponentMounted = true
    let restartTimer: number | null = null

    const normalizeTranscript = (text: string) =>
      ` ${text.toLowerCase().replace(/[^a-z0-9\s.]/gi, "").replace(/\s+/g, " ").trim()} `

    const checkCommand = (id: string, patterns: string[], transcript: string, cooldownMs = 400) => {
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

    const applySpeed = (next: number, announce = true) => {
      const clamped = Math.max(0.5, Math.min(3, +next.toFixed(2)))
      setSpeed(clamped)
      onSpeedChangeRef.current?.(clamped)
      if (announce) {
        playClickSfx()
        playClickAudio(`${clamped.toFixed(2).replace(/\.00$/, "")}x`)
      }
    }

    const closeOverlay = () => {
      setIsMounted(false)
      setTimeout(() => onCloseRef.current(), 300)
    }

    const speedTargets = [
      { value: 0.5, patterns: ["0.5", "half", "half speed", "point five"] },
      { value: 1, patterns: ["1", "1x", "one", "normal", "normal speed", "one x"] },
      { value: 1.25, patterns: ["1.25", "one point two five", "one and a quarter"] },
      { value: 1.5, patterns: ["1.5", "one point five", "one and a half"] },
      { value: 1.75, patterns: ["1.75", "one point seven five"] },
      { value: 2, patterns: ["2", "2x", "two", "double", "two times"] },
      { value: 2.25, patterns: ["2.25", "two point two five"] },
      { value: 2.5, patterns: ["2.5", "two point five", "two and a half"] },
      { value: 2.75, patterns: ["2.75", "two point seven five"] },
      { value: 3, patterns: ["3", "3x", "three", "max", "maximum"] },
    ]

    recognition.onresult = (event: any) => {
      const results = Array.from(event.results ?? [])
      if (!results.length) return

      const transcripts = results.map((result: any) => result?.[0]?.transcript || "").filter(Boolean)
      if (!transcripts.length) return

      const transcript = transcripts.slice(-2).join(" ")
      const normalizedTranscript = normalizeTranscript(transcript)

      if (checkCommand("speed-close", ["close", "cancel", "back", "exit", "close overlay", "close speed"], transcript, 350)) {
        closeOverlay()
        return
      }

      if (checkCommand("speed-apply", ["apply", "save", "done", "confirm", "okay", "ok"], transcript, 500)) {
        onSpeedChangeRef.current?.(speedRef.current)
        closeOverlay()
        return
      }

      if (checkCommand("speed-up", ["increase", "faster", "faster speed", "up", "speed up"], transcript, 250)) {
        applySpeed(speedRef.current + 0.25)
        return
      }

      if (checkCommand("speed-down", ["decrease", "slower", "lower", "down", "slow down"], transcript, 250)) {
        applySpeed(speedRef.current - 0.25)
        return
      }

      const matchedTarget = speedTargets.find((target) =>
        target.patterns.some((pattern) => normalizedTranscript.includes(` ${pattern} `))
      )

      if (matchedTarget && checkCommand(`speed-set-${matchedTarget.value}`, matchedTarget.patterns, transcript, 500)) {
        applySpeed(matchedTarget.value)
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
  }, [])

  const modalBg = isDark ? "bg-[#141416]/96 backdrop-blur-3xl border-white/10" : "bg-white/95 backdrop-blur-3xl border-white/40"
  const textColor = isDark ? "text-gray-100" : "text-gray-900"
  const secondaryText = isDark ? "text-gray-400" : "text-gray-500"
  const inputBorder = isDark ? "border-white/10" : "border-black/5"
  const inputBg = isDark ? "bg-[#2C2C2E]/60 hover:bg-[#2C2C2E]" : "bg-white/60 hover:bg-white"
  const sliderUnfilled = isDark ? "#2F3136" : "#E5E7EB"
  const quickChipClass = isDark ? "bg-white/10 text-gray-200 hover:bg-white/20" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
  const closeButtonClass = isDark
    ? "bg-transparent hover:bg-white/10 text-gray-400 hover:text-gray-100 hover:shadow-[0_8px_20px_-12px_rgba(255,255,255,0.35)]"
    : "bg-transparent hover:bg-black/5 text-gray-400 hover:text-gray-900 hover:shadow-[0_10px_20px_-12px_rgba(15,23,42,0.28)]"

  return (
    <div 
      onClick={handleBackdropClick} 
      className={`fixed inset-0 z-[999999] flex items-center justify-center bg-black/30 backdrop-blur-sm font-sans transition-opacity duration-300 ${isMounted ? 'opacity-100' : 'opacity-0'}`}
      aria-modal="true"
      role="dialog"
    >
      <div className="relative">
        <div
          className={`relative w-[460px] ${modalBg} rounded-[32px] border p-8 text-center shadow-[0_32px_64px_-12px_rgba(0,0,0,0.3),_0_0_2px_rgba(255,255,255,0.2)_inset] transition-all duration-400 ease-[cubic-bezier(0.16,1,0.3,1)] ${isMounted ? 'scale-100 translate-y-0' : 'scale-[0.95] translate-y-4'}`}
          onMouseDown={onHeaderMouseDown}
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${isMounted ? 1 : 0.95})`,
            cursor: draggingRef.current ? "grabbing" : "grab",
            visibility: initialOffsetLoaded ? "visible" : "hidden"
          }}
        >
          <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 rounded-full bg-gray-400/30 pointer-events-none" />

          <div className="flex items-center justify-between mb-6 mt-2">
            <h2 className="text-[26px] font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-[#0A44FF] to-[#0099FF]">
              Reading Speed
            </h2>

            <button 
              onClick={() => {
                setIsMounted(false)
                playClickSfx()
                playClickAudio("Closing speed settings")
                setTimeout(onClose, 300)
              }}
              className={`${closeButtonClass} transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_10px_22px_-16px_rgba(15,23,42,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A44FF]/50 rounded-full p-2`}
              aria-label="Close"
              {...getHoverHandlers("Close")}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className={`mb-6 rounded-2xl border ${inputBorder} ${isDark ? 'bg-white/[0.03]' : 'bg-black/[0.02]'} px-6 py-5`}>
            <div className={`text-[12px] uppercase tracking-[0.18em] font-semibold ${secondaryText}`}>Current speed</div>
            <span className={`block mt-2 text-[64px] font-black tracking-tighter leading-none ${textColor}`}>
              {formattedSpeed}x
            </span>
          </div>

          <div className={`rounded-2xl border ${inputBorder} ${isDark ? 'bg-white/[0.03]' : 'bg-black/[0.02]'} p-5`}>
            <div className="flex items-center gap-4 mb-6">
          {/* Minus Button */}
          <button 
            onClick={handleDecrease}
            className="w-[52px] h-[52px] flex-shrink-0 flex items-center justify-center bg-gradient-to-r from-[#0A44FF] to-[#0099FF] hover:brightness-105 hover:-translate-y-[1px] hover:shadow-[0_16px_24px_-14px_rgba(10,68,255,0.7)] text-white rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0A44FF]/50 shadow-lg"
            aria-label="Decrease speed"
            {...getHoverHandlers("Decrease speed")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>

          {/* 🚨 Chunky High-Contrast Slider */}
          <div className="flex-1 relative flex items-center">
            <input 
              type="range" 
              min="0.5" 
              max="3" 
              step="0.05"
              value={speed}
              onChange={(e) => {
                handleSliderChange(e)
                onSpeedChange?.(parseFloat(e.target.value))
              }}
              onMouseUp={() => {
                onSpeedChange?.(speed)
                playClickSfx()
                playClickAudio(`${speed.toFixed(2).replace(/\.00$/, '')}x`)
              }}
              onTouchEnd={() => {
                onSpeedChange?.(speed)
                playClickSfx()
                playClickAudio(`${speed.toFixed(2).replace(/\.00$/, '')}x`)
              }}
              onKeyUp={(e: React.KeyboardEvent<HTMLInputElement>) => {
                const k = (e as any).key as string
                const keysToAnnounce = ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']
                if (keysToAnnounce.includes(k)) {
                  onSpeedChange?.(speed)
                  playClickAudio(`${speed.toFixed(2).replace(/\.00$/, '')}x`)
                }
              }}
              aria-label="Reading Speed"
              className="reading-speed-slider w-full h-[14px] rounded-full appearance-none cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0A44FF]/50"
              onMouseEnter={() => playHoverAudio("Reading Speed Slider")}
              onMouseLeave={cancelHoverAudio}
              onPointerEnter={() => playHoverSfx()}
              style={{
                background: `linear-gradient(to right, #0A44FF 0%, #0A44FF ${((speed - 0.5) / (3 - 0.5)) * 100}%, ${sliderUnfilled} ${((speed - 0.5) / (3 - 0.5)) * 100}%, ${sliderUnfilled} 100%)`
              }}
            />
            <style dangerouslySetInnerHTML={{ __html: `
              .reading-speed-slider::-webkit-slider-thumb {
                appearance: none;
                width: 28px;
                height: 28px;
                background: #FFFFFF;
                border: 3px solid #0A44FF;
                border-radius: 50%;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                transition: transform 0.1s;
              }
              .reading-speed-slider::-webkit-slider-thumb:hover {
                transform: scale(1.08);
              }
              .reading-speed-slider::-moz-range-thumb {
                width: 28px;
                height: 28px;
                background: #FFFFFF;
                border: 3px solid #0A44FF;
                border-radius: 50%;
                cursor: pointer;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                transition: transform 0.1s;
              }
              .reading-speed-slider::-moz-range-thumb:hover {
                transform: scale(1.08);
              }
            `}} />
          </div>

          {/* Plus Button */}
          <button 
            onClick={handleIncrease}
            className="w-[52px] h-[52px] flex-shrink-0 flex items-center justify-center bg-gradient-to-r from-[#0A44FF] to-[#0099FF] hover:brightness-105 hover:-translate-y-[1px] hover:shadow-[0_16px_24px_-14px_rgba(10,68,255,0.7)] text-white rounded-full transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0A44FF]/50 shadow-lg"
            aria-label="Increase speed"
            {...getHoverHandlers("Increase speed")}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
            </div>

            <div className="flex justify-between gap-2.5">
          {speedStops.map((stop) => (
            <button
              key={stop}
              onClick={() => {
                setSpeed(stop)
                onSpeedChange?.(stop)
                playClickSfx()
                playClickAudio(`${stop}x`)
              }}
              aria-pressed={speed === stop}
              {...getHoverHandlers(`${stop}x`) }
              className={`flex-1 h-[42px] overflow-hidden bg-clip-padding rounded-full text-[14px] font-semibold transition-all duration-200 border border-transparent focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0A44FF]/50 ${
                speed === stop 
                  ? "bg-gradient-to-r from-[#0A44FF] to-[#0099FF] text-white shadow-lg border-[#4FA5FF]/40" 
                  : `${quickChipClass} hover:border-[#0A44FF]/20 hover:-translate-y-[1px] hover:shadow-[0_10px_18px_-14px_rgba(10,68,255,0.35)]`
              }`}
            >
              {stop}x
            </button>
          ))}
            </div>
          </div>

          <div className="mt-8 flex justify-end gap-3">
          <button
            onClick={() => {
              setIsMounted(false)
              playClickSfx()
              playClickAudio("Cancel")
              setTimeout(onClose, 300)
            }}
            className={`h-11 px-6 rounded-xl border ${inputBorder} ${inputBg} ${textColor} text-[14px] font-semibold transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_10px_20px_-14px_rgba(15,23,42,0.35)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A44FF]/40`}
            {...getHoverHandlers("Cancel")}
          >
            Cancel
          </button>
          <button
            onClick={() => {
              commitSpeed()
              playClickSfx()
              playClickAudio(`Speed set to ${formattedSpeed}x`)
              setIsMounted(false)
              setTimeout(onClose, 300)
            }}
            className="h-11 px-7 rounded-xl bg-gradient-to-r from-[#0A44FF] to-[#0099FF] text-[14px] font-semibold text-white hover:brightness-105 hover:-translate-y-[1px] hover:shadow-[0_16px_26px_-14px_rgba(10,68,255,0.7)] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A44FF]/50 shadow-lg"
            {...getHoverHandlers("Apply")}
          >
            Apply
          </button>
          </div>
        </div>
      </div>
    </div>
  )
}