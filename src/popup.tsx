/**
 * @file popup.tsx
 * @description Main Chrome Extension popup window rendered when clicking the Sensa icon in the browser toolbar.
 *
 * Architectural Overview:
 * 1. Onboarding & Mode Routing:
 *    - Checks `sensa_user_profile` in `chrome.storage.local`.
 *    - If onboarding is incomplete, routes through Mode Selection (`ModeSelection`) and Welcome flows (`VisualWelcomeOverlay` / `AuditoryWelcomeOverlay`).
 *    - Once configured, routes directly to the active Dashboard (`Dashboard`).
 *
 * 2. Active Tab Authorization:
 *    - Opening this popup automatically grants `activeTab` permission for the currently active tab.
 *    - This permission allows content scripts and live captioning to capture tab media and inject Shadow DOM UI without requiring manual page refreshes.
 */

import { useState, useEffect } from "react"
import "./style.css"
import ModeSelection from "./components/ModeSelection"
import VisualWelcomeOverlay from "./components/VisualWelcomeOverlay"
import AuditoryWelcomeOverlay from "./components/AuditoryWelcomeOverlay"
import Dashboard from "./components/Dashboard"
import type { SensaUserProfile } from "./lib/storage"
import { DEFAULT_PROFILE } from "./lib/storage"

/**
 * Root component for the extension popup window.
 */
