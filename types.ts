
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

// Inner item within an order
export interface OrderLineItem {
  sku: string;
  description: string;
  quantity: number;
  isCustom?: boolean; // Flag for manually typed items
}

export interface ChangeLogEntry {
  date: string;
  actor: string;
  details: string;
}

// The Parent Order Object
export interface Order {
  id: string;
  title: string;
  creator: string;
  status: 'OPEN' | 'FINISHED';
  dateCreated: string;
  dueDate: string; // "Data Levantamento"
  items: OrderLineItem[];
  changeLog?: ChangeLogEntry[];
}

export interface StockItem {
  sku: string;
  description: string;
  quantity: number;
  batch: string;
  lastUpdated: string;
}

// Master list of materials (Catálogo Geral) - distinct from stock
export interface MasterMaterial {
  sku: string;
  description: string;
}

export interface EmailRecipient {
  email: string;
  type: 'TO' | 'CC';
}

export interface AppSettings {
  // Legacy support optional
  notificationEmail?: string; 
  emailRecipients: EmailRecipient[];
}

export type ViewState = 'LOGIN' | 'DASHBOARD' | 'OPEN_ORDERS' | 'FINISHED_ORDERS' | 'STOCK' | 'QUERY' | 'SETTINGS';

// Backwards compatibility helper type if needed, though we are migrating fully
export type OrderItem = Order;
