
import React, { useState, useEffect, useMemo } from 'react';
import { MasterMaterial, Supplier, UnitOption, PurchaseOrder, ApprovalRule, UserRole } from '../types';
import { StorageService } from '../services/storageService';
import { ShoppingBag, Search, Plus, Trash2, Edit, Save, ArrowLeft, X, FileSpreadsheet, FileText, User, MapPin, CreditCard, ChevronDown, ChevronUp, AlertCircle, HelpCircle, Check, Euro, CheckCircle, Loader2, Hash, ShieldCheck, XCircle } from 'lucide-react';

// Explicitly declare global types to avoid TS errors without imports
declare const window: any;
declare const XLSX: any;

interface PurchaseOrderManagerProps {
  masterList: MasterMaterial[];
  currentUsername: string;
  logoUrl: string;
}

interface PORow {
  sku: string;
  description: string;
  quantity: number | string;
  unit: string;
  unitPrice: number | string;
  isCustom: boolean; 
  showSuggestions: boolean;
  similarityChecked: boolean;
}

const VAT_RATE = 0.23;

const normalizeText = (text: string): string => {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
};

const calculateRelevance = (target: string, query: string): number => {
    const t = normalizeText(target);
    const q = normalizeText(query);
    if (t === q) return 100;
    const qWords = q.split(/\s+/).filter(w => w.length > 2);
    if (qWords.length === 0) return 0;
    let score = 0;
    let matches = 0;
    qWords.forEach(qw => {
        if (t.includes(qw)) {
            matches++;
            score += 10;
        }
    });
    return matches > 0 ? score : 0;
};

// PEP Formatter
const formatPEP = (value: string) => {
    const clean = value.replace(/[^0-9]/g, '');
    let formatted = clean;
    if (clean.length > 4) formatted = `${clean.slice(0, 4)}.${clean.slice(4)}`;
    if (clean.length > 7) formatted = `${clean.slice(0, 4)}.${clean.slice(4, 7)}/${clean.slice(7)}`;
    if (clean.length > 10) formatted = `${clean.slice(0, 4)}.${clean.slice(4, 7)}/${clean.slice(7, 10)}/${clean.slice(10, 14)}`;
    return formatted;
};

