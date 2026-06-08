import React, { useState, useMemo } from 'react';
import { Receipt, MasterMaterial, ReceiptItem, Company } from '../types';
import { Search, Download, ArrowDownCircle, X, Image as ImageIcon, Calendar, ChevronDown, ChevronUp, User, Package, FileSpreadsheet, ChevronLeft, ChevronRight } from 'lucide-react';

declare const XLSX: any;

interface ReceiptsManagerProps {
  receipts: Receipt[];
  masterList: MasterMaterial[];
  companies: Company[];
}

const ReceiptsManager: React.FC<ReceiptsManagerProps> = ({ receipts, masterList, companies }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState<number>(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Helper to find description
  const getDescription = (sku: string) => {
    const item = masterList.find(m => m.sku === sku);
    return item ? item.description : 'Sem descrição';
  };

  // Helper to get all items from a receipt (flattened from pedidos)
  const getAllItemsFromReceipt = (receipt: Receipt) => {
    const pedidos = receipt.pedidos ? (Array.isArray(receipt.pedidos) ? receipt.pedidos : Object.values(receipt.pedidos)) : [];
    const allItems: any[] = [];
    
    pedidos.forEach((pedido: any) => {
      const items = pedido.items ? (Array.isArray(pedido.items) ? pedido.items : Object.values(pedido.items)) : [];
      items.forEach((item: any) => {
        allItems.push({
          ...item,
          poNumber: pedido.poNumber,
          description: pedido.description,
          documentImage: pedido.documentImage
        });
      });
    });
    
    return allItems;
  };

  // Filter and group receipts
  const groupedReceipts = useMemo(() => {
    // Sort by date desc
    const sorted = [...receipts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const groups: Record<string, Receipt[]> = {};
    sorted.forEach(r => {
        const key = r.sessionId || r.id;
        if (!groups[key]) groups[key] = [];
        groups[key].push(r);
    });

    const allGroups = Object.values(groups);

    if (!searchQuery) return allGroups;

    const q = searchQuery.toLowerCase();

    return allGroups.filter(group => {
        return group.some(r => {
            // Search in pedidos' PO numbers
            const pedidos = r.pedidos ? (Array.isArray(r.pedidos) ? r.pedidos : Object.values(r.pedidos)) : [];
            if (pedidos.some((p: any) => p.poNumber && p.poNumber.toLowerCase().includes(q))) return true;
            if (r.notes && r.notes.toLowerCase().includes(q)) return true;
            
            // Search in items within pedidos
            const allItems = getAllItemsFromReceipt(r);
            return allItems.some(item => 
                (item.material && item.material.toLowerCase().includes(q)) || 
                (item.material && getDescription(item.material).toLowerCase().includes(q)) ||
                (item.description && item.description.toLowerCase().includes(q)) ||
                (item.bin && item.bin.toLowerCase().includes(q))
            );
        });
    });
  }, [receipts, searchQuery, masterList]);

  const toggleExpand = (id: string) => {
      setExpandedId(prev => prev === id ? null : id);
  };

  const handleExportSingleExcel = (group: Receipt[]) => {
    const flatData: any[] = [];

    group.forEach(receipt => {
        const pedidos = receipt.pedidos ? (Array.isArray(receipt.pedidos) ? receipt.pedidos : Object.values(receipt.pedidos)) : [];
        
        pedidos.forEach((pedido: any) => {
            const items = pedido.items ? (Array.isArray(pedido.items) ? pedido.items : Object.values(pedido.items)) : [];
            let itemCounter = 10;

            // Determine Centro based on companyId
            let centro = '1700'; // Default
            if (receipt.companyId) {
                const comp = companies.find(c => c.id === receipt.companyId);
                if (comp && comp.name.toLowerCase().includes('hotelaria')) {
                    centro = '2200';
                } else if (comp && comp.name.toLowerCase().includes('avac')) {
                    centro = '1700';
                }
            }

            const dateStr = new Date(receipt.date).toLocaleDateString('pt-PT');

            items.forEach((item: any) => {
                flatData.push({
                    "ID DOC": item.id || receipt.id,
                    "Pedido Compra": pedido.poNumber || '-',
                    "Data Documento": dateStr,
                    "Data Lançamento": dateStr,
                    "Texto Cabeçalho": pedido.description || receipt.notes || '',
                    "Material": item.material || '',
                    "Centro": centro,
                    "Depósito": "0002",
                    "Item": itemCounter.toString().padStart(4, '0'),
                    "Quantidade": item.qty || 0,
                    "Texto Item": "",
                    "Lote": item.bin || '',
                });
                itemCounter += 10;
            });
        });
    });

    if (flatData.length === 0) {
        alert("Esta entrada não tem itens para exportar.");
        return;
    }

    const ws = XLSX.utils.json_to_sheet(flatData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Entrada");
    
    // Get first PO number from first pedido
    const firstPO = group[0].pedidos?.[0]?.poNumber || 'S_N';
    const safePO = firstPO.replace(/[^a-z0-9]/gi, '_');
    const exportDateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `Entrada_${safePO}_${exportDateStr}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
        
        {/* Image Modal */}
        {selectedImages.length > 0 && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setSelectedImages([])}>
                <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
                    <button 
                        onClick={() => setSelectedImages([])}
                        className="absolute -top-12 right-0 text-white hover:text-gray-300 p-2"
                    >
                        <X className="w-8 h-8" />
                    </button>
                    
                    <div className="relative w-full flex-1 flex items-center justify-center overflow-hidden min-h-[50vh]">
                        {selectedImages.length > 1 && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); setCurrentImageIndex(prev => prev > 0 ? prev - 1 : selectedImages.length - 1); }}
                                className="absolute left-2 z-10 p-2 text-white hover:text-gray-300 bg-black/50 hover:bg-black/70 rounded-full transition-all"
                            >
                                <ChevronLeft className="w-8 h-8" />
                            </button>
                        )}
                        
                        <img 
                            src={selectedImages[currentImageIndex]} 
                            alt={`Documento de Entrada ${currentImageIndex + 1}`} 
                            className="object-contain max-w-full max-h-[80vh] rounded-none bg-white"
                        />
                        
                        {selectedImages.length > 1 && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); setCurrentImageIndex(prev => prev < selectedImages.length - 1 ? prev + 1 : 0); }}
                                className="absolute right-2 z-10 p-2 text-white hover:text-gray-300 bg-black/50 hover:bg-black/70 rounded-full transition-all"
                            >
                                <ChevronRight className="w-8 h-8" />
                            </button>
                        )}
                    </div>
                    
                    {selectedImages.length > 1 && (
                        <div className="mt-4 text-white font-medium bg-black/50 px-4 py-1 rounded-full">
                            {currentImageIndex + 1} / {selectedImages.length}
                        </div>
                    )}
                    
                    <div className="mt-4 flex justify-center">
                        <a 
                            href={selectedImages[currentImageIndex]} 
                            download={`comprovativo_entrada_${Date.now()}.jpg`}
                            className="bg-white text-black px-3 py-1.5 rounded-none text-sm uppercase tracking-wider font-semibold font-bold flex items-center gap-2 hover:bg-gray-100"
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
        <div className="bg-transparent p-4 rounded-none border border-slate-200 dark:border-slate-700 shadow-none">
            <div className="relative">
                <Search className="absolute left-3 top-2.5 w-5 h-5 text-slate-400" />
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Pesquisar por encomenda (PO) ou material..."
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-slate-600 focus:border-brand-500 focus:ring-0 rounded-none focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
            </div>
        </div>

        {/* List of Receipts */}
        <div className="space-y-4">
            {groupedReceipts.length === 0 ? (
                <div className="text-center p-12 bg-transparent rounded-none border border-slate-200 dark:border-slate-700">
                    <p className="text-slate-400">Nenhuma entrada encontrada.</p>
                </div>
            ) : (
                groupedReceipts.map((group) => {
                    const groupKey = group[0].sessionId || group[0].id;
                    const isExpanded = expandedId === groupKey;
                    
                    // Calculate total items across all receipts in the group
                    const totalItems = group.reduce((acc, r) => {
                        const allItems = getAllItemsFromReceipt(r);
                        return acc + allItems.length;
                    }, 0);

                    // Get unique PO numbers from all pedidos
                    const allPOs = group.flatMap(r => {
                        const pedidos = r.pedidos ? (Array.isArray(r.pedidos) ? r.pedidos : Object.values(r.pedidos)) : [];
                        return pedidos.map((p: any) => p.poNumber).filter(Boolean);
                    });
                    const poNumbers = Array.from(new Set(allPOs)).join(', ') || 'N/A';

                    // Check if any pedido has a document image
                    const hasImage = group.some(r => {
                        const pedidos = r.pedidos ? (Array.isArray(r.pedidos) ? r.pedidos : Object.values(r.pedidos)) : [];
                        return pedidos.some((p: any) => p.documentImage);
                    });

                    return (
                        <div key={groupKey} className="bg-transparent rounded-none shadow-none border border-slate-200 dark:border-slate-700 overflow-hidden transition-all">
                            {/* Header / Summary Row */}
                            <div 
                                onClick={() => toggleExpand(groupKey)}
                                className={`p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 ${isExpanded ? 'bg-slate-50 dark:bg-slate-700/50' : ''}`}
                            >
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-none text-blue-600 dark:text-blue-400">
                                            <Package className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 uppercase font-bold">Nº Encomenda(s)</p>
                                            <p className="text-lg font-bold text-slate-800 dark:text-white truncate max-w-[200px]" title={poNumbers}>{poNumbers}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-6">
                                        <div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1"><Calendar className="w-3 h-3"/> Data</p>
                                            <p className="font-medium text-slate-700 dark:text-slate-300">
                                                {new Date(group[0].date).toLocaleDateString()} <span className="text-xs text-slate-400">{new Date(group[0].date).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1"><User className="w-3 h-3"/> Utilizador</p>
                                            <p className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[120px]">{group[0].userId}</p>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between md:justify-end gap-4">
                                        <div className="text-right mr-4">
                                            <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-3 py-1 rounded-full text-xs font-bold border border-slate-200 dark:border-slate-600">
                                                {totalItems} {totalItems === 1 ? 'Item' : 'Itens'}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 pl-4 border-l border-slate-100 dark:border-slate-700 ml-4">
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); handleExportSingleExcel(group); }}
                                        className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-full transition-colors"
                                        title="Exportar Excel"
                                    >
                                        <FileSpreadsheet className="w-5 h-5" /> 
                                    </button>
                                    {hasImage && (
                                        <button 
                                            onClick={(e) => { 
                                                e.stopPropagation(); 
                                                // Collect all images from the group
                                                const images: string[] = [];
                                                for (const r of group) {
                                                    const pedidos = r.pedidos ? (Array.isArray(r.pedidos) ? r.pedidos : Object.values(r.pedidos)) : [];
                                                    for (const p of pedidos) {
                                                        if ((p as any).documentImage) {
                                                            images.push((p as any).documentImage);
                                                        }
                                                    }
                                                }
                                                if (images.length > 0) {
                                                    setSelectedImages(images);
                                                    setCurrentImageIndex(0);
                                                }
                                            }}
                                            className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-full transition-colors"
                                            title="Ver Comprovativos"
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
                                                    <th className="px-6 py-3 font-semibold">Nº Encomenda</th>
                                                    <th className="px-6 py-3 font-semibold">ID Doc</th>
                                                    <th className="px-6 py-3 font-semibold">Texto Cabeçalho</th>
                                                    <th className="px-6 py-3 font-semibold">Material</th>
                                                    <th className="px-6 py-3 font-semibold">Descrição</th>
                                                    <th className="px-6 py-3 font-semibold text-right">Qtd Recebida</th>
                                                    <th className="px-6 py-3 font-semibold">Localização</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                                {group.flatMap(receipt => {
                                                    const pedidos = receipt.pedidos ? (Array.isArray(receipt.pedidos) ? receipt.pedidos : Object.values(receipt.pedidos)) : [];
                                                    
                                                    return pedidos.flatMap((pedido: any) => {
                                                        const items = pedido.items ? (Array.isArray(pedido.items) ? pedido.items : Object.values(pedido.items)) : [];
                                                        
                                                        return items.map((item: any, idx: number) => (
                                                            <tr key={`${receipt.id}-${pedido.id}-${idx}`} className="hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                                                                <td className="px-6 py-3 font-medium text-slate-700 dark:text-slate-300">
                                                                    {pedido.poNumber || '-'}
                                                                </td>
                                                                <td className="px-6 py-3 font-mono text-xs text-slate-500">
                                                                    {item.id || receipt.id || '-'}
                                                                </td>
                                                                <td className="px-6 py-3 text-xs text-slate-500">
                                                                    {pedido.description || receipt.notes || '-'}
                                                                </td>
                                                                <td className="px-6 py-3 font-mono font-medium text-brand-600 dark:text-brand-400">
                                                                    {item.material || '-'}
                                                                </td>
                                                                <td className="px-6 py-3">
                                                                    {getDescription(item.material)}
                                                                </td>
                                                                <td className="px-6 py-3 text-right">
                                                                    <span className="font-bold text-slate-800 dark:text-white bg-white dark:bg-slate-700 px-2 py-1 rounded-none border border-slate-200 dark:border-slate-600 shadow-none">
                                                                        {item.qty || 0}
                                                                    </span>
                                                                </td>
                                                                <td className="px-6 py-3 font-mono text-xs text-slate-500">
                                                                    {item.bin || '-'}
                                                                </td>
                                                            </tr>
                                                        ));
                                                    });
                                                })}
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