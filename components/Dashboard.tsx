import React, { useMemo, useState } from 'react';
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
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface DashboardProps {
  orders: Order[];
  stock: StockItem[];
  userRole?: UserRole;
  permissions?: RolePermissions;
  onNavigate: (view: ViewState) => void;
  shortageCount?: number;
}

const DashboardItem = ({ 
    title, 
    value, 
    icon: Icon, 
    colorClass, 
    onClick,
    pulseBadge = null,
    children
  }: any) => {
    return (
      <div 
        onClick={onClick}
        className="group relative flex items-center justify-between py-3 px-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-100 dark:border-slate-800/50 last:border-0"
      >
        <div className="flex items-center gap-4">
          <div className={`relative flex-shrink-0 ${colorClass}`}>
            <Icon className="w-4 h-4" />
            {pulseBadge !== null && pulseBadge > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500 text-[8px] font-bold text-white items-center justify-center">{pulseBadge > 99 ? '99+' : pulseBadge}</span>
                </span>
            )}
          </div>
          <div>
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{title}</h3>
            {children && <div className="mt-1">{children}</div>}
          </div>
        </div>
        
        <div className="flex items-center gap-3">
            {value !== undefined && value !== null && (
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{value}</span>
            )}
            <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500 dark:group-hover:text-slate-400 transition-colors" />
        </div>
      </div>
    )
}

const DashboardSection = ({ title, icon: Icon, defaultOpen = false, children }: any) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="mb-2">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between py-4 px-2 outline-none select-none hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors border-b border-slate-200 dark:border-slate-800"
            >
                <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                    <h2 className="text-xs font-bold text-slate-800 dark:text-slate-300 uppercase tracking-widest">{title}</h2>
                </div>
                <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}>
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                </motion.div>
            </button>
            <AnimatePresence initial={false}>
                {isOpen && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        <div className="flex flex-col ml-3 pl-3 py-1 border-l border-slate-200 dark:border-slate-800">
                             {children}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

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
    <div className="w-full max-w-2xl mx-auto pt-2 pb-20 px-4 md:px-0 animate-fade-in">
      
      {/* SECTION: Pedidos ao Armazém */}
      <DashboardSection title="Pedidos ao Armazém" icon={Package} defaultOpen={true}>
            {canCreateWarehouse && (
                <DashboardItem
                    title={userRole === UserRole.TECHNICAL ? 'Criar Requisição' : 'Criar Pedido'}
                    icon={PlusCircle}
                    colorClass="text-brand-600 dark:text-brand-400"
                    onClick={() => onNavigate('CREATE_ORDER')}
                />
            )}

            {(permissions?.canViewOpenOrders || permissions?.canViewOwnOpenOrders) && (
                <DashboardItem
                    title="Pedidos Abertos"
                    value={stats.totalOpenCount}
                    icon={Clock}
                    colorClass="text-blue-500 dark:text-blue-400"
                    onClick={() => onNavigate('OPEN_ORDERS')}
                >
                    {(hasInProcess || hasPending || hasPendingApproval) && (
                        <div className="flex flex-wrap gap-1 mt-1">
                            {hasInProcess && <span className="text-[9px] font-bold text-amber-600 uppercase tracking-widest bg-amber-50 dark:bg-amber-900/30 px-1 py-0.5">Em curso</span>}
                            {hasPending && <span className="text-[9px] font-bold text-purple-600 uppercase tracking-widest bg-purple-50 dark:bg-purple-900/30 px-1 py-0.5">Aguardando</span>}
                            {hasPendingApproval && <span className="text-[9px] font-bold text-orange-600 uppercase tracking-widest bg-orange-50 dark:bg-orange-900/30 px-1 py-0.5">Por aprovar</span>}
                        </div>
                    )}
                </DashboardItem>
            )}

            {(permissions?.canViewFinishedOrders || permissions?.canViewOwnFinishedOrders) && (
                <DashboardItem
                    title="Pedidos Finalizados"
                    value={stats.finishedCount}
                    icon={CheckCircle}
                    colorClass="text-emerald-500 dark:text-emerald-400"
                    onClick={() => onNavigate('FINISHED_ORDERS')}
                />
            )}
      </DashboardSection>

      {/* SECTION: Movimentos de Stock */}
      {(showReceipts || showTransfers) && (
          <DashboardSection title="Movimentos de Stock" icon={Activity}>
                {showReceipts && (
                    <DashboardItem
                        title="Entradas"
                        icon={ArrowDownCircle}
                        colorClass="text-cyan-500 dark:text-cyan-400"
                        onClick={() => onNavigate('RECEIPTS')}
                    />
                )}
                
                {showTransfers && (
                    <DashboardItem
                        title="Transferências"
                        icon={ArrowRightLeft}
                        colorClass="text-amber-500 dark:text-amber-400"
                        onClick={() => onNavigate('TRANSFERS')}
                    />
                )}
          </DashboardSection>
      )}

      {/* SECTION: Outras Operações */}
      {(canCreatePurchase || showShortages || showSearch) && (
          <DashboardSection title="Outras Operações" icon={Settings}>
                {canCreatePurchase && (
                    <DashboardItem
                        title="Criar Pedido de Compra"
                        icon={ShoppingBag}
                        colorClass="text-purple-500 dark:text-purple-400"
                        onClick={() => onNavigate('PURCHASE_ORDERS')}
                    />
                )}

                {showShortages && (
                    <DashboardItem
                        title="Material em Falta"
                        icon={AlertTriangle}
                        colorClass="text-red-500 dark:text-red-400"
                        onClick={() => onNavigate('SHORTAGES')}
                        pulseBadge={shortageCount}
                    />
                )}

                {showSearch && (
                    <DashboardItem
                        title="Pesquisa Avançada"
                        icon={Search}
                        colorClass="text-slate-500 dark:text-slate-400"
                        onClick={() => onNavigate('QUERY')}
                    />
                )}
          </DashboardSection>
      )}
    </div>
  );
};

export default Dashboard;
