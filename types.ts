
export enum UserRole {
  ADMIN = 'ADMIN',
  MANAGEMENT = 'MANAGEMENT',
  WAREHOUSE = 'WAREHOUSE',
  VIEWER = 'VIEWER'
}

export interface Company {
  id: string;
  name: string;
}

export interface User {
  uid?: string; // Firebase Auth ID
  username: string; // Kept for display (First-Last)
  email: string;
  role: UserRole;
  firstName?: string;
  lastName?: string;
  companyId?: string; // Optional for Admins, required for others
}

export interface Invite {
  email: string;
  role: UserRole;
  used: boolean;
  dateCreated: string;
}

// Inner item within an order
export interface OrderLineItem {
  sku: string; // Internal ID, but displayed as "Material"
  description: string;
  quantity: number;
  quantityPicked?: number; // How much was actually fulfilled
  backorderCreated?: boolean; // Flag to prevent duplicate re-opens
  isCustom?: boolean; // Flag for manually typed items
  fulfilledInOrderId?: number; // If this item was fulfilled in a child order (backorder)
}

export interface ChangeLogEntry {
  date: string;
  actor: string;
  details: string;
}

export interface PickedItem {
  material: string;
  pickedQty: number;
  bin?: string;
  // Add other fields from DB if necessary
}

// The Parent Order Object
export interface Order {
  id: string; // UUID for system
  displayId: number; // Incremental ID (1, 2, 3...)
  title: string;
  creator: string;
  status: 'OPEN' | 'COMPLETED' | 'IN_PROCESS' | 'IN PROCESS';
  dateCreated: string;
  dueDate: string; // "Data Levantamento"
  items: OrderLineItem[];
  changeLog?: ChangeLogEntry[];
  reopenCount?: number; // Tracks iterations (_re_1, _re_2)
  originalOrderId?: string; // Links back to parent if reopened
  pickedItems?: PickedItem[]; // Items actually picked in the warehouse
  exportData?: any[]; // Legacy or extra data for exports
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
  quantity?: number; // Optional for compatibility if mistakenly used
}

export interface EmailRecipient {
  email: string;
  type: 'TO' | 'CC';
}

export interface AppSettings {
  // Legacy support optional
  notificationEmail?: string; 
  emailRecipients: EmailRecipient[];
  companies?: Company[];
}

export type ViewState = 'LOGIN' | 'DASHBOARD' | 'CREATE_ORDER' | 'OPEN_ORDERS' | 'FINISHED_ORDERS' | 'STOCK' | 'QUERY' | 'SETTINGS' | 'USERS';

// Backwards compatibility helper type if needed, though we are migrating fully
export type OrderItem = Order;