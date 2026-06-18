import os
import re

filepath = "src/components/VisualSettingsModal.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Remove watchdogTimer logic from VisualSettingsModal
# Remove let lastActivityTimestamp = Date.now()
content = re.sub(r'\s*let lastActivityTimestamp = Date\.now\(\)', '', content)
# Remove let watchdogTimer: number | null = null
content = re.sub(r'\s*let watchdogTimer: number \| null = null', '', content)
# Remove lastActivityTimestamp = Date.now()
content = re.sub(r'\s*lastActivityTimestamp = Date\.now\(\)', '', content)

# Remove rebuildRecognition definition
content = re.sub(r'\s*const rebuildRecognition = \(\) => \{.*?(?=\n\s*pauseSettingsRecognitionRef\.current)', '\n\n', content, flags=re.DOTALL)

# Remove rebuildRecognition() calls inside onerror
content = re.sub(r'\s*if \(event\.error === "network"\) \{\s*rebuildRecognition\(\)\s*return\s*\}', '', content)

# Replace rebuildRecognition() call inside reviveEngine
content = re.sub(r'rebuildRecognition\(\)', 'try { recognition?.start() } catch (e) {}', content)

# Remove watchdogTimer setInterval block
content = re.sub(r'\s*watchdogTimer = window\.setInterval\(\(\) => \{.*?(?=\n\s*return \(\) => \{)', '\n\n', content, flags=re.DOTALL)

# Remove clearInterval
content = re.sub(r'\s*if \(watchdogTimer\) window\.clearInterval\(watchdogTimer\)', '', content)


# 2. Apply string fixes

# Fix rate param in speakSettingsGuideRef
content = content.replace("const speakSettingsGuideRef = useRef<(message: string) => void>(() => { })", "const speakSettingsGuideRef = useRef<(message: string, rate?: number) => void>(() => { })")

# Fix rate param in speakSettingsGuide function signature
content = content.replace("const speakSettingsGuide = React.useCallback((message: string) => {", "const speakSettingsGuide = React.useCallback((message: string, rate: number = 1.0) => {")

# Add rate setting inside speakNow function
content = content.replace("const utterance = new SpeechSynthesisUtterance(message)\n      const uri = selectedVoiceURIRef.current", "const utterance = new SpeechSynthesisUtterance(message)\n      utterance.rate = rate\n      const uri = selectedVoiceURIRef.current")

# Update openedViaVoice guide string
content = content.replace('speakSettingsGuide("Settings opened. Here are the commands. Voice selection. This opens the voice list. Input device. This changes the microphone. Output device. This changes the speaker. Restore default. This resets all settings to default. Close. This exits settings.")', 'speakSettingsGuide("Settings opened. ... Here are the commands. ... Voice selection, opens the voice list. ... Input device, changes the microphone. ... Output device, changes the speaker. ... Reset, resets all settings. ... Close, exits settings.", 0.9)')

# Fix rate param in speakFeedback
content = content.replace("const speakFeedback = (message: string) => {", "const speakFeedback = (message: string, rate: number = 1.0) => {")
content = content.replace("speakSettingsGuideRef.current(message)", "speakSettingsGuideRef.current(message, rate)")

# Update help command fuzzy matching and string
content = content.replace('if (check("help", "commands", "options", "what can i say")) {', 'if (check("help", "commands", "options", "what can i say", "held", "health", "kelp", "elf", "howl", "hell") || fuzzyCheck("help", 2) || fuzzyCheck("commands", 2)) {')
content = content.replace('speakFeedback("Here are the commands. Voice selection. This opens the voice list. Input device. This changes the microphone. Output device. This changes the speaker. Restore default. This resets all settings to default. Close. This exits settings.")', 'speakFeedback("Here are the commands. ... Voice selection, opens the voice list. ... Input device, changes the microphone. ... Output device, changes the speaker. ... Reset, resets all settings. ... Close, exits settings.", 0.9)')

# Update reset command fuzzy matching
content = content.replace('} else if (check("reset default", "reset defaults", "restore defaults", "restore default", "reset settings", "restore", "reset", "default") || fuzzyCheck("restore default", 1) || fuzzyCheck("reset default", 1)) {', '} else if (check("reset", "reset default", "reset defaults", "restore defaults", "restore default", "reset settings", "restore", "default") || fuzzyCheck("reset", 1) || fuzzyCheck("reset default", 1)) {')

# Update handleResetToDefault audio string
content = content.replace('playClickAudio("Settings reset to default")', 'playClickAudio("Settings reset")')

# Update reset button text
content = content.replace('{...getHoverHandlers("Reset to default")}', '{...getHoverHandlers("Reset")}')
content = content.replace('Restore Defaults', 'Reset')


with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("VisualSettingsModal processed successfully.")
