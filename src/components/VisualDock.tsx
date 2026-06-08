import React, { useEffect, useRef, useState } from "react"
import { Tooltip } from "./Tooltip"
import { useUIHoverAudio } from "../hooks/useUIHoverAudio"

const DEFAULT_WAKE_WORD = "Sensa"

const GodTierMicIcon = ({ isActive }: { isActive: boolean }) => {  
  const barsRef = useRef<(HTMLDivElement | null)[]>([])
  const currentHeights = useRef([4, 6, 8, 6, 4])
  const tickRef = useRef(0)
  
  const isActiveRef = useRef(isActive)
  useEffect(() => {
    isActiveRef.current = isActive
  }, [isActive])
  
  useEffect(() => {
    let animationId: number
    let audioCtx: AudioContext | null = null
    let analyser: AnalyserNode | null = null
    let stream: MediaStream | null = null
    let dataArray: Uint8Array | null = null
    let smoothedEnergy = 0
    let lastTime = performance.now()
    
    const ENERGY_GATE = 0.06

    const colors = [
      "rgba(147, 197, 253, 1)", 
      "rgba(59, 130, 246, 1)",  
      "rgba(10, 68, 255, 1)",   
      "rgba(59, 130, 246, 1)",  
      "rgba(147, 197, 253, 1)", 
    ]

    const maxHeights = [12, 18, 26, 18, 12]
    const idleHeights = [4, 6, 8, 6, 4]

    const stopMic = () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop())
        stream = null
      }
      if (audioCtx) {
        audioCtx.close().catch(() => undefined)
        audioCtx = null
      }
      analyser = null
      dataArray = null
      smoothedEnergy = 0
    }

    const startMic = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            noiseSuppression: true,
            echoCancellation: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: 48000
          }
        })
        audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)()
        analyser = audioCtx.createAnalyser()
        analyser.fftSize = 256
        analyser.smoothingTimeConstant = 0.5

        const source = audioCtx.createMediaStreamSource(stream)
        source.connect(analyser)
        dataArray = new Uint8Array(analyser.fftSize)
      } catch (err) {}
    }

    const getLiveEnergy = () => {
      if (!isActiveRef.current || !analyser || !dataArray) return 0
      analyser.getByteTimeDomainData(dataArray as any)

      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i] - 128) / 128
        sum += normalized * normalized
      }

      const rms = Math.sqrt(sum / dataArray.length)
      const rawEnergy = Math.min(1, rms * 12.0)
      smoothedEnergy = smoothedEnergy * 0.82 + rawEnergy * 0.18

      if (smoothedEnergy < ENERGY_GATE) {
        smoothedEnergy *= 0.9
        return 0
      }
      return (smoothedEnergy - ENERGY_GATE) / (1 - ENERGY_GATE)
    }

    const draw = (time: number) => {
      animationId = requestAnimationFrame(draw)
      if (document.visibilityState !== "visible") {
        smoothedEnergy = 0
        return
      }

      const dt = Math.min((time - lastTime) / 1000, 0.1)
      lastTime = time
      tickRef.current += dt * 60
      const tick = tickRef.current
      const liveEnergy = getLiveEnergy()
      const hasAudio = isActiveRef.current && liveEnergy > 0

      barsRef.current.forEach((bar, i) => {
        if (!bar) return
        
        let targetHeight = idleHeights[i]

        if (hasAudio) {
          const distFromCenter = Math.abs(i - 2)
          const voiceSpike = liveEnergy * 28 * (1 - distFromCenter * 0.15)
          targetHeight = Math.min(maxHeights[i], idleHeights[i] + voiceSpike)
        } else {
          const breath = Math.sin(tick * 0.03 - i * 0.15) * 1.2
          targetHeight = idleHeights[i] + breath
        }

        const baseAmt = hasAudio ? 0.18 : 0.10
        const amt = 1 - Math.pow(1 - baseAmt, dt * 60)
        currentHeights.current[i] += (targetHeight - currentHeights.current[i]) * amt

        bar.style.height = `${currentHeights.current[i].toFixed(2)}px`
        bar.style.backgroundColor = colors[i]

        if (hasAudio) {
          const intensity = (currentHeights.current[i] - idleHeights[i]) / (maxHeights[i] - idleHeights[i])
          const shadowRadius = intensity * 8
          const opacity = Math.max(0.5, intensity + 0.5)
          bar.style.boxShadow = `0 0 ${shadowRadius}px ${colors[i].replace('1)', `${opacity})`)}`
          bar.style.opacity = `${opacity}`
        } else {
          bar.style.boxShadow = "none"
          bar.style.opacity = "0.5"
        }
      })
    }

    animationId = requestAnimationFrame(draw)
    if (isActive) startMic()

    return () => {
      cancelAnimationFrame(animationId)
      stopMic()
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
            willChange: "height, box-shadow, opacity"
          }}
        />
      ))}
    </div>
  )
}

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
  
  const springTransition = "transition-all duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
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
  
  const tabVisibleAtRef = useRef(performance.now())

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        tabVisibleAtRef.current = performance.now()
        cancelHoverAudio()
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [cancelHoverAudio])

  const shouldSkipHoverAudio = () =>
    document.visibilityState !== "visible" ||
    performance.now() - tabVisibleAtRef.current < 600

  const getHoverHandlers = (label: string) => ({
    onMouseEnter: () => {
      if (shouldSkipHoverAudio()) return
      playHoverSfx()
      playHoverAudio(label)
    },
    onMouseLeave: cancelHoverAudio,
    onFocus: (e: React.FocusEvent) => {
      if (!e.relatedTarget || shouldSkipHoverAudio()) return
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
  
  const wakeWordRef = useRef(DEFAULT_WAKE_WORD)

  useEffect(() => {
    callbacksRef.current = {
      isVoiceCommandActive, isMinimized, isPlaying, isPaused, onToggleVoiceCommand, onTogglePlay, onNext, onPrev, onRestart,
      onMinimizeToggle, onOpenReadingSpeed, onOpenSettings, onClose, playClickAudio
    }
  })

  useEffect(() => {
    chrome.storage.local.get(["sensa_visual_wake_word"], (res) => {
      const stored = res.sensa_visual_wake_word
      if (typeof stored === "string" && stored.trim()) {
        wakeWordRef.current = stored.trim()
      }
    })

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.sensa_visual_wake_word === undefined) return
      const next = changes.sensa_visual_wake_word.newValue
      wakeWordRef.current = typeof next === "string" && next.trim() ? next.trim() : DEFAULT_WAKE_WORD
    }

    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [])

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
    
    let consumedString = ""
    let currentResultIndex = 0

    const scheduleRestart = () => {
      if (!isComponentMounted || isPermanentlyDead) return
      if (restartTimer) window.clearTimeout(restartTimer)
      restartTimer = window.setTimeout(() => {
        try { recognition.start() } catch (e) {}
      }, 300) 
    }

    const lockVoiceToggle = () => {
      voiceToggleLockUntil = Date.now() + 1800
    }

    recognition.onresult = (event: any) => {
      const cbs = callbacksRef.current

      if (event.resultIndex !== currentResultIndex) {
        consumedString = ""
        currentResultIndex = event.resultIndex
      }

      let liveText = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        liveText += event.results[i][0].transcript
      }
      liveText = liveText.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()
      liveText = liveText.replace(/\b(?:de|dee|the)\s+activate\b/g, "deactivate")

      let newSpeech = liveText
      if (liveText.startsWith(consumedString) && consumedString.length > 0) {
        newSpeech = liveText.slice(consumedString.length).trim()
      }

      if (!newSpeech) return

      const paddedSpeech = ` ${newSpeech} `
      const check = (...words: string[]) => words.some(w => paddedSpeech.includes(` ${w} `))
      
      const canToggleVoiceMode = Date.now() >= voiceToggleLockUntil
      const currentWakeWord = (wakeWordRef.current || DEFAULT_WAKE_WORD).toLowerCase().trim()
      let commandFired = false

      if (!cbs.isVoiceCommandActive) {
        const isCustom = currentWakeWord !== "sensa"
        const wakeMatched = isCustom 
          ? paddedSpeech.includes(` ${currentWakeWord} `)
          : check("sensa", "sansa", "sensor", "sensia", "sincere", "center", "wake", "listen", "start")

        if (canToggleVoiceMode && wakeMatched) {
          commandFired = true
          lockVoiceToggle()
          cbs.playClickAudio?.("Voice commands activated")
          try { cbs.onToggleVoiceCommand() } catch {}
        } else if (check("deactivate", "deactivate visual mode", "activate", "activate visual mode", "turn off", "turn off visual mode", "close", "exit", "quit")) {
          commandFired = true
          cbs.playClickAudio?.('Close')
          cbs.onClose()
        }
      } else {
        if (canToggleVoiceMode && check("stop listening", "stop voice", "sleep", "mute", "quiet")) {
          commandFired = true
          lockVoiceToggle()
          cbs.playClickAudio?.('Voice commands deactivated')
          try { cbs.onToggleVoiceCommand() } catch {}
        } 
        else if (check("play", "resume", "continue", "start reading", "read")) {
          commandFired = true
          if (!cbs.isPlaying || cbs.isPaused) { cbs.playClickAudio?.('Play'); cbs.onTogglePlay(); }
        } 
        else if (check("pause", "halt", "stop reading", "stop playing", "stop")) {
          commandFired = true
          if (cbs.isPlaying && !cbs.isPaused) { cbs.playClickAudio?.('Pause'); cbs.onTogglePlay(); }
        } 
        else if (check("next", "skip", "forward", "necks")) {
          commandFired = true
          cbs.playClickAudio?.('Next'); cbs.onNext();
        } 
        else if (check("previous", "prev", "back", "go back")) {
          commandFired = true
          cbs.playClickAudio?.('Previous'); cbs.onPrev();
        } 
        else if (check("restart", "start over", "reset", "refresh")) {
          commandFired = true
          cbs.playClickAudio?.('Restart'); cbs.onRestart();
        } 
        else if (check("speed", "rate", "reading speed", "voice speed")) {
          commandFired = true
          cbs.playClickAudio?.('Reading speed'); cbs.onOpenReadingSpeed();
        } 
        else if (check("setting", "settings", "options", "open settings")) {
          commandFired = true
          cbs.playClickAudio?.('Settings'); cbs.onOpenSettings();
        } 
        else if (check("minimize", "collapse", "hide", "mini")) {
          commandFired = true
          if (!cbs.isMinimized) { cbs.playClickAudio?.('Minimize'); cbs.onMinimizeToggle(); }
        } 
        else if (check("expand", "maximize", "show", "open")) {
          commandFired = true
          if (cbs.isMinimized) { cbs.playClickAudio?.('Expand'); cbs.onMinimizeToggle(); }
        } 
        else if (check("close", "exit", "quit", "dismiss", "duck", "dark", "deactivate", "deactivate visual mode", "activate", "activate visual mode", "turn off", "turn off visual mode")) {
          commandFired = true
          cbs.playClickAudio?.('Close'); cbs.onClose();
        } 
        else if (check("top", "go up")) {
          commandFired = true
          window.scrollTo({ top: 0, behavior: "smooth" })
        } 
        else if (check("bottom", "down below")) {
          commandFired = true
          window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" })
        } 
        else if (check("scroll up", "up") && !check("go up", "top")) {
          commandFired = true
          window.scrollBy({ top: -600, behavior: "smooth" })
        } 
        else if (check("scroll down", "down") && !check("down below", "bottom")) {
          commandFired = true
          window.scrollBy({ top: 600, behavior: "smooth" })
        }
      }

      if (commandFired) {
        consumedString = liveText
      }
    }

    recognition.onerror = (event: any) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        isPermanentlyDead = true
        return
      }
      scheduleRestart()
    }

    recognition.onend = () => scheduleRestart()

    const reviveEngineOnClick = () => {
      if (isPermanentlyDead && !isVoiceCommandsSuspended) {
        isPermanentlyDead = false
        try { recognition.start() } catch (e) {}
      }
    }
    window.addEventListener("click", reviveEngineOnClick)

    const startTimeout = window.setTimeout(() => {
      try { recognition.start() } catch (e) {}
    }, 150)

    return () => {
      isComponentMounted = false
      window.removeEventListener("click", reviveEngineOnClick)
      if (restartTimer) window.clearTimeout(restartTimer)
      window.clearTimeout(startTimeout)
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
        className={`grid w-full relative z-10 transform-gpu backface-hidden will-change-[grid-template-rows] ${springTransition} ${
          isMinimized ? "grid-rows-[0fr] mt-0" : "grid-rows-[1fr] mt-3"
        }`}
      >
        <div className="min-h-0 flex justify-center w-full">
          <div 
            className={`flex flex-col items-center p-2 gap-1.5 w-fit origin-top transform-gpu backface-hidden will-change-[opacity,transform] ${springTransition} ${middleGlassPanelClass} ${
              isMinimized 
                ? "opacity-0 scale-75 -translate-y-4 pointer-events-none" 
                : "opacity-100 scale-100 translate-y-0 pointer-events-auto"
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

            <div className={`!w-7 !min-h-[2px] rounded-full my-1.5 shrink-0 transition-colors duration-300 ${isDark ? 'bg-white/40' : 'bg-black/30'}`} role="separator" aria-hidden="true" />

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
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`${iconMotionClass} !w-[24px] !h-[24px] shrink-0`} aria-hidden="true">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                <circle cx="12" cy="12" r="3"/>
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
            className="!w-[22px] !h-[22px] shrink-0 transform-gpu backface-hidden will-change-transform"
            style={{
              transform: `rotate(${isMinimized ? 180 : 0}deg) translateZ(0)`,
              transformOrigin: "50% 50%",
              transition: "transform 260ms cubic-bezier(0.2, 0.9, 0.2, 1)"
            }}
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