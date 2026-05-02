export const Tooltip = ({ label, isRed = false, isDark = false }: { label: string, isRed?: boolean, isDark?: boolean }) => {
  const bgClass = isDark ? "bg-gray-800" : "bg-[#D1D5DB]"
  const textClass = isRed ? "text-[#CC0000]" : (isDark ? "text-gray-100" : "text-black")
  const arrowBorderClass = isDark ? "border-l-gray-800" : "border-l-[#D1D5DB]"

  return (
    <div className="absolute right-[calc(100%+12px)] top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none flex items-center z-50">
      <div 
        // 🚨 THE FIX: Replaced "text-sm" with "text-[14px] leading-[20px]" to make it immune to YouTube's CSS!
        className={`${bgClass} px-[12px] py-[6px] rounded-md shadow-md font-bold text-[14px] leading-[20px] whitespace-nowrap tracking-tight ${textClass}`}
        style={{ fontFamily: "system-ui, sans-serif" }} // Bonus fix: Stops YouTube from changing your font family
      >
        {label}
      </div>
      <div className={`w-0 h-0 border-y-[6px] border-y-transparent border-l-[8px] ${arrowBorderClass}`}></div>
    </div>
  )
}