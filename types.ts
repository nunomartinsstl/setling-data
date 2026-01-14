export enum UserRole {
  ADMIN = 'ADMIN',
  MANAGEMENT = 'MANAGEMENT',
  WAREHOUSE = 'WAREHOUSE',
  VIEWER = 'VIEWER'
}

export interface User {
  username: string;
  role: UserRole;
}

export interface OrderItem {
  id: string;
  sku: string;
  description: string;
  quantity: number;
  status: 'OPEN' | 'FINISHED';
  dateAdded: string;
}

export interface StockItem {
  sku: string;
  description: string;
  quantity: number;
  batch: string; // Added batch (Lote)
  lastUpdated: string;
}

export type ViewState = 'LOGIN' | 'DASHBOARD' | 'OPEN_ORDERS' | 'FINISHED_ORDERS' | 'STOCK' | 'QUERY';