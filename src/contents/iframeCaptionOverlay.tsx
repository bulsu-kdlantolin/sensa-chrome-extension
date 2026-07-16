/**
 * @file iframeCaptionOverlay.tsx
 * @description Dedicated cross-origin iframe content script (`all_frames: true`) that renders `LiveCaptionBox` directly inside iframe video players when the iframe is in fullscreen mode (such as embedded players on anime streaming sites like MegaCloud, VidCloud, Crunchyroll, and 9anime).
 */

import cssText from "data-text:~style.css"
import type { PlasmoCSConfig } from "plasmo"
import React, { useState, useEffect } from "react"
import { createPortal } from "react-dom"
import LiveCaptionBox, { type CaptionBlock } from "../components/LiveCaptionBox"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  all_frames: true
}

export const getStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

interface IframeCaptionState {
  active: boolean
  captions: CaptionBlock[]
  captionsError: string | null
  textSize: number
  auditorySettings: any
  captionTransparency: number
  sourceLanguage: string
  targetLanguage: string
}

export default function IframeCaptionOverlay() {
  // Only activate if we are running inside an iframe (not window.top)
  const [isIframe] = useState(() => window !== window.top)
  const [fsTarget, setFsTarget] = useState<Element | null>(() => {
    if (window === window.top) return null
    return document.fullscreenElement || (document as any).webkitFullscreenElement || null
  })

  const [state, setState] = useState<IframeCaptionState>({
    active: false,
    captions: [],
    captionsError: null,
    textSize: 16,
    auditorySettings: { textColor: "#FFFFFF", captionBgColor: "#000000", fontFamily: "Arial", showOriginalText: true, translationEnabled: true },
    captionTransparency: 75,
    sourceLanguage: "en",
    targetLanguage: "EN"
  })

  useEffect(() => {
    if (!isIframe) return

    const updateFs = () => {
      const fsEl = document.fullscreenElement || (document as any).webkitFullscreenElement || null
      setFsTarget(fsEl)
      if (!fsEl) {
        document.querySelectorAll("#sensa-iframe-fullscreen-caption-host").forEach(el => el.remove())
      }
    }

    document.addEventListener("fullscreenchange", updateFs, true)
    document.addEventListener("webkitfullscreenchange", updateFs, true)

    // Listen to window.postMessage broadcasts from window.top (content.tsx)
    const handleWindowMessage = (e: MessageEvent) => {
      const msg = e.data
      if (msg && msg.type === "SENSA_IFRAME_CAPTIONS_UPDATE") {
        setState({
          active: Boolean(msg.active),
          captions: msg.captions || [],
          captionsError: msg.captionsError || null,
          textSize: typeof msg.textSize === "number" ? msg.textSize : 16,
          auditorySettings: msg.auditorySettings || { textColor: "#FFFFFF", captionBgColor: "#000000", fontFamily: "Arial", showOriginalText: true, translationEnabled: true },
          captionTransparency: typeof msg.captionTransparency === "number" ? msg.captionTransparency : 75,
          sourceLanguage: msg.sourceLanguage || "en",
          targetLanguage: msg.targetLanguage || "EN"
        })
      }
    }
    window.addEventListener("message", handleWindowMessage)

    // Also listen to runtime messages from background.ts (for nested cross-origin frames)
    const handleRuntimeMessage = (msg: any) => {
      if (msg && msg.type === "SENSA_IFRAME_CAPTIONS_UPDATE") {
        setState({
          active: Boolean(msg.active),
          captions: msg.captions || [],
          captionsError: msg.captionsError || null,
          textSize: typeof msg.textSize === "number" ? msg.textSize : 16,
          auditorySettings: msg.auditorySettings || { textColor: "#FFFFFF", captionBgColor: "#000000", fontFamily: "Arial", showOriginalText: true, translationEnabled: true },
          captionTransparency: typeof msg.captionTransparency === "number" ? msg.captionTransparency : 75,
          sourceLanguage: msg.sourceLanguage || "en",
          targetLanguage: msg.targetLanguage || "EN"
        })
      }
    }
    chrome.runtime.onMessage.addListener(handleRuntimeMessage)

    return () => {
      document.removeEventListener("fullscreenchange", updateFs, true)
      document.removeEventListener("webkitfullscreenchange", updateFs, true)
      window.removeEventListener("message", handleWindowMessage)
      chrome.runtime.onMessage.removeListener(handleRuntimeMessage)
    }
  }, [isIframe])

  // If we are in window.top OR captions are not active OR this iframe is not currently in fullscreen, do not render!
  if (!isIframe || !state.active || !fsTarget) {
    return null
  }

  const hexToRgb = (hex: string) => {
    const cleaned = (hex || "#000000").trim().replace(/^#/, "")
    if (!/^([A-Fa-f0-9]{6})$/.test(cleaned)) return null
    const value = Number.parseInt(cleaned, 16)
    return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
  }

  const colorWithOpacity = (hex: string, opacity: number) => {
    const rgb = hexToRgb(hex)
    const alpha = Math.max(0.1, Math.min(1, opacity))
    if (!rgb) return `rgba(0, 0, 0, ${alpha})`
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
  }

  const targetContainer =
    fsTarget.tagName.toUpperCase() === "VIDEO" && fsTarget.parentElement
      ? fsTarget.parentElement
      : fsTarget

  let hostEl = targetContainer.querySelector("#sensa-iframe-fullscreen-caption-host") as HTMLDivElement
  if (!hostEl) {
    hostEl = document.createElement("div")
    hostEl.id = "sensa-iframe-fullscreen-caption-host"
    hostEl.style.cssText =
      "position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; z-index: 2147483647;"
    targetContainer.appendChild(hostEl)
  }

  if (!hostEl.shadowRoot) {
    const shadow = hostEl.attachShadow({ mode: "open" })
    const style = document.createElement("style")
    style.textContent = cssText
    shadow.appendChild(style)
    const rootDiv = document.createElement("div")
    rootDiv.id = "sensa-iframe-fullscreen-caption-root"
    rootDiv.style.cssText = "pointer-events: auto; width: 100%; height: 100%;"
    shadow.appendChild(rootDiv)
  }

  const portalRoot = hostEl.shadowRoot.querySelector("#sensa-iframe-fullscreen-caption-root")
  if (!portalRoot) {
    return null
  }

  return createPortal(
    <LiveCaptionBox
      captions={state.captions}
      error={state.captionsError}
      fontSize={state.textSize}
      textColor={state.auditorySettings.textColor || "#FFFFFF"}
      bgColor={colorWithOpacity(
        state.auditorySettings.captionBgColor || "#000000",
        state.captionTransparency / 100
      )}
      fontFamily={state.auditorySettings.fontFamily || "Arial"}
      showOriginalText={state.auditorySettings.translationEnabled === false ? true : state.auditorySettings.showOriginalText}
      translationEnabled={state.auditorySettings.translationEnabled !== false}
      sourceLanguage={state.sourceLanguage}
      targetLanguage={state.targetLanguage}
    />,
    portalRoot
  )
}
