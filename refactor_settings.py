import os
import re

filepath = "src/components/VisualSettingsModal.tsx"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Remove navigator.mediaDevices.addEventListener
content = re.sub(r'    const handleDeviceChange = \(\) => loadDevices\(\)\n    navigator\.mediaDevices\.addEventListener\("devicechange", handleDeviceChange\)\n', '', content)
content = re.sub(r'      navigator\.mediaDevices\.removeEventListener\("devicechange", handleDeviceChange\)\n', '', content)

# 2. Remove the rest of the input/output voice commands (next/prev)
content = re.sub(r'          \} else if \(check\("next input".*?cycleDevice\("output", -1\)\n', '', content, flags=re.DOTALL)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("Step 3 script applied!")
