const fs = require('fs');
let c = fs.readFileSync('components/OrderManager.tsx', 'utf8');

let fixed = c.replace(/                            \}\)\}\n                       <\/div>\n                   \);\n               \}\)\n           \)\}/,
`                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};`);

fs.writeFileSync('components/OrderManager.tsx', fixed);
