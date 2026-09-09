/**
 * @file useUIHoverAudio.ts
 * @description React hook managing sensory spoken auditory feedback for UI element hovers and clicks.
 *
 * Architectural Overview:
 * 1. Priority Queuing & Preemption:
 *    - Click announcements (`playClickAudio`) represent intentional user actions and immediately preempt/cancel any ongoing hover announcements.
 *    - Hover announcements (`playHoverAudio`) wait for non-hover speech (such as screen reader TTS reading) to finish before speaking.
 *
 * 2. Debouncing & Visibility Guard:
 *    - Implements a 150ms debounce timeout on hover to prevent audio spam when moving the mouse rapidly across interactive UI elements.
 *    - Ignores hover events occurring immediately after tab switching (<600ms) to prevent unwanted speech bursts.
 *
 * 3. Dynamic Voice Resolution:
 *    - Resolves the user's preferred TTS voice (`sensa_visual_voice_uri` / `sensa_visual_voice_name`) from Chrome local storage.
 *    - Includes retry logic and `voiceschanged` listener fallback for browser environments where speech voices load asynchronously.
 */

import { useCallback, useEffect, useRef } from "react"
import { isBraveBrowser } from "../lib/browserUtils"
import { resolveVoice, getSelectedVoicePreference } from "../lib/voiceResolver"

