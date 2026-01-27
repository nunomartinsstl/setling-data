import React, { useMemo } from 'react';
import { Order, StockItem, UserRole, ViewState } from '../types';
import { ShoppingCart, CheckCircle, Activity, PlusCircle, ShoppingBag } from 'lucide-react';

interface DashboardProps {
  orders: Order[];
  stock: StockItem[];
  userRole?: UserRole;
  onNavigate: (view: ViewState) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ orders, stock, userRole, onNavigate }) => {
  const stats = useMemo(() => {
    const openOrders = orders.filter(o => o.status === 'OPEN');
    // Check for both underscore and space versions of the status
    const inProcessOrders = orders.filter(o => o.status === 'IN_PROCESS' || o.status === 'IN PROCESS');
    const finishedOrders = orders.filter(o => o.status === 'COMPLETED');

    return {
      openOnlyCount: openOrders.length,
      inProcessCount: inProcessOrders.length,
      // The main "Open" number includes both true OPEN and IN_PROCESS
      totalOpenCount: openOrders.length + inProcessOrders.length,
      finishedCount: finishedOrders.length,
    };
  }, [orders]);

  const hasInProcess = stats.inProcessCount > 0;
  const canCreate = userRole === UserRole.ADMIN || userRole === UserRole.MANAGEMENT;

  const StatCard = ({ title, value, icon: Icon, color, onClick, children }: any) => (
    <div 
      onClick={onClick}
      className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-between cursor-pointer hover:shadow-md transition-shadow hover:bg-slate-50 dark:hover:bg-slate-700 relative overflow-hidden"
    >
      <div className="flex items-center space-x-4">
        <div className={`p-4 rounded-full ${color}`}>
            <Icon className="w-6 h-6 text-white" />
        </div>
        <div>
            <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{title}</p>
            <p className="text-3xl font-bold text-slate-800 dark:text-white">{value}</p>
            {children}
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-2xl font-bold text-slate-800 dark:text-white">Controlo de Pedidos</h2>

      {/* Main Create Buttons */}
      {canCreate && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <button
              onClick={() => onNavigate('CREATE_ORDER')}
              className="w-full bg-brand-600 hover:bg-brand-700 text-white p-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-3 text-lg font-semibold border border-brand-700"
            >
              <PlusCircle className="w-6 h-6" />
              Criar Pedido ao Armazém
            </button>
            
            <button
              onClick={() => onNavigate('PURCHASE_ORDERS')}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white p-4 rounded-xl shadow-sm transition-all flex items-center justify-center gap-3 text-lg font-semibold border border-purple-700"
            >
              <ShoppingBag className="w-6 h-6" />
              Criar Pedido de Compra
            </button>
        </div>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard 
            title="Pedidos Abertos" 
            value={stats.totalOpenCount} 
            icon={ShoppingCart} 
            color="bg-blue-500" 
            onClick={() => onNavigate('OPEN_ORDERS')}
        >
             {hasInProcess && (
                <div className="mt-1 flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-1 rounded-full w-fit">
                    <Activity className="w-3 h-3 animate-pulse" />
                    Há pedidos em curso
                </div>
            )}
        </StatCard>

        <StatCard 
            title="Pedidos Finalizados" 
            value={stats.finishedCount} 
            icon={CheckCircle} 
            color="bg-green-500" 
            onClick={() => onNavigate('FINISHED_ORDERS')}
        />
      </div>
    </div>
  );
};

export default Dashboard;