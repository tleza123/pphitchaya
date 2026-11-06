const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(walk(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

const allSrcFiles = walk('src');
console.log(`Auditing ${allSrcFiles.length} files in src/...`);

const tests = [
  { name: 'Extended_Pictographic', regex: /\p{Extended_Pictographic}/gu },
  { name: 'Emoji_Presentation', regex: /\p{Emoji_Presentation}/gu },
  { name: 'Emoji_Range_1', regex: /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu },
  { name: 'Broad_Emoji_Range', regex: /[\u{1F000}-\u{1FAFF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B50}-\u{2B55}]/gu },
];

let totalViolations = 0;
const report = [];

allSrcFiles.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);

  lines.forEach((line, idx) => {
    tests.forEach(t => {
      const matches = [...line.matchAll(t.regex)];
      if (matches.length > 0) {
        totalViolations++;
        const chars = matches.map(m => `${m[0]} (U+${m[0].codePointAt(0).toString(16).toUpperCase()})`);
        report.push({
          detector: t.name,
          file: file.replace(/\\/g, '/'),
          line: idx + 1,
          characters: chars,
          lineText: line.trim()
        });
      }
    });
  });
});

console.log(`Total match events: ${totalViolations}`);
console.log(JSON.stringify(report, null, 2));
