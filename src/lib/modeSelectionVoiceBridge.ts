/**
 * @file modeSelectionVoiceBridge.ts
 * @description Web Speech API (`SpeechRecognition`) bridge executed within host page content scripts to enable hands-free voice onboarding mode selection ("visual mode" vs "auditory mode").
 *
 * Architectural Overview:
 * 1. Robust Speech Recognition Engine:
 *    - Uses continuous, interim-result `SpeechRecognition` with audio activity tracking (`onaudiostart`) and an automated watchdog timer (`startWatchdog`) to recover from silent browser timeouts.
 *    - Primes microphone permissions (`primeMicrophone`) while explicitly disabling `echoCancellation` to prevent TTS narration echo from clipping user vocal inputs.
 *
 * 2. Fuzzy Matching & Confirmation Window:
 *    - Implements Levenshtein distance and N-gram scoring (`fuzzyMatch`) to reliably detect commands even with accents or partial recognition errors (e.g., "bisual", "vision", "hearing").
 */

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
let isStarting = false

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
  } catch {
    // Already started or transitioning in Chrome — do not rebuild, just wait for onend/onerror
  }
}

const scheduleRestart = () => {
  if (!isActive || commandApplied) return
  clearRestartTimer()
  recognitionRunning = false
  restartTimer = window.setTimeout(tryStart, 300)
}

