/**
 * @file useLiveCaptions.ts
 * @description Core React hook governing real-time speech-to-text transcription and translation for Sensa.
 * 
 * Architectural Overview:
 * 1. Communicates with Chrome Extension Background Script (`background.ts`) via runtime messages (`START_CAPTURE`, `STOP_CAPTURE`).
 * 2. Background script opens an offscreen document or tab capture stream, routing audio via WebSocket to the Sensa Backend (`sensa-backend`).
 * 3. Backend streams audio to Deepgram (speech-to-text) and DeepL (translation), returning `CAPTION_UPDATE` messages.
 * 4. This hook merges interim and final transcription blocks, pairing original text with translated subtitles in real-time.
 */

import { useEffect, useRef, useState } from "react"

/**
 * Represents a single subtitle block displayed in the UI or transcript history.
 */
export interface CaptionBlock {
  /** Unique identifier for keying in React lists */
  id: string
  /** The transcribed text in the source language (e.g., English) */
  original: string
  /** The translated text in the target language (e.g., Spanish) */
  translated: string
  /** Whether the speech engine has finalized this utterance (true) or is still streaming interim results (false) */
  isFinal: boolean
}

/**
 * Manages live captioning state, language updates, automatic error recovery, and message listeners.
 *
 * @param isActive - Whether live captioning is currently enabled by the user or mode.
 * @param targetLanguage - The language code to translate subtitles into (e.g., "ES", "TL").
 * @param showOriginalText - Whether to display both original and translated text simultaneously.
 * @param isCaptionsDisplayed - UI toggle governing whether captions should be rendered on screen.
 * @param sourceLanguage - The spoken language code being captured (e.g., "en", "fil").
 * @param isPopupOpen - State indicating if the Sensa extension popup is open; used for instant retry after activeTab authorization.
 * @returns Object containing the current array of `captions` and any authorization/connection `error` string.
 */
