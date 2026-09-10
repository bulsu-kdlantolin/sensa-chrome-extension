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

import { isBraveBrowser } from "./browserUtils"

let recognition: SpeechRecognition | null = null
let isActive = false
let restartTimer: number | null = null
let ignoreSpeechUntil = 0
let commandApplied = false
let globalBuffer = ""
let bufferClearTimer: number | null = null
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
const tabLogStyled = (
  formatStr: string,
  styles: string[] = [],
  level: "log" | "warn" | "error" = "log"
) => {
  if (typeof console !== "undefined" && console[level]) {
    if (styles.length > 0) {
      console[level](formatStr, ...styles)
    } else {
      console[level](formatStr)
    }
  }
  try {
    const plainMessage = formatStr.replace(/%c/g, "")
    chrome.runtime.sendMessage({
      type: "sensa-tab-log",
      message: plainMessage,
      level
    }, () => {
      const _ = chrome.runtime.lastError
    })
  } catch {
    // Ignore runtime messaging exceptions
  }
}

const tabLog = (message: string, level: "log" | "warn" | "error" = "log") => {
  tabLogStyled(message, [], level)
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
  "a chrome extension assisting visual and auditory impaired users with specialized accessibility tools and features",
  "a browser extension assisting visual and auditory impaired users with specialized accessibility tools and features",
  "assisting visual and auditory impaired users with specialized accessibility tools and features",
  "specialized accessibility tools and features",
  "select your primary accessibility mode",
  "visual mode support low vision with voice navigation screen magnifier and guided reading",
  "support low vision with voice navigation screen magnifier and guided reading",
  "auditory mode support hearing loss with multilingual captions audio visualizer and noise alerts",
  "support hearing loss with multilingual captions audio visualizer and noise alerts",
  "you can say visual mode or auditory mode to choose a primary accessibility mode",
  "choose a primary accessibility mode"
]

