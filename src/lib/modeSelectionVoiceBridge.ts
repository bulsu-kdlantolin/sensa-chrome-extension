import { DEFAULT_PROFILE, type SensaUserProfile } from "./storage"

type ModeSelectionVoiceMode = "visual" | "auditory"

let recognition: SpeechRecognition | null = null
let isActive = false
let restartTimer: number | null = null
let ignoreSpeechUntil = 0
let consumedString = ""
let currentResultIndex = 0
let commandApplied = false
let globalBuffer = ""
let watchdogTimer: number | null = null
let lastAudioTimestamp = 0
let recognitionRunning = false

const getSpeechRecognitionCtor = () =>
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

export function isModeSelectionVoiceActive() {
  return isActive
}

const tabLog = (message: string, level: "log" | "warn" | "error" = "log") => {
  console[level](message)
  try {
    chrome.runtime.sendMessage({
      type: "sensa-tab-log",
      message,
      level
    }, () => {
      // Ignore error if receiver doesn't exist (e.g. popup is closed)
      const err = chrome.runtime.lastError
    })
  } catch {
    // Ignore runtime errors
  }
}

const clearRestartTimer = () => {
  if (restartTimer !== null) {
    window.clearTimeout(restartTimer)
    restartTimer = null
  }
}

const clearWatchdog = () => {
  if (watchdogTimer !== null) {
    window.clearInterval(watchdogTimer)
    watchdogTimer = null
  }
}

const tryStart = () => {
  if (!isActive || !recognition || commandApplied) return
  try {
    recognition.start()
  } catch (e) {
    // start() threw — recognition may be in a bad state.
    // Don't rely on onend (it won't fire if it never started).
    // Schedule a retry with a fresh attempt.
    tabLog(`[Sensa Tab Voice Bridge] recognition.start() threw: ${e}`, "warn")
    recognitionRunning = false
    clearRestartTimer()
    restartTimer = window.setTimeout(() => {
      // If it's still stuck, tear down and rebuild the instance
      if (!isActive || commandApplied) return
      rebuildRecognition()
    }, 200)
  }
}

const scheduleRestart = () => {
  if (!isActive || commandApplied) return
  clearRestartTimer()
  recognitionRunning = false
  restartTimer = window.setTimeout(tryStart, 80)
}

// Completely rebuilds the SpeechRecognition instance when it gets into a bad state
const rebuildRecognition = () => {
  if (!isActive || commandApplied) return
  tabLog("[Sensa Tab Voice Bridge] Rebuilding recognition instance...")
  teardownRecognition()
  
  const SpeechRecognitionCtor = getSpeechRecognitionCtor()
  if (!SpeechRecognitionCtor) return
  
  const instance = new SpeechRecognitionCtor()
  recognition = instance
  instance.continuous = true
  instance.interimResults = true
  instance.lang = "en-US"
  attachRecognitionHandlers(instance)
  
  window.setTimeout(tryStart, 50)
}

// Watchdog: periodically checks that recognition is alive and receiving audio.
// If recognition hasn't received audio events for too long, it forces a restart.
const startWatchdog = () => {
  clearWatchdog()
  lastAudioTimestamp = Date.now()
  
  watchdogTimer = window.setInterval(() => {
    if (!isActive || commandApplied) {
      clearWatchdog()
      return
    }
    
    const silenceDuration = Date.now() - lastAudioTimestamp
    
    // If recognition isn't flagged as running, or we haven't heard anything
    // for 8 seconds, force a restart. Chrome's SpeechRecognition can silently
    // stop after silence or tab backgrounding without firing onend.
    if (!recognitionRunning && silenceDuration > 3000) {
      tabLog(`[Sensa Tab Voice Bridge] Watchdog: recognition not running, restarting (silent ${silenceDuration}ms)`, "warn")
      rebuildRecognition()
      lastAudioTimestamp = Date.now() // prevent rapid-fire rebuilds
    } else if (recognitionRunning && silenceDuration > 12000) {
      // Recognition thinks it's running but no audio events in 12s — likely dead
      tabLog(`[Sensa Tab Voice Bridge] Watchdog: no audio events for ${silenceDuration}ms, forcing restart`, "warn")
      rebuildRecognition()
      lastAudioTimestamp = Date.now()
    }
  }, 4000)
}

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

const normalizeInput = (rawText: string): string => {
  let text = rawText.toLowerCase()
  text = text.replace(/[^a-z0-9\s]/gi, " ")
  text = text.replace(/\s+/g, " ").trim()
  const fillerWords = new Set(["the", "a", "please", "hey", "can", "you", "change", "set", "to", "my", "select", "sincere", "sansa", "sensor", "sensia"])
  const tokens = text.split(" ").filter(t => !fillerWords.has(t))
  return tokens.join(" ")
}

