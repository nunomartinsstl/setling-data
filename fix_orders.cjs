const fs = require('fs');

function normalize(s) {
    return s.replace(/\\s+/g, ' ').replace(/\\$\\{/g, '${');
}

let c = fs.readFileSync('components/OrderManager.tsx', 'utf8');

// 1. Add handleExportExcel
const exportFunc = `
  const handleExportExcel = () => {
    let exportData = [];
    groupedOrders.forEach(group => {
      const allOrdersInGroup = [group.root, ...group.children];
      const displayedOrders = type === 'FINISHED' 
        ? allOrdersInGroup.filter(o => o.status === 'COMPLETED')
        : allOrdersInGroup;
      
      displayedOrders.forEach(order => {
        let pickActor = order.creator;
        let pickDate = order.dateCreated;
        
        if (order.changeLog) {
            const pickedLogs = order.changeLog.filter((log) => log.details.toLowerCase().includes('separado') || log.details.toLowerCase().includes('conclu') || log.details.toLowerCase().includes('submet'));
            if (pickedLogs.length > 0) {
               const lastLog = pickedLogs[pickedLogs.length - 1];
               pickActor = lastLog.actor;
               pickDate = lastLog.date;
            }
        }
        
        order.items.forEach((item) => {
           exportData.push({
               "Data Pedido": new Date(order.dateCreated).toLocaleString(),
               "Data Processado": (type === 'FINISHED' || order.status === 'COMPLETED') ? new Date(pickDate).toLocaleString() : '',
               "Nome do Pedido": order.title,
               "Material (SKU)": item.sku || 'S/N',
               "Descrição": item.description,
               "Qtd Pedida": item.quantity,
               "Qtd Processada": (type === 'FINISHED' || order.status === 'COMPLETED') ? getTotalPickedQuantity(order, orders, item.sku) : 0,
               "Responsável (Picking)": (type === 'FINISHED' || order.status === 'COMPLETED') ? pickActor : ''
           });
        });
      });
    });

    if(exportData.length === 0) {
        toast.info("Não existem dados para exportar.");
        return;
    }
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedidos");
    const label = type === 'FINISHED' ? 'Finalizados' : 'Abertos';
    XLSX.writeFile(wb, \`Pedidos_\${label}_\${new Date().toISOString().split('T')[0]}.xlsx\`);
  };

  const showForm = mode === 'CREATE' || editingOrderId !== null;
`;

c = c.replace("  const showForm = mode === 'CREATE' || editingOrderId !== null;", exportFunc);

// 2. Replace Header UI to include Reset and Export buttons
const findHeader = `            {mode === 'LIST' && (
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowAdvancedSearch(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
                    >
                        <Search className="w-4 h-4" />
                        <span>Pesquisa Avançada</span>
                        {activeFiltersCount > 0 && (
                            <span className="bg-brand-600 text-white text-xs px-2 py-0.5 rounded-full">
                                {activeFiltersCount}
                            </span>
                        )}
                    </button>
                </div>
            )}`;

const replaceHeader = `            {mode === 'LIST' && (
                <div className="flex flex-wrap items-center gap-2">
                    {activeFiltersCount > 0 && (
                         <button 
                             onClick={() => setAdvancedFilters({ material: '', user: '', datePlacedStart: '', datePlacedEnd: '', dateDueStart: '', dateDueEnd: '', pep: '' })}
                             className="flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors bg-red-50 border-red-200 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/40 outline-none"
                             title="Limpar Filtros"
                         >
                             <X className="w-4 h-4" />
                             <span className="hidden sm:inline font-medium">Limpar</span>
                         </button>
                    )}
                    <button
                        onClick={handleExportExcel}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors bg-green-50 border-green-200 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-900/40 outline-none"
                    >
                        <Download className="w-4 h-4" />
                        <span className="hidden sm:inline font-medium">Exportar</span>
                    </button>
                    <button
                        onClick={() => setShowAdvancedSearch(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700 outline-none"
                    >
                        <Search className="w-4 h-4" />
                        <span className="font-medium">Pesquisa Avançada</span>
                        {activeFiltersCount > 0 && (
                            <span className="bg-brand-600 text-white text-xs px-2 py-0.5 rounded-full">
                                {activeFiltersCount}
                            </span>
                        )}
                    </button>
                </div>
            )}`;

c = c.replace(findHeader, replaceHeader);

fs.writeFileSync('components/OrderManager.tsx', c);
