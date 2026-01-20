import React, { useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { StorageService } from '../services/storageService';
import { Users, Shield, User as UserIcon } from 'lucide-react';

const UsersManager: React.FC = () => {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUsers = async () => {
            try {
                const data = await StorageService.getUsers();
                setUsers(data);
            } catch (e) {
                console.error("Failed to load users", e);
            } finally {
                setLoading(false);
            }
        };
        fetchUsers();
    }, []);

    const getRoleBadge = (role: UserRole) => {
        switch (role) {
            case UserRole.ADMIN:
                return <span className="bg-purple-100 text-purple-700 text-xs px-2 py-1 rounded-full font-bold">Admin</span>;
            case UserRole.MANAGEMENT:
                return <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full font-bold">Coordenação</span>;
            case UserRole.WAREHOUSE:
                return <span className="bg-amber-100 text-amber-700 text-xs px-2 py-1 rounded-full font-bold">Logística</span>;
            default:
                return <span className="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded-full">Visualizador</span>;
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                <Users className="text-purple-600" /> Utilizadores
            </h2>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-slate-500">Carregando utilizadores...</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-slate-600">
                            <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-700">
                                <tr>
                                    <th className="p-4">Utilizador</th>
                                    <th className="p-4">Nome Completo</th>
                                    <th className="p-4">Função</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {users.map((user, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50">
                                        <td className="p-4 font-medium text-slate-800 flex items-center gap-2">
                                            <div className="bg-slate-100 p-1.5 rounded-full">
                                                <UserIcon className="w-4 h-4 text-slate-500" />
                                            </div>
                                            {user.username}
                                        </td>
                                        <td className="p-4">
                                            {user.firstName} {user.lastName}
                                        </td>
                                        <td className="p-4">
                                            {getRoleBadge(user.role)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default UsersManager;