import { useEffect, useRef, useState } from "react"

// 🚨 Define the stacked data structure
export interface CaptionBlock {
  id: string
  original: string
  translated: string
  isFinal: boolean
}

export function useLiveCaptions(isActive: boolean, targetLanguage: string, showOriginalText: boolean, isCaptionsDisplayed: boolean = true) {
  const [captions, setCaptions] = useState<CaptionBlock[]>([])
  const [error, setError] = useState<string | null>(null)
  
  const targetLanguageRef = useRef(targetLanguage)
  const isCaptionsDisplayedRef = useRef(isCaptionsDisplayed)
  
  useEffect(() => { if (!isCaptionsDisplayed) setCaptions([]) }, [isCaptionsDisplayed])
  useEffect(() => { targetLanguageRef.current = targetLanguage }, [targetLanguage])
  useEffect(() => { isCaptionsDisplayedRef.current = isCaptionsDisplayed }, [isCaptionsDisplayed])

  useEffect(() => {
    if (!isActive) return
    chrome.runtime.sendMessage({ type: "UPDATE_CAPTION_LANGUAGE", targetLang: targetLanguage })
  }, [targetLanguage, isActive])

  useEffect(() => {
    if (!isActive) {
      chrome.runtime.sendMessage({ type: "STOP_CAPTURE" })
      return
    }

    setError(null)
    setCaptions([])

    let cancelled = false
    const startCapture = (attempt = 1) => {
      chrome.runtime.sendMessage({ type: "START_CAPTURE", targetLang: targetLanguageRef.current }, (res) => {
        if (cancelled) return
        const combinedError = chrome.runtime.lastError?.message || (typeof res?.error === "string" ? res.error : "")
        if (res?.ok) return
        
        if (/receiving end does not exist|message port closed|No Tab ID|Failed to get stream ID/i.test(combinedError) && attempt < 3) {
          setTimeout(() => startCapture(attempt + 1), 200)
          return
        }
        setError(combinedError || "Failed to start capture.")
      })
    }
    startCapture()

    const handleMessage = (msg: any) => {
      if (msg.type === "CAPTION_UPDATE" && msg.text && isCaptionsDisplayedRef.current) {
        setCaptions((prev) => {
          // 🚨 THE FIX 1: Deep clone the array to prevent React state mutation glitches!
          const newCaptions = prev.map(c => ({ ...c }))

          if (msg.source === "original") {
            if (newCaptions.length === 0 || newCaptions[newCaptions.length - 1].isFinal) {
              newCaptions.push({
                id: Date.now().toString() + Math.random(),
                original: msg.text,
                translated: "",
                isFinal: msg.isFinal
              })
            } else {
              newCaptions[newCaptions.length - 1].original = msg.text
              newCaptions[newCaptions.length - 1].isFinal = msg.isFinal
            }
          } 
          else if (msg.source === "translated") {
            // 🚨 THE FIX 2: Search FORWARDS so translations always attach to the correct sentence in the queue
            for (let i = 0; i < newCaptions.length; i++) {
              if (newCaptions[i].isFinal && !newCaptions[i].translated) {
                newCaptions[i].translated = msg.text
                break
              }
            }
          }
          return newCaptions.slice(-3) // Keep 3 lines on screen
        })
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)
    return () => {
      cancelled = true
      chrome.runtime.onMessage.removeListener(handleMessage)
      chrome.runtime.sendMessage({ type: "STOP_CAPTURE" })
    }
  }, [isActive]) 

  return { captions, error }
}