import { useCallback, useEffect, useRef } from "react"

export function useUIHoverAudio() {
	const hoverTimeoutRef = useRef<number | null>(null)
	const isHoverSpeakingRef = useRef(false)
	const selectedVoiceURIRef = useRef<string>("")
	const selectedVoiceNameRef = useRef<string>("")
	const pendingUtteranceRef = useRef<string | null>(null)
	const voiceRetryTimerRef = useRef<number | null>(null)

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

	const speakWithResolvedVoice = useCallback((text: string) => {
		if (!text.trim()) return

		const availableVoices = window.speechSynthesis.getVoices()
		if (!availableVoices.length) {
			pendingUtteranceRef.current = text
			if (voiceRetryTimerRef.current === null) {
				voiceRetryTimerRef.current = window.setTimeout(() => {
					voiceRetryTimerRef.current = null
					const pending = pendingUtteranceRef.current
					pendingUtteranceRef.current = null
					if (pending) speakWithResolvedVoice(pending)
				}, 300)
			}
			window.speechSynthesis.onvoiceschanged = () => {
				const pending = pendingUtteranceRef.current
				pendingUtteranceRef.current = null
				if (pending) speakWithResolvedVoice(pending)
			}
			return
		}

		// If another non-hover speech flow is active, defer speaking until it's finished.
		if ((window.speechSynthesis.speaking || window.speechSynthesis.pending) && !isHoverSpeakingRef.current) {
			let retries = 0
			const maxRetries = 15 // ~3 seconds max
			const handle = window.setInterval(() => {
				if (!window.speechSynthesis.speaking && !window.speechSynthesis.pending) {
					window.clearInterval(handle)
					// proceed to speak now
					_internalSpeak(text)
				} else if (++retries >= maxRetries) {
					window.clearInterval(handle)
					// give up to avoid blocking the UI
				}
			}, 200)
			return
		}

		// Otherwise speak immediately (may cancel previous hover-owned speech)
		_internalSpeak(text)

		function _internalSpeak(msg: string) {
			// Stop any previous hover announcement before speaking the next one, but only if it was hover-owned.
			if (isHoverSpeakingRef.current) {
				window.speechSynthesis.cancel()
			}

			const utterance = new SpeechSynthesisUtterance(msg)
			const voices = window.speechSynthesis.getVoices()
			const preferredVoice =
				voices.find((voice) => voice.voiceURI === selectedVoiceURIRef.current) ||
				voices.find((voice) => voice.name === selectedVoiceNameRef.current) ||
				voices.find((voice) => selectedVoiceNameRef.current && voice.name.includes(selectedVoiceNameRef.current))

			if (preferredVoice) {
				utterance.voice = preferredVoice
				utterance.lang = preferredVoice.lang
			}

		utterance.onstart = () => {
			isHoverSpeakingRef.current = true
		}
		utterance.onend = () => {
			isHoverSpeakingRef.current = false
		}
		utterance.onerror = () => {
			isHoverSpeakingRef.current = false
		}

		isHoverSpeakingRef.current = true
		window.speechSynthesis.speak(utterance)
	}
	}, [])

	const cancelHoverAudio = useCallback(() => {
		clearHoverTimeout()

		// Do not cancel global speech unless the current voice is hover-owned.
		if (isHoverSpeakingRef.current) {
			window.speechSynthesis.cancel()
			isHoverSpeakingRef.current = false
		}
	}, [clearHoverTimeout])

	const playHoverAudio = useCallback(
		(text: string) => {
			if (!text.trim()) return

			clearHoverTimeout()

			hoverTimeoutRef.current = window.setTimeout(() => {
				// If another speech flow (e.g., reader playback) is active, skip hover audio.
				if ((window.speechSynthesis.speaking || window.speechSynthesis.pending) && !isHoverSpeakingRef.current) {
					hoverTimeoutRef.current = null
					return
				}

				// Delay then speak using resolved voice
				speakWithResolvedVoice(text)
				hoverTimeoutRef.current = null
			}, 150)
		},
		[clearHoverTimeout, speakWithResolvedVoice]
	)

	const playClickAudio = useCallback((text: string) => {
		if (!text.trim()) return
		clearHoverTimeout()
		// Speak immediately, overriding hover delays
		speakWithResolvedVoice(text)
	}, [clearHoverTimeout, speakWithResolvedVoice])

	useEffect(() => {
		const handlePointerDown = () => {
			clearHoverTimeout()
		}

		window.addEventListener("pointerdown", handlePointerDown, true)

		return () => {
			window.removeEventListener("pointerdown", handlePointerDown, true)
			clearHoverTimeout()
			if (isHoverSpeakingRef.current) {
				window.speechSynthesis.cancel()
				isHoverSpeakingRef.current = false
			}
		}
	}, [clearHoverTimeout])

	return { playHoverAudio, playClickAudio, cancelHoverAudio }
}
