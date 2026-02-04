import React, { useState, useEffect, useMemo } from 'react';
import { Order, OrderLineItem, StockItem, UserRole, MasterMaterial, ChangeLogEntry, UnitOption, Company, CategoryOption } from '../types';
import { StorageService } from '../services/storageService';
import { ParserService } from '../services/parser';
import { Upload, FileText, Loader2, CheckCircle, Clock, Plus, Trash2, ArrowRightCircle, Calendar, User, ChevronDown, ChevronUp, AlertTriangle, Edit, History, Activity, AlertCircle, Search, Download, Check, X, HelpCircle, Scale, Tag, FileInput, Building, CornerDownRight, MapPin, Hash } from 'lucide-react';

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
  userCompanyId?: string;
  companies: Company[];
  categories?: CategoryOption[]; // Dynamic categories from settings
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

// Group interface to handle hierarchy
interface OrderGroup {
    root: Order;
    children: Order[];
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

const OrderManager: React.FC<OrderManagerProps> = ({ orders, stock, masterList, type, mode, userRole, refreshData, currentUsername, userCompanyId, companies, categories = [] }) => {
  // ... (existing state)
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  // Creation/Edit States
  const [creationStep, setCreationStep] = useState<'INITIAL' | 'DETAILS_PENDING'>('INITIAL');
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null); 
  
  // Manual Entry Buffer (Drafts)
  const [manualRows, setManualRows] = useState<ManualRow[]>([{sku: '', qty: '', unit: 'UN', category: '', customCategory: '', isCustom: false, customDesc: '', similarityChecked: false}]);
  const [orderTitle, setOrderTitle] = useState('');
  const [pep, setPep] = useState('');
  const [address, setAddress] = useState('');

  // Company Selection for Admins
  const [targetCompanyId, setTargetCompanyId] = useState<string>('');
  
