import React, { useState, useEffect, useMemo } from 'react';
import { Order, OrderLineItem, StockItem, UserRole, MasterMaterial, ChangeLogEntry, UnitOption } from '../types';
import { StorageService, MATERIAL_CATEGORIES } from '../services/storageService';
import { ParserService } from '../services/parser';
import { Upload, FileText, Loader2, CheckCircle, Clock, Plus, Trash2, ArrowRightCircle, Calendar, User, ChevronDown, ChevronUp, AlertTriangle, Edit, History, Activity, AlertCircle, Search, Download, Check, X, HelpCircle, Scale, Tag, FileInput } from 'lucide-react';

declare const XLSX: any;

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
    unit: string; // Unit of Measure
    category: string; // Material Category
    customCategory: string; // If 'A00' or other generic is selected and user types manually
    isCustom: boolean;
    customDesc: string;
    similarityChecked: boolean;
}

// Helper to normalize string (remove accents/diacritics)
const normalizeText = (text: string): string => {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
};

// Helper for similarity scoring
const calculateRelevance = (target: string, query: string): number => {
    const t = normalizeText(target);
    const q = normalizeText(query);
    
    // Exact match
    if (t === q) return 100;
    
    const qWords = q.split(/\s+/).filter(w => w.length > 2);
    const tWords = t.split(/\s+/).filter(w => w.length > 2);
    
    if (qWords.length === 0) return 0;

    let score = 0;
    let matches = 0;

    qWords.forEach(qw => {
        if (t.includes(qw)) {
            matches++;
            score += 10; // Base score for inclusion
            if (tWords.includes(qw)) score += 5; // Bonus for exact word match
        }
    });

    return matches > 0 ? score : 0;
};

