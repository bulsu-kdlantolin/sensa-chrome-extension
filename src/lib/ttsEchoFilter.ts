/**
 * @file ttsEchoFilter.ts
 * @description Live Rolling Echo Subtraction & Lookahead Screen Reader Filter (TTS Self-Speech Filter).
 * Monitors browser Text-to-Speech (window.speechSynthesis) output in real time
 * and filters out computer-spoken words from incoming microphone SpeechRecognition streams.
 * Prevents Sensa from executing voice commands on itself when speakers are near the mic.
 */

interface EchoToken {
  word: string
  expires: number
}

interface WordOffset {
  word: string
  startChar: number
  endChar: number
}

interface ActiveArticleSegment {
  rawText: string
  normalizedText: string
  words: string[]
  wordOffsets: WordOffset[]
  rate: number
  startTime: number
  msPerWord: number
  activeWordIndex: number
  lastBoundaryTime: number
  activeUntil: number
}

// Map of command words to their phonetic variants, synonyms, homophones, and fallback keywords
const COMMAND_HOMOPHONES: Record<string, string[]> = {
  stop: [
    "stop", "pause", "halt", "stahp", "paused", "shh", "quiet", "silence", "freeze", "cease",
    "stop reading", "pause reading", "stop playing", "hold on", "standby"
  ],
  play: [
    "play", "resume", "continue", "read", "reed", "reading", "start", "go", "speak", "begin",
    "start reading", "keep reading", "unpause"
  ],
  next: [
    "next", "skip", "forward", "necks", "nex", "next page", "next sentence", "skip sentence",
    "go forward", "move forward", "advance"
  ],
  previous: [
    "previous", "prev", "back", "go back", "prior", "before", "preevious", "preveous", "previus",
    "privious", "preview", "previews", "previewing", "review", "reviews", "re view",
    "previous page", "previous sentence", "prior sentence", "last sentence", "step back", "go prior"
  ],
  restart: [
    "repeat", "restart", "start over", "reset", "refresh", "re start", "re-start", "replay",
    "rewind", "again", "i start", "first start", "let s start", "from the top", "from the beginning"
  ],
  speed: [
    "speed", "rate", "reading speed", "read speed", "voice speed", "faster", "slower",
    "breathing speed", "eating speed", "reeding speed", "reed speed", "reading rate", "voice rate",
    "speed up", "slow down", "change speed", "adjust speed", "pace"
  ],
  settings: [
    "setting", "settings", "options", "preferences", "config", "configuration", "visual settings", "open settings"
  ],
  help: [
    "help", "commands", "command", "guide", "instructions", "help me", "what can i say", "show commands", "voice commands"
  ],
  minimize: [
    "minimize", "mini", "collapse", "hide", "minimise", "shrink", "compact", "dock minimize"
  ],
  expand: [
    "expand", "maximize", "maximise", "show", "open", "expend", "span", "restore", "unhide", "dock expand"
  ],
  close: [
    "close", "closed", "clothes", "clos", "clause", "claws", "close dock", "close visual",
    "close visual mode", "close it", "close this", "deactivate", "deactivate visual",
    "deactivate visual mode", "turn off visual mode", "turn off visual", "turn off",
    "exit", "exit dock", "shut", "shut down", "dismiss", "done", "finish"
  ],
  deactivateVoice: [
    "stop listening", "stop listen", "stop voice", "stop voice command", "stop voice commands",
    "deactivate voice", "deactivate voice command", "deactivate voice commands", "deactivate listening",
    "turn off voice", "turn off voice command", "turn off voice commands", "turn off listening",
    "turn off mic", "turn off the mic", "turn off microphone", "turn off the microphone",
    "disable voice", "disable voice command", "disable voice commands", "disable listening",
    "quit listening", "end listening", "mute voice", "mute mic", "mute", "sleep"
  ],
  wake: [
    "sensa", "sansa", "sensor", "sensia", "sincere", "center", "censor", "senser", "censer", "sens",
    "activate voice", "activate listening", "start listening", "voice command", "voice commands", "wake up", "listen"
  ],
  increase: [
    "increase", "faster", "speed up", "higher", "in crease", "in greece", "more", "up", "raise", "boost"
  ],
  decrease: [
    "decrease", "slower", "slow down", "lower", "the grease", "degrees", "de grease", "the crease", "de crease", "less", "down", "reduce"
  ],
  default: [
    "default", "normal", "reset", "standard", "original"
  ]
};

