import {
  Project,
  Client,
  Expense,
  ToolSubscription,
  PaymentTransaction,
  TeamMember,
  AppSettings,
  NotificationItem,
  DocumentItem
} from '../types';

export const initialTeamMembers: TeamMember[] = [
  {
    id: 'team-1',
    name: 'Suveda',
    role: 'Full Stack Developer & Admin',
    email: 'suveda@freelance.internal',
    phone: '+91 98765 43210',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    projectsWorkedOn: 0,
    revenueGenerated: 0,
    profitShareEarned: 0,
    expensesPaid: 0,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z'
  },
  {
    id: 'team-2',
    name: 'Srimun',
    role: 'Lead Architect & UI Engineer',
    email: 'srimun@freelance.internal',
    phone: '+91 98765 43211',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    projectsWorkedOn: 0,
    revenueGenerated: 0,
    profitShareEarned: 0,
    expensesPaid: 0,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z'
  }
];

export const initialClients: Client[] = [];
export const initialProjects: Project[] = [];
export const initialExpenses: Expense[] = [];
export const initialTools: ToolSubscription[] = [];
export const initialPayments: PaymentTransaction[] = [];
export const initialDocuments: DocumentItem[] = [];
export const initialNotifications: NotificationItem[] = [];

export const initialSettings: AppSettings = {
  businessName: 'Suveda & Srimun Studio',
  currency: 'INR',
  currencySymbol: '₹',
  teamMembers: ['Suveda', 'Srimun'],
  defaultProfitSplit: {
    suveda: 50,
    srimun: 50
  },
  projectStatuses: [
    'Lead',
    'Planning',
    'In Progress',
    'Client Review',
    'Completed',
    'Maintenance',
    'On Hold',
    'Cancelled'
  ],
  expenseCategories: [
    'AI Tools',
    'Software',
    'Domain',
    'Hosting',
    'Cloud',
    'Railway',
    'Vercel',
    'Supabase',
    'Database',
    'Design Tools',
    'Development Tools',
    'Marketing',
    'Travel',
    'Hardware',
    'Other'
  ],
  paymentMethods: ['Bank Transfer', 'UPI', 'NEFT', 'RTGS', 'Credit Card', 'Cash', 'Stripe'],
  updatedAt: '2026-06-01T00:00:00.000Z'
};
