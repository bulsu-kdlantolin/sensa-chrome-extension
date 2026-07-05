/**
 * @file ColorPickerPopup.tsx
 * @description Interactive HSV/RGB color picker modal used across settings panels for custom theme styling.
 *
 * Architectural Overview:
 * 1. Color Space Manipulation:
 *    - Implements bidirectional conversion between HSV (Hue, Saturation, Value), RGB, and Hexadecimal representations.
 *    - Renders a 2D saturation/value canvas and a 1D hue slider for intuitive visual selection.
 *
 * 2. Interaction & Drag Protection:
 *    - Supports mouse and touch dragging across color surfaces without prematurely closing parent modals when lifting outside boundaries.
 *    - Persists custom viewport positioning (`sensa_color_picker_offset`) to Chrome local storage.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface ColorPickerPopupProps {
  onClose: () => void
  initialColor?: string
  onColorChange?: (color: string) => void
  isDark?: boolean
  accent?: "blue" | "orange"
  placement?: "center" | "start" | "end"
}

// Math helpers for color conversion
const hsvToRgb = (h: number, s: number, v: number): [number, number, number] => {
  let r = 0, g = 0, b = 0;
  let i = Math.floor(h * 6);
  let f = h * 6 - i;
  let p = v * (1 - s);
  let q = v * (1 - (f * s));
  let t = v * (1 - ((1 - f) * s));
  switch (i % 6) {
    case 0: r = v, g = t, b = p; break;
    case 1: r = q, g = v, b = p; break;
    case 2: r = p, g = v, b = t; break;
    case 3: r = p, g = q, b = v; break;
    case 4: r = t, g = p, b = v; break;
    case 5: r = v, g = p, b = q; break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
};

const rgbToHex = (r: number, g: number, b: number) => {
  return "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1).toUpperCase();
};

const hexToRgb = (hex: string): [number, number, number] | null => {
  const cleaned = hex.trim().replace(/^#/, "")
  if (!/^([A-Fa-f0-9]{6})$/.test(cleaned)) return null
  const value = Number.parseInt(cleaned, 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

const rgbToHsv = (r: number, g: number, b: number) => {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255

  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min

  let h = 0
  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6
    else if (max === gn) h = (bn - rn) / delta + 2
    else h = (rn - gn) / delta + 4
    h /= 6
    if (h < 0) h += 1
  }

  const s = max === 0 ? 0 : delta / max
  return { h, s, v: max }
}

export default function ColorPickerPopup({ onClose, initialColor = "#FFFE00", onColorChange, isDark = false, accent = "blue", placement = "center" }: ColorPickerPopupProps) {
  const [hsv, setHsv] = useState(() => {
    const parsed = hexToRgb(initialColor)
    if (!parsed) return { h: 0.16, s: 1, v: 1 }
    return rgbToHsv(parsed[0], parsed[1], parsed[2])
  });
  
  const [isSoundEffectsEnabled, setIsSoundEffectsEnabled] = useState(true);

  useEffect(() => {
    chrome.storage.local.get(["sensa_visual_sound_effects_enabled"], (res) => {
      if (typeof res.sensa_visual_sound_effects_enabled === "boolean") {
        setIsSoundEffectsEnabled(res.sensa_visual_sound_effects_enabled);
      }
    });
  }, []);

  const audioCtxRef = useRef<AudioContext | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)
  const mainAreaRef = useRef<HTMLDivElement>(null);
  const hueSliderRef = useRef<HTMLDivElement>(null);
  const isDraggingMain = useRef(false);
  const isDraggingHue = useRef(false);

  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext
      audioCtxRef.current = Ctor ? new Ctor() : null
    }

    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      audioCtxRef.current.resume().catch(() => undefined)
    }

    return audioCtxRef.current
  }

  const playHoverSfx = () => {
    if (!isSoundEffectsEnabled) return;
    const ctx = getAudioContext()
    if (!ctx) return

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = "sine"
    osc.frequency.setValueAtTime(720, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + 0.08)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.09)

    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.1)
  }

  const playClickSfx = () => {
    if (!isSoundEffectsEnabled) return;
    const ctx = getAudioContext()
    if (!ctx) return

    const makeClick = (freq: number, startAt: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = "square"
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startAt)
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + startAt)
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + startAt + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + startAt + 0.05)

      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(ctx.currentTime + startAt)
      osc.stop(ctx.currentTime + startAt + 0.06)
    }

    makeClick(900, 0)
    makeClick(1200, 0.07)
  }

  const [r, g, b] = hsvToRgb(hsv.h, hsv.s, hsv.v);
  const hex = rgbToHex(r, g, b);
  const [hr, hg, hb] = hsvToRgb(hsv.h, 1, 1)
  const baseHueColor = rgbToHex(hr, hg, hb);
  const [hexInput, setHexInput] = useState(hex)
  const [rInput, setRInput] = useState(String(r))
  const [gInput, setGInput] = useState(String(g))
  const [bInput, setBInput] = useState(String(b))

  useEffect(() => {
    setHexInput(hex)
    setRInput(String(r))
    setGInput(String(g))
    setBInput(String(b))
  }, [hex, r, g, b])

  useEffect(() => {
    onColorChange?.(hex)
  }, [hex, onColorChange])

  useEffect(() => {
    const handleDocumentPointerDown = (event: MouseEvent) => {
      if (!popupRef.current) return
      if (isDraggingMain.current || isDraggingHue.current) return
      const path = typeof event.composedPath === "function" ? event.composedPath() : []
      if (path.includes(popupRef.current)) return
      const target = event.target as Node | null
      if (target && popupRef.current.contains(target)) return
      onClose()
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }

    window.addEventListener("mousedown", handleDocumentPointerDown)
    window.addEventListener("keydown", handleEscape)

    return () => {
      window.removeEventListener("mousedown", handleDocumentPointerDown)
      window.removeEventListener("keydown", handleEscape)
    }
  }, [onClose])

  useEffect(() => {
    const resumeAudio = () => {
      if (!isSoundEffectsEnabled) return;
      const ctx = getAudioContext()
      if (ctx && ctx.state === "suspended") {
        ctx.resume().catch(() => undefined)
      }
    }

    window.addEventListener("pointerdown", resumeAudio)
    window.addEventListener("keydown", resumeAudio)
    return () => {
      window.removeEventListener("pointerdown", resumeAudio)
      window.removeEventListener("keydown", resumeAudio)
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => undefined)
        audioCtxRef.current = null
      }
    }
  }, [isSoundEffectsEnabled])

  const handleMainDrag = useCallback((clientX: number, clientY: number) => {
    if (!mainAreaRef.current) return;
    const rect = mainAreaRef.current.getBoundingClientRect();
    let s = (clientX - rect.left) / rect.width;
    let v = 1 - ((clientY - rect.top) / rect.height);
    s = Math.max(0, Math.min(1, s));
    v = Math.max(0, Math.min(1, v));
    setHsv(prev => ({ ...prev, s, v }));
  }, []);

  const handleHueDrag = useCallback((clientX: number) => {
    if (!hueSliderRef.current) return;
    const rect = hueSliderRef.current.getBoundingClientRect();
    let h = (clientX - rect.left) / rect.width;
    h = Math.max(0, Math.min(1, h));
    setHsv(prev => ({ ...prev, h }));
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingMain.current) handleMainDrag(e.clientX, e.clientY);
      if (isDraggingHue.current) handleHueDrag(e.clientX);
    };

    const handleMouseUp = () => {
      isDraggingMain.current = false;
      isDraggingHue.current = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMainDrag, handleHueDrag]);

  const popupClass = isDark
    ? "bg-[#1C1C1E]/95 backdrop-blur-3xl border-white/10 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.6)]"
    : "bg-white/95 backdrop-blur-3xl border-black/5 shadow-[0_24px_64px_-12px_rgba(0,0,0,0.15)]"
  
  const arrowClass = isDark ? "bg-[#1C1C1E] border-white/10" : "bg-white border-black/5"
  
  const placementClass =
    placement === "end"
      ? "right-0 left-auto translate-x-0"
      : placement === "start"
        ? "left-0 right-auto translate-x-0"
        : "left-1/2 -translate-x-1/2"
        
  const arrowPlacementClass =
    placement === "end"
      ? "right-[18px] left-auto -translate-x-0"
      : placement === "start"
        ? "left-[18px] right-auto -translate-x-0"
        : "left-1/2 -translate-x-1/2"
        
  const labelClass = isDark ? "text-gray-400" : "text-gray-500"
  
  const inputClass = isDark
    ? "border-white/10 text-gray-100 bg-white/5 hover:bg-white/10 focus:bg-[#2C2C2E]"
    : "border-black/5 text-gray-800 bg-black/5 hover:bg-black/10 focus:bg-white"

  const activeFocusClass = accent === "orange" ? "focus:ring-[#FF7A2F]/40" : "focus:ring-[#0A44FF]/40"

  const actionButtonClass = accent === "orange"
    ? "bg-gradient-to-r from-[#FF7A2F] to-[#FF9F0A] hover:from-[#E66B25] hover:to-[#E68E09] shadow-[0_4px_12px_rgba(255,122,47,0.3)]"
    : "bg-gradient-to-r from-[#0A44FF] to-[#0099FF] hover:from-[#093CE0] hover:to-[#008AE6] shadow-[0_4px_12px_rgba(10,68,255,0.3)]"

  const handleHexInput = (value: string) => {
    const normalized = value.startsWith("#") ? value : `#${value}`
    if (!/^#?[A-Fa-f0-9]{0,6}$/.test(value)) return
    setHexInput(normalized)
    if (normalized.length === 7) {
      const parsed = hexToRgb(normalized)
      if (!parsed) return
      setHsv(rgbToHsv(parsed[0], parsed[1], parsed[2]))
    }
  }

  const handleRgbInput = (channel: "r" | "g" | "b", value: string) => {
    if (!/^\d{0,3}$/.test(value)) return
    if (channel === "r") setRInput(value)
    if (channel === "g") setGInput(value)
    if (channel === "b") setBInput(value)
    if (value === "") return
    const nextValue = Number.parseInt(value, 10)
    if (Number.isNaN(nextValue) || nextValue < 0 || nextValue > 255) return
    const nextR = channel === "r" ? nextValue : r
    const nextG = channel === "g" ? nextValue : g
    const nextB = channel === "b" ? nextValue : b
    setHsv(rgbToHsv(nextR, nextG, nextB))
  }

  return (
    <div
      ref={popupRef}
      className={`absolute bottom-[calc(100%+20px)] z-[999999] w-[340px] rounded-[24px] border p-[20px] font-sans select-none cursor-default transition-all ease-out duration-200 animate-in fade-in slide-in-from-bottom-2 ${placementClass} ${popupClass}`}
    >
      <div className={`absolute -bottom-[8px] w-[16px] h-[16px] rotate-45 border-b border-r pointer-events-none rounded-br-[4px] ${arrowPlacementClass} ${arrowClass}`}></div>
      
      {/* Main Area */}
      <div 
        ref={mainAreaRef}
        onMouseDown={(e) => { e.stopPropagation(); isDraggingMain.current = true; handleMainDrag(e.clientX, e.clientY); }}
        className="w-full h-[200px] rounded-[16px] relative overflow-hidden shadow-[inset_0_0_2px_rgba(0,0,0,0.2)] cursor-crosshair border border-white/5"
        style={{ backgroundColor: baseHueColor }}
      >
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to right, #ffffff 0%, rgba(255,255,255,0) 100%)' }}></div>
        <div className="absolute inset-0 pointer-events-none" style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, #000000 100%)' }}></div>
        
        <div 
          className="absolute w-[24px] h-[24px] border-[3px] border-white rounded-full shadow-[0_2px_8px_rgba(0,0,0,0.4)] pointer-events-none transform -translate-x-1/2 -translate-y-1/2 transition-transform duration-75"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: hex }}
        ></div>
      </div>

      {/* Hue Slider */}
      <div 
        ref={hueSliderRef}
        onMouseDown={(e) => { e.stopPropagation(); isDraggingHue.current = true; handleHueDrag(e.clientX); }}
        className="mt-[24px] relative w-full h-[18px] rounded-full shadow-[inset_0_2px_6px_rgba(0,0,0,0.2)] cursor-pointer border border-white/5" 
        style={{ background: 'linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)' }}
      >
        <div 
          className="absolute top-1/2 -translate-y-1/2 w-[24px] h-[24px] bg-white border-[2px] border-white rounded-full shadow-[0_2px_6px_rgba(0,0,0,0.3)] pointer-events-none transform -translate-x-1/2 transition-transform duration-75"
          style={{ left: `${hsv.h * 100}%` }}
        >
          <div className="w-full h-full rounded-full shadow-inner" style={{ backgroundColor: baseHueColor }}></div>
        </div>
      </div>

      {/* Inputs */}
      <div className="mt-[24px] flex gap-[12px]">
        <div className="flex flex-col gap-[8px] flex-[2.5]">
          <label className={`text-[11px] font-semibold tracking-wider uppercase ${labelClass}`}>Hex</label>
          <input
            value={hexInput}
            onChange={(event) => handleHexInput(event.target.value.trim())}
            className={`w-full border rounded-xl px-[14px] py-[10px] text-[14px] font-medium outline-none transition-colors focus:ring-2 ${inputClass} ${activeFocusClass}`}
            spellCheck={false}
          />
        </div>
        <div className="flex gap-[8px] flex-[3]">
          {["r", "g", "b"].map((channel) => (
            <div key={channel} className="flex flex-col gap-[8px] flex-1">
              <label className={`text-[11px] font-semibold tracking-wider uppercase text-center ${labelClass}`}>{channel}</label>
              <input
                value={channel === "r" ? rInput : channel === "g" ? gInput : bInput}
                onChange={(event) => handleRgbInput(channel as any, event.target.value.trim())}
                className={`w-full border rounded-xl px-[4px] py-[10px] text-[14px] font-medium text-center outline-none transition-colors focus:ring-2 ${inputClass} ${activeFocusClass}`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Done Button */}
      <div className="mt-[24px]">
        <button
          onMouseEnter={playHoverSfx}
          onFocus={playHoverSfx}
          onClick={() => { playClickSfx(); onClose(); }}
          className={`w-full py-[12px] text-[15px] font-bold rounded-xl text-white transition-all active:scale-[0.98] ${actionButtonClass}`}
        >
          Done
        </button>
      </div>
    </div>
  )
}