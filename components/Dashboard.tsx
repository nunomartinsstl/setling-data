import React, { useMemo } from 'react';
import { Order, StockItem, UserRole, ViewState } from '../types';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { ShoppingCart, CheckCircle } from 'lucide-react';

interface DashboardProps {
  orders: Order[];
  stock: StockItem[];
  userRole?: UserRole;
  onNavigate: (view: ViewState) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ orders, stock, userRole, onNavigate }) => {
  const stats = useMemo(() => {
    const openOrders = orders.filter(o => o.status === 'OPEN');
    const finishedOrders = orders.filter(o => o.status === 'FINISHED');

    return {
      openCount: openOrders.length,
      finishedCount: finishedOrders.length,
    };
  }, [orders]);

  const orderStatusData = [
    { name: 'Abertos', value: stats.openCount },
    { name: 'Finalizados', value: stats.finishedCount },
  ];

  const StatCard = ({ title, value, icon: Icon, color, onClick }: any) => (
    <div 
      onClick={onClick}
      className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-4 cursor-pointer hover:shadow-md transition-shadow hover:bg-slate-50"
    >
      <div className={`p-4 rounded-full ${color}`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <p className="text-sm text-slate-500 font-medium">{title}</p>
        <p className="text-2xl font-bold text-slate-800">{value}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <h2 className="text-2xl font-bold text-slate-800">Visão Geral</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard 
            title="Pedidos Abertos" 
            value={stats.openCount} 
            icon={ShoppingCart} 
            color="bg-blue-500" 
            onClick={() => onNavigate('OPEN_ORDERS')}
        />
        <StatCard 
            title="Pedidos Finalizados" 
            value={stats.finishedCount} 
            icon={CheckCircle} 
            color="bg-green-500" 
            onClick={() => onNavigate('FINISHED_ORDERS')}
        />
      </div>

      <div className="grid grid-cols-1 gap-6">
        {/* Chart Container: Pie Chart Only */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-96 flex flex-col">
          <h3 className="text-lg font-bold text-slate-800 mb-4 shrink-0">Status dos Pedidos</h3>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={orderStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={100}
                  outerRadius={140}
                  fill="#8884d8"
                  paddingAngle={5}
                  dataKey="value"
                  label={({name, value}) => `${name}: ${value}`}
                >
                  {orderStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? '#0ea5e9' : '#22c55e'} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;