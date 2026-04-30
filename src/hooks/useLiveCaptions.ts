import { useEffect, useRef, useState } from "react"

export function useLiveCaptions(isActive: boolean, targetLanguage: string, showOriginalText: boolean) {
  const [captions, setCaptions] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  
  // Refs ensure we always have the latest value without triggering re-renders!
  const targetLanguageRef = useRef(targetLanguage)
  const showOriginalTextRef = useRef(showOriginalText)

  useEffect(() => {
    targetLanguageRef.current = targetLanguage
  }, [targetLanguage])

  useEffect(() => {
    showOriginalTextRef.current = showOriginalText
  }, [showOriginalText])

  // 1. Silently update the backend language WITHOUT restarting the audio stream
  useEffect(() => {
    if (!isActive) return

    chrome.runtime.sendMessage({
      type: "UPDATE_CAPTION_LANGUAGE",
      targetLang: targetLanguage
    })
  }, [targetLanguage, isActive])

  // 2. THE AUDIO ENGINE: This should ONLY run when isActive turns on or off
  useEffect(() => {
    if (!isActive) {
      chrome.runtime.sendMessage({ type: "STOP_CAPTURE" })
      return
    }

    setError(null)
    setCaptions([])
    console.log("[useLiveCaptions] Instructing background to start...")

    let cancelled = false
    const startCapture = (attempt = 1) => {
      chrome.runtime.sendMessage({ type: "START_CAPTURE", targetLang: targetLanguageRef.current }, (res) => {
        if (cancelled) return

        const runtimeError = chrome.runtime.lastError?.message
        const responseError = typeof res?.error === "string" ? res.error : ""
        const combinedError = runtimeError || responseError

        if (res?.ok) {
          return
        }

        const isTransient = /receiving end does not exist|message port closed|No Tab ID|Failed to get stream ID/i.test(combinedError)
        if (isTransient && attempt < 3) {
          setTimeout(() => startCapture(attempt + 1), 200)
          return
        }

        setError(combinedError || "Failed to start capture.")
      })
    }

    startCapture()

    const handleMessage = (msg: any) => {
      // Print beamed messages from the invisible window!
      if (msg.type === "PROXY_LOG") {
        console.log(`📡 [Sensa Background]: ${msg.message}`)
      }
      if (msg.type === "CAPTION_UPDATE" && msg.text) {
        if (!showOriginalTextRef.current && msg.source === "original") return
        setCaptions((prev) => [...prev, msg.text].slice(-4))
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)

    return () => {
      cancelled = true
      chrome.runtime.onMessage.removeListener(handleMessage)
      chrome.runtime.sendMessage({ type: "STOP_CAPTURE" })
    }
  // 🚨 FIX: Removed targetLanguage from this array so the audio engine never restarts unnecessarily!
  }, [isActive]) 

  return { captions, error }
}