export function useUIHoverAudio() {
	const initialPref = getSelectedVoicePreference()
	const hoverTimeoutRef = useRef<number | null>(null)
	const isHoverSpeakingRef = useRef(false)
	const speechOwnerRef = useRef<"none" | "hover" | "click">("none")
	const isActiveRef = useRef(true)
	const selectedVoiceURIRef = useRef<string>(initialPref.uri)
	const selectedVoiceNameRef = useRef<string>(initialPref.name)
	const pendingUtteranceRef = useRef<string | null>(null)
	const voiceRetryTimerRef = useRef<number | null>(null)
	const voicesChangedHandlerRef = useRef<(() => void) | null>(null)
	const tabVisibleAtRef = useRef(performance.now())
	const isVoiceGuideEnabledRef = useRef(true)
	const isStorageLoadedRef = useRef(false)
	const isBraveRef = useRef(false)

	useEffect(() => {
		isBraveBrowser().then((isBrave) => {
			isBraveRef.current = isBrave
		})
		chrome.storage.local.get(["sensa_visual_voice_uri", "sensa_visual_voice_name", "sensa_visual_voice_guide_enabled"], (res) => {
			if (typeof res.sensa_visual_voice_uri === "string") {
				selectedVoiceURIRef.current = res.sensa_visual_voice_uri
			}
			if (typeof res.sensa_visual_voice_name === "string") {
				selectedVoiceNameRef.current = res.sensa_visual_voice_name
			}
			if (typeof res.sensa_visual_voice_guide_enabled === "boolean") {
				isVoiceGuideEnabledRef.current = res.sensa_visual_voice_guide_enabled
			}
			isStorageLoadedRef.current = true
		})

		const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
			if (changes.sensa_visual_voice_uri && typeof changes.sensa_visual_voice_uri.newValue === "string") {
				selectedVoiceURIRef.current = changes.sensa_visual_voice_uri.newValue
			}
			if (changes.sensa_visual_voice_name && typeof changes.sensa_visual_voice_name.newValue === "string") {
				selectedVoiceNameRef.current = changes.sensa_visual_voice_name.newValue
			}
			if (changes.sensa_visual_voice_guide_enabled && typeof changes.sensa_visual_voice_guide_enabled.newValue === "boolean") {
				isVoiceGuideEnabledRef.current = changes.sensa_visual_voice_guide_enabled.newValue
			}
		}

		chrome.storage.onChanged.addListener(handleStorageChange)
		return () => {
			chrome.storage.onChanged.removeListener(handleStorageChange)
		}
	}, [])

	const clearHoverTimeout = useCallback(() => {
		if (hoverTimeoutRef.current !== null) {
			window.clearTimeout(hoverTimeoutRef.current)
			hoverTimeoutRef.current = null
		}
	}, [])

	const clearVoiceRetry = useCallback(() => {
		if (voiceRetryTimerRef.current !== null) {
			window.clearInterval(voiceRetryTimerRef.current)
			voiceRetryTimerRef.current = null
		}
		pendingUtteranceRef.current = null
		if (voicesChangedHandlerRef.current) {
			window.speechSynthesis.removeEventListener("voiceschanged", voicesChangedHandlerRef.current)
			voicesChangedHandlerRef.current = null
		}
	}, [])

	const speakWithResolvedVoice = useCallback((text: string, owner: "hover" | "click" = "hover", rate: number = 1.0) => {
		if (!isActiveRef.current || !isVoiceGuideEnabledRef.current || !isStorageLoadedRef.current) return
		if (!text.trim()) return

		const speakNow = (preferredVoice: SpeechSynthesisVoice | undefined) => {
			window.speechSynthesis.resume()
			if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
				window.speechSynthesis.cancel()
			}
			speechOwnerRef.current = owner
			isHoverSpeakingRef.current = true

			const utterance = new SpeechSynthesisUtterance(text)
			if (preferredVoice) {
				utterance.voice = preferredVoice
				utterance.lang = preferredVoice.lang
			}
			utterance.rate = rate

			const release = () => {
				if (speechOwnerRef.current === owner) {
					speechOwnerRef.current = "none"
				}
				isHoverSpeakingRef.current = false
			}

			utterance.onend = release
			utterance.onerror = release
			window.speechSynthesis.speak(utterance)
		}

		clearVoiceRetry()
		let attempts = 0

		const checkAndSpeak = () => {
			if (!isActiveRef.current) return true
			const voices = window.speechSynthesis.getVoices()
			if (voices.length === 0) return false

			const chosenVoice = resolveVoice(voices, selectedVoiceURIRef.current, selectedVoiceNameRef.current)
			if (chosenVoice) {
				speakNow(chosenVoice)
				return true
			}
			return false
		}

		// Click announcements always preempt; hover waits for non-hover speech (e.g. screen reader).
		if (
			owner === "hover" &&
			(window.speechSynthesis.speaking || window.speechSynthesis.pending) &&
			speechOwnerRef.current !== "hover"
		) {
			return
		}

		if (checkAndSpeak()) return

		const handleVoicesChanged = () => {
			if (checkAndSpeak()) {
				clearVoiceRetry()
			}
		}

		voicesChangedHandlerRef.current = handleVoicesChanged
		window.speechSynthesis.addEventListener("voiceschanged", handleVoicesChanged)

		// KICKSTART CHROME TTS ENGINE
		try {
			const dummy = new SpeechSynthesisUtterance("");
			dummy.volume = 0;
			dummy.rate = 10;
			window.speechSynthesis.speak(dummy);
		} catch (e) {}

		voiceRetryTimerRef.current = window.setInterval(() => {
			if (checkAndSpeak() || attempts++ >= 50) { // 10 seconds timeout
				clearVoiceRetry()
				if (attempts >= 50 && isActiveRef.current) {
					const voices = window.speechSynthesis.getVoices()
					const fallbackVoice =
						voices.find((v) => (v.lang === "en-US" || v.lang.startsWith("en")) && !v.name.includes("David")) ||
						voices.find((v) => v.lang === "en-US" || v.lang.startsWith("en")) ||
						voices[0]
					speakNow(fallbackVoice)
				}
			}
		}, 200)

	}, [clearVoiceRetry])

	const cancelHoverAudio = useCallback(() => {
		clearHoverTimeout()
		clearVoiceRetry()

		// Never cancel click-owned speech (e.g. mode switch announcements).
		if (speechOwnerRef.current === "hover" && isHoverSpeakingRef.current) {
			window.speechSynthesis.resume()
			if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
				window.speechSynthesis.cancel()
			}
			speechOwnerRef.current = "none"
			isHoverSpeakingRef.current = false
		}
	}, [clearHoverTimeout, clearVoiceRetry])

	const playHoverAudio = useCallback(
		(text: string) => {
			if (!text.trim()) return
			if (document.visibilityState !== "visible") return
			if (performance.now() - tabVisibleAtRef.current < 600) return

			clearHoverTimeout()

			hoverTimeoutRef.current = window.setTimeout(() => {
				if (speechOwnerRef.current === "click") {
					hoverTimeoutRef.current = null
					return
				}

				speakWithResolvedVoice(text, "hover")
				hoverTimeoutRef.current = null
			}, 150)
		},
		[clearHoverTimeout, speakWithResolvedVoice]
	)

	const playClickAudio = useCallback((text: string, rate: number = 1.0) => {
		if (!text.trim()) return
		clearHoverTimeout()
		clearVoiceRetry()
		speakWithResolvedVoice(text, "click", rate)
	}, [clearHoverTimeout, clearVoiceRetry, speakWithResolvedVoice])

	useEffect(() => {
		isActiveRef.current = true
		const handlePointerDown = () => {
			clearHoverTimeout()
		}
		const handleVisibilityChange = () => {
			if (document.visibilityState === "visible") {
				tabVisibleAtRef.current = performance.now()
				clearHoverTimeout()
				if (speechOwnerRef.current === "hover" && isHoverSpeakingRef.current) {
					window.speechSynthesis.resume()
					window.speechSynthesis.cancel()
					speechOwnerRef.current = "none"
					isHoverSpeakingRef.current = false
				}
			}
		}

		window.addEventListener("pointerdown", handlePointerDown, true)
		document.addEventListener("visibilitychange", handleVisibilityChange)

		return () => {
			isActiveRef.current = false
			window.removeEventListener("pointerdown", handlePointerDown, true)
			document.removeEventListener("visibilitychange", handleVisibilityChange)
			clearHoverTimeout()
			clearVoiceRetry()
			if (isHoverSpeakingRef.current) {
				window.speechSynthesis.resume()
				window.speechSynthesis.cancel()
				speechOwnerRef.current = "none"
				isHoverSpeakingRef.current = false
			}
		}
	}, [clearHoverTimeout, clearVoiceRetry])

	return { playHoverAudio, playClickAudio, cancelHoverAudio }
}
