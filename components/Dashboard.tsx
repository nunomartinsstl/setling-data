
import React, { useMemo } from 'react';
import { Order, StockItem, UserRole, ViewState, RolePermissions } from '../types';
import { ShoppingCart, CheckCircle, Activity, PlusCircle, ShoppingBag, ArrowDownCircle, AlertTriangle, Search, Clock, FileText, ArrowRightLeft, Package, Settings } from 'lucide-react';

interface DashboardProps {
  orders: Order[];
  stock: StockItem[];
  userRole?: UserRole;
  permissions?: RolePermissions;
  onNavigate: (view: ViewState) => void;
  shortageCount?: number;
}

const Dashboard: React.FC<DashboardProps> = ({ orders, stock, userRole, permissions, onNavigate, shortageCount = 0 }) => {
  const stats = useMemo(() => {
    const openOrders = orders.filter(o => o.status === 'OPEN');
    // Check for both underscore and space versions of the status
    const inProcessOrders = orders.filter(o => o.status === 'IN_PROCESS' || o.status === 'IN PROCESS');
    const pendingOrders = orders.filter(o => o.status === 'PENDING');
    const pendingApprovalOrders = orders.filter(o => o.status === 'PENDING_APPROVAL');
    const finishedOrders = orders.filter(o => o.status === 'COMPLETED');

    return {
      openOnlyCount: openOrders.length,
      inProcessCount: inProcessOrders.length,
      pendingCount: pendingOrders.length,
      pendingApprovalCount: pendingApprovalOrders.length,
      // The main "Open" number includes true OPEN, IN_PROCESS, PENDING and PENDING_APPROVAL
      totalOpenCount: openOrders.length + inProcessOrders.length + pendingOrders.length + pendingApprovalOrders.length,
      finishedCount: finishedOrders.length,
    };
  }, [orders]);

  const hasInProcess = stats.inProcessCount > 0;
  const hasPending = stats.pendingCount > 0;
  const hasPendingApproval = stats.pendingApprovalCount > 0;
  
  // Use permissions if available, otherwise fallback logic (though app should provide permissions)
  const canCreateWarehouse = permissions ? permissions.canCreateOrder : false;
  const canCreatePurchase = permissions ? permissions.canCreatePurchaseOrder : false;
  
  // Quick Access buttons logic
  const showReceipts = permissions ? permissions.canViewReceipts : false;
  const showTransfers = permissions ? permissions.canViewTransfers : false;
  const showShortages = permissions ? permissions.canViewShortages : false;
  const showSearch = permissions ? permissions.canSearch : false;

  const StatCard = ({ title, value, icon: Icon, color, onClick, children }: any) => (
    <div 
      onClick={onClick}
      className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 flex items-center justify-between cursor-pointer hover:shadow-md transition-shadow hover:bg-slate-50 dark:hover:bg-slate-700 relative overflow-hidden h-full"
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
    <div className="space-y-8 animate-fade-in">
      {/* Group 1: Pedidos ao Armazém */}
      <div className="space-y-3">
          <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Package className="w-5 h-5" /> Pedidos ao Armazém
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {canCreateWarehouse && (
                    <button
                        onClick={() => onNavigate('CREATE_ORDER')}
                        className="bg-brand-500 hover:bg-brand-600 active:bg-brand-700 text-white p-6 rounded-xl shadow-md hover:shadow-lg hover:-translate-y-1 active:scale-95 transition-all duration-300 flex flex-col items-center justify-center gap-3 text-lg font-semibold h-full"
                    >
                        <PlusCircle className="w-8 h-8" />
                        <span className="text-center leading-tight">
                            {userRole === UserRole.TECHNICAL ? 'Criar Requisição' : 'Criar Pedido'}
                        </span>
                    </button>
                )}

                {(permissions?.canViewOpenOrders || permissions?.canViewOwnOpenOrders) && (
                    <StatCard 
                        title="Pedidos Abertos" 
                        value={stats.totalOpenCount} 
                        icon={Clock} 
                        color="bg-blue-500" 
                        onClick={() => onNavigate('OPEN_ORDERS')}
                    >
                        <div className="flex flex-col gap-1 mt-1">
                            {hasInProcess && (
                                <div className="flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-1 rounded-full w-fit">
                                    <Activity className="w-3 h-3 animate-pulse" />
                                    Em curso
                                </div>
                            )}
                            {hasPending && (
                                <div className="flex items-center gap-1 text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-2 py-1 rounded-full w-fit">
                                    <ShoppingBag className="w-3 h-3" />
                                    Aguardando compra
                                </div>
                            )}
                            {hasPendingApproval && (
                                <div className="flex items-center gap-1 text-xs font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 px-2 py-1 rounded-full w-fit">
                                    <FileText className="w-3 h-3" />
                                    Por aprovar
                                </div>
                            )}
                        </div>
                    </StatCard>
                )}

                {(permissions?.canViewFinishedOrders || permissions?.canViewOwnFinishedOrders) && (
                    <StatCard 
                        title="Pedidos Finalizados" 
                        value={stats.finishedCount} 
                        icon={CheckCircle} 
                        color="bg-green-500" 
                        onClick={() => onNavigate('FINISHED_ORDERS')}
                    />
                )}
          </div>
      </div>
      
      {/* Group 2: Movimentos de Stock */}
      {(showReceipts || showTransfers) && (
          <div className="space-y-3">
              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Activity className="w-5 h-5" /> Movimentos de Stock
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {showReceipts && (
                      <button 
                        onClick={() => onNavigate('RECEIPTS')}
                        className="bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 border border-blue-200 dark:border-blue-800 p-6 rounded-xl flex items-center justify-center gap-3 transition-colors text-blue-700 dark:text-blue-300 h-full"
                      >
                          <ArrowDownCircle className="w-8 h-8" />
                          <span className="font-semibold text-lg">Entradas</span>
                      </button>
                  )}
                  
                  {showTransfers && (
                      <button 
                        onClick={() => onNavigate('TRANSFERS')}
                        className="bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100 dark:hover:bg-orange-900/30 border border-orange-200 dark:border-orange-800 p-6 rounded-xl flex items-center justify-center gap-3 transition-colors text-orange-700 dark:text-orange-300 h-full"
                      >
                          <ArrowRightLeft className="w-8 h-8" />
                          <span className="font-semibold text-lg">Transferências</span>
                      </button>
                  )}
              </div>
          </div>
      )}

      {/* Group 3: Outros */}
      {(canCreatePurchase || showShortages || showSearch) && (
          <div className="space-y-3">
              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                  <Settings className="w-5 h-5" /> Outras Operações
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {canCreatePurchase && (
                        <button
                            onClick={() => onNavigate('PURCHASE_ORDERS')}
                            className="bg-purple-500 hover:bg-purple-600 active:bg-purple-700 text-white p-6 rounded-xl shadow-md hover:shadow-lg hover:-translate-y-1 active:scale-95 transition-all duration-300 flex flex-col items-center justify-center gap-3 text-lg font-semibold h-full"
                        >
                            <ShoppingBag className="w-8 h-8" />
                            <span className="font-semibold text-center leading-tight">Criar Pedido<br/>de Compra</span>
                        </button>
                  )}

                  {showShortages && (
                      <button 
                        onClick={() => onNavigate('SHORTAGES')}
                        className="bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 border border-red-200 dark:border-red-800 p-4 rounded-xl flex flex-col items-center justify-center gap-2 transition-colors text-red-700 dark:text-red-300 h-full relative"
                      >
                          {shortageCount > 0 && (
                            <span className="absolute top-3 right-3 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-sm animate-pulse">
                              {shortageCount}
                            </span>
                          )}
                          <AlertTriangle className="w-6 h-6" />
                          <span className="font-semibold">Material em Falta</span>
                      </button>
                  )}

                  {showSearch && (
                      <button 
                        onClick={() => onNavigate('QUERY')}
                        className="bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-600 p-4 rounded-xl flex flex-col items-center justify-center gap-2 transition-colors text-slate-700 dark:text-slate-300 h-full"
                      >
                          <Search className="w-6 h-6" />
                          <span className="font-semibold">Pesquisa</span>
                      </button>
                  )}
              </div>
          </div>
      )}
    </div>
  );
};

export default Dashboard;
