import React, { useState, useRef, useEffect } from 'react';
import { Order, OrderLineItem, StockItem, UserRole, MasterMaterial } from '../types';
import { StorageService } from '../services/storageService';
import { Upload, FileText, Loader2, CheckCircle, Clock, Plus, Trash2, FileSpreadsheet, ArrowRightCircle, Calendar, User, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';

interface OrderManagerProps {
  orders: Order[];
  stock: StockItem[];
  masterList: MasterMaterial[];
  type: 'OPEN' | 'FINISHED';
  userRole: UserRole;
  refreshData: () => void;
  currentUsername: string;
}

interface ManualRow {
    sku: string;
    qty: string | number; // Changed to allow empty string for display
    isCustom: boolean;
    customDesc: string;
}

const OrderManager: React.FC<OrderManagerProps> = ({ orders, stock, masterList, type, userRole, refreshData, currentUsername }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  // Creation States
  const [creationStep, setCreationStep] = useState<'INITIAL' | 'DETAILS_PENDING'>('INITIAL');
  const [importMode, setImportMode] = useState<'FILE' | 'MANUAL'>('MANUAL');
  
  // Manual Entry Buffer (Drafts)
  const [manualRows, setManualRows] = useState<ManualRow[]>([{sku: '', qty: '', isCustom: false, customDesc: ''}]);
  const [orderTitle, setOrderTitle] = useState('');
  
  // Pending Order Details (Finalization)
  const [pendingItems, setPendingItems] = useState<OrderLineItem[]>([]);
  const [dueDate, setDueDate] = useState('');
  
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredOrders = orders.filter(o => type === 'OPEN' ? o.status === 'OPEN' : o.status === 'FINISHED');
  
  // Permissions
  const canEdit = userRole === UserRole.MANAGEMENT || userRole === UserRole.ADMIN;
  const isAdmin = userRole === UserRole.ADMIN;

  // --- DRAFT LOGIC ---
  // Load draft on mount
  useEffect(() => {
    const savedRows = localStorage.getItem('draft_rows');
    const savedTitle = localStorage.getItem('draft_title');
    if (savedRows) {
        try { setManualRows(JSON.parse(savedRows)); } catch(e){}
    }
    if (savedTitle) setOrderTitle(savedTitle);
  }, []);

  // Save draft on change
  useEffect(() => {
    localStorage.setItem('draft_rows', JSON.stringify(manualRows));
  }, [manualRows]);

  useEffect(() => {
    localStorage.setItem('draft_title', orderTitle);
  }, [orderTitle]);

  const clearDraft = () => {
      localStorage.removeItem('draft_rows');
      localStorage.removeItem('draft_title');
      setManualRows([{sku: '', qty: '', isCustom: false, customDesc: ''}]);
      setOrderTitle('');
      setDueDate('');
      setPendingItems([]);
      setCreationStep('INITIAL');
  };

  const getMinDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  };

  const getStockCount = (sku: string) => {
    const item = stock.find(s => s.sku === sku);
    return item ? item.quantity : 0;
  };

  const getMaterialDescription = (sku: string): string => {
      const stockItem = stock.find(s => s.sku === sku);
      if (stockItem) return stockItem.description;
      
      const masterItem = masterList.find(m => m.sku === sku);
      if (masterItem) return masterItem.description;

      return "Material Desconhecido";
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setMessage(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        const newRows: ManualRow[] = [];

        data.forEach((row: any) => {
            const material = row['MATERIAL'] || row['Material'] || row['SKU'] || row['sku'];
            const qtd = row['QTD'] || row['Qtd'] || row['Quantidade'] || row['Quantity'];

            if (material && qtd) {
                // Check if it exists in stock OR master list
                const skuStr = material.toString();
                const exists = stock.some(s => s.sku === skuStr) || masterList.some(m => m.sku === skuStr);
                
                newRows.push({
                    sku: exists ? skuStr : '',
                    qty: Number(qtd),
                    isCustom: !exists,
                    customDesc: !exists ? `Importado: ${skuStr}` : ''
                });
            }
        });

        if (newRows.length === 0) throw new Error("Nenhum dado válido encontrado.");

        // Instead of finalizing, we load into the Editable List
        setManualRows(newRows);
        setImportMode('MANUAL'); // Switch view so user sees the list
        setMessage({ type: 'success', text: `${newRows.length} itens importados para a lista. Verifique e finalize.` });

      } catch (err: any) {
        setMessage({ type: 'error', text: "Erro ao ler Excel: " + err.message });
      } finally {
        setIsProcessing(false);
        if(fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const addManualRow = () => {
     setManualRows([...manualRows, { sku: '', qty: '', isCustom: false, customDesc: '' }]);
  };

  const handleManualNext = () => {
    const items: OrderLineItem[] = [];
    
    // Validate rows
    for (const row of manualRows) {
        const qtyNum = Number(row.qty);
        if (row.isCustom) {
            if (!row.customDesc || qtyNum <= 0) continue;
            items.push({
                sku: 'N/A',
                description: `(Novo) ${row.customDesc}`,
                quantity: qtyNum,
                isCustom: true
            });
        } else {
            if (!row.sku || qtyNum <= 0) continue;
            items.push({
                sku: row.sku,
                description: getMaterialDescription(row.sku),
                quantity: qtyNum,
                isCustom: false
            });
        }
    }

    if (items.length === 0) {
        setMessage({ type: 'error', text: "Adicione pelo menos um item válido." });
        return;
    }

    setPendingItems(items);
    setCreationStep('DETAILS_PENDING');
  };

  const submitOrder = async () => {
    if (!orderTitle.trim()) {
        setMessage({ type: 'error', text: "Digite o Título do Pedido." });
        return;
    }
    if (!dueDate) {
        setMessage({ type: 'error', text: "Escolha uma data de entrega." });
        return;
    }

    setIsProcessing(true);
    try {
        const newOrder: Order = {
            id: Math.random().toString(36).substr(2, 9),
            title: orderTitle,
            creator: currentUsername,
            status: 'OPEN',
            dateCreated: new Date().toISOString(),
            dueDate: dueDate,
            items: pendingItems
        };

        await StorageService.addOrders([newOrder]);
        refreshData();

        // --- NOTIFICATION LOGIC ---
        const needsNotification = pendingItems.some(item => {
             if (item.isCustom) return true;
             const inStock = getStockCount(item.sku);
             return inStock <= 0;
        });

        if (needsNotification) {
            const settings = await StorageService.getSettings();
            if (settings.notificationEmail) {
                const subject = encodeURIComponent(`ALERTA: Pedido com falta de estoque - ${newOrder.title}`);
                const body = encodeURIComponent(
                    `O usuário ${currentUsername} criou um pedido com itens críticos.\n\n` +
                    `Pedido: ${newOrder.title}\nData Para: ${dueDate}\n\nItens:\n` +
                    pendingItems.map(i => `- ${i.description} (${i.quantity})`).join('\n')
                );
                window.open(`mailto:${settings.notificationEmail}?subject=${subject}&body=${body}`);
            }
        }
        
        clearDraft(); // Success!
        setMessage({ type: 'success', text: `Pedido "${newOrder.title}" criado com sucesso.` });
        
    } catch (err: any) {
        setMessage({ type: 'error', text: err.message });
    } finally {
        setIsProcessing(false);
    }
  };

  const handleDeleteOrder = async (orderId: string) => {
      if(window.confirm("ATENÇÃO: Tem certeza que deseja excluir este pedido permanentemente?")) {
          setIsProcessing(true);
          try {
              await StorageService.deleteOrder(orderId);
              refreshData();
          } catch(err) {
              alert("Erro ao excluir.");
          } finally {
              setIsProcessing(false);
          }
      }
  };

  const handleFinishOrder = async (orderId: string) => {
    if (window.confirm('Marcar TODO o pedido como finalizado?')) {
        setIsProcessing(true);
        try {
            await StorageService.updateOrderStatus(orderId, 'FINISHED');
            refreshData();
        } catch (err) {
            alert('Erro ao finalizar pedido');
        } finally {
            setIsProcessing(false);
        }
    }
  };

  // --- RENDER HELPERS ---
  const FinalizeOrderForm = () => (
    <div className="space-y-4 animate-fade-in bg-slate-50 p-6 rounded-lg border border-slate-200">
        <h4 className="font-semibold text-slate-800 border-b border-slate-200 pb-2 mb-4">Finalizar Pedido</h4>
        
        <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Título do Pedido</label>
            <input 
                type="text"
                value={orderTitle}
                onChange={e => setOrderTitle(e.target.value)}
                placeholder="Ex: Instalação Obra A - Fase 1"
                className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-brand-500 outline-none"
            />
        </div>

        <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Preparar para (Data)</label>
            <input 
                type="date"
                value={dueDate}
                min={getMinDate()}
                onChange={e => setDueDate(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-brand-500 outline-none"
            />
        </div>

        <div className="text-sm text-slate-600 mt-4">
            <p className="font-medium mb-2">Resumo dos Itens:</p>
            <ul className="list-disc list-inside space-y-1 bg-white p-3 rounded border border-slate-200 max-h-40 overflow-y-auto">
                {pendingItems.map((item, idx) => (
                    <li key={idx} className="truncate flex items-center gap-2">
                        <span className="font-bold">{item.quantity}x</span> 
                        <span>{item.description}</span>
                        {item.isCustom && <span className="text-[10px] bg-blue-100 text-blue-700 px-1 rounded">Novo</span>}
                        {!item.isCustom && getStockCount(item.sku) <= 0 && <span className="text-[10px] bg-red-100 text-red-700 px-1 rounded">Sem Estoque</span>}
                    </li>
                ))}
            </ul>
        </div>

        <div className="pt-4 flex justify-end gap-3">
             <button
                onClick={() => setCreationStep('INITIAL')}
                className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
            >
                Voltar
            </button>
            <button
                onClick={submitOrder}
                disabled={isProcessing}
                className="bg-brand-600 text-white px-6 py-2 rounded-lg hover:bg-brand-700 flex items-center gap-2"
            >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                Criar Pedido
            </button>
        </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <datalist id="stock-options">
        {stock.map((item, idx) => (
            <option key={`s-${idx}`} value={item.sku}>{item.description}</option>
        ))}
        {masterList.map((item, idx) => (
            <option key={`m-${idx}`} value={item.sku}>{item.description} (Catálogo)</option>
        ))}
      </datalist>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          {type === 'OPEN' ? <Clock className="text-blue-500"/> : <CheckCircle className="text-green-500"/>}
          {type === 'OPEN' ? 'Pedidos Abertos' : 'Pedidos Finalizados'}
          <span className="text-sm font-normal text-slate-500 ml-2 bg-slate-100 px-2 py-1 rounded-full">
            {filteredOrders.length}
          </span>
        </h2>
      </div>

      {/* CREATION AREA */}
      {type === 'OPEN' && canEdit && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-brand-200">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Upload className="w-5 h-5" /> Novo Pedido
          </h3>

          {creationStep === 'DETAILS_PENDING' ? (
              <FinalizeOrderForm />
          ) : (
            <div>
                <div className="flex space-x-4 mb-4 border-b border-slate-100 pb-2">
                    <button 
                        onClick={() => setImportMode('MANUAL')}
                        className={`text-sm font-medium pb-2 border-b-2 transition-colors ${importMode === 'MANUAL' ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                        Editor
                    </button>
                    <button 
                        onClick={() => setImportMode('FILE')}
                        className={`text-sm font-medium pb-2 border-b-2 transition-colors ${importMode === 'FILE' ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                        Importar Excel
                    </button>
                </div>

                {importMode === 'FILE' && (
                    <div className="space-y-4 animate-fade-in">
                         <div className="p-3 bg-blue-50 text-blue-700 text-sm rounded border border-blue-100 mb-2">
                            Ao importar, os itens serão carregados no editor abaixo para conferência.
                        </div>
                        <div className="border-2 border-dashed border-slate-300 rounded-lg p-8 text-center bg-slate-50">
                            <FileSpreadsheet className="w-10 h-10 text-slate-400 mx-auto mb-2" />
                            <p className="text-sm text-slate-600 mb-4">
                                Arraste um arquivo <strong>.xlsx</strong>.
                            </p>
                            <input 
                                type="file" 
                                accept=".xlsx, .xls"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100"
                            />
                        </div>
                    </div>
                )}

                {/* MANUAL FORM INLINED TO FIX FOCUS BUG */}
                {importMode === 'MANUAL' && (
                    <div className="space-y-3 animate-fade-in">
                        <div className="mb-4">
                            <label className="block text-xs font-semibold text-slate-500 mb-1">Título do Pedido (Rascunho)</label>
                            <input 
                                type="text"
                                value={orderTitle}
                                onChange={e => setOrderTitle(e.target.value)}
                                placeholder="Digite o nome da obra/pedido..."
                                className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-brand-500 outline-none"
                            />
                        </div>

                        <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-slate-500 mb-1">
                            <div className="col-span-5">Material / SKU</div>
                            <div className="col-span-2">Qtd</div>
                            <div className="col-span-3">Disponibilidade</div>
                            <div className="col-span-1">Criar?</div>
                            <div className="col-span-1"></div>
                        </div>
                        {manualRows.map((row, idx) => {
                            const stockQty = getStockCount(row.sku);
                            const inMaster = masterList.some(m => m.sku === row.sku);
                            const known = stockQty > 0 || inMaster;

                            return (
                                <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-md">
                                    <div className="col-span-5">
                                        {row.isCustom ? (
                                            <input 
                                                type="text"
                                                value={row.customDesc}
                                                onChange={(e) => {
                                                    const newRows = [...manualRows];
                                                    newRows[idx].customDesc = e.target.value;
                                                    setManualRows(newRows);
                                                }}
                                                placeholder="Descrição do novo material..."
                                                className="w-full p-2 border border-blue-300 bg-blue-50 rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                            />
                                        ) : (
                                            <input 
                                                list="stock-options"
                                                type="text" 
                                                value={row.sku}
                                                onChange={(e) => {
                                                    const newRows = [...manualRows];
                                                    newRows[idx].sku = e.target.value;
                                                    setManualRows(newRows);
                                                }}
                                                placeholder="Código ou nome..."
                                                className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                                            />
                                        )}
                                    </div>
                                    <div className="col-span-2">
                                        <input 
                                            type="number" 
                                            value={row.qty}
                                            onChange={(e) => {
                                                const newRows = [...manualRows];
                                                newRows[idx].qty = e.target.value;
                                                setManualRows(newRows);
                                            }}
                                            placeholder="0"
                                            className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-brand-500 outline-none text-sm placeholder-slate-300"
                                            min="0"
                                        />
                                    </div>
                                    <div className="col-span-3 text-xs flex items-center">
                                        {row.isCustom ? (
                                            <span className="text-blue-600 font-medium">Novo Material</span>
                                        ) : (
                                            row.sku ? (
                                                <span className={`font-medium ${stockQty > 0 ? 'text-green-600' : 'text-red-600 flex items-center gap-1'}`}>
                                                    {stockQty > 0 ? `${stockQty} un` : <><AlertTriangle className="w-3 h-3"/> Sem Estoque</>}
                                                </span>
                                            ) : <span className="text-slate-400">-</span>
                                        )}
                                    </div>
                                    <div className="col-span-1 flex justify-center">
                                        <input 
                                            type="checkbox"
                                            checked={row.isCustom}
                                            onChange={(e) => {
                                                const newRows = [...manualRows];
                                                newRows[idx].isCustom = e.target.checked;
                                                newRows[idx].sku = ''; 
                                                setManualRows(newRows);
                                            }}
                                            className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500"
                                            title="Criar Material?"
                                        />
                                    </div>
                                    <div className="col-span-1 flex justify-center">
                                        {manualRows.length > 1 && (
                                            <button onClick={() => {
                                                const newRows = [...manualRows];
                                                newRows.splice(idx, 1);
                                                setManualRows(newRows);
                                            }} className="text-red-400 hover:text-red-600">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        
                        <button onClick={addManualRow} className="text-xs flex items-center gap-1 text-brand-600 font-medium hover:text-brand-800 mt-2">
                            <Plus className="w-3 h-3" /> Adicionar Item
                        </button>

                        <div className="pt-4 flex justify-end">
                            <button
                                onClick={handleManualNext}
                                className="bg-brand-600 text-white px-6 py-2 rounded-lg hover:bg-brand-700 flex items-center gap-2"
                            >
                                Próximo: Conferir <ArrowRightCircle className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
                
                {message && (
                  <div className={`mt-4 p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {message.text}
                  </div>
                )}
            </div>
          )}
        </div>
      )}

      {/* ORDERS LIST */}
      <div className="space-y-4">
        {filteredOrders.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
                Nenhum pedido encontrado.
            </div>
        ) : (
            filteredOrders.map((order) => {
                const isExpanded = expandedOrderId === order.id;
                const items = order.items || []; 
                
                return (
                    <div key={order.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all relative">
                        {/* ADMIN DELETE BUTTON */}
                        {isAdmin && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); handleDeleteOrder(order.id); }}
                                className="absolute top-4 right-4 text-slate-300 hover:text-red-500 z-10 transition-colors"
                                title="Excluir Pedido (Admin)"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        )}

                        <div 
                            className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50"
                            onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                        >
                            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 pr-10">
                                <div>
                                    <h4 className="font-bold text-slate-800 text-lg">{order.title || "Sem Título"}</h4>
                                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                        <User className="w-3 h-3"/> 
                                        {order.creator || 'Desconhecido'}
                                        <span className="text-slate-300">|</span>
                                        <span>Criado: {new Date(order.dateCreated).toLocaleDateString()}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Calendar className="w-4 h-4 text-brand-600" />
                                    <div>
                                        <p className="text-xs text-slate-500 uppercase font-semibold">Para:</p>
                                        <p className="font-medium text-slate-800">
                                            {order.dueDate ? new Date(order.dueDate).toLocaleDateString() : 'N/A'}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                     <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                        order.status === 'OPEN' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                                    }`}>
                                        {order.status === 'OPEN' ? 'Aberto' : 'Finalizado'}
                                    </span>
                                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
                                        {items.length} itens
                                    </span>
                                </div>
                            </div>
                            <div className="ml-4">
                                {isExpanded ? <ChevronUp className="text-slate-400"/> : <ChevronDown className="text-slate-400"/>}
                            </div>
                        </div>

                        {isExpanded && (
                            <div className="bg-slate-50 border-t border-slate-200 p-4 animate-fade-in">
                                <table className="w-full text-left text-sm text-slate-600 mb-4 bg-white rounded-lg overflow-hidden shadow-sm">
                                    <thead className="bg-slate-100 font-semibold text-slate-700">
                                        <tr>
                                            <th className="p-3">SKU</th>
                                            <th className="p-3">Descrição</th>
                                            <th className="p-3 text-right">Qtd</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {items.map((item, idx) => (
                                            <tr key={idx}>
                                                <td className="p-3 font-medium text-xs font-mono">{item.sku}</td>
                                                <td className="p-3">
                                                    {item.description}
                                                    {item.isCustom && <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-1 rounded">Novo</span>}
                                                </td>
                                                <td className="p-3 text-right font-bold">{item.quantity}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>

                                {type === 'OPEN' && canEdit && (
                                    <div className="flex justify-end">
                                        <button 
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleFinishOrder(order.id);
                                            }}
                                            disabled={isProcessing}
                                            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 shadow-sm"
                                        >
                                            <CheckCircle className="w-4 h-4" /> Finalizar Pedido
                                        </button>
                                    </div>
                                )}
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

export default OrderManager;