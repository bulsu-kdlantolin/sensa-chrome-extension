import { useEffect, useState, useCallback } from "react"

export interface FrequencyData {
  frequencies: number[]
  isAlarmDetected: boolean
  speechEnergy: number
  alarmEnergy: number
}

interface BorderFlashState {
  isFlashing: boolean
  color: "green" | "red"
  intensity: number
}

export function useAudioFrequencyAnalysis(isActive: boolean) {
  const [frequencyData, setFrequencyData] = useState<FrequencyData>({
    frequencies: [],
    isAlarmDetected: false,
    speechEnergy: 0,
    alarmEnergy: 0
  })
  const [borderFlash, setBorderFlash] = useState<BorderFlashState>({
    isFlashing: false,
    color: "green",
    intensity: 0
  })

  const handleMessage = useCallback((msg: any) => {
    if (msg.type === "AUDIO_FREQUENCY_UPDATE" && isActive) {
      const { frequencies, isAlarmDetected, speechEnergy, alarmEnergy } = msg
      
      setFrequencyData({
        frequencies: frequencies || [],
        isAlarmDetected: isAlarmDetected || false,
        speechEnergy: speechEnergy || 0,
        alarmEnergy: alarmEnergy || 0
      })

      // Trigger border flash on alarm detection
      if (isAlarmDetected) {
        setBorderFlash({
          isFlashing: true,
          color: "red",
          intensity: Math.min(100, (alarmEnergy / 100) * 100) // 0-100 intensity
        })
        
        // Auto-fade out after 200ms
        setTimeout(() => {
          setBorderFlash((prev) => ({
            ...prev,
            isFlashing: false
          }))
        }, 200)
      } else {
        // Show subtle green flash during speech
        setBorderFlash({
          isFlashing: true,
          color: "green",
          intensity: Math.min(50, (speechEnergy / 50) * 50) // Lower intensity for normal speech
        })
        
        // Faster fade for normal speech
        setTimeout(() => {
          setBorderFlash((prev) => ({
            ...prev,
            isFlashing: false
          }))
        }, 100)
      }
    }
  }, [isActive])

  useEffect(() => {
    chrome.runtime.onMessage.addListener(handleMessage)
    
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage)
    }
  }, [handleMessage])

  return {
    frequencyData,
    borderFlash
  }
}
