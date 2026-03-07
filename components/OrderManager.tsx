
import React, { useState, useEffect, useMemo, useRef } from 'react';
import Fuse from 'fuse.js';
import { PORTUGAL_ZIP_CODES } from '../constants/zipCodes';
import { Order, OrderLineItem, StockItem, UserRole, MasterMaterial, ChangeLogEntry, UnitOption, Company, CategoryOption, PickedItem, User, SynonymGroup } from '../types';
import { StorageService } from '../services/storageService';
import { ParserService } from '../services/parser';
import { Upload, FileText, Loader2, CheckCircle, Clock, Plus, Trash2, ArrowRightCircle, Calendar, User as UserIcon, ChevronDown, ChevronUp, AlertTriangle, Edit, History, Activity, AlertCircle, Search, Download, Check, X, HelpCircle, Scale, Tag, FileInput, Building, CornerDownRight, MapPin, Hash, Mail, Info, ShoppingBag, Send, Camera, Image as ImageIcon, PackageCheck, Bell, RefreshCw } from 'lucide-react';

declare const XLSX: any;

interface OrderManagerProps {
  orders: Order[]; // The displayed list of orders (filtered by user access)
  allActiveOrders?: Order[]; // Full list of ALL orders for global FIFO calculation
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
  currentUser?: User; // Full user object to access supervisorId
  allUsers?: User[]; // To lookup supervisor details
  onNavigate?: (view: ViewState) => void;
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
    image?: string; // Base64 image
    inputType: 'TEXT' | 'PHOTO';
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

// Image Compression Helper
const resizeImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 800;
                const MAX_HEIGHT = 800;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx?.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.7)); // Compress to 70% quality
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
};

