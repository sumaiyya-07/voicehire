const fs = require('fs');
const path = 'c:/DEPLOYMENT VH/voicehire/src/app/page.js';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');
console.log('Total lines:', lines.length);
// Keep only the first 1594 lines (the new clean render section ends at line 1594)
const trimmed = lines.slice(0, 1594).join('\n');
fs.writeFileSync(path, trimmed, 'utf8');
console.log('Done. File now has', trimmed.split('\n').length, 'lines');
