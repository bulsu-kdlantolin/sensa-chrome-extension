import { useEffect, useId, useRef } from "react"

interface FocusModeOverlayProps {
  intensity?: number
}

type Rect = {
  x: number
  y: number
  width: number
  height: number
}

// Returns the largest visible video element which is currently playing
const getLargestPlayingVideoRect = (): Rect | null => {
  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>("video"))
  let bestRect: Rect | null = null
  let bestArea = 0

  for (const v of videos) {
    try {
      const rect = v.getBoundingClientRect()
      const area = rect.width * rect.height
      if (rect.width < 140 || rect.height < 90) continue
      if (area <= bestArea) continue

      const style = window.getComputedStyle(v)
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) continue

      // Consider it a playing video only if it's not paused/ended and has progressed
      const isPlaying = !v.paused && !v.ended && v.currentTime > 0
      if (!isPlaying) continue

      bestArea = area
      bestRect = { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
    } catch (e) {
      continue
    }
  }

  return bestRect
}

// Attempt to find a visible captions container (used by players like YouTube)
const getVisibleCaptionRect = (vh: number): Rect | null => {
  const selectors = [
    ".ytp-caption-window-container",
    "[aria-live='polite']",
    "[aria-live='assertive']",
    "[role='status']",
    ".caption-window",
  ]

  const elements = selectors.flatMap((s) => Array.from(document.querySelectorAll<HTMLElement>(s)))
  let best: Rect | null = null
  let bestArea = 0

  for (const el of elements) {
    const style = window.getComputedStyle(el)
    if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) continue
    const rect = el.getBoundingClientRect()
    
    if (rect.top < vh * 0.4) continue // prefer bottom half
    const area = rect.width * rect.height
    if (area < 200) continue
    if (area > bestArea) {
      bestArea = area
      best = { x: rect.left, y: rect.top, width: rect.width, height: rect.height }
    }
  }

  return best
}

export default function FocusModeOverlay({ intensity = 0.7 }: FocusModeOverlayProps) {
  const maskId = useId().replace(/:/g, "")
  
  // 🚨 THE FIX: Use Refs to manipulate the SVG directly, bypassing React's scroll lag!
  const mainRectRef = useRef<SVGRectElement>(null)
  const captionRectRef = useRef<SVGRectElement>(null)

  useEffect(() => {
    let animationFrameId: number

    const loop = () => {
      const vh = window.innerHeight
      const videoRect = getLargestPlayingVideoRect()
      let capRect = getVisibleCaptionRect(vh)

      // If caption rect overlaps the video significantly, omit it to prevent ghost rectangles
      if (videoRect && capRect) {
        const overlapX = Math.max(0, Math.min(videoRect.x + videoRect.width, capRect.x + capRect.width) - Math.max(videoRect.x, capRect.x))
        const overlapY = Math.max(0, Math.min(videoRect.y + videoRect.height, capRect.y + capRect.height) - Math.max(videoRect.y, capRect.y))
        const overlapArea = overlapX * overlapY
        const capArea = capRect.width * capRect.height
        
        if (capArea > 0 && overlapArea / capArea > 0.25) {
          capRect = null
        }
      }

      // 🚨 Instantly update the DOM. No setState lag!
      if (mainRectRef.current) {
        if (videoRect) {
          mainRectRef.current.setAttribute("x", videoRect.x.toString())
          mainRectRef.current.setAttribute("y", videoRect.y.toString())
          mainRectRef.current.setAttribute("width", videoRect.width.toString())
          mainRectRef.current.setAttribute("height", videoRect.height.toString())
          mainRectRef.current.setAttribute("opacity", "1") // Show hole
        } else {
          mainRectRef.current.setAttribute("opacity", "0") // Hide hole (dims entire screen)
        }
      }

      if (captionRectRef.current) {
        if (capRect) {
          captionRectRef.current.setAttribute("x", capRect.x.toString())
          captionRectRef.current.setAttribute("y", capRect.y.toString())
          captionRectRef.current.setAttribute("width", capRect.width.toString())
          captionRectRef.current.setAttribute("height", capRect.height.toString())
          captionRectRef.current.setAttribute("opacity", "1")
        } else {
          captionRectRef.current.setAttribute("opacity", "0")
        }
      }

      animationFrameId = requestAnimationFrame(loop)
    }

    animationFrameId = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(animationFrameId)
    }
  }, [])

  return (
    <svg
      className="fixed inset-0 z-[99998] pointer-events-none block"
      width="100%"
      height="100%"
      // 🚨 THE FIX: Removed viewBox. Coordinates now perfectly map to screen pixels. No Deadspace!
      aria-hidden
    >
      <defs>
        <mask id={maskId}>
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
          
          <rect ref={mainRectRef} rx="12" fill="black" opacity="0" />
          <rect ref={captionRectRef} rx="8" fill="black" opacity="0" />
        </mask>
      </defs>

      <rect x="0" y="0" width="100%" height="100%" fill="black" fillOpacity={intensity} mask={`url(#${maskId})`} />
    </svg>
  )
}