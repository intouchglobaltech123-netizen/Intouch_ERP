export interface User {
  id: string;
  name: string;
  email: string;
  role: 'Developer' | 'Designer' | 'Project Manager' | 'Admin';
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeamMember {
  id: string;
  name: 'Suveda' | 'Srimun' | string;
  role: string;
  email: string;
  phone?: string;
  avatar?: string;
  projectsWorkedOn: number;
  revenueGenerated: number;
  profitShareEarned: number;
  expensesPaid: number;
  createdAt: string;
  updatedAt: string;
}

export type ProjectStatus =
  | 'Lead'
  | 'Planning'
  | 'In Progress'
  | 'Client Review'
  | 'Completed'
  | 'Maintenance'
  | 'On Hold'
  | 'Cancelled';

export interface ProjectTimelineStage {
  id: string;
  stage: 'Project Created' | 'Development Started' | 'Client Review' | 'Final Changes' | 'Completed' | 'Delivered';
  completed: boolean;
  completedDate?: string;
  description?: string;
  updatedBy?: string;
}

export interface ProjectUpdate {
  id: string;
  date: string;
  time: string;
  title: string;
  description: string;
  author: 'Suveda' | 'Srimun' | string;
}

export interface ProjectRepository {
  id: string;
  name: string;
  githubUrl: string;
  owner: string;
  branch: string;
  framework: string;
  lastUpdated: string;
  status: 'Active' | 'Archived' | 'Maintenance';
}

export type DomainOwnership = 'Client Owned' | 'Studio Needed' | 'Pending' | 'Not Required';

export interface LiveWebsiteTracking {
  liveUrl: string;
  adminUrl?: string;
  platform: string; // e.g. Vercel, Railway, Hostinger, AWS
  hosting: string;
  domain: string;
  domainOwnership?: DomainOwnership;
  domainRegistrar?: string;
  domainRenewalDate?: string;
  domainCost?: number;
  domainClientExtra?: number; // Extra money given by client for domain (apart from fixed price)
  domainClientReceived?: number; // Extra domain money received so far
  domainClientPaidStatus?: 'Received' | 'Pending';
  domainPaidBy?: 'Studio' | 'Client' | 'Shared';
  sslStatus: 'Valid' | 'Pending' | 'Expired';
  status: 'Live' | 'Maintenance' | 'Offline' | 'Not Deployed';
}

export interface ProjectTask {
  id: string;
  title: string;
  status: 'Todo' | 'In Progress' | 'Completed';
  assignee: 'Suveda' | 'Srimun' | 'Both' | string;
  dueDate?: string;
}

export interface ProjectNote {
  id: string;
  date: string;
  time: string;
  title: string;
  content: string;
  author: 'Suveda' | 'Srimun' | string;
  category: 'Meeting' | 'Requirement' | 'Change Request' | 'Decision' | 'Deployment' | 'Maintenance';
}

export interface MaintenanceInfo {
  status: 'Active' | 'Inactive' | 'Scheduled';
  startDate?: string;
  endDate?: string;
  lastUpdate?: string;
  nextMaintenanceDate?: string;
  notes?: string;
}

export interface ProjectFinancials {
  projectValue: number; // Base fixed price agreed with client
  advanceExpected: number;
  advanceReceived: number;
  finalPaymentExpected: number;
  finalPaymentReceived: number;
  totalReceived: number;
  outstandingAmount: number;
  domainClientExtra?: number; // Extra money given by client for domain (apart from fixed price)
  domainClientReceived?: number; // Extra domain money received from client
  domainClientPaidStatus?: 'Received' | 'Pending';
  domainCost?: number; // Actual domain purchase / renewal fee (expense)
  otherExpenses?: number;
  totalExpenses: number;
  netProfit: number;
  profitSplit: {
    suvedaPercent: number;
    srimunPercent: number;
    suvedaAmount: number;
    srimunAmount: number;
  };
}

export interface ProjectAnalytics {
  ga4MeasurementId?: string; // e.g. G-XXXXXXXXXX
  ga4Link?: string;          // e.g. https://analytics.google.com/...
  notes?: string;
}

export interface BlogSchedule {
  hasBlog: boolean;
  postsPerWeek?: number;       // 1, 2, 3, etc.
  scheduleDays?: string[];     // e.g. ['Monday', 'Wednesday', 'Friday']
  blogUrl?: string;           // e.g. https://example.com/blog
  notifyOnSchedule?: boolean;  // whether notifications are enabled (default true)
  lastPublishedDate?: string;
  notes?: string;
}

export interface Project {
  id: string;
  name: string;
  type: string;
  client: string;
  clientId?: string;
  clientDetails?: {
    name?: string;
    companyName?: string;
    phone?: string;
    email?: string;
    whatsapp?: string;
    address?: string;
    notes?: string;
  };
  teamMembers: string[];
  startDate: string;
  expectedCompletionDate?: string;
  actualCompletionDate?: string;
  status: ProjectStatus;
  description: string;
  links: {
    githubRepo?: string;
    githubBranch?: string;
    figmaDesign?: string;
    liveWebsite?: string;
    googleDrive?: string;
    deploymentUrl?: string;
    otherLinks?: string;
    ga4Link?: string;
    blogUrl?: string;
  };
  designAndDev: {
    hasFigma: boolean;
    figmaUrl?: string;
    technologies: string[];
  };
  financials: ProjectFinancials;
  timeline: ProjectTimelineStage[];
  updates: ProjectUpdate[];
  repositories: ProjectRepository[];
  liveWebsite: LiveWebsiteTracking;
  analytics?: ProjectAnalytics;
  blogSchedule?: BlogSchedule;
  tasks: ProjectTask[];
  notes: ProjectNote[];
  maintenance: MaintenanceInfo;
  createdAt: string;
  updatedAt: string;
}

export interface ClientCommunication {
  id: string;
  date: string;
  type: 'Call' | 'WhatsApp' | 'Email' | 'Meeting';
  summary: string;
  notes?: string;
}

export interface Client {
  id: string;
  name: string;
  companyName: string;
  phone: string;
  email: string;
  whatsapp: string;
  address?: string;
  projects: string[]; // project names or IDs
  totalRevenue: number;
  pendingAmount: number;
  notes?: string;
  communicationHistory?: ClientCommunication[];
  createdAt: string;
  updatedAt: string;
}

export type ExpenseCategory =
  | 'AI Tools'
  | 'Software'
  | 'Domain'
  | 'Hosting'
  | 'Cloud'
  | 'Railway'
  | 'Vercel'
  | 'Supabase'
  | 'Database'
  | 'Design Tools'
  | 'Development Tools'
  | 'Marketing'
  | 'Travel'
  | 'Hardware'
  | 'Other';

export interface Expense {
  id: string;
  name: string;
  category: ExpenseCategory;
  amount: number;
  date: string;
  projectId?: string;
  projectName?: string;
  paidBy: 'Suveda' | 'Srimun' | 'Both' | 'Shared' | string;
  splitDetails?: {
    suvedaAmount?: number;
    srimunAmount?: number;
    suvedaPercent?: number;
    srimunPercent?: number;
  };
  paymentMethod: string;
  recurring: boolean;
  frequency?: 'Monthly' | 'Yearly' | 'One-Time';
  deductFromProfit?: boolean;
  notes?: string;
  receipt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ToolSubscription {
  id: string;
  name: string;
  category: string;
  plan: string;
  billing: 'Monthly' | 'Yearly';
  cost: number;
  purchaseDate: string;
  renewalDate: string;
  usedBy: 'Suveda' | 'Srimun' | 'Both';
  paymentMethod: string;
  status: 'Active' | 'Cancelled' | 'Expired';
  notes?: string;
  websiteUrl?: string;
  billProof?: string;
  billProofName?: string;
  billProofType?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentTransaction {
  id: string;
  projectId?: string;
  projectName?: string;
  clientId?: string;
  clientName?: string;
  type: 'Income' | 'Expense' | 'Refund' | 'Other';
  description: string;
  amount: number;
  date: string;
  paymentMethod: string;
  reference?: string;
  status: 'Paid' | 'Partially Paid' | 'Pending' | 'Overdue';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentItem {
  id: string;
  name: string;
  type: 'Proposal' | 'Invoice' | 'Requirements' | 'Client Brief' | 'Contract' | 'Screenshots' | 'Final Delivery' | 'PDF' | 'Other Documents';
  fileUrl: string;
  fileSize?: string;
  uploadedDate: string;
  projectId?: string;
  projectName?: string;
  uploadedBy: 'Suveda' | 'Srimun';
  createdAt: string;
  updatedAt: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: 'payment' | 'renewal' | 'deadline' | 'maintenance' | 'system' | 'blog';
  date: string;
  read: boolean;
  link?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppSettings {
  businessName: string;
  currency: string;
  currencySymbol: string;
  teamMembers: string[];
  defaultProfitSplit: {
    suveda: number;
    srimun: number;
  };
  projectStatuses: string[];
  expenseCategories: string[];
  paymentMethods: string[];
  updatedAt: string;
}

// --- ERP EXTENSIONS ---

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string; // e.g. INV-2026-001
  type: 'Invoice' | 'Quotation' | 'Receipt';
  clientId: string;
  clientName: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string;
  projectId?: string;
  projectName?: string;
  issueDate: string;
  dueDate: string;
  items: InvoiceLineItem[];
  subtotal: number;
  taxRate: number; // e.g. 18 for 18% GST, 0 for none
  taxAmount: number;
  discountAmount?: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  status: 'Draft' | 'Sent' | 'Paid' | 'Partially Paid' | 'Overdue';
  paymentTerms?: string;
  notes?: string;
  upiId?: string;
  bankDetails?: {
    accountName: string;
    accountNumber: string;
    ifscCode: string;
    bankName: string;
    branch?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Lead {
  id: string;
  clientName: string;
  companyName?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  projectTitle: string;
  projectType: string;
  estimatedValue: number;
  source: 'Referral' | 'Website' | 'Instagram' | 'LinkedIn' | 'Cold Outreach' | 'WhatsApp' | 'Other';
  status: 'New' | 'Contacted' | 'Proposal Sent' | 'Negotiation' | 'Won' | 'Lost';
  priority: 'High' | 'Medium' | 'Low';
  notes?: string;
  followUpDate?: string;
  convertedProjectId?: string;
  convertedClientId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PartnerPayout {
  id: string;
  partner: 'Suveda' | 'Srimun';
  amount: number;
  date: string;
  paymentMethod: 'Bank Transfer' | 'UPI' | 'Cash' | string;
  referenceId?: string;
  notes?: string;
  createdAt: string;
}

export interface MaintenanceContract {
  id: string;
  projectId: string;
  projectName: string;
  clientName: string;
  amount: number;
  frequency: 'Monthly' | 'Yearly';
  startDate: string;
  nextRenewalDate: string;
  status: 'Active' | 'Due Soon' | 'Overdue' | 'Cancelled';
  domainUrl?: string;
  domainExpiryDate?: string;
  sslExpiryDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
