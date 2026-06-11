import React, { useState, useMemo } from 'react';
import { Transfer, MasterMaterial } from '../types';
import { Search, ArrowRightLeft, FileSpreadsheet, ArrowRight, Calendar, User, Clock } from 'lucide-react';

declare const XLSX: any;

interface TransfersManagerProps {
  transfers: Transfer[];
  masterList: MasterMaterial[];
}

const TransfersManager: React.FC<TransfersManagerProps> = ({ transfers, masterList }) => {
  const [searchQuery, setSearchQuery] = useState('');

  // Helper to find description
  const getDescription = (sku: string) => {
    const item = masterList.find(m => m.sku === sku);
    return item ? item.description : 'Sem descrição';
  };

  // Filter transfers based on search
  const filteredTransfers = useMemo(() => {
    // Sort by date desc
    const sorted = [...transfers].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (!searchQuery) return sorted;
    const q = searchQuery.toLowerCase();

    return sorted.filter(t => 
        t.material.toLowerCase().includes(q) || 
        getDescription(t.material).toLowerCase().includes(q) ||
        t.originBin.toLowerCase().includes(q) ||
        t.destBin.toLowerCase().includes(q) ||
        t.userId.toLowerCase().includes(q)
    );
  }, [transfers, searchQuery, masterList]);

  const handleExportExcel = (t: Transfer) => {
    const flatData = [{
        "Data": new Date(t.timestamp).toLocaleDateString(),
        "Material": t.material,
        "Descrição": getDescription(t.material),
        "Origem": t.originBin,
        "Destino": t.destBin,
        "Quantidade": t.qty
    }];

    const ws = XLSX.utils.json_to_sheet(flatData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transferência");
    
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Transferencia_${t.material}_${dateStr}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
                <div className="bg-orange-100 dark:bg-orange-900/30 p-3 rounded-full">
                    <ArrowRightLeft className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Transferências</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Registo de movimentos de material entre localizações.</p>
                </div>
            </div>
        </div>

        {/* Search Bar */}
        <div className="bg-transparent p-4 rounded-none border border-slate-200 dark:border-slate-700 shadow-none">
            <div className="relative">
                <Search className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                    placeholder="Pesquisar por material, localização ou utilizador..."
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 focus:border-brand-500 focus:ring-0 rounded-none focus:ring-2 focus:ring-orange-500 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
            </div>
        </div>

        {/* List of Transfers (Card Layout) */}
        <div className="space-y-4">
            {filteredTransfers.length === 0 ? (
                <div className="text-center p-12 bg-transparent rounded-none border border-slate-200 dark:border-slate-700 shadow-none">
                    <div className="bg-slate-100 dark:bg-slate-700 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <ArrowRightLeft className="w-8 h-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">Nenhuma transferência encontrada</h3>
                    <p className="text-slate-500 dark:text-slate-400">Tente ajustar a pesquisa.</p>
                </div>
            ) : (
                filteredTransfers.map((t) => (
                    <div 
                        key={t.id} 
                        className="bg-transparent rounded-none border border-slate-200 dark:border-slate-700 shadow-none hover:shadow-none transition-shadow-none p-4 flex flex-col gap-4"
                    >
                        {/* Top Row: Header Info */}
                        <div className="flex justify-between items-start">
                            <div className="flex-1 min-w-0 pr-4">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="font-mono font-bold text-lg text-orange-600 dark:text-orange-400">
                                        {t.material}
                                    </span>
                                    <span className="text-sm text-slate-600 dark:text-slate-300 font-medium truncate">
                                        {getDescription(t.material)}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 flex-wrap">
                                    <span className="flex items-center gap-1">
                                        <Calendar className="w-3 h-3" />
                                        {new Date(t.timestamp).toLocaleDateString()}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {new Date(t.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <User className="w-3 h-3" />
                                        {t.userId}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => handleExportExcel(t)}
                                className="flex-shrink-0 p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-none border border-transparent hover:border-green-200 dark:hover:border-green-800 transition-all"
                                title="Exportar Excel"
                            >
                                <FileSpreadsheet className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Bottom Row: Movement Details */}
                        <div className="bg-slate-50 dark:bg-slate-900/50 rounded-none p-3 border border-slate-100 dark:border-slate-700 flex items-center justify-between">
                            <div className="flex items-center gap-2 md:gap-8 flex-1 min-w-0">
                                <div className="flex flex-col min-w-0">
                                    <span className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Origem</span>
                                    <span className="font-mono font-medium text-slate-700 dark:text-slate-200 bg-transparent px-2 py-1 rounded-none border border-slate-200 dark:border-slate-600 text-sm truncate">
                                        {t.originBin}
                                    </span>
                                </div>
                                <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600 flex-shrink-0" />
                                <div className="flex flex-col min-w-0">
                                    <span className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Destino</span>
                                    <span className="font-mono font-medium text-slate-700 dark:text-slate-200 bg-transparent px-2 py-1 rounded-none border border-slate-200 dark:border-slate-600 text-sm truncate">
                                        {t.destBin}
                                    </span>
                                </div>
                            </div>
                            
                            <div className="flex flex-col items-end pl-3 border-l border-slate-200 dark:border-slate-700 ml-2 flex-shrink-0">
                                <span className="text-[10px] uppercase font-bold text-slate-400 mb-0.5">Qtd</span>
                                <span className="text-xl font-bold text-slate-800 dark:text-white leading-none">
                                    {t.qty}
                                </span>
                            </div>
                        </div>
                    </div>
                ))
            )}
        </div>
    </div>
  );
};

export default TransfersManager;
