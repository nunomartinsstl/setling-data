const fs = require('fs');
let c = fs.readFileSync('components/OrderManager.tsx', 'utf8');

c = c.replace(
    /\{\(type === 'FINISHED' \|\| isGhost\) && \(\s*<div\s*className="absolute top-3 right-3 cursor-pointer"[\s\S]*?<\/div>\s*\)\}/,
    ''
);

// One thing about the popup for 'C': "Pedido totalmente abastecido" instead of "pedido totalmente abastecido" (capitalized correctly, which I did).
// And for 'A' and 'B': detail the missing items (which I did using `missing.join(", ")`).

fs.writeFileSync('components/OrderManager.tsx', c);