// Critical emergency commands that must ALWAYS pass through for user safety
const CRITICAL_EMERGENCY_COMMANDS = [
  "stop listening",
  "deactivate voice",
  "turn off mic",
  "turn off listening",
  "disable voice"
];

// Reverse lookup: any variant/homophone points to its full cluster
const VARIANT_TO_CLUSTER: Map<string, string[]> = new Map();
for (const [, variants] of Object.entries(COMMAND_HOMOPHONES)) {
  for (const v of variants) {
    const lower = v.toLowerCase().trim();
    VARIANT_TO_CLUSTER.set(lower, variants);
  }
}

class TTSEchoFilter {
  private activeTokens: EchoToken[] = [];
  private isInstalled = false;
  private activeArticleSegment: ActiveArticleSegment | null = null;
  private readonly defaultEchoDurationMs = 1600; // Acoustic travel time + mic buffer + Chrome ML latency

  /**
   * Install the automatic SpeechSynthesis monkey-patch.
   * Intercepts all window.speechSynthesis.speak() calls in the current document context.
   */
  public install(): void {
    if (this.isInstalled || typeof window === "undefined" || !window.speechSynthesis) return;
    this.isInstalled = true;

    const originalSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis);
    const self = this;

    window.speechSynthesis.speak = function (utterance: SpeechSynthesisUtterance) {
      self.registerUtterance(utterance);
      return originalSpeak(utterance);
    };
  }

  /**
   * Register an article reading segment into the lookahead buffer before playback starts.
   * Tracks words in advance to subtract screen reader output from incoming microphone audio.
   */
  public registerArticleSegment(text: string, rate = 1.0): void {
    if (!text || !text.trim()) {
      this.clearArticleSegment();
      return;
    }

    const safeRate = Math.max(0.5, Math.min(2.5, rate || 1.0));
    const msPerWord = Math.round(380 / safeRate); // ~155 WPM at 1.0x

    const wordOffsets: WordOffset[] = [];
    const wordRegex = /\b[a-zA-Z0-9'-]+\b/g;
    let match: RegExpExecArray | null;
    while ((match = wordRegex.exec(text)) !== null) {
      const cleanWord = match[0].toLowerCase().replace(/[^a-z0-9]/g, "");
      if (cleanWord) {
        wordOffsets.push({
          word: cleanWord,
          startChar: match.index,
          endChar: match.index + match[0].length
        });
      }
    }

    const words = wordOffsets.map(wo => wo.word);
    const normalizedText = words.join(" ");
    const totalEstimatedDuration = (words.length * msPerWord) + 2000;

    this.activeArticleSegment = {
      rawText: text,
      normalizedText,
      words,
      wordOffsets,
      rate: safeRate,
      startTime: Date.now(),
      msPerWord,
      activeWordIndex: 0,
      lastBoundaryTime: Date.now(),
      activeUntil: Date.now() + totalEstimatedDuration
    };

    // Pre-populate the first 3 words into activeTokens immediately
    const initialWords = words.slice(0, 3);
    if (initialWords.length > 0) {
      this.addWordsToEchoBuffer(initialWords, Date.now() + this.defaultEchoDurationMs);
    }

    console.log(`%c[Sensa Echo Filter] 📖 Registered article segment (${words.length} words, ~${Math.round(totalEstimatedDuration / 1000)}s)`, "color: #06b6d4; font-weight: bold;");
  }

  /**
   * Notify the lookahead engine that a speech synthesis word boundary was reached.
   * Synchronizes active word indices down to the millisecond.
   */
  public notifyBoundary(charIndex: number, _charLength?: number): void {
    if (!this.activeArticleSegment) return;
    const seg = this.activeArticleSegment;
    const offsets = seg.wordOffsets;
    if (!offsets || offsets.length === 0) return;

    let foundIdx = -1;
    for (let i = 0; i < offsets.length; i++) {
      if (charIndex >= offsets[i].startChar && charIndex <= offsets[i].endChar) {
        foundIdx = i;
        break;
      }
      if (offsets[i].startChar > charIndex) {
        foundIdx = Math.max(0, i - 1);
        break;
      }
    }
    if (foundIdx === -1) {
      foundIdx = offsets.length - 1;
    }

    seg.activeWordIndex = foundIdx;
    seg.lastBoundaryTime = Date.now();

    // Add active spoken words around current boundary: [idx - 2 .. idx + 2]
    const startIdx = Math.max(0, foundIdx - 2);
    const endIdx = Math.min(seg.words.length, foundIdx + 3);
    const currentWindowWords = seg.words.slice(startIdx, endIdx);

    this.addWordsToEchoBuffer(currentWindowWords, Date.now() + this.defaultEchoDurationMs);
  }

  /**
   * Clear the active article segment when reading is paused, stopped, or completed.
   */
  public clearArticleSegment(): void {
    this.activeArticleSegment = null;
  }

  /**
   * Check if an article reading segment is actively vocalizing.
   */
  public isReadingArticle(): boolean {
    return this.activeArticleSegment !== null && Date.now() <= this.activeArticleSegment.activeUntil;
  }

  /**
   * Synchronizes timeline with active article reading segment if boundary events are delayed or absent.
   */
  private syncArticleTimeline(): void {
    if (!this.activeArticleSegment) return;
    const seg = this.activeArticleSegment;
    const now = Date.now();

    // If segment has expired, auto-clear
    if (now > seg.activeUntil) {
      this.clearArticleSegment();
      return;
    }

    // If boundary hasn't fired in > 1200ms (Chromium remote TTS voice bug), fall back to elapsed-time estimation
    if (now - seg.lastBoundaryTime > 1200) {
      const elapsed = now - seg.startTime;
      const estimatedIdx = Math.min(seg.words.length - 1, Math.floor(elapsed / seg.msPerWord));
      seg.activeWordIndex = estimatedIdx;

      const startIdx = Math.max(0, estimatedIdx - 2);
      const endIdx = Math.min(seg.words.length, estimatedIdx + 3);
      const currentWindowWords = seg.words.slice(startIdx, endIdx);
      this.addWordsToEchoBuffer(currentWindowWords, now + this.defaultEchoDurationMs);
    }
  }

  /**
   * Register an utterance to track its spoken words in real time.
   */
  public registerUtterance(utterance: SpeechSynthesisUtterance): void {
    if (!utterance || !utterance.text) return;
    const fullText = utterance.text;
    const self = this;

    // If this utterance matches our active article segment, simply attach boundary tracking
    if (this.activeArticleSegment && this.activeArticleSegment.rawText === fullText) {
      const originalBoundary = utterance.onboundary;
      utterance.onboundary = (event: SpeechSynthesisEvent) => {
        if (event.name === "word" && typeof event.charIndex === "number") {
          self.notifyBoundary(event.charIndex, event.charLength);
        }
        if (originalBoundary) {
          originalBoundary.call(utterance, event);
        }
      };
      return;
    }

    const words = fullText
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);

    const isShortUtterance = words.length <= 14;

    if (isShortUtterance) {
      const estimatedDuration = Math.max(1200, (words.length / (utterance.rate || 1.0)) * 400) + this.defaultEchoDurationMs;
      const expires = Date.now() + estimatedDuration;
      this.addWordsToEchoBuffer(words, expires);
    }

    // Attach boundary tracking for real-time word synchronization on longer text
    const originalBoundary = utterance.onboundary;
    utterance.onboundary = (event: SpeechSynthesisEvent) => {
      if (event.name === "word" && typeof event.charIndex === "number") {
        const charIndex = event.charIndex;
        const charLength = event.charLength || 6;
        const spokenWord = fullText.slice(charIndex, charIndex + charLength).trim();
        if (spokenWord) {
          const cleanWord = spokenWord.toLowerCase().replace(/[^a-z0-9]/g, "");
          if (cleanWord) {
            self.addWordsToEchoBuffer([cleanWord], Date.now() + self.defaultEchoDurationMs);
          }
        }
      }
      if (originalBoundary) {
        originalBoundary.call(utterance, event);
      }
    };

    // On start, if it's longer text, also register the first 4 words immediately
    const originalStart = utterance.onstart;
    utterance.onstart = (event: SpeechSynthesisEvent) => {
      if (!isShortUtterance) {
        const initialWords = words.slice(0, 4);
        self.addWordsToEchoBuffer(initialWords, Date.now() + self.defaultEchoDurationMs);
      }
      if (originalStart) {
        originalStart.call(utterance, event);
      }
    };
  }

  /**
   * Directly register spoken words with a custom expiration duration.
   */
  public registerSpokenWords(wordsOrText: string | string[], durationMs?: number): void {
    const tokens = (Array.isArray(wordsOrText) ? wordsOrText.join(" ") : wordsOrText)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);

    const expires = Date.now() + (durationMs ?? this.defaultEchoDurationMs);
    this.addWordsToEchoBuffer(tokens, expires);
  }

  /**
   * Add words and their mapped fallback homophone clusters to the active echo buffer.
   */
  private addWordsToEchoBuffer(words: string[], expires: number): void {
    for (const w of words) {
      const lower = w.toLowerCase().trim();
      if (!lower || lower.length < 2) continue;

      // Add the raw word
      this.activeTokens.push({ word: lower, expires });

      // Expand to homophones/cluster if this is a command word or fallback
      const cluster = VARIANT_TO_CLUSTER.get(lower);
      if (cluster) {
        for (const variant of cluster) {
          const vLower = variant.toLowerCase().trim();
          if (vLower && vLower.length >= 2) {
            this.activeTokens.push({ word: vLower, expires });
          }
        }
      }
    }
  }

  /**
   * Filter an incoming SpeechRecognition transcript against the active TTS echo buffer.
   * Strips out words that were produced by the computer speakers within the last ~1600ms.
   * Automatically drops multi-word article phrases leaked through speakers into the mic.
   */
  public filterTranscript(transcript: string): { cleanText: string; isEcho: boolean; droppedWords: string[] } {
    if (!transcript) return { cleanText: "", isEcho: false, droppedWords: [] };

    const rawLower = transcript.toLowerCase().trim();

    // 1. Critical safety emergency bypass: phrases like "stop listening", "deactivate voice" must never be blocked
    for (const emergency of CRITICAL_EMERGENCY_COMMANDS) {
      if (rawLower.includes(emergency)) {
        return { cleanText: transcript.trim(), isEcho: false, droppedWords: [] };
      }
    }

    // 2. Synchronize timeline with active article reading (if any)
    this.syncArticleTimeline();

    // 3. Multi-word article N-gram suppression:
    // If the transcript contains 2+ words and matches a slice of the article being read,
    // it is 100% leaked audio from the article being read through the speakers.
    if (this.activeArticleSegment) {
      const normInput = rawLower.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
      const inputWords = normInput.split(" ").filter(Boolean);

      if (inputWords.length >= 2) {
        // Direct substring check
        if (this.activeArticleSegment.normalizedText.includes(normInput)) {
          return { cleanText: "", isEcho: true, droppedWords: [normInput] };
        }

        // Sliding 2-word check: If any consecutive pair of words is found in the article,
        // and is not a known registered voice command phrase (like "reading speed" or "go back"):
        const isKnownCommandPhrase = VARIANT_TO_CLUSTER.has(normInput);
        if (!isKnownCommandPhrase) {
          let consecutiveMatches = 0;
          for (let i = 0; i < inputWords.length - 1; i++) {
            const bigram = `${inputWords[i]} ${inputWords[i + 1]}`;
            if (this.activeArticleSegment.normalizedText.includes(bigram)) {
              consecutiveMatches++;
            }
          }
          if (consecutiveMatches > 0) {
            return { cleanText: "", isEcho: true, droppedWords: [normInput] };
          }
        }
      }
    }

    // 4. Token-level echo subtraction
    const now = Date.now();
    this.activeTokens = this.activeTokens.filter(t => t.expires > now);

    if (this.activeTokens.length === 0) {
      return { cleanText: transcript.trim(), isEcho: false, droppedWords: [] };
    }

    let cleanText = transcript;
    const droppedWords: string[] = [];
    const uniqueActiveWords = Array.from(new Set(this.activeTokens.map(t => t.word)));

    for (const word of uniqueActiveWords) {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const wordRegex = new RegExp("\\b" + escaped + "\\b", "gi");
      if (wordRegex.test(cleanText)) {
        droppedWords.push(word);
        cleanText = cleanText.replace(wordRegex, " ");
      }
    }

    cleanText = cleanText.replace(/\s+/g, " ").trim();
    const isEcho = droppedWords.length > 0;

    return { cleanText, isEcho, droppedWords };
  }

  /**
   * Checks whether a specific word or phrase is currently actively echoing.
   */
  public isEchoing(wordOrPhrase: string): boolean {
    const now = Date.now();
    this.activeTokens = this.activeTokens.filter(t => t.expires > now);
    const tokens = wordOrPhrase.toLowerCase().split(/\s+/).filter(Boolean);
    return tokens.some(tok => this.activeTokens.some(active => active.word === tok));
  }

  /**
   * Clear all active echo buffers.
   */
  public clear(): void {
    this.activeTokens = [];
    this.activeArticleSegment = null;
  }
}

export const ttsEchoFilter = new TTSEchoFilter();

// Auto-install on module evaluation if in browser environment
if (typeof window !== "undefined") {
  ttsEchoFilter.install();
}