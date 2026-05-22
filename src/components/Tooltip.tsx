import React from "react"

interface TooltipProps {
  label: string
  isDark?: boolean
  isRed?: boolean
  isAuditory?: boolean
}

export const Tooltip = ({ label, isDark, isRed, isAuditory }: TooltipProps) => {
  // 1. POSITIONING: Anchored left, right next to the button.
  const layout = "absolute right-full mr-3 top-1/2 -translate-y-1/2 z-50 pointer-events-none"
  
  // 2. PHYSICS: Matches the dock's premium iOS-style bezier curve.
  const animation = "opacity-0 invisible -translate-x-2 group-hover:opacity-100 group-hover:visible group-hover:translate-x-0 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
  
  // 3. TYPOGRAPHY: Shared tooltip sizing for both dock styles.
  let typography = "px-5 py-2.5 rounded-lg text-[15px] font-semibold tracking-wide whitespace-nowrap shadow-lg border"
  let arrowSize = "absolute top-1/2 -right-[7px] -translate-y-1/2 border-y-[7px] border-y-transparent border-l-[7px] border-r-0"

  // 4. PREMIUM THEME LOGIC
  let colors = ""
  let arrowColor = ""

  if (isRed) {
    colors = "bg-red-500/90 text-white border-red-500/20 shadow-[0_4px_12px_rgba(239,68,68,0.2)]"
    arrowColor = "border-l-red-500/90"
  } else if (isDark) {
    colors = "bg-[#141416] text-gray-100 border-white/10 shadow-[0_4px_12px_rgba(0,0,0,0.4)]"
    arrowColor = "border-l-[#141416]"
  } else if (isAuditory) {
    // Light mode auditory theme
    colors = "bg-white text-[#CC5D1F] border-black/5 shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
    arrowColor = "border-l-white"
  } else {
    // Light mode visual theme
    colors = "bg-white text-[#0A44FF] border-black/5 shadow-[0_4px_12px_rgba(0,0,0,0.1)]"
    arrowColor = "border-l-white"
  }

  // Keep the same size across visual/auditory themes; dark stays consistent too.
  if (isRed) {
    typography = "px-5 py-2.5 rounded-lg text-[15px] font-semibold tracking-wide whitespace-nowrap shadow-lg border"
  }

  return (
    <div className={`${layout} ${animation}`} role="tooltip">
      <div className={`relative ${typography} ${colors}`}>
        {label}
        
        {/* The physical pointer arrow pointing at the button */}
        <div 
          className={`${arrowSize} ${arrowColor}`} 
        />
      </div>
    </div>
  )
}