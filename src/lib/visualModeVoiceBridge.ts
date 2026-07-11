/**
 * @file visualModeVoiceBridge.ts
 * @description Web Speech API (`SpeechRecognition`) bridge executed within host page content scripts to allow hands-free voice control over Visual Mode activation and deactivation.
 *
 * Architectural Overview:
 * 1. Continuous Command Monitoring:
 *    - Listens continuously for activation cues ("visual mode", "start") and deactivation cues ("deactivate visual mode", "stop", "turn off").
 *    - Synchronizes state changes with Chrome local storage (`sensa_visual_active` / `sensa_auditory_active`) and triggers TTS audio confirmations (`speakFeedbackInTab`).
 *
 * 2. Levenshtein Fuzzy Scoring:
 *    - Resolves vocal ambiguities and phonetic collisions between "activate" and "deactivate" using weighted word frequency scoring and N-gram distance checking.
 */

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

let visualRestartAttempts = 0

const scheduleRestart = () => {
  if (!isActive) return
  clearRestartTimer()
  const delay = Math.min(500 * Math.pow(2, visualRestartAttempts), 5000)
  visualRestartAttempts++
  restartTimer = window.setTimeout(tryStart, delay)
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
  text = text.replace(/\b(?:de|dee|the|to|do|you)\s+activate[d]?\b/g, "deactivate")
  text = text.replace(/\b(?:deactivated|deactivating|unactivate|disable|turn off|turn it off)\b/g, "deactivate")
  text = text.replace(/\b(?:activated|activating|reactivate|enable|turn on)\b/g, "activate")
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
  ignoreSpeechUntil = Date.now() + 1800

  // Clear commandApplied block after the ignore duration.
  setTimeout(() => {
    commandApplied = false
  }, 1800)

  tabLog(`[Sensa Tab Voice Bridge] Applying visual mode command: ${command}`)

  if (command === "activate") {
    chrome.storage.local.set({
      sensa_visual_active: true,
      sensa_visual_activated_via_voice: true,
      sensa_auditory_active: false,
      sensa_voice_command_active: false
    }, () => {
      chrome.runtime.sendMessage({ type: "sensa-activate-mode", mode: "visual" })
      speakFeedbackInTab("Visual mode activated")
      tabLog("[Sensa Tab Voice Bridge] Visual mode activated via voice.")
    })
  } else if (command === "deactivate") {
    chrome.storage.local.set({
      sensa_visual_active: false,
      sensa_voice_command_active: false
    }, () => {
      chrome.runtime.sendMessage({ type: "sensa-activate-mode", mode: null })
      speakFeedbackInTab("Visual mode deactivated")
      tabLog("[Sensa Tab Voice Bridge] Visual mode deactivated via voice.")
    })
  } else if (command === "auditory") {
    chrome.storage.local.set({
      sensa_auditory_active: true,
      sensa_visual_active: false,
      sensa_last_tab: "auditory",
      sensa_voice_command_active: false
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

const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
  if (changes.sensa_visual_active !== undefined) {
    const nextActive = !!changes.sensa_visual_active.newValue
    isCurrentlyActive = nextActive
  }
}

export async function startVisualModeVoiceListener(): Promise<boolean> {
  const isVisualActive = await new Promise<boolean>((resolve) => {
    chrome.storage.local.get(["sensa_visual_active"], (res) => {
      resolve(!!res.sensa_visual_active)
    })
  })
  isCurrentlyActive = isVisualActive

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
  let consumedKeywords: string[] = []
  currentResultIndex = 0
  ignoreSpeechUntil = 0
  globalBuffer = ""

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
      consumedKeywords = []
      consumedString = ""
      currentResultIndex = event.resultIndex
      globalBuffer = ""
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

    let cleanTranscript = normalizedTranscript
    if (consumedKeywords.length > 0) {
      consumedKeywords.forEach(kw => {
        const escapedKw = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        cleanTranscript = cleanTranscript.replace(new RegExp(`\\b${escapedKw}\\b`, "g"), " ")
      })
      cleanTranscript = cleanTranscript.replace(/\s+/g, " ").trim()
    }
    if (!cleanTranscript) return

    tabLog(`[Sensa Tab Voice Bridge] Heard transcript: "${cleanTranscript}" (Raw: "${rawTranscript}")`)

    const words = cleanTranscript.split(" ")
    const padded = ` ${cleanTranscript} `
    const check = (...cues: string[]) => cues.some(c => padded.includes(` ${c} `))

    const count = (w: string) => {
      const regex = new RegExp(`\\b${w}\\b`, "g")
      return (cleanTranscript.match(regex) || []).length
    }

    let activateScore = 0
    let deactivateScore = 0
    let auditoryScore = 0

    // Match activate cues
    activateScore += count("visual mode") * 5
    activateScore += count("vision mode") * 5
    activateScore += count("visual") * 3
    activateScore += count("activate") * 3
    activateScore += count("start") * 3

    if (check("activate", "start", "enable", "visual mode", "vision mode")) {
      activateScore += 6
    } else if (fuzzyMatch(cleanTranscript, "activate", 2) || fuzzyMatch(cleanTranscript, "visual mode", 2) || fuzzyMatch(cleanTranscript, "vision mode", 2)) {
      activateScore += 4
    }

    // Match deactivate cues
    deactivateScore += count("deactivate visual mode") * 5
    deactivateScore += count("stop visual mode") * 5
    deactivateScore += count("turn off") * 5
    deactivateScore += count("deactivate") * 3
    deactivateScore += count("stop") * 3

    if (check("deactivate", "stop", "disable", "turn off", "deactivate visual mode", "stop visual mode")) {
      deactivateScore += 6
    } else if (fuzzyMatch(cleanTranscript, "deactivate", 2) || fuzzyMatch(cleanTranscript, "deactivate visual mode", 2) || fuzzyMatch(cleanTranscript, "stop visual mode", 2)) {
      deactivateScore += 4
    }

    // Match auditory cues
    auditoryScore += count("auditory mode") * 5
    auditoryScore += count("audio mode") * 5
    auditoryScore += count("auditory") * 3

    if (check("auditory", "auditory mode", "audio mode")) {
      auditoryScore += 6
    } else if (fuzzyMatch(cleanTranscript, "auditory mode", 2) || fuzzyMatch(cleanTranscript, "audio mode", 2) || fuzzyMatch(cleanTranscript, "auditory", 1)) {
      auditoryScore += 4
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
    } else if (
      (activateScore >= 3 && deactivateScore >= 3) ||
      (activateScore >= 3 && auditoryScore >= 3) ||
      (deactivateScore >= 3 && auditoryScore >= 3)
    ) {
      tabLog(`[Sensa Tab Voice Bridge] Conflict detected (act: ${activateScore}, deact: ${deactivateScore}, aud: ${auditoryScore}). Clearing buffer.`)
      globalBuffer = ""
    }

    tabLog(`[Sensa Tab Voice Bridge] Score results -> Activate: ${activateScore}, Deactivate: ${deactivateScore}, Auditory: ${auditoryScore}, isCurrentlyActive: ${isCurrentlyActive}, chosenCommand: ${chosenCommand}`)

    if (chosenCommand) {
      globalBuffer = ""
      if (chosenCommand === "activate") {
        consumedKeywords.push("activate", "start", "enable", "turn", "on", "visual", "mode")
      } else if (chosenCommand === "deactivate") {
        consumedKeywords.push("deactivate", "stop", "disable", "turn", "off", "visual", "mode")
      } else if (chosenCommand === "auditory") {
        consumedKeywords.push("auditory", "audio", "mode")
      }
      applyCommand(chosenCommand)
    }
  }

  instance.onstart = () => {
    visualRestartAttempts = 0
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
    if (event.error === "aborted" || event.error === "no-speech") {
      // Let onend handle these with backoff
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