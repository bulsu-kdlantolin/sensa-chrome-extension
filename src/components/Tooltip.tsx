import React from "react"

interface TooltipProps {
  label: string
  isDark?: boolean
  isRed?: boolean
  isAuditory?: boolean
}

export const Tooltip = ({ label, isDark, isRed, isAuditory }: TooltipProps) => {
  // 1. POSITIONING: Anchored to the LEFT side of the button (`right-full mr-4`).
  // Transforms from the right edge (`origin-right`) outward to the left.
  const layout = "absolute right-full mr-4 top-1/2 -translate-y-1/2 origin-right z-50 pointer-events-none"
  
  // 2. PHYSICS: Snaps out towards the left.
  const animation = "opacity-0 invisible scale-90 translate-x-2 group-hover:opacity-100 group-hover:visible group-hover:scale-100 group-hover:translate-x-0 transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]"
  
  // 3. TYPOGRAPHY: High contrast, highly legible.
  const typography = "px-4 py-2.5 rounded-xl text-[15px] font-bold tracking-wide whitespace-nowrap shadow-[0_12px_40px_rgba(0,0,0,0.25)]"

  // 4. ACCESSIBILITY COLORS: Solid, ultra-high contrast.
  let colors = ""
  let arrowColor = ""

  if (isRed) {
    colors = "bg-[#EF4444] text-white border border-[#DC2626]"
    arrowColor = "border-l-[#EF4444]"
  } else if (isDark) {
    colors = "bg-[#1C1C1E] text-white border border-white/20"
    arrowColor = "border-l-[#1C1C1E]"
  } else if (isAuditory) {
    // Light mode auditory theme: white popup with orange accent text
    colors = "bg-white text-[#CC5D1F] border border-[#FF7A2F]/25"
    arrowColor = "border-l-white"
  } else {
    // Light mode visual theme: white bg with blue text
    colors = "bg-white text-[#0A44FF] border border-black/10"
    arrowColor = "border-l-white"
  }

  return (
    <div className={`${layout} ${animation}`} role="tooltip">
      <div className={`relative ${typography} ${colors}`}>
        {label}
        
        {/* The physical pointer arrow on the RIGHT side of the tooltip, pointing at the button */}
        <div 
          className={`absolute top-1/2 -right-[6px] -translate-y-1/2 border-y-[6px] border-y-transparent border-l-[6px] border-r-0 ${arrowColor}`} 
        />
      </div>
    </div>
  )
}