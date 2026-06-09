const fs = require('fs');
let c = fs.readFileSync('components/OrderManager.tsx', 'utf8');

c = c.replace(/                                            <\/div>\n                                        <\/div>\n                                        \n                                        \{isExpanded && \(/g,
`                                            </div>
                                        
                                        {isExpanded && (`);

// Wait! At the bottom there is also:
c = c.replace(/                            \}\)\}\n                        <\/div>\n                \}\)\n            <\/div>\n    \);\n\};\n\nexport default OrderManager;\n/,
`                            })}
                    </div>
                </div>
            )}
        </div>
    );
};

export default OrderManager;
`);

fs.writeFileSync('components/OrderManager.tsx', c);
