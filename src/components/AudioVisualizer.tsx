import React, { useEffect, useRef, useState } from "react"
import { motion, useMotionValue } from "motion/react"

interface AudioVisualizerProps {
  isActive: boolean
  isDark: boolean
}

const BAR_COUNT = 4

// Standard function declaration helps HMR and Fast Refresh identify the component
function AudioVisualizer({ isActive, isDark }: AudioVisualizerProps) {
  const targetRef = useRef({ frequencies: [] as number[], lastUpdate: 0, alarmEnergy: 0, speechEnergy: 0 })
  const barsRef = useRef<Array<HTMLDivElement | null>>([])

  // Do NOT call React hooks inside Array.from() !
  const hook1Scale = useMotionValue(0.22)
  const hook2Scale = useMotionValue(0.22)
  const hook3Scale = useMotionValue(0.22)
  const hook4Scale = useMotionValue(0.22)
  const scales = [hook1Scale, hook2Scale, hook3Scale, hook4Scale]

  const hook1Op = useMotionValue(0.5)
  const hook2Op = useMotionValue(0.5)
  const hook3Op = useMotionValue(0.5)
  const hook4Op = useMotionValue(0.5)
  const opacities = [hook1Op, hook2Op, hook3Op, hook4Op]

  useEffect(() => {
    const handleMessage = (msg: any) => {
      try {
        if (msg?.type !== "AUDIO_FREQUENCY_UPDATE") return
        targetRef.current.frequencies = Array.isArray(msg.frequencies) ? msg.frequencies : []
        targetRef.current.lastUpdate = performance.now()
        targetRef.current.alarmEnergy = msg.alarmEnergy || 0
        targetRef.current.speechEnergy = msg.speechEnergy || 0
      } catch (e) {
        // swallow
      }
    }
    chrome.runtime.onMessage.addListener(handleMessage)
    return () => chrome.runtime.onMessage.removeListener(handleMessage)
  }, [])

  useEffect(() => {
    if (!isActive) return
    let raf = 0
    let t = 0

    const lerp = (a: number, b: number, n: number) => (1 - n) * a + n * b

    const loop = () => {
      t++
      const now = performance.now()
      const data = targetRef.current
      const hasLiveAudio = now - data.lastUpdate < 250 && data.frequencies.length > 0
      const alarmMode = data.alarmEnergy > data.speechEnergy * 1.5 && data.alarmEnergy > 40
      const freqs = data.frequencies
      const bandSize = Math.max(1, Math.floor(freqs.length / BAR_COUNT))

      for (let i = 0; i < BAR_COUNT; i++) {
        const start = i * bandSize
        const end = i === BAR_COUNT - 1 ? freqs.length : start + bandSize
        const slice = freqs.slice(start, end)
        const avg = slice.length ? slice.reduce((s, v) => s + v, 0) / slice.length : 0
        const peak = slice.length ? Math.max(...slice) : 0
        const energy = hasLiveAudio ? (peak * 0.6 + avg * 0.4) : 0
        const normalized = Math.min(1, energy / 255)

        const idle = 0.18 + Math.sin(t * 0.04 + i * 0.9) * 0.06
        const live = hasLiveAudio ? 0.18 + normalized * 0.95 : idle
        const targetScale = Math.max(0.16, Math.min(1.25, alarmMode ? live * 1.25 : live))
        const targetOpacity = alarmMode ? 0.98 : hasLiveAudio ? 0.9 : 0.45

        const cur = scales[i].get()
        const amt = targetScale > cur ? 0.28 : 0.08
        scales[i].set(lerp(cur, targetScale, amt))

        const curOp = opacities[i].get()
        opacities[i].set(lerp(curOp, targetOpacity, 0.12))

        const el = barsRef.current[i]
        if (el) {
          if (alarmMode) {
            el.style.background = "linear-gradient(to top, #ef4444, #f87171, #fb923c)"
            el.style.boxShadow = "0 0 12px rgba(239,68,68,0.5)"
          } else if (hasLiveAudio) {
            el.style.background = "linear-gradient(to top, #FF7A2F, #FF9B4D, #FFD4A3)"
            el.style.boxShadow = "0 0 10px rgba(255,122,47,0.35)"
          } else {
            el.style.background = isDark ? "linear-gradient(to top,#6b7280,#9ca3af)" : "linear-gradient(to top,#d1d5db,#e5e7eb)"
            el.style.boxShadow = "none"
          }
        }
      }

      raf = requestAnimationFrame(loop)
    }

    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [isActive, isDark])

  return (
    <div className="flex items-center justify-center h-full w-full">
      <div className="flex items-end gap-[4px]" style={{ height: 20 }}>
        {Array.from({ length: BAR_COUNT }).map((_, i) => (
          <motion.div
            key={i}
            ref={(el) => (barsRef.current[i] = el)}
            className="w-[4px] rounded-full"
            style={{
              scaleY: scales[i],
              opacity: opacities[i],
              transformOrigin: "bottom center",
              willChange: "transform, opacity"
            }}
          />
        ))}
      </div>
    </div>
  )
}

export default AudioVisualizer
