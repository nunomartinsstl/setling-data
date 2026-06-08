const fs = require('fs');
let c = fs.readFileSync('components/OrderManager.tsx', 'utf8');

c = c.replace(
  '<div className="overflow-x-auto">\\n                                                        <table className="w-full text-sm text-left">',
  '<div className="">\\n                                                        <table className="w-full text-sm text-left block md:table">'
);

c = c.replace(
  '<th className="p-3 whitespace-nowrap">Material</th>\\n                                                                    <th className="p-3 whitespace-nowrap">Descrição</th>',
  '<th className="p-3 whitespace-nowrap">Material</th>\\n                                                                    <th className="p-3">Descrição</th>'
);

fs.writeFileSync('components/OrderManager.tsx', c);
