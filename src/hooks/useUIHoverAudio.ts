import { useCallback, useEffect, useRef } from "react"

export function useUIHoverAudio() {
	const hoverTimeoutRef = useRef<number | null>(null)
	const isHoverSpeakingRef = useRef(false)
	const selectedVoiceURIRef = useRef<string>("")
	const selectedVoiceNameRef = useRef<string>("")

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

				// Stop any previous hover announcement before speaking the next one.
				window.speechSynthesis.cancel()

				const speakWithResolvedVoice = (attempt = 0) => {
					const utterance = new SpeechSynthesisUtterance(text)
					const availableVoices = window.speechSynthesis.getVoices()
					const preferredVoice =
						availableVoices.find((voice) => voice.voiceURI === selectedVoiceURIRef.current) ||
						availableVoices.find((voice) => voice.name === selectedVoiceNameRef.current)

					if (!preferredVoice && selectedVoiceURIRef.current && attempt < 8) {
						window.setTimeout(() => speakWithResolvedVoice(attempt + 1), 100)
						return
					}

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
					hoverTimeoutRef.current = null
				}

				speakWithResolvedVoice()
			}, 150)
		},
		[clearHoverTimeout]
	)

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

	return { playHoverAudio, cancelHoverAudio }
}
