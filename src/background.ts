declare var process: any;

// ==========================================
// ⚡ HIDDEN WAKE-UP PING FOR RENDER BACKEND
// ==========================================
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

async function getStreamIdWithRetry(targetTabId: number, attempts = 3): Promise<string> {
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

    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
  }

  throw new Error(lastError)
}

// ==========================================
// ⚡ TAB SWITCH / RELOAD DEACTIVATION (AUDITORY ONLY)
// Deactivates Auditory Mode dock when switching tabs or reloading so tabCapture authorization can be granted on popup open.
// DOES NOT reset user profile, activeMode, or Visual Mode.
// ==========================================
const deactivateAuditoryDock = () => {
  chrome.storage.local.set({
    sensa_auditory_active: false
  })
}

chrome.tabs.onActivated.addListener(() => {
  deactivateAuditoryDock()
})

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" && tab.url && !tab.url.startsWith("chrome://")) {
    deactivateAuditoryDock()
  }
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // --- DEEPL TRANSLATOR ---
  if (message?.type === "TRANSLATE_TEXT") {
    ; (async () => {
      try {
        const text = typeof message?.text === "string" ? message.text : ""
        const targetLang = typeof message?.targetLang === "string" ? message.targetLang : "EN"
        if (!text.trim()) return sendResponse({ ok: true, translated: "" })

        const deeplKey = process.env.PLASMO_PUBLIC_DEEPL_API_KEY
        if (!deeplKey) {
          return sendResponse({ ok: false, error: "missing DeepL API key in environment" })
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

  // --- START INVISIBLE CAPTURE ---
  if (message?.type === "START_CAPTURE") {
    ; (async () => {
      try {
        chrome.runtime.sendMessage({ type: "STOP_OFFSCREEN_CAPTURE" }).catch(() => { })
        await new Promise(r => setTimeout(r, 200))

        const targetTabId = await resolveTargetTabId(sender)
        if (targetTabId === null) {
          sendResponse({ ok: false, error: "No Tab ID (could not resolve active tab)" })
          return
        }

        await ensureOffscreen()

        const streamId = await getStreamIdWithRetry(targetTabId)

        // 🚨 THE FIX: Read chrome.storage here where it is safe, then pass deviceId!
        chrome.storage.local.get(["sensa_auditory_settings"], (res) => {
          const deviceId = res?.sensa_auditory_settings?.outputDevice || "default"

          chrome.runtime.sendMessage({
            type: "EXECUTE_OFFSCREEN_CAPTURE",
            streamId,
            targetLang: message.targetLang,
            targetTabId,
            deviceId // Passed safely to the offscreen document
          }).catch(() => { })
          sendResponse({ ok: true })
        })
      } catch (err) {
        sendResponse({ ok: false, error: String(err) })
      }
    })()
    return true
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