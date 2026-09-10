/**
 * @file ttsEchoFilter.ts
 * @description Live Rolling Echo Subtraction (TTS Self-Speech Filter).
 * Monitors browser Text-to-Speech (window.speechSynthesis) output in real time
 * and filters out computer-spoken words from incoming microphone SpeechRecognition streams.
 * Prevents Sensa from executing voice commands on itself when speakers are near the mic.
 */

interface EchoToken {
  word: string
  expires: number
}

// Map of command words to their phonetic variants and homophones
const COMMAND_HOMOPHONES: Record<string, string[]> = {
  previous: ["previous", "prev", "previ", "preevi", "preview", "previews", "review", "reviews", "preveous", "previus", "privious", "prevue", "prevues"],
  next: ["next", "skip", "forward", "necks", "neck", "nex", "nix"],
  stop: ["stop", "pause", "halt", "stahp", "paused", "shh", "quiet", "silence", "freeze", "cease"],
  play: ["play", "resume", "continue", "read", "reed", "reading", "start", "go", "speak", "begin"],
  restart: ["repeat", "restart", "start over", "reset", "refresh", "re start", "re-start", "replay", "rewind", "again"],
  speed: ["speed", "rate", "reading speed", "voice speed", "faster", "slower"],
  settings: ["setting", "settings", "options"],
  increase: ["increase", "faster", "speed up", "higher", "in crease", "in greece"],
  decrease: ["decrease", "slower", "slow down", "lower", "the grease", "degrees", "de grease", "the crease", "de crease"],
}

// Critical exit/close words that must NEVER be suppressed by the acoustic echo filter.
// Users must always be able to close overlays and modals without any delay or suppression.
const NEVER_ECHO_FILTER = new Set([
  "close", "closed", "clothes", "clos", "exit", "shut", "leave", "cancel", "dismiss", "back", "done", "finish"
])

// Reverse lookup: any variant points to its full cluster
const VARIANT_TO_CLUSTER: Map<string, string[]> = new Map()
for (const [, variants] of Object.entries(COMMAND_HOMOPHONES)) {
  for (const v of variants) {
    VARIANT_TO_CLUSTER.set(v.toLowerCase(), variants)
  }
}

class TTSEchoFilter {
  private activeTokens: EchoToken[] = []
  private isInstalled = false
  private readonly defaultEchoDurationMs = 1600 // Acoustic travel time + mic buffer + Chrome ML latency

  /**
   * Install the automatic SpeechSynthesis monkey-patch.
   * Intercepts all window.speechSynthesis.speak() calls in the current document context.
   */
  public install(): void {
    if (this.isInstalled || typeof window === "undefined" || !window.speechSynthesis) return
    this.isInstalled = true

    const originalSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis)
    const self = this

