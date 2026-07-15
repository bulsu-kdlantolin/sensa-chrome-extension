const fs = require('fs');
const path = require('path');
const distPath = path.join(__dirname, '..', 'node_modules', 'plasmo', 'dist', 'index.js');
let code = fs.readFileSync(distPath, 'utf8');

const target = 's?await(0,ve.emptyDir)(t.distDirectory):await(0,ve.ensureDir)(t.distDirectory)';
const replacement = '(s&&!process.argv.includes("--tag=dev")&&!t.distDirectory.includes("-dev"))?await(0,ve.emptyDir)(t.distDirectory):await(0,ve.ensureDir)(t.distDirectory)';

if (code.includes(target)) {
  code = code.replace(target, replacement);
  fs.writeFileSync(distPath, code, 'utf8');
  console.log('Successfully patched Plasmo emptyDir logic!');
} else {
  console.log('Target string not found or already patched.');
}
