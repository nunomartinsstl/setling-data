const fs = require('fs');

const content = `import React, { useMemo } from 'react';
import { Order, StockItem, UserRole, ViewState, RolePermissions } from '../types';
import { 
  CheckCircle, 
  Activity, 
  PlusCircle, 
  ShoppingBag, 
  ArrowDownCircle, 
  AlertTriangle, 
  Search, 
  Clock, 
  FileText, 
  ArrowRightLeft, 
  Package, 
  Settings, 
  ChevronRight
} from 'lucide-react';

interface DashboardProps {
  orders: Order[];
  stock: StockItem[];
  userRole?: UserRole;
  permissions?: RolePermissions;
  onNavigate: (view: ViewState) => void;
  shortageCount?: number;
}

const DashboardCard = ({ 
    title, 
    subtitle, 
    value, 
    icon: Icon, 
    colorClass, 
    borderClass, 
    textClass, 
    gradientClass, 
    onClick, 
    children,
    pulseBadge = null
  }: any) => {
    return (
      <div 
        onClick={onClick}
        className={\`group relative overflow-hidden rounded-2xl border \${borderClass} bg-white dark:bg-slate-900 p-6 shadow-sm transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer flex flex-col justify-between min-h-[160px]\`}
      >
        <div className={\`absolute top-0 left-0 w-full h-1 \${gradientClass}\`}></div>
        
        {/* Large decorative background icon */}
        <div className="absolute -right-6 -bottom-6 opacity-[0.03] dark:opacity-[0.05] pointer-events-none group-hover:scale-110 transition-transform duration-500">
            <Icon className="w-40 h-40" />
        </div>
        
        <div className="flex justify-between items-start relative z-10 w-full">
          <div className={\`relative p-3 rounded-xl \${colorClass}\`}>
            <Icon className={\`w-6 h-6 \${textClass}\`} />
            {pulseBadge !== null && pulseBadge > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 text-[9px] font-bold text-white items-center justify-center border-2 border-white dark:border-slate-900">{pulseBadge}</span>
                </span>
            )}
          </div>
          {value !== undefined && value !== null && (
            <div className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">
              {value}
            </div>
          )}
        </div>
  
        <div className="mt-6 relative z-10 flex flex-col gap-1 w-full">
          <h3 className={\`text-lg font-bold text-slate-800 dark:text-slate-100 pr-6\`}>{title}</h3>
          {subtitle && <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{subtitle}</p>}
          {children && <div className="mt-2">{children}</div>}
        </div>
  
        <div className={\`absolute bottom-6 right-6 opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 \${textClass}\`}>
            <ChevronRight className="w-5 h-5" />
        </div>
      </div>
    )
  }

const Dashboard: React.FC<DashboardProps> = ({ orders, stock, userRole, permissions, onNavigate, shortageCount = 0 }) => {
  const stats = useMemo(() => {
    const openOrders = orders.filter(o => o.status === 'OPEN');
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
  
  const canCreateWarehouse = permissions ? permissions.canCreateOrder : false;
  const canCreatePurchase = permissions ? permissions.canCreatePurchaseOrder : false;
  
  const showReceipts = permissions ? permissions.canViewReceipts : false;
  const showTransfers = permissions ? permissions.canViewTransfers : false;
  const showShortages = permissions ? permissions.canViewShortages : false;
  const showSearch = permissions ? permissions.canSearch : false;

  return (
    <div className="space-y-12 animate-fade-in p-2 md:p-6 pb-20">
      
      {/* SECTION: Pedidos ao Armazém */}
      <section>
        <div className="flex items-center gap-3 mb-6 border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="bg-slate-100 dark:bg-slate-800 p-2 rounded-lg text-slate-500 dark:text-slate-400">
                <Package className="w-5 h-5" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight">Pedidos ao Armazém</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {canCreateWarehouse && (
                <DashboardCard
                    title={userRole === UserRole.TECHNICAL ? 'Criar Requisição' : 'Criar Pedido'}
                    subtitle="Novo pedido de material"
                    icon={PlusCircle}
                    colorClass="bg-brand-50 dark:bg-brand-500/20"
                    borderClass="border-brand-200 dark:border-brand-800"
                    textClass="text-brand-600 dark:text-brand-400"
                    gradientClass="bg-gradient-to-r from-brand-400 to-brand-600"
                    onClick={() => onNavigate('CREATE_ORDER')}
                />
            )}

            {(permissions?.canViewOpenOrders || permissions?.canViewOwnOpenOrders) && (
                <DashboardCard
                    title="Pedidos Abertos"
                    value={stats.totalOpenCount}
                    icon={Clock}
                    colorClass="bg-blue-50 dark:bg-blue-500/20"
                    borderClass="border-blue-200 dark:border-blue-800"
                    textClass="text-blue-600 dark:text-blue-400"
                    gradientClass="bg-gradient-to-r from-blue-400 to-blue-600"
                    onClick={() => onNavigate('OPEN_ORDERS')}
                >
                    <div className="flex flex-wrap gap-2 mt-1">
                        {hasInProcess && (
                            <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2.5 py-1 rounded w-fit tracking-wider">
                                <Activity className="w-3 h-3 animate-pulse" /> Em curso
                            </span>
                        )}
                        {hasPending && (
                            <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30 px-2.5 py-1 rounded w-fit tracking-wider">
                                <ShoppingBag className="w-3 h-3" /> Aguardando
                            </span>
                        )}
                        {hasPendingApproval && (
                            <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30 px-2.5 py-1 rounded w-fit tracking-wider">
                                <FileText className="w-3 h-3" /> Por aprovar
                            </span>
                        )}
                    </div>
                </DashboardCard>
            )}

            {(permissions?.canViewFinishedOrders || permissions?.canViewOwnFinishedOrders) && (
                <DashboardCard
                    title="Pedidos Finalizados"
                    value={stats.finishedCount}
                    icon={CheckCircle}
                    colorClass="bg-emerald-50 dark:bg-emerald-500/20"
                    borderClass="border-emerald-200 dark:border-emerald-800"
                    textClass="text-emerald-600 dark:text-emerald-400"
                    gradientClass="bg-gradient-to-r from-emerald-400 to-emerald-600"
                    onClick={() => onNavigate('FINISHED_ORDERS')}
                />
            )}
        </div>
      </section>

      {/* SECTION: Movimentos de Stock */}
      {(showReceipts || showTransfers) && (
          <section>
            <div className="flex items-center gap-3 mb-6 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="bg-slate-100 dark:bg-slate-800 p-2 rounded-lg text-slate-500 dark:text-slate-400">
                    <Activity className="w-5 h-5" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight">Movimentos de Stock</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {showReceipts && (
                    <DashboardCard
                        title="Entradas"
                        subtitle="Registar receções"
                        icon={ArrowDownCircle}
                        colorClass="bg-cyan-50 dark:bg-cyan-500/20"
                        borderClass="border-cyan-200 dark:border-cyan-800"
                        textClass="text-cyan-600 dark:text-cyan-400"
                        gradientClass="bg-gradient-to-r from-cyan-400 to-cyan-600"
                        onClick={() => onNavigate('RECEIPTS')}
                    />
                )}
                
                {showTransfers && (
                    <DashboardCard
                        title="Transferências"
                        subtitle="Mover stock"
                        icon={ArrowRightLeft}
                        colorClass="bg-amber-50 dark:bg-amber-500/20"
                        borderClass="border-amber-200 dark:border-amber-800"
                        textClass="text-amber-600 dark:text-amber-400"
                        gradientClass="bg-gradient-to-r from-amber-400 to-amber-600"
                        onClick={() => onNavigate('TRANSFERS')}
                    />
                )}
            </div>
          </section>
      )}

      {/* SECTION: Outras Operações */}
      {(canCreatePurchase || showShortages || showSearch) && (
          <section>
            <div className="flex items-center gap-3 mb-6 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div className="bg-slate-100 dark:bg-slate-800 p-2 rounded-lg text-slate-500 dark:text-slate-400">
                    <Settings className="w-5 h-5" />
                </div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight">Outras Operações</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {canCreatePurchase && (
                    <DashboardCard
                        title="Criar Pedido de Compra"
                        subtitle="Nova compra de material"
                        icon={ShoppingBag}
                        colorClass="bg-purple-50 dark:bg-purple-500/20"
                        borderClass="border-purple-200 dark:border-purple-800"
                        textClass="text-purple-600 dark:text-purple-400"
                        gradientClass="bg-gradient-to-r from-purple-400 to-purple-600"
                        onClick={() => onNavigate('PURCHASE_ORDERS')}
                    />
                )}

                {showShortages && (
                    <DashboardCard
                        title="Material em Falta"
                        subtitle="Analisar rupturas de stock"
                        icon={AlertTriangle}
                        colorClass="bg-red-50 dark:bg-red-500/20"
                        borderClass="border-red-200 dark:border-red-800"
                        textClass="text-red-600 dark:text-red-400"
                        gradientClass="bg-gradient-to-r from-red-400 to-red-600"
                        onClick={() => onNavigate('SHORTAGES')}
                        pulseBadge={shortageCount}
                    />
                )}

                {showSearch && (
                    <DashboardCard
                        title="Pesquisa Avançada"
                        subtitle="Procurar em todo o histórico"
                        icon={Search}
                        colorClass="bg-slate-50 dark:bg-slate-800"
                        borderClass="border-slate-200 dark:border-slate-700"
                        textClass="text-slate-600 dark:text-slate-400"
                        gradientClass="bg-gradient-to-r from-slate-400 to-slate-600"
                        onClick={() => onNavigate('QUERY')}
                    />
                )}
            </div>
          </section>
      )}
    </div>
  );
};

export default Dashboard;
`;

fs.writeFileSync('components/Dashboard.tsx', content);
