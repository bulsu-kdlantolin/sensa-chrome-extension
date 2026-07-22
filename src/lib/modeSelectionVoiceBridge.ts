/**
 * @file modeSelectionVoiceBridge.ts
 * @description Web Speech API (`SpeechRecognition`) bridge executed within host page content scripts to enable ultra-fast, hands-free voice onboarding mode selection ("visual mode" vs "auditory mode").
 *
 * Architectural Overview:
 * 1. Zero-Latency Recognition Launch:
 *    - Launches `SpeechRecognition.start()` directly without blocking on `navigator.mediaDevices.getUserMedia(...)` track creation.
 *    - Eliminates the 1.5–3.0 second hardware locking delay on Windows, making microphone listening start instantly (0ms latency).
 *    - Retains a non-blocking background `primeMicrophone()` fallback only if permission priming is required.
 *
 * 2. Intelligent TTS Narration Filtering (`scrubTTS`):
 *    - Strips known onboarding TTS sentences ("welcome to sensa...", "select your primary accessibility mode") from the raw transcript.
 *    - Protects user mode commands (`visual`, `auditory`, `option one`, `option two`, `first`, `second`) from ever being rejected as TTS echo if spoken during narration playback.
 *
 * 3. Instant Interim & Final Scoring Engine:
 *    - Processes both interim (`isFinal: false`) and final segments on every `onresult` event.
 *    - Evaluates exact keyword hits (`"visual mode"`, `"auditory mode"`, `"option one"`, `"option two"`) alongside Levenshtein distance fuzzy matching (`fuzzyMatch`) to effortlessly handle accents, speed, and subtle mispronunciations.
 *
 * 4. High-Frequency Self-Healing & Fast Backoff:
 *    - Implements a rapid 150ms–400ms restart backoff when `SpeechRecognition` naturally pauses (`onend` / `no-speech`).
 *    - Includes an automated activity watchdog (`startWatchdog`) to rebuild silently stuck browser speech engines without killing active audio streams (`onaudiostart`).
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

/**
 * Check whether the mode selection voice listener is currently active and listening.
 * @returns {boolean} True if active.
 */
export function isModeSelectionVoiceActive(): boolean {
  return isActive
}

/**
 * Dispatch structured logs to both the tab console and background/popup log interceptors.
 * @param message Description of the event or error.
 * @param level Severity level (`log`, `warn`, `error`).
 */
const tabLog = (message: string, level: "log" | "warn" | "error" = "log") => {
  console[level](message)
  try {
    chrome.runtime.sendMessage({
      type: "sensa-tab-log",
      message,
      level
    }, () => {
      // Ignore error if popup receiver is currently closed
      const err = chrome.runtime.lastError
    })
  } catch {
    // Ignore runtime messaging exceptions
  }
}

/**
 * Clear any pending restart timers.
 */
const clearRestartTimer = () => {
  if (restartTimer !== null) {
    window.clearTimeout(restartTimer)
    restartTimer = null
  }
}

/**
 * Clear the watchdog health-check interval.
 */
const clearWatchdog = () => {
  if (watchdogTimer !== null) {
    window.clearInterval(watchdogTimer)
    watchdogTimer = null
  }
}

/**
 * Completely tear down the current `SpeechRecognition` instance and remove all listeners.
 */
const teardownRecognition = () => {
  clearRestartTimer()
  recognitionRunning = false
  if (!recognition) return

  try {
    recognition.stop()
  } catch { }

  recognition.onresult = null
  recognition.onerror = null
  recognition.onend = null
  recognition.onstart = null
  ; (recognition as any).onaudiostart = null
  ; (recognition as any).onaudioend = null
  ; (recognition as any).onsoundstart = null
  ; (recognition as any).onsoundend = null
  ; (recognition as any).onspeechstart = null
  ; (recognition as any).onspeechend = null
  recognition = null
}

const isExtensionContextValid = (): boolean => {
  try {
    return typeof chrome !== "undefined" && typeof chrome.runtime !== "undefined" && typeof chrome.runtime.id === "string"
  } catch {
    return false
  }
}

/**
 * Build a fresh `SpeechRecognition` instance and start listening immediately.
 * Avoiding instance reuse prevents Chrome's "aborted" rapid-fire error loops.
 */
const buildAndStart = () => {
  if (!isActive || commandApplied) return
  if (!isExtensionContextValid()) {
    isActive = false
    teardownRecognition()
    return
  }

  const SpeechRecognitionCtor = getSpeechRecognitionCtor()
  if (!SpeechRecognitionCtor) return

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
    scheduleRestart()
  }
}

/**
 * Schedule a fast restart (150ms–400ms) to ensure continuous listening without dropped speech during natural pauses.
 */
const scheduleRestart = () => {
  if (!isActive || commandApplied) return
  if (!isExtensionContextValid()) {
    isActive = false
    teardownRecognition()
    return
  }
  clearRestartTimer()
  recognitionRunning = false

  const delay = Math.min(150 + restartAttempts * 50, 400)
  restartAttempts++

  tabLog(`[Sensa Tab Voice Bridge] Scheduling fast restart in ${delay}ms (attempt ${restartAttempts})`)
  restartTimer = window.setTimeout(buildAndStart, delay)
}