const OrderManager: React.FC<OrderManagerProps> = ({ orders, stock, masterList, type, mode, userRole, refreshData, currentUsername }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  // Creation/Edit States
  const [creationStep, setCreationStep] = useState<'INITIAL' | 'DETAILS_PENDING'>('INITIAL');
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null); 
  
  // Manual Entry Buffer (Drafts)
  const [manualRows, setManualRows] = useState<ManualRow[]>([{sku: '', qty: '', unit: 'UN', category: '', customCategory: '', isCustom: false, customDesc: '', similarityChecked: false}]);
  const [orderTitle, setOrderTitle] = useState('');
  
  // Import State
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importText, setImportText] = useState('');

  // UI State
  const [expandedRowIndex, setExpandedRowIndex] = useState<number>(0);
  const [formErrors, setFormErrors] = useState<{title?: boolean, date?: boolean, rows: number[], duplicateCustom?: number[], invalidSkus?: number[], unchecked?: number[], missingCategory?: number[]}>({ rows: [], duplicateCustom: [], invalidSkus: [], unchecked: [], missingCategory: [] });

  // Similarity Search State
  const [similarityModalOpen, setSimilarityModalOpen] = useState(false);
  const [similarityTargetIdx, setSimilarityTargetIdx] = useState<number | null>(null);
  const [similarityResults, setSimilarityResults] = useState<MasterMaterial[]>([]);
  const [similarityStep, setSimilarityStep] = useState<'LIST' | 'CONFIRM_MATCH' | 'CONFIRM_NEW'>('LIST');
  const [selectedCandidate, setSelectedCandidate] = useState<MasterMaterial | null>(null);

  // Pending Order Details (Finalization)
  const [pendingItems, setPendingItems] = useState<OrderLineItem[]>([]);
  const [dueDate, setDueDate] = useState('');
  
  // Settings Options
  const [unitOptions, setUnitOptions] = useState<UnitOption[]>([]);

  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Updated filter: 
  const filteredOrders = useMemo(() => {
      let result = orders.filter(o => {
        const isInProcess = o.status === 'IN_PROCESS' || o.status === 'IN PROCESS';
        if (type === 'OPEN') return o.status === 'OPEN' || isInProcess;
        return o.status === 'COMPLETED';
      });

      if (type === 'FINISHED' && searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          result = result.filter(o => 
              (o.title || '').toLowerCase().includes(q) ||
              (o.id || '').toLowerCase().includes(q) ||
              (o.displayId?.toString() || '').includes(q) ||
              (o.creator || '').toLowerCase().includes(q) ||
              o.items.some(i => i.sku.toLowerCase().includes(q) || i.description.toLowerCase().includes(q))
          );
      }
      
      // Sort finished orders by most recent
      if (type === 'FINISHED') {
          // Sort by creation date or completion date if available
          result.sort((a, b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime());
      }

      return result;
  }, [orders, type, searchQuery]);
  
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

  // Load Settings for Units
  useEffect(() => {
      const loadOpts = async () => {
          const settings = await StorageService.getSettings();
          if (settings.unitOptions && settings.unitOptions.length > 0) {
              setUnitOptions(settings.unitOptions);
          } else {
              setUnitOptions([{ value: "UN", description: "Unidade" }]); // Fallback
          }
      };
      loadOpts();
  }, []);

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
      setManualRows([{sku: '', qty: '', unit: 'UN', category: '', customCategory: '', isCustom: false, customDesc: '', similarityChecked: false}]);
      setOrderTitle('');
      setDueDate('');
      setPendingItems([]);
      setCreationStep('INITIAL');
      setEditingOrderId(null);
      setExpandedRowIndex(0);
      setFormErrors({ rows: [], duplicateCustom: [], invalidSkus: [], unchecked: [], missingCategory: [] });
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
  
  // Helper to check if SKU exists in our known list
  const isKnownSku = (sku: string) => {
     return materialOptions.some(opt => opt.sku === sku);
  };

  // --- IMPORT LOGIC ---
  const handleImportProcess = () => {
      const parsedItems = ParserService.parseOrderImport(importText);
      if (parsedItems.length === 0) {
          alert("Não foi possível identificar itens no texto colado. Use o formato: 'Referência, Quantidade'.");
          return;
      }

      const newRows: ManualRow[] = parsedItems.map(item => {
          const isKnown = isKnownSku(item.sku);
          return {
              sku: isKnown ? item.sku : '',
              qty: item.quantity,
              unit: 'UN',
              category: '',
              customCategory: '',
              isCustom: !isKnown,
              customDesc: !isKnown ? (item.description || item.sku) : '',
              similarityChecked: isKnown // Automatically valid if known
          };
      });

      // Filter out the initial empty row if it hasn't been touched
      let currentRows = [...manualRows];
      if (currentRows.length === 1 && !currentRows[0].sku && !currentRows[0].customDesc) {
          currentRows = [];
      }

      setManualRows([...currentRows, ...newRows]);
      setImportModalOpen(false);
      setImportText('');
      setMessage({ type: 'success', text: `${newRows.length} itens importados com sucesso. Verifique se há itens novos (customizados).` });
  };
  // --------------------

  const validateForm = (): boolean => {
      const errors: number[] = [];
      const duplicateErrors: number[] = [];
      const invalidSkus: number[] = [];
      const uncheckedErrors: number[] = [];
      const missingCategoryErrors: number[] = [];
      let isTitleValid = orderTitle.trim().length > 0;
      
      manualRows.forEach((row, idx) => {
          const qty = Number(row.qty);
          if (qty <= 0) errors.push(idx);
          else if (row.isCustom) {
              if (!row.customDesc) {
                  errors.push(idx);
              } else {
                  // Must be checked via similarity
                  if (!row.similarityChecked) {
                      uncheckedErrors.push(idx);
                  }
                  
                  // Category Check
                  if (!row.category) {
                      missingCategoryErrors.push(idx);
                  } else if (row.category === '_OTHER_' && !row.customCategory.trim()) {
                      missingCategoryErrors.push(idx);
                  }
                  
                  // Check if description already exists in master list
                  const exists = masterList.some(m => normalizeText(m.description) === normalizeText(row.customDesc));
                  if (exists) {
                      duplicateErrors.push(idx);
                  }
              }
          }
          else if (!row.isCustom) {
              if (!row.sku) {
                  errors.push(idx);
              } else if (!isKnownSku(row.sku)) {
                  // Entered text is not a known SKU -> Invalid
                  invalidSkus.push(idx);
              }
          }
      });

      setFormErrors({
          title: !isTitleValid,
          rows: errors,
          duplicateCustom: duplicateErrors,
          invalidSkus: invalidSkus,
          unchecked: uncheckedErrors,
          missingCategory: missingCategoryErrors
      });

      return isTitleValid && errors.length === 0 && duplicateErrors.length === 0 && invalidSkus.length === 0 && uncheckedErrors.length === 0 && missingCategoryErrors.length === 0;
  };

  const addManualRow = () => {
     // Optional: Validate before adding new row to force user to finish current one
     if (!validateForm()) {
         setMessage({ type: 'error', text: "Preencha e verifique o item atual antes de adicionar outro." });
         return;
     }

     const nextIdx = manualRows.length;
     setManualRows([...manualRows, { sku: '', qty: '', unit: 'UN', category: '', customCategory: '', isCustom: false, customDesc: '', similarityChecked: false }]);
     setExpandedRowIndex(nextIdx); // Auto collapse prev, expand new
     setMessage(null);
  };

  // --- SIMILARITY SEARCH LOGIC ---
  const handleCheckSimilarity = (idx: number) => {
    const row = manualRows[idx];
    const query = row.isCustom ? row.customDesc : row.sku; 
    
    if (!query || query.trim().length < 3) {
        alert("Digite ao menos 3 caracteres para buscar.");
        return;
    }

    // 1. Filter Master List
    const candidates = masterList
        .map(m => ({ ...m, score: calculateRelevance(m.description, query) }))
        .filter(m => m.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10); // Top 10

    setSimilarityResults(candidates);
    setSimilarityTargetIdx(idx);
    setSimilarityStep('LIST');
    setSimilarityModalOpen(true);
  };

  const handleSelectCandidate = (candidate: MasterMaterial) => {
      setSelectedCandidate(candidate);
      setSimilarityStep('CONFIRM_MATCH');
  };

  const handleConfirmMatch = () => {
      if (similarityTargetIdx === null || !selectedCandidate) return;
      
      const newRows = [...manualRows];
      newRows[similarityTargetIdx] = {
          ...newRows[similarityTargetIdx],
          sku: selectedCandidate.sku,
          isCustom: false,
          customDesc: '',
          unit: 'UN', // Default unit for existing items
          category: '', // Reset
          similarityChecked: true // MARK CHECKED
      };
      setManualRows(newRows);
      
      // Clear error if any
      const newErrors = {...formErrors};
      newErrors.invalidSkus = newErrors.invalidSkus?.filter(i => i !== similarityTargetIdx);
      newErrors.unchecked = newErrors.unchecked?.filter(i => i !== similarityTargetIdx);
      newErrors.missingCategory = newErrors.missingCategory?.filter(i => i !== similarityTargetIdx);
      setFormErrors(newErrors);

      setSimilarityModalOpen(false);
  };

  const handleNotFound = () => {
      setSimilarityStep('CONFIRM_NEW');
  };

  const handleConfirmNew = () => {
      if (similarityTargetIdx === null) return;
      
      const newRows = [...manualRows];
      // Use the query they typed
      const currentText = newRows[similarityTargetIdx].isCustom 
          ? newRows[similarityTargetIdx].customDesc 
          : newRows[similarityTargetIdx].sku;

      newRows[similarityTargetIdx] = {
          ...newRows[similarityTargetIdx],
          sku: '',
          isCustom: true,
          customDesc: currentText,
          similarityChecked: true // MARK CHECKED
      };
      setManualRows(newRows);

       // Clear error if any
       const newErrors = {...formErrors};
       newErrors.invalidSkus = newErrors.invalidSkus?.filter(i => i !== similarityTargetIdx);
       newErrors.unchecked = newErrors.unchecked?.filter(i => i !== similarityTargetIdx);
       setFormErrors(newErrors);

      setSimilarityModalOpen(false);
  };

  // -----------------------------

  const handleManualNext = () => {
    if (!validateForm()) {
        const unchecked = manualRows.some(r => r.isCustom && !r.similarityChecked);
        const missingCat = manualRows.some((r) => r.isCustom && (!r.category || (r.category === '_OTHER_' && !r.customCategory)));
        const hasDuplicates = manualRows.some((row, idx) => {
             return row.isCustom && row.customDesc && masterList.some(m => normalizeText(m.description) === normalizeText(row.customDesc));
        });
        const hasInvalidSkus = manualRows.some((row) => !row.isCustom && row.sku && !isKnownSku(row.sku));

        if (unchecked) {
             setMessage({ type: 'error', text: "Você possui itens novos que não foram verificados. Clique em 'Confirmar Material' para validar." });
        } else if (missingCat) {
             setMessage({ type: 'error', text: "Selecione uma categoria para os novos materiais." });
        } else if (hasDuplicates) {
             setMessage({ type: 'error', text: "Alguns materiais manuais já existem na lista oficial. Por favor, selecione-os da lista." });
        } else if (hasInvalidSkus) {
             setMessage({ type: 'error', text: "Alguns itens não foram identificados. Use o botão 'Confirmar Material' para verificar se existem na lista." });
        } else {
             setMessage({ type: 'error', text: "Corrija os campos destacados em vermelho." });
        }
        return;
    }

    const items: OrderLineItem[] = [];
    for (const row of manualRows) {
        const qtyNum = Number(row.qty);
        if (row.isCustom) {
            let finalCategory = row.category;
            if (row.category === '_OTHER_') {
                finalCategory = row.customCategory;
            } else {
                // Find full name
                const catObj = MATERIAL_CATEGORIES.find(c => c.code === row.category);
                if (catObj) finalCategory = `${catObj.code} - ${catObj.name}`;
            }

            items.push({
                sku: 'N/A',
                description: row.customDesc,
                quantity: qtyNum,
                unit: row.unit,
                category: finalCategory,
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
      const rows: ManualRow[] = (order.items || []).map(item => ({
          sku: item.isCustom ? '' : item.sku,
          qty: item.quantity,
          unit: item.unit || 'UN',
          category: item.category || '', 
          customCategory: '', // We don't restore custom text perfectly, user has to re-select if editing
          isCustom: !!item.isCustom,
          customDesc: item.isCustom ? item.description.replace('(Novo) ', '') : '',
          similarityChecked: true // Assume edited existing items are checked
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

      const oldMap = new Map((oldOrder.items || []).map(i => [i.isCustom ? `CUST:${i.description}` : i.sku, i.quantity]));
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
                        // FIX: Use getStockCount to sum up all batches/positions
                        const currentStock = getStockCount(item.sku);
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
                            // Format: Referência: [MATERIAL] \n Descrição: [TEXTO] \n Quantidade pedida: [QTY]
                            body += `Referência: ${item.sku}\n`;
                            body += `Descrição: ${item.description}\n`;
                            body += `Quantidade pedida: ${item.quantity}\n\n`;
                        });
                    }

                    if (newMaterialItems.length > 0) {
                        hasAlerts = true;
                        body += `Necessário criar código:\n`;
                        newMaterialItems.forEach(item => {
                            // Find unit description
                            const uom = unitOptions.find(u => u.value === item.unit);
                            const unitDesc = uom ? `${item.unit} (${uom.description})` : item.unit;

                            body += `Referência: A Definir\n`;
                            body += `Descrição: ${item.description}\n`;
                            // Add Category
                            if (item.category) {
                                body += `Categoria: ${item.category}\n`;
                            }
                            body += `Quantidade pedida: ${item.quantity}\n`;
                            // ADD UNIT TO EMAIL
                            if (item.unit) {
                                body += `Unidade: ${unitDesc}\n`;
                            }
                            body += `\n`;
                        });
                    }

                    body += `Cumprimentos`;

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
  
  // Safe array helper
  const toArray = (data: any) => {
      if(!data) return [];
      if(Array.isArray(data)) return data;
      return Object.values(data);
  };

  // Helper to extract actual picked quantity from the warehouse logs (pickedItems)
  const getPickedQtyForSku = (order: Order, sku: string): number => {
    // Handle both Array and Object (Firebase quirk)
    const pickedList = toArray(order.pickedItems);
    
    if (pickedList.length > 0) {
        const cleanSku = sku.trim().toLowerCase();
        return pickedList
            .filter((p: any) => (p.material || '').trim().toLowerCase() === cleanSku)
            .reduce((sum: number, p: any) => sum + (Number(p.pickedQty) || 0), 0);
    }
    return 0;
  };

  // Advanced helper that aggregates picked qty from the order AND its completed child backorders
  const getTotalPickedQuantity = (order: Order, allOrders: Order[], sku: string): number => {
     let total = getPickedQtyForSku(order, sku);
     
     // Find child orders (backorders) that are completed
     const children = allOrders.filter(o => o.originalOrderId === order.id && o.status === 'COMPLETED');
     
     children.forEach(child => {
        total += getPickedQtyForSku(child, sku);
     });
     
     return total;
  };

  const downloadExcel = (order: Order) => {
      const pickedList = toArray(order.pickedItems);
      if (pickedList.length === 0) {
          alert("Este pedido não tem itens processados para exportar.");
          return;
      }

      // Format required: Itm, C, I, Cen., Depósito de saída, Depósito, Material, Texto breve, Lote, Qtd.pedido, Dt.remessa
      const headers = ["Itm", "C", "I", "Cen.", "Depósito de saída", "Depósito", "Material", "Texto breve", "Lote", "Qtd.pedido", "Dt.remessa"];
      const data = pickedList.map((item: any, idx: number) => {
          return [
              (idx + 1) * 10, // Itm: 10, 20, 30...
              "P", // C: Fixed
              "", // I: Empty
              "1700", // Cen.: Fixed
              "0001", // Depósito de saída: Fixed
              "0004", // Depósito: Fixed
              item.material, // Material
              "", // Texto breve: Empty
              item.bin || "", // Lote (from bin/batch info if available)
              item.pickedQty, // Qtd.pedido (using picked qty)
              new Date().toLocaleDateString('pt-PT') // Dt.remessa: Today's date
          ];
      });

      const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Pedido");
      
      const fileName = `Pedido_${order.displayId}_${order.title.replace(/\s+/g, '_')}.xlsx`;
      XLSX.writeFile(wb, fileName);
  };

  const FinalizeOrderForm = () => (
    <div className="space-y-4 animate-fade-in bg-slate-50 dark:bg-slate-900 p-6 rounded-lg border border-slate-200 dark:border-slate-700">
        <h4 className="font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-2 mb-4">
            {editingOrderId ? 'Salvar Alterações' : 'Finalizar Pedido'}
        </h4>
        
        <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Título do Pedido</label>
            <input 
                type="text"
                value={orderTitle}
                maxLength={19}
                onChange={e => setOrderTitle(e.target.value)}
                className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed"
                disabled
            />
        </div>

        <div>
            <label className={`block text-sm font-medium mb-1 ${formErrors.date ? 'text-red-600' : 'text-slate-700 dark:text-slate-300'}`}>
                Data Levantamento {formErrors.date && '*'}
            </label>
            <input 
                type="date"
                value={dueDate}
                min={getMinDate()}
                onChange={handleDateChange}
                className={`w-full p-2 border rounded-md focus:ring-2 outline-none dark:bg-slate-800 dark:text-white ${formErrors.date ? 'border-red-500 focus:ring-red-200 bg-red-50 dark:bg-red-900/20' : 'border-slate-300 focus:ring-brand-500 dark:border-slate-600'}`}
            />
            {formErrors.date && <p className="text-xs text-red-500 mt-1">Data obrigatória.</p>}
        </div>

        <div className="text-sm text-slate-600 dark:text-slate-400 mt-4">
            <p className="font-medium mb-2 text-slate-700 dark:text-slate-300">Resumo dos Itens:</p>
            <ul className="list-disc list-inside space-y-1 bg-white dark:bg-slate-800 p-3 rounded border border-slate-200 dark:border-slate-700 max-h-40 overflow-y-auto">
                {pendingItems.map((item, idx) => (
                    <li key={idx} className="truncate flex items-center gap-2">
                        <span className="font-bold">{item.quantity}x</span> 
                        <span>{item.description}</span>
                        {item.unit && item.isCustom && (
                             <span className="text-xs bg-slate-100 dark:bg-slate-700 px-1 rounded">{item.unit}</span>
                        )}
                    </li>
                ))}
            </ul>
        </div>

        <div className="pt-4 flex justify-end gap-3">
             <button
                onClick={() => setCreationStep('INITIAL')}
                className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
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

      {/* Import Modal */}
      {importModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg p-6 border border-slate-200 dark:border-slate-700 animate-fade-in">
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-brand-600" /> Importar Lista
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                      Cole sua lista abaixo no formato: <code>REFERENCIA, QUANTIDADE</code> (uma por linha).
                  </p>
                  <textarea
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      placeholder="Exemplo:
1033221, 5
2001002, 10
TUBO 20MM, 2"
                      className="w-full h-40 p-3 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-brand-500 outline-none dark:bg-slate-900 dark:text-white font-mono text-sm"
                  />
                  <div className="flex justify-end gap-3 mt-4">
                      <button 
                          onClick={() => setImportModalOpen(false)}
                          className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                      >
                          Cancelar
                      </button>
                      <button 
                          onClick={handleImportProcess}
                          className="px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 font-medium"
                      >
                          Processar
                      </button>
                  </div>
              </div>
          </div>
      )}

      {/* Similarity Search Modal */}
      {similarityModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-fade-in border border-slate-200 dark:border-slate-700">
                
                {similarityStep === 'LIST' && (
                    <>
                        <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
                            <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <Search className="w-5 h-5 text-brand-600" /> Verificação de Material
                            </h3>
                            <button onClick={() => setSimilarityModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto flex-1 dark:text-slate-300">
                            <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                                Encontramos materiais semelhantes ao que você digitou. Selecione um se for o que procura:
                            </p>
                            <div className="space-y-2">
                                {similarityResults.length > 0 ? (
                                    similarityResults.map((res, idx) => (
                                        <button 
                                            key={idx}
                                            onClick={() => handleSelectCandidate(res)}
                                            className="w-full text-left p-3 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-brand-50 dark:hover:bg-brand-900/20 hover:border-brand-200 dark:hover:border-brand-800 transition-colors group"
                                        >
                                            <div className="flex justify-between items-start">
                                                <span className="font-bold text-brand-700 dark:text-brand-400 text-sm block group-hover:underline">{res.sku}</span>
                                                <span className="bg-brand-100 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 text-[10px] px-2 py-0.5 rounded-full font-bold">Encontrado</span>
                                            </div>
                                            <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">{res.description}</p>
                                        </button>
                                    ))
                                ) : (
                                    <div className="text-center py-8 text-slate-500 bg-slate-50 dark:bg-slate-900 rounded-lg border border-dashed border-slate-300 dark:border-slate-700">
                                        Nenhuma similaridade encontrada.
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                            <button 
                                onClick={handleNotFound}
                                className="w-full py-3 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-medium rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
                            >
                                <AlertCircle className="w-4 h-4" /> Material não consta na lista
                            </button>
                        </div>
                    </>
                )}

                {similarityStep === 'CONFIRM_MATCH' && selectedCandidate && (
                    <>
                         <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-green-50 dark:bg-green-900/20">
                            <h3 className="font-bold text-green-800 dark:text-green-300 flex items-center gap-2">
                                <CheckCircle className="w-5 h-5" /> Confirmar Seleção
                            </h3>
                        </div>
                        <div className="p-6 flex-1 text-center">
                            <p className="text-slate-600 dark:text-slate-300 mb-4">Você confirma que o material desejado é:</p>
                            <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded-lg border border-slate-200 dark:border-slate-700 mb-6 text-left">
                                <p className="text-xs text-slate-400 font-bold uppercase">Material</p>
                                <p className="font-mono font-bold text-lg text-slate-800 dark:text-white">{selectedCandidate.sku}</p>
                                <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">{selectedCandidate.description}</p>
                            </div>
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => setSimilarityStep('LIST')}
                                    className="flex-1 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                                >
                                    Voltar
                                </button>
                                <button 
                                    onClick={handleConfirmMatch}
                                    className="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                                >
                                    Sim, é este
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {similarityStep === 'CONFIRM_NEW' && (
                    <>
                         <div className="p-4 border-b border-slate-200 dark:border-slate-700 bg-amber-50 dark:bg-amber-900/20">
                            <h3 className="font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
                                <HelpCircle className="w-5 h-5" /> Criar Novo Material?
                            </h3>
                        </div>
                        <div className="p-6 flex-1 text-center">
                            <p className="text-slate-600 dark:text-slate-300 mb-6">
                                Você indicou que o material não está na lista. Deseja prosseguir com a criação de um item novo (Personalizado)?
                            </p>
                            <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-lg border border-amber-200 dark:border-amber-800 mb-6 text-left">
                                <p className="text-xs text-amber-800 dark:text-amber-400 font-bold flex items-center gap-1">
                                    <Clock className="w-3 h-3"/> Ação do Sistema:
                                </p>
                                <p className="text-sm text-amber-900 dark:text-amber-300 mt-1">
                                    Um e-mail de notificação será enviado para a criação deste código no sistema.
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => setSimilarityStep('LIST')}
                                    className="flex-1 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                                >
                                    Voltar
                                </button>
                                <button 
                                    onClick={handleConfirmNew}
                                    className="flex-1 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium"
                                >
                                    Sim, avançar com criação
                                </button>
                            </div>
                        </div>
                    </>
                )}

            </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
          {mode === 'CREATE' ? <Upload className="text-brand-500"/> : (type === 'OPEN' ? <Clock className="text-blue-500"/> : <CheckCircle className="text-green-500"/>)}
          {mode === 'CREATE' ? 'Novo Pedido ao Armazém' : (type === 'OPEN' ? 'Pedidos Abertos' : 'Pedidos ao Armazém Finalizados')}
          {mode === 'LIST' && (
             <span className="text-sm font-normal text-slate-500 dark:text-slate-400 ml-2 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full">
                {filteredOrders.length}
             </span>
          )}
        </h2>
        
        {/* Search for Finished Orders */}
        {type === 'FINISHED' && mode === 'LIST' && (
             <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="Buscar pedido..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
             </div>
        )}
      </div>

      {/* CREATION/EDIT AREA */}
      {showForm && (
        <div className={`bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border ${editingOrderId ? 'border-amber-400 ring-2 ring-amber-100 dark:ring-amber-900' : 'border-brand-200 dark:border-slate-700'}`}>
          {editingOrderId && (
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Edit className="w-5 h-5 text-amber-600 dark:text-amber-400" /> 
                <span className="text-amber-700 dark:text-amber-400">Editando Pedido</span>
                <button onClick={resetForm} className="text-xs text-slate-500 dark:text-slate-400 underline ml-2 hover:text-red-500">(Cancelar)</button>
            </h3>
          )}

          {creationStep === 'DETAILS_PENDING' ? (
              <FinalizeOrderForm />
          ) : (
            <div>
                <div className="space-y-3 animate-fade-in">
                    <div className="mb-4">
                        <label className={`block text-xs font-semibold mb-1 ${formErrors.title ? 'text-red-600' : 'text-slate-500 dark:text-slate-400'}`}>
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
                            className={`w-full p-3 border rounded-md shadow-sm outline-none transition-all dark:bg-slate-900 dark:text-white ${formErrors.title ? 'border-red-500 ring-1 ring-red-200 bg-red-50 dark:bg-red-900/20' : 'border-slate-300 focus:ring-2 focus:ring-brand-500 dark:border-slate-600'}`}
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
                            const isInvalidSku = formErrors.invalidSkus && formErrors.invalidSkus.includes(idx);
                            const isUnchecked = formErrors.unchecked && formErrors.unchecked.includes(idx);
                            const isMissingCat = formErrors.missingCategory && formErrors.missingCategory.includes(idx);
                            const stockQty = getStockCount(row.sku);

                            // Determine if we should show the "Confirm Material" button
                            // Show if: (Not Custom AND Unknown SKU) OR (Custom Item)
                            const showConfirmButton = (!row.isCustom && row.sku.length > 0 && !isKnownSku(row.sku)) || row.isCustom;

                            return (
                                <div 
                                    key={idx} 
                                    className={`rounded-lg border transition-all duration-200 overflow-hidden ${
                                        isError || isDuplicate || isInvalidSku || isUnchecked || isMissingCat ? 'border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-800' : 
                                        isExpanded ? 'border-brand-200 bg-slate-50 dark:bg-slate-800 shadow-md ring-1 ring-brand-100 dark:ring-brand-900' : 'border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                                    }`}
                                >
                                    {/* Header (Always Visible) */}
                                    <div 
                                        onClick={() => setExpandedRowIndex(isExpanded ? -1 : idx)}
                                        className="p-3 flex items-center justify-between cursor-pointer select-none"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className={`text-xs font-bold uppercase ${isError || isDuplicate || isInvalidSku || isUnchecked || isMissingCat ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>Item {idx + 1}</span>
                                            {!isExpanded && (
                                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate max-w-[150px] md:max-w-[300px]">
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
                                        <div className="p-4 border-t border-slate-200 dark:border-slate-700 animate-fade-in">
                                            <div className="mb-3">
                                                {row.isCustom ? (
                                                    <div>
                                                        <div className="relative flex items-center gap-2">
                                                            <input 
                                                                type="text"
                                                                value={row.customDesc}
                                                                maxLength={40}
                                                                onChange={(e) => {
                                                                    const newRows = [...manualRows];
                                                                    newRows[idx].customDesc = e.target.value;
                                                                    newRows[idx].similarityChecked = false; // Reset check on edit
                                                                    setManualRows(newRows);
                                                                }}
                                                                placeholder="Descrição do novo material..."
                                                                className={`flex-1 min-w-0 p-3 border rounded-md text-sm outline-none dark:bg-slate-900 dark:text-white ${
                                                                    (isError && !row.customDesc) || isDuplicate || isUnchecked
                                                                    ? 'border-red-500 bg-white ring-1 ring-red-200' 
                                                                    : 'border-blue-300 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700 focus:ring-2 focus:ring-blue-500'
                                                                }`}
                                                            />
                                                            {/* Button for Custom Mode - Always visible if not checked, or as badge if checked */}
                                                            {!row.similarityChecked ? (
                                                                <button 
                                                                    onClick={() => handleCheckSimilarity(idx)}
                                                                    className="flex-none px-4 py-3 bg-blue-600 text-white rounded-md font-bold text-sm whitespace-nowrap hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm"
                                                                >
                                                                    <Search className="w-4 h-4" /> Confirmar Material
                                                                </button>
                                                            ) : (
                                                                <div className="flex-none px-3 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-md font-bold text-sm flex items-center gap-1 border border-green-200 dark:border-green-800">
                                                                    <Check className="w-4 h-4" /> Verificado
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="text-right text-[10px] text-slate-400 mt-1">
                                                            {row.customDesc.length}/40
                                                        </div>
                                                        
                                                        {/* Category Select for Custom Items */}
                                                        <div className="mt-3">
                                                            <label className={`block text-xs font-bold uppercase mb-1 ${isMissingCat ? 'text-red-500' : 'text-slate-400'}`}>Categoria Obrigatória</label>
                                                            <div className="relative">
                                                                <select
                                                                    value={row.category}
                                                                    onChange={(e) => {
                                                                        const newRows = [...manualRows];
                                                                        newRows[idx].category = e.target.value;
                                                                        setManualRows(newRows);
                                                                    }}
                                                                    className={`w-full p-2.5 border rounded-md text-sm outline-none appearance-none dark:bg-slate-900 dark:text-white ${isMissingCat ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'}`}
                                                                >
                                                                    <option value="">Selecione uma categoria...</option>
                                                                    {MATERIAL_CATEGORIES.map(cat => (
                                                                        <option key={cat.code} value={cat.code}>
                                                                            {cat.code} - {cat.name}
                                                                        </option>
                                                                    ))}
                                                                    <option value="_OTHER_">Outra (Digitar)</option>
                                                                </select>
                                                                <Tag className="absolute right-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
                                                            </div>
                                                            
                                                            {/* Custom Category Input if "Other" selected */}
                                                            {row.category === '_OTHER_' && (
                                                                <input 
                                                                    type="text"
                                                                    value={row.customCategory}
                                                                    onChange={(e) => {
                                                                        const newRows = [...manualRows];
                                                                        newRows[idx].customCategory = e.target.value;
                                                                        setManualRows(newRows);
                                                                    }}
                                                                    placeholder="Digite a categoria sugerida..."
                                                                    className="w-full mt-2 p-2 border border-slate-300 dark:border-slate-600 rounded-md text-sm outline-none dark:bg-slate-900 dark:text-white"
                                                                />
                                                            )}
                                                        </div>

                                                        {isDuplicate && (
                                                            <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                                                <AlertCircle className="w-3 h-3"/> Este material já existe na lista. Por favor, desmarque "Novo" e busque pelo nome.
                                                            </p>
                                                        )}
                                                        {isUnchecked && (
                                                             <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                                                <AlertCircle className="w-3 h-3"/> Validação obrigatória. Clique em "Confirmar Material".
                                                            </p>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="relative flex items-center gap-2">
                                                        <input 
                                                            list="stock-options"
                                                            type="text" 
                                                            value={row.sku}
                                                            onChange={(e) => {
                                                                const newRows = [...manualRows];
                                                                newRows[idx].sku = e.target.value;
                                                                newRows[idx].similarityChecked = false; // Reset check
                                                                // Reset invalid error when typing
                                                                if (isInvalidSku) {
                                                                    const newErrors = {...formErrors};
                                                                    newErrors.invalidSkus = newErrors.invalidSkus?.filter(i => i !== idx);
                                                                    setFormErrors(newErrors);
                                                                }
                                                                setManualRows(newRows);
                                                            }}
                                                            placeholder="Código ou nome do material..."
                                                            className={`flex-1 min-w-0 p-3 border rounded-md text-sm outline-none dark:bg-slate-900 dark:text-white ${isError && !row.sku || isInvalidSku ? 'border-red-500' : 'border-slate-300 focus:ring-2 focus:ring-brand-500 dark:border-slate-600'}`}
                                                        />
                                                        {showConfirmButton && !row.similarityChecked && (
                                                            <button 
                                                                onClick={() => handleCheckSimilarity(idx)}
                                                                className="flex-none px-4 py-3 bg-blue-100 text-blue-700 rounded-md font-bold text-sm whitespace-nowrap hover:bg-blue-200 transition-colors flex items-center gap-2"
                                                            >
                                                                <Search className="w-4 h-4" /> Confirmar Material
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                                {isInvalidSku && !row.isCustom && (
                                                    <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                                                        <AlertCircle className="w-3 h-3"/> Material não encontrado. Use o botão "Confirmar Material" para verificar.
                                                    </p>
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
                                                        className={`w-full p-3 border rounded-md text-sm outline-none dark:bg-slate-900 dark:text-white ${isError && (!row.qty || Number(row.qty) <= 0) ? 'border-red-500' : 'border-slate-300 focus:ring-2 focus:ring-brand-500 dark:border-slate-600'}`}
                                                        min="0"
                                                    />
                                                </div>
                                                
                                                {/* Unit Selector for Custom Items */}
                                                {row.isCustom && (
                                                    <div className="w-1/3">
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Unid.</label>
                                                        <div className="relative">
                                                            <select
                                                                value={row.unit || 'UN'}
                                                                onChange={(e) => {
                                                                    const newRows = [...manualRows];
                                                                    newRows[idx].unit = e.target.value;
                                                                    setManualRows(newRows);
                                                                }}
                                                                className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-md text-sm outline-none bg-white dark:bg-slate-900 dark:text-white appearance-none"
                                                            >
                                                                {unitOptions.map(opt => (
                                                                    <option key={opt.value} value={opt.value}>{opt.value} - {opt.description}</option>
                                                                ))}
                                                            </select>
                                                            <Scale className="absolute right-3 top-3.5 w-4 h-4 text-slate-400 pointer-events-none" />
                                                        </div>
                                                    </div>
                                                )}

                                                <div className="flex-1 flex flex-col justify-end pb-3">
                                                     {!row.isCustom && row.sku && isKnownSku(row.sku) && (
                                                        <div className={`text-xs font-medium ${stockQty > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                            Stock: {stockQty}
                                                        </div>
                                                     )}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* Action Buttons: Add Item & Import */}
                    <div className="flex gap-3">
                        <button
                            onClick={addManualRow}
                            className="flex-1 py-3 bg-brand-50 dark:bg-brand-900/20 border-2 border-dashed border-brand-200 dark:border-brand-800 rounded-lg text-brand-600 dark:text-brand-400 font-bold hover:bg-brand-100 dark:hover:bg-brand-900/30 transition-colors flex items-center justify-center gap-2"
                        >
                            <Plus className="w-5 h-5" /> Adicionar Outro Item
                        </button>
                        <button
                            onClick={() => setImportModalOpen(true)}
                            className="px-6 py-3 bg-slate-100 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-lg text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2"
                            title="Importar de Texto (CSV)"
                        >
                            <FileText className="w-5 h-5" /> Importar
                        </button>
                    </div>

                    {/* Submit Button (Next Step) */}
                    <div className="pt-4 flex justify-end">
                         <button
                            onClick={handleManualNext}
                            className="bg-brand-600 text-white px-6 py-3 rounded-lg hover:bg-brand-700 font-medium flex items-center gap-2 shadow-sm"
                        >
                            <ArrowRightCircle className="w-5 h-5" /> Avançar para Finalização
                        </button>
                    </div>
                </div>
            </div>
          )}
        </div>
      )}

      {/* LIST AREA */}
      {showList && (
        <div className="space-y-4 animate-fade-in">
           {filteredOrders.length === 0 ? (
               <div className="text-center p-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                   <div className="bg-slate-100 dark:bg-slate-700 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                       <Search className="w-8 h-8 text-slate-400" />
                   </div>
                   <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">Nenhum pedido encontrado</h3>
                   <p className="text-slate-500 dark:text-slate-400">Tente ajustar seus filtros ou crie um novo pedido.</p>
               </div>
           ) : (
               filteredOrders.map(order => {
                   const isExpanded = expandedOrderId === order.id;
                   const isInProcess = order.status === 'IN_PROCESS' || order.status === 'IN PROCESS';
                   const hasBackorder = order.reopenCount && order.reopenCount > 0;
                   const isReopen = !!order.originalOrderId;

                   return (
                       <div key={order.id} className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border transition-all ${isExpanded ? 'border-brand-200 dark:border-brand-900 ring-1 ring-brand-100 dark:ring-brand-900' : 'border-slate-200 dark:border-slate-700'}`}>
                           <div className="p-4 cursor-pointer" onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}>
                               <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                   <div className="flex items-start gap-4">
                                       <div className={`p-3 rounded-full hidden md:block ${type === 'OPEN' ? (isInProcess ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400') : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'}`}>
                                           {type === 'OPEN' ? <Clock className="w-6 h-6" /> : <CheckCircle className="w-6 h-6" />}
                                       </div>
                                       <div>
                                           <div className="flex items-center gap-2">
                                               <h3 className="font-bold text-lg text-slate-800 dark:text-white">{order.title}</h3>
                                               {hasBackorder && <span className="text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded-full font-bold">Reabertura ({order.reopenCount})</span>}
                                               {isReopen && <span className="text-[10px] bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded-full font-bold">Derivado</span>}
                                           </div>
                                           <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400 mt-1">
                                               <span className="flex items-center gap-1"><User className="w-3 h-3" /> {order.creator}</span>
                                               <span className="w-1 h-1 bg-slate-300 dark:bg-slate-600 rounded-full"></span>
                                               <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {new Date(order.dateCreated).toLocaleDateString()}</span>
                                               {type === 'OPEN' && (
                                                   <>
                                                     <span className="w-1 h-1 bg-slate-300 dark:bg-slate-600 rounded-full"></span>
                                                     <span className={`font-semibold ${new Date(order.dueDate) < new Date() ? 'text-red-500' : 'text-blue-500'}`}>
                                                        Levantar: {new Date(order.dueDate).toLocaleDateString()}
                                                     </span>
                                                   </>
                                               )}
                                           </div>
                                       </div>
                                   </div>
                                   
                                   <div className="flex items-center gap-3 ml-14 md:ml-0">
                                       {isInProcess && (
                                            <span className="px-3 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs font-bold rounded-full flex items-center gap-1 border border-amber-100 dark:border-amber-800">
                                                <Activity className="w-3 h-3 animate-pulse" /> Em Separação
                                            </span>
                                       )}
                                       {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400"/> : <ChevronDown className="w-5 h-5 text-slate-400"/>}
                                   </div>
                               </div>
                           </div>
                           
                           {isExpanded && (
                               <div className="border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-4 animate-fade-in">
                                   <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden mb-4">
                                       <table className="w-full text-sm text-left">
                                           <thead className="bg-slate-100 dark:bg-slate-900 font-semibold text-slate-600 dark:text-slate-300">
                                               <tr>
                                                   <th className="p-3">Material</th>
                                                   <th className="p-3">Descrição</th>
                                                   <th className="p-3 text-right">Qtd</th>
                                                   {type === 'FINISHED' && <th className="p-3 text-right">Processado</th>}
                                                   {type === 'FINISHED' && <th className="p-3">Status</th>}
                                               </tr>
                                           </thead>
                                           <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                                               {order.items.map((item, idx) => {
                                                   const picked = type === 'FINISHED' ? getTotalPickedQuantity(order, orders, item.sku) : 0;
                                                   const isFullyPicked = picked >= item.quantity;
                                                   return (
                                                       <tr key={idx}>
                                                           <td className="p-3 font-mono text-xs">{item.sku}</td>
                                                           <td className="p-3">
                                                               {item.description}
                                                               {item.isCustom && <span className="ml-2 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1 rounded">Novo</span>}
                                                           </td>
                                                           <td className="p-3 text-right font-bold">{item.quantity}</td>
                                                           {type === 'FINISHED' && (
                                                               <>
                                                                 <td className="p-3 text-right font-bold">{picked}</td>
                                                                 <td className="p-3">
                                                                     {isFullyPicked ? (
                                                                         <span className="text-green-600 dark:text-green-400 flex items-center gap-1 text-xs font-bold"><Check className="w-3 h-3"/> OK</span>
                                                                     ) : (
                                                                         <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1 text-xs font-bold"><AlertTriangle className="w-3 h-3"/> Parcial</span>
                                                                     )}
                                                                 </td>
                                                               </>
                                                           )}
                                                       </tr>
                                                   );
                                               })}
                                           </tbody>
                                       </table>
                                   </div>

                                   {/* Change Log */}
                                   {order.changeLog && order.changeLog.length > 0 && (
                                       <div className="mb-4">
                                           <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2 flex items-center gap-1">
                                               <History className="w-3 h-3" /> Histórico de Alterações
                                           </p>
                                           <div className="space-y-2">
                                               {order.changeLog.map((log, idx) => (
                                                   <div key={idx} className="text-xs text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700">
                                                       <span className="font-bold text-slate-800 dark:text-slate-200">{new Date(log.date).toLocaleString()}</span>
                                                       <span className="mx-1 text-slate-300">|</span>
                                                       <span className="text-brand-600 dark:text-brand-400 font-medium">{log.actor}</span>
                                                       <span className="mx-1 text-slate-300">|</span>
                                                       <span>{log.details}</span>
                                                   </div>
                                               ))}
                                           </div>
                                       </div>
                                   )}

                                   <div className="flex justify-end gap-3">
                                       {/* Actions for OPEN orders */}
                                       {type === 'OPEN' && canEdit && (
                                            <>
                                                <button 
                                                    onClick={() => handleDeleteOrder(order.id)}
                                                    className="px-4 py-2 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-sm font-medium flex items-center gap-2"
                                                >
                                                    <Trash2 className="w-4 h-4" /> Excluir
                                                </button>
                                                <button 
                                                    onClick={() => handleEditStart(order)}
                                                    className="px-4 py-2 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-200 dark:hover:bg-amber-900/50 rounded-lg text-sm font-medium flex items-center gap-2 border border-amber-200 dark:border-amber-800"
                                                >
                                                    <Edit className="w-4 h-4" /> Editar Pedido
                                                </button>
                                            </>
                                       )}
                                       {/* Actions for FINISHED orders */}
                                       {type === 'FINISHED' && (
                                           <button 
                                                onClick={() => downloadExcel(order)}
                                                className="px-4 py-2 bg-green-600 text-white hover:bg-green-700 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm"
                                            >
                                                <Download className="w-4 h-4" /> Exportar Excel
                                            </button>
                                       )}
                                   </div>
                               </div>
                           )}
                       </div>
                   );
               })
           )}
        </div>
      )}

      {message && (
        <div className={`fixed bottom-4 right-4 z-50 p-4 rounded-lg shadow-lg flex items-center gap-2 animate-slide-up ${message.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
            {message.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5"/>}
            <span className="font-medium">{message.text}</span>
            <button onClick={() => setMessage(null)} className="ml-2 p-1 hover:bg-white/20 rounded-full">
                <X className="w-4 h-4" />
            </button>
        </div>
      )}
    </div>
  );
};

export default OrderManager;