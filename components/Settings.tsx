
import React, { useState, useEffect, useRef } from 'react';
import { StorageService, DEFAULT_PERMISSIONS } from '../services/storageService';
import { EmailRecipient, Company, UnitOption, Supplier, CategoryOption, ApprovalRule, UserRole, RolePermissions, SynonymGroup } from '../types';
import { Save, Mail, Loader2, AlertCircle, Plus, Trash2, Building, ShieldCheck, Scale, Truck, FileSpreadsheet, Tag, Euro, Edit, X, Lock, Search } from 'lucide-react';

declare const XLSX: any;

const Settings: React.FC = () => {
  const [recipients, setRecipients] = useState<EmailRecipient[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [newCompany, setNewCompany] = useState('');
  const [adminAccessCode, setAdminAccessCode] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  
  // Synonyms
  const [synonyms, setSynonyms] = useState<SynonymGroup[]>([]);
  const [newSynonymsInput, setNewSynonymsInput] = useState('');
  
  // Unit Options
  const [unitOptions, setUnitOptions] = useState<UnitOption[]>([]);
  const [newUnitAbbr, setNewUnitAbbr] = useState('');
  const [newUnitDesc, setNewUnitDesc] = useState('');

  // Categories
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [newCatCode, setNewCatCode] = useState('');
  const [newCatName, setNewCatName] = useState('');

  // Approval Rules
  const [approvalRules, setApprovalRules] = useState<ApprovalRule[]>([]);
  const [newRuleAmount, setNewRuleAmount] = useState('');
  const [newRuleRole, setNewRuleRole] = useState('');
  const [newRuleOperator, setNewRuleOperator] = useState<'LTE' | 'GTE'>('LTE');
  const [editingRuleIndex, setEditingRuleIndex] = useState<number | null>(null);

  // Permissions
  const [permissions, setPermissions] = useState<Record<string, RolePermissions>>(DEFAULT_PERMISSIONS);
  const [newRoleName, setNewRoleName] = useState('');

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const isInitialMount = useRef(true);
  
  const supplierFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        await StorageService.saveSettings({ 
            emailRecipients: recipients,
            notificationEmail: recipients.length > 0 ? recipients[0].email : '',
            companies: companies,
            adminAccessCode: adminAccessCode, 
            unitOptions: unitOptions,
            suppliers: suppliers,
            categories: categories,
            approvalRules: approvalRules,
            permissions: permissions,
            synonyms: synonyms,
            autoDecrementStock: true 
        });
        setMessage('Configurações salvas automaticamente.');
        setTimeout(() => setMessage(''), 3000);
      } catch (err) {
        setMessage('Erro ao salvar automaticamente.');
      } finally {
        setLoading(false);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [recipients, companies, adminAccessCode, unitOptions, suppliers, categories, approvalRules, permissions, synonyms, isLoaded]);

  const loadSettings = async () => {
    const settings = await StorageService.getSettings();
    // Migration helper: if old email exists but new list is empty
    if ((!settings.emailRecipients || settings.emailRecipients.length === 0) && settings.notificationEmail) {
        setRecipients([{ email: settings.notificationEmail, type: 'TO' }]);
    } else {
        setRecipients(settings.emailRecipients || []);
    }
    setCompanies(settings.companies || []);
    setAdminAccessCode(settings.adminAccessCode || '');
    if (settings.unitOptions) {
        setUnitOptions(settings.unitOptions);
    }
    setSuppliers(settings.suppliers || []);
    
    // Load categories
    if (settings.categories && settings.categories.length > 0) {
        setCategories(settings.categories);
    } else {
        import('../services/storageService').then(mod => {
             if(settings.categories) setCategories(settings.categories);
             else setCategories(mod.DEFAULT_CATEGORIES);
        });
    }

    // Load Permissions
    if (settings.permissions) {
        setPermissions(settings.permissions);
    }

    // Load Approval Rules - Normalize old data (maxAmount -> amount + LTE)
    const normalizedRules = (settings.approvalRules || []).map((r: any) => ({
        amount: r.amount !== undefined ? r.amount : r.maxAmount,
        approverRole: r.approverRole,
        approverEmail: r.approverEmail,
        operator: r.operator || 'LTE'
    }));
    setApprovalRules(normalizedRules);

    // Load Synonyms
    setSynonyms(settings.synonyms || []);
    
    setIsLoaded(true);
  };

  const togglePermission = (role: string, key: keyof RolePermissions) => {
      // Prevent locking Admin out of critical features
      if (role === UserRole.ADMIN && (key === 'canManageSettings' || key === 'canManageUsers')) {
          return;
      }

      setPermissions(prev => ({
          ...prev,
          [role]: {
              ...prev[role],
              [key]: !prev[role][key]
          }
      }));
  };

  const addRole = () => {
      if (!newRoleName.trim()) return;
      const roleKey = newRoleName.trim().toUpperCase().replace(/\s+/g, '_');
      
      if (permissions[roleKey]) {
          alert("Esta função já existe.");
          return;
      }

      // Default permissions for new role (copy Viewer or empty)
      const newPermissions: RolePermissions = {
          canCreateOrder: false,
          canViewOpenOrders: false,
          canViewOwnOpenOrders: false,
          canViewFinishedOrders: false,
          canViewOwnFinishedOrders: false,
          canCreatePurchaseOrder: false,
          canViewStock: false,
          canManageStock: false,
          canViewReceipts: false,
          canViewTransfers: false,
          canViewShortages: false,
          canSearch: false,
          canManageUsers: false,
          canManageSettings: false
      };

      setPermissions(prev => ({
          ...prev,
          [roleKey]: newPermissions
      }));
      setNewRoleName('');
  };

  const removeRole = async (role: string) => {
      if (role === UserRole.ADMIN) {
          alert("Não é possível remover a função de Administrador.");
          return;
      }
      
      if (window.confirm(`Remover a função "${role}"?`)) {
          const newPerms = { ...permissions };
          delete newPerms[role];
          setPermissions(newPerms);
          
          const newRules = approvalRules.filter(rule => rule.approverRole !== role);
          setApprovalRules(newRules);
      }
  };

  const renameRolePrompt = async (role: string) => {
      const newName = window.prompt(`Novo nome para a função "${getRoleLabel(role)}":`, getRoleLabel(role));
      if (!newName || newName.trim() === '' || newName === role) return;
      
      const newRoleKey = newName.trim();
      
      if (permissions[newRoleKey]) {
          alert("Já existe uma função com este nome.");
          return;
      }

      const newPerms = { ...permissions };
      newPerms[newRoleKey] = newPerms[role];
      delete newPerms[role];

      const newRules = approvalRules.map(rule => {
          if (rule.approverRole === role) {
              return { ...rule, approverRole: newRoleKey };
          }
          return rule;
      });

      setPermissions(newPerms);
      setApprovalRules(newRules);

      try {
          const users = await StorageService.getUsers();
          const usersToUpdate = users.filter(u => u.role === role);
          for (const u of usersToUpdate) {
              await StorageService.updateUserRole(u.uid, newRoleKey);
          }
          
          alert("Função renomeada com sucesso.");
      } catch (e) {
          console.error(e);
          alert("Erro ao renomear função.");
      }
  };

  // ... (Recipients, Companies, Units, Categories logic unchanged)
  const addRecipient = () => { setRecipients([...recipients, { email: '', type: 'TO' }]); };
  const removeRecipient = (index: number) => { const updated = [...recipients]; updated.splice(index, 1); setRecipients(updated); };
  const updateRecipient = (index: number, field: keyof EmailRecipient, value: string) => { const updated = [...recipients]; updated[index] = { ...updated[index], [field]: value }; setRecipients(updated); };

  const addCompany = () => { if (!newCompany.trim()) return; const id = Date.now().toString(); setCompanies([...companies, { id, name: newCompany.trim() }]); setNewCompany(''); };
  const removeCompany = (id: string) => { setCompanies(companies.filter(c => c.id !== id)); };

  const addUnit = () => {
      if (!newUnitAbbr.trim() || !newUnitDesc.trim()) { alert("Preencha a abreviatura e a descrição."); return; }
      const abbr = newUnitAbbr.trim().toUpperCase();
      if (unitOptions.some(u => u.value === abbr)) { alert("Esta unidade já existe."); return; }
      setUnitOptions([...unitOptions, { value: abbr, description: newUnitDesc.trim() }]);
      setNewUnitAbbr(''); setNewUnitDesc('');
  };
  const removeUnit = (unitToRemove: string) => { setUnitOptions(unitOptions.filter(u => u.value !== unitToRemove)); };

  const addCategory = () => {
      if (!newCatCode.trim() || !newCatName.trim()) { alert("Preencha o código (3 letras) e o nome."); return; }
      const code = newCatCode.trim().toUpperCase();
      if (categories.some(c => c.code === code)) { alert("Este código de categoria já existe."); return; }
      setCategories([...categories, { code: code, name: newCatName.trim().toUpperCase() }]);
      setNewCatCode(''); setNewCatName('');
  };
  const removeCategory = (codeToRemove: string) => { if(window.confirm("Remover esta categoria?")) { setCategories(categories.filter(c => c.code !== codeToRemove)); } };

  // APPROVAL RULES LOGIC
  const saveApprovalRule = () => {
      const amount = parseFloat(newRuleAmount);
      if (isNaN(amount) || amount <= 0 || !newRuleRole.trim()) {
          alert("Preencha um valor válido e selecione uma função.");
          return;
      }
      
      const newRules = [...approvalRules];
      const rule: ApprovalRule = { amount: amount, approverRole: newRuleRole, operator: newRuleOperator };

      if (editingRuleIndex !== null) {
          // Edit existing
          newRules[editingRuleIndex] = rule;
      } else {
          // Add new
          newRules.push(rule);
      }
      
      // Sort by amount ascending
      newRules.sort((a, b) => a.amount - b.amount);
      
      setApprovalRules(newRules);
      resetRuleForm();
  };

  const editApprovalRule = (idx: number) => {
      const rule = approvalRules[idx];
      setNewRuleAmount(rule.amount.toString());
      setNewRuleRole(rule.approverRole || '');
      setNewRuleOperator(rule.operator);
      setEditingRuleIndex(idx);
  };

  const removeApprovalRule = (idx: number) => {
      if(window.confirm("Remover esta regra?")) {
          const newRules = [...approvalRules];
          newRules.splice(idx, 1);
          setApprovalRules(newRules);
          if (editingRuleIndex === idx) resetRuleForm();
      }
  };

  const resetRuleForm = () => {
      setNewRuleAmount('');
      setNewRuleRole('');
      setNewRuleOperator('LTE');
      setEditingRuleIndex(null);
  };

  // SYNONYMS LOGIC
  const addSynonymGroup = () => {
      if (!newSynonymsInput.trim()) return;
      const words = newSynonymsInput.split(',').map(w => w.trim()).filter(w => w.length > 0);
      if (words.length < 2) {
          alert("Insira pelo menos duas palavras separadas por vírgula.");
          return;
      }
      const newGroup: SynonymGroup = {
          id: Date.now().toString(),
          words: words
      };
      setSynonyms([...synonyms, newGroup]);
      setNewSynonymsInput('');
  };

  const removeSynonymGroup = (id: string) => {
      if(window.confirm("Remover este grupo de sinónimos?")) {
          setSynonyms(synonyms.filter(s => s.id !== id));
      }
  };

  const handleSupplierUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (supplierFileRef.current) supplierFileRef.current.value = '';
      const reader = new FileReader();
      reader.onload = async (evt) => {
          try {
              const data = evt.target?.result;
              const wb = XLSX.read(data, { type: 'array' });
              const ws = wb.Sheets[wb.SheetNames[0]];
              const jsonData: any[] = XLSX.utils.sheet_to_json(ws);
              if (jsonData.length === 0) throw new Error("Ficheiro vazio.");
              const required = ['Fornecedor', 'Nome', 'Dias pagamento', 'Morada'];
              const missing = required.filter(col => !(col in jsonData[0]));
              if (missing.length > 0) throw new Error(`Colunas em falta: ${missing.join(', ')}`);
              const newSuppliers: Supplier[] = jsonData.map(row => ({ code: row['Fornecedor']?.toString() || '', name: row['Nome']?.toString() || '', paymentTerms: row['Dias pagamento']?.toString() || '', address: row['Morada']?.toString() || '' })).filter(s => s.code && s.name);
              if (newSuppliers.length === 0) throw new Error("Nenhum fornecedor válido encontrado.");
              setSuppliers(newSuppliers);
              alert(`${newSuppliers.length} fornecedores importados. Clique em "Salvar" para confirmar.`);
          } catch(err: any) { alert("Erro na importação: " + err.message); }
      };
      reader.readAsArrayBuffer(file);
  };

  const PERMISSION_LABELS: Record<keyof RolePermissions, string> = {
      canCreateOrder: "Criar Pedidos Armazém",
      canViewOpenOrders: "Ver Pedidos Abertos",
      canViewOwnOpenOrders: "Ver Pedidos Abertos (User)",
      canViewFinishedOrders: "Ver Pedidos Finalizados",
      canViewOwnFinishedOrders: "Ver Pedidos Finalizados (User)",
      canCreatePurchaseOrder: "Criar Pedidos Compra",
      canViewStock: "Visualizar Stock",
      canManageStock: "Gerir Stock (Upload)",
      canViewReceipts: "Ver Entradas",
      canViewShortages: "Relatório de Faltas",
      canViewTransfers: "Ver Transferências",
      canSearch: "Pesquisar",
      canManageUsers: "Gerir Utilizadores",
      canManageSettings: "Gerir Configurações"
  };

  const ROLES_TO_CONFIGURE = Object.keys(permissions).filter(role => role !== UserRole.ADMIN);
  const defaultRoles = [UserRole.MANAGEMENT, UserRole.WAREHOUSE, UserRole.TECHNICAL, UserRole.VIEWER];
  
  ROLES_TO_CONFIGURE.sort((a, b) => {
      const idxA = defaultRoles.indexOf(a as any);
      const idxB = defaultRoles.indexOf(b as any);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB; // Both default: keep original order
      if (idxA !== -1) return -1; // A is default, B is custom: A comes first
      if (idxB !== -1) return 1; // B is default, A is custom: B comes first
      return a.localeCompare(b); // Both custom: sort alphabetically
  });

  const getRoleLabel = (role: string) => {
      if (role === 'NO_APPROVAL') return 'Sem aprovação';
      if (role === UserRole.MANAGEMENT) return 'Coordenação';
      if (role === UserRole.WAREHOUSE) return 'Logística';
      if (role === UserRole.TECHNICAL) return 'Técnico';
      if (role === UserRole.VIEWER) return 'Viewer';
      if (role === UserRole.ADMIN) return 'Administrador';
      return role;
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in pb-12">
      <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
        Configurações do Sistema
      </h2>

      {/* PERMISSIONS MATRIX */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800 dark:text-white">
            <Lock className="w-5 h-5 text-brand-600"/> Matriz de Permissões
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Defina o que cada função pode fazer ou visualizar no sistema.
        </p>
        
        <div className="flex gap-2 mb-4 items-end">
            <div className="flex-1">
                <label className="block text-xs font-bold text-slate-500 mb-1">Nova Função</label>
                <input 
                    type="text"
                    value={newRoleName}
                    onChange={(e) => setNewRoleName(e.target.value)}
                    placeholder="Nome da Função (Ex: Supervisor)"
                    className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-brand-500 outline-none text-sm dark:bg-slate-900 dark:text-white uppercase"
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addRole())}
                />
            </div>
            <button 
                type="button"
                onClick={addRole}
                className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 text-sm font-medium h-[38px]"
            >
                Adicionar
            </button>
        </div>

        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
                <thead>
                    <tr className="bg-slate-100 dark:bg-slate-900 border-b dark:border-slate-700">
                        <th className="p-3 font-semibold text-slate-700 dark:text-slate-200 min-w-[200px]">Funcionalidade</th>
                        {ROLES_TO_CONFIGURE.map(role => (
                            <th key={role} className="p-3 text-center font-semibold text-slate-700 dark:text-slate-200 capitalize relative group">
                                <div className="flex items-center justify-center gap-1">
                                    <span>{getRoleLabel(role)}</span>
                                    {role !== UserRole.ADMIN ? (
                                        <div className="flex items-center">
                                            <button 
                                                onClick={() => renameRolePrompt(role)}
                                                className="text-slate-400 hover:text-blue-500 transition-colors p-1"
                                                title="Renomear Função"
                                            >
                                                <Edit className="w-3 h-3" />
                                            </button>
                                            <button 
                                                onClick={() => removeRole(role)}
                                                className="text-slate-400 hover:text-red-500 transition-colors p-1"
                                                title="Remover Função"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="text-slate-300 dark:text-slate-600 cursor-help" title="Administrador não pode ser removido">
                                            <Lock className="w-3 h-3" />
                                        </div>
                                    )}
                                </div>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {(Object.keys(PERMISSION_LABELS) as Array<keyof RolePermissions>).map(key => (
                        <tr key={key} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                            <td className="p-3 font-medium text-slate-600 dark:text-slate-300">{PERMISSION_LABELS[key]}</td>
                            {ROLES_TO_CONFIGURE.map(role => (
                                <td key={`${role}-${key}`} className="p-3 text-center">
                                    <input 
                                        type="checkbox"
                                        checked={permissions[role]?.[key] || false}
                                        onChange={() => togglePermission(role, key)}
                                        className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500 border-gray-300 cursor-pointer"
                                    />
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
      </div>

      {/* ADMIN CODE */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-purple-800 dark:text-purple-400">
            <ShieldCheck className="w-5 h-5 text-purple-600 dark:text-purple-500"/> Segurança Admin
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Defina o código necessário para criar novas contas de Administrador.
        </p>
        <div className="mb-4">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Código de Acesso Mestre</label>
            <input 
                type="text" 
                value={adminAccessCode}
                onChange={(e) => setAdminAccessCode(e.target.value)}
                placeholder="Ex: SenhaForte123 (Deixe em branco para usar o padrão)"
                className="w-full p-2 border border-purple-200 dark:border-purple-800 rounded-md bg-purple-50 dark:bg-purple-900/20 text-purple-900 dark:text-purple-200 focus:ring-2 focus:ring-purple-500 outline-none font-mono"
            />
        </div>
      </div>

      {/* APPROVAL RULES */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800 dark:text-white">
            <Euro className="w-5 h-5 text-green-600"/> Regras de Aprovação (Pedidos de Compra)
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Defina quem deve aprovar pedidos. O sistema verificará as regras na ordem de valor.
        </p>

        <div className="flex flex-col md:flex-row gap-2 mb-4 items-end">
            <div className="w-full md:w-32">
                <label className="block text-xs font-bold text-slate-500 mb-1">Condição</label>
                <select 
                    value={newRuleOperator}
                    onChange={(e) => setNewRuleOperator(e.target.value as 'LTE' | 'GTE')}
                    className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                >
                    <option value="LTE">Até (Max)</option>
                    <option value="GTE">Maior/Igual (Min)</option>
                </select>
            </div>
            <div className="w-full md:w-32 relative">
                <label className="block text-xs font-bold text-slate-500 mb-1">Valor</label>
                <span className="absolute left-3 top-8 text-slate-400">€</span>
                <input 
                    type="number"
                    value={newRuleAmount}
                    onChange={(e) => setNewRuleAmount(e.target.value)}
                    placeholder="0"
                    className="w-full pl-6 p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-brand-500 outline-none text-sm dark:bg-slate-900 dark:text-white"
                />
            </div>
            <div className="flex-1 w-full">
                <label className="block text-xs font-bold text-slate-500 mb-1">Função Aprovadora</label>
                <select 
                    value={newRuleRole}
                    onChange={(e) => setNewRuleRole(e.target.value)}
                    className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-brand-500 outline-none text-sm dark:bg-slate-900 dark:text-white"
                >
                    <option value="">Selecione...</option>
                    <option value="NO_APPROVAL">Sem aprovação</option>
                    {Object.keys(permissions).map(role => (
                        <option key={role} value={role}>{getRoleLabel(role)}</option>
                    ))}
                </select>
            </div>
            <div className="flex gap-1">
                {editingRuleIndex !== null && (
                    <button 
                        type="button"
                        onClick={resetRuleForm}
                        className="bg-slate-200 text-slate-600 px-3 py-2 rounded-md hover:bg-slate-300 text-sm font-medium"
                        title="Cancelar Edição"
                    >
                        <X className="w-4 h-4"/>
                    </button>
                )}
                <button 
                    type="button"
                    onClick={saveApprovalRule}
                    className={`text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-2 ${editingRuleIndex !== null ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'}`}
                >
                    {editingRuleIndex !== null ? <Save className="w-4 h-4"/> : <Plus className="w-4 h-4"/>}
                    {editingRuleIndex !== null ? 'Atualizar' : 'Adicionar'}
                </button>
            </div>
        </div>

        <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
            <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900 font-semibold text-slate-600 dark:text-slate-300">
                    <tr>
                        <th className="p-3 border-b dark:border-slate-700">Regra</th>
                        <th className="p-3 border-b dark:border-slate-700">Aprovador</th>
                        <th className="p-3 border-b dark:border-slate-700 w-24 text-center">Ações</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                    {approvalRules.length === 0 ? (
                        <tr><td colSpan={3} className="p-4 text-center text-slate-400 italic">Sem regras (Aprovação automática).</td></tr>
                    ) : (
                        approvalRules.map((rule, idx) => (
                            <tr key={idx} className={`hover:bg-slate-50 dark:hover:bg-slate-800 ${editingRuleIndex === idx ? 'bg-amber-50 dark:bg-amber-900/20' : ''}`}>
                                <td className="p-3 font-mono font-bold">
                                    {rule.operator === 'GTE' ? '≥' : '≤'} {rule.amount.toLocaleString()} €
                                </td>
                                <td className="p-3">{rule.approverRole ? getRoleLabel(rule.approverRole) : rule.approverEmail}</td>
                                <td className="p-3 text-center">
                                    <div className="flex justify-center gap-2">
                                        <button onClick={() => editApprovalRule(idx)} className="text-amber-500 hover:text-amber-700 transition-colors">
                                            <Edit className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => removeApprovalRule(idx)} className="text-slate-400 hover:text-red-500 transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
      </div>

      {/* CATEGORY SETTINGS */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800 dark:text-white">
            <Tag className="w-5 h-5 text-slate-500"/> Categorias de Material
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Defina as categorias disponíveis para a criação de novos materiais.
        </p>

        <div className="flex flex-col md:flex-row gap-2 mb-4">
            <input 
                type="text"
                value={newCatCode}
                onChange={(e) => setNewCatCode(e.target.value)}
                placeholder="Cód (Ex: TUB)"
                maxLength={3}
                className="w-full md:w-32 p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-brand-500 outline-none text-sm uppercase dark:bg-slate-900 dark:text-white"
            />
            <input 
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="Nome da Categoria (Ex: TUBAGEM)"
                maxLength={30}
                className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-brand-500 outline-none text-sm dark:bg-slate-900 dark:text-white"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCategory())}
            />
            <button 
                type="button"
                onClick={addCategory}
                className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 text-sm font-medium"
            >
                Adicionar
            </button>
        </div>

        <div className="max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-900 font-semibold sticky top-0">
                    <tr>
                        <th className="p-3 w-24 border-b dark:border-slate-700">Cód.</th>
                        <th className="p-3 border-b dark:border-slate-700">Nome</th>
                        <th className="p-3 w-16 text-center border-b dark:border-slate-700">Ação</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {categories.length === 0 ? (
                        <tr><td colSpan={3} className="p-4 text-center text-slate-400 italic">Nenhuma categoria.</td></tr>
                    ) : (
                        categories.sort((a,b) => a.code.localeCompare(b.code)).map((cat, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                                <td className="p-3 font-bold">{cat.code}</td>
                                <td className="p-3">{cat.name}</td>
                                <td className="p-3 text-center">
                                    <button 
                                        onClick={() => removeCategory(cat.code)}
                                        className="text-slate-400 hover:text-red-500 transition-colors"
                                        title="Remover"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
      </div>

      {/* UNIT OF MEASURE SETTINGS */}
       <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800 dark:text-white">
            <Scale className="w-5 h-5 text-slate-500"/> Unidades de Medida
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Gerencie as opções de unidade de medida disponíveis para novos materiais.
        </p>

        <div className="flex flex-col md:flex-row gap-2 mb-4">
            <input 
                type="text"
                value={newUnitAbbr}
                onChange={(e) => setNewUnitAbbr(e.target.value)}
                placeholder="Abrev (Ex: MT)"
                maxLength={5}
                className="w-full md:w-32 p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-brand-500 outline-none text-sm uppercase dark:bg-slate-900 dark:text-white"
            />
            <input 
                type="text"
                value={newUnitDesc}
                onChange={(e) => setNewUnitDesc(e.target.value)}
                placeholder="Descrição Curta (Ex: Metro)"
                maxLength={30}
                className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-brand-500 outline-none text-sm dark:bg-slate-900 dark:text-white"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addUnit())}
            />
            <button 
                type="button"
                onClick={addUnit}
                className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 text-sm font-medium"
            >
                Adicionar
            </button>
        </div>

        <div className="max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
            <table className="w-full text-left text-sm text-slate-600 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-900 font-semibold sticky top-0">
                    <tr>
                        <th className="p-3 w-24 border-b dark:border-slate-700">Abrev.</th>
                        <th className="p-3 border-b dark:border-slate-700">Descrição</th>
                        <th className="p-3 w-16 text-center border-b dark:border-slate-700">Ação</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {unitOptions.length === 0 ? (
                        <tr><td colSpan={3} className="p-4 text-center text-slate-400 italic">Nenhuma unidade cadastrada.</td></tr>
                    ) : (
                        unitOptions.map((unit, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800">
                                <td className="p-3 font-bold">{unit.value}</td>
                                <td className="p-3">{unit.description}</td>
                                <td className="p-3 text-center">
                                    <button 
                                        onClick={() => removeUnit(unit.value)}
                                        className="text-slate-400 hover:text-red-500 transition-colors"
                                        title="Remover"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
      </div>

      {/* SUPPLIER SETTINGS */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800 dark:text-white">
            <Truck className="w-5 h-5 text-slate-500"/> Fornecedores (Pedidos Autónomos)
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Importe a lista de fornecedores para usar na criação de Pedidos Autónomos.
            <br/><span className="text-xs italic">Colunas: Fornecedor, Nome, Dias pagamento, Morada</span>
        </p>

        <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-4 text-center bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer relative mb-4">
            <input 
                type="file" 
                accept=".xlsx, .xls"
                ref={supplierFileRef}
                onChange={handleSupplierUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="flex flex-col items-center">
                <FileSpreadsheet className="w-6 h-6 text-slate-400 mb-1" />
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Importar Excel de Fornecedores</span>
            </div>
        </div>

        {suppliers.length > 0 && (
            <div className="text-sm text-slate-600 dark:text-slate-400 bg-green-50 dark:bg-green-900/20 p-2 rounded border border-green-200 dark:border-green-800 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                {suppliers.length} fornecedores carregados.
            </div>
        )}
      </div>

      {/* EMAIL SETTINGS */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800 dark:text-white">
            <Mail className="w-5 h-5 text-slate-500"/> Notificações de Stock (Armazém)
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Defina os e-mails que receberão alertas quando houver itens novos ou sem stock no armazém.
        </p>
        
        <div className="space-y-3 mb-6">
            {recipients.map((recipient, idx) => (
                <div key={idx} className="flex items-center gap-2">
                        <select
                        value={recipient.type}
                        onChange={(e) => updateRecipient(idx, 'type', e.target.value)}
                        className="p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-900 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand-500 dark:text-white"
                        >
                            <option value="TO">Para</option>
                            <option value="CC">CC</option>
                        </select>
                        <input 
                        type="email"
                        value={recipient.email}
                        onChange={(e) => updateRecipient(idx, 'email', e.target.value)}
                        placeholder="exemplo@empresa.com"
                        className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-brand-500 outline-none text-sm dark:bg-slate-900 dark:text-white"
                        required
                        />
                        <button 
                        type="button" 
                        onClick={() => removeRecipient(idx)}
                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                </div>
            ))}
        </div>

        <button 
            type="button" 
            onClick={addRecipient}
            className="text-sm text-brand-600 dark:text-brand-400 font-medium flex items-center gap-1 hover:text-brand-800 dark:hover:text-brand-300"
        >
            <Plus className="w-3 h-3" /> Adicionar Destinatário
        </button>
      </div>

      {/* COMPANY SETTINGS */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800 dark:text-white">
            <Building className="w-5 h-5 text-slate-500"/> Gestão de Empresas
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Crie a lista de empresas disponíveis para seleção no registo de novos utilizadores.
        </p>

        <div className="flex gap-2 mb-4">
            <input 
                type="text"
                value={newCompany}
                onChange={(e) => setNewCompany(e.target.value)}
                placeholder="Nome da nova empresa..."
                className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-brand-500 outline-none text-sm dark:bg-slate-900 dark:text-white"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCompany())}
            />
            <button 
                type="button"
                onClick={addCompany}
                className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 text-sm font-medium"
            >
                Adicionar
            </button>
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto">
            {companies.length === 0 ? (
                <p className="text-sm text-slate-400 italic">Nenhuma empresa registada.</p>
            ) : (
                companies.map((company) => (
                    <div key={company.id} className="flex justify-between items-center p-2 bg-slate-50 dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-700">
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{company.name}</span>
                        <button 
                            onClick={() => removeCompany(company.id)}
                            className="text-slate-400 hover:text-red-500 transition-colors"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))
            )}
        </div>
      </div>

      {/* SYNONYMS SETTINGS */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-slate-800 dark:text-white">
            <Search className="w-5 h-5 text-slate-500"/> Sinónimos de Pesquisa
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Defina grupos de palavras equivalentes para facilitar a pesquisa (ex: "Curva, Joelho").
        </p>

        <div className="flex gap-2 mb-4">
            <input 
                type="text"
                value={newSynonymsInput}
                onChange={(e) => setNewSynonymsInput(e.target.value)}
                placeholder="Palavras separadas por vírgula (ex: Curva, Joelho, Cotovelo)"
                className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-brand-500 outline-none text-sm dark:bg-slate-900 dark:text-white"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addSynonymGroup())}
            />
            <button 
                type="button"
                onClick={addSynonymGroup}
                className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-4 py-2 rounded-md hover:bg-slate-200 dark:hover:bg-slate-600 text-sm font-medium"
            >
                Adicionar
            </button>
        </div>

        <div className="space-y-2 max-h-60 overflow-y-auto">
            {synonyms.length === 0 ? (
                <p className="text-sm text-slate-400 italic">Nenhum grupo de sinónimos definido.</p>
            ) : (
                synonyms.map((group) => (
                    <div key={group.id} className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-900 rounded border border-slate-100 dark:border-slate-700">
                        <div className="flex flex-wrap gap-2">
                            {group.words.map((word, idx) => (
                                <span key={idx} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 px-2 py-1 rounded text-xs font-medium text-slate-600 dark:text-slate-300">
                                    {word}
                                </span>
                            ))}
                        </div>
                        <button 
                            onClick={() => removeSynonymGroup(group.id)}
                            className="text-slate-400 hover:text-red-500 transition-colors ml-2"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                ))
            )}
        </div>
      </div>

      {/* AUTO-SAVE INDICATOR */}
      <div className="fixed bottom-6 right-6 z-50">
            {loading && (
                <div className="bg-white dark:bg-slate-800 shadow-lg rounded-full px-4 py-2 flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                    <Loader2 className="w-4 h-4 animate-spin text-brand-600" />
                    A guardar...
                </div>
            )}
            {!loading && message && (
                <div className={`shadow-lg rounded-full px-4 py-2 flex items-center gap-2 text-sm font-medium border ${message.includes('Erro') ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:border-red-800' : 'bg-green-50 text-green-600 border-green-200 dark:bg-green-900/20 dark:border-green-800'}`}>
                    <AlertCircle className="w-4 h-4" />
                    {message}
                </div>
            )}
        </div>
    </div>
  );
};

export default Settings;
