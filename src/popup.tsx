import { useState, useEffect } from "react"
import "./style.css"
import ModeSelection from "./components/ModeSelection"
import VisualWelcomeOverlay from "./components/VisualWelcomeOverlay"
import AuditoryWelcomeOverlay from "./components/AuditoryWelcomeOverlay"
import Dashboard from "./components/Dashboard"
import type { SensaUserProfile } from "./lib/storage"
import { DEFAULT_PROFILE } from "./lib/storage"

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

  // 2. Safely update persistent JSON database
  const updateProfile = (updates: Partial<SensaUserProfile>) : Promise<void> => {
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
    // Persist the last-opened tab so Dashboard hydrates into the selected mode
    chrome.storage.local.set({ sensa_last_tab: mode }, () => {
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
      sensa_auditory_active: false
    }, () => {
      chrome.runtime.sendMessage({ type: "sensa-activate-mode", mode: null })
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

  // --- THE ROUTER ---
  if (currentView === "LOADING" || !userProfile) {
    return <div className="w-[350px] h-[550px] bg-white flex items-center justify-center text-gray-800">Loading Data...</div>
  }
  
  // MODE_SELECTION is ALWAYS first unless already completed the welcome flow
  if (currentView === "MODE_SELECTION") {
    return <ModeSelection theme={currentTheme} onSelectMode={handleSelectMode} />
  }
  
  if (currentView === "WELCOME") {
    return userProfile.globalSettings.activeMode === "auditory"
      ? <AuditoryWelcomeOverlay theme={currentTheme} onGetStarted={handleGetStarted} />
      : <VisualWelcomeOverlay theme={currentTheme} onGetStarted={handleGetStarted} />
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
  return <ModeSelection theme={currentTheme} onSelectMode={handleSelectMode} />
}