export function useLiveCaptions(isActive: boolean, targetLanguage: string, showOriginalText: boolean, isCaptionsDisplayed: boolean = true, sourceLanguage: string = "en", isPopupOpen: boolean = false) {
  const [captions, setCaptions] = useState<CaptionBlock[]>([])
  const [error, setError] = useState<string | null>(null)
  
  const targetLanguageRef = useRef(targetLanguage)
  const sourceLanguageRef = useRef(sourceLanguage)
  const isCaptionsDisplayedRef = useRef(isCaptionsDisplayed)
  
  useEffect(() => { if (!isCaptionsDisplayed) setCaptions([]) }, [isCaptionsDisplayed])
  useEffect(() => { targetLanguageRef.current = targetLanguage }, [targetLanguage])
  useEffect(() => { sourceLanguageRef.current = sourceLanguage }, [sourceLanguage])
  useEffect(() => { isCaptionsDisplayedRef.current = isCaptionsDisplayed }, [isCaptionsDisplayed])

  // Automatically retry capture when the extension popup opens, utilizing the newly granted activeTab permission
  useEffect(() => {
    if (isActive && isPopupOpen) {
      setError(null)
      chrome.runtime.sendMessage({
        type: "START_CAPTURE",
        targetLang: targetLanguageRef.current,
        sourceLang: sourceLanguageRef.current
      }, (res) => {
        const combinedError = chrome.runtime.lastError?.message || (typeof res?.error === "string" ? res.error : "")
        if (!res?.ok && combinedError) {
          if (/Extension has not been invoked|Chrome pages cannot be captured|activeTab|Failed to get stream ID|permission|not allowed|authorization/i.test(combinedError)) {
            setError("👆 Chrome requires authorization: please click the Sensa extension icon in your top Chrome toolbar once to enable live captions on this tab!")
          } else {
            setError(combinedError || "Failed to start capture.")
          }
        }
      })
    }
  }, [isPopupOpen, isActive])

  useEffect(() => {
    if (!isActive) return
    setCaptions([])
    chrome.runtime.sendMessage({ type: "UPDATE_CAPTION_LANGUAGE", targetLang: targetLanguage })
  }, [targetLanguage, isActive])

  useEffect(() => {
    if (!isActive) return
    setCaptions([])
    chrome.runtime.sendMessage({ type: "UPDATE_SOURCE_LANGUAGE", sourceLang: sourceLanguage })
  }, [sourceLanguage, isActive])

  useEffect(() => {
    if (!isActive) {
      chrome.runtime.sendMessage({ type: "STOP_CAPTURE" })
      return
    }

    setError(null)
    setCaptions([])

    let cancelled = false
    let captureRunning = false
    const startCapture = (attempt = 1) => {
      chrome.runtime.sendMessage({ type: "START_CAPTURE", targetLang: targetLanguageRef.current, sourceLang: sourceLanguageRef.current }, (res) => {
        if (cancelled) return
        const combinedError = chrome.runtime.lastError?.message || (typeof res?.error === "string" ? res.error : "")
        if (res?.ok) {
          captureRunning = true
          return
        }
        
        if (/receiving end does not exist|message port closed|No Tab ID|Failed to get stream ID|offscreen|already exists|active stream|Cannot capture|invalid state/i.test(combinedError) && attempt < 5) {
          setTimeout(() => startCapture(attempt + 1), 250)
          return
        }
        captureRunning = false
        if (/Extension has not been invoked|Chrome pages cannot be captured|activeTab|Failed to get stream ID|permission|not allowed|authorization/i.test(combinedError)) {
          setError("👆 Chrome requires authorization: please click the Sensa extension icon in your top Chrome toolbar once to enable live captions on this tab!")
          return
        }
        setError(combinedError || "Failed to start capture.")
      })
    }
    startCapture()

    const handleMessage = (msg: any) => {
      if (msg.type === "CAPTION_ERROR") {
        const errStr = msg.error || "Failed to start capture."
        if (/active stream|Cannot capture|invalid state/i.test(errStr)) {
          startCapture()
        } else if (/Extension has not been invoked|Chrome pages cannot be captured|activeTab|Failed to get stream ID|permission|not allowed|authorization/i.test(errStr)) {
          captureRunning = false
          setError("👆 Chrome requires authorization: please click the Sensa extension icon in your top Chrome toolbar once to enable live captions on this tab!")
        } else {
          captureRunning = false
          setError(errStr)
        }
      }
      if (msg.type === "AUDIO_FREQUENCY_UPDATE" && msg.frequencies) {
        window.postMessage({ type: "SENSA_GAME_AUDIO_FREQUENCY", frequencies: msg.frequencies }, "*")
      }
      if (msg.type === "CAPTION_UPDATE" && msg.text && isCaptionsDisplayedRef.current) {
        setCaptions((prev) => {
          // Clone array to prevent state mutation
          const newCaptions = [...prev]

          if (msg.source === "original") {
            if (newCaptions.length === 0 || newCaptions[newCaptions.length - 1].isFinal) {
              newCaptions.push({
                id: Date.now().toString() + Math.random(),
                original: msg.text,
                translated: "",
                isFinal: msg.isFinal
              })
            } else {
              const lastIdx = newCaptions.length - 1
              newCaptions[lastIdx] = {
                ...newCaptions[lastIdx],
                original: msg.text,
                isFinal: msg.isFinal
              }
            }
          } 
          else if (msg.source === "translated") {
            let attached = false
            for (let i = 0; i < newCaptions.length; i++) {
              if (!newCaptions[i].translated) {
                newCaptions[i] = {
                  ...newCaptions[i],
                  translated: msg.text
                }
                attached = true
                break
              }
            }
            if (!attached && newCaptions.length > 0) {
              const lastIdx = newCaptions.length - 1
              if (!newCaptions[lastIdx].isFinal || msg.isFinal) {
                newCaptions[lastIdx] = {
                  ...newCaptions[lastIdx],
                  translated: msg.text
                }
              }
            }
          }
          return newCaptions // Return the FULL history
        })
      }
    }

    const handleVisibilityOrFocus = () => {
      if ((document.visibilityState === "visible" || document.hasFocus()) && !cancelled && !captureRunning) {
        startCapture()
      }
    }
    document.addEventListener("visibilitychange", handleVisibilityOrFocus)
    window.addEventListener("focus", handleVisibilityOrFocus)
    chrome.runtime.onMessage.addListener(handleMessage)
    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus)
      window.removeEventListener("focus", handleVisibilityOrFocus)
      chrome.runtime.onMessage.removeListener(handleMessage)
      chrome.runtime.sendMessage({ type: "STOP_CAPTURE" })
    }
  }, [isActive]) 

  return { captions, error }
}