  // Import State
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importText, setImportText] = useState('');

  // UI State
  const [expandedRowIndex, setExpandedRowIndex] = useState<number>(0);
  const [formErrors, setFormErrors] = useState<{title?: boolean, date?: boolean, company?: boolean, rows: number[], duplicateCustom?: number[], invalidSkus?: number[], unchecked?: number[], missingCategory?: number[]}>({ rows: [], duplicateCustom: [], invalidSkus: [], unchecked: [], missingCategory: [] });

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

  // ... (groupedOrders logic)
  const groupedOrders = useMemo(() => {
    const groups: Record<string, OrderGroup> = {};

    // 1. Identify all Root orders and place them in groups
    const orderMap = new Map<string, Order>();
    orders.forEach(o => orderMap.set(o.id, o));

    // Second pass: Build hierarchy
    orders.forEach(order => {
        const rootId = order.originalOrderId || order.id;
        
        // Ensure group exists
        if (!groups[rootId]) {
            const rootOrder = orderMap.get(rootId);
            if (rootOrder) {
                groups[rootId] = { root: rootOrder, children: [] };
            } else {
                groups[order.id] = { root: order, children: [] };
            }
        }

        // Add to children if it's not the root itself
        if (order.originalOrderId && groups[rootId]) {
            if (!groups[rootId].children.find(c => c.id === order.id)) {
                groups[rootId].children.push(order);
            }
        }
    });

    // 3. Filter Groups based on View Type
    let result = Object.values(groups);

    if (type === 'OPEN') {
        result = result.filter(group => {
            const isRootActive = group.root.status === 'OPEN' || group.root.status === 'IN_PROCESS' || group.root.status === 'IN PROCESS';
            const hasActiveChild = group.children.some(c => c.status === 'OPEN' || c.status === 'IN_PROCESS' || c.status === 'IN PROCESS');
            return isRootActive || hasActiveChild;
        });
    } else {
        result = result.filter(group => {
            const isRootDone = group.root.status === 'COMPLETED';
            const allChildrenDone = group.children.every(c => c.status === 'COMPLETED');
            return isRootDone && allChildrenDone;
        });
    }

    // 4. Search Filter
    if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        result = result.filter(group => {
            if ((group.root.title || '').toLowerCase().includes(q) || 
                (group.root.id || '').toLowerCase().includes(q) ||
                (group.root.displayId?.toString() || '').includes(q) ||
                (group.root.creator || '').toLowerCase().includes(q)) return true;
            
            return group.children.some(c => 
                (c.title || '').toLowerCase().includes(q) ||
                (c.id || '').toLowerCase().includes(q)
            );
        });
    }

    // 5. Sort Groups by latest activity
    result.sort((a, b) => {
        const getLatestDate = (g: OrderGroup) => {
            let d = new Date(g.root.dateCreated).getTime();
            g.children.forEach(c => {
                const cd = new Date(c.dateCreated).getTime();
                if (cd > d) d = cd;
            });
            return d;
        };
        return getLatestDate(b) - getLatestDate(a);
    });

    return result;
  }, [orders, type, searchQuery]);
  
  const canEdit = userRole === UserRole.MANAGEMENT || userRole === UserRole.ADMIN;
  const isAdmin = userRole === UserRole.ADMIN;

  // ... (materialOptions, settings load, persistence)
  
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

  // Initialize company for non-admins
  useEffect(() => {
      if (!isAdmin && userCompanyId) {
          setTargetCompanyId(userCompanyId);
      }
  }, [isAdmin, userCompanyId]);

  // Persistence for Order Fields
  useEffect(() => {
    if (editingOrderId) return; 
    const savedRows = localStorage.getItem('draft_rows');
    const savedTitle = localStorage.getItem('draft_title');
    const savedPep = localStorage.getItem('draft_pep');
    const savedAddress = localStorage.getItem('draft_address');
    const savedDate = localStorage.getItem('draft_date');
    
    if (savedRows) {
        try { setManualRows(JSON.parse(savedRows)); } catch(e){}
    }
    if (savedTitle) setOrderTitle(savedTitle);
    if (savedPep) setPep(savedPep);
    if (savedAddress) setAddress(savedAddress);
    if (savedDate) setDueDate(savedDate);
  }, [editingOrderId]);

  useEffect(() => {
    if (editingOrderId) return; 
    localStorage.setItem('draft_rows', JSON.stringify(manualRows));
  }, [manualRows, editingOrderId]);

  useEffect(() => {
    if (editingOrderId) return;
    localStorage.setItem('draft_title', orderTitle);
    localStorage.setItem('draft_pep', pep);
    localStorage.setItem('draft_address', address);
    localStorage.setItem('draft_date', dueDate);
  }, [orderTitle, pep, address, dueDate, editingOrderId]);

  const clearDraft = () => {
      localStorage.removeItem('draft_rows');
      localStorage.removeItem('draft_title');
      localStorage.removeItem('draft_pep');
      localStorage.removeItem('draft_address');
      localStorage.removeItem('draft_date');
      resetForm();
  };

  const resetForm = () => {
      setManualRows([{sku: '', qty: '', unit: 'UN', category: '', customCategory: '', isCustom: false, customDesc: '', similarityChecked: false}]);
      setOrderTitle('');
      setPep('');
      setAddress('');
      setDueDate('');
      setPendingItems([]);
      setCreationStep('INITIAL');
      setEditingOrderId(null);
      setExpandedRowIndex(0);
      setFormErrors({ rows: [], duplicateCustom: [], invalidSkus: [], unchecked: [], missingCategory: [] });
      if (isAdmin) setTargetCompanyId('');
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

  // NEW LOGIC: Calculate "Available Stock" considering other open orders
  const getReservedCount = (sku: string, excludeOrderId?: string) => {
      let reserved = 0;
      orders.forEach(order => {
          // Skip the order currently being edited (if any) or orders that are completed
          if (order.id === excludeOrderId || order.status === 'COMPLETED') return;
          
          order.items.forEach(item => {
              if (item.sku === sku && !item.isCustom) {
                  reserved += item.quantity;
              }
          });
      });
      return reserved;
  };

  const getMaterialDescription = (sku: string): string => {
      const masterItem = masterList.find(m => m.sku === sku);
      if (masterItem) return masterItem.description;
      const stockItem = stock.find(s => s.sku === sku);
      if (stockItem) return stockItem.description;
      return "Material Desconhecido";
  };
  
  const isKnownSku = (sku: string) => {
     return materialOptions.some(opt => opt.sku === sku);
  };

  const getSuggestions = (input: string) => {
    if (!input || input.length < 2) return [];
    const normalizedInput = normalizeText(input);
    return materialOptions.filter(opt => 
        normalizeText(opt.sku).includes(normalizedInput) || 
        normalizeText(opt.desc).includes(normalizedInput)
    ).slice(0, 50); 
  };

  // ... (import logic, validation logic, similarity logic, submit logic... unchanged)
  
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
              similarityChecked: isKnown
          };
      });

      let currentRows = [...manualRows];
      if (currentRows.length === 1 && !currentRows[0].sku && !currentRows[0].customDesc) {
          currentRows = [];
      }

      setManualRows([...currentRows, ...newRows]);
      setImportModalOpen(false);
      setImportText('');
      setMessage({ type: 'success', text: `${newRows.length} itens importados com sucesso. Verifique se há itens novos (customizados).` });
  };
  
  const validateForm = (): boolean => {
      const errors: number[] = [];
      const duplicateErrors: number[] = [];
      const invalidSkus: number[] = [];
      const uncheckedErrors: number[] = [];
      const missingCategoryErrors: number[] = [];
      let isTitleValid = orderTitle.trim().length > 0;
      let isCompanyValid = !!targetCompanyId;
      let isDateValid = !!dueDate;
      
      manualRows.forEach((row, idx) => {
          const qty = Number(row.qty);
          if (qty <= 0) errors.push(idx);
          else if (row.isCustom) {
              if (!row.customDesc) {
                  errors.push(idx);
              } else {
                  if (!row.similarityChecked) {
                      uncheckedErrors.push(idx);
                  }
                  if (!row.category) {
                      missingCategoryErrors.push(idx);
                  } else if (row.category === '_OTHER_' && !row.customCategory.trim()) {
                      missingCategoryErrors.push(idx);
                  }
                  
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
                  invalidSkus.push(idx);
              }
          }
      });

      setFormErrors({
          title: !isTitleValid,
          company: !isCompanyValid,
          date: !isDateValid,
          rows: errors,
          duplicateCustom: duplicateErrors,
          invalidSkus: invalidSkus,
          unchecked: uncheckedErrors,
          missingCategory: missingCategoryErrors
      });

      return isTitleValid && isCompanyValid && isDateValid && errors.length === 0 && duplicateErrors.length === 0 && invalidSkus.length === 0 && uncheckedErrors.length === 0 && missingCategoryErrors.length === 0;
  };

  const addManualRow = () => {
     if (!validateForm()) {
         setMessage({ type: 'error', text: "Preencha e verifique o item atual antes de adicionar outro." });
         return;
     }

     const nextIdx = manualRows.length;
     setManualRows([...manualRows, { sku: '', qty: '', unit: 'UN', category: '', customCategory: '', isCustom: false, customDesc: '', similarityChecked: false }]);
     setExpandedRowIndex(nextIdx);
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

    const candidates = masterList
        .map(m => ({ ...m, score: calculateRelevance(m.description, query) }))
        .filter(m => m.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 10); 

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
          unit: 'UN',
          category: '', 
          similarityChecked: true 
      };
      setManualRows(newRows);
      
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
      const currentText = newRows[similarityTargetIdx].isCustom 
          ? newRows[similarityTargetIdx].customDesc 
          : newRows[similarityTargetIdx].sku;

      newRows[similarityTargetIdx] = {
          ...newRows[similarityTargetIdx],
          sku: '',
          isCustom: true,
          customDesc: currentText,
          similarityChecked: true 
      };
      setManualRows(newRows);

       const newErrors = {...formErrors};
       newErrors.invalidSkus = newErrors.invalidSkus?.filter(i => i !== similarityTargetIdx);
       newErrors.unchecked = newErrors.unchecked?.filter(i => i !== similarityTargetIdx);
       setFormErrors(newErrors);

      setSimilarityModalOpen(false);
  };

  const handleManualNext = () => {
    if (!validateForm()) {
        const unchecked = manualRows.some(r => r.isCustom && !r.similarityChecked);
        const missingCat = manualRows.some((r) => r.isCustom && (!r.category || (r.category === '_OTHER_' && !r.customCategory)));
        const hasDuplicates = manualRows.some((row, idx) => {
             return row.isCustom && row.customDesc && masterList.some(m => normalizeText(m.description) === normalizeText(row.customDesc));
        });
        const hasInvalidSkus = manualRows.some((row) => !row.isCustom && row.sku && !isKnownSku(row.sku));
        const missingCompany = !targetCompanyId;
        const missingDate = !dueDate;

        if (missingCompany) {
             setMessage({ type: 'error', text: "Selecione a empresa para este pedido." });
        } else if (missingDate) {
             setMessage({ type: 'error', text: "A data de levantamento é obrigatória." });
        } else if (unchecked) {
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
                const catObj = categories.find(c => c.code === row.category);
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
          category: item.category ? item.category.split(' - ')[0] : '', 
          customCategory: '', 
          isCustom: !!item.isCustom,
          customDesc: item.isCustom ? item.description.replace('(Novo) ', '') : '',
          similarityChecked: true 
      }));

      setManualRows(rows);
      setOrderTitle(order.title);
      setPep(order.pep || '');
      setAddress(order.address || '');
      setDueDate(order.dueDate);
      setEditingOrderId(order.id);
      setTargetCompanyId(order.companyId || (isAdmin ? '' : (userCompanyId || '')));
      setCreationStep('INITIAL');
      setExpandedRowIndex(0);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const generateChangeLog = (oldOrder: Order, newItems: OrderLineItem[], newDate: string, newTitle: string): ChangeLogEntry => {
      const changes: string[] = [];
      if (oldOrder.title !== newTitle) changes.push(`Título alterado.`);
      if (oldOrder.dueDate !== newDate) changes.push(`Data alterada para ${newDate}.`);

      const oldMap = new Map<string, number>((oldOrder.items || []).map(i => [i.isCustom ? `CUST:${i.description}` : i.sku, i.quantity]));
      const newMap = new Map<string, number>(newItems.map(i => [i.isCustom ? `CUST:${i.description}` : i.sku, i.quantity]));

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

  const getSuggestedCode = (categoryCode: string) => {
       const prefix = categoryCode.toUpperCase();
       const regex = new RegExp(`^${prefix}\\d{4}$`);
       
       let max = 0;
       
       masterList.forEach(m => {
           if(regex.test(m.sku)) {
               const num = parseInt(m.sku.substring(3), 10);
               if(num > max) max = num;
           }
       });

       stock.forEach(s => {
           if(regex.test(s.sku)) {
               const num = parseInt(s.sku.substring(3), 10);
               if(num > max) max = num;
           }
       });

       return `${prefix}${String(max + 1).padStart(4, '0')}`;
  };

  const submitOrder = async () => {
    // ... (existing implementation)
    if (!dueDate) {
        setFormErrors(prev => ({ ...prev, date: true }));
        setMessage({ type: 'error', text: "A data de levantamento é obrigatória." });
        return;
    }

    if (!targetCompanyId) {
        setMessage({ type: 'error', text: "Empresa não identificada. Se você é admin, selecione a empresa." });
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
                pep: pep,
                address: address,
                dueDate: dueDate,
                items: pendingItems, 
                companyId: targetCompanyId, 
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
                pep: pep,
                address: address,
                creator: currentUsername,
                status: 'OPEN',
                dateCreated: new Date().toISOString(),
                dueDate: dueDate,
                items: pendingItems.map(i => ({...i, quantityPicked: 0})),
                companyId: targetCompanyId 
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
                        
                        const currentStock = getStockCount(item.sku);
                        const reservedStock = getReservedCount(item.sku, newOrder.id); // Exclude self if editing, but this is new order so id not in list yet
                        const availableStock = Math.max(0, currentStock - reservedStock);
                        
                        // It is missing if what we need is greater than what is free
                        return item.quantity > availableStock;
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
                        body += `Falta de stock (Total ou Parcial):\n`;
                        missingStockItems.forEach(item => {
                            const currentStock = getStockCount(item.sku);
                            const reservedStock = getReservedCount(item.sku);
                            const availableStock = Math.max(0, currentStock - reservedStock);
                            
                            const missingQty = Math.max(0, item.quantity - availableStock);

                            body += `Referência: ${item.sku}\n`;
                            body += `Descrição: ${item.description}\n`;
                            body += `Stock Físico: ${currentStock} | Reservado: ${reservedStock} | Disponível: ${availableStock}\n`;
                            body += `Necessário encomendar: ${missingQty}\n\n`;
                        });
                    }

                    if (newMaterialItems.length > 0) {
                        hasAlerts = true;
                        body += `Necessário criar código:\n`;
                        newMaterialItems.forEach(item => {
                            const uom = unitOptions.find(u => u.value === item.unit);
                            const unitDesc = uom ? `${item.unit} (${uom.description})` : item.unit;

                            let suggestedCode = "A Definir";
                            if (item.category) {
                                const catParts = item.category.split(' - ');
                                const catCode = catParts[0];
                                const isStandard = categories.some(c => c.code === catCode);
                                if (isStandard) {
                                    suggestedCode = getSuggestedCode(catCode);
                                }
                            }

                            body += `Referência Sugerida: ${suggestedCode}\n`;
                            body += `Descrição: ${item.description}\n`;
                            if (item.category) {
                                body += `Categoria: ${item.category}\n`;
                            }
                            body += `Necessário encomendar: ${item.quantity}\n`;
                            
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
                         const subject = `Novo Pedido: ${orderTitle} (${currentUsername})`;
                         let simpleBody = `${greeting},\n\nNovo pedido criado por ${currentUsername}.\nObra: ${orderTitle}\nData: ${new Date(dueDate).toLocaleDateString()}\n\nTodos os itens possuem stock disponível.\n\nCumprimentos`;
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
  
  const toArray = (data: any) => {
      if(!data) return [];
      if(Array.isArray(data)) return data;
      return Object.values(data);
  };

  const getPickedQtyForSku = (order: Order, sku: string): number => {
    const pickedList = toArray(order.pickedItems);
    if (pickedList.length > 0) {
        const cleanSku = sku.trim().toLowerCase();
        return pickedList
            .filter((p: any) => (p.material || '').trim().toLowerCase() === cleanSku)
            .reduce((sum: number, p: any) => sum + (Number(p.pickedQty) || 0), 0);
    }
    return 0;
  };

  const getTotalPickedQuantity = (order: Order, allOrders: Order[], sku: string): number => {
     let total = getPickedQtyForSku(order, sku);
     const children = allOrders.filter(o => o.originalOrderId === order.id && o.status === 'COMPLETED');
     children.forEach(child => {
        total += getPickedQtyForSku(child, sku);
     });
     return total;
  };

  const handleFinishOrder = async (order: Order) => {
      if(!window.confirm("Confirmar a entrega deste pedido? Isso irá marcar como CONCLUÍDO.")) return;
      
      setIsProcessing(true);
      try {
          // 1. Check settings
          const settings = await StorageService.getSettings();
          
          // 2. If auto-decrement is on, deduct stock based on PICKED items (or requested if no picking logic used yet)
          if (settings.autoDecrementStock) {
              const itemsToDeduct = toArray(order.pickedItems);
              if (itemsToDeduct.length > 0) {
                  await StorageService.decrementStock(itemsToDeduct);
              } else {
                  const virtualPicked = order.items.map(i => ({
                      material: i.sku,
                      pickedQty: i.quantity // Full fulfillment assumed if no specific log
                  }));
                  await StorageService.decrementStock(virtualPicked);
              }
          }

          // 3. Update Status
          const finishedOrder: Order = {
              ...order,
              status: 'COMPLETED',
              changeLog: [...(order.changeLog || []), {
                  date: new Date().toISOString(),
                  actor: currentUsername,
                  details: 'Pedido marcado como entregue/concluído.'
              }]
          };
          
          await StorageService.updateOrder(finishedOrder);
          
          // Refresh to calc backorders
          refreshData();
          setMessage({ type: 'success', text: "Pedido finalizado e stock atualizado." });

      } catch (err: any) {
          setMessage({ type: 'error', text: err.message });
      } finally {
          setIsProcessing(false);
      }
  };

  const downloadExcel = (order: Order) => {
      // ... (existing logic)
      const pickedList = toArray(order.pickedItems);
      if (pickedList.length === 0) {
          alert("Este pedido não tem itens processados para exportar.");
          return;
      }

      const headers = ["Itm", "C", "I", "Cen.", "Depósito de saída", "Depósito", "Material", "Texto breve", "Lote", "Qtd.pedido", "Dt.remessa"];
      const data = pickedList.map((item: any, idx: number) => {
          return [
              (idx + 1) * 10, 
              "P", 
              "", 
              "1700", 
              "0001", 
              "0004", 
              item.material, 
              "", 
              item.bin || "", 
              item.pickedQty, 
              new Date().toLocaleDateString('pt-PT') 
          ];
      });

      const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Síntese");

      const detailData = [
          ["PEP", order.pep || ""],
          ["Morada", order.address || ""]
      ];
      const wsDetail = XLSX.utils.aoa_to_sheet(detailData);
      XLSX.utils.book_append_sheet(wb, wsDetail, "Detalhe");
      
      const fileName = `Pedido_${order.displayId}_${order.title.replace(/\s+/g, '_')}.xlsx`;
      XLSX.writeFile(wb, fileName);
  };

  const FinalizeOrderForm = () => (
    <div className="space-y-4 animate-fade-in bg-slate-50 dark:bg-slate-900 p-6 rounded-lg border border-slate-200 dark:border-slate-700">
        {/* ... (existing form) ... */}
        <h4 className="font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-2 mb-4">
            {editingOrderId ? 'Salvar Alterações' : 'Finalizar Pedido'}
        </h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {targetCompanyId && (
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Empresa</label>
                    <div className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <Building className="w-4 h-4"/>
                        {companies.find(c => c.id === targetCompanyId)?.name || "Empresa Desconhecida"}
                    </div>
                </div>
            )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Título do Pedido</label>
                <div className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                    {orderTitle}
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Data Levantamento</label>
                <div className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                    {dueDate ? new Date(dueDate).toLocaleDateString() : 'N/A'}
                </div>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pep && (
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">PEP / Obra</label>
                    <div className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                        {pep}
                    </div>
                </div>
            )}
            {address && (
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Morada de Entrega</label>
                    <div className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                        {address}
                    </div>
                </div>
            )}
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
                {/* ... existing modal code ... */}
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
          {/* ... (existing form body) ... */}
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
                {/* ... existing form inputs ... */}
                <div className="space-y-3 animate-fade-in">
                    {/* Admin Company Selector */}
                    {isAdmin && (
                        <div className="mb-4 bg-purple-50 dark:bg-purple-900/20 p-3 rounded-lg border border-purple-100 dark:border-purple-800">
                            <label className={`block text-xs font-bold uppercase mb-1 flex items-center gap-1 ${formErrors.company ? 'text-red-600' : 'text-purple-800 dark:text-purple-300'}`}>
                                <Building className="w-3 h-3" /> Selecionar Empresa (Admin) {formErrors.company && '*'}
                            </label>
                            <select 
                                value={targetCompanyId}
                                onChange={(e) => {
                                    setTargetCompanyId(e.target.value);
                                    if(formErrors.company) setFormErrors({...formErrors, company: false});
                                }}
                                className={`w-full p-2 border rounded-md text-sm outline-none dark:bg-slate-900 dark:text-white ${formErrors.company ? 'border-red-500' : 'border-purple-200 dark:border-purple-700'}`}
                            >
                                <option value="">Selecione a empresa...</option>
                                {companies.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                        {/* Title and Date Inputs (Same as before) */}
                        <div className="md:col-span-2">
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
                        <div>
                            <label className={`block text-xs font-semibold mb-1 ${formErrors.date ? 'text-red-600' : 'text-slate-500 dark:text-slate-400'}`}>
                                Data Levantamento {formErrors.date && '*'}
                            </label>
                            <input 
                                type="date"
                                value={dueDate}
                                min={getMinDate()}
                                onChange={handleDateChange}
                                className={`w-full p-3 border rounded-md shadow-sm outline-none transition-all dark:bg-slate-900 dark:text-white dark:[color-scheme:dark] ${formErrors.date ? 'border-red-500 ring-1 ring-red-200 bg-red-50 dark:bg-red-900/20' : 'border-slate-300 focus:ring-2 focus:ring-brand-500 dark:border-slate-600'}`}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className="block text-xs font-semibold mb-1 text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                <Hash className="w-3 h-3" /> PEP / Obra
                            </label>
                            <input 
                                type="text"
                                value={pep}
                                onChange={e => setPep(e.target.value)}
                                placeholder="Código PEP"
                                className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm outline-none dark:bg-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold mb-1 text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                <MapPin className="w-3 h-3" /> Morada / Local
                            </label>
                            <input 
                                type="text"
                                value={address}
                                onChange={e => setAddress(e.target.value)}
                                placeholder="Local de entrega"
                                className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm outline-none dark:bg-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                            />
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
                            
                            // Get Custom Suggestions for current input
                            const suggestions = !row.isCustom && row.sku ? getSuggestions(row.sku) : [];

                            return (
                                <div 
                                    key={idx} 
                                    className={`rounded-lg border transition-all duration-200 overflow-hidden ${
                                        isError || isDuplicate || isInvalidSku || isUnchecked || isMissingCat ? 'border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-800' : 
                                        isExpanded ? 'border-brand-200 bg-slate-50 dark:bg-slate-800 shadow-md ring-1 ring-brand-100 dark:ring-brand-900' : 'border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                                    }`}
                                >
                                    {/* ... Header ... */}
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
                                            {/* ... Toggle Buttons ... */}
                                            <div className="flex justify-end mb-2">
                                                {!row.isCustom ? (
                                                    <button 
                                                        onClick={() => {
                                                            const newRows = [...manualRows];
                                                            newRows[idx] = {
                                                                ...newRows[idx],
                                                                isCustom: true,
                                                                sku: '', // Clear SKU
                                                                similarityChecked: false
                                                            };
                                                            setManualRows(newRows);
                                                        }}
                                                        className="text-xs bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 px-3 py-1.5 rounded-full font-bold flex items-center gap-1 hover:bg-brand-200 dark:hover:bg-brand-900/50 transition-colors"
                                                    >
                                                        <Plus className="w-3 h-3" /> Criar Material
                                                    </button>
                                                ) : (
                                                    <button 
                                                        onClick={() => {
                                                            const newRows = [...manualRows];
                                                            newRows[idx] = {
                                                                ...newRows[idx],
                                                                isCustom: false,
                                                                customDesc: '',
                                                                category: '',
                                                                similarityChecked: false
                                                            };
                                                            setManualRows(newRows);
                                                        }}
                                                        className="text-xs bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-full font-bold flex items-center gap-1 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                                    >
                                                        <Search className="w-3 h-3" /> Buscar Existente
                                                    </button>
                                                )}
                                            </div>

                                            <div className="mb-3">
                                                {row.isCustom ? (
                                                    <div>
                                                        {/* Custom Input ... */}
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Descrição do Novo Material</label>
                                                        <div className="relative flex items-center gap-2">
                                                            <input 
                                                                type="text"
                                                                value={row.customDesc}
                                                                maxLength={40}
                                                                onChange={(e) => {
                                                                    const newRows = [...manualRows];
                                                                    newRows[idx].customDesc = e.target.value;
                                                                    newRows[idx].similarityChecked = false; 
                                                                    setManualRows(newRows);
                                                                }}
                                                                placeholder="Descreva o material..."
                                                                className={`flex-1 min-w-0 p-3 border rounded-md text-sm outline-none dark:bg-slate-900 dark:text-white ${
                                                                    (isError && !row.customDesc) || isDuplicate || isUnchecked
                                                                    ? 'border-red-500 bg-white ring-1 ring-red-200' 
                                                                    : 'border-blue-300 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700 focus:ring-2 focus:ring-blue-500'
                                                                }`}
                                                            />
                                                            {!row.similarityChecked ? (
                                                                <button 
                                                                    onClick={() => handleCheckSimilarity(idx)}
                                                                    className="flex-none px-4 py-3 bg-blue-600 text-white rounded-md font-bold text-sm whitespace-nowrap hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm"
                                                                >
                                                                    <Search className="w-4 h-4" /> Verificar
                                                                </button>
                                                            ) : (
                                                                <div className="flex-none px-3 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-md font-bold text-sm flex items-center gap-1 border border-green-200 dark:border-green-800">
                                                                    <Check className="w-4 h-4" /> Verificado
                                                                </div>
                                                            )}
                                                        </div>
                                                        
                                                        {/* Category Select using Dynamic Categories */}
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
                                                                    {categories.map(cat => (
                                                                        <option key={cat.code} value={cat.code}>
                                                                            {cat.name}
                                                                        </option>
                                                                    ))}
                                                                    <option value="_OTHER_">Outra (Digitar)</option>
                                                                </select>
                                                                <Tag className="absolute right-3 top-3 w-4 h-4 text-slate-400 pointer-events-none" />
                                                            </div>
                                                            
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
                                                        {/* Error messages */}
                                                        {isDuplicate && <p className="text-xs text-red-600 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Este material já existe na lista. Por favor, desmarque "Novo" e busque pelo nome.</p>}
                                                        {isUnchecked && <p className="text-xs text-red-600 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Validação obrigatória. Clique em "Verificar".</p>}
                                                    </div>
                                                ) : (
                                                    <div className="relative">
                                                        {/* Standard Input ... */}
                                                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Buscar Material Existente</label>
                                                        <div className="relative">
                                                            <input 
                                                                type="text" 
                                                                value={row.sku}
                                                                onChange={(e) => {
                                                                    const newRows = [...manualRows];
                                                                    newRows[idx].sku = e.target.value;
                                                                    newRows[idx].similarityChecked = false; 
                                                                    if (isInvalidSku) {
                                                                        const newErrors = {...formErrors};
                                                                        newErrors.invalidSkus = newErrors.invalidSkus?.filter(i => i !== idx);
                                                                        setFormErrors(newErrors);
                                                                    }
                                                                    setManualRows(newRows);
                                                                }}
                                                                placeholder="Código ou nome do material..."
                                                                className={`w-full p-3 border rounded-md text-sm outline-none dark:bg-slate-900 dark:text-white ${isError && !row.sku || isInvalidSku ? 'border-red-500' : 'border-slate-300 focus:ring-2 focus:ring-brand-500 dark:border-slate-600'}`}
                                                            />
                                                        </div>
                                                        {row.sku && !isKnownSku(row.sku) && suggestions.length > 0 && (
                                                            <div className="absolute z-10 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg mt-1 max-h-60 overflow-y-auto">
                                                                {suggestions.map((opt) => (
                                                                    <div 
                                                                        key={opt.sku}
                                                                        onClick={() => {
                                                                            const newRows = [...manualRows];
                                                                            newRows[idx].sku = opt.sku;
                                                                            newRows[idx].similarityChecked = false;
                                                                            setManualRows(newRows);
                                                                        }}
                                                                        className="p-3 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer border-b border-slate-100 dark:border-slate-700 last:border-0"
                                                                    >
                                                                        <div className="font-bold text-brand-600 dark:text-brand-400 text-xs">{opt.sku}</div>
                                                                        <div className="text-sm text-slate-700 dark:text-slate-300">{opt.desc}</div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                                {isInvalidSku && !row.isCustom && <p className="text-xs text-red-600 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Material não encontrado. Tente buscar pelo nome ou crie um novo.</p>}
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

                    {/* ... Action Buttons ... */}
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

                    {/* ... Submit Button ... */}
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

      {/* ... List Area ... */}
      {showList && (
        <div className="space-y-6 animate-fade-in">
           {groupedOrders.length === 0 ? (
               <div className="text-center p-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                   <div className="bg-slate-100 dark:bg-slate-700 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                       <Search className="w-8 h-8 text-slate-400" />
                   </div>
                   <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-1">Nenhum pedido encontrado</h3>
                   <p className="text-slate-500 dark:text-slate-400">Tente ajustar seus filtros ou crie um novo pedido.</p>
               </div>
           ) : (
               // ... existing list rendering ...
               groupedOrders.map((group, groupIdx) => {
                   const allOrdersInGroup = [group.root, ...group.children];
                   return (
                       <div key={group.root.id} className="relative group-container space-y-3">
                           {group.children.length > 0 && <div className="absolute left-6 top-8 bottom-8 w-0.5 bg-slate-200 dark:bg-slate-700 z-0"></div>}
                           {allOrdersInGroup.map((order, orderIdx) => {
                               const isExpanded = expandedOrderId === order.id;
                               const isInProcess = order.status === 'IN_PROCESS' || order.status === 'IN PROCESS';
                               const isCompleted = order.status === 'COMPLETED';
                               const hasBackorder = order.reopenCount && order.reopenCount > 0;
                               const isReopen = !!order.originalOrderId;
                               const isOrderFullyFulfilled = order.items.every(item => {
                                    const picked = getTotalPickedQuantity(order, orders, item.sku);
                                    return picked >= item.quantity;
                                });
                               const isGhost = type === 'OPEN' && isCompleted;

                               return (
                                   <div 
                                        key={order.id} 
                                        className={`relative z-10 bg-white dark:bg-slate-800 rounded-xl shadow-sm border transition-all ${
                                            isExpanded ? 'border-brand-200 dark:border-brand-900 ring-1 ring-brand-100 dark:ring-brand-900' : 'border-slate-200 dark:border-slate-700'
                                        } ${isGhost ? 'opacity-70 grayscale' : ''} ${isReopen ? 'ml-6' : ''}`}
                                   >
                                       {isReopen && <div className="absolute -left-6 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center"><CornerDownRight className="w-5 h-5 text-slate-300 dark:text-slate-600" /></div>}
                                       {/* ... Order Card Header ... */}
                                       <div className="p-4 cursor-pointer" onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}>
                                           <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                               <div className="flex items-start gap-4">
                                                   <div className={`p-3 rounded-full flex-shrink-0 mr-3 ${type === 'OPEN' ? (isInProcess ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400') : (isOrderFullyFulfilled ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400')}`}>
                                                       {type === 'OPEN' ? (isCompleted ? <CheckCircle className="w-6 h-6"/> : <Clock className="w-6 h-6" />) : (isOrderFullyFulfilled ? <CheckCircle className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />)}
                                                   </div>
                                                   <div className="flex-1 min-w-0">
                                                       <div className="flex items-center gap-2">
                                                           <h3 className="font-bold text-base md:text-lg text-slate-800 dark:text-white truncate">{order.title}</h3>
                                                           {hasBackorder && <span className="hidden md:inline-flex text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded-full font-bold">Reabertura ({order.reopenCount})</span>}
                                                           {isReopen && <span className="hidden md:inline-flex text-[10px] bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded-full font-bold">Derivado</span>}
                                                       </div>
                                                       <div className="flex items-center gap-2 text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-0.5 md:mt-1 overflow-x-auto whitespace-nowrap">
                                                           <span className="flex items-center gap-1 flex-shrink-0"><User className="w-3 h-3" /> {order.creator}</span>
                                                           <span className="w-1 h-1 bg-slate-300 dark:bg-slate-600 rounded-full flex-shrink-0"></span>
                                                           <span className="flex items-center gap-1 flex-shrink-0"><Calendar className="w-3 h-3" /> {new Date(order.dateCreated).toLocaleDateString()}</span>
                                                           {(order.dueDate) && (
                                                               <>
                                                                 <span className="w-1 h-1 bg-slate-300 dark:bg-slate-600 rounded-full flex-shrink-0"></span>
                                                                 <span className={`flex-shrink-0 ${new Date(order.dueDate) < new Date() && type === 'OPEN' ? 'text-red-500 font-semibold' : ''}`}>
                                                                    {type === 'OPEN' ? 'Levantar: ' : ''}{new Date(order.dueDate).toLocaleDateString()}
                                                                 </span>
                                                               </>
                                                           )}
                                                       </div>
                                                   </div>
                                               </div>
                                               <div className="flex items-center gap-3 ml-14 md:ml-0">
                                                   {isInProcess && <span className="px-3 py-1 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-xs font-bold rounded-full flex items-center gap-1 border border-amber-100 dark:border-amber-800"><Activity className="w-3 h-3 animate-pulse" /> Em Separação</span>}
                                                   {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400"/> : <ChevronDown className="w-5 h-5 text-slate-400"/>}
                                               </div>
                                           </div>
                                       </div>
                                       
                                       {isExpanded && (
                                           <div className="border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-4 animate-fade-in">
                                               {(order.pep || order.address) && (
                                                   <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-slate-500 dark:text-slate-400">
                                                       {order.pep && <div className="flex items-center gap-2"><span className="font-bold text-slate-700 dark:text-slate-300">PEP / Obra:</span><span>{order.pep}</span></div>}
                                                       {order.address && <div className="flex items-center gap-2"><span className="font-bold text-slate-700 dark:text-slate-300">Morada:</span><span>{order.address}</span></div>}
                                                   </div>
                                               )}
                                               <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden mb-4">
                                                   <div className="overflow-x-auto">
                                                        <table className="w-full text-sm text-left">
                                                            <thead className="bg-slate-100 dark:bg-slate-900 font-semibold text-slate-600 dark:text-slate-300">
                                                                <tr>
                                                                    <th className="p-3 whitespace-nowrap">Material</th>
                                                                    <th className="p-3 whitespace-nowrap">Descrição</th>
                                                                    <th className="p-3 text-right whitespace-nowrap">Qtd</th>
                                                                    {(type === 'FINISHED' || isGhost) && <th className="p-3 text-right whitespace-nowrap">Processado</th>}
                                                                    {(type === 'FINISHED' || isGhost) && <th className="p-3 whitespace-nowrap">Status</th>}
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                                                                {order.items.map((item, idx) => {
                                                                    const picked = (type === 'FINISHED' || isGhost) ? getTotalPickedQuantity(order, orders, item.sku) : 0;
                                                                    const isFullyPicked = picked >= item.quantity;
                                                                    return (
                                                                        <tr key={idx}>
                                                                            <td className="p-3 font-mono text-xs whitespace-nowrap">{item.sku}</td>
                                                                            <td className="p-3 min-w-[200px]">
                                                                                {item.description}
                                                                                {item.isCustom && <span className="ml-2 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1 rounded">Novo</span>}
                                                                            </td>
                                                                            <td className="p-3 text-right font-bold whitespace-nowrap">{item.quantity}</td>
                                                                            {(type === 'FINISHED' || isGhost) && (
                                                                                <>
                                                                                <td className="p-3 text-right font-bold whitespace-nowrap">{picked}</td>
                                                                                <td className="p-3 whitespace-nowrap">
                                                                                    {isFullyPicked ? <span className="text-green-600 dark:text-green-400 flex items-center gap-1 text-xs font-bold"><Check className="w-3 h-3"/> OK</span> : (picked === 0 ? <span className="text-red-500 dark:text-red-400 flex items-center gap-1 text-xs font-bold"><X className="w-3 h-3"/> Sem picking</span> : <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1 text-xs font-bold"><AlertTriangle className="w-3 h-3"/> Parcial</span>)}
                                                                                </td>
                                                                                </>
                                                                            )}
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                   </div>
                                               </div>
                                               {order.changeLog && order.changeLog.length > 0 && (
                                                   <div className="mb-4">
                                                       <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1">
                                                           <History className="w-3 h-3" /> Histórico:
                                                       </p>
                                                       <ul className="space-y-1 pl-4 list-disc">
                                                           {order.changeLog.map((log, logIdx) => (
                                                               <li key={logIdx} className="text-xs text-slate-500 dark:text-slate-400">
                                                                   <span className="font-semibold">{new Date(log.date).toLocaleDateString()}</span> <span className="text-slate-400">|</span> {log.actor}: {log.details}
                                                               </li>
                                                           ))}
                                                       </ul>
                                                   </div>
                                               )}
                                               
                                               {/* Action Buttons */}
                                               <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-700">
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); downloadExcel(order); }}
                                                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                                    >
                                                        <Download className="w-3 h-3" /> Excel
                                                    </button>
                                                    
                                                    {type === 'OPEN' && canEdit && (
                                                        <>
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleEditStart(order); }}
                                                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                                                            >
                                                                <Edit className="w-3 h-3" /> Editar
                                                            </button>
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleFinishOrder(order); }}
                                                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                                                            >
                                                                <CheckCircle className="w-3 h-3" /> Finalizar
                                                            </button>
                                                        </>
                                                    )}

                                                    {isAdmin && (
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteOrder(order.id); }}
                                                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                                                        >
                                                            <Trash2 className="w-3 h-3" /> Excluir
                                                        </button>
                                                    )}
                                               </div>
                                           </div>
                                       )}
                                   </div>
                               );
                           })}
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