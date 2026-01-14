import React, { useState, useEffect } from 'react';
import { User, ViewState, Order, StockItem, MasterMaterial } from './types';
import Login from './components/Login';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import OrderManager from './components/OrderManager';
import StockManager from './components/StockManager';
import QueryAssistant from './components/QueryAssistant';
import Settings from './components/Settings';
import { StorageService } from './services/storageService';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [view, setView] = useState<ViewState>('LOGIN');
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [masterList, setMasterList] = useState<MasterMaterial[]>([]);
  const [loading, setLoading] = useState(false);
  
  const isConnected = StorageService.isConnected();

  useEffect(() => {
    if (user) {
      refreshData();
    }
  }, [user]);

  const refreshData = async () => {
    setLoading(true);
    try {
      const [fetchedOrders, fetchedStock, fetchedMaster] = await Promise.all([
        StorageService.getOrders(),
        StorageService.getStock(),
        StorageService.getMasterMaterials()
      ]);
      setOrders(fetchedOrders);
      setStock(fetchedStock);
      setMasterList(fetchedMaster);
    } catch (error) {
      console.error("Failed to fetch data", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (loggedInUser: User) => {
    setUser(loggedInUser);
    setView('DASHBOARD');
  };

  const handleLogout = () => {
    setUser(null);
    setView('LOGIN');
    setOrders([]);
    setStock([]);
    setMasterList([]);
  };

  if (!user || view === 'LOGIN') {
    return <Login onLogin={handleLogin} />;
  }

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex h-full items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div>
        </div>
      );
    }

    switch (view) {
      case 'DASHBOARD':
        return <Dashboard orders={orders} stock={stock} userRole={user.role} />;
      case 'OPEN_ORDERS':
        return (
          <OrderManager 
            orders={orders} 
            stock={stock}
            masterList={masterList}
            type="OPEN" 
            userRole={user.role} 
            refreshData={refreshData} 
            currentUsername={user.username}
          />
        );
      case 'FINISHED_ORDERS':
        return (
          <OrderManager 
            orders={orders} 
            stock={stock}
            masterList={masterList}
            type="FINISHED" 
            userRole={user.role} 
            refreshData={refreshData}
            currentUsername={user.username}
          />
        );
      case 'STOCK':
        return (
          <StockManager 
            stock={stock} 
            userRole={user.role} 
            refreshData={refreshData} 
          />
        );
      case 'QUERY':
        return <QueryAssistant orders={orders} stock={stock} />;
      case 'SETTINGS':
        return <Settings />;
      default:
        return <Dashboard orders={orders} stock={stock} userRole={user.role} />;
    }
  };

  return (
    <Layout
      user={user}
      currentView={view}
      onNavigate={setView}
      onLogout={handleLogout}
      isConnected={isConnected}
    >
      {renderContent()}
    </Layout>
  );
};

export default App;