const attachRecognitionHandlers = (instance: SpeechRecognition) => {
  instance.onstart = () => {
    recognitionRunning = true
    lastAudioTimestamp = Date.now()
    tabLog("[Sensa Tab Voice Bridge] Recognition started successfully")
  }

  // Track audio activity for the watchdog (use addEventListener since onaudiostart
  // isn't in the TypeScript SpeechRecognition type definition)
  ;(instance as any).onaudiostart = () => {
    lastAudioTimestamp = Date.now()
  }

  instance.onresult = (event: SpeechRecognitionEvent) => {
    lastAudioTimestamp = Date.now()
    if (commandApplied) {
      return
    }

    if (event.resultIndex !== currentResultIndex) {
      consumedString = ""
      currentResultIndex = event.resultIndex
    }

    let interimChunk = ""
    let newFinals = ""

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const text = event.results[i][0].transcript
      if (event.results[i].isFinal) {
        newFinals += text + " "
      } else {
        interimChunk += text + " "
      }
    }

    globalBuffer += newFinals
    if (globalBuffer.length > 150) {
      globalBuffer = globalBuffer.slice(-150)
    }

    const rawTranscript = (globalBuffer + " " + interimChunk).trim()
    if (!rawTranscript) return

    const normalizedTranscript = normalizeInput(rawTranscript)
    if (!normalizedTranscript) return

    tabLog(`[Sensa Mode Selection Tab Voice Bridge] Heard transcript: "${normalizedTranscript}" (Raw: "${rawTranscript}")`)

    const count = (w: string) => {
      const regex = new RegExp(`\\b${w}\\b`, "g")
      return (normalizedTranscript.match(regex) || []).length
    }

    let visualScore = 0
    let auditoryScore = 0

    // Visual Score Cues
    visualScore += count("visual mode") * 5
    visualScore += count("vision mode") * 5
    visualScore += count("visual") * 3
    visualScore += count("vision") * 3
    visualScore += count("visual mod") * 4
    visualScore += count("bisual") * 3

    if (visualScore === 0) {
      if (fuzzyMatch(normalizedTranscript, "visual mode", 2) || fuzzyMatch(normalizedTranscript, "vision mode", 2)) {
        visualScore += 4
      } else if (fuzzyMatch(normalizedTranscript, "visual", 1) || fuzzyMatch(normalizedTranscript, "vision", 1) || fuzzyMatch(normalizedTranscript, "bisual", 1)) {
        visualScore += 2
      }
    }

    // Auditory Score Cues
    auditoryScore += count("auditory mode") * 5
    auditoryScore += count("audio mode") * 5
    auditoryScore += count("sound mode") * 5
    auditoryScore += count("auditory") * 3
    auditoryScore += count("audio") * 3
    auditoryScore += count("auditor") * 3

    auditoryScore += count("auditori") * 3
    auditoryScore += count("hearing mode") * 5
    auditoryScore += count("hearing") * 3

    if (auditoryScore === 0) {
      if (
        fuzzyMatch(normalizedTranscript, "auditory mode", 2) || 
        fuzzyMatch(normalizedTranscript, "audio mode", 2) ||
        fuzzyMatch(normalizedTranscript, "sound mode", 2) ||
        fuzzyMatch(normalizedTranscript, "hearing mode", 2)
      ) {
        auditoryScore += 4
      } else if (
        fuzzyMatch(normalizedTranscript, "auditory", 1) || 
        fuzzyMatch(normalizedTranscript, "audio", 1) ||
        fuzzyMatch(normalizedTranscript, "auditor", 1) ||
        fuzzyMatch(normalizedTranscript, "auditori", 1) ||
        fuzzyMatch(normalizedTranscript, "hearing", 1)
      ) {
        auditoryScore += 2
      }
    }

    let chosenCommand: "visual" | "auditory" | null = null
    const threshold = 2

    if (visualScore >= threshold && visualScore > auditoryScore) {
      chosenCommand = "visual"
    } else if (auditoryScore >= threshold && auditoryScore > visualScore) {
      chosenCommand = "auditory"
    } else if (visualScore >= threshold && auditoryScore >= threshold) {
      tabLog(`[Sensa Mode Selection Tab Voice Bridge] Conflict detected (visual: ${visualScore}, auditory: ${auditoryScore}). Clearing buffer.`)
      globalBuffer = ""
    }

    tabLog(`[Sensa Mode Selection Tab Voice Bridge] Score results -> Visual: ${visualScore}, Auditory: ${auditoryScore}, chosenCommand: ${chosenCommand}`)

    if (chosenCommand) {
      globalBuffer = "" 
      applyModeSelection(chosenCommand)
    }
  }

  instance.onerror = (event: SpeechRecognitionErrorEvent) => {
    recognitionRunning = false
    tabLog(`[Sensa Tab Voice Bridge] SpeechRecognition error in tab: ${event.error}`, "error")
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      tabLog("[Sensa Tab Voice Bridge] Microphone access denied, stopping tab listener.", "warn")
      isActive = false
      teardownRecognition()
      chrome.storage.local.set({ sensa_mode_selection_listening: false })
      return
    }
    // For "no-speech" errors, don't log as scary — this is normal
    if (event.error === "no-speech") {
      tabLog("[Sensa Tab Voice Bridge] No speech detected, restarting...", "log")
    }
    scheduleRestart()
  }

  instance.onend = () => {
    recognitionRunning = false
    scheduleRestart()
  }
}

