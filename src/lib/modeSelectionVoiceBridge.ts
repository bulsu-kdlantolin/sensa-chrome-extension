import { DEFAULT_PROFILE, type SensaUserProfile } from "./storage"

type ModeSelectionVoiceMode = "visual" | "auditory"

let recognition: SpeechRecognition | null = null
let isActive = false
let restartTimer: number | null = null
let ignoreSpeechUntil = 0
let consumedString = ""
let currentResultIndex = 0
let commandApplied = false

const getSpeechRecognitionCtor = () =>
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

export function isModeSelectionVoiceActive() {
  return isActive
}

const clearRestartTimer = () => {
  if (restartTimer !== null) {
    window.clearTimeout(restartTimer)
    restartTimer = null
  }
}

const tryStart = () => {
  if (!isActive || !recognition || commandApplied) return
  try {
    recognition.start()
  } catch {
    // "already started" — onend will restart if needed
  }
}

const scheduleRestart = () => {
  if (!isActive || commandApplied) return
  clearRestartTimer()
  restartTimer = window.setTimeout(tryStart, 300)
}

const normalizeTranscript = (text: string) =>
  text.toLowerCase().replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim()

const detectMode = (raw: string): ModeSelectionVoiceMode | null => {
  const text = normalizeTranscript(raw)
  if (!text) return null

  if (
    text.includes("auditory mode") ||
    text.includes("audio mode") ||
    /\bauditory\b/.test(text) ||
    /\bauditor\b/.test(text)
  ) {
    return "auditory"
  }

  if (
    text.includes("visual mode") ||
    text.includes("vision mode") ||
    /\bvisual\b/.test(text) ||
    /\bvisuals\b/.test(text)
  ) {
    return "visual"
  }

  return null
}

const applyModeSelection = (mode: ModeSelectionVoiceMode) => {
  if (commandApplied || Date.now() < ignoreSpeechUntil) return

  commandApplied = true
  ignoreSpeechUntil = Date.now() + 2000
  isActive = false
  teardownRecognition()

  chrome.storage.local.get(["sensa_user_profile", "sensa_mode_selection_listening"], (res) => {
    if (!res.sensa_mode_selection_listening) {
      commandApplied = false
      return
    }

    const profile = (res.sensa_user_profile as SensaUserProfile | undefined) ?? DEFAULT_PROFILE
    if (profile.globalSettings?.activeMode) {
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
    })
  })
}

const handleTranscript = (liveText: string) => {
  if (commandApplied || Date.now() < ignoreSpeechUntil) return

  const normalized = normalizeTranscript(liveText)
  if (!normalized) return

  let newSpeech = normalized
  if (normalized.startsWith(consumedString) && consumedString.length > 0) {
    newSpeech = normalized.slice(consumedString.length).trim()
  }

  const mode = detectMode(newSpeech) ?? detectMode(normalized)
  if (!mode) return

  consumedString = normalized
  applyModeSelection(mode)
}

const teardownRecognition = () => {
  clearRestartTimer()
  if (!recognition) return

  try {
    recognition.stop()
  } catch {}

  recognition.onresult = null
  recognition.onerror = null
  recognition.onend = null
  recognition.onstart = null
  recognition = null
}

const primeMicrophone = async () => {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  stream.getTracks().forEach((track) => track.stop())
}

export async function startModeSelectionVoiceListener(): Promise<boolean> {
  const SpeechRecognitionCtor = getSpeechRecognitionCtor()
  if (!SpeechRecognitionCtor) return false

  stopModeSelectionVoiceListener()

  try {
    await primeMicrophone()
  } catch {
    return false
  }

  isActive = true
  commandApplied = false
  consumedString = ""
  currentResultIndex = 0
  ignoreSpeechUntil = 0

  await new Promise<void>((resolve) => {
    chrome.storage.local.set({ sensa_mode_selection_listening: true }, () => resolve())
  })

  const instance = new SpeechRecognitionCtor()
  recognition = instance
  instance.continuous = true
  instance.interimResults = true
  instance.lang = "en-US"

  instance.onresult = (event: SpeechRecognitionEvent) => {
    if (commandApplied) return

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const chunk = normalizeTranscript(event.results[i][0].transcript)
      const chunkMode = detectMode(chunk)
      if (chunkMode) {
        applyModeSelection(chunkMode)
        return
      }
    }

    if (event.resultIndex !== currentResultIndex) {
      consumedString = ""
      currentResultIndex = event.resultIndex
    }

    let liveText = ""
    for (let i = event.resultIndex; i < event.results.length; i++) {
      liveText += event.results[i][0].transcript
    }

    handleTranscript(liveText)
  }

  instance.onerror = (event: SpeechRecognitionErrorEvent) => {
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      isActive = false
      teardownRecognition()
      chrome.storage.local.set({ sensa_mode_selection_listening: false })
      return
    }
    scheduleRestart()
  }

  instance.onend = () => scheduleRestart()

  tryStart()
  return true
}

export function stopModeSelectionVoiceListener() {
  isActive = false
  commandApplied = false
  consumedString = ""
  currentResultIndex = 0
  teardownRecognition()
  chrome.storage.local.set({ sensa_mode_selection_listening: false })
}
