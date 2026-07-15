const fs = require('fs');
const code = fs.readFileSync('src/components/VisualDock.tsx', 'utf8');
const lines = code.split('\n');
lines.forEach((l, idx) => {
  if (l.includes('if (cleanText.includes("read")') || l.includes('cleanText.includes("reading speed")') || l.includes('matchKeyword(') || l.includes('else if (cleanText.includes("read') || l.includes('cleanText.includes("speed') || l.includes('case "read":') || l.includes('case "reading speed":')) {
    console.log(`${idx + 1}: ${l.trim()}`);
  }
});
