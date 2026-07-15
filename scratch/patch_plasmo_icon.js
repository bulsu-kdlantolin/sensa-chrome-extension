const fs = require('fs');
const path = require('path');
const distPath = path.join(__dirname, '..', 'node_modules', 'plasmo', 'dist', 'index.js');
let code = fs.readFileSync(distPath, 'utf8');
code = code.replace(/process\.env\.NODE_ENV==="development"\?/g, '(process.env.NODE_ENV==="development"||process.argv.includes("--tag=dev")||e.includes("-dev"))?');
fs.writeFileSync(distPath, code, 'utf8');
console.log('Successfully patched Plasmo icon grayer inside dist/index.js');