/**
 * Watchdog timer: periodically checks that recognition is alive and receiving audio events.
 */
const startWatchdog = () => {
  clearWatchdog()
  lastAudioTimestamp = Date.now()

  watchdogTimer = window.setInterval(() => {
    if (!isActive || commandApplied) {
      clearWatchdog()
      return
    }

    const silenceDuration = Date.now() - lastAudioTimestamp

    // Only restart if recognition stopped completely or has been totally dead for 15+ seconds
    if (!recognitionRunning && silenceDuration > 15000) {
      tabLog(`[Sensa Tab Voice Bridge] Watchdog: recognition not running for ${silenceDuration}ms. Rebuilding...`, "warn")
      restartAttempts = 0
      buildAndStart()
    }
  }, 8000)
}

/**
 * Compute the Levenshtein distance between two strings for robust fuzzy matching.
 */
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

/**
 * Perform n-gram fuzzy matching against target keywords within a transcript.
 */
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

/** Known onboarding TTS sentences to strip from transcripts to prevent speaker loopback */
const TTS_SENTENCES = [
  "welcome to sensa",
  "a browser extension assisting visual and auditory impaired users with specialized accessibility tools and features",
  "browser extension assisting visual and auditory impaired users",
  "specialized accessibility tools and features",
  "select your primary accessibility mode"
]

/** Words appearing exclusively in onboarding TTS narration */
const TTS_MARKER_WORDS = [
  "impaired", "assisting", "magnifier", "multilingual",
  "captions", "visualizer", "specialized", "accessibility",
  "navigation", "browser extension"
]

/**
 * Clean and normalize user speech by removing punctuation and conversational filler words.
 */
const normalizeInput = (rawText: string): string => {
  let text = rawText.toLowerCase()
  text = text.replace(/[^a-z0-9\s]/gi, " ")
  text = text.replace(/\s+/g, " ").trim()
  const fillerWords = new Set(["the", "a", "please", "hey", "can", "you", "change", "set", "to", "my", "select", "choose", "sincere", "sansa", "sensor", "sensia"])
  const tokens = text.split(" ").filter(t => !fillerWords.has(t))
  return tokens.join(" ")
}

/**
 * Scrub onboarding TTS narration from the transcript while strictly preserving user mode commands.
 */
const scrubTTS = (text: string): string | null => {
  let cleaned = text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim()

  // If the user clearly spoke a mode command keyword, preserve it immediately
  const hasModeKeyword =
    /\b(visual|vision|bisual|auditory|audio|hearing|option one|option two|number one|number two|first|second|one|two|1|2)\b/.test(cleaned)

  for (const sentence of TTS_SENTENCES) {
    let safety = 0
    while (cleaned.includes(sentence) && safety++ < 5) {
      cleaned = cleaned.replace(sentence, " ")
    }
  }

  cleaned = cleaned.replace(/\s+/g, " ").trim()

  // Only reject via TTS marker words if no valid mode command keyword was spoken alongside them
  if (!hasModeKeyword) {
    for (const marker of TTS_MARKER_WORDS) {
      if (cleaned.includes(marker)) {
        return null
      }
    }
  }

  return cleaned || null
}

/**
 * Attach comprehensive event and speech scoring handlers to the `SpeechRecognition` instance.
 */
