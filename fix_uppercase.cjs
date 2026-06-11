const fs = require('fs');

const doNotTouch = [
  'setRegPassword',
  'setConfirmPassword',
  'setLoginPassword',
  'setLoginIdentifier',
  'setEmail',
  'setInviteEmail',
  // maybe dates shouldn't be upper-cased? Dates are like '2023-01-01', which .toUpperCase() doesn't change, so fine.
  // email? Usually lowercased, but if user wants uppercase, maybe leave it or uppercase it? Let's leave email.
];

const dir = 'components';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.tsx'));

for (const file of files) {
  let content = fs.readFileSync(`${dir}/${file}`, 'utf8');
  let original = content;

  // We want to replace e.target.value with e.target.value.toUpperCase()
  // But ONLY in onChange handlers...
  // A simple regex: onChange={(e) => setX(e.target.value)}
  // Or: e => updateRow(idx, 'description', e.target.value)

  // We can just replace e.target.value.toUpperCase() if it's not already.
  // Wait, let's just replace `e.target.value` with `e.target.value.toUpperCase()` across the board, 
  // EXCEPT on lines that contain password or email keywords?

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip if it contains password/email states
    if (doNotTouch.some(ignored => line.includes(ignored))) continue;

    // skip if it's already upper case
    if (line.includes('e.target.value.toUpperCase()')) continue;
    
    // skip if it's checking length or something, e.g., e.target.value.length
    if (line.includes('e.target.value.')) continue;

    // Replace e.target.value with e.target.value.toUpperCase()
    // It could be in `e.target.value)` or `e.target.value }` or `e.target.value,` 
    if (line.includes('onChange=') || line.includes('e.target.value')) {
        // If it's a select element the value might be 'OPEN' etc, toUpperCase is fine.
        // Wait, what if it's a file upload? `e.target.files` wouldn't match.
        // What if it's a checkbox? `e.target.checked` wouldn't match.
        
        lines[i] = line.replace(/e\.target\.value(?![\.\w])/g, "e.target.value.toUpperCase()");
    }
  }

  const newContent = lines.join('\n');
  if (newContent !== original) {
    fs.writeFileSync(`${dir}/${file}`, newContent);
    console.log(`Updated ${file}`);
  }
}
