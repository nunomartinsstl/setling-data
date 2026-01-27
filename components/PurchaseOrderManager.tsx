import React, { useState, useEffect, useMemo } from 'react';
import { MasterMaterial, Supplier, UnitOption, PurchaseOrder, UserRole } from '../types';
import { StorageService } from '../services/storageService';
import { ShoppingBag, Search, Plus, Trash2, FileText, Download, User, MapPin, CreditCard, Tag, ChevronDown, ChevronUp, X, FileSpreadsheet, Save, ArrowLeft, Clock, Calendar, Edit, List, Euro } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getAuth } from 'firebase/auth';

interface PurchaseOrderManagerProps {
  masterList: MasterMaterial[];
  currentUsername: string;
}

interface PORow {
  sku: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  isCustom: boolean; 
  showSuggestions: boolean;
}

const VAT_RATE = 0.23;

const PurchaseOrderManager: React.FC<PurchaseOrderManagerProps> = ({ masterList, currentUsername }) => {
  const [viewMode, setViewMode] = useState<'LIST' | 'CREATE'>('LIST');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [unitOptions, setUnitOptions] = useState<UnitOption[]>([]);
  const [savedOrders, setSavedOrders] = useState<PurchaseOrder[]>([]);
  
  // Header State
  const [orderId, setOrderId] = useState<string | null>(null);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [pep, setPep] = useState('');
  const [displayId, setDisplayId] = useState<number | undefined>(undefined);
  const [orderDate, setOrderDate] = useState<string>('');
  
  // Grid State
  const [rows, setRows] = useState<PORow[]>([{ sku: '', description: '', quantity: 1, unit: 'UN', unitPrice: 0, isCustom: false, showSuggestions: false }]);
  const [expandedRow, setExpandedRow] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  const currentUserRole = useMemo(() => {
      // Need to fetch user role from elsewhere or assume passed prop. 
      // For now, we will trust the auth context or just check username if needed.
      // Ideally App.tsx passes role. We'll use a hack to get role if not passed.
      return UserRole.MANAGEMENT; // Fallback, usually only Mgmt sees this component
  }, []);

  const auth = getAuth();
  const isOwnerOrAdmin = (po: PurchaseOrder) => {
      // Logic handled in UI display
      return po.creator === currentUsername || true; // Allow all authorized roles to edit for now
  };

  // Load Data
  useEffect(() => {
      const load = async () => {
          setLoading(true);
          const [settings, orders] = await Promise.all([
              StorageService.getSettings(),
              StorageService.getPurchaseOrders()
          ]);
          
          if (settings.suppliers) setSuppliers(settings.suppliers);
          if (settings.unitOptions) setUnitOptions(settings.unitOptions);
          else setUnitOptions([{ value: 'UN', description: 'Unidade' }]);
          
          setSavedOrders(orders.sort((a,b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime()));
          setLoading(false);
      };
      load();
  }, [viewMode]); // Reload when switching views

  // Filtered Suppliers
  const filteredSuppliers = useMemo(() => {
      if (!supplierSearch) return [];
      const lowerSearch = supplierSearch.toLowerCase();
      return suppliers.filter(s => 
          s.name.toLowerCase().includes(lowerSearch) || 
          s.code.toLowerCase().includes(lowerSearch)
      );
  }, [suppliers, supplierSearch]);

  // Master List Autocomplete Helper
  const getMaterialMatches = (query: string) => {
      if (!query || query.length < 3) return [];
      const q = query.toLowerCase();
      return masterList
        .filter(m => m.description.toLowerCase().includes(q) || m.sku.toLowerCase().includes(q))
        .slice(0, 5);
  };

  const handleSupplierSelect = (s: Supplier) => {
      setSelectedSupplier(s);
      setSupplierSearch('');
  };

  const updateRow = (index: number, field: keyof PORow, value: any) => {
      const newRows = [...rows];
      newRows[index] = { ...newRows[index], [field]: value };
      
      // Show suggestions if typing description
      if (field === 'description') {
          newRows[index].showSuggestions = true;
          if (newRows[index].isCustom === false && value === '') {
              newRows[index].sku = '';
          }
      }

      // If toggling custom checkbox
      if (field === 'isCustom') {
          if (value === true) {
              newRows[index].sku = 'MATERIAIS';
          } else {
              newRows[index].sku = '';
          }
      }
      
      setRows(newRows);
  };

  const handleMaterialSelect = (index: number, material: MasterMaterial) => {
      const newRows = [...rows];
      newRows[index] = {
          ...newRows[index],
          sku: material.sku,
          description: material.description,
          isCustom: false,
          showSuggestions: false // Hide suggestions
      };
      setRows(newRows);
  };

  const addRow = () => {
      setRows([...rows, { sku: '', description: '', quantity: 1, unit: 'UN', unitPrice: 0, isCustom: false, showSuggestions: false }]);
      setExpandedRow(rows.length);
  };

  const removeRow = (index: number) => {
      if (rows.length === 1) return;
      const newRows = [...rows];
      newRows.splice(index, 1);
      setRows(newRows);
  };

  const subTotal = rows.reduce((acc, row) => acc + (row.quantity * row.unitPrice), 0);
  const vatTotal = subTotal * VAT_RATE;
  const grandTotal = subTotal + vatTotal;

  const generatePDF = (poData?: PurchaseOrder) => {
    // If passed data (saving flow), use it. Otherwise assume current state (draft preview)
    const supplier = poData ? poData.supplier : selectedSupplier;
    const items = poData ? poData.items : rows;
    const currentPep = poData ? poData.pep : pep;
    const currentTotal = poData ? poData.subTotal : subTotal;
    const currentVat = poData ? poData.vatTotal : vatTotal;
    const currentGrand = poData ? poData.grandTotal : grandTotal;
    const date = poData ? poData.dateCreated : new Date().toISOString();
    const idDisplay = poData?.displayId ? `PO #${poData.displayId}` : "RASCUNHO";

    if (!supplier) {
        alert("Selecione um fornecedor.");
        return;
    }

    const doc = new jsPDF();

    // -- Header --
    doc.setFontSize(22);
    doc.setTextColor(40, 40, 40);
    doc.text("NOTA DE ENCOMENDA", 14, 20);
    doc.setFontSize(14);
    doc.setTextColor(100);
    doc.text(idDisplay, 14, 28);
    
    doc.setFontSize(10);
    doc.setTextColor(100);
    const dateStr = new Date(date).toLocaleDateString('pt-PT');
    doc.text(`Data: ${dateStr}`, 14, 36);
    doc.text(`PEP: ${currentPep || 'N/A'}`, 14, 41);
    doc.text(`Responsável: ${currentUsername}`, 14, 46);

    // -- Supplier Info (Right Aligned Box effectively) --
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text("FORNECEDOR:", 120, 20);
    doc.setFontSize(10);
    doc.text(supplier.name, 120, 26);
    doc.setFontSize(9);
    doc.setTextColor(80);
    
    const addressLines = doc.splitTextToSize(supplier.address, 80);
    doc.text(addressLines, 120, 31);
    
    const nextY = 31 + (addressLines.length * 4);
    doc.text(`Pagamento: ${supplier.paymentTerms}`, 120, nextY + 5);

    // -- Table --
    const tableBody = items.map(row => [
        row.sku,
        row.description,
        `${row.quantity} ${row.unit}`,
        `${row.unitPrice.toFixed(2)} €`,
        `${(row.quantity * row.unitPrice).toFixed(2)} €`
    ]);

    autoTable(doc, {
        startY: Math.max(60, nextY + 20),
        head: [['Ref.', 'Descrição', 'Qtd', 'Preço Unit.', 'Total']],
        body: tableBody,
        theme: 'plain', // Clean look
        headStyles: { 
            fillColor: [240, 240, 240], 
            textColor: [50, 50, 50],
            fontStyle: 'bold',
            lineWidth: 0.1,
            lineColor: [200, 200, 200]
        },
        bodyStyles: {
            textColor: [50, 50, 50],
            lineWidth: 0.1,
            lineColor: [230, 230, 230]
        },
        columnStyles: {
            0: { cellWidth: 30 },
            1: { cellWidth: 'auto' },
            2: { cellWidth: 25, halign: 'right' },
            3: { cellWidth: 25, halign: 'right' },
            4: { cellWidth: 25, halign: 'right' }
        },
        // Remove default footer from table to do custom one
    });

    // -- Footer Totals --
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    
    doc.setFontSize(10);
    doc.setTextColor(80);
    doc.text("Subtotal:", 140, finalY, { align: 'right' });
    doc.text(`${currentTotal.toFixed(2)} €`, 195, finalY, { align: 'right' });
    
    doc.text(`IVA (${(VAT_RATE * 100).toFixed(0)}%):`, 140, finalY + 5, { align: 'right' });
    doc.text(`${currentVat.toFixed(2)} €`, 195, finalY + 5, { align: 'right' });
    
    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL:", 140, finalY + 12, { align: 'right' });
    doc.text(`${currentGrand.toFixed(2)} €`, 195, finalY + 12, { align: 'right' });

    // -- Signature --
    const sigY = finalY + 30;
    doc.setDrawColor(150);
    doc.line(14, sigY, 80, sigY);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Assinatura / Aprovação", 14, sigY + 5);

    doc.save(`PO_${supplier.name.substring(0,10)}_${dateStr}.pdf`);
  };

  const generateExcel = () => {
      if (!selectedSupplier) {
          alert("Selecione um fornecedor para exportar.");
          return;
      }

      // Flat Data Structure (Table format)
      const data = rows.map(r => ({
          "ID Pedido": displayId ? `#${displayId}` : "RASCUNHO",
          "Data": orderDate ? new Date(orderDate).toLocaleDateString() : new Date().toLocaleDateString(),
          "Responsável": currentUsername,
          "PEP": pep || '',
          "Fornecedor": selectedSupplier.name,
          "Referência": r.sku,
          "Descrição": r.description,
          "Quantidade": r.quantity,
          "Unidade": r.unit,
          "Preço Unit.": r.unitPrice,
          "Total": r.quantity * r.unitPrice
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Dados");
      
      const fileName = `PO_Dados_${selectedSupplier.name.substring(0,10).trim()}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
  };

  const handleSaveAndGenerate = async () => {
      if (!selectedSupplier) {
          alert("Fornecedor obrigatório.");
          return;
      }
      if (rows.length === 0 || rows.some(r => !r.description)) {
          alert("Adicione itens válidos.");
          return;
      }

      // VALIDATION: Check for zero price
      if (rows.some(r => !r.unitPrice || r.unitPrice <= 0)) {
          alert("Erro: Todos os itens devem ter um Preço Unitário maior que 0.");
          return;
      }

      if(!window.confirm("Confirmar gravação do pedido?")) return;

      const newPO: PurchaseOrder = {
          id: orderId || Math.random().toString(36).substr(2, 9),
          displayId: displayId, // Service will handle if undefined
          dateCreated: orderId ? orderDate : new Date().toISOString(),
          supplier: selectedSupplier,
          pep: pep,
          items: rows.map(r => ({
              sku: r.sku,
              description: r.description,
              quantity: Number(r.quantity),
              unit: r.unit,
              unitPrice: Number(r.unitPrice),
              total: r.quantity * r.unitPrice,
              isCustom: r.isCustom
          })),
          subTotal,
          vatTotal,
          grandTotal,
          creator: currentUsername,
          status: 'SENT'
      };

      try {
          const saved = await StorageService.savePurchaseOrder(newPO);
          generatePDF(saved);
          setViewMode('LIST');
          setOrderId(null);
      } catch (e: any) {
          alert("Erro ao salvar: " + e.message);
      }
  };

  const handleEdit = (po: PurchaseOrder) => {
      setOrderId(po.id);
      setDisplayId(po.displayId);
      setOrderDate(po.dateCreated);
      setSelectedSupplier(po.supplier);
      setPep(po.pep);
      setRows(po.items.map(i => ({
          sku: i.sku,
          description: i.description,
          quantity: i.quantity,
          unit: i.unit,
          unitPrice: i.unitPrice,
          isCustom: !!i.isCustom,
          showSuggestions: false
      })));
      setViewMode('CREATE');
  };

  const handleNew = () => {
      setOrderId(null);
      setDisplayId(undefined);
      setOrderDate('');
      setSelectedSupplier(null);
      setPep('');
      setRows([{ sku: '', description: '', quantity: 1, unit: 'UN', unitPrice: 0, isCustom: false, showSuggestions: false }]);
      setViewMode('CREATE');
  };

  if (viewMode === 'LIST') {
      return (
          <div className="space-y-6 animate-fade-in pb-20">
              <div className="flex justify-between items-center mb-6">
                  <div className="flex items-center gap-2">
                      <ShoppingBag className="w-8 h-8 text-purple-600 dark:text-purple-400" />
                      <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Pedidos de Compra (Autónomos)</h2>
                  </div>
                  <button 
                    onClick={handleNew}
                    className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 flex items-center gap-2 font-medium"
                  >
                      <Plus className="w-5 h-5"/> Novo Pedido
                  </button>
              </div>

              {loading ? (
                  <div className="text-center p-8 text-slate-500">Carregando...</div>
              ) : (
                  <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                      <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                          <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-200">
                              <tr>
                                  <th className="p-4">ID</th>
                                  <th className="p-4">Data</th>
                                  <th className="p-4">Fornecedor</th>
                                  <th className="p-4">PEP</th>
                                  <th className="p-4 text-right">Total</th>
                                  <th className="p-4 text-right">Ações</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                              {savedOrders.length === 0 ? (
                                  <tr><td colSpan={6} className="p-8 text-center text-slate-400">Nenhum pedido registado.</td></tr>
                              ) : (
                                  savedOrders.map(po => (
                                      <tr key={po.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                                          <td className="p-4 font-mono font-bold text-purple-600 dark:text-purple-400">#{po.displayId}</td>
                                          <td className="p-4 text-xs">{new Date(po.dateCreated).toLocaleDateString()}</td>
                                          <td className="p-4 font-medium">{po.supplier.name}</td>
                                          <td className="p-4 text-xs font-mono">{po.pep || '-'}</td>
                                          <td className="p-4 text-right font-bold text-slate-800 dark:text-white">{po.grandTotal.toFixed(2)} €</td>
                                          <td className="p-4 text-right">
                                              <button 
                                                onClick={() => handleEdit(po)}
                                                className="text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 p-2"
                                                title="Ver/Editar"
                                              >
                                                  <Edit className="w-4 h-4"/>
                                              </button>
                                          </td>
                                      </tr>
                                  ))
                              )}
                          </tbody>
                      </table>
                  </div>
              )}
          </div>
      );
  }

  // CREATE / EDIT MODE
  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex items-center gap-4 mb-6">
          <button onClick={() => setViewMode('LIST')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500">
              <ArrowLeft className="w-6 h-6"/>
          </button>
          <div>
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                {orderId ? `Editar Pedido #${displayId}` : 'Novo Pedido de Compra'}
            </h2>
            <p className="text-xs text-slate-500">Pedidos a Fornecedores (Autónomos)</p>
          </div>
      </div>

      {/* HEADER SECTION */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
          {/* Supplier Select */}
          <div className="relative z-20">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Fornecedor</label>
              {!selectedSupplier ? (
                  <div className="relative">
                      <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                      <input 
                        type="text" 
                        value={supplierSearch}
                        onChange={(e) => setSupplierSearch(e.target.value)}
                        placeholder="Pesquisar fornecedor..."
                        className="w-full pl-9 p-2.5 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-purple-500 outline-none dark:bg-slate-900 dark:text-white"
                      />
                      {supplierSearch && (
                          <div className="absolute top-full left-0 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md mt-1 shadow-lg max-h-48 overflow-y-auto">
                              {filteredSuppliers.map(s => (
                                  <div 
                                    key={s.code} 
                                    onClick={() => handleSupplierSelect(s)}
                                    className="p-2 hover:bg-purple-50 dark:hover:bg-purple-900/20 cursor-pointer border-b border-slate-100 dark:border-slate-700 last:border-0"
                                  >
                                      <p className="font-bold text-slate-800 dark:text-white text-sm">{s.name}</p>
                                      <p className="text-xs text-slate-500">{s.code} - {s.address}</p>
                                  </div>
                              ))}
                              {filteredSuppliers.length === 0 && (
                                  <div className="p-3 text-xs text-slate-500 text-center">Nenhum fornecedor encontrado.</div>
                              )}
                          </div>
                      )}
                  </div>
              ) : (
                  <div className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-md relative group">
                      <div className="flex items-start gap-3">
                          <User className="w-5 h-5 text-purple-600 mt-1" />
                          <div>
                              <p className="font-bold text-purple-900 dark:text-purple-300">{selectedSupplier.name}</p>
                              <div className="flex items-center gap-1 text-xs text-purple-700 dark:text-purple-400 mt-1">
                                  <MapPin className="w-3 h-3" /> {selectedSupplier.address}
                              </div>
                              <div className="flex items-center gap-1 text-xs text-purple-700 dark:text-purple-400 mt-0.5">
                                  <CreditCard className="w-3 h-3" /> {selectedSupplier.paymentTerms}
                              </div>
                          </div>
                      </div>
                      <button 
                        onClick={() => setSelectedSupplier(null)}
                        className="absolute top-2 right-2 text-slate-400 hover:text-red-500"
                        title="Alterar Fornecedor"
                      >
                          <X className="w-4 h-4" />
                      </button>
                  </div>
              )}
          </div>

          {/* PEP Input */}
          <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">PEP / Projeto</label>
              <input 
                type="text" 
                value={pep}
                onChange={(e) => setPep(e.target.value)}
                placeholder="Ex: P-2024-001"
                className="w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-purple-500 outline-none dark:bg-slate-900 dark:text-white"
              />
          </div>
      </div>

      {/* ITEMS GRID */}
      <div className="space-y-3">
          {rows.map((row, idx) => {
             const isExpanded = expandedRow === idx;
             const matches = getMaterialMatches(row.description);
             
             return (
                 <div key={idx} className={`bg-white dark:bg-slate-800 rounded-lg border transition-all ${isExpanded ? 'border-purple-400 ring-1 ring-purple-100 dark:ring-purple-900' : 'border-slate-200 dark:border-slate-700'}`}>
                     <div 
                        className="p-3 flex items-center justify-between cursor-pointer"
                        onClick={() => setExpandedRow(isExpanded ? -1 : idx)}
                     >
                         <div className="flex items-center gap-3 overflow-hidden">
                             <div className="bg-slate-100 dark:bg-slate-700 text-xs font-bold px-2 py-1 rounded text-slate-600 dark:text-slate-300">
                                 #{idx + 1}
                             </div>
                             <div className="truncate">
                                 <span className="font-medium text-slate-800 dark:text-white">
                                     {row.description || 'Novo Item'}
                                 </span>
                                 <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">
                                     ({row.quantity} {row.unit}) - {row.unitPrice.toFixed(2)} €
                                 </span>
                             </div>
                         </div>
                         <div className="flex items-center gap-2">
                             <div className="font-bold text-slate-900 dark:text-white text-sm mr-2">
                                 {(row.quantity * row.unitPrice).toFixed(2)} €
                             </div>
                             <button onClick={(e) => { e.stopPropagation(); removeRow(idx); }} className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded">
                                 <Trash2 className="w-4 h-4" />
                             </button>
                             {isExpanded ? <ChevronUp className="w-4 h-4 text-purple-500"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
                         </div>
                     </div>

                     {isExpanded && (
                         <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 grid grid-cols-1 md:grid-cols-12 gap-4">
                             {/* Description / Search */}
                             <div className="md:col-span-6 relative">
                                 <label className="text-[10px] font-bold text-slate-400 uppercase">Descrição / Material</label>
                                 <div className="relative">
                                     <input 
                                        type="text" 
                                        value={row.description}
                                        onChange={(e) => updateRow(idx, 'description', e.target.value)}
                                        placeholder="Buscar material ou digitar..."
                                        className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-purple-500 outline-none dark:bg-slate-800 dark:text-white text-sm"
                                        autoComplete="off"
                                     />
                                     {/* Similarity Check Logic: Show matches even if isCustom is true (Point 3) */}
                                     {row.showSuggestions && matches.length > 0 && (
                                         <div className="absolute z-10 w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-lg mt-1">
                                             {matches.map(m => (
                                                 <div 
                                                    key={m.sku} 
                                                    onClick={() => handleMaterialSelect(idx, m)}
                                                    className="p-2 hover:bg-purple-50 dark:hover:bg-purple-900/20 cursor-pointer text-sm"
                                                 >
                                                     <span className="font-bold text-purple-700 dark:text-purple-400 block">{m.sku}</span>
                                                     <span className="text-slate-600 dark:text-slate-300">{m.description}</span>
                                                 </div>
                                             ))}
                                         </div>
                                     )}
                                 </div>
                                 <div className="mt-2 flex items-center justify-between">
                                     <span className="text-[10px] text-slate-400 font-mono">
                                        Código de Material: {row.isCustom ? <span className="text-purple-500 font-bold">MATERIAIS</span> : (row.sku || '-')}
                                     </span>
                                     {/* Checkbox for New Material (Point 4) */}
                                     <label className="flex items-center gap-2 cursor-pointer">
                                         <input 
                                            type="checkbox" 
                                            checked={row.isCustom}
                                            onChange={(e) => updateRow(idx, 'isCustom', e.target.checked)}
                                            className="w-3.5 h-3.5 text-purple-600 border-slate-300 rounded focus:ring-purple-500"
                                         />
                                         <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">Novo Material</span>
                                     </label>
                                 </div>
                             </div>

                             {/* Quantity */}
                             <div className="md:col-span-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Qtd</label>
                                <input 
                                    type="number" 
                                    value={row.quantity}
                                    onChange={(e) => updateRow(idx, 'quantity', Number(e.target.value))}
                                    className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-purple-500 outline-none dark:bg-slate-800 dark:text-white text-sm"
                                />
                             </div>

                             {/* Unit */}
                             <div className="md:col-span-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Unid.</label>
                                <select 
                                    value={row.unit}
                                    onChange={(e) => updateRow(idx, 'unit', e.target.value)}
                                    className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-purple-500 outline-none dark:bg-slate-800 dark:text-white text-sm appearance-none"
                                >
                                    {unitOptions.map(u => (
                                        <option key={u.value} value={u.value}>{u.value}</option>
                                    ))}
                                </select>
                             </div>

                             {/* Unit Price */}
                             <div className="md:col-span-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase">Preço Unit.</label>
                                <div className="relative">
                                    <input 
                                        type="number" 
                                        value={row.unitPrice === 0 ? '' : row.unitPrice}
                                        onChange={(e) => updateRow(idx, 'unitPrice', Number(e.target.value))}
                                        placeholder="0.00"
                                        className="w-full p-2 pr-8 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-purple-500 outline-none dark:bg-slate-800 dark:text-white text-sm"
                                    />
                                    <Euro className="absolute right-8 top-2.5 w-4 h-4 text-slate-400 pointer-events-none"/>
                                </div>
                             </div>
                         </div>
                     )}
                 </div>
             );
          })}
      </div>

      <button 
        onClick={addRow}
        className="w-full py-3 bg-slate-50 dark:bg-slate-800 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg text-slate-500 dark:text-slate-400 font-medium hover:bg-slate-100 dark:hover:bg-slate-700/50 flex items-center justify-center gap-2 transition-colors"
      >
          <Plus className="w-5 h-5"/> Adicionar Linha
      </button>

      {/* FOOTER ACTIONS */}
      <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 p-4 shadow-lg z-30 lg:pl-64">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex gap-6 text-sm md:text-base">
                  <div className="flex flex-col">
                      <span className="text-xs text-slate-500 font-medium uppercase">Subtotal</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">{subTotal.toFixed(2)} €</span>
                  </div>
                  <div className="flex flex-col">
                      <span className="text-xs text-slate-500 font-medium uppercase">IVA ({(VAT_RATE * 100).toFixed(0)}%)</span>
                      <span className="font-bold text-slate-700 dark:text-slate-300">{vatTotal.toFixed(2)} €</span>
                  </div>
                  <div className="flex flex-col border-l pl-6 border-slate-200 dark:border-slate-700">
                      <span className="text-xs text-brand-600 dark:text-brand-400 font-bold uppercase">Total Final</span>
                      <span className="text-xl font-bold text-slate-900 dark:text-white">{grandTotal.toFixed(2)} €</span>
                  </div>
              </div>
              <div className="flex gap-3 w-full md:w-auto">
                  <button 
                    onClick={generateExcel}
                    className="flex-1 md:flex-none px-4 py-2 border border-green-600 text-green-600 dark:text-green-400 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 font-medium flex items-center justify-center gap-2"
                  >
                      <FileSpreadsheet className="w-4 h-4" /> Excel
                  </button>
                  <button 
                    onClick={handleSaveAndGenerate}
                    className="flex-1 md:flex-none px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium flex items-center justify-center gap-2 shadow-sm"
                  >
                      <Save className="w-4 h-4" /> Guardar Pedido e Gerar PDF
                  </button>
              </div>
          </div>
      </div>
    </div>
  );
};

export default PurchaseOrderManager;