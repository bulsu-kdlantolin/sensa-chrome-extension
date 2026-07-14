/**
 * @file welcomeVoiceBridge.ts
 * @description Web Speech API (`SpeechRecognition`) bridge executed within host page content scripts to enable hands-free voice confirmation on the initial extension welcome screen.
 *
 * Architectural Overview:
 * 1. Onboarding Confirmation Monitoring:
 *    - Listens for a broad vocabulary of affirmative entry phrases ("get started", "proceed", "enter", "start", "okay", "yes", "confirm").
 *    - Synchronizes state changes with Chrome local storage (`sensa_welcome_proceed_trigger`) to advance the user to the mode selection screen.
 *
 * 2. Phonetic Collision Recovery:
 *    - Implements Levenshtein distance matching to handle common speech-to-text transcription errors (e.g., "inter" or "center" instead of "enter", "entire" instead of "entry").
 */

import { DEFAULT_PROFILE, type SensaUserProfile } from "./storage"

let recognition: SpeechRecognition | null = null
let isActive = false
let restartTimer: number | null = null
let ignoreSpeechUntil = 0
let consumedString = ""
let currentResultIndex = 0
let commandApplied = false
let globalBuffer = ""

const getSpeechRecognitionCtor = () =>
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

export function isWelcomeVoiceActive() {
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

const buildAndStart = () => {
  if (!isActive) return
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

let welcomeRestartAttempts = 0

const scheduleRestart = () => {
  if (!isActive || commandApplied) return
  clearRestartTimer()
  const delay = Math.min(500 * Math.pow(2, welcomeRestartAttempts), 5000)
  welcomeRestartAttempts++
  restartTimer = window.setTimeout(buildAndStart, delay)
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
  const fillerWords = new Set(["the", "a", "please", "hey", "can", "you", "change", "set", "to", "my", "sincere", "sansa", "sensor", "sensia"])
  const tokens = text.split(" ").filter(t => !fillerWords.has(t))
  return tokens.join(" ")
}

const applyWelcomeProceed = () => {
  if (commandApplied || Date.now() < ignoreSpeechUntil) return

  commandApplied = true
  ignoreSpeechUntil = Date.now() + 2000
  isActive = false
  teardownRecognition()

  tabLog("[Sensa Tab Voice Bridge] Applying welcome proceed voice command")

  chrome.storage.local.set({
    sensa_welcome_proceed_trigger: true
  }, () => {
    tabLog("[Sensa Tab Voice Bridge] Welcome proceed storage trigger updated.")
  })
}

const teardownRecognition = () => {
  clearRestartTimer()
  if (!recognition) return

  try {
    recognition.stop()
  } catch { }

  recognition.onresult = null
  recognition.onerror = null
  recognition.onend = null
  recognition.onstart = null
  recognition = null
}

const primeMicrophone = async () => {
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

const attachRecognitionHandlers = (instance: SpeechRecognition) => {
  instance.onresult = (event: SpeechRecognitionEvent) => {
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

    tabLog(`[Sensa Welcome Tab Voice Bridge] Heard transcript: "${normalizedTranscript}" (Raw: "${rawTranscript}")`)

    // Score "Enter / Proceed / Start / Go / Get Started"
    let proceedScore = 0

    // Phrases that direct proceed
    if (
      normalizedTranscript.includes("enter") ||
      normalizedTranscript.includes("proceed") ||
      normalizedTranscript.includes("get started") ||
      normalizedTranscript.includes("start") ||
      normalizedTranscript.includes("go") ||
      normalizedTranscript.includes("inter") ||
      normalizedTranscript.includes("center") ||
      normalizedTranscript.includes("okay") ||
      normalizedTranscript.includes("yes") ||
      normalizedTranscript.includes("confirm") ||
      normalizedTranscript.includes("next") ||
      normalizedTranscript.includes("select") ||
      normalizedTranscript.includes("click") ||
      normalizedTranscript.includes("press") ||
      normalizedTranscript.includes("activate") ||
      normalizedTranscript.includes("open") ||
      normalizedTranscript.includes("begin") ||
      normalizedTranscript.includes("entry") ||
      normalizedTranscript.includes("entire") ||
      normalizedTranscript.includes("into") ||
      normalizedTranscript.includes("go ahead") ||
      normalizedTranscript.includes("turn on") ||
      normalizedTranscript.includes("visual mode") ||
      normalizedTranscript.includes("auditory mode") ||
      normalizedTranscript.includes("audio mode")
    ) {
      proceedScore += 5
    } else if (
      fuzzyMatch(normalizedTranscript, "enter", 1) ||
      fuzzyMatch(normalizedTranscript, "proceed", 2) ||
      fuzzyMatch(normalizedTranscript, "get started", 2) ||
      fuzzyMatch(normalizedTranscript, "start", 1) ||
      fuzzyMatch(normalizedTranscript, "go", 0) ||
      fuzzyMatch(normalizedTranscript, "inter", 1) ||
      fuzzyMatch(normalizedTranscript, "center", 1) ||
      fuzzyMatch(normalizedTranscript, "okay", 1) ||
      fuzzyMatch(normalizedTranscript, "yes", 1) ||
      fuzzyMatch(normalizedTranscript, "confirm", 1) ||
      fuzzyMatch(normalizedTranscript, "next", 1) ||
      fuzzyMatch(normalizedTranscript, "select", 1) ||
      fuzzyMatch(normalizedTranscript, "click", 1) ||
      fuzzyMatch(normalizedTranscript, "press", 1) ||
      fuzzyMatch(normalizedTranscript, "activate", 1) ||
      fuzzyMatch(normalizedTranscript, "open", 1) ||
      fuzzyMatch(normalizedTranscript, "begin", 1) ||
      fuzzyMatch(normalizedTranscript, "entry", 1) ||
      fuzzyMatch(normalizedTranscript, "entire", 1) ||
      fuzzyMatch(normalizedTranscript, "into", 1) ||
      fuzzyMatch(normalizedTranscript, "go ahead", 1) ||
      fuzzyMatch(normalizedTranscript, "turn on", 1)
    ) {
      proceedScore += 3
    }


    tabLog(`[Sensa Welcome Tab Voice Bridge] proceedScore: ${proceedScore}`)

    if (proceedScore >= 3) {
      globalBuffer = ""
      applyWelcomeProceed()
    }
  }

  instance.onstart = () => {
    welcomeRestartAttempts = 0
  }

  instance.onerror = (event: SpeechRecognitionErrorEvent) => {
    if (event.error === "aborted" || event.error === "no-speech") {
      return
    }
    tabLog(`[Sensa Tab Voice Bridge] Welcome SpeechRecognition error in tab: ${event.error}`, "error")
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      tabLog("[Sensa Tab Voice Bridge] Welcome microphone access denied, stopping tab listener.", "warn")
      isActive = false
      teardownRecognition()
      return
    }
    scheduleRestart()
  }

  instance.onend = () => {
    scheduleRestart()
  }
}

export async function startWelcomeVoiceListener(): Promise<boolean> {
  if (isActive && recognition) {
    return true
  }

  const SpeechRecognitionCtor = getSpeechRecognitionCtor()
  if (!SpeechRecognitionCtor) {
    tabLog("[Sensa Tab Voice Bridge] SpeechRecognition is NOT supported in this browser for welcome.", "warn")
    return false
  }

  stopWelcomeVoiceListener()

  try {
    await primeMicrophone()
  } catch (e) {
    tabLog(`[Sensa Tab Voice Bridge] Welcome failed to acquire microphone permissions in tab, trying to proceed anyway: ${e}`, "warn")
  }

  isActive = true
  commandApplied = false
  consumedString = ""
  currentResultIndex = 0
  ignoreSpeechUntil = 0
  globalBuffer = ""

  buildAndStart()
  return true
}

export function stopWelcomeVoiceListener() {
  if (!isActive && !recognition) {
    return
  }
  isActive = false
  commandApplied = false
  consumedString = ""
  currentResultIndex = 0
  teardownRecognition()
}
