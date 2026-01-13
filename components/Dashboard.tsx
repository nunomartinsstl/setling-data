import React, { useMemo } from 'react';
import { OrderItem, StockItem, UserRole } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Package, ShoppingCart, CheckCircle } from 'lucide-react';

interface DashboardProps {
  orders: OrderItem[];
  stock: StockItem[];
  userRole?: UserRole; // Add role prop
}

const COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444'];

const Dashboard: React.FC<DashboardProps> = ({ orders, stock, userRole }) => {
  const isManagement = userRole === UserRole.MANAGEMENT;

  const stats = useMemo(() => {
    const openOrders = orders.filter(o => o.status === 'OPEN');
    const finishedOrders = orders.filter(o => o.status === 'FINISHED');
    const totalStockItems = stock.reduce((acc, item) => acc + item.quantity, 0);

    return {
      openCount: openOrders.length,
      finishedCount: finishedOrders.length,
      stockCount: totalStockItems
    };
  }, [orders, stock]);

  const stockData = useMemo(() => {
    // Since stock now contains individual batches, we must aggregate by SKU for the top 10 chart
    const aggregation = new Map<string, number>();
    
    stock.forEach(item => {
        const current = aggregation.get(item.sku) || 0;
        aggregation.set(item.sku, current + item.quantity);
    });

    return Array.from(aggregation.entries())
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 10);
  }, [stock]);

  const orderStatusData = [
    { name: 'Abertos', value: stats.openCount },
    { name: 'Finalizados', value: stats.finishedCount },
  ];

  const StatCard = ({ title, value, icon: Icon, color }: any) => (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-4">
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
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard title="Pedidos Abertos" value={stats.openCount} icon={ShoppingCart} color="bg-blue-500" />
        <StatCard title="Pedidos Finalizados" value={stats.finishedCount} icon={CheckCircle} color="bg-green-500" />
        
        {!isManagement && (
            <StatCard title="Total em Estoque" value={stats.stockCount} icon={Package} color="bg-amber-500" />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-96">
          <h3 className="text-lg font-bold text-slate-800 mb-4">Status dos Pedidos</h3>
          <div className="flex items-center justify-center h-full pb-8">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={orderStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={110}
                  fill="#8884d8"
                  paddingAngle={5}
                  dataKey="value"
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

        {!isManagement && (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 h-96">
            <h3 className="text-lg font-bold text-slate-800 mb-4">Níveis de Estoque (Top 10 SKUs)</h3>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stockData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  cursor={{ fill: '#f1f5f9' }}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="qty" fill="#0ea5e9" radius={[4, 4, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;