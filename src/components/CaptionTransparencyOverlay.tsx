import React, { useEffect, useRef, useState } from "react"

interface CaptionTransparencyOverlayProps {
	isDark: boolean
	onClose: () => void
	initialTransparency?: number
	onTransparencyChange?: (transparency: number) => void
}

const PRESET_VALUES = [25, 50, 75, 100]

export default function CaptionTransparencyOverlay({
	isDark,
	onClose,
	initialTransparency = 75,
	onTransparencyChange
}: CaptionTransparencyOverlayProps) {
	const [transparency, setTransparency] = useState(initialTransparency)
	const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
	const [initialOffsetLoaded, setInitialOffsetLoaded] = useState(false)
	const offsetRef = useRef(offset)
	const draggingRef = useRef(false)
	const dragStartRef = useRef({ x: 0, y: 0 })
	const offsetStartRef = useRef({ x: 0, y: 0 })

	const clampTransparency = (value: number) => Math.min(100, Math.max(0, value))

	const commitTransparency = (value: number) => {
		const normalized = clampTransparency(value)
		setTransparency(normalized)
		onTransparencyChange?.(normalized)
		return normalized
	}

	useEffect(() => {
		setTransparency(initialTransparency)
	}, [initialTransparency])

	useEffect(() => {
		offsetRef.current = offset
	}, [offset])

	useEffect(() => {
		chrome.storage.local.get(["sensa_caption_transparency_overlay_offset"], (result) => {
			if (result.sensa_caption_transparency_overlay_offset) {
				setOffset(result.sensa_caption_transparency_overlay_offset)
			}
			setInitialOffsetLoaded(true)
		})
	}, [])

	useEffect(() => {
		const onMove = (ev: MouseEvent) => {
			if (!draggingRef.current) return
			const dx = ev.clientX - dragStartRef.current.x
			const dy = ev.clientY - dragStartRef.current.y
			setOffset({ x: offsetStartRef.current.x + dx, y: offsetStartRef.current.y + dy })
		}

		const onUp = () => {
			if (!draggingRef.current) return
			draggingRef.current = false
			chrome.storage.local.set({ sensa_caption_transparency_overlay_offset: offsetRef.current })
		}

		window.addEventListener("mousemove", onMove)
		window.addEventListener("mouseup", onUp)

		return () => {
			window.removeEventListener("mousemove", onMove)
			window.removeEventListener("mouseup", onUp)
		}
	}, [])

	const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
		if (event.target === event.currentTarget) onClose()
	}

	const onHeaderMouseDown = (event: React.MouseEvent) => {
		const target = event.target as HTMLElement
		if (target.closest("button, input, select, textarea")) return
		event.preventDefault()
		draggingRef.current = true
		dragStartRef.current = { x: event.clientX, y: event.clientY }
		offsetStartRef.current = { x: offsetRef.current.x, y: offsetRef.current.y }
	}

	const opacity = transparency / 100

	const panelClass = isDark
		? "bg-gray-950 text-gray-100 border-[#FF7A2F]"
		: "bg-white text-black border-[#FF7A2F]"

	const mutedText = isDark ? "text-gray-400" : "text-slate-400"

	return (
		<div onClick={handleBackdropClick} className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/45 backdrop-blur-sm font-sans px-4">
			<div
				className={`relative w-full max-w-[420px] rounded-[34px] border-[3px] p-6 shadow-2xl ${panelClass}`}
				onMouseDown={onHeaderMouseDown}
				style={{ transform: `translate(${offset.x}px, ${offset.y}px)`, cursor: "grab", visibility: initialOffsetLoaded ? "visible" : "hidden" }}
			>
				<h2 className="text-[40px] leading-none font-bold mb-5 tracking-tight">Caption Transparency</h2>

				<button
					onClick={onClose}
					className={`absolute top-6 right-6 transition-colors focus:outline-none ${isDark ? "text-gray-100 hover:text-gray-300" : "text-black hover:text-gray-500"}`}
				>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7">
						<line x1="18" y1="6" x2="6" y2="18" />
						<line x1="6" y1="6" x2="18" y2="18" />
					</svg>
				</button>

				<div className={`relative rounded-[12px] overflow-hidden border mb-6 h-[220px] ${isDark ? "border-gray-700" : "border-gray-300"}`}>
					<div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,#dbeafe_0%,#93c5fd_30%,#1e3a8a_70%,#0f172a_100%)]" />
					<div className="absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,0.15)_0%,rgba(0,0,0,0.45)_100%)]" />

					<div className="absolute top-3 right-3 px-3 py-1.5 rounded-full bg-black/65 text-white text-xs font-bold tracking-wide">
						PREVIEW
					</div>

					<div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[82%] rounded-[14px] px-4 py-3 text-center text-white font-semibold text-base leading-[1.25]"
						style={{ backgroundColor: `rgba(0, 0, 0, ${opacity})` }}>
						This is a sample caption to preview changes.
					</div>
				</div>

				<div className="flex items-center justify-between mb-3">
					<h3 className="text-4xl leading-none font-bold">Transparency</h3>
					<div className="text-[#F08B3E] text-2xl leading-none font-bold">
						{transparency}%
					</div>
				</div>

				<input
					type="range"
					min="0"
					max="100"
					step="1"
					value={transparency}
					onChange={(event) => commitTransparency(Number.parseInt(event.target.value, 10))}
					className="caption-opacity-slider w-full h-2.5 rounded-lg appearance-none cursor-pointer"
					style={{
						background: `linear-gradient(to right, #F6A52D 0%, #F6A52D ${transparency}%, #d1d5db ${transparency}%, #d1d5db 100%)`
					}}
				/>

				<style dangerouslySetInnerHTML={{ __html: `
					.caption-opacity-slider::-webkit-slider-thumb {
						appearance: none;
						width: 20px;
						height: 20px;
						background: #ffffff;
						border: 4px solid #F08B3E;
						border-radius: 9999px;
						cursor: pointer;
					}
					.caption-opacity-slider::-moz-range-thumb {
						width: 20px;
						height: 20px;
						background: #ffffff;
						border: 4px solid #F08B3E;
						border-radius: 9999px;
						cursor: pointer;
					}
				` }} />

				<div className={`mt-3 mb-5 flex justify-between text-lg leading-none ${mutedText}`}>
					<span>Transparent</span>
					<span>Opaque</span>
				</div>

				<div className="grid grid-cols-4 gap-3 mb-6">
					{PRESET_VALUES.map((value) => {
						const active = value === transparency
						return (
							<button
								key={value}
								onClick={() => commitTransparency(value)}
								className={`h-12 rounded-[10px] text-base leading-none font-bold border-2 transition-colors ${
									active
										? "bg-[#F8E4CB] border-[#F6A52D] text-[#F6A52D]"
										: "bg-[#F3E2CC] border-transparent text-[#A38F79] hover:bg-[#F3D8BF]"
								}`}
							>
								{value}%
							</button>
						)
					})}
				</div>

				<div className="flex justify-end gap-3">
					<button
						onClick={onClose}
						className={`px-4 py-2 rounded-full border text-sm font-semibold transition-colors ${isDark ? "border-gray-700 text-gray-300 hover:bg-gray-800" : "border-gray-300 text-gray-700 hover:bg-gray-100"}`}
					>
						Cancel
					</button>
					<button
						onClick={() => {
							commitTransparency(transparency)
							onClose()
						}}
						className="px-5 py-2 rounded-full bg-[#FF7A2F] text-sm font-semibold text-white hover:bg-[#F26A1B] transition-colors"
					>
						Apply
					</button>
				</div>
			</div>
		</div>
	)
}
