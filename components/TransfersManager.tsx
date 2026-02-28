import React, { useState, useMemo } from 'react';
import { Transfer, MasterMaterial } from '../types';
import { Search, ArrowRightLeft, FileSpreadsheet } from 'lucide-react';

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

  const handleExportExcel = () => {
    if (filteredTransfers.length === 0) {
        alert("Não há transferências para exportar.");
        return;
    }

    const flatData = filteredTransfers.map(t => ({
        "Data": new Date(t.timestamp).toLocaleDateString(),
        "Hora": new Date(t.timestamp).toLocaleTimeString(),
        "Material": t.material,
        "Descrição": getDescription(t.material),
        "Origem": t.originBin,
        "Destino": t.destBin,
        "Quantidade": t.qty,
        "Utilizador": t.userId
    }));

    const ws = XLSX.utils.json_to_sheet(flatData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Transferências");
    
    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Transferencias_${dateStr}.xlsx`);
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
            
            <button
                onClick={handleExportExcel}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors shadow-sm"
            >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Exportar Excel</span>
            </button>
        </div>

        {/* Search Bar */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="relative">
                <Search className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Pesquisar por material, localização ou utilizador..."
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-orange-500 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
            </div>
        </div>

        {/* List of Transfers */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase text-xs">
                        <tr>
                            <th className="px-6 py-3 font-semibold">Data</th>
                            <th className="px-6 py-3 font-semibold">Material</th>
                            <th className="px-6 py-3 font-semibold">Descrição</th>
                            <th className="px-6 py-3 font-semibold text-center">Origem</th>
                            <th className="px-6 py-3 font-semibold text-center">Destino</th>
                            <th className="px-6 py-3 font-semibold text-right">Qtd</th>
                            <th className="px-6 py-3 font-semibold">Utilizador</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {filteredTransfers.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                                    Nenhuma transferência encontrada.
                                </td>
                            </tr>
                        ) : (
                            filteredTransfers.map((t) => (
                                <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                    <td className="px-6 py-3 whitespace-nowrap">
                                        <div className="flex flex-col">
                                            <span className="font-medium text-slate-700 dark:text-slate-200">
                                                {new Date(t.timestamp).toLocaleDateString()}
                                            </span>
                                            <span className="text-xs text-slate-400">
                                                {new Date(t.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-3 font-mono font-medium text-orange-600 dark:text-orange-400">
                                        {t.material}
                                    </td>
                                    <td className="px-6 py-3 max-w-xs truncate" title={getDescription(t.material)}>
                                        {getDescription(t.material)}
                                    </td>
                                    <td className="px-6 py-3 text-center font-mono text-xs">
                                        <span className="bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                                            {t.originBin}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 text-center font-mono text-xs">
                                        <span className="bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600">
                                            {t.destBin}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 text-right">
                                        <span className="font-bold text-slate-800 dark:text-white">
                                            {t.qty}
                                        </span>
                                    </td>
                                    <td className="px-6 py-3 text-xs text-slate-500 truncate max-w-[100px]" title={t.userId}>
                                        {t.userId}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
  );
};

export default TransfersManager;
