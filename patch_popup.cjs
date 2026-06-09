const fs = require('fs');
let c = fs.readFileSync('components/OrderManager.tsx', 'utf8');

c = c.replace(
    /const \[viewImage, setViewImage\] = useState<string \| null>\(null\);/,
    `const [viewImage, setViewImage] = useState<string | null>(null);
  const [statusPopoverId, setStatusPopoverId] = useState<string | null>(null);

  useEffect(() => {
      const handleOutside = () => setStatusPopoverId(null);
      if (statusPopoverId) document.addEventListener('click', handleOutside);
      return () => document.removeEventListener('click', handleOutside);
  }, [statusPopoverId]);`
);

let idx1 = c.indexOf('className={`w-12 h-12 flex items-center justify-center');
if (idx1 !== -1) {
    let before = c.substring(0, idx1);
    let after = c.substring(idx1);
    
    // Replace the onClick inside the button:
    let replacement = `onClick={(e) => {
                                                           e.stopPropagation();
                                                           setStatusPopoverId(statusPopoverId === order.id ? null : order.id);
                                                       }}
                                                       className={\`relative w-12 h-12 flex items-center`;
                                                       
    // We need to replace from `onClick={(e) => ...` up to `className={\`w-12 h-12 flex items-center`
    c = c.replace(/onClick=\{\(e\) => \{[\s\S]*?className=\{\`w-12 h-12 flex items-center/, replacement);

    // Now insert the popover inside the div:
    c = c.replace(/\{pickingCode\}\s*<\/div>/, `{pickingCode}
                                                       {statusPopoverId === order.id && (
                                                           <div className="absolute left-[calc(100%+16px)] top-1/2 -translate-y-1/2 w-max max-w-[200px] md:max-w-xs bg-slate-900 text-white text-xs p-3 shadow-xl z-50 whitespace-normal text-left font-normal cursor-auto flex flex-col gap-1 border border-slate-700" onClick={(e) => e.stopPropagation()}>
                                                               <span className="block font-bold mb-1 border-b border-slate-700 pb-1 text-[10px] uppercase tracking-widest text-slate-400">Estado</span>
                                                               {pickingCode === 'C' ? "Pedido totalmente abastecido" : (
                                                                   (() => {
                                                                       const missing = order.items.filter(item => getTotalPickedQuantity(order, orders, item.sku) < item.quantity).map(i => i.sku);
                                                                       return missing.length > 0 ? \`Itens por abastecer: \${missing.join(", ")}\` : "Nenhum item abastecido";
                                                                   })()
                                                               )}
                                                               <div className="absolute top-1/2 -translate-y-1/2 -left-2 border-[6px] border-transparent border-r-slate-900"></div>
                                                           </div>
                                                       )}
                                                   </div>`);
}

fs.writeFileSync('components/OrderManager.tsx', c);