    window.speechSynthesis.speak = function (utterance: SpeechSynthesisUtterance) {
      self.registerUtterance(utterance)
      return originalSpeak(utterance)
    }
  }

  /**
   * Register an utterance to track its spoken words in real time.
   */
  public registerUtterance(utterance: SpeechSynthesisUtterance): void {
    if (!utterance || !utterance.text) return
    const fullText = utterance.text
    const self = this

    // If utterance is short (<= 14 words, typical for UI feedback or guide prompts),
    // register all its words upfront with an estimated duration based on rate + padding.
    const words = fullText
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)

    const isShortUtterance = words.length <= 14

    if (isShortUtterance) {
      const estimatedDuration = Math.max(1200, (words.length / (utterance.rate || 1.0)) * 400) + this.defaultEchoDurationMs
      const expires = Date.now() + estimatedDuration
      this.addWordsToEchoBuffer(words, expires)
    }

    // Attach boundary tracking for real-time word synchronization on longer text
    const originalBoundary = utterance.onboundary
    utterance.onboundary = (event: SpeechSynthesisEvent) => {
      if (event.name === "word" && typeof event.charIndex === "number") {
        const charIndex = event.charIndex
        const charLength = event.charLength || 6
        const spokenWord = fullText.slice(charIndex, charIndex + charLength).trim()
        if (spokenWord) {
          const cleanWord = spokenWord.toLowerCase().replace(/[^a-z0-9]/g, "")
          if (cleanWord) {
            self.addWordsToEchoBuffer([cleanWord], Date.now() + self.defaultEchoDurationMs)
          }
        }
      }
      if (originalBoundary) {
        originalBoundary.call(utterance, event)
      }
    }

    // On start, if it's longer text, also register the first 4 words immediately
    const originalStart = utterance.onstart
    utterance.onstart = (event: SpeechSynthesisEvent) => {
      if (!isShortUtterance) {
        const initialWords = words.slice(0, 4)
        self.addWordsToEchoBuffer(initialWords, Date.now() + self.defaultEchoDurationMs)
      }
      if (originalStart) {
        originalStart.call(utterance, event)
      }
    }
  }

  /**
   * Directly register spoken words with a custom expiration duration.
   */
  public registerSpokenWords(wordsOrText: string | string[], durationMs?: number): void {
    const tokens = (Array.isArray(wordsOrText) ? wordsOrText.join(" ") : wordsOrText)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)

    const expires = Date.now() + (durationMs ?? this.defaultEchoDurationMs)
    this.addWordsToEchoBuffer(tokens, expires)
  }

  private addWordsToEchoBuffer(words: string[], expires: number): void {
    for (const w of words) {
      const lower = w.toLowerCase().trim()
      if (!lower || lower.length < 2) continue
      if (NEVER_ECHO_FILTER.has(lower)) continue

      // Add the raw word
      this.activeTokens.push({ word: lower, expires })

      // Expand to homophones/cluster if this is a command word
      const cluster = VARIANT_TO_CLUSTER.get(lower)
      if (cluster) {
        for (const variant of cluster) {
          this.activeTokens.push({ word: variant, expires })
        }
      }
    }
  }

  /**
   * Filter an incoming SpeechRecognition transcript against the active TTS echo buffer.
   * Strips out words that were produced by the computer speakers within the last ~1600ms.
   */
  public filterTranscript(transcript: string): { cleanText: string; isEcho: boolean; droppedWords: string[] } {
    if (!transcript) return { cleanText: "", isEcho: false, droppedWords: [] }

    const now = Date.now()
    // Prune expired echo tokens
    this.activeTokens = this.activeTokens.filter(t => t.expires > now)

    if (this.activeTokens.length === 0) {
      return { cleanText: transcript.trim(), isEcho: false, droppedWords: [] }
    }

    let cleanText = transcript
    const droppedWords: string[] = []

    // Check unique active words
    const uniqueActiveWords = Array.from(new Set(this.activeTokens.map(t => t.word)))

    for (const word of uniqueActiveWords) {
      if (NEVER_ECHO_FILTER.has(word)) continue
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const wordRegex = new RegExp("\\b" + escaped + "\\b", "gi")
      if (wordRegex.test(cleanText)) {
        droppedWords.push(word)
        cleanText = cleanText.replace(wordRegex, " ")
      }
    }

    cleanText = cleanText.replace(/\s+/g, " ").trim()
    const isEcho = droppedWords.length > 0

    return { cleanText, isEcho, droppedWords }
  }

  /**
   * Checks whether a specific word or phrase is currently actively echoing.
   */
  public isEchoing(wordOrPhrase: string): boolean {
    const now = Date.now()
    this.activeTokens = this.activeTokens.filter(t => t.expires > now)
    const tokens = wordOrPhrase.toLowerCase().split(/\s+/).filter(Boolean)
    return tokens.some(tok => this.activeTokens.some(active => active.word === tok))
  }

  /**
   * Clear the active echo buffer.
   */
  public clear(): void {
    this.activeTokens = []
  }
}

export const ttsEchoFilter = new TTSEchoFilter()

// Auto-install on module evaluation if in browser environment
if (typeof window !== "undefined") {
  ttsEchoFilter.install()
}