// Watchdog: periodically checks that recognition is alive and receiving audio.
const startWatchdog = () => {
  clearWatchdog()
  lastAudioTimestamp = Date.now()
  
  watchdogTimer = window.setInterval(() => {
    if (!isActive || commandApplied) {
      clearWatchdog()
      return
    }
    
    const silenceDuration = Date.now() - lastAudioTimestamp
    if ((!recognitionRunning && silenceDuration > 4000) || silenceDuration > 8000) {
      tabLog(`[Sensa Tab Voice Bridge] Watchdog detected silence (${silenceDuration}ms, running: ${recognitionRunning}). Restarting...`, "warn")
      tryStart()
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

  ;(instance as any).onaudiostart = () => { lastAudioTimestamp = Date.now() }
  ;(instance as any).onaudioend = () => { lastAudioTimestamp = Date.now() }
  ;(instance as any).onsoundstart = () => { lastAudioTimestamp = Date.now() }
  ;(instance as any).onsoundend = () => { lastAudioTimestamp = Date.now() }
  ;(instance as any).onspeechstart = () => { lastAudioTimestamp = Date.now() }
  ;(instance as any).onspeechend = () => { lastAudioTimestamp = Date.now() }

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
    // Keep global buffer short (40 chars max) so we don't drag around old TTS narration
    if (globalBuffer.length > 40) {
      globalBuffer = globalBuffer.slice(-40)
    }

    const rawTranscript = (globalBuffer + " " + interimChunk).trim()
    if (!rawTranscript) return

    let normalizedTranscript = normalizeInput(rawTranscript)
    if (!normalizedTranscript) return

    // 1. Strip out exact intro & reminder TTS phrases without greedy wildcards
    const exactPhrasesToRemove = [
      "welcome to sensa a chrome extension assisting visual and auditory impaired users with specialized accessibility tools and features",
      "welcome to sensa",
      "chrome extension assisting",
      "assisting visual and auditory impaired users",
      "visual and auditory impaired",
      "specialized accessibility tools and features",
      "select your primary accessibility mode",
      "support low vision with voice navigation screen magnifier and guided reading",
      "support low vision",
      "with voice navigation",
      "screen magnifier and guided reading",
      "screen magnifier",
      "guided reading",
      "support hearing loss with multilingual captions audio visualizer and noise alerts",
      "support hearing loss",
      "with multilingual captions",
      "audio visualizer and noise alerts",
      "audio visualizer",
      "noise alerts",
      "you can say visual mode or auditory mode to choose a primary accessibility mode",
      "you can say visual mode or auditory mode",
      "to choose a primary accessibility mode",
      "primary accessibility mode"
    ]

    for (const phrase of exactPhrasesToRemove) {
      while (normalizedTranscript.includes(phrase)) {
        normalizedTranscript = normalizedTranscript.replace(phrase, " ")
      }
    }

    // 2. Also clean out compound TTS card headers when adjacent to support cues
    normalizedTranscript = normalizedTranscript
      .replace(/\b(?:visual\s+mode|vision\s+mode|visual|vision)\s+(?:support\s+low\s+vision|low\s+vision)\b/g, " ")
      .replace(/\b(?:auditory\s+mode|audio\s+mode|auditory|audio)\s+(?:support\s+hearing\s+loss|hearing\s+loss)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()

    if (!normalizedTranscript) {
      return
    }

    tabLog(`[Sensa Tab Voice Bridge] Cleaned transcript for scoring: "${normalizedTranscript}" (Raw: "${rawTranscript}")`)

    const count = (w: string) => {
      const regex = new RegExp(`\\b${w}\\b`, "g")
      return (normalizedTranscript.match(regex) || []).length
    }

    let visualScore = 0
    let auditoryScore = 0

    // Visual Mode Cues
    visualScore += count("visual mode") * 5
    visualScore += count("vision mode") * 5
    visualScore += count("visual mod") * 4
    visualScore += count("visual") * 4
    visualScore += count("vision") * 4
    visualScore += count("bisual") * 4
    visualScore += count("option one") * 5
    visualScore += count("option 1") * 5
    visualScore += count("first option") * 5
    visualScore += count("number one") * 5
    visualScore += count("number 1") * 5
    visualScore += count("first one") * 5

    if (visualScore === 0) {
      if (
        fuzzyMatch(normalizedTranscript, "visual mode", 2) ||
        fuzzyMatch(normalizedTranscript, "vision mode", 2) ||
        fuzzyMatch(normalizedTranscript, "option one", 2) ||
        fuzzyMatch(normalizedTranscript, "first option", 2)
      ) {
        visualScore += 4
      } else if (
        fuzzyMatch(normalizedTranscript, "visual", 1) ||
        fuzzyMatch(normalizedTranscript, "vision", 1) ||
        fuzzyMatch(normalizedTranscript, "bisual", 1)
      ) {
        visualScore += 3
      }
    }

    // Auditory Mode Cues
    auditoryScore += count("auditory mode") * 5
    auditoryScore += count("audio mode") * 5
    auditoryScore += count("sound mode") * 5
    auditoryScore += count("hearing mode") * 5
    auditoryScore += count("auditory") * 4
    auditoryScore += count("audio") * 4
    auditoryScore += count("hearing") * 4
    auditoryScore += count("auditor") * 4
    auditoryScore += count("auditori") * 4
    auditoryScore += count("option two") * 5
    auditoryScore += count("option 2") * 5
    auditoryScore += count("second option") * 5
    auditoryScore += count("number two") * 5
    auditoryScore += count("number 2") * 5
    auditoryScore += count("second one") * 5

    if (auditoryScore === 0) {
      if (
        fuzzyMatch(normalizedTranscript, "auditory mode", 2) ||
        fuzzyMatch(normalizedTranscript, "audio mode", 2) ||
        fuzzyMatch(normalizedTranscript, "sound mode", 2) ||
        fuzzyMatch(normalizedTranscript, "hearing mode", 2) ||
        fuzzyMatch(normalizedTranscript, "option two", 2) ||
        fuzzyMatch(normalizedTranscript, "second option", 2)
      ) {
        auditoryScore += 4
      } else if (
        fuzzyMatch(normalizedTranscript, "auditory", 1) ||
        fuzzyMatch(normalizedTranscript, "audio", 1) ||
        fuzzyMatch(normalizedTranscript, "auditor", 1) ||
        fuzzyMatch(normalizedTranscript, "auditori", 1) ||
        fuzzyMatch(normalizedTranscript, "hearing", 1)
      ) {
        auditoryScore += 3
      }
    }

    let chosenCommand: "visual" | "auditory" | null = null
    const threshold = 3

    if (visualScore >= threshold && visualScore > auditoryScore) {
      chosenCommand = "visual"
    } else if (auditoryScore >= threshold && auditoryScore > visualScore) {
      chosenCommand = "auditory"
    } else if (visualScore >= threshold && auditoryScore >= threshold) {
      // If both scored high (e.g., mixed speech tail), favor the most recently spoken keyword
      const words = normalizedTranscript.split(/\s+/)
      const tail = words.slice(-3).join(" ")
      const hasTailVisual = tail.includes("visual") || tail.includes("vision") || tail.includes("option one") || tail.includes("first")
      const hasTailAuditory = tail.includes("auditory") || tail.includes("audio") || tail.includes("hearing") || tail.includes("option two") || tail.includes("second")

      if (hasTailVisual && !hasTailAuditory) {
        chosenCommand = "visual"
      } else if (hasTailAuditory && !hasTailVisual) {
        chosenCommand = "auditory"
      }
    }

    if (chosenCommand) {
      tabLog(`[Sensa Mode Selection Tab Voice Bridge] Command detected: "${chosenCommand}". Applying immediately.`)
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

    isActive = false
    clearWatchdog()
    teardownRecognition()

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
      echoCancellation: false,
      autoGainControl: true,
      channelCount: 1,
      sampleRate: 48000
    }
  })
  stream.getTracks().forEach((track) => track.stop())
}

export async function startModeSelectionVoiceListener(): Promise<boolean> {
  if ((isActive && recognition) || isStarting) {
    return true
  }

  isStarting = true
  const SpeechRecognitionCtor = getSpeechRecognitionCtor()
  if (!SpeechRecognitionCtor) {
    tabLog("[Sensa Tab Voice Bridge] SpeechRecognition is NOT supported in this browser.", "warn")
    isStarting = false
    return false
  }

  // Clean up any old recognition internally without calling stopModeSelectionVoiceListener()
  // to avoid triggering external storage change hooks
  isActive = false
  commandApplied = false
  consumedString = ""
  currentResultIndex = 0
  recognitionRunning = false
  clearWatchdog()
  teardownRecognition()

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

  const instance = new SpeechRecognitionCtor()
  recognition = instance
  instance.continuous = true
  instance.interimResults = true
  instance.lang = "en-US"

  attachRecognitionHandlers(instance)
  startWatchdog()

  window.setTimeout(tryStart, 50)
  isStarting = false
  return true
}

export function stopModeSelectionVoiceListener() {
  if (!isActive && !recognition && !isStarting) {
    return
  }
  isStarting = false
  isActive = false
  commandApplied = false
  consumedString = ""
  currentResultIndex = 0
  recognitionRunning = false
  clearWatchdog()
  teardownRecognition()
}
