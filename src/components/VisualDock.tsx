import React, { useEffect, useRef, useState } from "react"
import { Tooltip } from "./Tooltip"
import { useUIHoverAudio } from "../hooks/useUIHoverAudio"

// ============================================================================
// 🎙️ THE GOD-TIER MIC ICON (With Hardware Audio Anchor)
// ============================================================================
const GodTierMicIcon = ({ isActive }: { isActive: boolean }) => {  
  const barsRef = useRef<(HTMLDivElement | null)[]>([])
  const currentHeights = useRef([4, 6, 8, 6, 4])
  const tickRef = useRef(0)
  
  // 🚨 THE ANCHOR FIX: We use a ref to track isActive so we don't have to 
  // put it in the useEffect dependency array. This prevents the mic from restarting!
  const isActiveRef = useRef(isActive)
  useEffect(() => {
    isActiveRef.current = isActive
  }, [isActive])
  
  useEffect(() => {
    let animationId: number
    let audioCtx: AudioContext | null = null
    let analyser: AnalyserNode | null = null
    let stream: MediaStream | null = null
    let dataArray: Uint8Array<ArrayBuffer> | null = null
    let smoothedEnergy = 0
    
    const silenceGate = 0.02 

    const colors = [
      "rgba(147, 197, 253, 1)", 
      "rgba(59, 130, 246, 1)",  
      "rgba(10, 68, 255, 1)",   
      "rgba(59, 130, 246, 1)",  
      "rgba(147, 197, 253, 1)", 
    ]

    const maxHeights = [12, 18, 26, 18, 12]
    const idleHeights = [4, 6, 8, 6, 4]

    // We start the mic ONCE when the component mounts and hold it open forever.
    const startMic = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
        analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.5 

        const source = audioCtx.createMediaStreamSource(stream)
        source.connect(analyser)
        dataArray = new Uint8Array(new ArrayBuffer(analyser.fftSize))
        
        draw() // Start drawing loop once mic is hot
      } catch (err) {
        console.warn("Mic visualizer: access denied.", err)
        draw() // Fallback to drawing idle state if mic fails
      }
    }

    const getLiveEnergy = () => {
      // If voice commands are disabled, we return 0 so the bars don't spike
      if (!isActiveRef.current || !analyser || !dataArray) return 0
      
      analyser.getByteTimeDomainData(dataArray)
      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i] - 128) / 128
        sum += normalized * normalized
      }

      const rms = Math.sqrt(sum / dataArray.length)
      const boosted = Math.min(1, rms * 12.0) 
      smoothedEnergy = smoothedEnergy * 0.3 + boosted * 0.7 

      if (smoothedEnergy <= silenceGate) return 0
      return (smoothedEnergy - silenceGate) / (1 - silenceGate)
    }

    const draw = () => {
      animationId = requestAnimationFrame(draw)
      if (document.visibilityState !== "visible") return

      tickRef.current += 1
      const tick = tickRef.current
      const liveEnergy = getLiveEnergy()

      barsRef.current.forEach((bar, i) => {
        if (!bar) return
        
        let targetHeight = idleHeights[i]

        if (isActiveRef.current) {
          // Reacts physically to your voice volume
          const distFromCenter = Math.abs(i - 2)
          const voiceSpike = liveEnergy * 40 * (1 - distFromCenter * 0.15)
          targetHeight = Math.min(maxHeights[i], idleHeights[i] + voiceSpike)
        } else {
          // Subtle, calm breathing when asleep
          const breath = Math.sin(tick * 0.04) * 1.5
          targetHeight = idleHeights[i] + Math.max(0, breath)
        }

        currentHeights.current[i] += (targetHeight - currentHeights.current[i]) * 0.25
        const intensity = (currentHeights.current[i] - idleHeights[i]) / (maxHeights[i] - idleHeights[i])
        const shadowRadius = intensity * 8
        const opacity = Math.max(0.5, intensity + 0.5)

        bar.style.height = `${Math.round(currentHeights.current[i])}px`
        bar.style.backgroundColor = colors[i]
        bar.style.boxShadow = `0 0 ${shadowRadius}px ${colors[i].replace('1)', `${opacity})`)}`
        bar.style.opacity = `${opacity}`
      })
    }

    startMic()

    return () => {
      if (animationId) cancelAnimationFrame(animationId)
      if (stream) stream.getTracks().forEach((track) => track.stop())
      if (audioCtx) audioCtx.close().catch(() => undefined)
    }
  }, []) // 🚨 EMPTY DEPENDENCY ARRAY: This component never restarts the mic!

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
            willChange: "height, box-shadow, opacity",
            transition: `all 150ms ease-out`
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
  isVoiceCommandsSuspended?: boolean
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
  isVoiceCommandsSuspended = false,
}: VisualDockProps) {
  const { playHoverAudio, playClickAudio, cancelHoverAudio } = useUIHoverAudio()
  const [isPlayOptimistic, setIsPlayOptimistic] = useState(isPlaying && !isPaused)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const [isSoundEffectsEnabled, setIsSoundEffectsEnabled] = useState(true)
  const isSoundEffectsEnabledRef = useRef(true)

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
  
  const iconMotionClass = `transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform`
  
  const glassPanelClass = `rounded-full backdrop-blur-3xl border transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${isDark
    ? "bg-[#1C1C1E]/85 border-white/20 shadow-[0_8px_32px_rgba(0,0,0,0.6)]"
    : "bg-white/90 border-black/10 shadow-[0_8px_32px_rgba(0,0,0,0.15)]"
  } ${isVoiceCommandActive ? "contrast-105 saturate-110 drop-shadow-[0_0_22px_rgba(10,68,255,0.14)]" : "contrast-100 saturate-100 drop-shadow-none"}`

  const middleGlassPanelClass = `rounded-full backdrop-blur-3xl bg-white dark:bg-[#1C1C1E] shadow-[0_8px_32px_rgba(0,0,0,0.15)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.6)] ${isVoiceCommandActive ? "contrast-105 saturate-110" : "contrast-100 saturate-100"}`
    
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

  const handleTogglePlay = () => {
    setIsPlayOptimistic((current) => !current)
    playClickSfx()
    onTogglePlay()
  }

  const handleToggleVoiceCommand = () => {
    playClickSfx()
    onToggleVoiceCommand()
  }

  const callbacksRef = useRef({
    isVoiceCommandActive, isMinimized, isPlaying, isPaused, onToggleVoiceCommand, onTogglePlay, onNext, onPrev, onRestart,
    onMinimizeToggle, onOpenReadingSpeed, onOpenSettings, onClose, playClickAudio
  })

  useEffect(() => {
    callbacksRef.current = {
      isVoiceCommandActive, isMinimized, isPlaying, isPaused, onToggleVoiceCommand, onTogglePlay, onNext, onPrev, onRestart,
      onMinimizeToggle, onOpenReadingSpeed, onOpenSettings, onClose, playClickAudio
    }
  })

  // 🚨 STABILIZED SPEECH ENGINE
  useEffect(() => {
    if (isVoiceCommandsSuspended) return

    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognitionCtor) return

    const recognition = new SpeechRecognitionCtor()
    recognition.continuous = true 
    recognition.interimResults = true 
    recognition.lang = 'en-US'

    let isComponentMounted = true
    let restartTimer: number | null = null
    let voiceToggleLockUntil = 0
    let isPermanentlyDead = false

    const scheduleRestart = () => {
      if (!isComponentMounted || isPermanentlyDead) return
      if (restartTimer) window.clearTimeout(restartTimer)
      restartTimer = window.setTimeout(() => {
        try { recognition.start() } catch (e) {}
      }, 400) 
    }

    const checkCommand = (id: string, pattern: RegExp, transcript: string, cooldownMs = 800) => {
      if (pattern.test(transcript)) {
        const now = Date.now()
        const lastExecuted = callbacksRef.current as any
        const lastTime = lastExecuted[`_last_${id}`] || 0
        if (now - lastTime > cooldownMs) {
          lastExecuted[`_last_${id}`] = now
          return true
        }
      }
      return false
    }

    const lockVoiceToggle = () => {
      voiceToggleLockUntil = Date.now() + 1800
    }

    recognition.onresult = (event: any) => {
      const { 
        isVoiceCommandActive, isMinimized, isPlaying, isPaused, onToggleVoiceCommand, onTogglePlay, onNext, onPrev,
        onRestart, onMinimizeToggle, onOpenReadingSpeed, onOpenSettings, onClose, playClickAudio 
      } = callbacksRef.current

      let interimTranscript = ""
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        interimTranscript += event.results[i][0].transcript
      }

      const transcript = ` ${interimTranscript.toLowerCase().replace(/[^a-z0-9\s]/gi, "").replace(/\s+/g, " ").trim()} `
      if (!transcript.trim()) return

      const canToggleVoiceMode = Date.now() >= voiceToggleLockUntil
      let commandFired = false

      if (!isVoiceCommandActive) {
        if (canToggleVoiceMode && checkCommand('speak', /\b(speak|peak|spik|speed|wake|listen|start)\b/i, transcript, 500)) {
          commandFired = true
          lockVoiceToggle()
          playClickAudio?.('Voice commands activated')
          try { onToggleVoiceCommand() } catch {}
        }
      } else {
        if (canToggleVoiceMode && checkCommand('stoplistening', /\b(stop|sleep|mute)\b/i, transcript, 500)) {
          commandFired = true
          lockVoiceToggle()
          playClickAudio?.('Voice commands deactivated')
          try { onToggleVoiceCommand() } catch {}
        } 
        else if (checkCommand('play', /\b(play|resume|continue|lay|bay|clay|pay|pray|start reading)\b/i, transcript, 500)) {
          commandFired = true
          if (!isPlaying || isPaused) { playClickAudio?.('Play'); onTogglePlay(); }
        } 
        else if (checkCommand('pause', /\b(pause|stop reading|halt|paws|pass|boss|pulse|pose|stop playing)\b/i, transcript, 500)) {
          commandFired = true
          if (isPlaying && !isPaused) { playClickAudio?.('Pause'); onTogglePlay(); }
        } 
        else if (checkCommand('next', /\b(next|skip|forward)\b/i, transcript, 500)) {
          commandFired = true
          playClickAudio?.('Next'); onNext();
        } 
        else if (checkCommand('prev', /\b(previous|back|prev)\b/i, transcript, 500)) {
          commandFired = true
          playClickAudio?.('Previous'); onPrev();
        } 
        else if (checkCommand('restart', /\b(restart|start over|restore|re start|reset|refresh)\b/i, transcript, 500)) {
          commandFired = true
          playClickAudio?.('Restart'); onRestart();
        } 
        else if (checkCommand('speed', /\b(speed|rate)\b/i, transcript, 500)) {
          commandFired = true
          playClickAudio?.('Reading speed'); onOpenReadingSpeed();
        } 
        else if (checkCommand('settings', /\b(setting|options)\b/i, transcript, 1200)) {
          commandFired = true
          playClickAudio?.('Settings'); onOpenSettings();
        } 
        else if (checkCommand('minimize', /\b(minimize|collapse|hide|mini)\b/i, transcript, 500)) {
          commandFired = true
          if (!isMinimized) { playClickAudio?.('Minimize'); onMinimizeToggle(); }
        } 
        else if (checkCommand('expand', /\b(expand|maximize|show)\b/i, transcript, 500)) {
          commandFired = true
          if (isMinimized) { playClickAudio?.('Expand'); onMinimizeToggle(); }
        } 
        else if (checkCommand('close', /\b(close|exit|quit|clothes|dose|shut down|dismiss)\b/i, transcript, 500)) {
          commandFired = true
          playClickAudio?.('Close'); onClose();
        } 
        else if (checkCommand('top', /\b(top|go up)\b/i, transcript, 500)) {
          commandFired = true
          window.scrollTo({ top: 0, behavior: "smooth" })
        } 
        else if (checkCommand('bottom', /\b(bottom|down below)\b/i, transcript, 500)) {
          commandFired = true
          window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })
        } 
        else if (checkCommand('scrollup', /\b(scroll up|up)\b/i, transcript, 500) && !transcript.includes(" to up ")) {
          commandFired = true
          window.scrollBy({ top: -600, behavior: "smooth" })
        } 
        else if (checkCommand('scrolldown', /\b(scroll down|down)\b/i, transcript, 500) && !transcript.includes(" down below ")) {
          commandFired = true
          window.scrollBy({ top: 600, behavior: "smooth" })
        }
      }

      if (commandFired) {
        try { recognition.abort() } catch (e) {}
      }
    }

    recognition.onerror = (event: any) => {
      // If Chrome strictly blocks the mic, stop trying to aggressively restart it.
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        isPermanentlyDead = true
        return
      }
      scheduleRestart()
    }

    recognition.onend = () => scheduleRestart()

    // Auto-Revive if Chrome blocked it on initial page load
    const reviveEngineOnClick = () => {
      if (isPermanentlyDead && !isVoiceCommandsSuspended) {
        isPermanentlyDead = false
        try { recognition.start() } catch (e) {}
      }
    }
    window.addEventListener("click", reviveEngineOnClick)

    try { recognition.start() } catch (e) {}

    return () => {
      isComponentMounted = false
      window.removeEventListener("click", reviveEngineOnClick)
      if (restartTimer) window.clearTimeout(restartTimer)
      try { recognition.stop() } catch (e) {}
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
    }
  }, [isVoiceCommandsSuspended]) 

  return (
    <div 
      className="flex flex-col w-fit shrink-0 box-border relative z-50"
      role="toolbar" 
      aria-label="Reading and Voice Controls"
      data-sensa-visual-dock
    >
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

      <div 
        className={`grid w-full relative z-10 [clip-path:inset(-50px_-200px_0px_-200px)] transition-all duration-[800ms] ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isMinimized ? "grid-rows-[0fr] mt-0" : "grid-rows-[1fr] mt-3"
        }`}
      >
        <div className="min-h-0 flex justify-center w-full">
          <div 
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
              onClick={() => {
                playClickSfx()
                onNext()
              }}
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
              onClick={() => {
                playClickSfx()
                onPrev()
              }}
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
              onClick={() => {
                playClickSfx()
                onRestart()
              }}
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
              onClick={() => {
                playClickSfx()
                onOpenReadingSpeed()
              }}
              className={`${btnBaseClass} ${btnHoverClass} ${isMinimized ? "shadow-none hover:shadow-none" : ""} font-bold text-sm tracking-wider`}
              aria-label={`Change Reading Speed. Current speed is ${readingSpeedLabel}`}
              {...getHoverHandlers("Reading Speed")}
            >
              <Tooltip label="Reading Speed" isDark={isDark} />
              {readingSpeedLabel}
            </button>

            <button
              type="button"
              onClick={() => {
                playClickSfx()
                onOpenSettings()
              }}
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

      <div className={`flex flex-col items-center p-2 gap-1.5 shrink-0 mt-3 relative z-30 ${glassPanelClass}`}>
        <button
          type="button"
          onClick={() => {
            playClickSfx()
            onMinimizeToggle()
          }}
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
          onClick={() => {
            playClickSfx()
            onClose()
          }}
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