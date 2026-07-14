const fs = require('fs');
const path = require('path');

function moveContentsUp(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      moveContentsUp(srcPath, destPath);
      try { fs.rmSync(srcPath, { recursive: true, force: true }); } catch (e) {}
    } else {
      if (fs.existsSync(destPath)) {
        fs.unlinkSync(destPath);
      }
      fs.renameSync(srcPath, destPath);
    }
  }
}

function replaceInFiles(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      replaceInFiles(fullPath);
    } else if (/\.(json|html|js|css)$/.test(entry.name)) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;

      // Replace absolute paths starting with /.plasmo/ or /plasmo/
      if (/\/\.?plasmo\//.test(content)) {
        content = content.replace(/\/\.?plasmo\//g, '/');
        changed = true;
      }
      // Replace relative paths starting with .plasmo/ or plasmo/ in JSON/quotes
      if (/(["'])\.?plasmo\//.test(content)) {
        content = content.replace(/(["'])\.?plasmo\//g, '$1');
        changed = true;
      }

      if (changed) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated paths in: ${path.relative(path.join(__dirname, '..'), fullPath)}`);
      }
    }
  }
}

const buildDirs = [
  path.join(__dirname, '../build/chrome-mv3-prod'),
  path.join(__dirname, '../build/chrome-mv3-dev')
];

for (const buildDir of buildDirs) {
  if (!fs.existsSync(buildDir)) continue;

  // Check for both .plasmo and plasmo staging folders inside buildDir
  for (const stagingName of ['.plasmo', 'plasmo']) {
    const stagingDir = path.join(buildDir, stagingName);
    if (fs.existsSync(stagingDir)) {
      console.log(`Moving contents from ${path.relative(path.join(__dirname, '..'), stagingDir)} up to ${path.relative(path.join(__dirname, '..'), buildDir)}...`);
      moveContentsUp(stagingDir, buildDir);
      try { fs.rmSync(stagingDir, { recursive: true, force: true }); } catch (e) {}
    }
  }

  replaceInFiles(buildDir);
}
