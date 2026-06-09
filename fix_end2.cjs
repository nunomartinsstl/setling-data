const fs = require('fs');
let c = fs.readFileSync('components/OrderManager.tsx', 'utf8');
let idx = c.lastIndexOf("})}");
if (idx !== -1) {
    let newStr = `                            })}
                        </div>
                )}
            </div>
    );
};

export default OrderManager;
`;
    c = c.substring(0, idx) + newStr;
    fs.writeFileSync('components/OrderManager.tsx', c);
}
