const fs = require('fs');
const code = fs.readFileSync('src/components/VisualDock.tsx', 'utf8');
const lines = code.split('\n');
for (let i = 1000; i < 1180 && i < lines.length; i++) {
  if (lines[i].includes('includes(') || lines[i].includes('===') || lines[i].includes('read') || lines[i].includes('speed')) {
    console.log(`${i + 1}: ${lines[i].trim()}`);
  }
}
