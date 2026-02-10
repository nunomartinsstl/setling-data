import React, { useState, useMemo } from 'react';
import { Receipt, MasterMaterial, ReceiptItem } from '../types';
import { Search, Download, ArrowDownCircle, X, Image as ImageIcon, Calendar, ChevronDown, ChevronUp, User, Package, FileSpreadsheet } from 'lucide-react';

declare const XLSX: any;

interface ReceiptsManagerProps {
  receipts: Receipt[];
  masterList: MasterMaterial[];
}

const ReceiptsManager: React.FC<ReceiptsManagerProps> = ({ receipts, masterList }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Helper to find description
  const getDescription = (sku: string) => {
    const item = masterList.find(m => m.sku === sku);
    return item ? item.description : 'Sem descrição';
  };

  // Filter receipts based on search (PO number OR contents of items)
  const filteredReceipts = useMemo(() => {
    // Sort by date desc
    const sorted = [...receipts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (!searchQuery) return sorted;
    const q = searchQuery.toLowerCase();

    return sorted.filter(r => {
        // Match Top Level data
        if (r.poNumber && r.poNumber.toLowerCase().includes(q)) return true;
        
        // Match Items data
        const items: ReceiptItem[] = r.items ? (Array.isArray(r.items) ? r.items : Object.values(r.items as any)) : [];
        return items.some(item => 
            item.material.toLowerCase().includes(q) || 
            getDescription(item.material).toLowerCase().includes(q) ||
            (item.bin && item.bin.toLowerCase().includes(q))
        );
    });
  }, [receipts, searchQuery, masterList]);

  const toggleExpand = (id: string) => {
      setExpandedId(prev => prev === id ? null : id);
  };

  const handleExportSingleExcel = (receipt: Receipt) => {
    const items: ReceiptItem[] = receipt.items ? (Array.isArray(receipt.items) ? receipt.items : Object.values(receipt.items as any)) : [];
    
    if (items.length === 0) {
        alert("Esta entrada não tem itens para exportar.");
        return;
    }

    // Flatten for Excel
    const flatData: any[] = [];

    items.forEach(item => {
        flatData.push({
            "Centro": "1700",
            "Depósito": "0004",
            "Data": new Date(receipt.date).toLocaleDateString(),
            "Nº Encomenda": receipt.poNumber || '-',
            "Material": item.material,
            "Descrição": getDescription(item.material),
            "Quantidade": item.qty,
            "Localização": item.bin || '-',
        });
    });

    const ws = XLSX.utils.json_to_sheet(flatData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Entrada");
    
    const safePO = (receipt.poNumber || 'S_N').replace(/[^a-z0-9]/gi, '_');
    const dateStr = new Date(receipt.date).toISOString().split('T')[0];
    XLSX.writeFile(wb, `Entrada_${safePO}_${dateStr}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
        
        {/* Image Modal */}
        {selectedImage && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setSelectedImage(null)}>
                <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
                    <button 
                        onClick={() => setSelectedImage(null)}
                        className="absolute -top-12 right-0 text-white hover:text-gray-300 p-2"
                    >
                        <X className="w-8 h-8" />
                    </button>
                    <img 
                        src={selectedImage} 
                        alt="Documento de Entrada" 
                        className="object-contain w-full h-full rounded-lg bg-white"
                    />
                    <div className="mt-4 flex justify-center">
                        <a 
                            href={selectedImage} 
                            download={`comprovativo_entrada_${Date.now()}.jpg`}
                            className="bg-white text-black px-4 py-2 rounded-lg font-bold flex items-center gap-2 hover:bg-gray-100"
                        >
                            <Download className="w-4 h-4"/> Baixar Imagem
                        </a>
                    </div>
                </div>
            </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
                <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-full">
                    <ArrowDownCircle className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Entradas de Mercadoria</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Registo de receções de material no armazém.</p>
                </div>
            </div>
            
            {/* Global export removed */}
        </div>

        {/* Search Bar */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
            <div className="relative">
                <Search className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Pesquisar por encomenda (PO) ou material..."
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
            </div>
        </div>

        {/* List of Receipts */}
        <div className="space-y-4">
            {filteredReceipts.length === 0 ? (
                <div className="text-center p-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                    <p className="text-slate-400">Nenhuma entrada encontrada.</p>
                </div>
            ) : (
                filteredReceipts.map((receipt) => {
                    const isExpanded = expandedId === receipt.id;
                    const items: ReceiptItem[] = receipt.items ? (Array.isArray(receipt.items) ? receipt.items : Object.values(receipt.items as any)) : [];
                    const itemCount = items.length;

                    return (
                        <div key={receipt.id} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-all">
                            {/* Header / Summary Row */}
                            <div 
                                onClick={() => toggleExpand(receipt.id)}
                                className={`p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 ${isExpanded ? 'bg-slate-50 dark:bg-slate-700/50' : ''}`}
                            >
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded text-blue-600 dark:text-blue-400">
                                            <Package className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold">Nº Encomenda</p>
                                            <p className="text-lg font-bold text-slate-800 dark:text-white">{receipt.poNumber || 'N/A'}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-6">
                                        <div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1"><Calendar className="w-3 h-3"/> Data</p>
                                            <p className="font-medium text-slate-700 dark:text-slate-300">
                                                {new Date(receipt.date).toLocaleDateString()} <span className="text-xs text-slate-400">{new Date(receipt.date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1"><User className="w-3 h-3"/> Utilizador</p>
                                            <p className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[120px]">{receipt.userId}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between md:justify-end gap-4">
                                        <div className="text-right mr-4">
                                            <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-3 py-1 rounded-full text-xs font-bold border border-slate-200 dark:border-slate-600">
                                                {itemCount} {itemCount === 1 ? 'Item' : 'Itens'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 pl-4 border-l border-slate-100 dark:border-slate-700 ml-4">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleExportSingleExcel(receipt); }}
                                        className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-full transition-colors"
                                        title="Exportar Excel"
                                    >
                                        <FileSpreadsheet className="w-5 h-5" /> 
                                    </button>
                                    {receipt.documentImage && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setSelectedImage(receipt.documentImage || null); }}
                                            className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-colors"
                                            title="Ver Comprovativo"
                                        >
                                            <ImageIcon className="w-5 h-5" />
                                        </button>
                                    )}
                                    <div className="p-1">
                                        {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400"/> : <ChevronDown className="w-5 h-5 text-slate-400"/>}
                                    </div>
                                </div>
                            </div>

                            {/* Expanded Details Table */}
                            {isExpanded && (
                                <div className="border-t border-slate-100 dark:border-slate-700 animate-slide-down">
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300 bg-slate-50/50 dark:bg-slate-900/50">
                                            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase text-xs">
                                                <tr>
                                                    <th className="px-6 py-3 font-semibold">Material</th>
                                                    <th className="px-6 py-3 font-semibold">Descrição</th>
                                                    <th className="px-6 py-3 font-semibold text-right">Qtd Recebida</th>
                                                    <th className="px-6 py-3 font-semibold">Localização</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                                {items.map((item, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                                                        <td className="px-6 py-3 font-mono font-medium text-brand-600 dark:text-brand-400">
                                                            {item.material}
                                                        </td>
                                                        <td className="px-6 py-3">
                                                            {getDescription(item.material)}
                                                        </td>
                                                        <td className="px-6 py-3 text-right">
                                                            <span className="font-bold text-slate-800 dark:text-white bg-white dark:bg-slate-700 px-2 py-1 rounded border border-slate-200 dark:border-slate-600 shadow-sm">
                                                                {item.qty}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-3 font-mono text-xs text-slate-500">
                                                            {item.bin || '-'}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })
            )}
        </div>
    </div>
  );
};

export default ReceiptsManager;