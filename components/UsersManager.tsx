import React, { useState, useEffect } from 'react';
import { User, UserRole, Company } from '../types';
import { StorageService } from '../services/storageService';
import { Users, Shield, User as UserIcon, Mail, Plus, Loader2, CheckCircle, AlertCircle, Trash2, Edit, Building } from 'lucide-react';

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

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
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

    const handleDeleteUser = async (user: User) => {
        if (!user.uid) return;
        if (!window.confirm(`Tem certeza que deseja EXCLUIR o acesso de ${user.username}? O histórico de login será perdido, mas os registros criados por ele permanecerão.`)) return;

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

    const getCompanyName = (id?: string) => {
        if (!id) return '-';
        const company = companies.find(c => c.id === id);
        return company ? company.name : 'Desconhecida';
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Users className="text-purple-600" /> Gestão de Utilizadores
            </h2>

            {/* Invite Section */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-purple-200">
                <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-purple-900">
                    <Mail className="w-5 h-5 text-purple-600" /> Convidar Novo Utilizador
                </h3>
                <form onSubmit={handleCreateInvite} className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1 w-full">
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Email do Colaborador</label>
                        <input 
                            type="email" 
                            value={inviteEmail}
                            onChange={(e) => setInviteEmail(e.target.value)}
                            className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-purple-500 outline-none"
                            placeholder="colaborador@empresa.com"
                        />
                    </div>
                    <div className="w-full md:w-48">
                         <label className="block text-xs font-semibold text-slate-500 mb-1">Função Permitida</label>
                         <select 
                            value={inviteRole}
                            onChange={(e) => setInviteRole(e.target.value as UserRole)}
                            className="w-full p-2 border border-slate-300 rounded-md bg-white focus:ring-2 focus:ring-purple-500 outline-none"
                         >
                             <option value={UserRole.WAREHOUSE}>Logística</option>
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
                    <div className={`mt-4 p-3 rounded-md text-sm flex items-center gap-2 ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {message.type === 'success' ? <CheckCircle className="w-4 h-4"/> : <AlertCircle className="w-4 h-4"/>}
                        {message.text}
                    </div>
                )}
            </div>

            {/* Users List */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50">
                    <h3 className="font-bold text-slate-700">Utilizadores Ativos ({users.length})</h3>
                </div>
                {loading ? (
                    <div className="p-8 text-center text-slate-500">Carregando utilizadores...</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-600">
                            <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-700">
                                <tr>
                                    <th className="p-4">Utilizador</th>
                                    <th className="p-4">Email</th>
                                    <th className="p-4">Empresa</th>
                                    <th className="p-4">Nome Completo</th>
                                    <th className="p-4">Função</th>
                                    <th className="p-4 text-center">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {users.map((user, idx) => {
                                    const isProcessing = user.uid && processingUsers[user.uid];
                                    
                                    return (
                                        <tr key={idx} className="hover:bg-slate-50">
                                            <td className="p-4 font-medium text-slate-800 flex items-center gap-2">
                                                <div className="bg-slate-100 p-1.5 rounded-full">
                                                    <UserIcon className="w-4 h-4 text-slate-500" />
                                                </div>
                                                {user.username}
                                            </td>
                                            <td className="p-4 font-mono text-xs">{user.email}</td>
                                            <td className="p-4 text-xs font-semibold text-slate-500">
                                                {user.role === UserRole.ADMIN ? (
                                                    <span className="text-purple-600 italic">Global</span>
                                                ) : (
                                                    <div className="flex items-center gap-1">
                                                        <Building className="w-3 h-3"/>
                                                        {getCompanyName(user.companyId)}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-4">
                                                {user.firstName} {user.lastName}
                                            </td>
                                            <td className="p-4">
                                                <select
                                                    value={user.role}
                                                    onChange={(e) => handleChangeRole(user, e.target.value)}
                                                    disabled={isProcessing}
                                                    className={`bg-transparent text-xs font-bold px-2 py-1 rounded border-none focus:ring-1 focus:ring-purple-300 cursor-pointer outline-none ${
                                                        user.role === UserRole.ADMIN ? 'text-purple-700 bg-purple-100' :
                                                        user.role === UserRole.MANAGEMENT ? 'text-blue-700 bg-blue-100' :
                                                        'text-amber-700 bg-amber-100'
                                                    }`}
                                                >
                                                    <option value={UserRole.WAREHOUSE}>Logística</option>
                                                    <option value={UserRole.MANAGEMENT}>Coordenação</option>
                                                    <option value={UserRole.ADMIN}>Admin</option>
                                                </select>
                                            </td>
                                            <td className="p-4 text-center">
                                                {isProcessing ? (
                                                    <Loader2 className="w-4 h-4 animate-spin text-slate-400 mx-auto" />
                                                ) : (
                                                    <button 
                                                        onClick={() => handleDeleteUser(user)}
                                                        className="text-red-400 hover:text-red-600 hover:bg-red-50 p-2 rounded-lg transition-colors"
                                                        title="Remover Acesso"
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