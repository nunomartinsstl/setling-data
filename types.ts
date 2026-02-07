
export enum UserRole {
  ADMIN = 'ADMIN',
  MANAGEMENT = 'MANAGEMENT',
  WAREHOUSE = 'WAREHOUSE',
  VIEWER = 'VIEWER'
}

export interface User {
  uid: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  companyId?: string;
}

export interface Company {
  id: string;
  name: string;
}

export interface EmailRecipient {
  email: string;
  type: 'TO' | 'CC';
}

export interface UnitOption {
  value: string;
  description: string;
}

export interface CategoryOption {
  code: string;
  name: string;
}

export interface Supplier {
  code: string;
  name: string;
  paymentTerms?: string;
  address?: string;
}

export interface StockItem {
  sku: string;
  description: string;
  quantity: number;
  batch?: string;
  lastUpdated?: string;
}

export interface MasterMaterial {
  sku: string;
  description: string;
  quantity: number;
}

export interface OrderLineItem {
  sku: string;
  description: string;
  quantity: number;
  unit?: string;
  category?: string;
  isCustom?: boolean;
  quantityPicked?: number;
  backorderCreated?: boolean;
  fulfilledInOrderId?: string;
}

export interface PickedItem {
  material: string;
  pickedQty: number;
  bin?: string;
}

export interface ChangeLogEntry {
  date: string;
  actor: string;
  details: string;
}

export interface Order {
  id: string;
  displayId?: number;
  title: string;
  pep?: string;
  address?: string;
  creator: string;
  status: 'OPEN' | 'IN_PROCESS' | 'IN PROCESS' | 'COMPLETED';
  dateCreated: string;
  dueDate: string;
  items: OrderLineItem[];
  companyId?: string;
  changeLog?: ChangeLogEntry[];
  pickedItems?: PickedItem[];
  originalOrderId?: string;
  reopenCount?: number;
  stockProcessed?: boolean; // New flag to track if stock has been deducted
}

export interface PurchaseOrderItem {
  sku: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  isCustom?: boolean;
}

export interface PurchaseOrder {
  id: string;
  displayId?: number;
  dateCreated: string;
  supplier: Supplier;
  pep?: string;
  items: PurchaseOrderItem[];
  subTotal: number;
  vatTotal: number;
  grandTotal: number;
  creator: string;
  status: string;
}

export interface ReceiptItem {
  id: string;
  material: string;
  qty: number;
  bin?: string;
}

export interface Receipt {
  id: string;
  date: string;
  poNumber: string;
  userId: string;
  documentImage?: string;
  items: ReceiptItem[];
}

export interface AppSettings {
  notificationEmail?: string; 
  emailRecipients: EmailRecipient[];
  companies?: Company[];
  adminAccessCode?: string;
  unitOptions?: UnitOption[]; 
  categories?: CategoryOption[];
  suppliers?: Supplier[];
  autoDecrementStock?: boolean; 
}

export type ViewState = 'LOGIN' | 'DASHBOARD' | 'CREATE_ORDER' | 'OPEN_ORDERS' | 'FINISHED_ORDERS' | 'STOCK' | 'QUERY' | 'SETTINGS' | 'USERS' | 'PURCHASE_ORDERS' | 'SHORTAGES' | 'RECEIPTS';

export type OrderItem = Order;