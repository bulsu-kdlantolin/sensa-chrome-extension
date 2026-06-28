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
        
        if (/receiving end does not exist|message port closed|No Tab ID|Failed to get stream ID|offscreen|already exists/i.test(combinedError) && attempt < 5) {
          setTimeout(() => startCapture(attempt + 1), 250)
          return
        }
        if (/Extension has not been invoked|Chrome pages cannot be captured|activeTab|Failed to get stream ID|permission|not allowed|authorization/i.test(combinedError)) {
          setError("👆 Chrome requires authorization: please click the Sensa extension icon in your top Chrome toolbar once to enable live captions on this tab!")
          return
        }
        setError(combinedError || "Failed to start capture.")
      })
    }
    startCapture()

    const handleMessage = (msg: any) => {
      if (msg.type === "CAPTION_UPDATE" && msg.text && isCaptionsDisplayedRef.current) {
        setCaptions((prev) => {
          // Shallow clone the array to prevent React state mutation glitches while maintaining high performance!
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
            // Search FORWARDS so translations always attach to the correct sentence in the queue
            for (let i = 0; i < newCaptions.length; i++) {
              if (newCaptions[i].isFinal && !newCaptions[i].translated) {
                newCaptions[i] = {
                  ...newCaptions[i],
                  translated: msg.text
                }
                break
              }
            }
          }
          return newCaptions // Return the FULL history
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