import React, { useState, useEffect } from 'react';
import { User, UserRole, Company } from '../types';
import { StorageService } from '../services/storageService';
import { Users, Shield, User as UserIcon, Mail, Plus, Loader2, CheckCircle, AlertCircle, Trash2, Edit, Building, AlertTriangle, ChevronDown, UserCheck, Briefcase } from 'lucide-react';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';

const UsersManager: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Invite State
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<UserRole>(UserRole.WAREHOUSE);
    const [isInviting, setIsInviting] = useState(false);
    const [message, setMessage] = useState<{type: 'success'|'error', text: string} | null>(null);

    // Editing State (Map of UID -> Loading State)
    const [processingUsers, setProcessingUsers] = useState<Record<string, boolean>>({});
    
    // Reset State
    const [isResetting, setIsResetting] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            // We fetch both, but catch potential errors if user has restricted access
            // though UsersManager is typically admin-only anyway.
            const [usersData, settings] = await Promise.all([
                StorageService.getUsers(),
                StorageService.getSettings()
            ]);
            setUsers(usersData);
            setCompanies(settings.companies || []);
        } catch (e) {
            console.error("Failed to load users or settings", e);
        } finally {
            setLoading(false);
        }
    };

    // Filter potential supervisors (Coordinators and Admins)
    // Used to populate the dropdown for Technicians
    const availableSupervisors = users.filter(u => u.role === UserRole.MANAGEMENT || u.role === UserRole.ADMIN);

    const handleCreateInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsInviting(true);
        setMessage(null);
        try {
            if(!inviteEmail) throw new Error("Email obrigatório");
            
            await StorageService.createInvite(inviteEmail, inviteRole);
            
            setMessage({ type: 'success', text: `Convite criado para ${inviteEmail}. O utilizador já pode se registar.` });
            setInviteEmail('');
        } catch(err: any) {
            setMessage({ type: 'error', text: err.message });
        } finally {
            setIsInviting(false);
        }
    };

    const handleChangeRole = async (user: User, newRole: string) => {
        if (!user.uid) return;
        setProcessingUsers(prev => ({ ...prev, [user.uid!]: true }));
        try {
            await StorageService.updateUserRole(user.uid, newRole as UserRole);
            await fetchData(); // Reload list
        } catch(err: any) {
            alert(err.message);
        } finally {
            setProcessingUsers(prev => ({ ...prev, [user.uid!]: false }));
        }
    };

    const handleChangeCompany = async (user: User, newCompanyId: string) => {
        if (!user.uid) return;
        setProcessingUsers(prev => ({ ...prev, [user.uid!]: true }));
        try {
            await StorageService.updateUserCompany(user.uid, newCompanyId);
            await fetchData(); // Reload list
        } catch(err: any) {
            alert(err.message);
        } finally {
            setProcessingUsers(prev => ({ ...prev, [user.uid!]: false }));
        }
    };

    const handleChangeSupervisor = async (user: User, newSupervisorId: string) => {
        if (!user.uid) return;
        setProcessingUsers(prev => ({ ...prev, [user.uid!]: true }));
        try {
            await StorageService.updateUserSupervisor(user.uid, newSupervisorId);
            await fetchData();
        } catch(err: any) {
            alert(err.message);
        } finally {
            setProcessingUsers(prev => ({ ...prev, [user.uid!]: false }));
        }
    };

    const handleDeleteUser = async (user: User) => {
        if (!user.uid) return;
        
        const confirmMsg = `Tem certeza que deseja EXCLUIR os dados de ${user.username}?\n\n` +
                           `⚠️ IMPORTANTE: Como esta aplicação não possui servidor dedicado, esta ação apaga apenas os DADOS do utilizador.\n\n` +
                           `Para reutilizar este EMAIL (${user.email}), você precisará acessar o Console do Firebase > Authentication e excluir o utilizador manualmente lá também.`;
                           
        if (!window.confirm(confirmMsg)) return;

        setProcessingUsers(prev => ({ ...prev, [user.uid!]: true }));
        try {
            await StorageService.deleteUserProfile(user.uid);
            await fetchData(); // Reload list
        } catch(err: any) {
            alert(err.message);
        } finally {
            setProcessingUsers(prev => ({ ...prev, [user.uid!]: false }));
        }
    };

    const handleResetAll = async () => {
        const confirmMsg = "ATENÇÃO: Isso irá apagar TODOS os utilizadores (exceto você) e todos os convites. Todos terão que ser convidados e registados novamente. Tem certeza absoluta?";
        if (!window.confirm(confirmMsg)) return;
        
        setIsResetting(true);
        try {
            const auth = firebase.auth();
            if (auth.currentUser) {
                await StorageService.resetAllUsers(auth.currentUser.uid);
                alert("Todos os utilizadores foram resetados com sucesso.");
                await fetchData();
            }
        } catch(err: any) {
            alert("Erro ao resetar: " + err.message);
        } finally {
            setIsResetting(false);
        }
    };

    return (
        <div className="space-y-6 animate-fade-in pb-24">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Users className="text-purple-600 dark:text-purple-400" /> Gestão de Utilizadores
            </h2>

            {/* Invite Section */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-purple-200 dark:border-purple-900/50">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-purple-900 dark:text-purple-300">
                    <Mail className="w-5 h-5 text-purple-600 dark:text-purple-400" /> Convidar Novo Utilizador
                </h3>
                <form onSubmit={handleCreateInvite} className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1 w-full">
                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Email do Colaborador</label>
                        <input 
                            type="email" 
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-purple-500 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                            placeholder="colaborador@empresa.com"
                        />
                    </div>
                    <div className="w-full md:w-48">
                         <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Função Permitida</label>
                         <select 
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value as UserRole)}
                            className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
                         >
                             <option value={UserRole.WAREHOUSE}>Logística</option>
                             <option value={UserRole.TECHNICAL}>Técnico</option>
                             <option value={UserRole.MANAGEMENT}>Coordenação</option>
                             <option value={UserRole.ADMIN}>Administrador</option>
                         </select>
                    </div>
                    <button 
                        type="submit"
                        disabled={isInviting}
                        className="bg-purple-600 text-white px-6 py-2.5 rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2 font-medium whitespace-nowrap"
                    >
                        {isInviting ? <Loader2 className="w-4 h-4 animate-spin"/> : <Plus className="w-4 h-4"/>}
                        Gerar Acesso
                    </button>
                </form>

                {message && (
                    <div className={`mt-4 p-3 rounded-md text-sm flex items-center gap-2 ${message.type === 'success' ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'}`}>
                        {message.type === 'success' ? <CheckCircle className="w-4 h-4"/> : <AlertCircle className="w-4 h-4"/>}
                        {message.text}
                    </div>
                )}
            </div>

            {/* Users List */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex justify-between items-center">
                    <h3 className="font-bold text-slate-700 dark:text-slate-300">Utilizadores Ativos ({users.length})</h3>
                    
                    <button 
                        onClick={handleResetAll}
                        disabled={isResetting}
                        className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-1.5 rounded-md flex items-center gap-1 transition-colors border border-transparent hover:border-red-200 dark:hover:border-red-800"
                    >
                        {isResetting ? <Loader2 className="w-3 h-3 animate-spin"/> : <AlertTriangle className="w-3 h-3"/>}
                        Resetar Todos
                    </button>
                </div>
                {loading ? (
                    <div className="p-8 text-center text-slate-500 dark:text-slate-400">Carregando utilizadores...</div>
                ) : (
                    <div className="overflow-x-auto pb-4">
                        {/* 
                           Added min-w-[1200px] to enforce wider horizontal scroll on mobile 
                           and ensure columns have enough room for dropdowns
                        */}
                        <table className="w-full min-w-[1200px] text-left text-sm text-slate-600 dark:text-slate-300">
                            <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-200">
                                <tr>
                                    <th className="p-4 w-[20%]">Utilizador</th>
                                    <th className="p-4 w-[20%]">Email</th>
                                    <th className="p-4 w-[15%]">Empresa</th>
                                    <th className="p-4 w-[15%]">Função</th>
                                    <th className="p-4 w-[20%]">
                                        <div className="flex items-center gap-1">
                                            <Briefcase className="w-3 h-3"/> Supervisor (Chefia)
                                        </div>
                                    </th>
                                    <th className="p-4 text-center w-[10%]">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {users.map((user, idx) => {
                                    const isProcessing = user.uid && processingUsers[user.uid];
                                    const isTechnical = user.role === UserRole.TECHNICAL;
                                    
                                    return (
                                        <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                            <td className="p-4">
                                                <div className="font-medium text-slate-800 dark:text-white flex items-center gap-2">
                                                    <div className="bg-slate-100 dark:bg-slate-700 p-1.5 rounded-full flex-shrink-0">
                                                        <UserIcon className="w-4 h-4 text-slate-500 dark:text-slate-300" />
                                                    </div>
                                                    <span className="truncate">{user.username}</span>
                                                </div>
                                                <div className="text-xs text-slate-400 mt-1 pl-8 truncate">
                                                    {user.firstName} {user.lastName}
                                                </div>
                                            </td>
                                            <td className="p-4 font-mono text-xs text-slate-500 truncate max-w-[200px]" title={user.email}>{user.email}</td>
                                            <td className="p-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                                {user.role === UserRole.ADMIN ? (
                                                    <span className="text-purple-600 dark:text-purple-400 italic">Global</span>
                                                ) : (
                                                    <div className="relative group w-full">
                                                        <select
                                                            value={user.companyId || ''}
                                                            onChange={(e) => handleChangeCompany(user, e.target.value)}
                                                            disabled={isProcessing}
                                                            className="w-full appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 py-1.5 pl-2 pr-6 cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-500 rounded text-slate-600 dark:text-slate-300 text-xs truncate"
                                                            title="Clique para alterar a empresa"
                                                        >
                                                            <option value="" disabled>Selecione...</option>
                                                            {companies.map(c => (
                                                                <option key={c.id} value={c.id}>{c.name}</option>
                                                            ))}
                                                        </select>
                                                        <div className="absolute right-1 top-2 pointer-events-none text-slate-400">
                                                            <Building className="w-3 h-3" />
                                                        </div>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                <select
                                                    value={user.role}
                                                    onChange={(e) => handleChangeRole(user, e.target.value)}
                                                    disabled={isProcessing}
                                                    className={`appearance-none text-xs font-bold px-2 py-1.5 rounded border-none focus:ring-1 focus:ring-purple-300 cursor-pointer outline-none w-full truncate ${
                                                        user.role === UserRole.ADMIN ? 'text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/30' :
                                                        user.role === UserRole.MANAGEMENT ? 'text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30' :
                                                        user.role === UserRole.TECHNICAL ? 'text-cyan-700 dark:text-cyan-300 bg-cyan-100 dark:bg-cyan-900/30' :
                                                        'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30'
                                                    }`}
                                                >
                                                    <option value={UserRole.WAREHOUSE} className="bg-white dark:bg-slate-800">Logística</option>
                                                    <option value={UserRole.TECHNICAL} className="bg-white dark:bg-slate-800">Técnico</option>
                                                    <option value={UserRole.MANAGEMENT} className="bg-white dark:bg-slate-800">Coordenação</option>
                                                    <option value={UserRole.ADMIN} className="bg-white dark:bg-slate-800">Admin</option>
                                                </select>
                                            </td>
                                            
                                            {/* SUPERVISOR SELECTOR (Only for Technical) */}
                                            <td className="p-4">
                                                {isTechnical ? (
                                                    <div className="relative w-full">
                                                        <select
                                                            value={user.supervisorId || ''}
                                                            onChange={(e) => handleChangeSupervisor(user, e.target.value)}
                                                            disabled={isProcessing}
                                                            className={`w-full text-xs py-1.5 pl-2 pr-6 border rounded bg-white dark:bg-slate-800 focus:ring-1 focus:ring-purple-300 outline-none appearance-none truncate ${
                                                                !user.supervisorId 
                                                                ? 'border-orange-300 text-orange-600 bg-orange-50 dark:bg-orange-900/10' 
                                                                : 'border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300'
                                                            }`}
                                                        >
                                                            <option value="">-- Selecione Chefia --</option>
                                                            {availableSupervisors.map(m => (
                                                                <option key={m.uid} value={m.uid}>
                                                                    {m.firstName} {m.lastName} ({m.username})
                                                                </option>
                                                            ))}
                                                        </select>
                                                        <div className="absolute right-2 top-2 pointer-events-none text-slate-400">
                                                            <ChevronDown className="w-3 h-3" />
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-300 text-xs italic pl-2">N/A</span>
                                                )}
                                            </td>

                                            <td className="p-4 text-center">
                                                {isProcessing ? (
                                                    <Loader2 className="w-4 h-4 animate-spin text-slate-400 mx-auto" />
                                                ) : (
                                                    <button 
                                                        onClick={() => handleDeleteUser(user)}
                                                        className="text-red-400 hover:text-red-600 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 p-2 rounded-lg transition-colors"
                                                        title="Remover Acesso (Atenção: Não apaga Auth)"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default UsersManager;