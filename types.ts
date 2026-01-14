export enum UserRole {
  ADMIN = 'ADMIN',
  MANAGEMENT = 'MANAGEMENT',
  WAREHOUSE = 'WAREHOUSE',
  TECHNICIAN = 'TECHNICIAN',
  VIEWER = 'VIEWER'
}

export interface User {
  username: string;
  role: UserRole;
}

// Inner item within an order
export interface OrderLineItem {
  sku: string;
  description: string;
  quantity: number;
}

// The Parent Order Object
export interface Order {
  id: string;
  title: string;
  creator: string;
  status: 'OPEN' | 'FINISHED';
  dateCreated: string;
  dueDate: string; // "Data Para"
  items: OrderLineItem[];
}

export interface StockItem {
  sku: string;
  description: string;
  quantity: number;
  batch: string;
  lastUpdated: string;
}

export type ViewState = 'LOGIN' | 'DASHBOARD' | 'OPEN_ORDERS' | 'FINISHED_ORDERS' | 'STOCK' | 'QUERY';

// Backwards compatibility helper type if needed, though we are migrating fully
export type OrderItem = Order; 
