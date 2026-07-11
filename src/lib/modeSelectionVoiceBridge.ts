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
let commandApplied = false
let globalBuffer = ""
let watchdogTimer: number | null = null
let lastAudioTimestamp = 0
let recognitionRunning = false
let isStarting = false
let restartAttempts = 0

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

/**
 * Tear down the current SpeechRecognition instance completely.
 * After this, `recognition` is null and a fresh instance must be created.
 */
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
  ;(recognition as any).onaudioend = null
  ;(recognition as any).onsoundstart = null
  ;(recognition as any).onsoundend = null
  ;(recognition as any).onspeechstart = null
  ;(recognition as any).onspeechend = null
  recognition = null
}

/**
 * Build a brand-new SpeechRecognition instance and start it.
 * This avoids the Chrome bug where reusing a stopped instance causes
 * rapid "aborted" error loops (the red pulsing mic indicator).
 */
const buildAndStart = () => {
  if (!isActive || commandApplied) return

  const SpeechRecognitionCtor = getSpeechRecognitionCtor()
  if (!SpeechRecognitionCtor) return

  // Tear down old instance first
  teardownRecognition()

  const instance = new SpeechRecognitionCtor()
  recognition = instance
  instance.continuous = true
  instance.interimResults = true
  instance.lang = "en-US"

  attachRecognitionHandlers(instance)

  try {
    instance.start()
  } catch {
    // If start fails immediately, schedule another attempt
    scheduleRestart()
  }
}

/**
 * Schedule a restart with exponential backoff to prevent rapid-fire crash loops.
 * Backoff resets as soon as recognition successfully starts (onstart fires).
 */
const scheduleRestart = () => {
  if (!isActive || commandApplied) return
  clearRestartTimer()
  recognitionRunning = false

  // Exponential backoff: 300ms, 600ms, 1200ms, 2400ms, capped at 3000ms
  const delay = Math.min(300 * Math.pow(2, restartAttempts), 3000)
  restartAttempts++

  tabLog(`[Sensa Tab Voice Bridge] Scheduling restart in ${delay}ms (attempt ${restartAttempts})`)
  restartTimer = window.setTimeout(buildAndStart, delay)
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

    // ONLY restart if recognition is NOT running (it crashed or never started).
    // If recognitionRunning is true, Chrome still has the mic open — silence just
    // means no one is speaking, which is perfectly normal. Do NOT kill it.
    if (!recognitionRunning && silenceDuration > 15000) {
      tabLog(`[Sensa Tab Voice Bridge] Watchdog: recognition not running for ${silenceDuration}ms. Rebuilding...`, "warn")
      restartAttempts = 0
      buildAndStart()
    }
  }, 8000)
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

/**
 * Known TTS sentences spoken by the ModeSelection screen.
 * We strip these from the transcript so the mic picking up the computer's
 * own speakers doesn't trigger false commands.
 */
const TTS_SENTENCES = [
  "welcome to sensa",
  "a chrome extension assisting visual and auditory impaired users with specialized accessibility tools and features",
  "chrome extension assisting",
  "assisting visual and auditory impaired users",
  "visual and auditory impaired",
  "specialized accessibility tools and features",
  "select your primary accessibility mode",
  "visual mode support low vision with voice navigation screen magnifier and guided reading",
  "visual mode",
  "support low vision with voice navigation screen magnifier and guided reading",
  "support low vision",
  "with voice navigation",
  "screen magnifier and guided reading",
  "screen magnifier",
  "guided reading",
  "auditory mode support hearing loss with multilingual captions audio visualizer and noise alerts",
  "auditory mode",
  "support hearing loss with multilingual captions audio visualizer and noise alerts",
  "support hearing loss",
  "with multilingual captions",
  "audio visualizer and noise alerts",
  "audio visualizer",
  "noise alerts",
  "you can say visual mode or auditory mode to choose a primary accessibility mode",
  "you can say visual mode or auditory mode",
  "say visual mode or auditory mode",
  "to choose a primary accessibility mode",
  "primary accessibility mode"
]

/**
 * Words that only appear in TTS narration, never in a user's command.
 * If the transcript contains any of these, it's TTS echo — ignore it.
 */
const TTS_MARKER_WORDS = [
  "impaired", "assisting", "magnifier", "multilingual",
  "captions", "visualizer", "specialized", "accessibility",
  "navigation", "extension", "chrome extension"
]

const normalizeInput = (rawText: string): string => {
  let text = rawText.toLowerCase()
  text = text.replace(/[^a-z0-9\s]/gi, " ")
  text = text.replace(/\s+/g, " ").trim()
  const fillerWords = new Set(["the", "a", "please", "hey", "can", "you", "change", "set", "to", "my", "select", "choose", "sincere", "sansa", "sensor", "sensia"])
  const tokens = text.split(" ").filter(t => !fillerWords.has(t))
  return tokens.join(" ")
}

/**
 * Strip all known TTS sentences from the text, then check for TTS marker words.
 * Returns null if the text is purely TTS echo and should be ignored.
 */
const scrubTTS = (text: string): string | null => {
  let cleaned = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()

  // Strip TTS sentences (longest first to avoid partial matches leaving residue)
  for (const sentence of TTS_SENTENCES) {
    // Use a loop because the same sentence could appear multiple times
    let safety = 0
    while (cleaned.includes(sentence) && safety++ < 5) {
      cleaned = cleaned.replace(sentence, " ")
    }
  }

  cleaned = cleaned.replace(/\s+/g, " ").trim()

  // If any TTS marker words remain, this is still TTS echo
  for (const marker of TTS_MARKER_WORDS) {
    if (cleaned.includes(marker)) {
      return null
    }
  }

  return cleaned || null
}

