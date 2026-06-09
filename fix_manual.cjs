const fs = require('fs');
let c = fs.readFileSync('components/OrderManager.tsx', 'utf8');

c = c.replace(/                                    <\/div>\n                                \)\)\}/,
`                                    </div>
                                </div>
                                )}`);

fs.writeFileSync('components/OrderManager.tsx', c);