const PurchaseOrderManager: React.FC<PurchaseOrderManagerProps> = ({ masterList, currentUsername, logoUrl }) => {
  // State
  const [viewMode, setViewMode] = useState<'LIST' | 'CREATE'>('LIST');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [unitOptions, setUnitOptions] = useState<UnitOption[]>([]);
  const [approvalRules, setApprovalRules] = useState<ApprovalRule[]>([]);
  const [savedOrders, setSavedOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>(UserRole.VIEWER);

  // Form State
  const [orderId, setOrderId] = useState<string | null>(null);
  const [displayId, setDisplayId] = useState<number | undefined>(undefined);
  const [orderDate, setOrderDate] = useState<string>('');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [pep, setPep] = useState('');
  
  const [rows, setRows] = useState<PORow[]>([]);
  const [expandedRow, setExpandedRow] = useState<number>(0);
  
  // List View Expansion State
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Similarity Modal State
  const [similarityModalOpen, setSimilarityModalOpen] = useState(false);
  const [similarityTargetIdx, setSimilarityTargetIdx] = useState<number | null>(null);
  const [similarityResults, setSimilarityResults] = useState<MasterMaterial[]>([]);
  const [similarityStep, setSimilarityStep] = useState<'LIST' | 'CONFIRM_MATCH' | 'CONFIRM_NEW'>('LIST');
  const [selectedCandidate, setSelectedCandidate] = useState<MasterMaterial | null>(null);

  // Initial Load
  useEffect(() => {
      loadData();
      StorageService.subscribeToAuth(user => {
          if (user) setCurrentUserRole(user.role);
      });
  }, [viewMode]);

  const loadData = async () => {
      setLoading(true);
      try {
          const [settings, orders] = await Promise.all([
              StorageService.getSettings(),
              StorageService.getPurchaseOrders()
          ]);
          setSuppliers(settings.suppliers || []);
          setUnitOptions(settings.unitOptions || [{ value: 'UN', description: 'Unidade' }]);
          
          // Migrate old maxAmount rules to new structure if needed
          const rules = (settings.approvalRules || []).map((r: any) => ({
              amount: r.amount !== undefined ? r.amount : r.maxAmount,
              approverEmail: r.approverEmail,
              operator: r.operator || 'LTE'
          }));
          setApprovalRules(rules);
          
          setSavedOrders(orders.sort((a,b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime()));
          
          // Initialize empty row if needed
          if (rows.length === 0) {
              setRows([{ sku: '', description: '', quantity: 1, unit: 'UN', unitPrice: 0, isCustom: false, showSuggestions: false, similarityChecked: false }]);
          }
      } catch (e) {
          console.error(e);
      } finally {
          setLoading(false);
      }
  };

  // Computeds
  const filteredSuppliers = useMemo(() => {
      if (!supplierSearch) return [];
      const lower = supplierSearch.toLowerCase();
      return suppliers.filter(s => s.name.toLowerCase().includes(lower) || s.code.toLowerCase().includes(lower));
  }, [suppliers, supplierSearch]);

  const subTotal = rows.reduce((acc, row) => acc + (Number(row.quantity) * Number(row.unitPrice)), 0);
  const vatTotal = subTotal * VAT_RATE;
  const grandTotal = subTotal + vatTotal;

  const canApprove = currentUserRole === UserRole.ADMIN || currentUserRole === UserRole.MANAGEMENT;

  const validatePep = () => {
      if (!pep) return true; 
      const clean = pep.replace(/[^0-9]/g, '');
      // Expect at least Prefix (4) + Code (3) + Element (3) = 10 digits
      if (clean.length < 10) return false;
      
      const prefix = clean.slice(0, 4);
      if (prefix !== '1700' && prefix !== '2200') return false;
      
      return true;
  };

  // Validation Flags
  const isFormValid = useMemo(() => {
      if (!selectedSupplier) return false;
      if (!pep || pep.trim().length === 0 || !validatePep()) return false;
      if (rows.length === 0) return false;
      
      return rows.every(r => 
          r.description && r.description.trim().length > 0 &&
          r.similarityChecked &&
          Number(r.quantity) > 0 &&
          Number(r.unitPrice) > 0
      );
  }, [selectedSupplier, pep, rows]);

  // Handlers
  const handleSupplierSelect = (s: Supplier) => {
      setSelectedSupplier(s);
      setSupplierSearch('');
  };

  const updateRow = (index: number, field: keyof PORow, value: any) => {
      const newRows = [...rows];
      newRows[index] = { ...newRows[index], [field]: value };
      
      if (field === 'description') {
          newRows[index].showSuggestions = true;
          newRows[index].similarityChecked = false;
          if (!newRows[index].isCustom) newRows[index].sku = '';
      }
      
      if (field === 'isCustom') {
          newRows[index].sku = value ? 'MATERIAIS' : '';
          newRows[index].similarityChecked = false;
      }
      setRows(newRows);
  };

  const addRow = () => {
      const newIdx = rows.length;
      setRows([...rows, { sku: '', description: '', quantity: 1, unit: 'UN', unitPrice: 0, isCustom: false, showSuggestions: false, similarityChecked: false }]);
      setExpandedRow(newIdx); // Automatically expand the new row
  };

  const removeRow = (index: number) => {
      if (rows.length <= 1) return;
      const newRows = [...rows];
      newRows.splice(index, 1);
      setRows(newRows);
      // Adjust expanded row index if needed
      if (expandedRow >= index && expandedRow > 0) {
          setExpandedRow(expandedRow - 1);
      }
  };

  const getMaterialMatches = (query: string) => {
      if (!query || query.length < 3) return [];
      const q = normalizeText(query);
      return masterList.filter(m => normalizeText(m.description).includes(q) || normalizeText(m.sku).includes(q)).slice(0, 5);
  };

  const handleMaterialSelect = (index: number, material: MasterMaterial) => {
      const newRows = [...rows];
      newRows[index] = {
          ...newRows[index],
          sku: material.sku,
          description: material.description,
          isCustom: false,
          showSuggestions: false,
          similarityChecked: true
      };
      setRows(newRows);
  };

  const handlePepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const formatted = formatPEP(e.target.value);
      setPep(formatted);
  };

  // Similarity Handlers
  const handleCheckSimilarity = (idx: number) => {
      const row = rows[idx];
      const query = row.description;
      if (!query || query.length < 3) {
          alert("Descrição muito curta.");
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

  const handleConfirmMatch = () => {
      if (similarityTargetIdx === null || !selectedCandidate) return;
      const newRows = [...rows];
      newRows[similarityTargetIdx] = {
          ...newRows[similarityTargetIdx],
          sku: selectedCandidate.sku,
          description: selectedCandidate.description,
          isCustom: false,
          similarityChecked: true,
          showSuggestions: false
      };
      setRows(newRows);
      setSimilarityModalOpen(false);
  };

  const handleConfirmNew = () => {
      if (similarityTargetIdx === null) return;
      const newRows = [...rows];
      const currentDesc = newRows[similarityTargetIdx].description || '';
      
      newRows[similarityTargetIdx] = {
          ...newRows[similarityTargetIdx],
          sku: 'MATERIAIS',
          description: currentDesc.toUpperCase(),
          isCustom: true,
          similarityChecked: true,
          showSuggestions: false
      };
      setRows(newRows);
      setSimilarityModalOpen(false);
  };

  const handleDelete = async (id: string) => {
      if (window.confirm("Tem certeza que deseja excluir este pedido?")) {
          setLoading(true);
          try {
              await StorageService.deletePurchaseOrder(id);
              await loadData();
          } catch(e) {
              alert("Erro ao excluir.");
          } finally {
              setLoading(false);
          }
      }
  };

  const handleApprovalAction = async (order: PurchaseOrder, action: 'APPROVE' | 'REJECT') => {
      if (!window.confirm(action === 'APPROVE' ? "Aprovar pedido?" : "Rejeitar pedido?")) return;
      
      setLoading(true);
      try {
          const updatedOrder: PurchaseOrder = {
              ...order,
              status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
              approvalMetadata: {
                  ...order.approvalMetadata,
                  [action === 'APPROVE' ? 'approvedBy' : 'rejectedBy']: currentUsername,
                  [action === 'APPROVE' ? 'approvedAt' : 'rejectedAt']: new Date().toISOString()
              }
          };
          await StorageService.savePurchaseOrder(updatedOrder);
          await loadData();
      } catch(e: any) {
          alert("Erro: " + e.message);
      } finally {
          setLoading(false);
      }
  };

  const toggleExpandListOrder = (id: string) => {
    setExpandedOrderId(prev => prev === id ? null : id);
  };

  // --- PRINT GENERATION ---
  const handlePrintOrder = (orderToPrint?: PurchaseOrder) => {
    const printSupplier = orderToPrint ? orderToPrint.supplier : selectedSupplier;
    const printRows = orderToPrint ? orderToPrint.items : rows;
    const printId = orderToPrint ? orderToPrint.displayId : displayId;
    const printDate = orderToPrint ? orderToPrint.dateCreated : orderDate;
    const printPep = orderToPrint ? orderToPrint.pep : pep;

    if (!printSupplier) return alert("Selecione um fornecedor.");
    
    const title = printId ? `PEDIDO DE COMPRA #${printId}` : "RASCUNHO";
    const todayStr = printDate ? new Date(printDate).toLocaleDateString() : new Date().toLocaleDateString();

    const pSubTotal = printRows.reduce((acc, row) => acc + (Number(row.quantity) * Number(row.unitPrice)), 0);
    const pVatTotal = pSubTotal * VAT_RATE;
    const pGrandTotal = pSubTotal + pVatTotal;

    const paymentTerms = printSupplier.paymentTerms;
    const paymentDisplay = (String(paymentTerms) === '0') ? 'Pronto pagamento' : (paymentTerms || 'A Definir');

    const isGenericLogo = logoUrl.includes('setling-logo-white');
    const logoStyle = isGenericLogo ? 'filter: invert(1);' : '';

    const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <title>${title}</title>
            <style>
                body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; color: #000; margin: 0; padding: 20px; background: #fff; }
                .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #000; }
                .logo-img { max-height: 80px; max-width: 250px; object-fit: contain; ${logoStyle} }
                
                .po-number { font-size: 20px; font-weight: bold; color: #000; }
                .po-meta { font-size: 11px; color: #333; margin-top: 4px; }
                
                .grid { display: flex; gap: 40px; margin-bottom: 30px; }
                .col { flex: 1; }
                
                .box-title { font-size: 10px; font-weight: bold; color: #666; text-transform: uppercase; margin-bottom: 8px; border-bottom: 1px solid #ccc; padding-bottom: 2px; }
                .info-row { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 11px; }
                .info-label { color: #444; }
                .info-val { font-weight: 600; color: #000; }
                
                .supplier-name { font-size: 14px; font-weight: bold; margin-bottom: 4px; }
                .address { color: #000; line-height: 1.4; }

                table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                th { text-align: left; background: #eee; color: #000; padding: 12px 8px; border-bottom: 2px solid #000; font-size: 10px; text-transform: uppercase; font-weight: bold; }
                td { padding: 10px 8px; border-bottom: 1px solid #ccc; vertical-align: middle; color: #000; }
                .right { text-align: right; }
                .center { text-align: center; }
                .sku { font-family: monospace; font-weight: bold; color: #000; }
                
                .totals-area { display: flex; justify-content: flex-end; margin-top: 20px; }
                .totals-box { width: 250px; }
                .total-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px dashed #ccc; }
                .total-row.final { border-bottom: none; border-top: 2px solid #000; margin-top: 5px; padding-top: 10px; font-size: 16px; font-weight: bold; color: #000; }
                
                .footer-section { margin-top: 60px; display: flex; justify-content: space-between; align-items: flex-end; }
                .signature-box { border-top: 1px solid #000; width: 200px; padding-top: 8px; font-size: 10px; text-align: center; color: #000; }
                
                .print-footer { margin-top: 40px; border-top: 1px solid #eee; padding-top: 10px; font-size: 9px; color: #888; text-align: center; }
                
                @media print {
                    @page { margin: 10mm; }
                    body { -webkit-print-color-adjust: exact; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div>
                    <img src="${logoUrl}" alt="Logo" class="logo-img" />
                </div>
                <div style="text-align: right;">
                    <div class="po-number">${title}</div>
                    <div class="po-meta">Data de Emissão: ${todayStr}</div>
                </div>
            </div>

            <div class="grid">
                <div class="col">
                    <div class="box-title">Fornecedor</div>
                    <div class="supplier-name">${printSupplier.name}</div>
                    <div class="address">
                        ${printSupplier.address ? printSupplier.address.replace(/\n/g, '<br>') : 'Endereço não registado'}
                        <br>
                        ${printSupplier.code ? `Ref: ${printSupplier.code}` : ''}
                    </div>
                </div>
                <div class="col">
                    <div class="box-title">Dados do Pedido</div>
                    <div class="info-row">
                        <span class="info-label">PEP / Obra:</span>
                        <span class="info-val">${printPep || '-'}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Condição Pagamento:</span>
                        <span class="info-val">${paymentDisplay}</span>
                    </div>
                </div>
            </div>

            <table>
                <thead>
                    <tr>
                        <th width="15%">Referência</th>
                        <th width="45%">Descrição</th>
                        <th width="10%" class="right">Qtd</th>
                        <th width="10%" class="center">Unid</th>
                        <th width="10%" class="right">Preço Unit.</th>
                        <th width="10%" class="right">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${printRows.map((r: any) => `
                        <tr>
                            <td class="sku">${r.sku || '-'}</td>
                            <td>${r.description}</td>
                            <td class="right">${r.quantity}</td>
                            <td class="center" style="font-size: 10px; color: #000;">${r.unit}</td>
                            <td class="right">${Number(r.unitPrice).toFixed(2)} €</td>
                            <td class="right" style="font-weight: bold;">${(Number(r.quantity) * Number(r.unitPrice)).toFixed(2)} €</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="totals-area">
                <div class="totals-box">
                    <div class="total-row">
                        <span>Subtotal (Liq):</span>
                        <span>${pSubTotal.toFixed(2)} €</span>
                    </div>
                    <div class="total-row">
                        <span>IVA (${(VAT_RATE * 100).toFixed(0)}%):</span>
                        <span>${pVatTotal.toFixed(2)} €</span>
                    </div>
                    <div class="total-row final">
                        <span>Total Geral:</span>
                        <span>${pGrandTotal.toFixed(2)} €</span>
                    </div>
                </div>
            </div>

            <div class="footer-section">
                <div style="font-size: 10px; color: #000;">
                    <p>Observações:</p>
                    <p>Entrega prevista conforme acordado.</p>
                </div>
                <div class="signature-box">
                    Aprovado por
                </div>
            </div>

            <div class="print-footer">
                Documento gerado digitalmente pela plataforma Setling em ${new Date().toLocaleString()}.
            </div>
            
            <script>
                window.onload = function() {
                    window.print();
                }
            </script>
        </body>
        </html>
    `;

    const blob = new Blob([printContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const printWindow = window.open(url, '_blank');
    
    if (!printWindow) {
        alert("Pop-up bloqueado. Por favor permita pop-ups para este site para imprimir.");
    }
  };

  const handleSave = async () => {
      if (!isFormValid) return alert("Preencha todos os campos obrigatórios em vermelho e verifique os itens.");

      // Check Approval Rules
      let status: PurchaseOrder['status'] = 'SENT'; // Default (auto-approved)
      let matchedRule: ApprovalRule | undefined;

      if (approvalRules.length > 0) {
          // New Logic for Operators:
          // 1. Try to match explicit GTE (Greater Than or Equal) rules first, picking the highest threshold passed.
          // 2. If no GTE, try to match LTE (Less Than or Equal), picking the lowest threshold sufficient.
          
          const sortedRules = [...approvalRules].sort((a,b) => a.amount - b.amount);
          
          // Strategy: Find GTE match with max Amount (Highest authority trigger)
          const gteMatches = sortedRules.filter(r => r.operator === 'GTE' && grandTotal >= r.amount);
          if (gteMatches.length > 0) {
              matchedRule = gteMatches[gteMatches.length - 1]; // Pick the highest amount passed
          } else {
              // Strategy: Find LTE match with min Amount (First sufficient tier)
              const lteMatch = sortedRules.find(r => r.operator === 'LTE' && grandTotal <= r.amount);
              if (lteMatch) {
                  matchedRule = lteMatch;
              } else {
                  // Fallback: If only LTE rules exist and total > all of them, use the highest LTE rule?
                  // Or assume it needs "Board" approval (not defined).
                  // For safety, if it exceeds all LTE rules and no GTE rules exist, we use the highest rule available.
                  const hasGte = sortedRules.some(r => r.operator === 'GTE');
                  if (!hasGte && grandTotal > 0) {
                      matchedRule = sortedRules[sortedRules.length - 1];
                  }
              }
          }

          if (matchedRule) {
              status = 'PENDING_APPROVAL';
          }
      }

      const newPO: PurchaseOrder = {
          id: orderId || Math.random().toString(36).substr(2, 9),
          displayId: displayId,
          dateCreated: orderId ? orderDate : new Date().toISOString(),
          supplier: selectedSupplier!,
          pep,
          items: rows.map(r => ({
              sku: r.sku,
              description: r.description,
              quantity: Number(r.quantity),
              unit: r.unit,
              unitPrice: Number(r.unitPrice),
              total: Number(r.quantity) * Number(r.unitPrice),
              isCustom: r.isCustom
          })),
          subTotal,
          vatTotal,
          grandTotal,
          creator: currentUsername,
          status: status,
          // FIX: Do not assign undefined directly to a property that will be sent to Firebase
          ...(matchedRule ? { approvalMetadata: { approverEmail: matchedRule.approverEmail } } : {})
      };

      setLoading(true);
      try {
          const saved = await StorageService.savePurchaseOrder(newPO);
          
          // If pending approval, trigger mailto
          if (status === 'PENDING_APPROVAL' && matchedRule) {
              const subject = `Aprovação Necessária: Pedido #${saved.displayId} - ${grandTotal.toFixed(2)}€`;
              const body = `Olá,\n\nO pedido de compra #${saved.displayId} requer a sua aprovação.\n\n` +
                           `Fornecedor: ${saved.supplier.name}\n` +
                           `Total: ${grandTotal.toFixed(2)}€\n` +
                           `Criado por: ${currentUsername}\n\n` +
                           `Por favor, aceda à plataforma para aprovar ou rejeitar.\n\nCumprimentos.`;
              
              const mailto = `mailto:${matchedRule.approverEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
              
              // Use slight delay to allow UI update
              setTimeout(() => {
                  window.location.href = mailto;
              }, 500);
              
              alert(`Pedido guardado! A aguardar aprovação de ${matchedRule.approverEmail}.\nO seu cliente de email será aberto.`);
          } else {
              if (window.confirm("Pedido gravado e aprovado!\nDeseja visualizar o PDF agora?")) {
                  handlePrintOrder(saved);
              }
          }
          
          setOrderId(saved.id);
          setDisplayId(saved.displayId);
          setSavedOrders(prev => {
              const idx = prev.findIndex(o => o.id === saved.id);
              if (idx >= 0) {
                  const copy = [...prev];
                  copy[idx] = saved;
                  return copy;
              }
              return [saved, ...prev];
          });

          setViewMode('LIST');
          setOrderId(null);
          loadData();

      } catch (e: any) {
          alert("Erro: " + e.message);
      } finally {
          setLoading(false);
      }
  };

  const handleEdit = (po: PurchaseOrder) => {
      setOrderId(po.id);
      setDisplayId(po.displayId);
      setOrderDate(po.dateCreated);
      setSelectedSupplier(po.supplier);
      setPep(po.pep || '');
      setRows(po.items.map(i => ({
          sku: i.sku,
          description: i.description,
          quantity: i.quantity,
          unit: i.unit,
          unitPrice: i.unitPrice,
          isCustom: !!i.isCustom,
          showSuggestions: false,
          similarityChecked: true
      })));
      setExpandedRow(0);
      setViewMode('CREATE');
  };

  const handleNew = () => {
      setOrderId(null);
      setDisplayId(undefined);
      setOrderDate('');
      setSelectedSupplier(null);
      setPep('');
      setRows([{ sku: '', description: '', quantity: 1, unit: 'UN', unitPrice: 0, isCustom: false, showSuggestions: false, similarityChecked: false }]);
      setExpandedRow(0);
      setViewMode('CREATE');
  };

  const getStatusBadge = (status: PurchaseOrder['status']) => {
      switch(status) {
          case 'PENDING_APPROVAL': return <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold border border-amber-200 flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Aguarda Aprovação</span>;
          case 'APPROVED': return <span className="px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold border border-green-200 flex items-center gap-1"><CheckCircle className="w-3 h-3"/> Aprovado</span>;
          case 'REJECTED': return <span className="px-2 py-1 rounded-full bg-red-100 text-red-700 text-xs font-bold border border-red-200 flex items-center gap-1"><XCircle className="w-3 h-3"/> Rejeitado</span>;
          case 'SENT': return <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold border border-blue-200 flex items-center gap-1"><Check className="w-3 h-3"/> Emitido</span>;
          default: return <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200">Rascunho</span>;
      }
  };

  return (
    <div className="pb-48 md:pb-24">
      {/* ... (Modal logic same as before) ... */}
      {/* Modal */}
      {similarityModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl w-full max-w-md p-6 border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto">
                  <h3 className="font-bold text-lg mb-4 text-slate-800 dark:text-white">Verificar Material</h3>
                  
                  {similarityStep === 'LIST' && (
                      <div className="space-y-2">
                          <p className="text-sm text-slate-500 mb-2">Sugestões encontradas:</p>
                          {similarityResults.map((res, idx) => (
                              <button key={idx} onClick={() => { setSelectedCandidate(res); setSimilarityStep('CONFIRM_MATCH'); }} className="w-full text-left p-3 border rounded hover:bg-slate-50 dark:hover:bg-slate-700 dark:border-slate-600">
                                  <div className="font-bold text-sm text-brand-600">{res.sku}</div>
                                  <div className="text-sm text-slate-700 dark:text-slate-300">{res.description}</div>
                              </button>
                          ))}
                          {similarityResults.length === 0 && <div className="text-center p-4 text-slate-400">Sem sugestões.</div>}
                          <button onClick={() => setSimilarityStep('CONFIRM_NEW')} className="w-full mt-4 p-3 bg-amber-50 text-amber-700 border border-amber-200 rounded font-bold">Material Novo / Não Listado</button>
                          <button onClick={() => setSimilarityModalOpen(false)} className="w-full mt-2 p-2 text-slate-500">Cancelar</button>
                      </div>
                  )}

                  {similarityStep === 'CONFIRM_MATCH' && selectedCandidate && (
                      <div className="text-center space-y-4">
                          <p>Confirmar este material?</p>
                          <div className="bg-slate-100 dark:bg-slate-700 p-4 rounded">
                              <div className="font-bold">{selectedCandidate.sku}</div>
                              <div>{selectedCandidate.description}</div>
                          </div>
                          <div className="flex gap-2">
                              <button onClick={() => setSimilarityStep('LIST')} className="flex-1 p-2 border rounded">Voltar</button>
                              <button onClick={handleConfirmMatch} className="flex-1 p-2 bg-green-600 text-white rounded">Confirmar</button>
                          </div>
                      </div>
                  )}

                  {similarityStep === 'CONFIRM_NEW' && (
                      <div className="text-center space-y-4">
                          <p>Confirmar criação de novo material?</p>
                          <div className="flex gap-2">
                              <button onClick={() => setSimilarityStep('LIST')} className="flex-1 p-2 border rounded">Voltar</button>
                              <button onClick={handleConfirmNew} className="flex-1 p-2 bg-amber-600 text-white rounded">Criar Novo</button>
                          </div>
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* Main Content */}
      {viewMode === 'LIST' ? (
          <div className="space-y-6">
              <div className="flex justify-between items-center">
                  <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Pedidos de Compra</h2>
                  <button onClick={handleNew} className="bg-purple-600 text-white px-4 py-2 rounded-lg flex items-center gap-2"><Plus className="w-4 h-4"/> Novo</button>
              </div>
              
              <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                        <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 font-semibold">
                            <tr>
                                <th className="p-4 whitespace-nowrap">ID</th>
                                <th className="p-4 whitespace-nowrap">Data</th>
                                <th className="p-4 whitespace-nowrap">Fornecedor</th>
                                <th className="p-4 whitespace-nowrap">Responsável</th>
                                <th className="p-4 text-right whitespace-nowrap">Total</th>
                                <th className="p-4 text-center whitespace-nowrap">Status</th>
                                <th className="p-4 text-right whitespace-nowrap">Ação</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                            {savedOrders.map(po => {
                                const isExpanded = expandedOrderId === po.id;
                                return (
                                    <React.Fragment key={po.id}>
                                        <tr 
                                            onClick={() => toggleExpandListOrder(po.id)}
                                            className={`transition-colors cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 ${isExpanded ? 'bg-slate-50 dark:bg-slate-700/50' : ''}`}
                                        >
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
                                                    <span className="font-mono font-bold text-slate-600 dark:text-slate-300">#{po.displayId}</span>
                                                </div>
                                            </td>
                                            <td className="p-4 whitespace-nowrap">{new Date(po.dateCreated).toLocaleDateString()}</td>
                                            <td className="p-4 font-bold whitespace-nowrap">{po.supplier.name}</td>
                                            <td className="p-4 whitespace-nowrap">{po.creator}</td>
                                            <td className="p-4 text-right whitespace-nowrap">{po.grandTotal.toFixed(2)} €</td>
                                            <td className="p-4 text-center whitespace-nowrap">
                                                {getStatusBadge(po.status)}
                                            </td>
                                            <td className="p-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex justify-end gap-2">
                                                    <button onClick={() => handlePrintOrder(po)} className="text-blue-600 hover:text-blue-800 p-1 bg-blue-50 dark:bg-blue-900/30 rounded" title="Imprimir PDF"><FileText className="w-4 h-4"/></button>
                                                    
                                                    {/* Edit only if not approved/rejected, or if admin */}
                                                    {['DRAFT', 'SENT', 'PENDING_APPROVAL'].includes(po.status) && (
                                                        <button onClick={() => handleEdit(po)} className="text-purple-600 hover:text-purple-800 p-1 bg-purple-50 dark:bg-purple-900/30 rounded" title="Editar"><Edit className="w-4 h-4"/></button>
                                                    )}
                                                    
                                                    <button onClick={() => handleDelete(po.id)} className="text-red-600 hover:text-red-800 p-1 bg-red-50 dark:bg-red-900/30 rounded" title="Excluir"><Trash2 className="w-4 h-4"/></button>
                                                </div>
                                            </td>
                                        </tr>
                                        {isExpanded && (
                                            <tr className="bg-slate-50 dark:bg-slate-800/50">
                                                <td colSpan={7} className="p-0">
                                                    <div className="p-4 border-t border-slate-100 dark:border-slate-700 animate-fade-in pl-12">
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 text-xs text-slate-500 dark:text-slate-400">
                                                            <div>
                                                                <span className="font-bold">PEP/Obra:</span> {po.pep || '-'}
                                                            </div>
                                                            <div>
                                                                <span className="font-bold">Condição Pagamento:</span> {String(po.supplier.paymentTerms) === '0' ? 'Pronto Pagamento' : (po.supplier.paymentTerms || 'A Definir')}
                                                            </div>
                                                            {po.approvalMetadata?.approverEmail && (
                                                                <div className="col-span-2">
                                                                    <span className="font-bold">Aprovação Necessária de:</span> {po.approvalMetadata.approverEmail}
                                                                    {po.approvalMetadata.approvedBy && <span className="text-green-600 ml-2">(Aprovado por {po.approvalMetadata.approvedBy} em {new Date(po.approvalMetadata.approvedAt!).toLocaleDateString()})</span>}
                                                                    {po.approvalMetadata.rejectedBy && <span className="text-red-600 ml-2">(Rejeitado por {po.approvalMetadata.rejectedBy})</span>}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="overflow-x-auto mb-4">
                                                            <table className="w-full text-sm text-left bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700">
                                                                <thead className="text-xs text-slate-500 uppercase bg-slate-100 dark:bg-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700">
                                                                    <tr>
                                                                        <th className="px-4 py-2">Ref</th>
                                                                        <th className="px-4 py-2">Descrição</th>
                                                                        <th className="px-4 py-2 text-right">Qtd</th>
                                                                        <th className="px-4 py-2 text-right">Preço</th>
                                                                        <th className="px-4 py-2 text-right">Total</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-200 dark:divide-slate-700 text-slate-700 dark:text-slate-300">
                                                                    {po.items.map((item, idx) => (
                                                                        <tr key={idx}>
                                                                            <td className="px-4 py-2 font-mono text-xs">{item.sku}</td>
                                                                            <td className="px-4 py-2">{item.description}</td>
                                                                            <td className="px-4 py-2 text-right">{item.quantity} {item.unit}</td>
                                                                            <td className="px-4 py-2 text-right">{Number(item.unitPrice).toFixed(2)} €</td>
                                                                            <td className="px-4 py-2 text-right font-medium">{(Number(item.quantity) * Number(item.unitPrice)).toFixed(2)} €</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>

                                                        {/* APPROVAL ACTIONS */}
                                                        {po.status === 'PENDING_APPROVAL' && canApprove && (
                                                            <div className="flex gap-3 justify-end pt-2 border-t border-slate-200 dark:border-slate-700">
                                                                <button 
                                                                    onClick={() => handleApprovalAction(po, 'REJECT')}
                                                                    className="px-4 py-2 bg-red-100 text-red-700 hover:bg-red-200 rounded font-bold text-sm flex items-center gap-1"
                                                                >
                                                                    <XCircle className="w-4 h-4"/> Rejeitar
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleApprovalAction(po, 'APPROVE')}
                                                                    className="px-4 py-2 bg-green-600 text-white hover:bg-green-700 rounded font-bold text-sm flex items-center gap-1"
                                                                >
                                                                    <ShieldCheck className="w-4 h-4"/> Aprovar Pedido
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                            {savedOrders.length === 0 && <tr><td colSpan={7} className="p-8 text-center">Sem pedidos.</td></tr>}
                        </tbody>
                    </table>
                  </div>
              </div>
          </div>
      ) : (
          <div className="space-y-6">
              <div className="flex items-center gap-4">
                  <button onClick={() => setViewMode('LIST')} className="p-2 hover:bg-slate-100 rounded-full"><ArrowLeft/></button>
                  <h2 className="text-xl font-bold">{orderId ? `Editar #${displayId}` : 'Novo Pedido'}</h2>
              </div>

              <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Supplier */}
                  <div className="relative">
                      <label className={`block text-xs font-bold uppercase mb-1 ${!selectedSupplier ? 'text-red-500' : 'text-slate-500'}`}>Fornecedor *</label>
                      {!selectedSupplier ? (
                          <>
                            <input 
                                type="text" 
                                value={supplierSearch} 
                                onChange={e => setSupplierSearch(e.target.value)} 
                                placeholder="Procurar fornecedor..."
                                className="w-full p-2 border border-red-300 bg-red-50 dark:bg-red-900/10 dark:border-red-800 rounded dark:text-white"
                            />
                            {supplierSearch && (
                                <div className="absolute z-10 w-full bg-white dark:bg-slate-800 border mt-1 max-h-40 overflow-y-auto shadow-lg">
                                    {filteredSuppliers.map(s => (
                                        <div key={s.code} onClick={() => handleSupplierSelect(s)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer">
                                            <div className="font-bold">{s.name}</div>
                                            <div className="text-xs text-slate-500">{s.code}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                          </>
                      ) : (
                          <div className="p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded flex justify-between items-center">
                              <div>
                                  <div className="font-bold text-purple-900 dark:text-purple-300">{selectedSupplier.name}</div>
                                  <div className="text-xs text-purple-600 dark:text-purple-400">{selectedSupplier.address}</div>
                              </div>
                              <button onClick={() => setSelectedSupplier(null)}><X className="w-4 h-4"/></button>
                          </div>
                      )}
                  </div>

                  {/* PEP */}
                  <div>
                      <label className={`block text-xs font-bold uppercase mb-1 flex items-center gap-1 ${!pep.trim() || !validatePep() ? 'text-red-500' : 'text-slate-500'}`}>
                          <Hash className="w-3 h-3" /> PEP / Projeto *
                      </label>
                      <input 
                        type="text" 
                        value={pep} 
                        onChange={handlePepChange}
                        className={`w-full p-2 border rounded dark:bg-slate-900 dark:text-white ${!pep.trim() || !validatePep() ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : 'border-slate-300 dark:border-slate-600'}`}
                        placeholder="1700.000/000/0000"
                      />
                      <p className="text-[10px] text-slate-400 mt-1 pl-1">
                          Formato: 1700.xxx/xxx... (AVAC) ou 2200.xxx/xxx... (Hotelaria)
                      </p>
                  </div>
              </div>

              {/* Rows */}
              <div className="space-y-3">
                  {rows.map((row, idx) => {
                      const matches = getMaterialMatches(row.description);
                      const isExpanded = idx === expandedRow;
                      
                      const isDescMissing = !row.description || row.description.trim().length === 0;
                      const isUnverified = !row.similarityChecked;
                      const isQtyInvalid = Number(row.quantity) <= 0;
                      const isPriceInvalid = Number(row.unitPrice) <= 0;
                      const hasRowError = isDescMissing || isUnverified || isQtyInvalid || isPriceInvalid;

                      return (
                          <div key={idx} className={`bg-white dark:bg-slate-800 border transition-all rounded-lg overflow-hidden ${isExpanded ? 'border-purple-300 dark:border-purple-700 ring-1 ring-purple-100 dark:ring-purple-900' : 'border-slate-200 dark:border-slate-700'} ${(hasRowError) && !isExpanded ? 'border-red-300 bg-red-50 dark:bg-red-900/10' : ''}`}>
                              {/* Header Row */}
                              <div 
                                onClick={() => setExpandedRow(isExpanded ? -1 : idx)}
                                className="p-3 flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                              >
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <span className="font-bold text-xs bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded whitespace-nowrap">Item {idx + 1}</span>
                                    {!isExpanded && (
                                        <div className="text-sm truncate flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                            <span className={`font-bold ${isQtyInvalid ? 'text-red-500' : ''}`}>{row.quantity}x</span>
                                            <span className={`truncate ${isDescMissing ? 'text-red-500 italic' : ''}`}>{row.description || '(Sem descrição)'}</span>
                                            {row.isCustom && <span className="text-[10px] bg-blue-100 text-blue-800 px-1 rounded">Novo</span>}
                                            {hasRowError && <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    {isExpanded ? <ChevronUp className="w-4 h-4 text-purple-500"/> : <ChevronDown className="w-4 h-4 text-slate-400"/>}
                                    <button onClick={(e) => { e.stopPropagation(); removeRow(idx); }} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded">
                                        <Trash2 className="w-4 h-4"/>
                                    </button>
                                </div>
                              </div>

                              {/* Form Body */}
                              {isExpanded && (
                                <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50">
                                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                                        <div className="md:col-span-6 relative">
                                            <label className={`block text-[10px] font-bold uppercase ${isDescMissing || isUnverified ? 'text-red-500' : 'text-slate-400'}`}>Descrição *</label>
                                            <input 
                                                type="text" 
                                                value={row.description} 
                                                onChange={e => updateRow(idx, 'description', e.target.value)}
                                                className={`w-full p-2 border rounded dark:bg-slate-900 dark:text-white ${isDescMissing || isUnverified ? 'border-red-400 ring-1 ring-red-200' : 'border-slate-300 dark:border-slate-600'}`}
                                            />
                                            {row.showSuggestions && matches.length > 0 && (
                                                <div className="absolute z-10 w-full bg-white dark:bg-slate-800 border shadow-lg mt-1 rounded">
                                                    {matches.map(m => (
                                                        <div key={m.sku} onClick={() => handleMaterialSelect(idx, m)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer">
                                                            <div className="font-bold text-xs">{m.sku}</div>
                                                            <div className="text-sm">{m.description}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <div className="flex justify-between items-center mt-1">
                                                <div className="text-xs text-slate-400 font-mono">{row.sku || '-'}</div>
                                                {!row.similarityChecked ? (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] text-red-600 font-bold flex items-center gap-1"><AlertCircle className="w-3 h-3"/> Verificação Pendente</span>
                                                        <button onClick={() => handleCheckSimilarity(idx)} className="text-xs bg-amber-500 text-white px-3 py-1.5 rounded font-bold flex items-center gap-1 hover:bg-amber-600 shadow-sm">
                                                            <Search className="w-3 h-3"/> Verificar
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded font-bold flex items-center gap-1"><Check className="w-3 h-3"/> OK</span>
                                                )}
                                            </div>
                                        </div>
                                        
                                        <div className="md:col-span-2">
                                            <label className={`block text-[10px] font-bold uppercase ${isQtyInvalid ? 'text-red-500' : 'text-slate-400'}`}>Qtd *</label>
                                            <input 
                                                type="number" 
                                                value={row.quantity} 
                                                onChange={e => updateRow(idx, 'quantity', e.target.value)} 
                                                className={`w-full p-2 border rounded dark:bg-slate-900 dark:text-white ${isQtyInvalid ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : 'border-slate-300 dark:border-slate-600'}`}
                                            />
                                        </div>

                                        <div className="md:col-span-2">
                                            <label className="block text-[10px] font-bold uppercase text-slate-400">Unid</label>
                                            <select value={row.unit} onChange={e => updateRow(idx, 'unit', e.target.value)} className="w-full p-2 border rounded dark:bg-slate-900 dark:text-white dark:border-slate-600">
                                                {unitOptions.map(u => <option key={u.value} value={u.value}>{u.value}</option>)}
                                            </select>
                                        </div>

                                        <div className="md:col-span-2">
                                            <label className={`block text-[10px] font-bold uppercase ${isPriceInvalid ? 'text-red-500' : 'text-slate-400'}`}>Preço *</label>
                                            <input 
                                                type="number" 
                                                value={row.unitPrice} 
                                                onChange={e => updateRow(idx, 'unitPrice', e.target.value)} 
                                                className={`w-full p-2 border rounded dark:bg-slate-900 dark:text-white ${isPriceInvalid ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : 'border-slate-300 dark:border-slate-600'}`}
                                            />
                                        </div>
                                    </div>
                                </div>
                              )}
                          </div>
                      );
                  })}
                  <button onClick={addRow} className="w-full p-3 border-2 border-dashed rounded-lg text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800">Adicionar Linha</button>
              </div>

              {/* Footer */}
              <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 p-4 shadow-lg lg:pl-64 flex flex-col md:flex-row justify-between items-center gap-4">
                  <div className="flex gap-6">
                      <div>
                          <div className="text-xs uppercase text-slate-500">Subtotal</div>
                          <div className="font-bold">{subTotal.toFixed(2)} €</div>
                      </div>
                      <div>
                          <div className="text-xs uppercase text-slate-500">IVA (23%)</div>
                          <div className="font-bold">{vatTotal.toFixed(2)} €</div>
                      </div>
                      <div className="pl-6 border-l">
                          <div className="text-xs uppercase text-brand-600 font-bold">Total</div>
                          <div className="text-xl font-bold">{grandTotal.toFixed(2)} €</div>
                      </div>
                  </div>
                  
                  <div className="flex items-center gap-4 w-full md:w-auto">
                      {!isFormValid && (
                          <div className="text-xs text-red-600 dark:text-red-400 font-bold flex items-center gap-1 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg border border-red-200 dark:border-red-800">
                              <AlertCircle className="w-4 h-4" />
                              Preencha os campos obrigatórios
                          </div>
                      )}
                      
                      <div className="flex gap-2 flex-1 justify-end">
                          <button 
                            onClick={handleSave} 
                            disabled={!isFormValid}
                            className={`px-6 py-2 rounded flex items-center justify-center gap-2 font-bold transition-colors shadow-sm w-full md:w-auto ${!isFormValid ? 'bg-slate-300 text-slate-500 cursor-not-allowed dark:bg-slate-700 dark:text-slate-400' : 'bg-purple-600 text-white hover:bg-purple-700'}`}
                          >
                              {loading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
                              Salvar Pedido
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default PurchaseOrderManager;
