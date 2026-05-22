import React, { useEffect, useRef, useState } from "react"
import { Tooltip } from "./Tooltip"
import { useUIHoverAudio } from "../hooks/useUIHoverAudio"

// ============================================================================
// 🎙️ THE GOD-TIER MIC ICON
// ============================================================================
const GodTierMicIcon = ({ isActive }: { isActive: boolean }) => {  
  const barsRef = useRef<(HTMLDivElement | null)[]>([])
  const currentHeights = useRef([4, 6, 8, 6, 4])
  const tickRef = useRef(0)

  useEffect(() => {
    let animationId: number
    let audioCtx: AudioContext | null = null
    let analyser: AnalyserNode | null = null
    let stream: MediaStream | null = null
    let dataArray: Uint8Array<ArrayBuffer> | null = null
    let smoothedEnergy = 0
    
    const silenceGate = 0.01 

    const colors = [
      "rgba(147, 197, 253, 1)", 
      "rgba(59, 130, 246, 1)",  
      "rgba(10, 68, 255, 1)",   
      "rgba(59, 130, 246, 1)",  
      "rgba(147, 197, 253, 1)", 
    ]

    const shapeMask = [0.35, 0.7, 1.0, 0.7, 0.35]
    const maxHeights = [10, 16, 24, 16, 10]
    const idleHeights = [4, 6, 8, 6, 4]

    const lerp = (start: number, end: number, amt: number) => (1 - amt) * start + amt * end

    const startMic = async () => {
      if (!isActive) return
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true }
        })
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
        analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.4 

        const source = audioCtx.createMediaStreamSource(stream)
        source.connect(analyser)
        dataArray = new Uint8Array(new ArrayBuffer(analyser.fftSize))
      } catch (err) {
        console.warn("Mic visualizer: mic access denied or unavailable.", err)
      }
    }

    const getLiveEnergy = () => {
      if (!isActive || !analyser || !dataArray) return 0
      analyser.getByteTimeDomainData(dataArray)

      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i] - 128) / 128
        sum += normalized * normalized
      }

      const rms = Math.sqrt(sum / dataArray.length)
      const boosted = Math.min(1, rms * 8.0) 
      smoothedEnergy = smoothedEnergy * 0.5 + boosted * 0.5 

      if (smoothedEnergy <= silenceGate) return 0
      return (smoothedEnergy - silenceGate) / (1 - silenceGate)
    }

    const draw = () => {
      tickRef.current += 0.07
      const tick = tickRef.current
      const liveEnergy = getLiveEnergy()

      barsRef.current.forEach((bar, i) => {
        if (!bar) return

        let targetHeight = idleHeights[i]

        if (isActive) {
          const voiceSpike = liveEnergy * shapeMask[i] * 30
          targetHeight = Math.min(maxHeights[i], idleHeights[i] + voiceSpike)
        } else {
          const breath = Math.sin(tick - i * 0.5) * 1.5
          targetHeight = idleHeights[i] + breath
        }

        const isRising = targetHeight > currentHeights.current[i]
        const amt = isActive ? (isRising ? 0.6 : 0.2) : 0.05

        currentHeights.current[i] = lerp(currentHeights.current[i], targetHeight, amt)

        const intensity = currentHeights.current[i] / maxHeights[i]
        const shadowRadius = isActive ? intensity * 8 : intensity * 2 
        const opacity = isActive ? Math.max(0.85, intensity + 0.3) : 0.6

        bar.style.height = `${Math.round(currentHeights.current[i])}px`
        bar.style.backgroundColor = colors[i]
        bar.style.boxShadow = `0 0 ${shadowRadius}px ${colors[i].replace('1)', `${opacity})`)}`
        bar.style.opacity = `${opacity}`
      })

      animationId = requestAnimationFrame(draw)
    }

    startMic()
    draw()

    return () => {
      if (animationId) cancelAnimationFrame(animationId)
      if (stream) stream.getTracks().forEach((track) => track.stop())
      if (audioCtx) audioCtx.close().catch(() => undefined)
    }
  }, [isActive])

  return (
    <div className="flex items-center justify-center gap-[3px] !w-[24px] !h-[24px] shrink-0" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((index) => (
        <div
          key={index}
          ref={(el) => (barsRef.current[index] = el)}
          className="!w-[4px] rounded-full"
          style={{ 
            height: "4px", 
            backgroundColor: "currentColor",
            willChange: "height, box-shadow, opacity, transform",
            transition: `all ${isActive ? 200 : 300}ms cubic-bezier(0.16,1,0.3,1)`
          }}
        />
      ))}
    </div>
  )
}

