import React, { useState, useEffect, useMemo } from 'react';
import { Order, OrderLineItem, StockItem, UserRole, MasterMaterial, ChangeLogEntry } from '../types';
import { StorageService } from '../services/storageService';
import { Upload, FileText, Loader2, CheckCircle, Clock, Plus, Trash2, ArrowRightCircle, Calendar, User, ChevronDown, ChevronUp, AlertTriangle, Edit, History, Activity, AlertCircle } from 'lucide-react';

interface OrderManagerProps {
  orders: Order[];
  stock: StockItem[];
  masterList: MasterMaterial[];
  type: 'OPEN' | 'FINISHED';
  mode: 'CREATE' | 'LIST'; 
  userRole: UserRole;
  refreshData: () => void;
  currentUsername: string;
}

interface ManualRow {
    sku: string;
    qty: string | number;
    isCustom: boolean;
    customDesc: string;
}

const OrderManager: React.FC<OrderManagerProps> = ({ orders, stock, masterList, type, mode, userRole, refreshData, currentUsername }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  // Creation/Edit States
  const [creationStep, setCreationStep] = useState<'INITIAL' | 'DETAILS_PENDING'>('INITIAL');
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null); 
  
  // Manual Entry Buffer (Drafts)
  const [manualRows, setManualRows] = useState<ManualRow[]>([{sku: '', qty: '', isCustom: false, customDesc: ''}]);
  const [orderTitle, setOrderTitle] = useState('');
  
  // UI State
  const [expandedRowIndex, setExpandedRowIndex] = useState<number>(0);
  const [formErrors, setFormErrors] = useState<{title?: boolean, date?: boolean, rows: number[], duplicateCustom?: number[]}>({ rows: [], duplicateCustom: [] });

  // Pending Order Details (Finalization)
  const [pendingItems, setPendingItems] = useState<OrderLineItem[]>([]);
  const [dueDate, setDueDate] = useState('');
  
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Updated filter: 
  const filteredOrders = orders.filter(o => {
    const isInProcess = o.status === 'IN_PROCESS' || o.status === 'IN PROCESS';
    if (type === 'OPEN') return o.status === 'OPEN' || isInProcess;
    return o.status === 'COMPLETED';
  });
  
  const canEdit = userRole === UserRole.MANAGEMENT || userRole === UserRole.ADMIN;
  const isAdmin = userRole === UserRole.ADMIN;

  const materialOptions = useMemo(() => {
    const optionsMap = new Map<string, string>();
    masterList.forEach(m => optionsMap.set(m.sku, m.description));
    stock.forEach(s => {
        if (!optionsMap.has(s.sku)) optionsMap.set(s.sku, s.description);
    });
    return Array.from(optionsMap.entries()).map(([sku, desc]) => ({ sku, desc }));
  }, [masterList, stock]);

  useEffect(() => {
    if (editingOrderId) return; 
    const savedRows = localStorage.getItem('draft_rows');
    const savedTitle = localStorage.getItem('draft_title');
    if (savedRows) {
        try { setManualRows(JSON.parse(savedRows)); } catch(e){}
    }
    if (savedTitle) setOrderTitle(savedTitle);
  }, [editingOrderId]);

  useEffect(() => {
    if (editingOrderId) return; 
    localStorage.setItem('draft_rows', JSON.stringify(manualRows));
  }, [manualRows, editingOrderId]);

  useEffect(() => {
    if (editingOrderId) return;
    localStorage.setItem('draft_title', orderTitle);
  }, [orderTitle, editingOrderId]);

  const clearDraft = () => {
      localStorage.removeItem('draft_rows');
      localStorage.removeItem('draft_title');
      resetForm();
  };

  const resetForm = () => {
      setManualRows([{sku: '', qty: '', isCustom: false, customDesc: ''}]);
      setOrderTitle('');
      setDueDate('');
      setPendingItems([]);
      setCreationStep('INITIAL');
      setEditingOrderId(null);
      setExpandedRowIndex(0);
      setFormErrors({ rows: [], duplicateCustom: [] });
  };

  const getMinDate = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) {
        setDueDate('');
        return;
    }

    const selectedDate = new Date(val);
    const day = selectedDate.getUTCDay(); // 0 is Sunday, 6 is Saturday

    if (day === 0 || day === 6) {
        alert("Pedidos não podem ser agendados para fins de semana (Sábado/Domingo).");
        setDueDate('');
        return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    if (val <= todayStr) {
        alert("Pedidos devem ser agendados com pelo menos 1 dia de antecedência.");
        setDueDate('');
        return;
    }

    setDueDate(val);
    if(formErrors.date) setFormErrors({...formErrors, date: false});
  };

  const getStockCount = (sku: string) => {
    return stock.filter(s => s.sku === sku).reduce((total, item) => total + item.quantity, 0);
  };

  const getMaterialDescription = (sku: string): string => {
      const masterItem = masterList.find(m => m.sku === sku);
      if (masterItem) return masterItem.description;
      const stockItem = stock.find(s => s.sku === sku);
      if (stockItem) return stockItem.description;
      return "Material Desconhecido";
  };

  const addManualRow = () => {
     const nextIdx = manualRows.length;
     setManualRows([...manualRows, { sku: '', qty: '', isCustom: false, customDesc: '' }]);
     setExpandedRowIndex(nextIdx); // Auto collapse prev, expand new
  };

  const validateForm = (): boolean => {
      const errors: number[] = [];
      const duplicateErrors: number[] = [];
      let isTitleValid = orderTitle.trim().length > 0;
      
      manualRows.forEach((row, idx) => {
          const qty = Number(row.qty);
          if (qty <= 0) errors.push(idx);
          else if (row.isCustom) {
              if (!row.customDesc) {
                  errors.push(idx);
              } else {
                  // Check if description already exists in master list
                  const exists = masterList.some(m => m.description.toLowerCase().trim() === row.customDesc.toLowerCase().trim());
                  if (exists) {
                      duplicateErrors.push(idx);
                  }
              }
          }
          else if (!row.isCustom && !row.sku) errors.push(idx);
      });

      setFormErrors({
          title: !isTitleValid,
          rows: errors,
          duplicateCustom: duplicateErrors
      });

      return isTitleValid && errors.length === 0 && duplicateErrors.length === 0;
  };

  const handleManualNext = () => {
    if (!validateForm()) {
        const hasDuplicates = manualRows.some((row, idx) => {
             return row.isCustom && row.customDesc && masterList.some(m => m.description.toLowerCase().trim() === row.customDesc.toLowerCase().trim());
        });
        
        if (hasDuplicates) {
             setMessage({ type: 'error', text: "Alguns materiais manuais já existem na lista oficial. Por favor, desmarque a opção 'Novo' e selecione-os da lista." });
        } else {
             setMessage({ type: 'error', text: "Corrija os campos destacados em vermelho." });
        }
        return;
    }

    const items: OrderLineItem[] = [];
    for (const row of manualRows) {
        const qtyNum = Number(row.qty);
        if (row.isCustom) {
            items.push({
                sku: 'N/A',
                // Removed "(Novo)" prefix as requested
                description: row.customDesc,
                quantity: qtyNum,
                isCustom: true
            });
        } else {
            items.push({
                sku: row.sku,
                description: getMaterialDescription(row.sku),
                quantity: qtyNum,
                isCustom: false
            });
        }
    }
    setPendingItems(items);
    setCreationStep('DETAILS_PENDING');
  };

  const handleEditStart = (order: Order) => {
      const rows: ManualRow[] = order.items.map(item => ({
          sku: item.isCustom ? '' : item.sku,
          qty: item.quantity,
          isCustom: !!item.isCustom,
          // Handle cases where legacy items might still have the prefix
          customDesc: item.isCustom ? item.description.replace('(Novo) ', '') : ''
      }));

      setManualRows(rows);
      setOrderTitle(order.title);
      setDueDate(order.dueDate);
      setEditingOrderId(order.id);
      setCreationStep('INITIAL');
      setExpandedRowIndex(0);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const generateChangeLog = (oldOrder: Order, newItems: OrderLineItem[], newDate: string, newTitle: string): ChangeLogEntry => {
      const changes: string[] = [];
      if (oldOrder.title !== newTitle) changes.push(`Título alterado.`);
      if (oldOrder.dueDate !== newDate) changes.push(`Data alterada para ${newDate}.`);

      const oldMap = new Map(oldOrder.items.map(i => [i.isCustom ? `CUST:${i.description}` : i.sku, i.quantity]));
      const newMap = new Map(newItems.map(i => [i.isCustom ? `CUST:${i.description}` : i.sku, i.quantity]));

      oldMap.forEach((qty, key) => {
          if (!newMap.has(key)) changes.push(`Removido: ${key.replace('CUST:', '')}`);
          else if (newMap.get(key) !== qty) changes.push(`Qtd Alterada: ${key.replace('CUST:', '')} (${qty} -> ${newMap.get(key)})`);
      });
      newMap.forEach((qty, key) => {
          if (!oldMap.has(key)) changes.push(`Adicionado: ${key.replace('CUST:', '')} (${qty} un)`);
      });

      return {
          date: new Date().toISOString(),
          actor: currentUsername,
          details: changes.length > 0 ? changes.join('; ') : 'Edição sem alterações visíveis.'
      };
  };

  const submitOrder = async () => {
    if (!dueDate) {
        setFormErrors(prev => ({ ...prev, date: true }));
        setMessage({ type: 'error', text: "A data de levantamento é obrigatória." });
        return;
    }

    setIsProcessing(true);
    try {
        if (editingOrderId) {
            const existingOrder = orders.find(o => o.id === editingOrderId);
            if (!existingOrder) throw new Error("Pedido original não encontrado.");

            const logEntry = generateChangeLog(existingOrder, pendingItems, dueDate, orderTitle);
            
            const updatedOrder: Order = {
                ...existingOrder,
                title: orderTitle,
                dueDate: dueDate,
                items: pendingItems, 
                changeLog: [...(existingOrder.changeLog || []), logEntry]
            };

            await StorageService.updateOrder(updatedOrder);
            refreshData();
            resetForm();
            setMessage({ type: 'success', text: "Pedido atualizado com sucesso." });

        } else {
            // New Order
            const newOrder: Order = {
                id: Math.random().toString(36).substr(2, 9),
                displayId: 0, 
                title: orderTitle,
                creator: currentUsername,
                status: 'OPEN',
                dateCreated: new Date().toISOString(),
                dueDate: dueDate,
                items: pendingItems.map(i => ({...i, quantityPicked: 0}))
            };

            await StorageService.addOrders([newOrder]);
            
            // --- EMAIL NOTIFICATION LOGIC ---
            const settings = await StorageService.getSettings();
            
            if (settings.emailRecipients && settings.emailRecipients.length > 0) {
                const to = settings.emailRecipients.filter(r => r.type === 'TO').map(r => r.email).join(',');
                const cc = settings.emailRecipients.filter(r => r.type === 'CC').map(r => r.email).join(',');
                
                if (to) {
                    // Filter for specific conditions
                    const missingStockItems = newOrder.items.filter(item => {
                        if (item.isCustom) return false;
                        const currentStock = stock.find(s => s.sku === item.sku)?.quantity || 0;
                        return currentStock < item.quantity;
                    });

                    const newMaterialItems = newOrder.items.filter(item => item.isCustom);

                    // Determine time of day
                    const hour = new Date().getHours();
                    let greeting = "Boa noite";
                    if (hour >= 5 && hour < 13) greeting = "Bom dia";
                    else if (hour >= 13 && hour < 20) greeting = "Boa tarde";

                    let body = `${greeting},\n\n`;
                    body += `O utilizador ${currentUsername} colocou o pedido ${orderTitle} em que estão em falta as seguintes referências:\n\n`;
                    
                    let hasAlerts = false;

                    if (missingStockItems.length > 0) {
                        hasAlerts = true;
                        body += `Falta de stock:\n`;
                        missingStockItems.forEach(item => {
                            const currentStock = stock.find(s => s.sku === item.sku)?.quantity || 0;
                            // The prompt asks for [MATERIAL] [QTY], I assume requested qty, maybe with note on what is missing
                            body += `[${item.sku}] ${item.description}\n`;
                            body += `${item.quantity} un (Disp: ${currentStock})\n\n`;
                        });
                    }

                    if (newMaterialItems.length > 0) {
                        hasAlerts = true;
                        body += `Necessário criar código:\n`;
                        newMaterialItems.forEach(item => {
                            body += `${item.description}\n`;
                            body += `${item.quantity} un\n\n`;
                        });
                    }

                    body += `Cumprimentos`;

                    // Only send this specific format if there are alerts. 
                    // Otherwise, we can fallback to a generic one or skip. 
                    // Assuming we proceed only if alerts exist based on the prompt "if there's no stock... the email should..."
                    
                    if (hasAlerts) {
                        const subject = `Aviso Pedido: ${orderTitle}`;
                        const mailtoLink = `mailto:${to}?cc=${cc}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                        window.location.href = mailtoLink;
                        setMessage({ type: 'success', text: `Pedido criado. E-mail de alerta aberto.` });
                    } else {
                         // Fallback for standard order (no issues)
                         const subject = `Novo Pedido: ${orderTitle} (${currentUsername})`;
                         let simpleBody = `${greeting},\n\nNovo pedido criado por ${currentUsername}.\nObra: ${orderTitle}\nData: ${new Date(dueDate).toLocaleDateString()}\n\nTodos os itens possuem stock.\n\nCumprimentos`;
                         const mailtoLink = `mailto:${to}?cc=${cc}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(simpleBody)}`;
                         window.location.href = mailtoLink;
                         setMessage({ type: 'success', text: `Pedido criado com sucesso.` });
                    }

                } else {
                    setMessage({ type: 'success', text: `Pedido criado. (Sem e-mails configurados).` });
                }
            } else {
                setMessage({ type: 'success', text: `Pedido "${newOrder.title}" criado com sucesso.` });
            }

            refreshData();
            clearDraft(); 
        }
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

  // Helper to get picked quantity from the pickedItems array
  const getPickedQuantity = (order: Order, sku: string): number => {
      if (order.pickedItems && Array.isArray(order.pickedItems)) {
          const cleanSku = sku.trim();
          return order.pickedItems
            .filter((p: any) => (p.material || '').trim() === cleanSku)
            .reduce((sum: number, p: any) => sum + (Number(p.pickedQty) || 0), 0);
      }
      return 0;
  };

  const FinalizeOrderForm = () => (
    <div className="space-y-4 animate-fade-in bg-slate-50 p-6 rounded-lg border border-slate-200">
        <h4 className="font-semibold text-slate-800 border-b border-slate-200 pb-2 mb-4">
            {editingOrderId ? 'Salvar Alterações' : 'Finalizar Pedido'}
        </h4>
        
        <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Título do Pedido</label>
            <input 
                type="text"
                value={orderTitle}
                maxLength={19}
                onChange={e => setOrderTitle(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded-md bg-slate-100 text-slate-500 cursor-not-allowed"
                disabled
            />
        </div>

        <div>
            <label className={`block text-sm font-medium mb-1 ${formErrors.date ? 'text-red-600' : 'text-slate-700'}`}>
                Data Levantamento {formErrors.date && '*'}
            </label>
            <input 
                type="date"
                value={dueDate}
                min={getMinDate()}
                onChange={handleDateChange}
                className={`w-full p-2 border rounded-md focus:ring-2 outline-none ${formErrors.date ? 'border-red-500 focus:ring-red-200 bg-red-50' : 'border-slate-300 focus:ring-brand-500'}`}
            />
            {formErrors.date && <p className="text-xs text-red-500 mt-1">Data obrigatória.</p>}
        </div>

        <div className="text-sm text-slate-600 mt-4">
            <p className="font-medium mb-2">Resumo dos Itens:</p>
            <ul className="list-disc list-inside space-y-1 bg-white p-3 rounded border border-slate-200 max-h-40 overflow-y-auto">
                {pendingItems.map((item, idx) => (
                    <li key={idx} className="truncate flex items-center gap-2">
                        <span className="font-bold">{item.quantity}x</span> 
                        <span>{item.description}</span>
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
                {editingOrderId ? 'Salvar Edição' : 'Confirmar Pedido'}
            </button>
        </div>
    </div>
  );

  const showForm = mode === 'CREATE' || editingOrderId !== null;
  const showList = mode === 'LIST' && editingOrderId === null;

  return (
    <div className="space-y-6">
      <datalist id="stock-options">
        {materialOptions.map((opt) => (
            <option key={opt.sku} value={opt.sku}>{opt.desc}</option>
        ))}
      </datalist>

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
          {mode === 'CREATE' ? <Upload className="text-brand-500"/> : (type === 'OPEN' ? <Clock className="text-blue-500"/> : <CheckCircle className="text-green-500"/>)}
          {mode === 'CREATE' ? 'Novo Pedido' : (type === 'OPEN' ? 'Pedidos Abertos' : 'Pedidos Finalizados')}
          {mode === 'LIST' && (
             <span className="text-sm font-normal text-slate-500 ml-2 bg-slate-100 px-2 py-1 rounded-full">
                {filteredOrders.length}
             </span>
          )}
        </h2>
      </div>

      {/* CREATION/EDIT AREA */}
      {showForm && (
        <div className={`bg-white p-6 rounded-xl shadow-sm border ${editingOrderId ? 'border-amber-400 ring-2 ring-amber-100' : 'border-brand-200'}`}>
          {editingOrderId && (
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Edit className="w-5 h-5 text-amber-600" /> 
                <span className="text-amber-700">Editando Pedido</span>
                <button onClick={resetForm} className="text-xs text-slate-500 underline ml-2 hover:text-red-500">(Cancelar)</button>
            </h3>
          )}

          {creationStep === 'DETAILS_PENDING' ? (
              <FinalizeOrderForm />
          ) : (
            <div>
                <div className="space-y-3 animate-fade-in">
                    <div className="mb-4">
                        <label className={`block text-xs font-semibold mb-1 ${formErrors.title ? 'text-red-600' : 'text-slate-500'}`}>
                            Título do Pedido {formErrors.title && '*'}
                        </label>
                        <input 
                            type="text"
                            value={orderTitle}
                            maxLength={19}
                            onChange={e => {
                                setOrderTitle(e.target.value);
                                if(formErrors.title) setFormErrors({...formErrors, title: false});
                            }}
                            placeholder="Nome da obra (máx 19 chars)"
                            className={`w-full p-3 border rounded-md shadow-sm outline-none transition-all ${formErrors.title ? 'border-red-500 ring-1 ring-red-200 bg-red-50' : 'border-slate-300 focus:ring-2 focus:ring-brand-500'}`}
                        />
                        <div className="text-right text-[10px] text-slate-400 mt-1">
                            {orderTitle.length}/19
                        </div>
                    </div>

                    {/* Accordion Input Layout */}
                    <div className="space-y-4">
                        {manualRows.map((row, idx) => {
                            const isExpanded = idx === expandedRowIndex;
                            const isError = formErrors.rows.includes(idx);
                            const isDuplicate = formErrors.duplicateCustom && formErrors.duplicateCustom.includes(idx);
                            const stockQty = getStockCount(row.sku);

                            return (
                                <div 
                                    key={idx} 
                                    className={`rounded-lg border transition-all duration-200 overflow-hidden ${
                                        isError || isDuplicate ? 'border-red-300 bg-red-50' : 
                                        isExpanded ? 'border-brand-200 bg-slate-50 shadow-md ring-1 ring-brand-100' : 'border-slate-200 bg-white hover:bg-slate-50'
                                    }`}
                                >
                                    {/* Header (Always Visible) */}
                                    <div 
                                        onClick={() => setExpandedRowIndex(isExpanded ? -1 : idx)}
                                        className="p-3 flex items-center justify-between cursor-pointer select-none"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className={`text-xs font-bold uppercase ${isError || isDuplicate ? 'text-red-500' : 'text-slate-500'}`}>Item {idx + 1}</span>
                                            {!isExpanded && (
                                                <span className="text-sm font-medium text-slate-700 truncate max-w-[150px] md:max-w-[300px]">
                                                    {row.isCustom ? row.customDesc || '(Sem descrição)' : row.sku || '(Selecione material)'} 
                                                    {row.qty ? ` - ${row.qty} un` : ''}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {manualRows.length > 1 && (
                                                <button onClick={(e) => {
                                                    e.stopPropagation();
                                                    const newRows = [...manualRows];
                                                    newRows.splice(idx, 1);
                                                    setManualRows(newRows);
                                                    setExpandedRowIndex(Math.max(0, idx - 1));
                                                }} className="text-slate-400 hover:text-red-500 p-1">
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                            {isExpanded ? <ChevronUp className="w-4 h-4 text-brand-600"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
                                        </div>
                                    </div>

                                    {/* Expanded Content */}
                                    {isExpanded && (
                                        <div className="p-4 border-t border-slate-200 animate-fade-in">
                                            <div className="mb-3">
                                                {row.isCustom ? (
                                                    <div>
                                                        <div className="relative">
                                                            <input 
                                                                type="text"
                                                                value={row.customDesc}
                                                                maxLength={40}
                                                                onChange={(e) => {
                                                                    const newRows = [...manualRows];
                                                                    newRows[idx].customDesc = e.target.value;
                                                                    setManualRows(newRows);
                                                                }}
                                                                placeholder="Descrição do novo material..."
                                                                className={`w-full p-3 border rounded-md text-sm outline-none ${
                                                                    (isError && !row.customDesc) || isDuplicate 
                                                                    ? 'border-red-500 bg-white ring-1 ring-red-200' 
                                                                    : 'border-blue-300 bg-blue-50 focus:ring-2 focus:ring-blue-500'
                                                                }`}
                                                            />
                                                            <div className="absolute right-2 bottom-2 text-[10px] text-slate-400">
                                                                {row.customDesc.length}/40
                                                            </div>
                                                        </div>
                                                        {isDuplicate && (
                                                            <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                                                <AlertCircle className="w-3 h-3"/> Este material já existe na lista. Por favor, desmarque "Novo" e busque pelo nome.
                                                            </p>
                                                        )}
                                                    </div>
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
                                                        placeholder="Código ou nome do material..."
                                                        className={`w-full p-3 border rounded-md text-sm outline-none ${isError && !row.sku ? 'border-red-500' : 'border-slate-300 focus:ring-2 focus:ring-brand-500'}`}
                                                    />
                                                )}
                                            </div>

                                            <div className="flex gap-4 mb-3">
                                                <div className="w-1/3">
                                                    <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Qtd</label>
                                                    <input 
                                                        type="number" 
                                                        value={row.qty}
                                                        onChange={(e) => {
                                                            const newRows = [...manualRows];
                                                            newRows[idx].qty = e.target.value;
                                                            setManualRows(newRows);
                                                        }}
                                                        placeholder="0"
                                                        className={`w-full p-3 border rounded-md text-sm outline-none ${isError && (!row.qty || Number(row.qty) <= 0) ? 'border-red-500' : 'border-slate-300 focus:ring-2 focus:ring-brand-500'}`}
                                                        min="0"
                                                    />
                                                </div>
                                                <div className="flex-1 flex flex-col justify-end pb-3">
                                                     {!row.isCustom && row.sku && (
                                                        <div className={`text-xs font-medium ${stockQty > 0 ? 'text-green-600' : 'text-red-600 flex items-center gap-1'}`}>
                                                            {stockQty > 0 ? `Stock: ${stockQty} un` : <><AlertTriangle className="w-3 h-3"/> Sem Stock</>}
                                                        </div>
                                                     )}
                                                     {!row.isCustom && !row.sku && <span className="text-xs text-slate-400">-</span>}
                                                     {row.isCustom && <span className="text-xs text-blue-600 font-medium">Material Manual</span>}
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-2 border-t border-slate-200 pt-2 mt-2">
                                                <input 
                                                    type="checkbox"
                                                    id={`custom-check-${idx}`}
                                                    checked={row.isCustom}
                                                    onChange={(e) => {
                                                        const newRows = [...manualRows];
                                                        newRows[idx].isCustom = e.target.checked;
                                                        newRows[idx].sku = ''; 
                                                        // Reset duplicate error visual when toggling
                                                        if(isDuplicate) {
                                                            const newErrors = {...formErrors};
                                                            newErrors.duplicateCustom = newErrors.duplicateCustom?.filter(i => i !== idx);
                                                            setFormErrors(newErrors);
                                                        }
                                                        setManualRows(newRows);
                                                    }}
                                                    className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500"
                                                />
                                                <label htmlFor={`custom-check-${idx}`} className="text-xs text-slate-500 cursor-pointer select-none">
                                                    Não encontrei na lista (Criar novo)
                                                </label>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    
                    <button onClick={addManualRow} className="w-full py-3 border-2 border-dashed border-slate-200 rounded-lg text-slate-500 hover:text-brand-600 hover:border-brand-200 hover:bg-brand-50 transition-all text-sm font-medium flex items-center justify-center gap-2 mt-4">
                        <Plus className="w-4 h-4" /> Adicionar Outro Item
                    </button>

                    <div className="pt-6 flex justify-end">
                        <button
                            onClick={handleManualNext}
                            className="bg-brand-600 text-white px-8 py-3 rounded-xl hover:bg-brand-700 flex items-center gap-2 shadow-sm font-medium transition-all"
                        >
                            Próximo: Conferir <ArrowRightCircle className="w-5 h-5" />
                        </button>
                    </div>
                </div>
                
                {message && (
                  <div className={`mt-4 p-4 rounded-lg text-sm font-medium border ${message.type === 'success' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-red-50 text-red-700 border-red-200'}`}>
                    {message.text}
                  </div>
                )}
            </div>
          )}
        </div>
      )}

      {/* ORDERS LIST */}
      {showList && (
        <div className="space-y-4">
            {filteredOrders.length === 0 ? (
                <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
                    Nenhum pedido encontrado.
                </div>
            ) : (
                filteredOrders.map((order) => {
                    const isExpanded = expandedOrderId === order.id;
                    const items = order.items || []; 
                    const canModify = (currentUsername === order.creator || isAdmin);
                    const isInProcess = order.status === 'IN_PROCESS' || order.status === 'IN PROCESS';
                    
                    // Progress Calculation for FINISHED orders
                    // Changed: Based on ITEMS (lines) completed, not total quantity
                    let progressPercent = 0;
                    if (order.status === 'COMPLETED') {
                        const totalItems = items.length;
                        const completedItems = items.filter(i => {
                            const picked = getPickedQuantity(order, i.sku);
                            return picked >= i.quantity;
                        }).length;
                        progressPercent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
                    }

                    return (
                        <div key={order.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden transition-all relative">
                            <div 
                                className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50"
                                onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                            >
                                <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-4 pr-4">
                                    {/* Order Info */}
                                    <div className="md:col-span-5">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-mono font-bold text-slate-400 bg-slate-100 px-1 rounded">#{order.displayId || '?'}</span>
                                            <h4 className="font-bold text-slate-800 text-lg">{order.title || "Sem Título"}</h4>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                                            <User className="w-3 h-3"/> 
                                            {order.creator || 'Desconhecido'}
                                            <span className="text-slate-300">|</span>
                                            <span>Criado: {new Date(order.dateCreated).toLocaleDateString()}</span>
                                        </div>
                                    </div>

                                    {/* Date & Progress */}
                                    <div className="md:col-span-4 flex flex-col justify-center">
                                         <div className="flex items-center gap-2 text-xs text-slate-600 mb-1">
                                            <Calendar className="w-3 h-3 text-brand-600" />
                                            Para: <span className="font-semibold">{order.dueDate ? new Date(order.dueDate).toLocaleDateString() : 'N/A'}</span>
                                         </div>
                                         {order.status === 'COMPLETED' && (
                                             <div className="flex items-center gap-2 w-full max-w-[150px]">
                                                 <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden">
                                                     <div className={`h-full ${progressPercent === 100 ? 'bg-green-500' : 'bg-amber-500'}`} style={{ width: `${progressPercent}%` }}></div>
                                                 </div>
                                                 <span className="text-[10px] font-bold text-slate-500">{progressPercent}%</span>
                                             </div>
                                         )}
                                    </div>

                                    {/* Status Badge */}
                                    <div className="md:col-span-3 flex items-center justify-end gap-2">
                                        {isInProcess ? (
                                            <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-700 animate-pulse flex items-center gap-1 border border-amber-200">
                                                <Activity className="w-3 h-3" /> Em curso
                                            </span>
                                        ) : (
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                                order.status === 'COMPLETED' 
                                                    ? 'bg-green-100 text-green-700' 
                                                    : 'bg-blue-100 text-blue-700'
                                            }`}>
                                                {order.status === 'COMPLETED' ? 'Finalizado' : 'Aberto'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="ml-4 flex items-center gap-2">
                                    {isAdmin && type !== 'FINISHED' && (
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleDeleteOrder(order.id); }}
                                            className="text-red-400 hover:text-red-600 p-2"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                    {isExpanded ? <ChevronUp className="text-slate-400"/> : <ChevronDown className="text-slate-400"/>}
                                </div>
                            </div>

                            {isExpanded && (
                                <div className="bg-slate-50 border-t border-slate-200 p-4 animate-fade-in">
                                    {isInProcess && (
                                        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-center gap-3">
                                            <Loader2 className="w-5 h-5 text-amber-600 animate-spin" />
                                            <div>
                                                <p className="text-amber-800 font-bold text-sm">Pedido em curso</p>
                                                <p className="text-amber-700 text-xs">A equipe de armazém iniciou a separação deste pedido.</p>
                                            </div>
                                        </div>
                                    )}

                                    <table className="w-full text-left text-sm text-slate-600 mb-4 bg-white rounded-lg overflow-hidden shadow-sm">
                                        <thead className="bg-slate-100 font-semibold text-slate-700">
                                            <tr>
                                                <th className="p-3">Material</th>
                                                <th className="p-3">Descrição</th>
                                                <th className="p-3 text-right">Pedida</th>
                                                {/* Only show Picked column if Finished */}
                                                {order.status === 'COMPLETED' && <th className="p-3 text-right">Satisfeita</th>}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {items.map((item, idx) => {
                                                const pickedQty = getPickedQuantity(order, item.sku);
                                                const isShort = order.status === 'COMPLETED' && pickedQty < item.quantity;
                                                return (
                                                    <tr key={idx} className={isShort ? 'bg-red-50' : ''}>
                                                        <td className="p-3 font-medium text-xs font-mono">{item.sku}</td>
                                                        <td className="p-3">
                                                            {item.description}
                                                            {item.isCustom && <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-1 rounded">Novo</span>}
                                                            {isShort && <span className="ml-2 text-[10px] bg-red-100 text-red-700 px-1 rounded flex-inline items-center gap-1"><AlertCircle className="w-3 h-3 inline"/> Falta</span>}
                                                        </td>
                                                        <td className="p-3 text-right font-bold">{item.quantity}</td>
                                                        {order.status === 'COMPLETED' && (
                                                            <td className={`p-3 text-right font-bold ${isShort ? 'text-red-600' : 'text-green-600'}`}>
                                                                {pickedQty}
                                                            </td>
                                                        )}
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>

                                    {/* Action Buttons */}
                                    {type === 'OPEN' && canEdit && order.status === 'OPEN' && canModify && (
                                        <div className="flex justify-end gap-3 mb-4">
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); handleEditStart(order); }}
                                                className="bg-amber-100 text-amber-700 px-4 py-2 rounded-lg hover:bg-amber-200 transition-colors flex items-center gap-2 shadow-sm text-sm font-medium"
                                            >
                                                <Edit className="w-4 h-4" /> Editar
                                            </button>
                                        </div>
                                    )}

                                    {/* Change Log */}
                                    {order.changeLog && order.changeLog.length > 0 && (
                                        <div className="mt-4 border-t border-slate-200 pt-4">
                                            <h5 className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-1">
                                                <History className="w-3 h-3"/> Histórico de Alterações
                                            </h5>
                                            <div className="space-y-2">
                                                {order.changeLog.map((log, i) => (
                                                    <div key={i} className="text-xs bg-white p-2 rounded border border-slate-200 text-slate-600">
                                                        <div className="flex justify-between mb-1">
                                                            <span className="font-semibold text-slate-800">{log.actor}</span>
                                                            <span className="text-slate-400">{new Date(log.date).toLocaleString('pt-BR')}</span>
                                                        </div>
                                                        <p>{log.details}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })
            )}
        </div>
      )}
    </div>
  );
};

export default OrderManager;