const OrderManager: React.FC<OrderManagerProps> = ({ orders, allActiveOrders, stock, masterList, type, mode, userRole, refreshData, currentUsername, userCompanyId, companies, categories = [], currentUser, allUsers = [], onNavigate }) => {
  // ... (existing state)
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  // Creation/Edit States
  const [creationStep, setCreationStep] = useState<'INITIAL' | 'DETAILS_PENDING'>('INITIAL');
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null); 
  
  // Manual Entry Buffer (Drafts)
  const [manualRows, setManualRows] = useState<ManualRow[]>([{sku: '', qty: '', unit: 'UN', category: '', customCategory: '', isCustom: false, customDesc: '', similarityChecked: false, inputType: 'TEXT'}]);
  const [orderTitle, setOrderTitle] = useState('');
  const [pep, setPep] = useState('');
  const [addressStreet, setAddressStreet] = useState('');
  const [addressZip, setAddressZip] = useState('');
  const [addressCity, setAddressCity] = useState('');

  const handleZipChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let val = e.target.value.replace(/[^0-9]/g, '');
      if (val.length > 7) val = val.slice(0, 7);
      
      let formatted = val;
      if (val.length > 4) {
          formatted = val.slice(0, 4) + '-' + val.slice(4);
      }
      
      setAddressZip(formatted);
      
      // Auto-fill City
      if (val.length >= 4) {
          const prefix = val.slice(0, 4);
          if (PORTUGAL_ZIP_CODES[prefix]) {
              setAddressCity(PORTUGAL_ZIP_CODES[prefix]);
          }
      }
  };

  // Company Selection for Admins
  const [targetCompanyId, setTargetCompanyId] = useState<string>('');
  
  // Import State
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importText, setImportText] = useState('');

  // UI State
  const [expandedRowIndex, setExpandedRowIndex] = useState<number>(0);
  const [formErrors, setFormErrors] = useState<{title?: boolean, date?: boolean, company?: boolean, pep?: boolean, rows: number[], duplicateCustom?: number[], invalidSkus?: number[], unchecked?: number[], missingCategory?: number[]}>({ rows: [], duplicateCustom: [], invalidSkus: [], unchecked: [], missingCategory: [] });

  // Similarity Search State
  const [similarityModalOpen, setSimilarityModalOpen] = useState(false);
  const [similarityTargetIdx, setSimilarityTargetIdx] = useState<number | null>(null);
  const [similarityResults, setSimilarityResults] = useState<MasterMaterial[]>([]);
  const [similarityStep, setSimilarityStep] = useState<'LIST' | 'CONFIRM_MATCH' | 'CONFIRM_NEW'>('LIST');
  const [selectedCandidate, setSelectedCandidate] = useState<MasterMaterial | null>(null);

  // View Image Modal
  const [viewImage, setViewImage] = useState<string | null>(null);

  // Pending Order Details (Finalization)
  const [pendingItems, setPendingItems] = useState<OrderLineItem[]>([]);
  const [dueDate, setDueDate] = useState('');
  
  // Settings Options
  const [unitOptions, setUnitOptions] = useState<UnitOption[]>([]);
  const [synonyms, setSynonyms] = useState<SynonymGroup[]>([]);

  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState({
    material: '',
    user: '',
    datePlacedStart: '',
    datePlacedEnd: '',
    dateDueStart: '',
    dateDueEnd: '',
    pep: ''
  });

  const activeFiltersCount = useMemo(() => {
    let count = 0;
    if (advancedFilters.material) count++;
    if (advancedFilters.user) count++;
    if (advancedFilters.datePlacedStart) count++;
    if (advancedFilters.datePlacedEnd) count++;
    if (advancedFilters.dateDueStart) count++;
    if (advancedFilters.dateDueEnd) count++;
    if (advancedFilters.pep) count++;
    return count;
  }, [advancedFilters]);

  // --- FIFO ALLOCATION LOGIC ---
  const allocationMap = useMemo(() => {
        // Use Global list if provided (for correct FIFO across companies), else fall back to local list
        const processingOrders = allActiveOrders || orders;
        
        // 1. Snapshot Stock (SUMMED UP)
        const stockState = new Map<string, number>();
        stock.forEach(s => {
            const current = stockState.get(s.sku) || 0;
            stockState.set(s.sku, current + s.quantity);
        });

        // 2. Filter Active Orders & Sort Oldest -> Newest
        const active = processingOrders
            .filter(o => ['OPEN', 'IN_PROCESS', 'IN PROCESS', 'PENDING', 'PENDING_APPROVAL'].includes(o.status))
            .sort((a, b) => new Date(a.dateCreated).getTime() - new Date(b.dateCreated).getTime());

        // 3. Output Maps
        const orderStatus = new Map<string, 'FULL' | 'PARTIAL' | 'NONE'>();
        const itemAllocations = new Map<string, number>(); // Key: orderId_sku -> qty

        active.forEach(order => {
            let fullyCovered = true;
            let partiallyCovered = false;
            let hasRequirements = false;

            order.items.forEach(item => {
                if (item.isCustom || !item.sku) return;
                
                hasRequirements = true;
                const needed = item.quantity;
                const currentStock = stockState.get(item.sku) || 0;

                if (currentStock >= needed) {
                    // Fully allocated
                    stockState.set(item.sku, currentStock - needed);
                    itemAllocations.set(`${order.id}_${item.sku}`, needed);
                    partiallyCovered = true;
                } else if (currentStock > 0) {
                    // Partial allocation
                    stockState.set(item.sku, 0);
                    itemAllocations.set(`${order.id}_${item.sku}`, currentStock);
                    fullyCovered = false;
                    partiallyCovered = true;
                } else {
                    // No allocation
                    itemAllocations.set(`${order.id}_${item.sku}`, 0);
                    fullyCovered = false;
                }
            });

            if (!hasRequirements) {
                // If only custom items, treat as OK/FULL for stock purposes? 
                // Or maybe 'NONE'? Let's assume FULL if no stock items block it.
                orderStatus.set(order.id, 'FULL');
            } else if (fullyCovered) {
                orderStatus.set(order.id, 'FULL');
            } else if (partiallyCovered) {
                orderStatus.set(order.id, 'PARTIAL');
            } else {
                orderStatus.set(order.id, 'NONE');
            }
        });

        return { orderStatus, itemAllocations };
  }, [orders, allActiveOrders, stock]);

  const getAllocatedQty = (orderId: string, sku: string) => {
      return allocationMap.itemAllocations.get(`${orderId}_${sku}`) || 0;
  };

  // --- ORDER ISSUES CALCULATOR ---
  const getOrderIssues = (order: Order) => {
      const missing: any[] = [];
      const exhausting: any[] = [];
      const custom: any[] = [];

      order.items.forEach(item => {
          if (item.isCustom) {
              custom.push(item);
              return;
          }
          if (!item.sku) return;

          // Use current physical stock from props
          const phys = stock.filter(s => s.sku === item.sku).reduce((a,b) => a + b.quantity, 0);
          
          if (phys < item.quantity) {
              missing.push({ ...item, physical: phys, diff: item.quantity - phys });
          } else if (phys === item.quantity) {
              exhausting.push({ ...item, physical: phys });
          }
      });

      return { missing, exhausting, custom, hasIssues: missing.length > 0 || custom.length > 0 || exhausting.length > 0 };
  };

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
            const isRootActive = group.root.status === 'OPEN' || group.root.status === 'IN_PROCESS' || group.root.status === 'IN PROCESS' || group.root.status === 'PENDING' || group.root.status === 'PENDING_APPROVAL';
            const hasActiveChild = group.children.some(c => c.status === 'OPEN' || c.status === 'IN_PROCESS' || c.status === 'IN PROCESS' || c.status === 'PENDING' || c.status === 'PENDING_APPROVAL');
            return isRootActive || hasActiveChild;
        });
    } else {
        // FINISHED VIEW: Show group if the ROOT is completed.
        // We will hide active children in the render loop.
        result = result.filter(group => {
            return group.root.status === 'COMPLETED';
        });
    }

    // 4. Advanced Search Filter
    if (activeFiltersCount > 0) {
        result = result.filter(group => {
            const root = group.root;
            const children = group.children;
            const allOrders = [root, ...children];

            // Material Filter
            if (advancedFilters.material) {
                const q = advancedFilters.material.toLowerCase();
                const hasMaterial = allOrders.some(o => 
                    o.items.some(i => 
                        (i.sku || '').toLowerCase().includes(q) || 
                        (i.description || '').toLowerCase().includes(q)
                    )
                );
                if (!hasMaterial) return false;
            }

            // User Filter
            if (advancedFilters.user) {
                const q = advancedFilters.user.toLowerCase();
                const hasUser = allOrders.some(o => (o.creator || '').toLowerCase().includes(q));
                if (!hasUser) return false;
            }

            // PEP Filter
            if (advancedFilters.pep) {
                const q = advancedFilters.pep.toLowerCase();
                const hasPep = allOrders.some(o => (o.pep || '').toLowerCase().includes(q));
                if (!hasPep) return false;
            }

            // Date Placed Range
            if (advancedFilters.datePlacedStart) {
                const start = new Date(advancedFilters.datePlacedStart).setHours(0,0,0,0);
                const hasValidDate = allOrders.some(o => new Date(o.dateCreated).getTime() >= start);
                if (!hasValidDate) return false;
            }
            if (advancedFilters.datePlacedEnd) {
                const end = new Date(advancedFilters.datePlacedEnd).setHours(23,59,59,999);
                const hasValidDate = allOrders.some(o => new Date(o.dateCreated).getTime() <= end);
                if (!hasValidDate) return false;
            }

            // Date Due Range
            if (advancedFilters.dateDueStart) {
                const start = new Date(advancedFilters.dateDueStart).setHours(0,0,0,0);
                const hasValidDate = allOrders.some(o => o.dueDate && new Date(o.dueDate).getTime() >= start);
                if (!hasValidDate) return false;
            }
            if (advancedFilters.dateDueEnd) {
                const end = new Date(advancedFilters.dateDueEnd).setHours(23,59,59,999);
                const hasValidDate = allOrders.some(o => o.dueDate && new Date(o.dueDate).getTime() <= end);
                if (!hasValidDate) return false;
            }

            return true;
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
  }, [orders, type, advancedFilters, activeFiltersCount]);
  
  const canEdit = userRole === UserRole.MANAGEMENT || userRole === UserRole.ADMIN;
  const canApprove = userRole === UserRole.MANAGEMENT || userRole === UserRole.ADMIN;
  const isAdmin = userRole === UserRole.ADMIN;
  const isTechnical = userRole === UserRole.TECHNICAL;

  // ... (materialOptions, settings load, persistence)
  
  const materialOptions = useMemo(() => {
    const optionsMap = new Map<string, string>();
    masterList.forEach(m => optionsMap.set(m.sku, m.description));
    stock.forEach(s => {
        if (!optionsMap.has(s.sku)) optionsMap.set(s.sku, s.description);
    });
    return Array.from(optionsMap.entries()).map(([sku, desc]) => {
        // Create normalized SKU for fuzzy matching (e.g. ACC0168 -> ACC168)
        // Removes leading zeros from the numeric part if present
        const normalizedSku = sku.replace(/^([A-Z]+)0+(\d+)$/, '$1$2');
        
        // Enrich with synonyms
        let keywords = '';
        if (synonyms.length > 0) {
            const descLower = desc.toLowerCase();
            synonyms.forEach(group => {
                const hasMatch = group.words.some(word => descLower.includes(word.toLowerCase()));
                if (hasMatch) {
                    keywords += ' ' + group.words.join(' ');
                }
            });
        }

        return { sku, desc, normalizedSku, keywords };
    });
  }, [masterList, stock, synonyms]);

  const fuse = useMemo(() => {
      return new Fuse(materialOptions, {
          keys: ['sku', 'desc', 'normalizedSku', 'keywords'],
          threshold: 0.3, // 0.0 = exact match, 1.0 = match anything. 0.3 is good for typos.
          ignoreLocation: true, // Search anywhere in the string
          minMatchCharLength: 2,
          shouldSort: true
      });
  }, [materialOptions]);

  // Load Settings for Units and Synonyms
  useEffect(() => {
      const loadOpts = async () => {
          const settings = await StorageService.getSettings();
          if (settings.unitOptions && settings.unitOptions.length > 0) {
              setUnitOptions(settings.unitOptions);
          } else {
              setUnitOptions([{ value: "UN", description: "Unidade" }]); // Fallback
          }
          if (settings.synonyms) {
              setSynonyms(settings.synonyms);
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
    const savedStreet = localStorage.getItem('draft_street');
    const savedZip = localStorage.getItem('draft_zip');
    const savedCity = localStorage.getItem('draft_city');
    const savedDate = localStorage.getItem('draft_date');
    
    if (savedRows) {
        try { setManualRows(JSON.parse(savedRows)); } catch(e){}
    }
    if (savedTitle) setOrderTitle(savedTitle);
    if (savedPep) setPep(savedPep);
    if (savedStreet) setAddressStreet(savedStreet);
    if (savedZip) setAddressZip(savedZip);
    if (savedCity) setAddressCity(savedCity);
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
    localStorage.setItem('draft_street', addressStreet);
    localStorage.setItem('draft_zip', addressZip);
    localStorage.setItem('draft_city', addressCity);
    localStorage.setItem('draft_date', dueDate);
  }, [orderTitle, pep, addressStreet, addressZip, addressCity, dueDate, editingOrderId]);

  const clearDraft = () => {
      localStorage.removeItem('draft_rows');
      localStorage.removeItem('draft_title');
      localStorage.removeItem('draft_pep');
      localStorage.removeItem('draft_street');
      localStorage.removeItem('draft_zip');
      localStorage.removeItem('draft_city');
      localStorage.removeItem('draft_date');
      resetForm();
  };

  const resetForm = () => {
      setManualRows([{sku: '', qty: '', unit: 'UN', category: '', customCategory: '', isCustom: false, customDesc: '', similarityChecked: false, inputType: 'TEXT'}]);
      setOrderTitle('');
      setPep('');
      setAddressStreet('');
      setAddressZip('');
      setAddressCity('');
      setDueDate('');
      setPendingItems([]);
      setCreationStep('INITIAL');
      setEditingOrderId(null);
      setExpandedRowIndex(0);
      setFormErrors({ rows: [], duplicateCustom: [], invalidSkus: [], unchecked: [], missingCategory: [] });
      if (isAdmin) setTargetCompanyId('');
  };

  // --- DYNAMIC DUE DATE LOGIC ---
  const minDateValue = useMemo(() => {
        const activeOrders = orders.filter(o => o.status === 'OPEN' || o.status === 'IN_PROCESS' || o.status === 'IN PROCESS' || o.status === 'PENDING' || o.status === 'PENDING_APPROVAL');
        const totalPendingLines = activeOrders.reduce((sum, order) => sum + (order.items ? order.items.length : 0), 0);

        let daysToAdd = 1;
        if (totalPendingLines > 100) daysToAdd = 5;
        else if (totalPendingLines > 60) daysToAdd = 4;
        else if (totalPendingLines > 30) daysToAdd = 3;
        else if (totalPendingLines > 10) daysToAdd = 2;

        const d = new Date();
        d.setDate(d.getDate() + daysToAdd);
        
        return { 
            dateStr: d.toISOString().split('T')[0], 
            daysAdded: daysToAdd, 
            backlog: totalPendingLines 
        };
  }, [orders]);

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

    if (val < minDateValue.dateStr) {
        alert(`Devido ao volume atual de pedidos (${minDateValue.backlog} linhas em espera), a data mínima é ${new Date(minDateValue.dateStr).toLocaleDateString()}.`);
        setDueDate('');
        return;
    }

    setDueDate(val);
    if(formErrors.date) setFormErrors({...formErrors, date: false});
  };

  const getTargetCompany = () => {
      return companies.find(c => c.id === targetCompanyId);
  };

  // --- STRICT PEP LOGIC ---
  const pepPrefix = useMemo(() => {
      const comp = getTargetCompany();
      if (!comp) return '1700'; // Default
      return comp.name.toLowerCase().includes('hotelaria') ? '2200' : '1700';
  }, [targetCompanyId, companies]);

  const getPepPlaceholder = () => {
      return `${pepPrefix}.000/000/0000`;
  };

  // Auto-set PEP prefix when company changes
  useEffect(() => {
      if (!pep) {
          setPep(pepPrefix);
      } else {
          // Switch prefix if company type changed
          const currentClean = pep.replace(/[^0-9]/g, '');
          if (currentClean.startsWith('1700') && pepPrefix === '2200') {
               setPep(pep.replace('1700', '2200'));
          } else if (currentClean.startsWith('2200') && pepPrefix === '1700') {
               setPep(pep.replace('2200', '1700'));
          }
      }
  }, [pepPrefix]);

  const handlePepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      let val = e.target.value;
      let digits = val.replace(/[^0-9]/g, '');

      // FORCE PREFIX Logic
      // If user deletes part of prefix, restore it
      if (digits.length < 4) {
          digits = pepPrefix; 
      } else if (!digits.startsWith(pepPrefix)) {
          // If user pastes/types "123", make it "1700123"
          // We assume input is the "tail" if it doesn't match head
          digits = pepPrefix + digits;
      }

      // Max Length: 4 (prefix) + 3 + 3 + 4 = 14 digits
      if (digits.length > 14) digits = digits.slice(0, 14);

      // Auto-Formatting
      let formatted = digits.slice(0, 4); // Prefix
      if (digits.length > 4) formatted += '.' + digits.slice(4, 7);
      if (digits.length > 7) formatted += '/' + digits.slice(7, 10);
      if (digits.length > 10) formatted += '/' + digits.slice(10, 14);

      setPep(formatted);
      if(formErrors.pep) setFormErrors({...formErrors, pep: false});
  };

  const validatePep = () => {
      if (!pep) return true; 
      const clean = pep.replace(/[^0-9]/g, '');
      
      // Must start with correct prefix
      if (!clean.startsWith(pepPrefix)) return false;

      // Must follow structure (though prompt says "can be shorter")
      // We check if it matches the generated format for its length
      let expectedFormat = clean.slice(0, 4);
      if (clean.length > 4) expectedFormat += '.' + clean.slice(4, 7);
      if (clean.length > 7) expectedFormat += '/' + clean.slice(7, 10);
      if (clean.length > 10) expectedFormat += '/' + clean.slice(10, 14);

      return pep === expectedFormat;
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
  
  const isKnownSku = (sku: string) => {
     return materialOptions.some(opt => opt.sku === sku);
  };

  const getSuggestions = (input: string) => {
    if (!input || input.length < 2) return [];
    
    // Use Fuse for fuzzy search with AND logic for multiple terms
    const terms = input.trim().split(/\s+/);
    const query = {
        $and: terms.map(term => ({
            $or: [
                { sku: term },
                { desc: term },
                { normalizedSku: term },
                { keywords: term }
            ]
        }))
    };
    
    const results = fuse.search(query);
    
    // Return top 500 results (increased from 50)
    return results.slice(0, 500).map(r => r.item);
  };

  // ... (Import Logic omitted for brevity, unchanged)
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
              similarityChecked: isKnown,
              inputType: 'TEXT'
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
      
      // Strict PEP Validation
      let isPepValid = true;
      if (pep) {
          isPepValid = validatePep();
      }
      
      manualRows.forEach((row, idx) => {
          const qty = Number(row.qty);
          if (qty <= 0) errors.push(idx);
          else if (row.inputType === 'PHOTO') {
              if (!row.image) errors.push(idx); // Must have image
              // Note: Photos don't need text description initially, it will be FOTO_PENDENTE
          }
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
          pep: !isPepValid,
          rows: errors,
          duplicateCustom: duplicateErrors,
          invalidSkus: invalidSkus,
          unchecked: uncheckedErrors,
          missingCategory: missingCategoryErrors
      });

      return isTitleValid && isCompanyValid && isDateValid && isPepValid && errors.length === 0 && duplicateErrors.length === 0 && invalidSkus.length === 0 && uncheckedErrors.length === 0 && missingCategoryErrors.length === 0;
  };

  const addManualRow = () => {
     if (!validateForm()) {
         setMessage({ type: 'error', text: "Preencha e verifique o item atual antes de adicionar outro." });
         return;
     }

     const nextIdx = manualRows.length;
     setManualRows([...manualRows, { sku: '', qty: '', unit: 'UN', category: '', customCategory: '', isCustom: false, customDesc: '', similarityChecked: false, inputType: 'TEXT' }]);
     setExpandedRowIndex(nextIdx);
     setMessage(null);
  };

  const handleCheckSimilarity = (idx: number) => {
    const row = manualRows[idx];
    const query = row.isCustom ? row.customDesc : row.sku; 
    
    if (!query || query.trim().length < 3) {
        alert("Digite pelo menos 3 caracteres para procurar.");
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
          similarityChecked: true,
          inputType: 'TEXT' // Ensure text mode
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

      // Handle replacing a photo placeholder with a new custom item
      const isReplacingPhoto = newRows[similarityTargetIdx].sku === 'FOTO_PENDENTE';

      newRows[similarityTargetIdx] = {
          ...newRows[similarityTargetIdx],
          sku: '',
          isCustom: true,
          customDesc: isReplacingPhoto ? '' : currentText,
          similarityChecked: true,
          inputType: 'TEXT' 
      };
      setManualRows(newRows);

       const newErrors = {...formErrors};
       newErrors.invalidSkus = newErrors.invalidSkus?.filter(i => i !== similarityTargetIdx);
       newErrors.unchecked = newErrors.unchecked?.filter(i => i !== similarityTargetIdx);
       setFormErrors(newErrors);

      setSimilarityModalOpen(false);
  };

  const handlePhotoCapture = async (idx: number, e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          try {
              const base64 = await resizeImage(file);
              const newRows = [...manualRows];
              newRows[idx] = {
                  ...newRows[idx],
                  image: base64,
                  sku: 'FOTO_PENDENTE',
                  customDesc: 'Identificação por Foto',
                  isCustom: true,
                  similarityChecked: true, // It is technically "checked" as it is a photo
                  category: '', // No category yet, blocked until resolution
              };
              setManualRows(newRows);
          } catch (err) {
              alert("Erro ao processar imagem.");
          }
      }
  };

  const handleManualNext = () => {
    if (!validateForm()) {
        // ... (Keep existing detailed checks)
        const unchecked = manualRows.some(r => r.inputType === 'TEXT' && r.isCustom && !r.similarityChecked);
        const missingCat = manualRows.some((r) => r.inputType === 'TEXT' && r.isCustom && (!r.category || (r.category === '_OTHER_' && !r.customCategory)));
        // ...
        
        if (unchecked) {
             setMessage({ type: 'error', text: "Verifique os itens novos." });
        } else if (missingCat) {
             setMessage({ type: 'error', text: "Selecione a categoria para itens novos." });
        } else {
             setMessage({ type: 'error', text: "Corrija os campos em vermelho." });
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
                sku: row.sku || 'N/A', // Could be FOTO_PENDENTE
                description: row.customDesc,
                quantity: qtyNum,
                unit: row.unit || null,
                category: finalCategory || null,
                isCustom: true,
                image: row.image || null
            });
        } else {
            items.push({
                sku: row.sku,
                description: getMaterialDescription(row.sku),
                quantity: qtyNum,
                isCustom: false,
                image: null
            });
        }
    }
    setPendingItems(items);
    setCreationStep('DETAILS_PENDING');
  };

  // ... (handleEditStart, handleResendEmail, etc. unchanged) ...
  const handleEditStart = (order: Order) => {
      const rows: ManualRow[] = (order.items || []).map(item => ({
          sku: item.isCustom && !item.image ? '' : item.sku,
          qty: item.quantity,
          unit: item.unit || 'UN',
          category: item.category ? item.category.split(' - ')[0] : '', 
          customCategory: '', 
          isCustom: !!item.isCustom,
          customDesc: item.isCustom ? item.description.replace('(Novo) ', '') : '',
          similarityChecked: true,
          image: item.image,
          inputType: item.image ? 'PHOTO' : 'TEXT'
      }));

      setManualRows(rows);
      setOrderTitle(order.title);
      setPep(order.pep || '');
      
      // Parse Address back to fields
      const addr = order.address || '';
      // Try to extract Zip (XXXX-XXX)
      const zipMatch = addr.match(/(\d{4}-\d{3})/);
      if (zipMatch) {
          const zip = zipMatch[0];
          const parts = addr.split(zip);
          setAddressStreet(parts[0].replace(/,\s*$/, '').trim());
          setAddressZip(zip);
          setAddressCity(parts[1] ? parts[1].trim() : '');
      } else {
          setAddressStreet(addr);
          setAddressZip('');
          setAddressCity('');
      }

      setDueDate(order.dueDate);
      setEditingOrderId(order.id);
      setTargetCompanyId(order.companyId || (isAdmin ? '' : (userCompanyId || '')));
      setCreationStep('INITIAL');
      setExpandedRowIndex(0);
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // TRIGGER APPROVAL AND EMAIL TO LOGISTICS
  const handleApproveOrder = async (order: Order) => {
      // CHECK FOR UNRESOLVED PHOTOS
      const hasUnresolvedPhotos = order.items.some(i => i.image && (!i.sku || i.sku === 'FOTO_PENDENTE'));
      
      if (hasUnresolvedPhotos) {
          alert("BLOQUEADO: Este pedido contém imagens por corrigir.\n\nVocê deve EDITAR o pedido e substituir as fotos por códigos de material válidos.");
          return;
      }

      if(!window.confirm("Aprovar este pedido e enviar para a logística?")) return;
      
      setIsProcessing(true);
      try {
          // 1. Update Status to OPEN
          const updatedOrder: Order = {
              ...order,
              status: 'OPEN',
              changeLog: [...(order.changeLog || []), {
                  date: new Date().toISOString(),
                  actor: currentUsername,
                  details: 'Aprovado por coordenação.'
              }]
          };
          
          await StorageService.updateOrder(updatedOrder);
          
          refreshData();
          
          // 2. Trigger Emails (Logic split for Alerts vs Standard)
          const issues = getOrderIssues(updatedOrder);
          if (issues.hasIssues) {
              // Prioritize Alert if there are issues
              await handleSendEmail(updatedOrder, 'ALERT', true);
              alert("Email de Alerta (Faltas/Novos) enviado.\n\nPor favor, envie também o email para a Logística manualmente (botão azul na lista).");
          } else {
              // Standard perfect order
              await handleSendEmail(updatedOrder, 'LOGISTICS', true);
              setMessage({ type: 'success', text: "Pedido aprovado e enviado para logística." });
          }

      } catch(err: any) {
          alert("Erro ao aprovar: " + err.message);
      } finally {
          setIsProcessing(false);
      }
  };

  const handleSendEmail = async (order: Order, type: 'LOGISTICS' | 'ALERT', skipConfirm = false) => {
      // 1. Get Recipients
      const settings = await StorageService.getSettings();
      if (!settings.emailRecipients || settings.emailRecipients.length === 0) {
          if (!skipConfirm) alert("Nenhum destinatário de e-mail configurado nas definições.");
          return;
      }

      let to = settings.emailRecipients.filter(r => r.type === 'TO').map(r => r.email).join(',');
      const cc = settings.emailRecipients.filter(r => r.type === 'CC').map(r => r.email).join(',');

      if (!to && cc) to = cc.split(',')[0]; 

      const hour = new Date().getHours();
      let greeting = "Boa noite";
      if (hour >= 5 && hour < 13) greeting = "Bom dia";
      else if (hour >= 13 && hour < 20) greeting = "Boa tarde";

      let subject = "";
      let body = "";

      if (type === 'LOGISTICS') {
          // STANDARD LOGISTICS EMAIL
          subject = `Novo Pedido: ${order.title}`;
          body = `${greeting},\n\n`;
          body += `O pedido "${order.title}" (PEP: ${order.pep || 'N/A'}) foi registado por ${order.creator} e está disponível para preparação.\n\n`;
          body += `Data Levantamento: ${new Date(order.dueDate).toLocaleDateString()}\n`;
          body += `Local: ${order.address || 'Armazém'}\n\n`;
          body += `Cumprimentos`;
      } else {
          // ALERT EMAIL (STOCK SHORTAGE / NEW ITEMS)
          const issues = getOrderIssues(order);
          
          if (!issues.hasIssues) {
              if(!skipConfirm) alert("Este pedido não tem alertas de stock ou novos materiais.");
              return;
          }

          subject = `ALERTA FALTAS: ${order.title}`;
          body = `${greeting},\n\n`;
          body += `O pedido "${order.title}" requer atenção para os seguintes itens:\n\n`;

          if (issues.missing.length > 0) {
              body += `-------------------------------------------\n`;
              body += `⚠️  ALERTA: FALTA DE STOCK\n`;
              body += `-------------------------------------------\n`;
              issues.missing.forEach((item: any) => {
                  body += `Ref: ${item.sku}\n`;
                  body += `Desc: ${item.description}\n`;
                  body += `Pedida: ${item.quantity} | Stock Físico: ${item.physical}\n`;
                  body += `Em falta: ${item.diff}\n\n`;
              });
          }

          if (issues.exhausting.length > 0) {
              body += `-------------------------------------------\n`;
              body += `ℹ️  AVISO: STOCK FICARÁ A ZERO\n`;
              body += `-------------------------------------------\n`;
              issues.exhausting.forEach((item: any) => {
                    body += `Ref: ${item.sku} - ${item.description}\n`;
                    body += `Qtd Pedida: ${item.quantity} (Igual ao Stock Físico)\n\n`;
              });
          }

          if (issues.custom.length > 0) {
              body += `-------------------------------------------\n`;
              body += `🆕  ALERTA: NECESSÁRIO CRIAR CÓDIGO\n`;
              body += `-------------------------------------------\n`;
              issues.custom.forEach((item: any) => {
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

                  body += `Ref Sugerida: ${suggestedCode}\n`;
                  body += `Desc: ${item.description}\n`;
                  if (item.category) body += `Cat: ${item.category}\n`;
                  body += `Qtd: ${item.quantity} ${unitDesc}\n\n`;
              });
          }
          body += `Cumprimentos`;
      }

      const mailtoLink = `mailto:${to}?cc=${cc}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      
      // Open Email Client
      if (skipConfirm || window.confirm(`Abrir cliente de email para enviar ${type === 'LOGISTICS' ? 'Notificação à Logística' : 'Alerta de Faltas'}?`)) {
          window.location.href = mailtoLink;
      }
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

  const triggerSupervisorEmail = (order: Order, isNew: boolean) => {
      if (!currentUser?.supervisorId) return; // No supervisor assigned

      // Find supervisor email
      const supervisor = allUsers.find(u => u.uid === currentUser.supervisorId);
      if (!supervisor || !supervisor.email) return;

      const subject = isNew 
          ? `Aprovação Necessária: Nova Requisição - ${order.title}` 
          : `Requisição Editada - ${order.title}`;
          
      const body = `Olá ${supervisor.firstName || 'Coordenador'},\n\n` +
          `O técnico ${currentUser.username} registou uma requisição (PEP: ${order.pep || 'N/A'}) que aguarda aprovação.\n` +
          `Itens: ${order.items.length}\n\n` +
          `Por favor, aceda à plataforma para validar e aprovar o pedido.\n\n` +
          `Cumprimentos`;

      const mailto = `mailto:${supervisor.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.location.href = mailto;
  };

  const submitOrder = async () => {
    // ... (Keep existing implementation)
    if (!dueDate) {
        setFormErrors(prev => ({ ...prev, date: true }));
        setMessage({ type: 'error', text: "A data de levantamento é obrigatória." });
        return;
    }

    if (!targetCompanyId) {
        setMessage({ type: 'error', text: "Empresa não identificada. Se você é admin, selecione a empresa." });
        return;
    }

    // PEP VALIDATION
    if (pep) {
        const company = companies.find(c => c.id === targetCompanyId);
        const isHotelaria = company?.name.toLowerCase().includes('hotelaria');
        const prefix = isHotelaria ? '2200' : '1700';
        
        // Allowed formats:
        // 1. XXXX.000
        // 2. XXXX.000/000
        // 3. XXXX.000/000/0000
        const pattern1 = new RegExp(`^${prefix}\\.\\d{3}$`);
        const pattern2 = new RegExp(`^${prefix}\\.\\d{3}\\/\\d{3}$`);
        const pattern3 = new RegExp(`^${prefix}\\.\\d{3}\\/\\d{3}\\/\\d{4}$`);

        if (!pattern1.test(pep) && !pattern2.test(pep) && !pattern3.test(pep)) {
            setFormErrors(prev => ({ ...prev, pep: true }));
            setMessage({ 
                type: 'error', 
                text: `Formato do PEP inválido para ${company?.name}. Deve começar por ${prefix} e seguir o formato XXXX.000, XXXX.000/000 ou XXXX.000/000/0000.` 
            });
            return;
        }
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
            
            // If editing a pending approval order, notify supervisor again
            if (isTechnical && existingOrder.status === 'PENDING_APPROVAL') {
                triggerSupervisorEmail(updatedOrder, false);
            }

            refreshData();
            resetForm();
            setMessage({ type: 'success', text: "Pedido atualizado com sucesso." });

        } else {
            // Determine Initial Status
            let initialStatus: Order['status'] = 'OPEN';
            
            if (isTechnical) {
                initialStatus = 'PENDING_APPROVAL';
            } else if (pendingItems.length === 1) {
                // Logic: If there is exactly 1 item AND (it is custom OR stock <= 0), set to PENDING
                const item = pendingItems[0];
                if (item.isCustom) {
                    initialStatus = 'PENDING';
                } else {
                    const currentStock = getStockCount(item.sku);
                    if (currentStock <= 0) {
                        initialStatus = 'PENDING';
                    }
                }
            }

            const fullAddress = `${addressStreet}, ${addressZip} ${addressCity}`.trim();

            const newOrder: Order = {
                id: Math.random().toString(36).substr(2, 9),
                displayId: 0, 
                title: orderTitle,
                pep: pep,
                address: fullAddress,
                creator: currentUsername,
                status: initialStatus,
                dateCreated: new Date().toISOString(),
                dueDate: dueDate,
                items: pendingItems,
                companyId: targetCompanyId 
            };

            await StorageService.addOrders([newOrder]);
            
            if (isTechnical) {
                // Trigger Supervisor Email
                triggerSupervisorEmail(newOrder, true);
            } else {
                // Determine which email to trigger first
                const issues = getOrderIssues(newOrder);
                if (issues.hasIssues) {
                    handleSendEmail(newOrder, 'ALERT', true);
                    // We don't trigger logistics immediately to avoid popup blocker
                    alert("Email de Alerta enviado. Por favor, envie também o email para a Logística manualmente.");
                } else {
                    handleSendEmail(newOrder, 'LOGISTICS', true);
                }
            }
            
            refreshData();
            clearDraft(); 
            if (onNavigate) {
                onNavigate('DASHBOARD');
            }
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

  const getTotalPickedQuantity = (order: Order, allOrders: Order[], sku: string): number => {
     let total = 0;
     // Helper function
     const getPicked = (o: Order) => {
         const list = toArray(o.pickedItems);
         return list.filter((p: any) => (p.material || '').trim().toLowerCase() === sku.trim().toLowerCase())
                    .reduce((s: number, p: any) => s + (Number(p.pickedQty)||0), 0);
     };
     
     total += getPicked(order);
     const children = allOrders.filter(o => o.originalOrderId === order.id && o.status === 'COMPLETED');
     children.forEach(child => {
        total += getPicked(child);
     });
     return total;
  };

  const downloadExcel = (order: Order) => {
      // ... (Keep existing implementation)
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

  // ... (FinalizeOrderForm, etc.) ...
  const FinalizeOrderForm = () => (
    <div className="space-y-4 animate-fade-in bg-slate-50 dark:bg-slate-900 p-6 rounded-lg border border-slate-200 dark:border-slate-700">
        <h4 className="font-semibold text-slate-800 dark:text-slate-200 border-b border-slate-200 dark:border-slate-700 pb-2 mb-4">
            {editingOrderId ? 'Salvar Alterações' : 'Finalizar Pedido'}
        </h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Empresa {(!targetCompanyId) && <span className="text-red-500">*</span>}</label>
                {targetCompanyId ? (
                    <div className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center gap-2">
                        <Building className="w-4 h-4"/>
                        {companies.find(c => c.id === targetCompanyId)?.name || "Empresa Desconhecida"}
                        {isAdmin && (
                            <button onClick={() => setTargetCompanyId('')} className="ml-auto text-xs text-blue-500 hover:underline">Alterar</button>
                        )}
                    </div>
                ) : (
                    <select 
                        value={targetCompanyId}
                        onChange={(e) => {
                            setTargetCompanyId(e.target.value);
                            if(formErrors.company) setFormErrors({...formErrors, company: false});
                        }}
                        className={`w-full p-2 border rounded-md text-sm outline-none dark:bg-slate-900 dark:text-white ${formErrors.company ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'}`}
                    >
                        <option value="">Selecione a empresa...</option>
                        {companies.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                )}
            </div>
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
            {(addressStreet || addressZip || addressCity) && (
                <div>
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Morada de Entrega</label>
                    <div className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                        {`${addressStreet}, ${addressZip} ${addressCity}`.trim()}
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
                        {item.image && <Camera className="w-3 h-3 text-slate-400" />}
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
                className="bg-brand-600 text-white px-6 py-2.5 rounded-lg hover:bg-brand-700 flex items-center gap-2"
            >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                {editingOrderId ? 'Salvar Edição' : (isTechnical ? 'Enviar Requisição' : 'Confirmar Pedido')}
            </button>
        </div>
    </div>
  );

  const showForm = mode === 'CREATE' || editingOrderId !== null;
  const showList = mode === 'LIST' && editingOrderId === null;

  return (
    <div className="space-y-6">
      {/* ... (Keep Datalist, Import Modal, Similarity Modal) ... */}
      <datalist id="stock-options">
        {materialOptions.map((opt) => (
            <option key={opt.sku} value={opt.sku}>{opt.desc}</option>
        ))}
      </datalist>

      {/* VIEW IMAGE MODAL */}
      {viewImage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setViewImage(null)}>
              <div className="relative max-w-4xl w-full max-h-[90vh] flex flex-col items-center">
                  <button onClick={() => setViewImage(null)} className="absolute -top-12 right-0 text-white hover:text-gray-300 p-2"><X className="w-8 h-8" /></button>
                  <img src={viewImage} alt="Detalhe Material" className="max-w-full max-h-[85vh] object-contain rounded bg-white" onClick={(e) => e.stopPropagation()} />
              </div>
          </div>
      )}

      {/* Import Modal Omitted for brevity (same as previous) */}
      {importModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg p-6 border border-slate-200 dark:border-slate-700 animate-fade-in">
                  <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-brand-600" /> Importar Lista
                  </h3>
                  <textarea
                      value={importText}
                      onChange={(e) => setImportText(e.target.value)}
                      placeholder="REFERENCIA, QUANTIDADE"
                      className="w-full h-40 p-3 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-brand-500 outline-none dark:bg-slate-900 dark:text-white font-mono text-sm"
                  />
                  <div className="flex justify-end gap-3 mt-4">
                      <button onClick={() => setImportModalOpen(false)} className="px-4 py-2 text-slate-600 dark:text-slate-400">Cancelar</button>
                      <button onClick={handleImportProcess} className="px-4 py-2 bg-brand-600 text-white rounded-lg">Processar</button>
                  </div>
              </div>
          </div>
      )}

      {/* Similarity Search Modal Omitted for brevity (same as previous) */}
      {similarityModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-fade-in border border-slate-200 dark:border-slate-700">
                {similarityStep === 'LIST' && (
                    <>
                        <div className="p-4 border-b dark:border-slate-700 flex justify-between items-center bg-slate-50 dark:bg-slate-900">
                            <h3 className="font-bold dark:text-white">Verificação</h3>
                            <button onClick={() => setSimilarityModalOpen(false)}><X className="w-6 h-6" /></button>
                        </div>
                        <div className="p-4 overflow-y-auto flex-1 dark:text-slate-300">
                            {similarityResults.map((res, idx) => (
                                <button key={idx} onClick={() => handleSelectCandidate(res)} className="w-full text-left p-3 border rounded hover:bg-brand-50 dark:hover:bg-brand-900/20 mb-2">
                                    <div className="font-bold text-brand-600">{res.sku}</div>
                                    <div className="text-sm">{res.description}</div>
                                </button>
                            ))}
                            <button onClick={handleNotFound} className="w-full py-3 bg-white dark:bg-slate-800 border text-slate-600 dark:text-slate-300 rounded mt-4">Não consta na lista</button>
                        </div>
                    </>
                )}
                {similarityStep === 'CONFIRM_MATCH' && selectedCandidate && (
                    <div className="p-6 text-center">
                        <p className="dark:text-slate-300 mb-4">Confirmar material?</p>
                        <div className="bg-slate-50 dark:bg-slate-900 p-4 rounded mb-6 text-left">
                            <p className="font-mono font-bold dark:text-white">{selectedCandidate.sku}</p>
                            <p className="text-sm dark:text-slate-300">{selectedCandidate.description}</p>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setSimilarityStep('LIST')} className="flex-1 py-2 border rounded dark:text-slate-300">Voltar</button>
                            <button onClick={handleConfirmMatch} className="flex-1 py-2 bg-green-600 text-white rounded">Sim</button>
                        </div>
                    </div>
                )}
                {similarityStep === 'CONFIRM_NEW' && (
                    <div className="p-6 text-center">
                        <p className="dark:text-slate-300 mb-6">Criar Novo Material?</p>
                        <div className="flex gap-3">
                            <button onClick={() => setSimilarityStep('LIST')} className="flex-1 py-2 border rounded dark:text-slate-300">Voltar</button>
                            <button onClick={handleConfirmNew} className="flex-1 py-2 bg-amber-600 text-white rounded">Sim</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
            {mode === 'CREATE' ? <Upload className="text-brand-500"/> : (type === 'OPEN' ? <Clock className="text-blue-500"/> : <CheckCircle className="text-green-500"/>)}
            {mode === 'CREATE' ? (isTechnical ? 'Nova Requisição' : 'Novo Pedido ao Armazém') : (type === 'OPEN' ? 'Pedidos Abertos' : 'Pedidos ao Armazém Finalizados')}
            </h2>
            
            {mode === 'LIST' && (
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
            )}
        </div>

        {/* Advanced Search Modal */}
        {mode === 'LIST' && showAdvancedSearch && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowAdvancedSearch(false)}>
                <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-4xl p-6 border border-slate-200 dark:border-slate-700 animate-fade-in" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                            <Search className="w-5 h-5 text-brand-600" /> Pesquisa Avançada
                        </h3>
                        <button onClick={() => setShowAdvancedSearch(false)} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-white">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Material (SKU/Desc)</label>
                            <input 
                                type="text" 
                                value={advancedFilters.material}
                                onChange={(e) => setAdvancedFilters({...advancedFilters, material: e.target.value})}
                                placeholder="Ex: Parafuso, ACC..."
                                className="w-full p-2 border rounded text-sm dark:bg-slate-900 dark:border-slate-600 dark:text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Utilizador</label>
                            <input 
                                type="text" 
                                value={advancedFilters.user}
                                onChange={(e) => setAdvancedFilters({...advancedFilters, user: e.target.value})}
                                placeholder="Nome do criador..."
                                className="w-full p-2 border rounded text-sm dark:bg-slate-900 dark:border-slate-600 dark:text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">PEP / Obra</label>
                            <input 
                                type="text" 
                                value={advancedFilters.pep}
                                onChange={(e) => setAdvancedFilters({...advancedFilters, pep: e.target.value})}
                                placeholder="Nº PEP..."
                                className="w-full p-2 border rounded text-sm dark:bg-slate-900 dark:border-slate-600 dark:text-white"
                            />
                        </div>
                        <div className="hidden lg:block"></div> {/* Spacer */}
                        
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Data Criação (Início)</label>
                            <input 
                                type="date" 
                                value={advancedFilters.datePlacedStart}
                                onChange={(e) => setAdvancedFilters({...advancedFilters, datePlacedStart: e.target.value})}
                                className="w-full p-2 border rounded text-sm dark:bg-slate-900 dark:border-slate-600 dark:text-white dark:[color-scheme:dark]"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Data Criação (Fim)</label>
                            <input 
                                type="date" 
                                value={advancedFilters.datePlacedEnd}
                                onChange={(e) => setAdvancedFilters({...advancedFilters, datePlacedEnd: e.target.value})}
                                className="w-full p-2 border rounded text-sm dark:bg-slate-900 dark:border-slate-600 dark:text-white dark:[color-scheme:dark]"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Data Levantamento (Início)</label>
                            <input 
                                type="date" 
                                value={advancedFilters.dateDueStart}
                                onChange={(e) => setAdvancedFilters({...advancedFilters, dateDueStart: e.target.value})}
                                className="w-full p-2 border rounded text-sm dark:bg-slate-900 dark:border-slate-600 dark:text-white dark:[color-scheme:dark]"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Data Levantamento (Fim)</label>
                            <input 
                                type="date" 
                                value={advancedFilters.dateDueEnd}
                                onChange={(e) => setAdvancedFilters({...advancedFilters, dateDueEnd: e.target.value})}
                                className="w-full p-2 border rounded text-sm dark:bg-slate-900 dark:border-slate-600 dark:text-white dark:[color-scheme:dark]"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end mt-6 gap-3 pt-4 border-t dark:border-slate-700">
                        <button 
                            onClick={() => setAdvancedFilters({
                                material: '', user: '', pep: '', 
                                datePlacedStart: '', datePlacedEnd: '', 
                                dateDueStart: '', dateDueEnd: ''
                            })}
                            className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:text-red-600 transition-colors"
                        >
                            Limpar Filtros
                        </button>
                        <button 
                            onClick={() => setShowAdvancedSearch(false)}
                            className="px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors shadow-sm"
                        >
                            Ver Resultados
                        </button>
                    </div>
                </div>
            </div>
        )}
      </div>

      {message && (
        <div className={`p-4 rounded-lg text-sm flex items-center gap-2 shadow-sm animate-fade-in ${message.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'}`}>
            {message.type === 'success' ? <CheckCircle className="w-4 h-4 text-green-600" /> : <AlertTriangle className="w-4 h-4"/>}
            {message.text}
            <button onClick={() => setMessage(null)} className="ml-auto hover:text-slate-800 dark:hover:text-white"><X className="w-4 h-4"/></button>
        </div>
      )}

      {/* CREATION/EDIT AREA */}
      {showForm && (
        <div className={`bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border ${editingOrderId ? 'border-amber-400 ring-2 ring-amber-100 dark:ring-amber-900' : 'border-brand-200 dark:border-slate-700'}`}>
          {/* ... (Existing form content code same as before until the submit section) ... */}
          {/* Re-pasting standard form UI logic */}
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
                {/* ... (Standard Inputs) ... */}
                <div className="space-y-3 animate-fade-in">
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
                                min={minDateValue.dateStr}
                                onChange={handleDateChange}
                                className={`w-full p-3 border rounded-md shadow-sm outline-none transition-all dark:bg-slate-900 dark:text-white dark:[color-scheme:dark] ${formErrors.date ? 'border-red-500 ring-1 ring-red-200 bg-red-50 dark:bg-red-900/20' : 'border-slate-300 focus:ring-2 focus:ring-brand-500 dark:border-slate-600'}`}
                            />
                            {minDateValue.daysAdded > 1 && (
                                <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                                    <Info className="w-3 h-3"/> Data ajustada pelo volume ({minDateValue.backlog} linhas).
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                            <label className={`block text-xs font-semibold mb-1 flex items-center gap-1 ${formErrors.pep ? 'text-red-600' : 'text-slate-500 dark:text-slate-400'}`}>
                                <Hash className="w-3 h-3" /> PEP / Obra {formErrors.pep && '*'}
                            </label>
                            <input 
                                type="text"
                                value={pep}
                                onChange={handlePepChange}
                                onFocus={() => {
                                    if (!pep) {
                                        const prefix = (companies.find(c => c.id === targetCompanyId)?.name.toLowerCase().includes('hotelaria')) ? '2200' : '1700';
                                        setPep(prefix);
                                    }
                                }}
                                placeholder={getPepPlaceholder()}
                                className={`w-full p-3 border rounded-md shadow-sm outline-none dark:bg-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 ${formErrors.pep ? 'border-red-500 bg-red-50 dark:bg-red-900/10' : 'border-slate-300 dark:border-slate-600'}`}
                            />
                            <p className="text-[10px] text-slate-400 mt-1 pl-1">
                                Prefixo Fixo: {getTargetCompany()?.name.toLowerCase().includes('hotelaria') ? '2200' : '1700'}
                            </p>
                        </div>
                        <div className="md:col-span-2 space-y-3">
                            <div>
                                <label className="block text-xs font-semibold mb-1 text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                    <MapPin className="w-3 h-3" /> Morada (Rua)
                                </label>
                                <input 
                                    type="text"
                                    value={addressStreet}
                                    onChange={e => setAddressStreet(e.target.value)}
                                    placeholder="Rua, Nº, Andar..."
                                    className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm outline-none dark:bg-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                                />
                            </div>
                            <div className="flex gap-3">
                                <div className="w-32">
                                    <label className="block text-xs font-semibold mb-1 text-slate-500 dark:text-slate-400">
                                        Cód. Postal
                                    </label>
                                    <input 
                                        type="text"
                                        value={addressZip}
                                        onChange={handleZipChange}
                                        placeholder="0000-000"
                                        maxLength={8}
                                        className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm outline-none dark:bg-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500 text-center tracking-widest"
                                    />
                                </div>
                                <div className="flex-1">
                                    <label className="block text-xs font-semibold mb-1 text-slate-500 dark:text-slate-400">
                                        Localidade
                                    </label>
                                    <input 
                                        type="text"
                                        value={addressCity}
                                        onChange={e => setAddressCity(e.target.value)}
                                        placeholder="Cidade / Vila"
                                        className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-md shadow-sm outline-none dark:bg-slate-900 dark:text-white focus:ring-2 focus:ring-brand-500"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Accordion Input Layout (Rows) */}
                    <div className="space-y-4">
                        {manualRows.map((row, idx) => {
                            const isExpanded = idx === expandedRowIndex;
                            const isError = formErrors.rows.includes(idx);
                            const isInvalidSku = formErrors.invalidSkus?.includes(idx);
                            const isUnchecked = formErrors.unchecked?.includes(idx);
                            const isMissingCategory = formErrors.missingCategory?.includes(idx);
                            const isDuplicate = formErrors.duplicateCustom?.includes(idx);

                            const stockQty = getStockCount(row.sku);
                            const suggestions = !row.isCustom && row.sku ? getSuggestions(row.sku) : [];
                            const isPendingPhoto = row.sku === 'FOTO_PENDENTE';

                            return (
                                <div 
                                    key={idx} 
                                    className={`rounded-lg border transition-all duration-200 overflow-hidden ${
                                        isError || isPendingPhoto || isInvalidSku || isUnchecked || isMissingCategory || isDuplicate ? (isPendingPhoto ? 'border-orange-300 bg-orange-50 dark:bg-orange-900/10' : 'border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-800') : 
                                        isExpanded ? 'border-brand-200 bg-slate-50 dark:bg-slate-800 shadow-md ring-1 ring-brand-100 dark:ring-brand-900' : 'border-slate-200 bg-white dark:bg-slate-900 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                                    }`}
                                >
                                    {/* Header */}
                                    <div 
                                        onClick={() => setExpandedRowIndex(isExpanded ? -1 : idx)}
                                        className="p-3 flex items-center justify-between cursor-pointer select-none"
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className={`text-xs font-bold uppercase ${isError || isInvalidSku || isUnchecked || isMissingCategory || isDuplicate ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>Item {idx + 1}</span>
                                            {!isExpanded && (
                                                <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate max-w-[150px] md:max-w-[300px] flex items-center gap-2">
                                                    {row.image && <Camera className="w-3 h-3 text-brand-600"/>}
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
                                            {/* Type Toggle - ALLOWED FOR TECHNICAL AND MANAGERS */}
                                            {(isTechnical || canEdit) && (
                                                <div className="flex bg-slate-200 dark:bg-slate-700 rounded-lg p-1 mb-4 w-fit">
                                                    <button
                                                        onClick={() => {
                                                            const newRows = [...manualRows];
                                                            newRows[idx].inputType = 'TEXT';
                                                            setManualRows(newRows);
                                                        }}
                                                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${row.inputType === 'TEXT' ? 'bg-white dark:bg-slate-600 shadow text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
                                                    >
                                                        Texto / Lista
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            const newRows = [...manualRows];
                                                            newRows[idx].inputType = 'PHOTO';
                                                            setManualRows(newRows);
                                                        }}
                                                        className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${row.inputType === 'PHOTO' ? 'bg-white dark:bg-slate-600 shadow text-slate-800 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
                                                    >
                                                        <Camera className="w-3 h-3"/> Fotografia
                                                    </button>
                                                </div>
                                            )}

                                            {/* Photo Input Area */}
                                            {row.inputType === 'PHOTO' ? (
                                                <div className="mb-4">
                                                    {/* NEW: Convert Button */}
                                                    <button
                                                        onClick={() => {
                                                            const newRows = [...manualRows];
                                                            newRows[idx].inputType = 'TEXT';
                                                            // Update to Existing Material Mode
                                                            newRows[idx].isCustom = false;
                                                            newRows[idx].sku = '';
                                                            newRows[idx].customDesc = '';
                                                            newRows[idx].similarityChecked = false;
                                                            
                                                            setManualRows(newRows);
                                                        }}
                                                        className="w-full py-3 bg-brand-600 text-white rounded-lg font-bold shadow-sm hover:bg-brand-700 flex items-center justify-center gap-2 mb-4 transition-colors"
                                                    >
                                                        <RefreshCw className="w-4 h-4" /> Converter em Código de Material
                                                    </button>

                                                    {row.image ? (
                                                        <div className="relative w-full h-48 bg-slate-100 dark:bg-slate-900 rounded-lg border border-slate-300 dark:border-slate-600 flex items-center justify-center overflow-hidden group">
                                                            <img src={row.image} alt="Upload" className="max-w-full max-h-full object-contain" />
                                                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                                <button 
                                                                    onClick={() => setViewImage(row.image!)}
                                                                    className="p-2 bg-white rounded-full text-slate-800 hover:bg-slate-100"
                                                                >
                                                                    <ImageIcon className="w-5 h-5" />
                                                                </button>
                                                                <button 
                                                                    onClick={() => {
                                                                        const newRows = [...manualRows];
                                                                        newRows[idx].image = undefined;
                                                                        newRows[idx].sku = '';
                                                                        newRows[idx].customDesc = '';
                                                                        newRows[idx].isCustom = false;
                                                                        setManualRows(newRows);
                                                                    }}
                                                                    className="p-2 bg-red-500 rounded-full text-white hover:bg-red-600"
                                                                >
                                                                    <Trash2 className="w-5 h-5" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-8 text-center bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors relative cursor-pointer">
                                                            <input 
                                                                type="file" 
                                                                accept="image/*" 
                                                                capture="environment"
                                                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                                onChange={(e) => handlePhotoCapture(idx, e)}
                                                            />
                                                            <Camera className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                                                            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Tirar Foto ou Carregar Imagem</p>
                                                        </div>
                                                    )}
                                                    {isPendingPhoto && (
                                                        <div className="mt-2 text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1 font-bold">
                                                            <AlertCircle className="w-3 h-3"/> Aguarda identificação pela coordenação
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                /* Text Input Logic (Original) */
                                                <>
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
                                                                <Search className="w-3 h-3" /> Procurar Existente
                                                            </button>
                                                        )}
                                                    </div>

                                                    <div className="mb-3">
                                                        {/* NEW: View Image Button if converting */}
                                                        {row.image && (
                                                            <div className="mb-2 flex justify-center">
                                                                <button
                                                                    onClick={() => setViewImage(row.image!)}
                                                                    className="text-xs flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                                                                >
                                                                    <ImageIcon className="w-3 h-3"/> Ver Foto Original
                                                                </button>
                                                            </div>
                                                        )}

                                                        {row.isCustom ? (
                                                            <div>
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
                                                                            ((isError && !row.customDesc) || isDuplicate || isUnchecked)
                                                                            ? 'border-red-500 bg-white ring-1 ring-red-200' 
                                                                            : 'border-blue-300 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-700 focus:ring-2 focus:ring-blue-500'
                                                                        }`}
                                                                    />
                                                                    {!row.similarityChecked ? (
                                                                        <button 
                                                                            onClick={() => handleCheckSimilarity(idx)}
                                                                            className={`flex-none px-4 py-3 ${isUnchecked ? 'bg-red-600 hover:bg-red-700 animate-pulse' : 'bg-blue-600 hover:bg-blue-700'} text-white rounded-md font-bold text-sm whitespace-nowrap transition-colors flex items-center gap-2 shadow-sm`}
                                                                        >
                                                                            <Search className="w-4 h-4" /> Verificar
                                                                        </button>
                                                                    ) : (
                                                                        <div className="flex-none px-3 py-2 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-md font-bold text-sm flex items-center gap-1 border border-green-200 dark:border-green-800">
                                                                            <Check className="w-4 h-4" /> Verificado
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                
                                                                <div className="mt-3">
                                                                    <label className={`block text-xs font-bold uppercase mb-1 ${isMissingCategory ? 'text-red-600' : ''}`}>Categoria Obrigatória</label>
                                                                    <div className="relative">
                                                                        <select
                                                                            value={row.category}
                                                                            onChange={(e) => {
                                                                                const newRows = [...manualRows];
                                                                                newRows[idx].category = e.target.value;
                                                                                setManualRows(newRows);
                                                                            }}
                                                                            className={`w-full p-2.5 border rounded-md text-sm outline-none appearance-none dark:bg-slate-900 dark:text-white ${isMissingCategory ? 'border-red-500 ring-1 ring-red-200' : 'border-slate-300 dark:border-slate-600'}`}
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
                                                                            className={`w-full mt-2 p-2 border rounded-md text-sm outline-none dark:bg-slate-900 dark:text-white ${isMissingCategory ? 'border-red-500' : 'border-slate-300 dark:border-slate-600'}`}
                                                                        />
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div className="relative">
                                                                <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Procurar Material Existente</label>
                                                                <div className="relative">
                                                                    <input 
                                                                        type="text" 
                                                                        value={row.sku}
                                                                        onChange={(e) => {
                                                                            const newRows = [...manualRows];
                                                                            newRows[idx].sku = e.target.value;
                                                                            newRows[idx].similarityChecked = false; 
                                                                            setManualRows(newRows);
                                                                        }}
                                                                        placeholder="Código ou nome do material..."
                                                                        className={`w-full p-3 border rounded-md text-sm outline-none dark:bg-slate-900 dark:text-white ${(isError && !row.sku) || isInvalidSku ? 'border-red-500 ring-1 ring-red-200' : 'border-slate-300 focus:ring-2 focus:ring-brand-500 dark:border-slate-600'}`}
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
                                                    </div>
                                                </>
                                            )}

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
                                                        <div className="flex flex-col text-xs">
                                                            <span className={`font-medium ${stockQty > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                                Stock: {stockQty}
                                                            </span>
                                                            {(() => {
                                                                const openQty = allActiveOrders
                                                                    .filter(o => o.status !== 'COMPLETED' && o.status !== 'REJECTED')
                                                                    .reduce((acc, o) => {
                                                                        const item = o.items.find(i => i.sku === row.sku);
                                                                        if (!item) return acc;
                                                                        
                                                                        // Calculate pending for this item
                                                                        const picked = (o.pickedItems || [])
                                                                            .filter((p: any) => p.material === row.sku)
                                                                            .reduce((sum: number, p: any) => sum + (Number(p.pickedQty) || 0), 0);
                                                                        
                                                                        return acc + Math.max(0, item.quantity - picked);
                                                                    }, 0);
                                                                
                                                                if (openQty > 0) {
                                                                    return (
                                                                        <span className="text-amber-600 dark:text-amber-400 font-medium mt-0.5">
                                                                            Em Pedidos: {openQty}
                                                                        </span>
                                                                    );
                                                                }
                                                                return null;
                                                            })()}
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

                    {/* Action Buttons */}
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

                    {/* Submit Button */}
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

      {/* List Area */}
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
               groupedOrders.map((group) => {
                   const allOrdersInGroup = [group.root, ...group.children];
                   
                   const displayedOrders = type === 'FINISHED' 
                        ? allOrdersInGroup.filter(o => o.status === 'COMPLETED')
                        : allOrdersInGroup;

                   if (displayedOrders.length === 0) return null;

                   return (
                       <div key={group.root.id} className="relative group-container space-y-4">
                           {displayedOrders.map((order, orderIdx) => {
                               const isExpanded = expandedOrderId === order.id;
                               const isInProcess = order.status === 'IN_PROCESS' || order.status === 'IN PROCESS';
                               const isPending = order.status === 'PENDING';
                               const isPendingApproval = order.status === 'PENDING_APPROVAL';
                               const isCompleted = order.status === 'COMPLETED';
                               const hasBackorder = order.reopenCount && order.reopenCount > 0;
                               const isReopen = !!order.originalOrderId;
                               const isOrderFullyFulfilled = order.items.every(item => {
                                    const picked = getTotalPickedQuantity(order, orders, item.sku);
                                    return picked >= item.quantity;
                                });
                               const isGhost = type === 'OPEN' && isCompleted;
                               
                               // Check for pending photos
                               const hasPendingPhotos = order.items.some(i => i.image && (!i.sku || i.sku === 'FOTO_PENDENTE'));

                               // FIFO Status
                               const allocationStatus = allocationMap.orderStatus.get(order.id) || 'FULL'; // Default full for completed/untracked
                               const isFullAlloc = allocationStatus === 'FULL';
                               const isPartialAlloc = allocationStatus === 'PARTIAL';

                               // CHECK ISSUES FOR BUTTONS
                               const issues = getOrderIssues(order);

                               return (
                                   <div 
                                        key={order.id} 
                                        className={`relative z-10 bg-white dark:bg-slate-800 rounded-xl shadow-sm border transition-all ${
                                            isExpanded ? 'border-brand-200 dark:border-brand-900 ring-1 ring-brand-100 dark:ring-brand-900' : 'border-slate-200 dark:border-slate-700'
                                        } ${isGhost ? 'opacity-70 grayscale' : ''} ${isReopen ? 'border-l-4 border-l-purple-400 ml-4 md:ml-8' : ''}`}
                                   >
                                       {/* Connect line for visual hierarchy */}
                                       {isReopen && (
                                            <div className="absolute -left-4 md:-left-8 top-0 bottom-0 w-4 md:w-8 border-l-2 border-b-2 border-slate-200 dark:border-slate-700 rounded-bl-xl h-1/2 -z-10" />
                                       )}

                                       {/* Order Card Header */}
                                       <div className="p-4 cursor-pointer" onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}>
                                           {isReopen && (
                                                <div className="text-xs text-purple-600 dark:text-purple-400 font-bold mb-2 flex items-center gap-1 uppercase tracking-wide">
                                                    <CornerDownRight className="w-3 h-3" /> Reabertura de Pedido
                                                </div>
                                           )}
                                           <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                               <div className="flex items-start gap-4">
                                                   <div className={`p-3 rounded-full flex-shrink-0 mr-3 ${
                                                       type === 'OPEN' 
                                                       ? (isPending ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' 
                                                          : isPendingApproval ? 'bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400'
                                                          : isInProcess ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' 
                                                          : (isFullAlloc ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' 
                                                                         : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400')) 
                                                       : (isOrderFullyFulfilled ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400')
                                                   }`}>
                                                       {type === 'OPEN' ? (
                                                            isCompleted ? <CheckCircle className="w-6 h-6"/> : 
                                                            isPending ? <ShoppingBag className="w-6 h-6"/> : 
                                                            isPendingApproval ? <FileText className="w-6 h-6"/> : 
                                                            isFullAlloc ? <PackageCheck className="w-6 h-6"/> : 
                                                            <AlertTriangle className="w-6 h-6" /> // Red if Partial/None
                                                       ) : (isOrderFullyFulfilled ? <CheckCircle className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />)}
                                                   </div>
                                                   <div className="flex-1 min-w-0">
                                                       <div className="flex items-center gap-2">
                                                           <h3 className="font-bold text-base md:text-lg text-slate-800 dark:text-white truncate">{order.title}</h3>
                                                           {hasBackorder && <span className="hidden md:inline-flex text-[10px] bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded-full font-bold">Reabertura ({order.reopenCount})</span>}
                                                       </div>
                                                       <div className="flex items-center gap-2 text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-0.5 md:mt-1 overflow-x-auto whitespace-nowrap">
                                                           <span className="flex items-center gap-1 flex-shrink-0"><UserIcon className="w-3 h-3" /> {order.creator}</span>
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
                                                   {hasPendingPhotos && (
                                                       <span className="px-3 py-1 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs font-bold rounded-full flex items-center gap-1 border border-red-100 dark:border-red-800 animate-pulse">
                                                           <Camera className="w-3 h-3" /> Imagens por Corrigir
                                                       </span>
                                                   )}
                                                   {isPending ? (
                                                       <span className="px-3 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400 text-xs font-bold rounded-full flex items-center gap-1 border border-purple-100 dark:border-purple-800">
                                                           <ShoppingBag className="w-3 h-3" /> Aguarda Compra
                                                       </span>
                                                   ) : isPendingApproval ? (
                                                       <span className="px-3 py-1 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 text-xs font-bold rounded-full flex items-center gap-1 border border-orange-100 dark:border-orange-800">
                                                           <Activity className="w-3 h-3" /> Aprovação Pendente
                                                       </span>
                                                   ) : isInProcess && (
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
                                                                    {type === 'OPEN' && !isCompleted && <th className="p-3 text-right whitespace-nowrap">Stock Alloc</th>}
                                                                    {(type === 'FINISHED' || isGhost) && <th className="p-3 text-right whitespace-nowrap">Processado</th>}
                                                                    {(type === 'FINISHED' || isGhost) && <th className="p-3 whitespace-nowrap">Status</th>}
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                                                                {order.items.map((item, idx) => {
                                                                    const picked = (type === 'FINISHED' || isGhost) ? getTotalPickedQuantity(order, orders, item.sku) : 0;
                                                                    const isFullyPicked = picked >= item.quantity;
                                                                    const allocated = getAllocatedQty(order.id, item.sku);
                                                                    const isAllocOK = allocated >= item.quantity;

                                                                    return (
                                                                        <tr key={idx}>
                                                                            <td className="p-3 font-mono text-xs whitespace-nowrap">{item.sku}</td>
                                                                            <td className="p-3 min-w-[200px] flex items-center gap-2">
                                                                                {item.description}
                                                                                {item.isCustom && <span className="ml-2 text-[10px] bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 px-1 rounded">Novo</span>}
                                                                                {item.image && (
                                                                                    <button 
                                                                                        onClick={() => setViewImage(item.image!)}
                                                                                        className="text-slate-400 hover:text-brand-600"
                                                                                    >
                                                                                        <ImageIcon className="w-4 h-4" />
                                                                                    </button>
                                                                                )}
                                                                            </td>
                                                                            <td className="p-3 text-right font-bold whitespace-nowrap">{item.quantity}</td>
                                                                            
                                                                            {/* FIFO Allocation Column for Open Orders */}
                                                                            {type === 'OPEN' && !isCompleted && (
                                                                                <td className="p-3 text-right font-mono text-xs whitespace-nowrap">
                                                                                    {item.isCustom ? (
                                                                                        <span className="text-slate-400">N/A</span>
                                                                                    ) : (
                                                                                        <span className={`${isAllocOK ? 'text-green-600 font-bold' : 'text-red-500 font-bold'}`}>
                                                                                            {allocated} / {item.quantity}
                                                                                        </span>
                                                                                    )}
                                                                                </td>
                                                                            )}

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
                                               <div className="flex justify-end gap-2 pt-4 border-t border-slate-100 dark:border-slate-700 flex-wrap">
                                                    
                                                    {isPendingApproval && canApprove && (
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleApproveOrder(order); }}
                                                            className={`flex items-center gap-1 px-4 py-2 text-xs font-bold text-white rounded-lg shadow-sm transition-colors ${hasPendingPhotos ? 'bg-slate-400 cursor-not-allowed opacity-50' : 'bg-green-600 hover:bg-green-700 animate-pulse'}`}
                                                            disabled={hasPendingPhotos}
                                                            title={hasPendingPhotos ? "Identifique os materiais das fotos primeiro" : "Aprovar"}
                                                        >
                                                            <CheckCircle className="w-4 h-4"/> Aprovar & Enviar
                                                        </button>
                                                    )}

                                                    {/* Email Buttons - SEPARATE LOGISTICS and ALERTS */}
                                                    {type === 'OPEN' && !isPendingApproval && (
                                                        <>
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleSendEmail(order, 'LOGISTICS'); }}
                                                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                                                title="Notificar Logística"
                                                            >
                                                                <Mail className="w-3 h-3" /> Email Logística
                                                            </button>

                                                            {issues.hasIssues && (
                                                                <button 
                                                                    onClick={(e) => { e.stopPropagation(); handleSendEmail(order, 'ALERT'); }}
                                                                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                                                                    title="Enviar Alerta de Faltas"
                                                                >
                                                                    <AlertTriangle className="w-3 h-3" /> Email Alerta
                                                                </button>
                                                            )}
                                                        </>
                                                    )}

                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); downloadExcel(order); }}
                                                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                                                    >
                                                        <Download className="w-3 h-3" /> Excel
                                                    </button>
                                                    
                                                    {type === 'OPEN' && canEdit && (
                                                        <button 
                                                            onClick={(e) => { e.stopPropagation(); handleEditStart(order); }}
                                                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
                                                        >
                                                            <Edit className="w-3 h-3" /> {hasPendingPhotos ? 'Corrigir Imagem' : 'Editar'}
                                                        </button>
                                                    )}

                                                    {(isAdmin || (isTechnical && isPendingApproval)) && (
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
