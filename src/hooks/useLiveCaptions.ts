import { useEffect, useRef, useState } from "react"

// 🚨 Define the stacked data structure
export interface CaptionBlock {
  id: string
  original: string
  translated: string
  isFinal: boolean
}

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

  // 🚀 INSTANT RETRY ON POPUP OPEN: When the user clicks the Sensa extension icon in the top Chrome toolbar after getting an authorization error,
  // Chrome grants activeTab permission. Since focus moves to the popup, window.onfocus doesn't fire on the webpage.
  // We watch isPopupOpen directly and instantly retry capture so captions start immediately without needing to refresh or reactivate!
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