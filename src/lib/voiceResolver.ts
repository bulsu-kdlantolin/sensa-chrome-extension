/**
 * @file voiceResolver.ts
 * @description Centralized TTS Voice Resolution Engine for Sensa.
 * 
 * Ensures that whatever voice is selected in the Settings Voice Selection
 * is the single, authoritative voice used across:
 * - UI hover and button click announcements
 * - Voice command confirmations
 * - Settings guides and modal speech
 * - Mouse highlight screen reader
 * - Image alt-text reader
 * - Main web-page screen reader
 */

let cachedVoiceURI: string = ""
let cachedVoiceName: string = ""
let isStorageInitialized = false

// Initialize cache from chrome.storage.local immediately
if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
  chrome.storage.local.get(["sensa_visual_voice_uri", "sensa_visual_voice_name"], (res) => {
    if (typeof res?.sensa_visual_voice_uri === "string") {
      cachedVoiceURI = res.sensa_visual_voice_uri
    }
    if (typeof res?.sensa_visual_voice_name === "string") {
      cachedVoiceName = res.sensa_visual_voice_name
    }
    isStorageInitialized = true
  })

  // Keep in-memory cache synchronized with storage updates
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return
    if (changes.sensa_visual_voice_uri && typeof changes.sensa_visual_voice_uri.newValue === "string") {
      cachedVoiceURI = changes.sensa_visual_voice_uri.newValue
    }
    if (changes.sensa_visual_voice_name && typeof changes.sensa_visual_voice_name.newValue === "string") {
      cachedVoiceName = changes.sensa_visual_voice_name.newValue
    }
  })
}

/**
 * Returns the currently cached voice URI and name.
 */
export function getSelectedVoicePreference(): { uri: string; name: string } {
  return { uri: cachedVoiceURI, name: cachedVoiceName }
}

/**
 * Updates the selected voice synchronously in-memory and asynchronously in chrome.storage.local.
 * This guarantees that any speech utterance triggered in the same call-stack immediately uses the new voice.
 */
export function updateSelectedVoice(voiceURI: string, voiceName: string = ""): void {
  cachedVoiceURI = voiceURI
  cachedVoiceName = voiceName

  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({
      sensa_visual_voice_uri: voiceURI,
      sensa_visual_voice_name: voiceName
    }).catch(() => {})
  }
}

/**
 * Simplifies technical or localized voice names for clean, friendly speech and UI display.
 */
export function simplifyVoiceName(name: string): string {
  let simplified = name
  simplified = simplified.replace(/Deutsch/gi, "German")
  simplified = simplified.replace(/français/gi, "French")
  simplified = simplified.replace(/português do brasil/gi, "Portuguese")
  simplified = simplified.replace(/português/gi, "Portuguese")
  simplified = simplified.replace(/español.*españa.*/gi, "Spanish Male")
  simplified = simplified.replace(/español.*estados unidos.*/gi, "Spanish Female")
  simplified = simplified.replace(/español/gi, "Spanish")
  simplified = simplified.replace(/italiano/gi, "Italian")
  simplified = simplified.replace(/nederlands/gi, "Dutch")
  simplified = simplified.replace(/Nederland/gi, "")
  simplified = simplified.replace(/polski/gi, "Polish")
  simplified = simplified.replace(/русский/gi, "Russian")
  simplified = simplified.replace(/普通话.*中国大陆.*/gi, "Mainland Mandarin")
  simplified = simplified.replace(/普通话/gi, "Mandarin")
  simplified = simplified.replace(/[粵粤]語.*香港.*/gi, "Cantonese")
  simplified = simplified.replace(/[粵粤]語/gi, "Cantonese")
  simplified = simplified.replace(/國語.*臺灣.*/gi, "Taiwanese Mandarin")
  simplified = simplified.replace(/國語.*台湾.*/gi, "Taiwanese Mandarin")
  simplified = simplified.replace(/國語/gi, "Taiwanese Mandarin")
  simplified = simplified.replace(/国语/gi, "Taiwanese Mandarin")
  simplified = simplified.replace(/中文.*香港.*/gi, "Cantonese")
  simplified = simplified.replace(/中文.*台灣.*/gi, "Taiwanese Mandarin")
  simplified = simplified.replace(/中文.*台湾.*/gi, "Taiwanese Mandarin")
  simplified = simplified.replace(/中文.*中国.*/gi, "Mainland Mandarin")
  simplified = simplified.replace(/中文/gi, "Chinese")
  simplified = simplified.replace(/日本語/gi, "Japanese")
  simplified = simplified.replace(/한국어/gi, "Korean")
  simplified = simplified.replace(/hanguge/gi, "Korean")
  simplified = simplified.replace(/한국의/gi, "Korean")
  simplified = simplified.replace(/हिन्दी/gi, "Hindi")
  simplified = simplified.replace(/suomi/gi, "Finnish")
  simplified = simplified.replace(/svenska/gi, "Swedish")
  simplified = simplified.replace(/dansk/gi, "Danish")
  simplified = simplified.replace(/norsk/gi, "Norwegian")

  simplified = simplified.replace(/ - English \([^)]+\)/i, "")
  simplified = simplified.replace(/ English \([^)]+\)/i, "")
  simplified = simplified.replace(/ \([a-z]{2}-[A-Z]{2}\)/i, "")
  simplified = simplified.replace(/ Desktop/i, "")
  simplified = simplified.replace(/[\(\)]/g, "")
  simplified = simplified.replace(/\s+/g, " ")

  simplified = simplified.replace(/Google Taiwanese Mandarin/gi, "Google Taiwanese")
  simplified = simplified.replace(/Google Mainland Mandarin/gi, "Google Mandarin")
  simplified = simplified.replace(/Google Bahasa Indonesia/gi, "Google Indonesia")

  return simplified.trim() || name
}

