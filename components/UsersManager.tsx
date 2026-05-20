import React, { useState, useEffect } from 'react';
import { toast } from './Toast';
import { User, UserRole, Company, Invite } from '../types';
import { StorageService } from '../services/storageService';
import { Users, Shield, User as UserIcon, Mail, Plus, Loader2, CheckCircle, AlertCircle, Trash2, Edit, Building, AlertTriangle, ChevronDown, UserCheck, UserPlus, ChevronRight, Network, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';

const OrganogramNode: React.FC<{ 
    user: any, 
    children: any[], 
    getRoleLabel: (role: string) => string,
    roleHierarchy: Record<string, number>,
    parentLevel: number
}> = ({ user, children, getRoleLabel, roleHierarchy, parentLevel }) => {
    const hasChildren = children.length > 0;
    const myLevel = roleHierarchy[user.role] || 10;

    return (
        <div className="flex flex-col items-center">
            {/* Node Box */}
            <div className="relative flex flex-col items-center">
                <div className={`
                    relative z-10 min-w-[200px] px-5 py-4 rounded-xl shadow-xl text-center
                    ${user.role === UserRole.MANAGEMENT ? 'bg-purple-600' : 'bg-slate-700'}
                    text-white transform transition-all hover:scale-105 border-2 border-white/10
                `}>
                    <div className="text-[9px] font-bold uppercase tracking-[0.2em] opacity-70 mb-1">
                        {getRoleLabel(user.role)}
                    </div>
                    <div className="text-sm font-bold tracking-tight">
                        {user.firstName} {user.lastName}
                    </div>
                    {user.isInvite && (
                        <div className="absolute -top-2 -right-2 bg-amber-400 text-black text-[8px] font-black px-2 py-0.5 rounded-full shadow-md border border-white">
                            PENDENTE
                        </div>
                    )}
                </div>

                {/* Vertical line down to children */}
                {hasChildren && (
                    <div className="w-px h-12 bg-slate-300 dark:bg-slate-600 relative">
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                    </div>
                )}
            </div>

            {/* Children row */}
            {hasChildren && (
                <div className="flex justify-center relative pt-0">
                    {/* Horizontal connecting line */}
                    {children.length > 1 && (
                        <div className="absolute top-0 h-px bg-slate-300 dark:bg-slate-600" 
                             style={{ 
                                 left: `${100 / (children.length * 2)}%`, 
                                 right: `${100 / (children.length * 2)}%` 
                             }} 
                        />
                    )}
                    
                    <div className="flex gap-12 pt-12">
                        {children.map((child, idx) => {
                            const childLevel = roleHierarchy[child.user.role] || 10;
                            const diff = Math.max(1, childLevel - myLevel);
                            const extraHeight = (diff - 1) * 170;
                            const lineUpHeight = 48 + extraHeight;

                            return (
                                <div key={idx} className="flex flex-col items-center relative" style={{ marginTop: `${extraHeight}px` }}>
                                    {/* Vertical line up to horizontal bar */}
                                    <div className="w-px bg-slate-300 dark:bg-slate-600 absolute left-1/2 -translate-x-1/2"
                                         style={{ height: `${lineUpHeight}px`, top: `-${lineUpHeight}px` }}>
                                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                                    </div>
                                    <OrganogramNode 
                                        user={child.user} 
                                        children={child.children} 
                                        getRoleLabel={getRoleLabel} 
                                        roleHierarchy={roleHierarchy}
                                        parentLevel={myLevel}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

const UsersManager: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [invites, setInvites] = useState<Invite[]>([]);
    const [companies, setCompanies] = useState<Company[]>([]);
    const [availableRoles, setAvailableRoles] = useState<string[]>(Object.values(UserRole));
    const [supervisorRoles, setSupervisorRoles] = useState<string[]>([UserRole.ADMIN, UserRole.MANAGEMENT]);
    const [roleHierarchy, setRoleHierarchy] = useState<Record<string, number>>({});
    const [loading, setLoading] = useState(true);
    
    // Invite State
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteFirstName, setInviteFirstName] = useState('');
    const [inviteLastName, setInviteLastName] = useState('');
    const [inviteCompanyId, setInviteCompanyId] = useState('');
    const [inviteSupervisorId, setInviteSupervisorId] = useState('');
    const [inviteRole, setInviteRole] = useState<string>(UserRole.WAREHOUSE);
    const [inviteUsernamePreview, setInviteUsernamePreview] = useState('');
    const [isInviting, setIsInviting] = useState(false);
    

    // Editing State (Map of UID -> Loading State)
    const [processingUsers, setProcessingUsers] = useState<Record<string, boolean>>({});
    const [viewMode, setViewMode] = useState<'ACTIVE' | 'PENDING'>('ACTIVE');
    
    // Reset State
    const [isResetting, setIsResetting] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        if (inviteFirstName || inviteLastName) {
            const timer = setTimeout(async () => {
                const username = await StorageService.generateUniqueUsername(inviteFirstName, inviteLastName);
                setInviteUsernamePreview(username);
            }, 500);
            return () => clearTimeout(timer);
        } else {
            setInviteUsernamePreview('');
        }
    }, [inviteFirstName, inviteLastName]);

    const buildTree = () => {
        // Exclude ADMIN role from organogram
        const allPeople = [
            ...users.filter(u => u.role !== UserRole.ADMIN).map(u => ({ ...u, id: u.uid })),
            ...invites.filter(i => i.role !== UserRole.ADMIN).map(i => ({ ...i, isInvite: true }))
        ];
        
        const map = new Map();
        allPeople.forEach((p: any) => map.set(p.id, { user: p, children: [] }));
        const roots: any[] = [];
        allPeople.forEach((p: any) => {
            const id = p.id;
            const node = map.get(id);
            if (p.supervisorId && map.has(p.supervisorId)) {
                map.get(p.supervisorId).children.push(node);
            } else {
                roots.push(node);
            }
        });

        // Sort children by hierarchy level
        const sortNodes = (nodes: any[]) => {
            nodes.sort((a, b) => {
                const levelA = roleHierarchy[a.user.role] || 10;
                const levelB = roleHierarchy[b.user.role] || 10;
                return levelA - levelB;
            });
            nodes.forEach(node => sortNodes(node.children));
        };
        
        // Also sort roots by hierarchy
        sortNodes(roots);

        return roots;
    };

    const treeData = buildTree();

    const fetchData = async () => {
        try {
            const [usersData, invitesData, settings] = await Promise.all([
                StorageService.getUsers(),
                StorageService.getPendingInvites(),
                StorageService.getSettings()
            ]);

            // Filter out invites for users that are already active
            const activeEmails = new Set(usersData.map(u => u.email.toLowerCase()));
            
            // Deduplicate invites by email, keeping the most recent one
            const inviteMap = new Map<string, Invite>();
            invitesData.forEach(invite => {
                const email = invite.email.toLowerCase();
                if (!activeEmails.has(email)) {
                    const existing = inviteMap.get(email);
                    // If no existing or current is newer
                    const currentIsNewer = !existing || 
                        (invite.dateCreated && existing.dateCreated && new Date(invite.dateCreated) > new Date(existing.dateCreated)) ||
                        (!existing.dateCreated && invite.dateCreated);
                    
                    if (currentIsNewer) {
                        inviteMap.set(email, invite);
                    }
                }
            });

            setUsers(usersData);
            setInvites(Array.from(inviteMap.values()));
            setCompanies(settings.companies || []);
            setSupervisorRoles(settings.supervisorRoles || [UserRole.ADMIN, UserRole.MANAGEMENT]);
            setRoleHierarchy(settings.roleHierarchy || {});
            
            if (settings.permissions) {
                const roles = Object.keys(settings.permissions);
                if (roles.length > 0) {
                    setAvailableRoles(roles);
                }
            }
        } catch (e) {
            console.error("Failed to load users or settings", e);
        } finally {
            setLoading(false);
        }
    };

    // Filter potential supervisors based on settings
    const availableSupervisors = users.filter(u => supervisorRoles.includes(u.role));

    const handleCreateInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsInviting(true);
        
        try {
            if(!inviteEmail) throw new Error("Email obrigatório");
            if(!inviteFirstName) throw new Error("Nome obrigatório");
            if(!inviteLastName) throw new Error("Apelido obrigatório");
            if(inviteRole !== UserRole.ADMIN && !inviteCompanyId) throw new Error("Empresa obrigatória");
            
            const code = await StorageService.createInvite(
                inviteEmail, 
                inviteRole, 
                inviteFirstName, 
                inviteLastName, 
                inviteCompanyId, 
                inviteSupervisorId
            );
            
            // Re-fetch everything to ensure lists are synced and filtered
            await fetchData();
            
            // Find the username from the newly updated state (or just use the inputs)
            const username = `${inviteFirstName.toLowerCase()}-${inviteLastName.toLowerCase()}`;
            
            toast.success(`Acesso gerado! UTILIZADOR: ${username} | CÓDIGO: ${code}. Envie estes dados para o colaborador.`);
            setInviteEmail('');
            setInviteFirstName('');
            setInviteLastName('');
            setInviteCompanyId('');
            setInviteSupervisorId('');
        } catch(err: any) {
            toast.error(err.message);
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

    const handleDeleteInvite = async (inviteId: string) => {
        if (!window.confirm("Tem certeza que deseja cancelar este acesso pendente?")) return;
        setProcessingUsers(prev => ({ ...prev, [inviteId]: true }));
        try {
            await StorageService.deleteInvite(inviteId);
            await fetchData(); // Use fetchData to ensure both lists are synced
        } catch(err: any) {
            alert(err.message);
        } finally {
            setProcessingUsers(prev => ({ ...prev, [inviteId]: false }));
        }
    };

    const getRoleLabel = (role: string) => {
        if (role === UserRole.MANAGEMENT) return 'Coordenação';
        if (role === UserRole.WAREHOUSE) return 'Logística';
        if (role === UserRole.TECHNICAL) return 'Técnico';
        if (role === UserRole.VIEWER) return 'Viewer';
        if (role === UserRole.ADMIN) return 'Administrador';
        return role;
    };

    return (
        <div className="space-y-6 animate-fade-in pb-24">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                <Users className="text-purple-600 dark:text-purple-400" /> Gestão de Utilizadores
            </h2>

            {/* Invite Section */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-purple-200 dark:border-purple-900/50">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-purple-900 dark:text-purple-300">
                    <UserPlus className="w-5 h-5 text-purple-600 dark:text-purple-400" /> Criar Novo Utilizador
                </h3>
                <form onSubmit={handleCreateInvite} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Email do Colaborador</label>
                            <input 
                                type="email" 
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-purple-500 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                                placeholder="colaborador@empresa.com"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Nome</label>
                            <input 
                                type="text" 
                                value={inviteFirstName}
                                onChange={(e) => setInviteFirstName(e.target.value)}
                                className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-purple-500 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                                placeholder="Primeiro Nome"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Apelido</label>
                            <input 
                                type="text" 
                                value={inviteLastName}
                                onChange={(e) => setInviteLastName(e.target.value)}
                                className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md focus:ring-2 focus:ring-purple-500 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                                placeholder="Último Nome"
                            />
                        </div>
                        {inviteUsernamePreview && (
                            <div className="col-span-full bg-purple-50 dark:bg-purple-900/20 p-2 rounded border border-purple-100 dark:border-purple-800 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <UserCheck className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                    <span className="text-xs font-bold text-purple-700 dark:text-purple-300 uppercase tracking-wider">Utilizador Gerado:</span>
                                    <span className="text-sm font-mono font-bold text-purple-900 dark:text-purple-100">{inviteUsernamePreview}</span>
                                </div>
                                <span className="text-[10px] text-purple-500 italic">Gerado automaticamente</span>
                            </div>
                        )}
                        <div>
                             <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Função Permitida</label>
                             <select 
                                value={inviteRole}
                                onChange={(e) => setInviteRole(e.target.value)}
                                className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
                             >
                                 {availableRoles.map(role => (
                                     <option key={role} value={role}>
                                         {getRoleLabel(role)}
                                     </option>
                                 ))}
                             </select>
                        </div>
                        {inviteRole !== UserRole.ADMIN && (
                            <div>
                                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Empresa</label>
                                <select 
                                    value={inviteCompanyId}
                                    onChange={(e) => setInviteCompanyId(e.target.value)}
                                    className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
                                >
                                    <option value="">Selecione a Empresa...</option>
                                    {companies.map(c => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Chefia / Supervisor (Opcional)</label>
                            <select 
                                value={inviteSupervisorId}
                                onChange={(e) => setInviteSupervisorId(e.target.value)}
                                className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
                            >
                                <option value="">-- Sem Chefia --</option>
                                {availableSupervisors.map(m => (
                                    <option key={m.uid} value={m.uid}>
                                        {m.firstName} {m.lastName} ({m.username})
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <button 
                            type="submit"
                            disabled={isInviting}
                            className="bg-purple-600 text-white px-6 py-2.5 rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2 font-medium whitespace-nowrap"
                        >
                            {isInviting ? <Loader2 className="w-4 h-4 animate-spin"/> : <Plus className="w-4 h-4"/>}
                            Gerar Acesso
                        </button>
                    </div>
                </form>

                
            </div>

            {/* Unified Users/Invites Section */}
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex bg-slate-200/50 dark:bg-slate-800/50 p-1 rounded-lg">
                        <button 
                            onClick={() => setViewMode('ACTIVE')}
                            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                                viewMode === 'ACTIVE' 
                                ? 'bg-white dark:bg-slate-700 shadow-sm text-purple-600 dark:text-purple-400' 
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                        >
                            Ativos ({users.length})
                        </button>
                        <button 
                            onClick={() => setViewMode('PENDING')}
                            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
                                viewMode === 'PENDING' 
                                ? 'bg-white dark:bg-slate-700 shadow-sm text-purple-600 dark:text-purple-400' 
                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}
                        >
                            Pendentes ({invites.length})
                        </button>
                    </div>
                    
                    {viewMode === 'ACTIVE' && (
                        <button 
                            onClick={handleResetAll}
                            disabled={isResetting}
                            className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 px-3 py-1.5 rounded-md flex items-center gap-1 transition-colors border border-transparent hover:border-red-200 dark:hover:border-red-800"
                        >
                            {isResetting ? <Loader2 className="w-3 h-3 animate-spin"/> : <AlertTriangle className="w-3 h-3"/>}
                            Resetar Todos
                        </button>
                    )}
                </div>

                {loading ? (
                    <div className="p-12 text-center">
                        <Loader2 className="w-8 h-8 animate-spin text-purple-500 mx-auto mb-2" />
                        <p className="text-slate-500 dark:text-slate-400 text-sm">Carregando dados...</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        {viewMode === 'ACTIVE' ? (
                            <table className="w-full min-w-[1000px] text-left text-sm text-slate-600 dark:text-slate-300">
                                <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-200">
                                    <tr>
                                        <th className="p-4">Utilizador</th>
                                        <th className="p-4">Email</th>
                                        <th className="p-4">Empresa</th>
                                        <th className="p-4">Função</th>
                                        <th className="p-4">Supervisor</th>
                                        <th className="p-4 text-center">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {users.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="p-8 text-center text-slate-400 italic">Nenhum utilizador ativo encontrado.</td>
                                        </tr>
                                    ) : (
                                        users.map((user, idx) => {
                                            const isProcessing = !!(user.uid && processingUsers[user.uid]);
                                            return (
                                                <tr key={user.uid || idx} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
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
                                                    <td className="p-4">
                                                        {user.role === UserRole.ADMIN ? (
                                                            <span className="text-purple-600 dark:text-purple-400 italic text-xs">Global</span>
                                                        ) : (
                                                            <div className="relative group w-full max-w-[150px]">
                                                                <select
                                                                    value={user.companyId || ''}
                                                                    onChange={(e) => handleChangeCompany(user, e.target.value)}
                                                                    disabled={isProcessing}
                                                                    className="w-full appearance-none bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 py-1.5 pl-2 pr-6 cursor-pointer focus:outline-none focus:ring-1 focus:ring-brand-500 rounded text-slate-600 dark:text-slate-300 text-xs truncate"
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
                                                            className={`appearance-none text-xs font-bold px-2 py-1.5 rounded border-none focus:ring-1 focus:ring-purple-300 cursor-pointer outline-none w-full max-w-[120px] truncate ${
                                                                user.role === UserRole.ADMIN ? 'text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/30' :
                                                                user.role === UserRole.MANAGEMENT ? 'text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/30' :
                                                                user.role === UserRole.TECHNICAL ? 'text-cyan-700 dark:text-cyan-300 bg-cyan-100 dark:bg-cyan-900/30' :
                                                                user.role === UserRole.WAREHOUSE ? 'text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30' :
                                                                'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800'
                                                            }`}
                                                        >
                                                            {availableRoles.map(role => (
                                                                <option key={role} value={role} className="bg-white dark:bg-slate-800">
                                                                    {getRoleLabel(role)}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="relative w-full max-w-[180px]">
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
                                                                <option value="">-- Sem Chefia --</option>
                                                                {availableSupervisors.map(m => (
                                                                    <option key={m.uid} value={m.uid}>
                                                                        {m.firstName} {m.lastName}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                            <div className="absolute right-2 top-2 pointer-events-none text-slate-400">
                                                                <ChevronDown className="w-3 h-3" />
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-center">
                                                        {isProcessing ? (
                                                            <Loader2 className="w-4 h-4 animate-spin text-slate-400 mx-auto" />
                                                        ) : (
                                                            <button 
                                                                onClick={() => handleDeleteUser(user)}
                                                                className="text-red-400 hover:text-red-600 p-2 rounded-lg transition-colors"
                                                                title="Remover Utilizador"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        ) : (
                            <table className="w-full min-w-[800px] text-left text-sm text-slate-600 dark:text-slate-300">
                                <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 font-semibold text-slate-700 dark:text-slate-200">
                                    <tr>
                                        <th className="p-4">Utilizador Atribuído</th>
                                        <th className="p-4">Email</th>
                                        <th className="p-4">Função</th>
                                        <th className="p-4">Código</th>
                                        <th className="p-4 text-center">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                    {invites.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-slate-400 italic">Nenhum acesso pendente encontrado.</td>
                                        </tr>
                                    ) : (
                                        invites.map((invite) => {
                                            const isProcessing = !!processingUsers[invite.id];
                                            return (
                                                <tr key={invite.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                                                    <td className="p-4">
                                                        <div className="font-medium text-slate-800 dark:text-white">{invite.username}</div>
                                                        <div className="text-xs text-slate-400">{invite.firstName} {invite.lastName}</div>
                                                    </td>
                                                    <td className="p-4 font-mono text-xs">{invite.email}</td>
                                                    <td className="p-4">
                                                        <span className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                                            {getRoleLabel(invite.role)}
                                                        </span>
                                                    </td>
                                                    <td className="p-4 font-mono font-bold text-purple-600 dark:text-purple-400">{invite.code}</td>
                                                    <td className="p-4 text-center">
                                                        {isProcessing ? (
                                                            <Loader2 className="w-4 h-4 animate-spin text-slate-400 mx-auto" />
                                                        ) : (
                                                            <button 
                                                                onClick={() => handleDeleteInvite(invite.id)}
                                                                className="text-red-400 hover:text-red-600 p-2 rounded-lg transition-colors"
                                                                title="Cancelar Acesso"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                <div className="mt-12">
                    <div className="bg-white dark:bg-slate-900 p-12 rounded-3xl border-2 border-slate-100 dark:border-slate-800 shadow-xl overflow-x-auto relative min-h-[500px] flex justify-center">
                        {/* Decorative dots in corners */}
                        <div className="absolute top-4 left-4 grid grid-cols-4 gap-1 opacity-10">
                            {[...Array(16)].map((_, i) => <div key={i} className="w-1 h-1 rounded-full bg-purple-600" />)}
                        </div>
                        <div className="absolute bottom-4 right-4 grid grid-cols-4 gap-1 opacity-10">
                            {[...Array(16)].map((_, i) => <div key={i} className="w-1 h-1 rounded-full bg-purple-600" />)}
                        </div>

                        {treeData.length > 0 ? (
                            <TransformWrapper
                                initialScale={window.innerWidth < 768 ? 0.5 : 1}
                                minScale={0.2}
                                maxScale={2}
                                centerOnInit={true}
                            >
                                {({ zoomIn, zoomOut, resetTransform }) => {
                                    const minRootLevel = treeData.length > 0 ? Math.min(...treeData.map(r => roleHierarchy[r.user.role] || 10)) : 1;
                                    return (
                                        <React.Fragment>
                                            <div className="absolute top-4 right-4 z-20 flex gap-2 bg-white dark:bg-slate-800 p-2 rounded-lg shadow-md border border-slate-200 dark:border-slate-700">
                                                <button onClick={() => zoomIn()} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300"><ZoomIn className="w-5 h-5"/></button>
                                                <button onClick={() => zoomOut()} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300"><ZoomOut className="w-5 h-5"/></button>
                                                <button onClick={() => resetTransform()} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded text-slate-600 dark:text-slate-300"><Maximize className="w-5 h-5"/></button>
                                            </div>
                                            <TransformComponent wrapperClass="w-full h-full min-h-[500px]" contentClass="w-full h-full flex justify-center items-start pt-10 pb-20 px-10">
                                                <div className="inline-flex gap-16 items-start">
                                                    {treeData.map((node, idx) => {
                                                        const rootLevel = roleHierarchy[node.user.role] || 10;
                                                        const extraHeight = Math.max(0, rootLevel - minRootLevel) * 170;
                                                        return (
                                                            <div key={idx} style={{ marginTop: `${extraHeight}px` }}>
                                                                <OrganogramNode 
                                                                    user={node.user} 
                                                                    children={node.children} 
                                                                    getRoleLabel={getRoleLabel} 
                                                                    roleHierarchy={roleHierarchy}
                                                                    parentLevel={rootLevel}
                                                                />
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </TransformComponent>
                                        </React.Fragment>
                                    );
                                }}
                            </TransformWrapper>
                        ) : (
                            <div className="flex flex-col items-center justify-center text-slate-400 italic">
                                <Users className="w-12 h-12 mb-2 opacity-20" />
                                <p>Nenhuma estrutura definida para visualização.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default UsersManager;