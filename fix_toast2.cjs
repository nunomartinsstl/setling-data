const fs = require('fs');
let c = fs.readFileSync('components/OrderManager.tsx', 'utf8');

c = c.replace(/toast\('([^']+)', \{ duration: (\d+), icon: '[^']+' \}\)/g, 'toast.info("$1", $2)');
c = c.replace(/toast\('([^']+)', \{ icon: '[^']+' \}\)/g, 'toast.info("$1")');

fs.writeFileSync('components/OrderManager.tsx', c);