const attachRecognitionHandlers = (instance: SpeechRecognition) => {
  instance.onstart = () => {
    recognitionRunning = true
    lastAudioTimestamp = Date.now()
    restartAttempts = 0 // Reset backoff on successful start
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
    if (commandApplied || Date.now() < ignoreSpeechUntil) {
      return
    }

    // Collect the transcript from this result event
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

    // Use ONLY the current speech chunk for scoring.
    // This avoids stale buffer content from TTS narration contaminating the score.
    const currentSpeech = (newFinals + interimChunk).trim()
    if (!currentSpeech) return

    // Scrub TTS narration from the current speech
    const scrubbedText = scrubTTS(currentSpeech)
    if (!scrubbedText) {
      // This chunk is purely TTS echo — ignore it silently
      return
    }

    const normalizedTranscript = normalizeInput(scrubbedText)
    if (!normalizedTranscript) return

    tabLog(`[Sensa Tab Voice Bridge] Scoring transcript: "${normalizedTranscript}" (Raw: "${currentSpeech}")`)

    // --- Scoring ---
    let visualScore = 0
    let auditoryScore = 0

    // Direct substring checks — instant detection on first interim chunk
    const has = (keyword: string) => normalizedTranscript.includes(keyword)

    // Visual Mode
    if (has("visual mode") || has("vision mode") || has("bisual mode")) {
      visualScore += 15
    } else if (has("visual") || has("vision") || has("bisual")) {
      visualScore += 8
    }
    if (has("option one") || has("option 1") || has("first option") || has("number one") || has("number 1") || has("first one")) {
      visualScore += 10
    }

    // Fuzzy fallback (only if no direct match)
    if (visualScore === 0) {
      if (
        fuzzyMatch(normalizedTranscript, "visual mode", 2) ||
        fuzzyMatch(normalizedTranscript, "vision mode", 2) ||
        fuzzyMatch(normalizedTranscript, "visual", 1) ||
        fuzzyMatch(normalizedTranscript, "vision", 1)
      ) {
        visualScore += 5
      }
    }

    // Auditory Mode
    if (has("auditory mode") || has("audio mode") || has("sound mode") || has("hearing mode")) {
      auditoryScore += 15
    } else if (has("auditory") || has("audio") || has("hearing") || has("sound mode")) {
      auditoryScore += 8
    }
    if (has("option two") || has("option 2") || has("second option") || has("number two") || has("number 2") || has("second one")) {
      auditoryScore += 10
    }

    // Fuzzy fallback
    if (auditoryScore === 0) {
      if (
        fuzzyMatch(normalizedTranscript, "auditory mode", 2) ||
        fuzzyMatch(normalizedTranscript, "audio mode", 2) ||
        fuzzyMatch(normalizedTranscript, "sound mode", 2) ||
        fuzzyMatch(normalizedTranscript, "auditory", 1) ||
        fuzzyMatch(normalizedTranscript, "audio", 1)
      ) {
        auditoryScore += 5
      }
    }

    // --- Decision ---
    let chosenCommand: "visual" | "auditory" | null = null
    const threshold = 5

    if (visualScore >= threshold && visualScore > auditoryScore) {
      chosenCommand = "visual"
    } else if (auditoryScore >= threshold && auditoryScore > visualScore) {
      chosenCommand = "auditory"
    } else if (visualScore >= threshold && auditoryScore >= threshold) {
      // Tie: pick whichever keyword appears last (most recently spoken)
      const lastVisualIdx = Math.max(
        normalizedTranscript.lastIndexOf("visual"),
        normalizedTranscript.lastIndexOf("vision"),
        normalizedTranscript.lastIndexOf("bisual")
      )
      const lastAuditoryIdx = Math.max(
        normalizedTranscript.lastIndexOf("auditory"),
        normalizedTranscript.lastIndexOf("audio"),
        normalizedTranscript.lastIndexOf("hearing")
      )

      if (lastVisualIdx > lastAuditoryIdx && lastVisualIdx !== -1) {
        chosenCommand = "visual"
      } else if (lastAuditoryIdx > lastVisualIdx && lastAuditoryIdx !== -1) {
        chosenCommand = "auditory"
      }
    }

    if (chosenCommand) {
      tabLog(`[Sensa Mode Selection Tab Voice Bridge] Command detected: "${chosenCommand}" (visualScore=${visualScore}, auditoryScore=${auditoryScore}). Applying immediately.`)
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

    if (event.error === "aborted") {
      // Chrome fires "aborted" when the recognition is interrupted. 
      // Don't restart immediately — let onend handle it with backoff.
      tabLog("[Sensa Tab Voice Bridge] Recognition aborted, waiting for onend.", "log")
      return
    }

    if (event.error === "no-speech") {
      tabLog("[Sensa Tab Voice Bridge] No speech detected, will restart via onend.", "log")
      return
    }

    // For other errors, schedule restart
    scheduleRestart()
  }

  instance.onend = () => {
    recognitionRunning = false
    tabLog("[Sensa Tab Voice Bridge] Recognition ended.")
    // Always rebuild with a fresh instance to avoid the Chrome reuse bug
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

  // Clean up any old recognition
  isActive = false
  commandApplied = false
  recognitionRunning = false
  restartAttempts = 0
  clearWatchdog()
  teardownRecognition()

  try {
    await primeMicrophone()
  } catch (e) {
    tabLog(`[Sensa Tab Voice Bridge] Failed to acquire microphone permissions in tab, trying to proceed anyway: ${e}`, "warn")
  }

  isActive = true
  commandApplied = false
  ignoreSpeechUntil = 0
  globalBuffer = ""
  recognitionRunning = false
  restartAttempts = 0

  startWatchdog()
  buildAndStart()

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
  recognitionRunning = false
  restartAttempts = 0
  clearWatchdog()
  teardownRecognition()
}
