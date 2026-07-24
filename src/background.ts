/**
 * @file background.ts
 * @description Background Service Worker governing background processes, audio proxying, and API integrations for Sensa.
 *
 * Architectural Overview:
 * 1. Offscreen Audio Proxy (`audioproxy.html`):
 *    - Manifest V3 Service Workers cannot directly access DOM media APIs or play/record audio streams.
 *    - When `START_CAPTURE` or `START_RADAR_CAPTURE` is invoked, this service worker creates an offscreen document (`audioproxy.html`).
 *    - It retrieves a media stream ID via `chrome.tabCapture.getMediaStreamId()` and forwards it to the offscreen document to connect to the WebSocket backend.
 *
 * 2. Message Routing & Fallbacks:
 *    - Routes transcription packets (`FORWARD_TO_TAB`) from the offscreen document back to the active tab's content script.
 *    - Implements retry logic with exponential backoff for tab capture stream acquisition.
 *
 * 3. Secure API Proxies:
 *    - `TRANSLATE_TEXT`: Proxies translation requests through the Render backend first, falling back to direct Azure Translator API calls.
 *    - `FETCH_GOOGLE_FONTS`: Fetches font lists server-side to bypass strict Content Security Policies (CSP) on sites like YouTube.
 */

declare var process: any;

import audioInterceptorScript from "url:./lib/audioInterceptorMain"

chrome.scripting.registerContentScripts([
  {
    id: "srcLibAudioInterceptorMain",
    js: [audioInterceptorScript.split("/").pop()?.split("?")[0] || "audioInterceptorMain.js"],
    matches: ["<all_urls>"],
    world: "MAIN",
    runAt: "document_start"
  }
]).catch(_ => {})

// Hidden wake-up ping for Azure backend
const RENDER_BACKEND_URL = "https://sensa-backend-api-d8brhwhufsb0cpbu.japaneast-01.azurewebsites.net/"
const pingBackend = () => {
  fetch(RENDER_BACKEND_URL).catch(() => { })
}
pingBackend()
setInterval(pingBackend, 10 * 60 * 1000)

async function ensureOffscreen() {
  const url = chrome.runtime.getURL("tabs/audioproxy.html")

  if (chrome.offscreen?.hasDocument) {
    const exists = await chrome.offscreen.hasDocument()
    if (exists) return
  }

  try {
    await chrome.offscreen.createDocument({
      url,
      reasons: ['USER_MEDIA', 'AUDIO_PLAYBACK'] as any[],
      justification: 'Capturing and playing tab audio'
    })
    // --- THE RACE CONDITION FIX ---
    // Give React 1 full second to boot up inside the invisible window before continuing
    await new Promise(resolve => setTimeout(resolve, 1000))
  } catch (e: any) {
    if (!e.message?.includes('Only a single offscreen') && !e.message?.includes('already exists')) throw e
  }
}

async function resetOffscreen() {
  try {
    if (chrome.offscreen?.hasDocument) {
      const exists = await chrome.offscreen.hasDocument()
      if (exists) {
        await chrome.offscreen.closeDocument().catch(() => { })
      }
    }
  } catch { }
}

async function resolveTargetTabId(sender: chrome.runtime.MessageSender): Promise<number | null> {
  if (typeof sender.tab?.id === "number") {
    return sender.tab.id
  }

  // Fallback for rare contexts where sender.tab is temporarily unavailable.
  try {
    const activeTabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true })
    const activeId = activeTabs?.[0]?.id
    return typeof activeId === "number" ? activeId : null
  } catch {
    return null
  }
}