// ============================================================================
// MAIN VISUAL DOCK COMPONENT
// ============================================================================
interface VisualDockProps {
  isDark: boolean
  isMinimized: boolean
  readingSpeed: number
  isPlaying: boolean
  isPaused: boolean
  isVoiceCommandActive: boolean
  canRestart: boolean
  onTogglePlay: () => void
  onToggleVoiceCommand: () => void
  onNext: () => void
  onPrev: () => void
  onRestart: () => void
  onMinimizeToggle: () => void
  onOpenReadingSpeed: () => void
  onOpenSettings: () => void
  onClose: () => void
}

export default function VisualDock({
  isDark,
  isMinimized,
  readingSpeed,
  isPlaying,
  isPaused,
  isVoiceCommandActive,
  canRestart,
  onTogglePlay,
  onToggleVoiceCommand,
  onNext,
  onPrev,
  onRestart,
  onMinimizeToggle,
  onOpenReadingSpeed,
  onOpenSettings,
  onClose,
}: VisualDockProps) {
  const { playHoverAudio, playClickAudio, cancelHoverAudio } = useUIHoverAudio()
  const [isPlayOptimistic, setIsPlayOptimistic] = useState(isPlaying && !isPaused)
  
  const iconMotionClass = `transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform`
  
  // 🚨 THE FIX: All outer containers are now `rounded-full` to perfectly hug the circular buttons and eliminate pointed edges.
  const glassPanelClass = `rounded-full backdrop-blur-3xl border transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${isDark
    ? "bg-[#1C1C1E]/85 border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
    : "bg-white/90 border-black/10 shadow-[0_8px_32px_rgba(0,0,0,0.15)]"
  } ${isVoiceCommandActive ? "contrast-105 saturate-110 drop-shadow-[0_0_22px_rgba(10,68,255,0.14)]" : "contrast-100 saturate-100 drop-shadow-none"}`

  const middleGlassPanelClass = `rounded-full backdrop-blur-3xl bg-white/90 dark:bg-[#1C1C1E]/88 ring-1 ring-black/5 dark:ring-white/10 ${isVoiceCommandActive ? "contrast-105 saturate-110" : "contrast-100 saturate-100"}`
    
  const btnBaseClass = `relative group !w-[44px] !h-[44px] !min-w-[44px] !min-h-[44px] !p-0 !m-0 flex items-center justify-center rounded-full shrink-0 transform-gpu will-change-transform focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#0A44FF]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent box-border transition-all duration-200 hover:-translate-y-[1.5px] active:translate-y-0 active:scale-[0.97]`
  
  const btnHoverClass = isDark 
    ? "hover:bg-white/15 text-gray-200 hover:text-white hover:shadow-[0_14px_28px_rgba(0,0,0,0.28)]"
    : "hover:bg-black/10 text-gray-700 hover:text-black hover:shadow-[0_14px_28px_rgba(0,0,0,0.12)]"

  const settingsBtnHoverClass = isDark
    ? "hover:bg-white/15 text-gray-200 hover:text-white hover:shadow-none"
    : "hover:bg-black/10 text-gray-700 hover:text-black hover:shadow-none"
    
  const closeBtnClass = `${btnBaseClass} text-gray-500 dark:text-gray-400 transition-all duration-200 active:scale-90 hover:scale-105 ${isDark ? 'hover:bg-red-500/80 hover:text-white' : 'hover:bg-red-500/90 hover:text-white'}`
  const btnAccentClass = `transition-all duration-200 bg-[#0A44FF] text-white shadow-md shadow-[#0A44FF]/30 hover:bg-[#0836CC] hover:shadow-lg hover:shadow-[#0A44FF]/50`

  const readingSpeedLabel = `${readingSpeed.toFixed(2).replace(/\.00$/, "")}X`

  useEffect(() => {
    setIsPlayOptimistic(isPlaying && !isPaused)
  }, [isPlaying, isPaused])
  
  const getHoverHandlers = (label: string) => ({
    onMouseEnter: () => playHoverAudio(label),
    onMouseLeave: cancelHoverAudio,
    onFocus: () => playHoverAudio(label),
    onBlur: cancelHoverAudio
  })

  const handleTogglePlay = () => {
    setIsPlayOptimistic((current) => !current)
    onTogglePlay()
  }

  const handleToggleVoiceCommand = () => {
    onToggleVoiceCommand()
  }

  const callbacksRef = useRef({
    isVoiceCommandActive, isMinimized, isPlaying, isPaused, onToggleVoiceCommand, onTogglePlay, onNext, onPrev, onRestart,
    onMinimizeToggle, onOpenReadingSpeed, onOpenSettings, onClose, playClickAudio
  })
  const isVoiceCommandActiveRef = useRef(isVoiceCommandActive)
  const startRecognitionRef = useRef<(() => void) | null>(null)
  const stopRecognitionRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    callbacksRef.current = {
      isVoiceCommandActive, isMinimized, isPlaying, isPaused, onToggleVoiceCommand, onTogglePlay, onNext, onPrev, onRestart,
      onMinimizeToggle, onOpenReadingSpeed, onOpenSettings, onClose, playClickAudio
    }
    isVoiceCommandActiveRef.current = isVoiceCommandActive
  })

  useEffect(() => {
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionCtor) return

    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    let isComponentMounted = true
    let restartTimer: number | null = null
    let hasStartedOnce = false
    let isRecognitionStarted = false

    let currentResultIndex = -1
    const executedCommandsInCurrentBreath = new Set<string>()

    const scheduleRestart = () => {
      if (!isComponentMounted || !isVoiceCommandActiveRef.current) return
      if (restartTimer) window.clearTimeout(restartTimer)
      restartTimer = window.setTimeout(() => {
        startRecognition()
      }, 250)
    }

    const startRecognition = () => {
      if (!isComponentMounted || isRecognitionStarted) return
      try {
        recognition.start()
        isRecognitionStarted = true
        hasStartedOnce = true
      } catch (e) {
        if (!hasStartedOnce) {
          console.warn("VisualDock speech recognition start failed", e)
        }
      }
    }

    const stopRecognition = () => {
      if (!isComponentMounted || !isRecognitionStarted) return
      if (restartTimer) {
        window.clearTimeout(restartTimer)
        restartTimer = null
      }
      isRecognitionStarted = false
      try {
        recognition.stop()
      } catch (e) {
        // ignore
      }
    }
    startRecognitionRef.current = startRecognition
    stopRecognitionRef.current = stopRecognition

    recognition.onresult = (event: any) => {
      const { 
        isVoiceCommandActive, isMinimized, isPlaying, isPaused, onToggleVoiceCommand, onTogglePlay, onNext, onPrev,
        onRestart, onMinimizeToggle, onOpenReadingSpeed, onOpenSettings, onClose, playClickAudio 
      } = callbacksRef.current

      const latestIndex = event.results.length - 1
      if (latestIndex < 0) return

      if (latestIndex !== currentResultIndex) {
        currentResultIndex = latestIndex
        executedCommandsInCurrentBreath.clear()
      }

      const rawTranscript = event.results[latestIndex][0]?.transcript || ""
      if (!rawTranscript) return

      const paddedTranscript = ` ${rawTranscript.toLowerCase().replace(/[^a-z0-9\s]/gi, "")} `

      const checkAndLockCommand = (commandId: string, keywords: string[]) => {
        if (executedCommandsInCurrentBreath.has(commandId)) return false 
        const isMatched = keywords.some(word => paddedTranscript.includes(` ${word} `))
        if (isMatched) {
          executedCommandsInCurrentBreath.add(commandId) 
          return true
        }
        return false
      }

      if (!isVoiceCommandActive) {
        if (checkAndLockCommand('speak', ['speak', 'wake up', 'listen'])) {
          playClickAudio?.('Voice commands activated')
          try { onToggleVoiceCommand() } catch {}
        }
        return
      }

      if (checkAndLockCommand('stoplistening', ['stop listening', 'stop voice', 'sleep', 'stop microphone'])) {
        playClickAudio?.('Voice commands deactivated')
        try { onToggleVoiceCommand() } catch {}
      } 
      else if (checkAndLockCommand('play', ['play', 'resume', 'lay', 'blade'])) {
        if (!isPlaying || isPaused) { playClickAudio?.('Play'); onTogglePlay(); }
      } 
      else if (checkAndLockCommand('pause', ['pause', 'stop', 'halt', 'paws', 'pulse', 'pass'])) {
        if (isPlaying && !isPaused) { playClickAudio?.('Pause'); onTogglePlay(); }
      } 
      else if (checkAndLockCommand('next', ['next', 'skip', 'forward', 'necks', 'mix'])) {
        playClickAudio?.('Next'); onNext();
      } 
      else if (checkAndLockCommand('previous', ['previous', 'back', 'prev', 'go back'])) {
        playClickAudio?.('Previous'); onPrev();
      } 
      else if (checkAndLockCommand('restart', ['restart', 'start over', 're start'])) {
        playClickAudio?.('Restart'); onRestart();
      } 
      else if (checkAndLockCommand('speed', ['reading speed', 'speed', 'voice speed'])) {
        playClickAudio?.('Reading speed'); onOpenReadingSpeed();
      } 
      else if (checkAndLockCommand('settings', ['setting', 'settings', 'options'])) {
        playClickAudio?.('Settings'); onOpenSettings();
      } 
      else if (checkAndLockCommand('minimize', ['minimize', 'collapse', 'hide'])) {
        if (!isMinimized) { playClickAudio?.('Minimize'); onMinimizeToggle(); }
      } 
      else if (checkAndLockCommand('expand', ['expand', 'maximize', 'show'])) {
        if (isMinimized) { playClickAudio?.('Expand'); onMinimizeToggle(); }
      } 
      else if (checkAndLockCommand('close', ['close', 'exit', 'quit', 'clothes'])) {
        playClickAudio?.('Close'); onClose();
      } 
      else if (checkAndLockCommand('top', ['top', 'tap', 'stop', 'pop', 'to up', 'go up'])) {
        window.scrollTo({ top: 0, behavior: "smooth" })
      } 
      else if (checkAndLockCommand('bottom', ['bottom', 'button', 'down below'])) {
        window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })
      } 
      else if (checkAndLockCommand('scrollup', ['up', 'scroll up'])) {
        window.scrollBy({ top: -600, behavior: "smooth" })
      } 
      else if (checkAndLockCommand('scrolldown', ['down', 'scroll down'])) {
        window.scrollBy({ top: 600, behavior: "smooth" })
      }
    }

    recognition.onerror = (event: any) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") return
      scheduleRestart()
    }

    recognition.onend = () => {
      isRecognitionStarted = false
      scheduleRestart()
    }

    return () => {
      isComponentMounted = false
      if (restartTimer) window.clearTimeout(restartTimer)
      startRecognitionRef.current = null
      stopRecognitionRef.current = null
      try { recognition.stop() } catch (e) {}
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
    }
  }, []) 

  useEffect(() => {
    if (isVoiceCommandActive) {
      startRecognitionRef.current?.()
    } else {
      stopRecognitionRef.current?.()
    }
  }, [isVoiceCommandActive])

  return (
    <div 
      className="flex flex-col w-fit shrink-0 box-border relative z-50"
      role="toolbar" 
      aria-label="Reading and Voice Controls"
      data-sensa-visual-dock
    >
      
      {/* ========================================================= */}
      {/* 🔝 TOP SECTION: MICROPHONE & VISUALIZER */}
      {/* ========================================================= */}
      <div className={`flex flex-col items-center p-2 gap-2 shrink-0 relative z-30 ${glassPanelClass}`}>
        <button 
          type="button" 
          className={`${btnBaseClass} ${btnHoverClass} bg-transparent`} 
          tabIndex={-1}
          aria-label="Voice Command Visualizer"
          {...getHoverHandlers("Audio Visualizer")}
        >
          <Tooltip label="Audio Visualizer" isDark={isDark} />
          <GodTierMicIcon isActive={isVoiceCommandActive} />
        </button>

        <button
          type="button"
          onClick={() => {
            handleToggleVoiceCommand()
          }}
          aria-pressed={isVoiceCommandActive}
          className={`${btnBaseClass} text-white transition-all duration-300 ${isVoiceCommandActive 
            ? "shadow-[0_0_0_1px_rgba(10,68,255,0.18),0_0_24px_rgba(10,68,255,0.42)] ring-4 ring-[#0A44FF]/30 bg-[#0A44FF]"
            : "bg-[#0A44FF] shadow-md shadow-[#0A44FF]/30 hover:bg-[#0836CC] hover:shadow-lg hover:shadow-[#0A44FF]/50"
          }`}
          aria-label={isVoiceCommandActive ? "Stop Listening" : "Start Voice Command"}
          {...getHoverHandlers(isVoiceCommandActive ? "Stop Listening" : "Speak")}
        >
          <Tooltip label={isVoiceCommandActive ? "Stop Listening" : "Speak"} isDark={isDark} />
          <div className="relative flex items-center justify-center !w-full !h-full shrink-0" aria-hidden="true">
            <svg 
              viewBox="0 0 24 24" 
              fill="currentColor" 
              className={`absolute !w-5 !h-5 shrink-0 ${iconMotionClass} ${isVoiceCommandActive ? "opacity-100 scale-100" : "opacity-0 scale-[0.92]"}`}
            >
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
            <svg 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2.5" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              className={`absolute !w-[22px] !h-[22px] shrink-0 ${iconMotionClass} ${isVoiceCommandActive ? "opacity-0 scale-[1.08]" : "opacity-100 scale-100"}`}
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          </div>
        </button>
      </div>

      {/* ========================================================= */}
      {/* ↔️ MIDDLE SECTION (The Core Ghosting Fix) */}
      {/* ========================================================= */}
      <div 
        // 🚨 THE FIX: This invisible clip-path bounds the top and bottom perfectly, eliminating ghosting as it shrinks, 
        // but intentionally ignores the left/right bounds so your Tooltips have plenty of space to render!
        className={`grid w-full relative z-10 [clip-path:inset(-50px_-200px_0px_-200px)] transition-all duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isMinimized ? "grid-rows-[0fr] mt-0" : "grid-rows-[1fr] mt-3"
        }`}
      >
        <div className="min-h-0 flex justify-center w-full">
          <div 
            // 🚨 THE FIX: When minimizing, this gently shrinks to 85% size and fades out in 300ms, 
            // preventing the ugly "glitchy disappear" effect while the outer container takes 800ms to gracefully fold.
            className={`flex flex-col items-center p-2 gap-1.5 w-fit origin-top transition-all ease-[cubic-bezier(0.16,1,0.3,1)] ${middleGlassPanelClass} ${
              isMinimized 
                ? "opacity-0 scale-[0.85] -translate-y-4 pointer-events-none duration-300" 
                : "opacity-100 scale-100 translate-y-0 pointer-events-auto duration-[800ms]"
            }`}
          >
            <button
              type="button"
              onClick={handleTogglePlay}
              aria-pressed={isPlayOptimistic}
              className={`${btnBaseClass} ${isMinimized ? "shadow-none hover:shadow-none" : btnAccentClass}`}
              aria-label={isPlayOptimistic ? "Pause Reading" : "Play Reading"}
              {...getHoverHandlers(isPlayOptimistic ? "Pause" : "Play")}
            >
              <Tooltip label={isPlayOptimistic ? "Pause" : "Play"} isDark={isDark} />
              {isPlayOptimistic ? (
                <svg viewBox="0 0 24 24" fill="currentColor" className={`transition-transform duration-200 will-change-transform !w-[22px] !h-[22px] shrink-0`} aria-hidden="true">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor" className={`transition-transform duration-200 will-change-transform !w-[24px] !h-[24px] ml-1 shrink-0`} aria-hidden="true">
                  <polygon points="6 4 19 12 6 20 6 4" />
                </svg>
              )}
            </button>

            <button
              type="button"
              onClick={onNext}
              className={`${btnBaseClass} ${btnHoverClass} ${isMinimized ? "shadow-none hover:shadow-none" : ""}`}
              aria-label="Next Paragraph"
              {...getHoverHandlers("Next")}
            >
              <Tooltip label="Next" isDark={isDark} />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`${iconMotionClass} !w-[22px] !h-[22px] shrink-0`} aria-hidden="true">
                <polygon points="5 4 15 12 5 20 5 4" />
                <line x1="19" y1="5" x2="19" y2="19" />
              </svg>
            </button>

            <button
              type="button"
              onClick={onPrev}
              className={`${btnBaseClass} ${btnHoverClass} ${isMinimized ? "shadow-none hover:shadow-none" : ""}`}
              aria-label="Previous Paragraph"
              {...getHoverHandlers("Previous")}
            >
              <Tooltip label="Previous" isDark={isDark} />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`${iconMotionClass} !w-[22px] !h-[22px] shrink-0`} aria-hidden="true">
                <polygon points="19 20 9 12 19 4 19 20" />
                <line x1="5" y1="19" x2="5" y2="5" />
              </svg>
            </button>

            <button
              type="button"
              onClick={onRestart}
              disabled={!canRestart}
              className={`${btnBaseClass} ${btnHoverClass} ${isMinimized ? "shadow-none hover:shadow-none" : ""} ${canRestart ? "" : "opacity-30 cursor-not-allowed hover:bg-transparent hover:translate-y-0 hover:shadow-none"}`}
              aria-label="Restart Reading from Beginning"
              {...getHoverHandlers("Restart")}
            >
              <Tooltip label="Restart" isDark={isDark} />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`${iconMotionClass} !w-[22px] !h-[22px] shrink-0`} aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <polyline points="21 3 21 8 16 8" />
              </svg>
            </button>

            <div className={`!w-7 !h-px my-1.5 shrink-0 transition-colors duration-300 ${isDark ? 'bg-white/20' : 'bg-black/15'}`} role="separator" />

            <button
              type="button"
              onClick={onOpenReadingSpeed}
              className={`${btnBaseClass} ${btnHoverClass} ${isMinimized ? "shadow-none hover:shadow-none" : ""} font-bold text-sm tracking-wider`}
              aria-label={`Change Reading Speed. Current speed is ${readingSpeedLabel}`}
              {...getHoverHandlers("Reading Speed")}
            >
              <Tooltip label="Reading Speed" isDark={isDark} />
              {readingSpeedLabel}
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              className={`${btnBaseClass} ${settingsBtnHoverClass} ${isMinimized ? "shadow-none hover:shadow-none" : ""}`}
              aria-label="Open Settings"
              {...getHoverHandlers("Settings")}
            >
              <Tooltip label="Settings" isDark={isDark} />
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`${iconMotionClass} !w-[24px] !h-[24px] shrink-0`} aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 🔽 BOTTOM SECTION: WINDOW CONTROLS */}
      {/* ========================================================= */}
      <div className={`flex flex-col items-center p-2 gap-1.5 shrink-0 mt-3 relative z-30 ${glassPanelClass}`}>
        <button
          type="button"
          onClick={onMinimizeToggle}
          aria-expanded={!isMinimized}
          className={`${btnBaseClass} ${btnHoverClass}`}
          aria-label={isMinimized ? "Expand Menu" : "Minimize Menu"}
          {...getHoverHandlers(isMinimized ? "Expand" : "Minimize")}
        >
          <Tooltip label={isMinimized ? "Expand" : "Minimize"} isDark={isDark} />
          
          <svg 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2.5" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            className={`!w-[22px] !h-[22px] shrink-0 transition-transform duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${isMinimized ? "rotate-180" : "rotate-0"}`} 
            aria-hidden="true"
          >
            <polyline points="7 15 12 10 17 15" />
            <polyline points="7 9 12 4 17 9" />
          </svg>
        </button>

        <button
          type="button"
          onClick={onClose}
          className={closeBtnClass}
          aria-label="Close Toolbar"
          {...getHoverHandlers("Close")}
        >
          <Tooltip label="Close" isRed isDark={isDark} />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`${iconMotionClass} w-5 h-5 shrink-0`} aria-hidden="true">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  )
}