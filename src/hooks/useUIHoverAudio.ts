import { useCallback, useEffect, useRef } from "react"

export function useUIHoverAudio() {
	const hoverTimeoutRef = useRef<number | null>(null)
	const isHoverSpeakingRef = useRef(false)
	const speechOwnerRef = useRef<"none" | "hover" | "click">("none")
	const isActiveRef = useRef(true)
	const selectedVoiceURIRef = useRef<string>("")
	const selectedVoiceNameRef = useRef<string>("")
	const pendingUtteranceRef = useRef<string | null>(null)
	const voiceRetryTimerRef = useRef<number | null>(null)
	const voicesChangedHandlerRef = useRef<(() => void) | null>(null)

	useEffect(() => {
		chrome.storage.local.get(["sensa_visual_voice_uri", "sensa_visual_voice_name"], (res) => {
			if (typeof res.sensa_visual_voice_uri === "string") {
				selectedVoiceURIRef.current = res.sensa_visual_voice_uri
			}
			if (typeof res.sensa_visual_voice_name === "string") {
				selectedVoiceNameRef.current = res.sensa_visual_voice_name
			}
		})

		const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
			if (changes.sensa_visual_voice_uri && typeof changes.sensa_visual_voice_uri.newValue === "string") {
				selectedVoiceURIRef.current = changes.sensa_visual_voice_uri.newValue
			}
			if (changes.sensa_visual_voice_name && typeof changes.sensa_visual_voice_name.newValue === "string") {
				selectedVoiceNameRef.current = changes.sensa_visual_voice_name.newValue
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
			window.clearTimeout(voiceRetryTimerRef.current)
			voiceRetryTimerRef.current = null
		}
		pendingUtteranceRef.current = null
		if (voicesChangedHandlerRef.current) {
			window.speechSynthesis.removeEventListener("voiceschanged", voicesChangedHandlerRef.current)
			voicesChangedHandlerRef.current = null
		}
	}, [])

	const speakWithResolvedVoice = useCallback((text: string, owner: "hover" | "click" = "hover") => {
		if (!isActiveRef.current) return
		if (!text.trim()) return

		const speakNow = () => {
			window.speechSynthesis.cancel()
			speechOwnerRef.current = owner
			isHoverSpeakingRef.current = true

			const utterance = new SpeechSynthesisUtterance(text)
			const voices = window.speechSynthesis.getVoices()
			const preferredVoice =
				voices.find((voice) => voice.voiceURI === selectedVoiceURIRef.current) ||
				voices.find((voice) => voice.name === selectedVoiceNameRef.current) ||
				voices.find((voice) => selectedVoiceNameRef.current && voice.name.includes(selectedVoiceNameRef.current)) ||
				voices.find((voice) => voice.name.includes("Google US English"))

			if (preferredVoice) {
				utterance.voice = preferredVoice
				utterance.lang = preferredVoice.lang
			}

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

		const availableVoices = window.speechSynthesis.getVoices()
		if (!availableVoices.length) {
			clearVoiceRetry()
			pendingUtteranceRef.current = text

			const handleVoicesChanged = () => {
				if (!isActiveRef.current) return
				const pending = pendingUtteranceRef.current
				if (!pending) return
				pendingUtteranceRef.current = null
				clearVoiceRetry()
				speakWithResolvedVoice(pending, owner)
			}

			voicesChangedHandlerRef.current = handleVoicesChanged
			window.speechSynthesis.addEventListener("voiceschanged", handleVoicesChanged)

			voiceRetryTimerRef.current = window.setTimeout(() => {
				voiceRetryTimerRef.current = null
				if (!isActiveRef.current) return
				const pending = pendingUtteranceRef.current
				if (!pending) return
				pendingUtteranceRef.current = null
				clearVoiceRetry()
				speakWithResolvedVoice(pending, owner)
			}, 800)

			return
		}

		// Click announcements always preempt; hover waits for non-hover speech (e.g. screen reader).
		if (
			owner === "hover" &&
			(window.speechSynthesis.speaking || window.speechSynthesis.pending) &&
			speechOwnerRef.current !== "hover"
		) {
			return
		}

		speakNow()
	}, [clearVoiceRetry])

	const cancelHoverAudio = useCallback(() => {
		clearHoverTimeout()
		clearVoiceRetry()

		// Never cancel click-owned speech (e.g. mode switch announcements).
		if (speechOwnerRef.current === "hover" && isHoverSpeakingRef.current) {
			window.speechSynthesis.cancel()
			speechOwnerRef.current = "none"
			isHoverSpeakingRef.current = false
		}
	}, [clearHoverTimeout, clearVoiceRetry])

	const playHoverAudio = useCallback(
		(text: string) => {
			if (!text.trim()) return

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

	const playClickAudio = useCallback((text: string) => {
		if (!text.trim()) return
		clearHoverTimeout()
		clearVoiceRetry()
		speakWithResolvedVoice(text, "click")
	}, [clearHoverTimeout, clearVoiceRetry, speakWithResolvedVoice])

	useEffect(() => {
		isActiveRef.current = true
		const handlePointerDown = () => {
			clearHoverTimeout()
		}

		window.addEventListener("pointerdown", handlePointerDown, true)

		return () => {
			isActiveRef.current = false
			window.removeEventListener("pointerdown", handlePointerDown, true)
			clearHoverTimeout()
			clearVoiceRetry()
			if (isHoverSpeakingRef.current) {
				window.speechSynthesis.cancel()
				speechOwnerRef.current = "none"
				isHoverSpeakingRef.current = false
			}
		}
	}, [clearHoverTimeout, clearVoiceRetry])

	return { playHoverAudio, playClickAudio, cancelHoverAudio }
}