async function getStreamIdWithRetry(targetTabId: number, attempts = 6): Promise<string> {
  let lastError = "Failed to get stream ID"

  for (let i = 0; i < attempts; i++) {
    const streamId = await new Promise<string | null>((resolve) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId }, (id) => {
        const err = chrome.runtime.lastError?.message
        if (err || !id) {
          lastError = err || "Failed to get stream ID"
          resolve(null)
          return
        }
        resolve(id)
      })
    })

    if (streamId) {
      return streamId
    }

    const lowerErr = lastError.toLowerCase()
    if (lowerErr.includes("active stream") || lowerErr.includes("cannot capture") || lowerErr.includes("invalid state")) {
      await chrome.runtime.sendMessage({ type: "STOP_OFFSCREEN_CAPTURE" }).catch(() => { })
      await new Promise((resolve) => setTimeout(resolve, 300))
      continue
    }

    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
  }

  throw new Error(lastError)
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // --- TRANSLATION PROXY (backend-first, with direct Azure Translator fallback) ---
  if (message?.type === "TRANSLATE_TEXT") {
    ; (async () => {
      try {
        const text = typeof message?.text === "string" ? message.text : ""
        const targetLang = typeof message?.targetLang === "string" ? message.targetLang : "es"
        if (!text.trim()) return sendResponse({ ok: true, translated: "" })

        // Try backend /translate endpoint first (keeps API keys server-side)
        try {
          const backendRes = await fetch(`${RENDER_BACKEND_URL}translate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, targetLang })
          })
          if (backendRes.ok) {
            const backendPayload = await backendRes.json()
            if (backendPayload?.ok && typeof backendPayload.translated === "string") {
              return sendResponse({ ok: true, translated: backendPayload.translated })
            }
          }
        } catch (_) { /* backend unavailable, fall through to direct Azure Translator */ }

        // Fallback: call Azure Translator directly using local env key
        const azureKey = process.env.PLASMO_PUBLIC_AZURE_TRANSLATOR_KEY
        if (!azureKey) {
          return sendResponse({ ok: false, error: "Translation service unavailable" })
        }

        const azureRegion = process.env.PLASMO_PUBLIC_AZURE_REGION || "eastasia"
        const response = await fetch(`https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${targetLang.toLowerCase()}`, {
          method: "POST",
          headers: {
            "Ocp-Apim-Subscription-Key": azureKey,
            "Ocp-Apim-Subscription-Region": azureRegion,
            "Content-Type": "application/json"
          },
          body: JSON.stringify([{ text }])
        })

        if (!response.ok) throw new Error(`Azure Translator failed: ${response.status}`)
        const payload = await response.json()
        const translated = payload?.[0]?.translations?.[0]?.text
        if (typeof translated !== "string") throw new Error("Translation failed.")
        sendResponse({ ok: true, translated })
      } catch (error) {
        sendResponse({ ok: false, error: String(error) })
      }
    })()
    return true
  }

  // --- CAPTURE VISIBLE TAB FOR SCREEN MAGNIFIER ---
  if (message?.action === "CAPTURE_VISIBLE_TAB") {
    const windowId = sender.tab?.windowId;
    if (windowId !== undefined) {
      chrome.tabs.captureVisibleTab(windowId, { format: "jpeg", quality: 90 }, (dataUrl) => {
        sendResponse({ dataUrl });
      });
    } else {
      chrome.tabs.captureVisibleTab({ format: "jpeg", quality: 90 }, (dataUrl) => {
        sendResponse({ dataUrl });
      });
    }
    return true; // Keep message channel open for async response
  }

  // --- START AUDITORY RADAR CAPTURE ---
  if (message?.type === "START_RADAR_CAPTURE") {
    sendResponse({ ok: true })
    ; (async () => {
      try {
        const targetTabId = await resolveTargetTabId(sender)
        if (targetTabId === null) return

        await chrome.runtime.sendMessage({ type: "STOP_OFFSCREEN_CAPTURE", force: true }).catch(() => { })
        await new Promise(resolve => setTimeout(resolve, 200))

        await ensureOffscreen()

        const streamId = await getStreamIdWithRetry(targetTabId)

        const storageRes = await chrome.storage.local.get(["sensa_auditory_settings"])
        const deviceId = storageRes?.sensa_auditory_settings?.outputDevice || "default"

        let executeSuccess = false
        for (let i = 0; i < 5; i++) {
          const delivered = await new Promise((resolve) => {
            chrome.runtime.sendMessage({
              type: "EXECUTE_OFFSCREEN_CAPTURE",
              streamId,
              targetLang: "EN",
              targetTabId,
              deviceId,
              enableSTT: false
            }, (res) => {
              resolve(!!res?.ok)
            })
          })
          if (delivered) {
            executeSuccess = true
            break
          }
          await new Promise(resolve => setTimeout(resolve, 300))
        }
        if (!executeSuccess) {
          throw new Error("Failed to connect to background audio processor.")
        }
      } catch (err) {
        // Quietly ignore if activeTab wasn't invoked on this reload
      }
    })()
    return false
  }

  // --- START INVISIBLE CAPTURE ---
  if (message?.type === "START_CAPTURE") {
    sendResponse({ ok: true })
      ; (async () => {
        let targetTabId: number | null = null
        try {
          targetTabId = await resolveTargetTabId(sender)
          if (targetTabId === null) {
            throw new Error("No Tab ID (could not resolve active tab)")
          }

          const isAlreadyCapturing = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: "PING_OFFSCREEN_CAPTURE", targetTabId }, (res) => {
              resolve(res?.isCapturing === true)
            })
            setTimeout(() => resolve(false), 250)
          })

          if (isAlreadyCapturing) {
            return
          }

          await chrome.runtime.sendMessage({ type: "STOP_OFFSCREEN_CAPTURE", force: true }).catch(() => { })
          await new Promise(resolve => setTimeout(resolve, 200))

          await ensureOffscreen()

          const streamId = await getStreamIdWithRetry(targetTabId)

          const storageRes = await chrome.storage.local.get(["sensa_auditory_settings"])
          const deviceId = storageRes?.sensa_auditory_settings?.outputDevice || "default"

          let executeSuccess = false
          for (let i = 0; i < 5; i++) {
            const delivered = await new Promise((resolve) => {
              chrome.runtime.sendMessage({
                type: "EXECUTE_OFFSCREEN_CAPTURE",
                streamId,
                targetLang: message.targetLang,
                sourceLang: message.sourceLang,
                targetTabId,
                deviceId,
                enableSTT: true
              }, (res) => {
                resolve(!!res?.ok)
              })
            })
            if (delivered) {
              executeSuccess = true
              break
            }
            await new Promise(resolve => setTimeout(resolve, 300))
          }
          if (!executeSuccess) {
            throw new Error("Failed to connect to background audio processor.")
          }
        } catch (err: any) {
          if (targetTabId) {
            chrome.tabs.sendMessage(targetTabId, { type: "CAPTION_ERROR", error: String(err?.message || err) }).catch(() => { })
          }
        }
      })()
    return false
  }

  // --- STOP CAPTURE ---
  if (message?.type === "STOP_CAPTURE") {
    ; (async () => {
      try {
        const senderTabId = await resolveTargetTabId(sender)
        chrome.runtime.sendMessage({ type: "STOP_OFFSCREEN_CAPTURE", senderTabId }).catch(() => { })
        sendResponse({ ok: true })
      } catch (err) {
        sendResponse({ ok: false, error: String(err) })
      }
    })()
    return true
  }

  if (message?.type === "UPDATE_CAPTION_LANGUAGE") {
    chrome.runtime.sendMessage({
      type: "UPDATE_CAPTION_LANGUAGE_OFFSCREEN",
      targetLang: message.targetLang
    }).catch(() => { })
    sendResponse({ ok: true })
    return false
  }

  if (message?.type === "UPDATE_SOURCE_LANGUAGE") {
    chrome.runtime.sendMessage({
      type: "UPDATE_SOURCE_LANGUAGE_OFFSCREEN",
      sourceLang: message.sourceLang
    }).catch(() => { })
    sendResponse({ ok: true })
    return false
  }

  if (message?.type === "sensa-activate-mode") {
    sendResponse({ ok: true })
    chrome.tabs.query({ url: ["http://*/*", "https://*/*"] }, (tabs) => {
      tabs?.forEach(t => {
        if (typeof t.id === "number") {
          chrome.tabs.sendMessage(t.id, message).catch(() => {})
        }
      })
    })
    return false
  }

  // Forward offscreen transcription updates to the originating tab's content script.
  if (message?.type === "FORWARD_TO_TAB" && message.tabId) {
    chrome.tabs.sendMessage(message.tabId, message.payload).catch(() => { })
    sendResponse({ ok: true })
    return false
  }

  // Relay live caption state to all child/nested iframes within the active tab
  if (message?.type === "SENSA_BROADCAST_TO_ALL_FRAMES") {
    const tabId = sender.tab?.id
    if (tabId && message.payload) {
      if (chrome.webNavigation && chrome.webNavigation.getAllFrames) {
        chrome.webNavigation.getAllFrames({ tabId }, (frames) => {
          frames?.forEach(f => {
            if (f.frameId !== 0) {
              chrome.tabs.sendMessage(tabId, message.payload, { frameId: f.frameId }).catch(() => { })
            }
          })
        })
      } else {
        chrome.tabs.sendMessage(tabId, message.payload).catch(() => { })
      }
    }
    sendResponse({ ok: true })
    return false
  }


  // --- FETCH GOOGLE FONTS (Bypasses YouTube's strict CSP!) ---
  if (message?.type === "FETCH_GOOGLE_FONTS") {
    ; (async () => {
      try {
        // Grab the key securely from the background environment
        const apiKey = process.env.PLASMO_PUBLIC_GOOGLE_FONTS_API_KEY;

        if (!apiKey) {
          return sendResponse({ ok: false, error: "missing api key in background" });
        }

        const res = await fetch(`https://www.googleapis.com/webfonts/v1/webfonts?key=${apiKey}&sort=popularity`);

        if (!res.ok) throw new Error("Google Fonts API failed: " + res.status);

        const data = await res.json();
        sendResponse({ ok: true, items: data.items });
      } catch (error) {
        sendResponse({ ok: false, error: String(error) });
      }
    })();
    return true; // Keeps the message channel open for the async response
  }
})

// Auto-inject content script into all open HTTP/HTTPS tabs on extension reload or update
chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.query({ url: ["http://*/*", "https://*/*"] }, async (tabs) => {
    const manifest = chrome.runtime.getManifest()
    const jsFiles = manifest?.content_scripts?.[0]?.js || []
    if (jsFiles.length === 0) return

    for (const tab of tabs) {
      if (typeof tab.id === "number") {
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: jsFiles
          })
        } catch {
          // Ignore tabs with strict CSP or restricted permissions
        }
      }
    }
  })
})