import React from 'react';
import { User, Company } from '../types';
import { User as UserIcon, Mail, Shield, Building, UserCheck } from 'lucide-react';

interface UserProfileProps {
  user: User;
  companies: Company[];
  allUsers: User[];
}

const UserProfile: React.FC<UserProfileProps> = ({ user, companies, allUsers }) => {
  const companyName = companies.find(c => c.id === user.companyId)?.name || 'Não atribuída';
  const supervisor = allUsers.find(u => u.uid === user.supervisorId);
  const supervisorName = supervisor ? `${supervisor.firstName} ${supervisor.lastName}` : 'Nenhum';

  return (
    <div className="max-w-2xl mx-auto mt-8 p-6 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-16 h-16 bg-brand-100 dark:bg-brand-900/30 rounded-full flex items-center justify-center text-brand-600 dark:text-brand-400">
          <UserIcon className="w-8 h-8" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Área Pessoal</h2>
          <p className="text-slate-500 dark:text-slate-400">Confira os dados da sua conta</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1">
            <UserIcon className="w-3 h-3" /> Nome de Utilizador
          </label>
          <p className="text-lg font-mono font-bold text-slate-800 dark:text-slate-200">{user.username}</p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1">
            <Mail className="w-3 h-3" /> Email
          </label>
          <p className="text-lg font-medium text-slate-800 dark:text-slate-200">{user.email}</p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1">
            <Shield className="w-3 h-3" /> Perfil / Função
          </label>
          <p className="text-lg font-medium text-slate-800 dark:text-slate-200">{user.role}</p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1">
            <Building className="w-3 h-3" /> Empresa
          </label>
          <p className="text-lg font-medium text-slate-800 dark:text-slate-200">{companyName}</p>
        </div>

        {user.supervisorId && (
          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-semibold text-slate-500 uppercase flex items-center gap-1">
              <UserCheck className="w-3 h-3" /> Supervisor / Coordenador
            </label>
            <p className="text-lg font-medium text-slate-800 dark:text-slate-200">{supervisorName}</p>
          </div>
        )}
      </div>
      
      <div className="mt-10 pt-6 border-t border-slate-100 dark:border-slate-700">
          <p className="text-xs text-slate-400 italic">Para alterar as suas informações, contacte um administrador do sistema.</p>
      </div>
    </div>
  );
};

export default UserProfile;
