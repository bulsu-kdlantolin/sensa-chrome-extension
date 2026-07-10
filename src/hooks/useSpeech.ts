/**
 * @file useSpeech.ts
 * @description Core screen reading text-to-speech (TTS) engine and sentence highlight visualizer for Visual Mode.
 *
 * Architectural Overview:
 * 1. DOM Text Extraction (`extractReadableContent`):
 *    - Traverses the document (`main`, `article`, or `body`), filtering out hidden elements and navigation headers (`EXCLUDED_ANCESTOR_SELECTOR`).
 *    - Splits text into speakable sentence ranges (`splitSentenceRanges`) while respecting common abbreviations (`COMMON_ABBREVIATIONS`) like "U.S.", "Dr.", "e.g." so sentences aren't split prematurely.
 *
 * 2. Speech Normalization (`normalizeSpeechSlice`):
 *    - Pre-processes text before sending to `window.speechSynthesis` (e.g., expanding "No. 5" to "number 5") while maintaining character mapping back to the original DOM text for accurate word boundary highlighting.
 *
 * 3. Highlight Overlay & Auto-scroll (`renderSegmentOverlay`):
 *    - Creates an absolute-positioned overlay div matching the `getClientRects()` of the currently spoken sentence range.
 *    - Smoothly auto-scrolls the browser window to keep the active sentence vertically centered.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const READABLE_SELECTOR = "h1, h2, h3, h4, h5, h6, p, li, blockquote, pre";
const EXCLUDED_ANCESTOR_SELECTOR =
  "nav, header, footer, aside, form, button, [aria-hidden='true'], [role='navigation']";
const SENTENCE_END_RE = /[.!?。！？]/;
const COMMON_ABBREVIATIONS = new Set([
  "mr.",
  "mrs.",
  "ms.",
  "dr.",
  "prof.",
  "sr.",
  "jr.",
  "st.",
  "vs.",
  "etc.",
  "e.g.",
  "i.e.",
  "u.s.",
  "u.k.",
  "a.m.",
  "p.m."
]);

interface SentenceSegment {
  elementIndex: number;
  start: number;
  end: number;
  text: string;
}

const hasSpeakableContent = (text: string) => /\p{L}/u.test(text);

const getSpeechRate = (readingSpeed: number) => {
  if (!Number.isFinite(readingSpeed)) return 1;

  // Keep the UI multiplier intact, but make the actual TTS curve less aggressive.
  // This preserves 1x as normal speed while preventing 2x+ from becoming unintelligible.
  const clamped = Math.max(0.75, Math.min(2.5, readingSpeed));
  if (clamped <= 1) return clamped;

  return 1 + (clamped - 1) * 0.4;
};

const normalizeSpeechSlice = (source: string) => {
  const normalizedToSource: number[] = [];
  let normalized = "";

  const pattern = /\bNo\.\s*(\d+)\b/gi;
  let cursor = 0;
  let match: RegExpExecArray | null = pattern.exec(source);

  const appendSourceVerbatim = (text: string, sourceStart: number) => {
    for (let i = 0; i < text.length; i += 1) {
      normalized += text[i];
      normalizedToSource.push(sourceStart + i);
    }
  };

  const appendNormalizedToken = (token: string, sourceIndex: number) => {
    for (let i = 0; i < token.length; i += 1) {
      normalized += token[i];
      normalizedToSource.push(sourceIndex);
    }
  };

  while (match) {
    const matchIndex = match.index;
    const matchText = match[0];
    const digits = match[1];

    appendSourceVerbatim(source.slice(cursor, matchIndex), cursor);
    appendNormalizedToken(`number ${digits}`, matchIndex);

    cursor = matchIndex + matchText.length;
    match = pattern.exec(source);
  }

  appendSourceVerbatim(source.slice(cursor), cursor);

  return { normalized, normalizedToSource };
};

const shouldSplitAtDot = (text: string, dotIndex: number) => {
  const prev = text[dotIndex - 1] ?? "";
  const next = text[dotIndex + 1] ?? "";

  // Decimal numbers like 3.14 are not sentence boundaries.
  if (/\d/.test(prev) && /\d/.test(next)) {
    return false;
  }

  const left = text.slice(Math.max(0, dotIndex - 20), dotIndex + 1);
  const tokenMatch = left.match(/([A-Za-z][A-Za-z.]*)\.$/);
  if (!tokenMatch) return true;

  const token = `${tokenMatch[1]}.`;
  const tokenLower = token.toLowerCase();

  if (COMMON_ABBREVIATIONS.has(tokenLower)) {
    return false;
  }

  // Handles dotted abbreviations/initialisms like U.S. and U.S.A.
  if (/^(?:[A-Za-z]\.){2,}$/.test(token)) {
    return false;
  }

  // Handles initials like "J. Smith".
  if (/^[A-Za-z]\.$/.test(token)) {
    const remainder = text.slice(dotIndex + 1);
    const nextNonSpace = remainder.match(/\S/)?.[0] ?? "";
    if (/[A-Z]/.test(nextNonSpace)) {
      return false;
    }
  }

  return true;
};

const isVisible = (el: HTMLElement) => {
  const style = window.getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;
  if (el.offsetWidth === 0 && el.offsetHeight === 0) return false;
  return true;
};

const isReadable = (el: HTMLElement) => {
  const text = el.innerText?.trim() ?? "";
  if (!text) return false;
  if (el.closest(EXCLUDED_ANCESTOR_SELECTOR)) return false;

  if (/^H[1-6]$/.test(el.tagName)) return text.length >= 4;
  return text.length >= 25;
};

const getTextNodes = (el: HTMLElement): Text[] => {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];

  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    if (textNode.nodeValue && textNode.nodeValue.length > 0) {
      nodes.push(textNode);
    }
    node = walker.nextNode();
  }

  return nodes;
};

const resolveTextOffset = (nodes: Text[], absoluteOffset: number) => {
  let remaining = Math.max(0, absoluteOffset);

  for (const node of nodes) {
    const value = node.nodeValue ?? "";
    if (remaining <= value.length) {
      return { node, offset: remaining };
    }
    remaining -= value.length;
  }

  const fallbackNode = nodes[nodes.length - 1];
  const fallbackLength = (fallbackNode?.nodeValue ?? "").length;
  return { node: fallbackNode, offset: fallbackLength };
};

const splitSentenceRanges = (text: string) => {
  const ranges: Array<{ start: number; end: number }> = [];
  if (!text) return ranges;

  let start = 0;

  for (let i = 0; i < text.length; i += 1) {
    if (!SENTENCE_END_RE.test(text[i])) continue;

    if (text[i] === "." && !shouldSplitAtDot(text, i)) {
      continue;
    }

    let end = i + 1;
    while (end < text.length && /["'”’\])}\s]/.test(text[end])) end += 1;

    let normalizedStart = start;
    while (normalizedStart < end && /[\s"'“”‘’([{]/.test(text[normalizedStart])) normalizedStart += 1;

    let normalizedEnd = end;
    while (normalizedEnd > normalizedStart && /\s/.test(text[normalizedEnd - 1])) normalizedEnd -= 1;

    if (normalizedStart < normalizedEnd) {
      ranges.push({ start: normalizedStart, end: normalizedEnd });
    }

    start = end;
    i = end - 1;
  }

  let tailStart = start;
  while (tailStart < text.length && /\s/.test(text[tailStart])) tailStart += 1;
  let tailEnd = text.length;
  while (tailEnd > tailStart && /\s/.test(text[tailEnd - 1])) tailEnd -= 1;

  if (tailStart < tailEnd) {
    ranges.push({ start: tailStart, end: tailEnd });
  }

  return ranges;
};

export function useSpeech(
  readingSpeed: number,
  highlightColor: string,
  isOverlaySuppressed = false,
  isAutoscrollEnabled = true,
  isVisualModeActive = true
) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const elementsRef = useRef<HTMLElement[]>([]);
  const segmentsRef = useRef<SentenceSegment[]>([]);
  const currentSegmentIndexRef = useRef(0);
  const currentCharOffsetRef = useRef(0);
  const speechSessionRef = useRef(0);
  const isOverlaySuppressedRef = useRef(isOverlaySuppressed);
  const isPlayingRef = useRef(false);
  const isPausedRef = useRef(false);
  const selectedVoiceURIRef = useRef<string>("");
  const selectedVoiceNameRef = useRef<string>("");

  const sentenceOverlayRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    chrome.storage.local.get(["sensa_visual_voice_uri", "sensa_visual_voice_name"], (res) => {
      if (typeof res.sensa_visual_voice_uri === "string") {
        selectedVoiceURIRef.current = res.sensa_visual_voice_uri;
      }
      if (typeof res.sensa_visual_voice_name === "string") {
        selectedVoiceNameRef.current = res.sensa_visual_voice_name;
      }
    });

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.sensa_visual_voice_uri && typeof changes.sensa_visual_voice_uri.newValue === "string") {
        selectedVoiceURIRef.current = changes.sensa_visual_voice_uri.newValue;
      }
      if (changes.sensa_visual_voice_name && typeof changes.sensa_visual_voice_name.newValue === "string") {
        selectedVoiceNameRef.current = changes.sensa_visual_voice_name.newValue;
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    isPausedRef.current = isPaused;
  }, [isPlaying, isPaused]);

  const clearSentenceOverlay = useCallback(() => {
    const root = sentenceOverlayRootRef.current;
    if (!root) return;
    root.replaceChildren();
  }, []);

  const findAdjacentSegment = useCallback((fromIndex: number, direction: 1 | -1) => {
    const segments = segmentsRef.current;
    let idx = fromIndex + direction;

    while (idx >= 0 && idx < segments.length) {
      if (hasSpeakableContent(segments[idx].text)) {
        return idx;
      }
      idx += direction;
    }

    return -1;
  }, []);

  const renderSegmentOverlay = useCallback(
    (segment: SentenceSegment) => {
      const root = sentenceOverlayRootRef.current;
      const element = elementsRef.current[segment.elementIndex];
      if (!root || !element) {
        clearSentenceOverlay();
        return;
      }

      const nodes = getTextNodes(element);
      if (!nodes.length) {
        clearSentenceOverlay();
        return;
      }

      const startPos = resolveTextOffset(nodes, segment.start);
      const endPos = resolveTextOffset(nodes, segment.end);
      if (!startPos.node || !endPos.node) {
        clearSentenceOverlay();
        return;
      }

      const range = document.createRange();
      range.setStart(startPos.node, startPos.offset);
      range.setEnd(endPos.node, endPos.offset);

      const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
      if (!rects.length) {
        clearSentenceOverlay();
        return;
      }

      const fragments = rects.map((rect) => {
        const part = document.createElement("div");
        part.style.position = "absolute";
        part.style.left = `${Math.round(rect.left + window.scrollX)}px`;
        part.style.top = `${Math.round(rect.top + window.scrollY)}px`;
        part.style.width = `${Math.ceil(rect.width)}px`;
        part.style.height = `${Math.ceil(rect.height)}px`;
        part.style.backgroundColor = highlightColor;
        part.style.opacity = "0.12";
        part.style.borderRadius = "0px";
        part.style.mixBlendMode = "normal";
        part.style.zIndex = "0";
        return part;
      });

      root.replaceChildren(...fragments);
    },
    [clearSentenceOverlay, highlightColor]
  );

  useEffect(() => {
    isOverlaySuppressedRef.current = isOverlaySuppressed;

    if (isOverlaySuppressed || isPaused) {
      clearSentenceOverlay();
    } else {
      // Only re-render if reading is actively running or paused.
      if (!isPlayingRef.current) return;
      const segment = segmentsRef.current[currentSegmentIndexRef.current];
      if (segment) {
        renderSegmentOverlay(segment);
      }
    }
  }, [clearSentenceOverlay, isOverlaySuppressed, isPaused, renderSegmentOverlay]);

  useEffect(() => {
    if (isVisualModeActive) return;

    speechSessionRef.current += 1;
    window.speechSynthesis.resume();
    window.speechSynthesis.cancel();
    setIsPlaying(false);
    setIsPaused(false);
    currentSegmentIndexRef.current = 0;
    currentCharOffsetRef.current = 0;
    clearSentenceOverlay();
  }, [clearSentenceOverlay, isVisualModeActive]);

  const extractReadableContent = useCallback(() => {
    const root =
      (document.querySelector("main, article, [role='main']") as HTMLElement | null) ?? document.body;

    const elements = Array.from(root.querySelectorAll<HTMLElement>(READABLE_SELECTOR)).filter(
      (el) => isVisible(el) && isReadable(el)
    );

    const segments: SentenceSegment[] = [];
    elements.forEach((element, elementIndex) => {
      const fullText = getTextNodes(element)
        .map((n) => n.nodeValue ?? "")
        .join("");

      const ranges = splitSentenceRanges(fullText);
      for (const range of ranges) {
        const text = fullText.slice(range.start, range.end).trim();
        if (!text) continue;
        if (!hasSpeakableContent(text)) continue;
        segments.push({ elementIndex, start: range.start, end: range.end, text });
      }
    });

    elementsRef.current = elements;
    segmentsRef.current = segments;

    if (currentSegmentIndexRef.current >= segments.length) {
      currentSegmentIndexRef.current = Math.max(0, segments.length - 1);
      currentCharOffsetRef.current = 0;
    }
  }, []);

  const speakAtSegment = useCallback(
    (segmentIndex: number, startOffset = 0, shouldScroll = true) => {
      if (!segmentsRef.current.length) {
        setIsPlaying(false);
        setIsPaused(false);
        return;
      }

      const safeIndex = Math.min(Math.max(segmentIndex, 0), segmentsRef.current.length - 1);
      const segment = segmentsRef.current[safeIndex];
      const element = elementsRef.current[segment.elementIndex];
      if (!segment || !element) {
        setIsPlaying(false);
        setIsPaused(false);
        return;
      }

      const safeStartOffset = Math.min(Math.max(0, startOffset), Math.max(0, segment.text.length - 1));
      const sourceSlice = segment.text.slice(safeStartOffset);
      const { normalized: speechText, normalizedToSource } = normalizeSpeechSlice(sourceSlice);

      if (!speechText.trim() || !hasSpeakableContent(speechText)) {
        const next = findAdjacentSegment(safeIndex, 1);
        if (next !== -1) {
          speakAtSegment(next, 0, true);
        } else {
          setIsPlaying(false);
          setIsPaused(false);
        }
        return;
      }

      const sessionId = ++speechSessionRef.current;
      currentSegmentIndexRef.current = safeIndex;
      currentCharOffsetRef.current = safeStartOffset;

      window.speechSynthesis.resume();
      window.speechSynthesis.cancel();
      if (isOverlaySuppressedRef.current) {
        clearSentenceOverlay();
      } else {
        renderSegmentOverlay(segment);
      }
      if (shouldScroll && isAutoscrollEnabled) {
        // Wait for the overlay to render, then calculate the exact vertical center of the highlight
        requestAnimationFrame(() => {
          const overlayRoot = sentenceOverlayRootRef.current;
          if (overlayRoot && overlayRoot.firstElementChild) {
            const firstRect = (overlayRoot.firstElementChild as HTMLElement).getBoundingClientRect();
            const absoluteY = firstRect.top + window.scrollY;
            const centerY = absoluteY - (window.innerHeight / 2) + (firstRect.height / 2);
            window.scrollTo({ top: centerY, behavior: "smooth" });
          } else {
            // Fallback to the parent element if the overlay isn't available
            element.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        });
      }

      const utterance = new SpeechSynthesisUtterance(speechText);
      utterance.rate = getSpeechRate(readingSpeed);

      const availableVoices = window.speechSynthesis.getVoices();
      if (availableVoices.length > 0) {
        // Prefer voiceURI match, fallback to voice name match for compatibility
        let preferredVoice = availableVoices.find((voice) => voice.voiceURI === selectedVoiceURIRef.current);
        if (!preferredVoice && selectedVoiceNameRef.current) {
          preferredVoice = availableVoices.find((voice) => voice.name === selectedVoiceNameRef.current || voice.name?.includes(selectedVoiceNameRef.current));
        }
        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }
      }

      utterance.onstart = () => {
        if (sessionId !== speechSessionRef.current) return;
        setIsPlaying(true);
        setIsPaused(false);
      };

      utterance.onboundary = (event) => {
        if (sessionId !== speechSessionRef.current) return;
        const boundaryIndex = Math.min(
          Math.max(0, event.charIndex ?? 0),
          Math.max(0, normalizedToSource.length - 1)
        );
        const mappedSourceOffset = normalizedToSource[boundaryIndex] ?? sourceSlice.length;
        currentCharOffsetRef.current = safeStartOffset + mappedSourceOffset;
      };

      utterance.onend = () => {
        if (sessionId !== speechSessionRef.current) return;

        const nextIndex = findAdjacentSegment(currentSegmentIndexRef.current, 1);
        if (nextIndex !== -1) {
          speakAtSegment(nextIndex, 0, true);
          return;
        }

        clearSentenceOverlay();
        setIsPlaying(false);
        setIsPaused(false);
        currentSegmentIndexRef.current = 0;
        currentCharOffsetRef.current = 0;
      };

      utterance.onerror = (e) => {
        if (sessionId !== speechSessionRef.current) return;
        if (e.error !== "canceled") {
          console.error("Speech error:", e);
        }
        clearSentenceOverlay();
        setIsPlaying(false);
        setIsPaused(false);
        currentSegmentIndexRef.current = 0;
        currentCharOffsetRef.current = 0;
      };

      setIsPlaying(true);
      setIsPaused(false);
      window.speechSynthesis.speak(utterance);
    },
    [clearSentenceOverlay, findAdjacentSegment, isAutoscrollEnabled, readingSpeed, renderSegmentOverlay]
  );

  useEffect(() => {
    if (isOverlaySuppressed) {
      clearSentenceOverlay();
    }

    const timeout = window.setTimeout(extractReadableContent, 600);

    const overlayRoot = document.createElement("div");
    overlayRoot.id = "sensa-sentence-highlight-overlay";
    overlayRoot.style.position = "absolute";
    overlayRoot.style.left = "0";
    overlayRoot.style.top = "0";
    overlayRoot.style.width = "100%";
    overlayRoot.style.height = "100%";
    overlayRoot.style.pointerEvents = "none";
    overlayRoot.style.zIndex = "2147483647";
    overlayRoot.style.overflow = "visible";
    sentenceOverlayRootRef.current = overlayRoot;
    document.body.appendChild(overlayRoot);

    const repaintActiveSentence = () => {
      if (isOverlaySuppressedRef.current) {
        clearSentenceOverlay();
        return;
      }
      if (!isPlayingRef.current || isPausedRef.current) {
        clearSentenceOverlay();
        return;
      }

      const segment = segmentsRef.current[currentSegmentIndexRef.current];
      if (!segment) return;
      renderSegmentOverlay(segment);
    };

    window.addEventListener("scroll", repaintActiveSentence, true);
    window.addEventListener("resize", repaintActiveSentence);

    return () => {
      window.clearTimeout(timeout);
      speechSessionRef.current += 1;
      window.speechSynthesis.resume();
      window.speechSynthesis.cancel();
      clearSentenceOverlay();

      window.removeEventListener("scroll", repaintActiveSentence, true);
      window.removeEventListener("resize", repaintActiveSentence);

      if (overlayRoot.parentNode) {
        overlayRoot.parentNode.removeChild(overlayRoot);
      }
      sentenceOverlayRootRef.current = null;
    };
  }, [clearSentenceOverlay, extractReadableContent, renderSegmentOverlay]);

  useEffect(() => {
    if (!isPlaying || isPaused) {
      clearSentenceOverlay();
    }
  }, [clearSentenceOverlay, isPlaying, isPaused]);

  useEffect(() => {
    if (!isPlaying || isPaused || isOverlaySuppressedRef.current) return;
    const segment = segmentsRef.current[currentSegmentIndexRef.current];
    if (!segment) return;
    renderSegmentOverlay(segment);
  }, [highlightColor, isPlaying, isPaused, renderSegmentOverlay]);

  const togglePlayPause = useCallback(() => {
    if (!segmentsRef.current.length) extractReadableContent();
    if (!segmentsRef.current.length) return;

    if (isPlaying && !isPaused) {
      speechSessionRef.current += 1;
      window.speechSynthesis.resume();
      window.speechSynthesis.cancel();
      setIsPaused(true);
      return;
    }

    if (isPlaying && isPaused) {
      speakAtSegment(currentSegmentIndexRef.current, currentCharOffsetRef.current, false);
      return;
    }

    speakAtSegment(currentSegmentIndexRef.current, currentCharOffsetRef.current, true);
  }, [extractReadableContent, isPaused, isPlaying, speakAtSegment]);

  useEffect(() => {
    if (!isPlaying || isPaused) return;
    if (!segmentsRef.current.length) return;

    // Apply new speed immediately from current sentence progress.
    speakAtSegment(currentSegmentIndexRef.current, currentCharOffsetRef.current, false);
  }, [readingSpeed, isPlaying, isPaused, speakAtSegment]);

  const next = useCallback(() => {
    if (!segmentsRef.current.length) extractReadableContent();
    if (!segmentsRef.current.length) return;

    const nextIndex = findAdjacentSegment(currentSegmentIndexRef.current, 1);
    if (nextIndex === -1) return;
    speakAtSegment(nextIndex, 0, true);
  }, [extractReadableContent, findAdjacentSegment, speakAtSegment]);

  const prev = useCallback(() => {
    if (!segmentsRef.current.length) extractReadableContent();
    if (!segmentsRef.current.length) return;

    const prevIndex = findAdjacentSegment(currentSegmentIndexRef.current, -1);
    if (prevIndex === -1) return;
    speakAtSegment(prevIndex, 0, true);
  }, [extractReadableContent, findAdjacentSegment, speakAtSegment]);

  const restart = useCallback(() => {
    if (!segmentsRef.current.length) extractReadableContent();
    if (!segmentsRef.current.length) return;

    speakAtSegment(0, 0, true);
  }, [extractReadableContent, speakAtSegment]);

  return { isPlaying, isPaused, togglePlayPause, next, prev, restart };
}