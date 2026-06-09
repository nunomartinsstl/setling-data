const fs = require('fs');

let c = fs.readFileSync('components/OrderManager.tsx', 'utf8');

c = c.replace(/toast\.info\("([^"]+)", \d+\)/g, "toast('$1', { duration: 1500, icon: 'ℹ️' })");
c = c.replace(/toast\.info\("([^"]+)"\)/g, "toast('$1', { icon: 'ℹ️' })");

fs.writeFileSync('components/OrderManager.tsx', c);
