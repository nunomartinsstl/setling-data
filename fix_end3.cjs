const fs = require('fs');
let c = fs.readFileSync('components/OrderManager.tsx', 'utf8');

const endFix = `                            })}
                        </div>
                    </div>
                )}
        </div>
    );
};

export default OrderManager;
`;

const idx = c.lastIndexOf('})}');
if (idx !== -1) {
    c = c.substring(0, idx) + endFix;
    fs.writeFileSync('components/OrderManager.tsx', c);
}