const applyModeSelection = (mode: ModeSelectionVoiceMode) => {
  if (commandApplied || Date.now() < ignoreSpeechUntil) return

  commandApplied = true
  ignoreSpeechUntil = Date.now() + 2000
  isActive = false
  clearWatchdog()
  teardownRecognition()

  tabLog(`[Sensa Tab Voice Bridge] Applying chosen mode selection: ${mode}`)

  chrome.storage.local.get(["sensa_user_profile", "sensa_mode_selection_listening"], (res) => {
    if (!res.sensa_mode_selection_listening) {
      tabLog("[Sensa Tab Voice Bridge] sensa_mode_selection_listening is false, selection ignored.", "warn")
      commandApplied = false
      return
    }

    const profile = (res.sensa_user_profile as SensaUserProfile | undefined) ?? DEFAULT_PROFILE
    if (profile.globalSettings?.activeMode) {
      tabLog("[Sensa Tab Voice Bridge] Profile already has an active mode, selection ignored.", "warn")
      commandApplied = false
      return
    }

    chrome.storage.local.set({
      sensa_mode_selection_listening: false,
      sensa_user_profile: {
        ...profile,
        globalSettings: {
          ...profile.globalSettings,
          activeMode: mode
        }
      },
      sensa_last_tab: mode
    }, () => {
      tabLog(`[Sensa Tab Voice Bridge] Storage updated. activeMode is now: ${mode}`)
    })
  })
}

const teardownRecognition = () => {
  clearRestartTimer()
  recognitionRunning = false
  if (!recognition) return

  try {
    recognition.stop()
  } catch {}

  recognition.onresult = null
  recognition.onerror = null
  recognition.onend = null
  recognition.onstart = null
  ;(recognition as any).onaudiostart = null
  recognition = null
}

const primeMicrophone = async () => {
  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    throw new Error("navigator.mediaDevices.getUserMedia is not available")
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      noiseSuppression: true,
      // echoCancellation disabled: the TTS narration from the popup plays through
      // speakers and echoCancellation was causing Chrome to suppress the user's
      // actual voice during/after TTS playback — this was the main cause of
      // recognition intermittently "not listening"
      echoCancellation: false,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: 48000
    }
  })
  stream.getTracks().forEach((track) => track.stop())
}

export async function startModeSelectionVoiceListener(): Promise<boolean> {
  if (isActive && recognition) {
    return true
  }

  const SpeechRecognitionCtor = getSpeechRecognitionCtor()
  if (!SpeechRecognitionCtor) {
    tabLog("[Sensa Tab Voice Bridge] SpeechRecognition is NOT supported in this browser.", "warn")
    return false
  }

  stopModeSelectionVoiceListener()

  try {
    await primeMicrophone()
  } catch (e) {
    tabLog(`[Sensa Tab Voice Bridge] Failed to acquire microphone permissions in tab, trying to proceed anyway: ${e}`, "warn")
  }

  isActive = true
  commandApplied = false
  consumedString = ""
  currentResultIndex = 0
  ignoreSpeechUntil = 0
  globalBuffer = ""
  recognitionRunning = false

  await new Promise<void>((resolve) => {
    chrome.storage.local.set({ sensa_mode_selection_listening: true }, () => resolve())
  })

  const instance = new SpeechRecognitionCtor()
  recognition = instance
  instance.continuous = true
  instance.interimResults = true
  instance.lang = "en-US"

  attachRecognitionHandlers(instance)
  startWatchdog()

  window.setTimeout(tryStart, 50)
  return true
}

export function stopModeSelectionVoiceListener() {
  if (!isActive && !recognition) {
    return
  }
  isActive = false
  commandApplied = false
  consumedString = ""
  currentResultIndex = 0
  recognitionRunning = false
  clearWatchdog()
  teardownRecognition()
  chrome.storage.local.set({ sensa_mode_selection_listening: false })
}
