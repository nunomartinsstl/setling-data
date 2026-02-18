
export enum UserRole {
  ADMIN = 'ADMIN',
  MANAGEMENT = 'MANAGEMENT',
  WAREHOUSE = 'WAREHOUSE',
  TECHNICAL = 'TECHNICAL',
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
  supervisorId?: string; // Link to the Coordinator responsible for this Technician
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
  approverEmail: string;
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
  approvalRules?: ApprovalRule[];
}

export type ViewState = 'LOGIN' | 'DASHBOARD' | 'CREATE_ORDER' | 'OPEN_ORDERS' | 'FINISHED_ORDERS' | 'STOCK' | 'QUERY' | 'SETTINGS' | 'USERS' | 'PURCHASE_ORDERS' | 'SHORTAGES' | 'RECEIPTS';

export type OrderItem = Order;