/**
 * Resolves the single authoritative SpeechSynthesisVoice object from a list of voices.
 * 
 * Precedence:
 * 1. Exact match on stored voiceURI.
 * 2. Exact match on stored voice name.
 * 3. Case-insensitive substring match on stored voice name.
 * 4. Default fallback (only if no explicit voice preference exists, or chosen voice is missing):
 *    - Google US English (if available)
 *    - Any English voice (excluding Microsoft David if possible)
 *    - First available voice
 */
export function resolveVoice(
  voices: SpeechSynthesisVoice[],
  overrideURI?: string,
  overrideName?: string
): SpeechSynthesisVoice | undefined {
  if (!voices || voices.length === 0) return undefined

  const targetURI = overrideURI !== undefined ? overrideURI : cachedVoiceURI
  const targetName = overrideName !== undefined ? overrideName : cachedVoiceName

  // 1. Match by URI
  if (targetURI) {
    const matchedByURI = voices.find((v) => v.voiceURI === targetURI)
    if (matchedByURI) return matchedByURI
  }

  // 2. Match by exact Name
  if (targetName) {
    const matchedByName = voices.find((v) => v.name === targetName)
    if (matchedByName) return matchedByName

    // 3. Match by partial / case-insensitive Name
    const cleanTargetName = targetName.toLowerCase().trim()
    const matchedByPartial = voices.find((v) => {
      const vName = v.name.toLowerCase()
      return vName.includes(cleanTargetName) || cleanTargetName.includes(vName)
    })
    if (matchedByPartial) return matchedByPartial
  }

  // 4. Fallback: Only if user hasn't set an explicit preference, or chosen voice is truly missing
  const googleDefault = voices.find((v) => v.name.includes("Google US English"))
  if (googleDefault) return googleDefault

  const englishNonDavid = voices.find((v) => (v.lang === "en-US" || v.lang.startsWith("en")) && !v.name.includes("David"))
  if (englishNonDavid) return englishNonDavid

  const anyEnglish = voices.find((v) => v.lang === "en-US" || v.lang.startsWith("en"))
  if (anyEnglish) return anyEnglish

  return voices[0]
}

/**
 * Convenience helper to speak a phrase using the single resolved user voice.
 */
export function speakWithUserVoice(
  text: string,
  options?: {
    rate?: number
    pitch?: number
    volume?: number
    cancelPrevious?: boolean
    onEnd?: () => void
    onError?: () => void
    preferredVoice?: SpeechSynthesisVoice
  }
): boolean {
  if (typeof window === "undefined" || !window.speechSynthesis || !window.SpeechSynthesisUtterance) {
    return false
  }

  const trimmed = text.trim()
  if (!trimmed) return false

  const executeSpeak = (voices: SpeechSynthesisVoice[]) => {
    try {
      window.speechSynthesis.resume()
      if (options?.cancelPrevious !== false) {
        window.speechSynthesis.cancel()
      }

      const utterance = new SpeechSynthesisUtterance(trimmed)
      const chosenVoice = options?.preferredVoice || resolveVoice(voices)

      if (chosenVoice) {
        utterance.voice = chosenVoice
        utterance.lang = chosenVoice.lang
      }

      utterance.rate = options?.rate ?? 1.0
      utterance.pitch = options?.pitch ?? 1.0
      utterance.volume = options?.volume ?? 1.0

      if (options?.onEnd) utterance.onend = options.onEnd
      if (options?.onError) utterance.onerror = options.onError

      window.speechSynthesis.speak(utterance)
      return true
    } catch {
      return false
    }
  }

  const voices = window.speechSynthesis.getVoices()
  if (voices.length > 0) {
    return executeSpeak(voices)
  }

  const handleVoices = () => {
    window.speechSynthesis.removeEventListener("voiceschanged", handleVoices)
    executeSpeak(window.speechSynthesis.getVoices())
  }
  window.speechSynthesis.addEventListener("voiceschanged", handleVoices)
  return true
}