export default function IndexPopup() {
  const [currentView, setCurrentView] = useState<"LOADING" | "MODE_SELECTION" | "WELCOME" | "DASHBOARD">("LOADING")
  const [userProfile, setUserProfile] = useState<SensaUserProfile | null>(null)
  const [currentTheme, setCurrentTheme] = useState<"light" | "dark">("light") // Persistable theme state

  // 1. Boot up and load persistent data
  useEffect(() => {
    let didLoad = false

    const loadProfile = () => {
      chrome.storage.local.get(["sensa_user_profile"], (result) => {
        didLoad = true

        if (chrome.runtime.lastError) {
          console.error("Storage error:", chrome.runtime.lastError)
          setUserProfile(DEFAULT_PROFILE)
          setCurrentTheme(DEFAULT_PROFILE.globalSettings.theme)
          setCurrentView("MODE_SELECTION")
          return
        }

        if (result.sensa_user_profile) {
          const profile = result.sensa_user_profile as SensaUserProfile
          setUserProfile(profile)
          setCurrentTheme(profile.globalSettings.theme)

          if (!profile.globalSettings.activeMode) {
            setCurrentView("MODE_SELECTION")
          } else if (!profile.globalSettings.hasSeenWelcome) {
            setCurrentView("WELCOME")
          } else {
            setCurrentView("DASHBOARD")
          }
        } else {
          chrome.storage.local.set({ sensa_user_profile: DEFAULT_PROFILE }, () => {
            setUserProfile(DEFAULT_PROFILE)
            setCurrentTheme(DEFAULT_PROFILE.globalSettings.theme)
            setCurrentView("MODE_SELECTION")
          })
        }
      })
    }

    loadProfile()

    // Timeout fallback in case storage doesn't respond — use `didLoad` flag
    const timeoutId = setTimeout(() => {
      if (!didLoad) {
        setUserProfile(DEFAULT_PROFILE)
        setCurrentTheme(DEFAULT_PROFILE.globalSettings.theme)
        setCurrentView("MODE_SELECTION")
      }
    }, 2000)

    return () => clearTimeout(timeoutId)
  }, [])

  // Voice command on Mode Selection writes activeMode directly to storage — sync popup view
  useEffect(() => {
    const handleVoiceModeApplied = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      const profileChange = changes.sensa_user_profile
      if (!profileChange?.newValue) return

      const profile = profileChange.newValue as SensaUserProfile
      const activeMode = profile.globalSettings?.activeMode
      if (!activeMode) return

      setUserProfile(profile)
      setCurrentTheme(profile.globalSettings.theme)
      setCurrentView((prev) => (prev === "MODE_SELECTION" ? "WELCOME" : prev))
    }

    chrome.storage.onChanged.addListener(handleVoiceModeApplied)
    return () => chrome.storage.onChanged.removeListener(handleVoiceModeApplied)
  }, [])

  // Automatically close the popup when Visual Mode is activated to immediately focus the user on the webpage dock
  useEffect(() => {
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.sensa_visual_activated_via_voice?.newValue === true) {
        window.close()
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [])

  // Establish a connection port with the active tab's content script to track when popup is open
  useEffect(() => {
    let port: chrome.runtime.Port | null = null

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs?.find(t => t.url && (t.url.startsWith("http://") || t.url.startsWith("https://"))) || tabs?.[0]
      const tabId = activeTab?.id
      if (!tabId) return

      if (activeTab.url && (activeTab.url.startsWith("chrome://") || activeTab.url.startsWith("edge://") || activeTab.url.startsWith("about:"))) {
        return
      }

      try {
        port = chrome.tabs.connect(tabId, { name: "sensa-popup" })
      } catch (e) {
        console.warn("[Sensa Popup] Failed to connect port to tab:", e)
      }
    })

    return () => {
      if (port) {
        port.disconnect()
      }
    }
  }, [])


  // 2. Safely update persistent JSON database
  const updateProfile = (updates: Partial<SensaUserProfile>): Promise<void> => {
    return new Promise((resolve) => {
      if (!userProfile) {
        // initialize if missing
        const newProfile = { ...DEFAULT_PROFILE, ...updates }
        chrome.storage.local.set({ sensa_user_profile: newProfile }, () => {
          setUserProfile(newProfile)
          resolve()
        })
        return
      }

      const newProfile = { ...userProfile, ...updates }
      chrome.storage.local.set({ sensa_user_profile: newProfile }, () => {
        setUserProfile(newProfile)
        resolve()
      })
    })
  }

  // 3. UI Handlers with persistent save
  const handleSelectMode = async (mode: "visual" | "auditory") => {
    await updateProfile({
      globalSettings: { ...userProfile!.globalSettings, activeMode: mode }
    })
    const extraDefaults = mode === "visual" ? {
      sensa_visual_highlight_mouse_screen_reader: true,
      sensa_visual_image_alt_reader_enabled: true,
      sensa_visual_voice_guide_enabled: true,
      sensa_visual_autoscroll_enabled: true
    } : {}
    // Persist the last-opened tab so Dashboard hydrates into the selected mode
    chrome.storage.local.set({ sensa_last_tab: mode, ...extraDefaults }, () => {
      setCurrentView("WELCOME")
    })
  }

  const handleGetStarted = async () => {
    await updateProfile({
      globalSettings: { ...userProfile!.globalSettings, hasSeenWelcome: true }
    })
    // Ensure Dashboard picks up the active mode immediately
    const active = userProfile?.globalSettings.activeMode ?? null
    chrome.storage.local.set({ sensa_last_tab: active }, () => {
      setCurrentView("DASHBOARD")
    })
  }

  // Handle persistent theme change
  const handleThemeChange = (newTheme: "light" | "dark") => {
    updateProfile({
      globalSettings: { ...userProfile!.globalSettings, theme: newTheme }
    })
    setCurrentTheme(newTheme) // Set local state for immediate update
  }

  const handleResetApp = () => {
    chrome.storage.local.set({
      sensa_user_profile: DEFAULT_PROFILE,
      sensa_visual_active: false,
      sensa_auditory_active: false,
      sensa_voice_command_active: false,
      sensa_visual_highlight_mouse_screen_reader: true,
      sensa_visual_image_alt_reader_enabled: true,
      sensa_visual_voice_guide_enabled: true,
      sensa_visual_autoscroll_enabled: true
    }, () => {
      chrome.runtime.sendMessage({ type: "sensa-activate-mode", mode: null }, () => {
        const _ = chrome.runtime.lastError
      })
      setUserProfile(DEFAULT_PROFILE)
      setCurrentTheme(DEFAULT_PROFILE.globalSettings.theme)
      setCurrentView("MODE_SELECTION")
    })
  }

  const handleModeChange = (mode: "visual" | "auditory") => {
    updateProfile({
      globalSettings: { ...userProfile!.globalSettings, activeMode: mode }
    })
  }

  // View routing based on user profile state and onboarding completion
  if (currentView === "LOADING" || !userProfile) {
    return <div className="w-[350px] h-[550px] bg-white flex items-center justify-center text-gray-800">Loading Data...</div>
  }

  // MODE_SELECTION is ALWAYS first unless already completed the welcome flow
  if (currentView === "MODE_SELECTION") {
    return <ModeSelection theme="light" onSelectMode={handleSelectMode} />
  }

  if (currentView === "WELCOME") {
    return userProfile.globalSettings.activeMode === "auditory"
      ? <AuditoryWelcomeOverlay theme="light" onGetStarted={handleGetStarted} />
      : <VisualWelcomeOverlay theme="light" onGetStarted={handleGetStarted} />
  }

  // Dashboard is now an animating view manger. It calls popup.tsx for persistence
  if (currentView === "DASHBOARD") {
    return <Dashboard
      selectedMode={userProfile.globalSettings.activeMode}
      theme={currentTheme}
      onThemeChange={handleThemeChange} // Persistent theme handler
      onReset={handleResetApp}
      onModeChange={handleModeChange}
    />
  }

  // Fallback: if no route matched, show MODE_SELECTION as safety default
  return <ModeSelection theme="light" onSelectMode={handleSelectMode} />
}