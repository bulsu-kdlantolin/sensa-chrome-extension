import os
import re

def process_visual_dock():
    filepath = "src/components/VisualDock.tsx"
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # Restore the 30s timeout in resetSilenceTimer
    target = """    const resetSilenceTimer = () => {
      if (silenceTimer) {
        window.clearTimeout(silenceTimer)
        silenceTimer = null
      }
    }"""
    
    replacement = """    const resetSilenceTimer = () => {
      if (silenceTimer) {
        window.clearTimeout(silenceTimer)
        silenceTimer = null
      }

      if (callbacksRef.current.isVoiceCommandActive) {
        silenceTimer = window.setTimeout(() => {
          const cbs = callbacksRef.current
          if (cbs.isVoiceCommandActive) {
            cbs.playClickAudio?.('Voice commands deactivated')
            try { cbs.onToggleVoiceCommand() } catch { }
          }
        }, 30000)
      }
    }"""
    
    content = content.replace(target, replacement)
    
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

def process_overlay(filepath):
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    # Remove let lastActivityTimestamp = Date.now()
    content = re.sub(r'\s*let lastActivityTimestamp = Date\.now\(\)', '', content)
    # Remove let watchdogTimer: number | null = null
    content = re.sub(r'\s*let watchdogTimer: number \| null = null', '', content)
    # Remove lastActivityTimestamp = Date.now()
    content = re.sub(r'\s*lastActivityTimestamp = Date\.now\(\)', '', content)
    
    # Remove rebuildRecognition definition
    content = re.sub(r'\s*const rebuildRecognition = \(\) => \{.*?(?=\n\s*const (reviveEngine|pauseSettingsRecognitionRef|teardownRecognition))', '\n\n', content, flags=re.DOTALL)
    
    # Remove rebuildRecognition() calls
    content = re.sub(r'\s*if \(event\.error === "network"\) \{\s*rebuildRecognition\(\)\s*return\s*\}', '', content)
    content = re.sub(r'rebuildRecognition\(\)', 'try { recognition?.start() } catch (e) {}', content)
    
    # Remove watchdogTimer setInterval
    content = re.sub(r'\s*watchdogTimer = window\.setInterval\(\(\) => \{.*?(?=\n\s*return \(\) => \{)', '\n\n', content, flags=re.DOTALL)
    
    # Remove clearInterval
    content = re.sub(r'\s*if \(watchdogTimer\) window\.clearInterval\(watchdogTimer\)', '', content)

    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)

process_visual_dock()
process_overlay("src/components/VisualSettingsModal.tsx")
process_overlay("src/components/ReadingSpeedOverlay.tsx")

print("Files processed successfully.")