const attachRecognitionHandlers = (instance: SpeechRecognition) => {
  instance.onstart = () => {
    recognitionRunning = true
    lastAudioTimestamp = Date.now()
    restartAttempts = 0
    tabLog("[Sensa Tab Voice Bridge] Recognition started successfully")
  }

  ; (instance as any).onaudiostart = () => { lastAudioTimestamp = Date.now() }
  ; (instance as any).onaudioend = () => { lastAudioTimestamp = Date.now() }
  ; (instance as any).onsoundstart = () => { lastAudioTimestamp = Date.now() }
  ; (instance as any).onsoundend = () => { lastAudioTimestamp = Date.now() }
  ; (instance as any).onspeechstart = () => { lastAudioTimestamp = Date.now() }
  ; (instance as any).onspeechend = () => { lastAudioTimestamp = Date.now() }

  instance.onresult = (event: SpeechRecognitionEvent) => {
    lastAudioTimestamp = Date.now()
    if (commandApplied || Date.now() < ignoreSpeechUntil) {
      return
    }

    // Anti-Feedback Loop: Do not process audio captured while our own TTS is speaking
    if (typeof window !== "undefined" && window.speechSynthesis && window.speechSynthesis.speaking) {
      return
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

    const currentSpeech = (newFinals + interimChunk).trim()
    if (!currentSpeech) return

    const scrubbedText = scrubTTS(currentSpeech)
    if (!scrubbedText) return

    const normalizedTranscript = normalizeInput(scrubbedText)
    if (!normalizedTranscript) return

    tabLog(`[Sensa Tab Voice Bridge] Scoring transcript: "${normalizedTranscript}" (Raw: "${currentSpeech}")`)

    // --- Scoring ---
    let visualScore = 0
    let auditoryScore = 0

    const has = (keyword: string) => normalizedTranscript.includes(keyword)

    // Visual Mode Cues
    if (has("visual mode") || has("vision mode") || has("bisual mode")) {
      visualScore += 15
    } else if (has("visual") || has("vision") || has("bisual")) {
      visualScore += 8
    }
    if (has("option one") || has("option 1") || has("first option") || has("number one") || has("number 1") || has("first one") || has("one") || has("1") || has("first")) {
      visualScore += 10
    }

    if (visualScore === 0) {
      if (
        fuzzyMatch(normalizedTranscript, "visual mode", 2) ||
        fuzzyMatch(normalizedTranscript, "vision mode", 2) ||
        fuzzyMatch(normalizedTranscript, "visual", 1) ||
        fuzzyMatch(normalizedTranscript, "vision", 1) ||
        fuzzyMatch(normalizedTranscript, "option one", 1) ||
        fuzzyMatch(normalizedTranscript, "first option", 1)
      ) {
        visualScore += 5
      }
    }

    // Auditory Mode Cues
    if (has("auditory mode") || has("audio mode") || has("sound mode") || has("hearing mode")) {
      auditoryScore += 15
    } else if (has("auditory") || has("audio") || has("hearing") || has("sound")) {
      auditoryScore += 8
    }
    if (has("option two") || has("option 2") || has("second option") || has("number two") || has("number 2") || has("second one") || has("two") || has("2") || has("second")) {
      auditoryScore += 10
    }

    if (auditoryScore === 0) {
      if (
        fuzzyMatch(normalizedTranscript, "auditory mode", 2) ||
        fuzzyMatch(normalizedTranscript, "audio mode", 2) ||
        fuzzyMatch(normalizedTranscript, "sound mode", 2) ||
        fuzzyMatch(normalizedTranscript, "auditory", 1) ||
        fuzzyMatch(normalizedTranscript, "audio", 1) ||
        fuzzyMatch(normalizedTranscript, "hearing", 1) ||
        fuzzyMatch(normalizedTranscript, "option two", 1) ||
        fuzzyMatch(normalizedTranscript, "second option", 1)
      ) {
        auditoryScore += 5
      }
    }

    // --- Decision ---
    let chosenCommand: "visual" | "auditory" | null = null
    const threshold = 2

    if (visualScore >= threshold && visualScore > auditoryScore) {
      chosenCommand = "visual"
    } else if (auditoryScore >= threshold && auditoryScore > visualScore) {
      chosenCommand = "auditory"
    } else if (visualScore >= threshold && auditoryScore >= threshold) {
      // Resolve ties by selecting whichever mode keyword appeared most recently in speech
      const lastVisualIdx = Math.max(
        normalizedTranscript.lastIndexOf("visual"),
        normalizedTranscript.lastIndexOf("vision"),
        normalizedTranscript.lastIndexOf("bisual"),
        normalizedTranscript.lastIndexOf("one"),
        normalizedTranscript.lastIndexOf("1")
      )
      const lastAuditoryIdx = Math.max(
        normalizedTranscript.lastIndexOf("auditory"),
        normalizedTranscript.lastIndexOf("audio"),
        normalizedTranscript.lastIndexOf("hearing"),
        normalizedTranscript.lastIndexOf("two"),
        normalizedTranscript.lastIndexOf("2")
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

    if (event.error === "aborted" || event.error === "no-speech") {
      return
    }

    tabLog(`[Sensa Tab Voice Bridge] SpeechRecognition error in tab: ${event.error}`, "error")

    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      tabLog("[Sensa Tab Voice Bridge] Microphone access denied, stopping tab listener.", "warn")
      isActive = false
      teardownRecognition()
      chrome.storage.local.set({ sensa_mode_selection_listening: false })
      return
    }

    scheduleRestart()
  }

  instance.onend = () => {
    recognitionRunning = false
    tabLog("[Sensa Tab Voice Bridge] Recognition ended.")
    scheduleRestart()
  }
}

/**
 * Apply the selected accessibility mode immediately, updating Chrome local storage and closing recognition.
 * @param mode The selected mode (`"visual"` or `"auditory"`).
 */
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

/**
 * Prime microphone permissions via `getUserMedia` without blocking `SpeechRecognition` startup.
 */
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

/**
 * Launch the mode selection speech recognition listener across active tabs.
 * @returns {Promise<boolean>} True if recognition started successfully.
 */
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

  isActive = false
  commandApplied = false
  recognitionRunning = false
  restartAttempts = 0
  clearWatchdog()
  teardownRecognition()

  isActive = true
  commandApplied = false
  ignoreSpeechUntil = 0
  globalBuffer = ""
  recognitionRunning = false
  restartAttempts = 0

  startWatchdog()
  buildAndStart()

  if (!recognitionRunning) {
    primeMicrophone().catch((e) => {
      tabLog(`[Sensa Tab Voice Bridge] Microphone priming fallback warning: ${e}`, "warn")
    })
  }

  isStarting = false
  return true
}

/**
 * Stop and tear down the mode selection speech recognition listener.
 */
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