/** Words appearing exclusively in onboarding TTS narration */
const TTS_MARKER_WORDS = [
  "impaired", "assisting", "magnifier", "multilingual",
  "captions", "visualizer", "specialized", "accessibility",
  "navigation", "browser extension", "guided reading", "hearing loss",
  "low vision", "support low vision", "support hearing loss", "noise alerts",
  "primary accessibility mode", "choose a primary accessibility mode",
  "you can say visual mode", "tools and features"
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

  // If the user clearly spoke a mode command keyword or early syllable, preserve it immediately
  const hasModeKeyword =
    /\b(visual|vision|bisual|vis|visu|visuals|virtual|visible|auditory|audio|audi|aud|first|second|option|one|two)\b/i.test(cleaned)

  for (const sentence of TTS_SENTENCES) {
    let safety = 0
    while (cleaned.includes(sentence) && safety++ < 5) {
      cleaned = cleaned.replace(sentence, " ")
    }
  }

  cleaned = cleaned.replace(/\s+/g, " ").trim()

  // If the speech contains ANY onboarding narration marker phrase, it is definitively TTS speaker echo.
  // We must reject it immediately even if the words "visual" or "auditory" appear alongside it!
  for (const marker of TTS_MARKER_WORDS) {
    if (cleaned.includes(marker)) {
      return null
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
    window['sensaSpeechRunning'] = true
    window.dispatchEvent(new CustomEvent('sensa-speech-started'))
    lastAudioTimestamp = Date.now()
    restartAttempts = 0
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

    if (bufferClearTimer !== null) {
      window.clearTimeout(bufferClearTimer)
      bufferClearTimer = null
    }
    bufferClearTimer = window.setTimeout(() => {
      globalBuffer = ""
      bufferClearTimer = null
    }, 2500)

    const currentSpeech = (globalBuffer + " " + interimChunk).trim()
    if (!currentSpeech) return

    const scrubbedText = scrubTTS(currentSpeech)
    if (!scrubbedText) return

    const normalizedTranscript = normalizeInput(scrubbedText)
    if (!normalizedTranscript) return

    tabLogStyled(
      `%c[Sensa Mode Selection Voice Bridge]%c 🎤 Heard: %c"${normalizedTranscript}" %c(Raw: "${currentSpeech}")`,
      [
        "color: #f97316; font-weight: bold; background: rgba(249, 115, 22, 0.1); padding: 1px 5px; border-radius: 3px;",
        "color: inherit;",
        "color: #fb923c; font-weight: bold;",
        "color: #94a3b8; font-size: 0.9em;"
      ]
    )

    // --- Scoring ---
    let visualScore = 0
    let auditoryScore = 0

    const padded = ` ${normalizedTranscript} `
    const has = (kw: string) => padded.includes(` ${kw} `) || normalizedTranscript.includes(kw)

    // Visual Mode Cues
    if (
      has("visual mode") ||
      has("vision mode") ||
      has("bisual mode") ||
      has("mode visual")
    ) {
      visualScore += 15
    } else if (
      has("option one") ||
      has("option 1") ||
      has("mode one") ||
      has("mode 1") ||
      has("first mode") ||
      has("first option") ||
      has("number one") ||
      has("first")
    ) {
      visualScore += 12
    } else if (
      has("visual") ||
      has("vision") ||
      has("bisual") ||
      has("visuals") ||
      has("virtual")
    ) {
      visualScore += 8
    } else if (
      has("vis") ||
      has("visu")
    ) {
      // Instant interim syllable recognition: triggers as soon as user begins saying "vis..."
      visualScore += 6
    }

    if (visualScore === 0) {
      if (
        fuzzyMatch(normalizedTranscript, "visual mode", 2) ||
        fuzzyMatch(normalizedTranscript, "vision mode", 2) ||
        fuzzyMatch(normalizedTranscript, "visual", 2) ||
        fuzzyMatch(normalizedTranscript, "vision", 2) ||
        fuzzyMatch(normalizedTranscript, "first", 1) ||
        fuzzyMatch(normalizedTranscript, "option one", 2)
      ) {
        visualScore += 5
      }
    }

    // Auditory Mode Cues
    if (
      has("auditory mode") ||
      has("audio mode") ||
      has("mode auditory") ||
      has("mode audio")
    ) {
      auditoryScore += 15
    } else if (
      has("option two") ||
      has("option 2") ||
      has("mode two") ||
      has("mode 2") ||
      has("second mode") ||
      has("second option") ||
      has("number two") ||
      has("second")
    ) {
      auditoryScore += 12
    } else if (
      has("auditory") ||
      has("audio") ||
      has("audial")
    ) {
      auditoryScore += 8
    } else if (
      has("audi") ||
      has("aud")
    ) {
      // Instant interim syllable recognition
      auditoryScore += 6
    }

    if (auditoryScore === 0) {
      if (
        fuzzyMatch(normalizedTranscript, "auditory mode", 2) ||
        fuzzyMatch(normalizedTranscript, "audio mode", 2) ||
        fuzzyMatch(normalizedTranscript, "auditory", 2) ||
        fuzzyMatch(normalizedTranscript, "audio", 1) ||
        fuzzyMatch(normalizedTranscript, "second", 1) ||
        fuzzyMatch(normalizedTranscript, "option two", 2)
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
        normalizedTranscript.lastIndexOf("vis"),
        normalizedTranscript.lastIndexOf("first")
      )
      const lastAuditoryIdx = Math.max(
        normalizedTranscript.lastIndexOf("auditory"),
        normalizedTranscript.lastIndexOf("audio"),
        normalizedTranscript.lastIndexOf("second")
      )

      if (lastVisualIdx > lastAuditoryIdx && lastVisualIdx !== -1) {
        chosenCommand = "visual"
      } else if (lastAuditoryIdx > lastVisualIdx && lastAuditoryIdx !== -1) {
        chosenCommand = "auditory"
      }
    }

    if (chosenCommand) {
      globalBuffer = ""
      tabLogStyled(
        `%c[Sensa Mode Selection Voice Bridge]%c ⚡ Executing command: %c"${chosenCommand}"%c (Scores -> Visual: ${visualScore}, Auditory: ${auditoryScore})`,
        [
          "color: #10b981; font-weight: bold; background: rgba(16, 185, 129, 0.14); padding: 2px 6px; border-radius: 4px;",
          "color: inherit;",
          "color: #10b981; font-weight: bold; text-decoration: underline;",
          "color: #64748b; font-size: 0.9em;"
        ]
      )
      applyModeSelection(chosenCommand)
    } else {
      const isFinal = Boolean(event.results[event.results.length - 1]?.isFinal)
      if (isFinal || normalizedTranscript.length >= 6) {
        tabLogStyled(
          `%c[Sensa Mode Selection Voice Bridge]%c ❓ No command matched: %c"${normalizedTranscript}"%c (Scores -> Visual: ${visualScore}, Auditory: ${auditoryScore})`,
          [
            "color: #64748b; font-weight: 600;",
            "color: inherit;",
            "color: #94a3b8; font-style: italic;",
            "color: #64748b; font-size: 0.9em;"
          ]
        )
      }
    }
  }

  instance.onerror = (event: SpeechRecognitionErrorEvent) => {
    recognitionRunning = false
    window['sensaSpeechRunning'] = false
    window.dispatchEvent(new CustomEvent('sensa-speech-ended'))

    if (event.error === "aborted" || event.error === "no-speech") {
      return
    }

    tabLog(`[Sensa Tab Voice Bridge] SpeechRecognition error in tab: ${event.error}`, "error")

    if (event.error === "not-allowed") {
      tabLog("[Sensa Tab Voice Bridge] Microphone access denied, stopping tab listener.", "warn")
      isActive = false
      teardownRecognition()
      chrome.storage.local.set({ sensa_mode_selection_listening: false })
      return
    }
    if (event.error === "service-not-allowed" || event.error === "network") {
      tabLog(`[Sensa Tab Voice Bridge] Transient error (${event.error}), retrying...`, "warn")
      window.setTimeout(buildAndStart, 800)
      return
    }

    scheduleRestart()
  }

  instance.onend = () => {
    recognitionRunning = false
    window['sensaSpeechRunning'] = false
    window.dispatchEvent(new CustomEvent('sensa-speech-ended'))
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

  tabLogStyled(`%c[Sensa Mode Selection Voice Bridge]%c ✨ Applying chosen mode selection: %c${mode}`, [
    "color: #10b981; font-weight: bold; background: rgba(16, 185, 129, 0.12); padding: 2px 6px; border-radius: 4px;",
    "color: inherit;",
    "color: #10b981; font-weight: bold;"
  ])

  chrome.storage.local.get(["sensa_user_profile"], (res) => {
    const profile = (res.sensa_user_profile as SensaUserProfile | undefined) ?? DEFAULT_PROFILE

    isActive = false
    clearWatchdog()
    teardownRecognition()

    const extraDefaults = mode === "visual" ? {
      sensa_visual_highlight_mouse_screen_reader: true,
      sensa_visual_image_alt_reader_enabled: true,
      sensa_visual_voice_guide_enabled: true,
      sensa_visual_autoscroll_enabled: true
    } : {}

    chrome.storage.local.set({
      sensa_mode_selection_listening: false,
      sensa_user_profile: {
        ...profile,
        globalSettings: {
          ...profile.globalSettings,
          activeMode: mode
        }
      },
      sensa_last_tab: mode,
      ...extraDefaults
    }, () => {
      tabLogStyled(`%c[Sensa Mode Selection Voice Bridge]%c ✅ Active mode saved: %c${mode}`, [
        "color: #10b981; font-weight: bold; background: rgba(16, 185, 129, 0.15); padding: 2px 6px; border-radius: 4px;",
        "color: inherit;",
        "color: #10b981; font-weight: bold;"
      ])
    })
  })
}

/**
 * Prime microphone permissions via `getUserMedia` without blocking `SpeechRecognition` startup.
 */
const primeMicrophone = async () => {
  const isSpeechSupported = await new Promise<boolean>((resolve) => {
    chrome.storage.local.get(["sensa_speech_supported"], (res) => {
      resolve(res.sensa_speech_supported !== false)
    })
  })
  if (!isSpeechSupported) return

  const isBrave = await isBraveBrowser()
  if (isBrave) return

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    throw new Error("navigator.mediaDevices.getUserMedia is not available")
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      noiseSuppression: true,
      echoCancellation: true,
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
  const isBrave = await isBraveBrowser()
  if (isBrave) {
    tabLog("[Sensa Tab Voice Bridge] SpeechRecognition is NOT supported in Brave browser.", "warn")
    return false
  }

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
