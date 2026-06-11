let recognition: SpeechRecognition | null = null
let isActive = false
let restartTimer: number | null = null
let ignoreSpeechUntil = 0
let consumedString = ""
let currentResultIndex = 0
let commandApplied = false
let globalBuffer = ""
let isCurrentlyActive = false

const getSpeechRecognitionCtor = () =>
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

export function isVisualModeVoiceActive() {
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

const tryStart = () => {
  if (!isActive || !recognition) return
  try {
    recognition.start()
  } catch {
    // Already started
  }
}

const scheduleRestart = () => {
  if (!isActive) return
  clearRestartTimer()
  restartTimer = window.setTimeout(tryStart, 300)
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
  // Prevent cross-talk between activate and deactivate
  if (target === "activate" && text.includes("deactivate")) return false
  if (target === "deactivate" && text === "activate") return false

  if (text.includes(target)) return true

  const tokens = text.split(/\s+/).filter(Boolean)
  const targetTokens = target.split(/\s+/).filter(Boolean)

  if (targetTokens.length === 1) {
    for (const t of tokens) {
      if ((t === "activate" && target === "deactivate") || (t === "deactivate" && target === "activate")) {
        continue
      }
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
  text = text.replace(/\b(?:de|dee|the)\s+activate\b/g, "deactivate")
  text = text.replace(/\s+/g, " ").trim()
  const fillerWords = new Set(["the", "a", "please", "hey", "can", "you", "change", "set", "to", "my", "sincere", "sansa", "sensor", "sensia"])
  const tokens = text.split(" ").filter(t => !fillerWords.has(t))
  return tokens.join(" ")
}

const speakFeedbackInTab = (text: string) => {
  if (typeof window === "undefined" || !window.speechSynthesis || !window.SpeechSynthesisUtterance) {
    return
  }

  chrome.storage.local.get(["sensa_visual_voice_uri", "sensa_visual_voice_name", "sensa_visual_voice_guide_enabled"], (res) => {
    if (res.sensa_visual_voice_guide_enabled === false) {
      return
    }

    const voiceURI = typeof res.sensa_visual_voice_uri === "string" ? res.sensa_visual_voice_uri : ""
    const voiceName = typeof res.sensa_visual_voice_name === "string" ? res.sensa_visual_voice_name : ""

    const speak = (voices: SpeechSynthesisVoice[]) => {
      let preferredVoice = voices.find((v) => v.voiceURI === voiceURI)
      if (!preferredVoice && voiceName) {
        preferredVoice = voices.find((v) => v.name === voiceName || v.name?.includes(voiceName))
      }

      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      if (preferredVoice) {
        utterance.voice = preferredVoice
      }
      utterance.rate = 1
      utterance.pitch = 1
      utterance.volume = 1
      window.speechSynthesis.speak(utterance)
    }

    const existingVoices = window.speechSynthesis.getVoices()
    if (existingVoices.length > 0) {
      speak(existingVoices)
    } else {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null
        speak(window.speechSynthesis.getVoices())
      }
    }
  })
}

const applyCommand = (command: "activate" | "deactivate" | "auditory") => {
  if (commandApplied || Date.now() < ignoreSpeechUntil) return

  commandApplied = true
  ignoreSpeechUntil = Date.now() + 2500

  // Clear commandApplied block after the ignore duration.
  setTimeout(() => {
    commandApplied = false
  }, 2500)

  tabLog(`[Sensa Tab Voice Bridge] Applying visual mode command: ${command}`)

  if (command === "activate") {
    chrome.storage.local.set({
      sensa_visual_active: true,
      sensa_auditory_active: false
    }, () => {
      chrome.runtime.sendMessage({ type: "sensa-activate-mode", mode: "visual" })
      speakFeedbackInTab("Visual mode activated")
      tabLog("[Sensa Tab Voice Bridge] Visual mode activated via voice.")
    })
  } else if (command === "deactivate") {
    chrome.storage.local.set({
      sensa_visual_active: false
    }, () => {
      chrome.runtime.sendMessage({ type: "sensa-activate-mode", mode: null })
      speakFeedbackInTab("Visual mode deactivated")
      tabLog("[Sensa Tab Voice Bridge] Visual mode deactivated via voice.")
    })
  } else if (command === "auditory") {
    chrome.storage.local.set({
      sensa_auditory_active: true,
      sensa_visual_active: false,
      sensa_last_tab: "auditory"
    }, () => {
      chrome.runtime.sendMessage({ type: "sensa-activate-mode", mode: "auditory" })
      speakFeedbackInTab("Auditory mode activated")
      tabLog("[Sensa Tab Voice Bridge] Auditory mode activated via voice.")
    })
  }
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

const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
  if (changes.sensa_visual_active !== undefined) {
    isCurrentlyActive = !!changes.sensa_visual_active.newValue
  }
}

export async function startVisualModeVoiceListener(): Promise<boolean> {
  if (isActive && recognition) {
    return true
  }

  const SpeechRecognitionCtor = getSpeechRecognitionCtor()
  if (!SpeechRecognitionCtor) {
    tabLog("[Sensa Tab Voice Bridge] SpeechRecognition is NOT supported in this browser for visual mode.", "warn")
    return false
  }

  stopVisualModeVoiceListener()

  isActive = true
  commandApplied = false
  consumedString = ""
  currentResultIndex = 0
  ignoreSpeechUntil = 0
  globalBuffer = ""

  // Synchronously fetch and track current visual active state
  chrome.storage.local.get(["sensa_visual_active"], (res) => {
    isCurrentlyActive = !!res.sensa_visual_active
  })
  chrome.storage.onChanged.addListener(handleStorageChange)

  // Start priming in parallel so we don't block the SpeechRecognition initialization
  primeMicrophone().catch((e) => {
    tabLog(`[Sensa Tab Voice Bridge] Visual mode failed to acquire microphone permissions: ${e}`, "warn")
  })

  const instance = new SpeechRecognitionCtor()
  recognition = instance
  instance.continuous = true
  instance.interimResults = true
  instance.lang = "en-US"

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

    tabLog(`[Sensa Tab Voice Bridge] Heard transcript: "${normalizedTranscript}" (Raw: "${rawTranscript}")`)

    const words = normalizedTranscript.split(" ")
    const hasWord = (w: string) => words.includes(w)

    let activateScore = 0
    let deactivateScore = 0
    let auditoryScore = 0

    // Match activate cues (check exact words to avoid sub-string 'deactivate' match)
    if (
      normalizedTranscript.includes("visual mode") ||
      normalizedTranscript.includes("vision mode") ||
      hasWord("visual") ||
      hasWord("activate") ||
      hasWord("start")
    ) {
      activateScore += 5
    } else if (
      fuzzyMatch(normalizedTranscript, "visual mode", 2) ||
      fuzzyMatch(normalizedTranscript, "visual", 1) ||
      fuzzyMatch(normalizedTranscript, "activate", 1) ||
      fuzzyMatch(normalizedTranscript, "start", 1)
    ) {
      activateScore += 3
    }

    // Match deactivate cues
    if (
      normalizedTranscript.includes("deactivate visual mode") ||
      normalizedTranscript.includes("stop visual mode") ||
      normalizedTranscript.includes("turn off") ||
      hasWord("deactivate") ||
      hasWord("stop")
    ) {
      deactivateScore += 5
    } else if (
      fuzzyMatch(normalizedTranscript, "deactivate", 2) ||
      fuzzyMatch(normalizedTranscript, "stop", 1) ||
      fuzzyMatch(whitespaced(normalizedTranscript), "turn off", 1)
    ) {
      deactivateScore += 3
    }

    // Match auditory cues
    if (
      normalizedTranscript.includes("auditory mode") ||
      normalizedTranscript.includes("audio mode") ||
      hasWord("auditory")
    ) {
      auditoryScore += 5
    } else if (
      fuzzyMatch(normalizedTranscript, "auditory mode", 2) ||
      fuzzyMatch(normalizedTranscript, "auditory", 1) ||
      fuzzyMatch(normalizedTranscript, "audio mode", 2)
    ) {
      auditoryScore += 3
    }

    let chosenCommand: "activate" | "deactivate" | "auditory" | null = null

    if (auditoryScore >= 3 && auditoryScore > activateScore && auditoryScore > deactivateScore) {
      chosenCommand = "auditory"
    } else if (activateScore >= 3 && activateScore > deactivateScore) {
      if (!isCurrentlyActive) {
        chosenCommand = "activate"
      } else {
        chosenCommand = "deactivate"
      }
    } else if (deactivateScore >= 3 && deactivateScore > activateScore) {
      chosenCommand = "deactivate"
    }

    tabLog(`[Sensa Tab Voice Bridge] Score results -> Activate: ${activateScore}, Deactivate: ${deactivateScore}, Auditory: ${auditoryScore}, isCurrentlyActive: ${isCurrentlyActive}, chosenCommand: ${chosenCommand}`)

    if (chosenCommand) {
      globalBuffer = ""
      applyCommand(chosenCommand)
    }
  }

  instance.onerror = (event: SpeechRecognitionErrorEvent) => {
    tabLog(`[Sensa Tab Voice Bridge] Visual mode SpeechRecognition error in tab: ${event.error}`, "error")
    if (event.error === "not-allowed" || event.error === "service-not-allowed") {
      tabLog("[Sensa Tab Voice Bridge] Visual mode microphone access denied, stopping tab listener.", "warn")
      isActive = false
      teardownRecognition()
      chrome.storage.onChanged.removeListener(handleStorageChange)
      return
    }
    scheduleRestart()
  }

  instance.onend = () => {
    scheduleRestart()
  }

  window.setTimeout(tryStart, 150)
  return true
}

export function stopVisualModeVoiceListener() {
  if (!isActive && !recognition) {
    return
  }
  isActive = false
  commandApplied = false
  consumedString = ""
  currentResultIndex = 0
  teardownRecognition()
  chrome.storage.onChanged.removeListener(handleStorageChange)
}

function whitespaced(str: string): string {
  return " " + str + " ";
}
