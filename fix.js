const fs = require('fs');
let content = fs.readFileSync('components/OrderManager.tsx', 'utf8');

content = content.replace(/setMessage\(\{\s*type:\s*'success',\s*text:\s*(.*?)\s*\}\);/g, 'toast.success($1);');
content = content.replace(/setMessage\(\{\s*type:\s*'error',\s*text:\s*(.*?)\s*\}\);/g, 'toast.error($1);');
content = content.replace(/setMessage\(null\);/g, '');

content = content.replace(/\{\s*message\s*&&\s*\([\s\S]*?\{message\.text\}[\s\S]*?\)\s*\}/g, '');
fs.writeFileSync('components/OrderManager.tsx', content);

let stock = fs.readFileSync('components/StockManager.tsx', 'utf8');
stock = stock.replace(/const \[message, setMessage\] = useState[^\n]+;/g, '');
stock = stock.replace(/setMessage\(\{\s*type:\s*'success',\s*text:\s*(.*?)\s*\}\);/g, 'toast.success($1);');
stock = stock.replace(/setMessage\(\{\s*type:\s*'error',\s*text:\s*(.*?)\s*\}\);/g, 'toast.error($1);');
stock = stock.replace(/setMessage\(null\);/g, '');
stock = stock.replace(/\{\s*message\s*&&\s*\([\s\S]*?\{message\.text\}[\s\S]*?\)\s*\}/g, '');
fs.writeFileSync('components/StockManager.tsx', stock);

let purchase = fs.readFileSync('components/PurchaseOrderManager.tsx', 'utf8');
purchase = purchase.replace(/const \[message, setMessage\] = useState[^\n]+;/g, '');
purchase = purchase.replace(/setMessage\(\{\s*type:\s*'success',\s*text:\s*(.*?)\s*\}\);/g, 'toast.success($1);');
purchase = purchase.replace(/setMessage\(\{\s*type:\s*'error',\s*text:\s*(.*?)\s*\}\);/g, 'toast.error($1);');
purchase = purchase.replace(/setMessage\(null\);/g, '');
purchase = purchase.replace(/\{\s*message\s*&&\s*\([\s\S]*?\{message\.text\}[\s\S]*?\)\s*\}/g, '');
fs.writeFileSync('components/PurchaseOrderManager.tsx', purchase);

let settings = fs.readFileSync('components/Settings.tsx', 'utf8');
settings = settings.replace(/const \[message, setMessage\] = useState[^\n]+;/g, '');
settings = settings.replace(/setMessage\('(.*?)'\);/g, 'toast.success("$1");');
settings = settings.replace(/setTimeout\(\(\) => toast\.success\(""\), 3000\);/g, '');
settings = settings.replace(/\{\s*message\s*&&\s*\([\s\S]*?\{message\}[\s\S]*?\)\s*\}/g, '');
fs.writeFileSync('components/Settings.tsx', settings);

let users = fs.readFileSync('components/UsersManager.tsx', 'utf8');
users = users.replace(/const \[message, setMessage\] = useState[^\n]+;/g, '');
users = users.replace(/setMessage\(\{\s*type:\s*'success',\s*text:\s*(.*?)\s*\}\);/g, 'toast.success($1);');
users = users.replace(/setMessage\(\{\s*type:\s*'error',\s*text:\s*(.*?)\s*\}\);/g, 'toast.error($1);');
users = users.replace(/setMessage\(null\);/g, '');
users = users.replace(/\{\s*message\s*&&\s*\([\s\S]*?\{message\.text\}[\s\S]*?\)\s*\}/g, '');
fs.writeFileSync('components/UsersManager.tsx', users);
