
export const UserRole = {
  ADMIN: 'ADMIN',
  MANAGEMENT: 'MANAGEMENT',
  WAREHOUSE: 'WAREHOUSE',
  TECHNICAL: 'TECHNICAL',
  VIEWER: 'VIEWER'
} as const;

export type UserRole = typeof UserRole[keyof typeof UserRole] | string;

export interface User {
  uid: string;
  email: string;
  username: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  companyId?: string;
  supervisorId?: string; // Link to the Coordinator responsible for this Technician
}

export interface Invite {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  companyId: string;
  supervisorId: string;
  code: string;
  dateCreated: string;
}

export interface Company {
  id: string;
  name: string;
}

export interface EmailRecipient {
  email: string;
  type: 'TO' | 'CC';
}

export interface ApprovalRule {
  amount: number; // Replaces maxAmount
  approverRole?: string;
  approverEmail?: string;
  operator: 'LTE' | 'GTE'; // LTE = <= (Até), GTE = >= (Maior ou Igual)
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
  image?: string; // Base64 string for photo requisitions
  originalDescription?: string; // Original description provided by user
  unverifiedMatch?: boolean; // True if automatically matched by algorithm but pending user confirmation
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
  status: 'OPEN' | 'IN_PROCESS' | 'IN PROCESS' | 'COMPLETED' | 'PENDING' | 'PENDING_APPROVAL';
  dateCreated: string;
  dueDate: string;
  items: OrderLineItem[];
  companyId?: string;
  changeLog?: ChangeLogEntry[];
  pickedItems?: PickedItem[];
  originalOrderId?: string;
  reopenCount?: number;
  stockProcessed?: boolean; 
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

export interface ApprovalMetadata {
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  approverRole?: string;
  approverEmail?: string; // The email that was required for this level
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
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'SENT';
  approvalMetadata?: ApprovalMetadata;
  companyId?: string;
}

export interface ReceiptItem {
  id: string;
  material: string;
  qty: number;
  bin?: string;
}

export interface ReceiptPedido {
  id: string;
  description?: string;
  material?: string;
  qty?: number;
  bin?: string;
  poNumber?: string;
  items?: ReceiptItem[];
}

export interface Receipt {
  id: string;
  date: string;
  poNumber: string;
  userId: string;
  documentImage?: string;
  sessionId?: string;
  notes?: string;
  companyId?: string;
  items?: ReceiptItem[]; // Legacy
  pedidos?: ReceiptPedido[]; // New format
}

export interface RolePermissions {
    canCreateOrder: boolean;
    canViewOpenOrders: boolean;
    canViewOwnOpenOrders: boolean;
    canViewFinishedOrders: boolean;
    canViewOwnFinishedOrders: boolean;
    canCreatePurchaseOrder: boolean;
    canViewStock: boolean;
    canManageStock: boolean; // Upload/Edit
    canViewReceipts: boolean;
    canViewTransfers: boolean;
    canViewShortages: boolean;
    canSearch: boolean;
    canManageUsers: boolean; // Usually Admin only
    canManageSettings: boolean; // Usually Admin only
}

export interface SynonymGroup {
  id: string;
  words: string[];
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
  approvalRules?: ApprovalRule[];
  permissions?: Record<UserRole, RolePermissions>;
  roleHierarchy?: Record<string, number>;
  synonyms?: SynonymGroup[];
  supervisorRoles?: string[];
}

export interface Transfer {
  id: string;
  material: string;
  qty: number;
  originBin: string;
  destBin: string;
  timestamp: string;
  userId: string;
}

export type ViewState = 'LOGIN' | 'DASHBOARD' | 'CREATE_ORDER' | 'OPEN_ORDERS' | 'FINISHED_ORDERS' | 'STOCK' | 'QUERY' | 'SETTINGS' | 'USERS' | 'PURCHASE_ORDERS' | 'SHORTAGES' | 'RECEIPTS' | 'TRANSFERS' | 'PROFILE';

export type OrderItem = Order;
