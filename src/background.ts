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
 *    - `TRANSLATE_TEXT`: Proxies translation requests through the Render backend first, falling back to direct DeepL API calls.
 *    - `FETCH_GOOGLE_FONTS`: Fetches font lists server-side to bypass strict Content Security Policies (CSP) on sites like YouTube.
 */

declare var process: any;

// Hidden wake-up ping for Render backend (prevents cold start delays)
const RENDER_BACKEND_URL = "https://sensa-chrome-extension-backend.onrender.com/"
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
  // --- TRANSLATION PROXY (backend-first, with direct DeepL fallback) ---
  if (message?.type === "TRANSLATE_TEXT") {
    ; (async () => {
      try {
        const text = typeof message?.text === "string" ? message.text : ""
        const targetLang = typeof message?.targetLang === "string" ? message.targetLang : "EN"
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
        } catch (_) { /* backend unavailable, fall through to direct DeepL */ }

        // Fallback: call DeepL directly using local .env key
        const deeplKey = process.env.PLASMO_PUBLIC_DEEPL_API_KEY
        if (!deeplKey) {
          return sendResponse({ ok: false, error: "Translation service unavailable" })
        }

        const params = new URLSearchParams()
        params.append("text", text)
        params.append("target_lang", targetLang)

        const response = await fetch("https://api-free.deepl.com/v2/translate", {
          method: "POST",
          headers: {
            Authorization: `DeepL-Auth-Key ${deeplKey}`,
            "Content-Type": "application/x-www-form-urlencoded"
          },
          body: params.toString()
        })

        if (!response.ok) throw new Error(`DeepL failed: ${response.status}`)
        const payload = await response.json()
        const translated = payload?.translations?.[0]?.text
        if (typeof translated !== "string") throw new Error("Translation failed.")
        sendResponse({ ok: true, translated })
      } catch (error) {
        sendResponse({ ok: false, error: String(error) })
      }
    })()
    return true
  }

  // --- START AUDITORY RADAR CAPTURE ---
  if (message?.type === "START_RADAR_CAPTURE") {
    sendResponse({ ok: true })
    ; (async () => {
      try {
        const targetTabId = await resolveTargetTabId(sender)
        if (targetTabId === null) return

        await chrome.runtime.sendMessage({ type: "STOP_OFFSCREEN_CAPTURE" }).catch(() => { })
        await new Promise(resolve => setTimeout(resolve, 200))

        await ensureOffscreen()

        const streamId = await getStreamIdWithRetry(targetTabId)

        const storageRes = await chrome.storage.local.get(["sensa_auditory_settings"])
        const deviceId = storageRes?.sensa_auditory_settings?.outputDevice || "default"

        chrome.runtime.sendMessage({
          type: "EXECUTE_OFFSCREEN_CAPTURE",
          streamId,
          targetLang: "EN",
          targetTabId,
          deviceId,
          enableSTT: false
        }).catch(() => { })
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

          await chrome.runtime.sendMessage({ type: "STOP_OFFSCREEN_CAPTURE" }).catch(() => { })
          await new Promise(resolve => setTimeout(resolve, 200))

          await ensureOffscreen()

          const streamId = await getStreamIdWithRetry(targetTabId)

          const storageRes = await chrome.storage.local.get(["sensa_auditory_settings"])
          const deviceId = storageRes?.sensa_auditory_settings?.outputDevice || "default"

          chrome.runtime.sendMessage({
            type: "EXECUTE_OFFSCREEN_CAPTURE",
            streamId,
            targetLang: message.targetLang,
            sourceLang: message.sourceLang,
            targetTabId,
            deviceId,
            enableSTT: true
          }).catch(() => { })
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
        chrome.runtime.sendMessage({ type: "STOP_OFFSCREEN_CAPTURE" }).catch(() => { })
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

  // Forward offscreen transcription updates to the originating tab's content script.
  if (message?.type === "FORWARD_TO_TAB" && message.tabId) {
    chrome.tabs.sendMessage(message.tabId, message.payload).catch(() => { })
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