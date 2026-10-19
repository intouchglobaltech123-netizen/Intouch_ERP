import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  Project,
  Client,
  Expense,
  ToolSubscription,
  PaymentTransaction,
  TeamMember,
  AppSettings,
  NotificationItem,
  DocumentItem,
  Invoice,
  Lead,
  PartnerPayout,
  MaintenanceContract
} from '../types';
import {
  initialProjects,
  initialClients,
  initialExpenses,
  initialTools,
  initialPayments,
  initialDocuments,
  initialNotifications,
  initialTeamMembers,
  initialSettings
} from '../seed/initialData';

interface DatabaseData {
  projects: Project[];
  clients: Client[];
  expenses: Expense[];
  tools: ToolSubscription[];
  payments: PaymentTransaction[];
  documents: DocumentItem[];
  notifications: NotificationItem[];
  teamMembers: TeamMember[];
  settings: AppSettings;
  invoices: Invoice[];
  leads: Lead[];
  partnerPayouts: PartnerPayout[];
  maintenanceContracts: MaintenanceContract[];
}

const DATA_DIR = path.resolve(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'store.json');

export class DataStore {
  private data: DatabaseData;

  constructor() {
    this.data = this.loadData();
    this.recalculateAll();
  }

  private loadData(): DatabaseData {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DATA_FILE)) {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        // Fallback checks
        return {
          projects: Array.isArray(parsed.projects) ? parsed.projects : [],
          clients: Array.isArray(parsed.clients) ? parsed.clients : [],
          expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
          tools: Array.isArray(parsed.tools) ? parsed.tools : [],
          payments: Array.isArray(parsed.payments) ? parsed.payments : [],
          documents: Array.isArray(parsed.documents) ? parsed.documents : [],
          notifications: Array.isArray(parsed.notifications) ? parsed.notifications : [],
          teamMembers: Array.isArray(parsed.teamMembers) ? parsed.teamMembers : initialTeamMembers,
          settings: parsed.settings || initialSettings,
          invoices: Array.isArray(parsed.invoices) ? parsed.invoices : [],
          leads: Array.isArray(parsed.leads) ? parsed.leads : [],
          partnerPayouts: Array.isArray(parsed.partnerPayouts) ? parsed.partnerPayouts : [],
          maintenanceContracts: Array.isArray(parsed.maintenanceContracts) ? parsed.maintenanceContracts : []
        };
      }
    } catch (err) {
      console.error('Error loading database store, falling back to seed data:', err);
    }

    const defaultData: DatabaseData = {
      projects: initialProjects,
      clients: initialClients,
      expenses: initialExpenses,
      tools: initialTools,
      payments: initialPayments,
      documents: initialDocuments,
      notifications: initialNotifications,
      teamMembers: initialTeamMembers,
      settings: initialSettings,
      invoices: [],
      leads: [],
      partnerPayouts: [],
      maintenanceContracts: []
    };

    this.saveDataDirect(defaultData);
    return defaultData;
  }

  private saveData(): void {
    this.saveDataDirect(this.data);
  }

  public reloadFromDisk(): void {
    this.data = this.loadData();
  }

  private saveDataDirect(data: DatabaseData): void {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error saving data store to disk:', err);
    }
  }

  public recalculateAll(): void {
    // Recalculate each project's expenses, net profit, and profit split
    this.data.projects.forEach((proj) => {
      const explicitDomainCost = Number(proj.financials?.domainCost ?? proj.liveWebsite?.domainCost) || 0;
      const projectExpenseItems = this.data.expenses
        .filter((e) => (e.projectId === proj.id || (e.projectName && e.projectName.toLowerCase() === proj.name.toLowerCase())) && e.deductFromProfit !== false);

      const domainExpenseItemsTotal = projectExpenseItems
        .filter((e) => e.category === 'Domain')
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

      // Effective domain cost: from expense items or from explicit project field
      const effectiveDomainCost = domainExpenseItemsTotal > 0 ? domainExpenseItemsTotal : explicitDomainCost;

      const nonDomainExpenses = projectExpenseItems
        .filter((e) => e.category !== 'Domain')
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

      const manualOtherExpenses = Number(proj.financials?.otherExpenses) || 0;
      const effectiveOtherExpenses = Math.max(nonDomainExpenses, manualOtherExpenses);

      const projectExpenses = effectiveDomainCost + effectiveOtherExpenses;

      // Extra domain money from client (apart from fixed price)
      const domainClientExtra = Number(proj.financials?.domainClientExtra ?? proj.liveWebsite?.domainClientExtra) || 0;
      const domainClientPaidStatus = (proj.financials?.domainClientPaidStatus ?? proj.liveWebsite?.domainClientPaidStatus) || (domainClientExtra > 0 ? 'Received' : 'Pending');
      const domainClientReceived = domainClientPaidStatus === 'Received'
        ? domainClientExtra
        : (Number(proj.financials?.domainClientReceived ?? proj.liveWebsite?.domainClientReceived) || 0);

      const baseProjectValue = Number(proj.financials.projectValue) || 0;
      const totalProjectBilling = baseProjectValue + domainClientExtra;

      const fixedReceived = (Number(proj.financials.advanceReceived) || 0) + (Number(proj.financials.finalPaymentReceived) || 0);
      const totalReceived = fixedReceived + domainClientReceived;
      const outstandingAmount = Math.max(0, totalProjectBilling - totalReceived);
      const netProfit = totalReceived - projectExpenses;

      const suvedaPct = proj.financials.profitSplit?.suvedaPercent ?? 50;
      const srimunPct = proj.financials.profitSplit?.srimunPercent ?? 50;

      proj.financials.totalReceived = totalReceived;
      proj.financials.outstandingAmount = outstandingAmount;
      proj.financials.domainCost = effectiveDomainCost;
      proj.financials.domainClientExtra = domainClientExtra;
      proj.financials.domainClientReceived = domainClientReceived;
      proj.financials.domainClientPaidStatus = domainClientPaidStatus;
      if (proj.liveWebsite) {
        proj.liveWebsite.domainCost = effectiveDomainCost;
        proj.liveWebsite.domainClientExtra = domainClientExtra;
        proj.liveWebsite.domainClientReceived = domainClientReceived;
        proj.liveWebsite.domainClientPaidStatus = domainClientPaidStatus;
      }
      proj.financials.otherExpenses = effectiveOtherExpenses;
      proj.financials.totalExpenses = projectExpenses;
      proj.financials.netProfit = netProfit;
      proj.financials.profitSplit = {
        suvedaPercent: suvedaPct,
        srimunPercent: srimunPct,
        suvedaAmount: Math.round((netProfit * suvedaPct) / 100),
        srimunAmount: Math.round((netProfit * srimunPct) / 100)
      };
    });

    // Recalculate team members stats
    const totalSuvedaProfit = this.data.projects.reduce((sum, p) => sum + p.financials.profitSplit.suvedaAmount, 0);
    const totalSrimunProfit = this.data.projects.reduce((sum, p) => sum + p.financials.profitSplit.srimunAmount, 0);

    const suvedaExpenses = this.data.expenses.reduce((sum, e) => {
      if (e.paidBy === 'Suveda') return sum + (Number(e.amount) || 0);
      if (e.paidBy === 'Both' || e.paidBy === 'Shared') {
        return sum + (Number(e.splitDetails?.suvedaAmount) || Math.round((Number(e.amount) || 0) / 2));
      }
      return sum;
    }, 0);

    const srimunExpenses = this.data.expenses.reduce((sum, e) => {
      if (e.paidBy === 'Srimun') return sum + (Number(e.amount) || 0);
      if (e.paidBy === 'Both' || e.paidBy === 'Shared') {
        return sum + (Number(e.splitDetails?.srimunAmount) || ((Number(e.amount) || 0) - Math.round((Number(e.amount) || 0) / 2)));
      }
      return sum;
    }, 0);

    const totalRevenue = this.data.projects.reduce((sum, p) => sum + p.financials.totalReceived, 0);

    this.data.teamMembers = this.data.teamMembers.map((member) => {
      const isSuveda = member.name.toLowerCase() === 'suveda';
      const isSrimun = member.name.toLowerCase() === 'srimun';
      const memberProjects = this.data.projects.filter((p) =>
        p.teamMembers.some((m) => m.toLowerCase() === member.name.toLowerCase())
      );
      const memberRevenue = memberProjects.reduce((sum, p) => sum + p.financials.totalReceived, 0);
      const memberExpenses = isSuveda
        ? suvedaExpenses
        : isSrimun
        ? srimunExpenses
        : this.data.expenses
            .filter((e) => e.paidBy.toLowerCase() === member.name.toLowerCase())
            .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

      let profitEarned = 0;
      if (isSuveda) {
        profitEarned = totalSuvedaProfit;
      } else if (isSrimun) {
        profitEarned = totalSrimunProfit;
      } else {
        // For custom team member, calculate their share across assigned projects
        profitEarned = memberProjects.reduce((sum, p) => sum + Math.round((p.financials.netProfit * 0.15)), 0);
      }

      return {
        ...member,
        revenueGenerated: isSuveda || isSrimun ? totalRevenue : memberRevenue,
        profitShareEarned: profitEarned,
        expensesPaid: memberExpenses,
        projectsWorkedOn: memberProjects.length
      };
    });

    // Ensure every project with a client name is represented in this.data.clients without requiring separate client creation
    this.data.projects.forEach((proj) => {
      const clientName = (proj.client || proj.clientDetails?.name || '').trim();
      if (!clientName) return;

      let matched = this.data.clients.find(
        (c) => (proj.clientId && c.id === proj.clientId) || c.name.trim().toLowerCase() === clientName.toLowerCase()
      );

      if (!matched) {
        // Auto-create client from project details
        const newClient: Client = {
          id: proj.clientId || ('client-' + uuidv4().slice(0, 8)),
          name: clientName,
          companyName: proj.clientDetails?.companyName || '',
          phone: proj.clientDetails?.phone || '',
          email: proj.clientDetails?.email || '',
          whatsapp: proj.clientDetails?.whatsapp || proj.clientDetails?.phone || '',
          address: proj.clientDetails?.address || '',
          projects: [proj.name],
          totalRevenue: 0,
          pendingAmount: 0,
          notes: proj.clientDetails?.notes || '',
          communicationHistory: [],
          createdAt: proj.createdAt || new Date().toISOString(),
          updatedAt: proj.updatedAt || new Date().toISOString()
        };
        this.data.clients.push(newClient);
        proj.clientId = newClient.id;
      } else {
        proj.clientId = matched.id;
        // Enrich client contact details if available in project
        if (proj.clientDetails) {
          if (!matched.companyName && proj.clientDetails.companyName) matched.companyName = proj.clientDetails.companyName;
          if (!matched.phone && proj.clientDetails.phone) matched.phone = proj.clientDetails.phone;
          if (!matched.email && proj.clientDetails.email) matched.email = proj.clientDetails.email;
          if (!matched.whatsapp && proj.clientDetails.whatsapp) matched.whatsapp = proj.clientDetails.whatsapp;
          if (!matched.address && proj.clientDetails.address) matched.address = proj.clientDetails.address;
          if (!matched.notes && proj.clientDetails.notes) matched.notes = proj.clientDetails.notes;
        }
      }
    });

    // Recalculate clients revenue & pending amounts across all contracted projects
    this.data.clients.forEach((c) => {
      const clientProjects = this.data.projects.filter(
        (p) => (p.clientId && p.clientId === c.id) || (p.client && p.client.trim().toLowerCase() === c.name.trim().toLowerCase())
      );
      c.totalRevenue = clientProjects.reduce((sum, p) => sum + (Number(p.financials?.totalReceived) || 0), 0);
      c.pendingAmount = clientProjects.reduce((sum, p) => sum + (Number(p.financials?.outstandingAmount) || 0), 0);
      c.projects = Array.from(new Set(clientProjects.map((p) => p.name)));
    });

    this.saveData();
  }

  // --- PROJECTS ---
  public getProjects(): Project[] {
    return this.data.projects;
  }

  public getProjectById(id: string): Project | undefined {
    return this.data.projects.find((p) => p.id === id);
  }

  public addProject(project: Project): Project {
    this.data.projects.unshift(project);

    // If project has a blog schedule, generate an initial confirmation notification
    if (project.blogSchedule?.hasBlog) {
      const postsPerWk = project.blogSchedule.postsPerWeek || 1;
      const days = (project.blogSchedule.scheduleDays && project.blogSchedule.scheduleDays.length > 0)
        ? project.blogSchedule.scheduleDays.join(', ')
        : 'scheduled days';
      this.data.notifications.unshift({
        id: 'notif-blog-' + uuidv4().slice(0, 8),
        title: `📅 Blog Schedule Active: ${project.name}`,
        message: `Configured for ${postsPerWk} blog post(s)/week (${days}). Automated publishing reminders will trigger on schedule days.`,
        type: 'blog',
        date: new Date().toISOString().split('T')[0],
        read: false,
        link: `/projects?projectId=${project.id}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }

    this.recalculateAll();
    return project;
  }

  public updateProject(id: string, updates: Partial<Project>): Project | null {
    const idx = this.data.projects.findIndex((p) => p.id === id);
    if (idx === -1) return null;

    const existing = this.data.projects[idx];
    const updated: Project = {
      ...existing,
      ...updates,
      financials: {
        ...existing.financials,
        ...(updates.financials || {})
      },
      links: {
        ...existing.links,
        ...(updates.links || {})
      },
      designAndDev: {
        ...existing.designAndDev,
        ...(updates.designAndDev || {})
      },
      liveWebsite: {
        ...existing.liveWebsite,
        ...(updates.liveWebsite || {})
      },
      analytics: updates.analytics !== undefined ? {
        ...(existing.analytics || {}),
        ...updates.analytics
      } : existing.analytics,
      blogSchedule: updates.blogSchedule !== undefined ? {
        ...(existing.blogSchedule || {}),
        ...updates.blogSchedule
      } : existing.blogSchedule,
      maintenance: {
        ...existing.maintenance,
        ...(updates.maintenance || {})
      },
      updatedAt: new Date().toISOString()
    };

    this.data.projects[idx] = updated;
    this.recalculateAll();
    return updated;
  }

  public deleteProject(id: string): boolean {
    const initLen = this.data.projects.length;
    this.data.projects = this.data.projects.filter((p) => p.id !== id);
    if (this.data.projects.length !== initLen) {
      this.recalculateAll();
      return true;
    }
    return false;
  }

  public clearAllProjects(): void {
    this.data.projects = [];
    this.data.payments = this.data.payments.filter((p) => !p.projectId);
    this.data.documents = this.data.documents.filter((d) => !d.projectId);
    this.data.expenses = this.data.expenses.map((e) => ({
      ...e,
      projectId: undefined,
      projectName: undefined
    }));
    this.recalculateAll();
  }

  // --- CLIENTS ---
  public getClients(): Client[] {
    return this.data.clients;
  }

  public getClientById(id: string): Client | undefined {
    return this.data.clients.find((c) => c.id === id);
  }

  public addClient(client: Client): Client {
    this.data.clients.unshift(client);
    this.recalculateAll();
    return client;
  }

  public updateClient(id: string, updates: Partial<Client>): Client | null {
    const idx = this.data.clients.findIndex((c) => c.id === id);
    if (idx === -1) return null;

    const oldName = this.data.clients[idx].name;
    this.data.clients[idx] = {
      ...this.data.clients[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    // If name was updated, update associated projects client name as well
    if (updates.name && updates.name.trim() && updates.name.trim() !== oldName) {
      const newName = updates.name.trim();
      this.data.projects.forEach((p) => {
        if (p.clientId === id || (p.client && p.client.trim().toLowerCase() === oldName.trim().toLowerCase())) {
          p.client = newName;
          if (p.clientDetails) p.clientDetails.name = newName;
        }
      });
    }

    // Sync contact info to projects clientDetails
    this.data.projects.forEach((p) => {
      if (p.clientId === id || (p.client && p.client.trim().toLowerCase() === oldName.trim().toLowerCase())) {
        p.clientId = id;
        if (!p.clientDetails) p.clientDetails = {};
        if (updates.companyName !== undefined) p.clientDetails.companyName = updates.companyName;
        if (updates.phone !== undefined) p.clientDetails.phone = updates.phone;
        if (updates.email !== undefined) p.clientDetails.email = updates.email;
        if (updates.whatsapp !== undefined) p.clientDetails.whatsapp = updates.whatsapp;
        if (updates.address !== undefined) p.clientDetails.address = updates.address;
        if (updates.notes !== undefined) p.clientDetails.notes = updates.notes;
      }
    });

    this.recalculateAll();
    return this.data.clients[idx];
  }

  public deleteClient(id: string): boolean {
    const initLen = this.data.clients.length;
    this.data.clients = this.data.clients.filter((c) => c.id !== id);
    if (this.data.clients.length !== initLen) {
      this.recalculateAll();
      return true;
    }
    return false;
  }

  public clearAllClients(): void {
    this.data.clients = [];
    this.recalculateAll();
  }

  // --- EXPENSES ---
  public getExpenses(): Expense[] {
    return this.data.expenses;
  }

  public addExpense(expense: Expense): Expense {
    this.data.expenses.unshift(expense);
    this.recalculateAll();
    return expense;
  }

  public updateExpense(id: string, updates: Partial<Expense>): Expense | null {
    const idx = this.data.expenses.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    this.data.expenses[idx] = {
      ...this.data.expenses[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.recalculateAll();
    return this.data.expenses[idx];
  }

  public deleteExpense(id: string): boolean {
    const initLen = this.data.expenses.length;
    this.data.expenses = this.data.expenses.filter((e) => e.id !== id);
    if (this.data.expenses.length !== initLen) {
      this.recalculateAll();
      return true;
    }
    return false;
  }

  public clearAllExpenses(): void {
    this.data.expenses = [];
    this.recalculateAll();
  }

  // --- TOOLS ---
  public getTools(): ToolSubscription[] {
    return this.data.tools;
  }

  public addTool(tool: ToolSubscription): ToolSubscription {
    this.data.tools.unshift(tool);
    this.saveData();
    return tool;
  }

  public updateTool(id: string, updates: Partial<ToolSubscription>): ToolSubscription | null {
    const idx = this.data.tools.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    this.data.tools[idx] = {
      ...this.data.tools[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.saveData();
    return this.data.tools[idx];
  }

  public deleteTool(id: string): boolean {
    const initLen = this.data.tools.length;
    this.data.tools = this.data.tools.filter((t) => t.id !== id);
    if (this.data.tools.length !== initLen) {
      this.saveData();
      return true;
    }
    return false;
  }

  public clearAllTools(): void {
    this.data.tools = [];
    this.saveData();
  }

  public clearAllData(): void {
    this.data.projects = [];
    this.data.clients = [];
    this.data.expenses = [];
    this.data.tools = [];
    this.data.payments = [];
    this.data.documents = [];
    this.data.notifications = [];
    this.data.teamMembers = this.data.teamMembers.map((m) => ({
      ...m,
      projectsWorkedOn: 0,
      revenueGenerated: 0,
      profitShareEarned: 0,
      expensesPaid: 0
    }));
    this.recalculateAll();
  }

  // --- PAYMENTS ---
  public getPayments(): PaymentTransaction[] {
    return this.data.payments;
  }

  public addPayment(payment: PaymentTransaction): PaymentTransaction {
    this.data.payments.unshift(payment);
    this.saveData();
    return payment;
  }

  public updatePayment(id: string, updates: Partial<PaymentTransaction>): PaymentTransaction | null {
    const idx = this.data.payments.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    this.data.payments[idx] = {
      ...this.data.payments[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.saveData();
    return this.data.payments[idx];
  }

  public deletePayment(id: string): boolean {
    const initLen = this.data.payments.length;
    this.data.payments = this.data.payments.filter((p) => p.id !== id);
    if (this.data.payments.length !== initLen) {
      this.saveData();
      return true;
    }
    return false;
  }

  // --- DOCUMENTS ---
  public getDocuments(): DocumentItem[] {
    return this.data.documents;
  }

  public addDocument(doc: DocumentItem): DocumentItem {
    this.data.documents.unshift(doc);
    this.saveData();
    return doc;
  }

  public deleteDocument(id: string): boolean {
    const initLen = this.data.documents.length;
    this.data.documents = this.data.documents.filter((d) => d.id !== id);
    if (this.data.documents.length !== initLen) {
      this.saveData();
      return true;
    }
    return false;
  }

  // --- NOTIFICATIONS ---
  public addNotification(item: NotificationItem): NotificationItem {
    this.data.notifications.unshift(item);
    this.saveData();
    return item;
  }

  public checkScheduledNotifications(): void {
    const now = new Date();
    const todayDate = now.toISOString().split('T')[0];
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayDay = dayNames[now.getDay()];

    let changed = false;

    // Check blog schedule reminders for active projects
    for (const p of this.data.projects) {
      if (['Cancelled', 'Completed'].includes(p.status)) continue;
      if (!p.blogSchedule?.hasBlog || p.blogSchedule.notifyOnSchedule === false) continue;

      const scheduleDays = p.blogSchedule.scheduleDays || [];
      if (scheduleDays.some((d) => d.trim().toLowerCase() === todayDay.toLowerCase())) {
        // Check if a blog notification for this project already exists today
        const exists = this.data.notifications.some(
          (n) => n.type === 'blog' && n.date === todayDate && n.link?.includes(p.id) && n.title.includes('Due Today')
        );
        if (!exists) {
          const postsPerWk = p.blogSchedule.postsPerWeek || 1;
          this.data.notifications.unshift({
            id: 'notif-blog-' + uuidv4().slice(0, 8),
            title: `📝 Blog Due Today: ${p.name}`,
            message: `Today (${todayDay}) is a scheduled blog post day for ${p.name} (${postsPerWk} blog${postsPerWk > 1 ? 's' : ''}/week). Time to draft, publish, and track in GA4!`,
            type: 'blog',
            date: todayDate,
            read: false,
            link: `/projects?projectId=${p.id}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
          changed = true;
        }
      }
    }

    if (changed) {
      this.saveData();
    }
  }

  public getNotifications(): NotificationItem[] {
    this.checkScheduledNotifications();
    return this.data.notifications;
  }

  public markNotificationRead(id: string): boolean {
    const notif = this.data.notifications.find((n) => n.id === id);
    if (notif) {
      notif.read = true;
      this.saveData();
      return true;
    }
    return false;
  }

  public markAllNotificationsRead(): void {
    this.data.notifications.forEach((n) => (n.read = true));
    this.saveData();
  }

  // --- TEAM ---
  public getTeamMembers(): TeamMember[] {
    return this.data.teamMembers;
  }

  public addTeamMember(member: TeamMember): TeamMember {
    this.data.teamMembers.push(member);
    this.recalculateAll();
    return member;
  }

  public updateTeamMember(id: string, updates: Partial<TeamMember>): TeamMember | null {
    const idx = this.data.teamMembers.findIndex((m) => m.id === id);
    if (idx === -1) return null;
    this.data.teamMembers[idx] = {
      ...this.data.teamMembers[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.recalculateAll();
    return this.data.teamMembers[idx];
  }

  public deleteTeamMember(id: string): boolean {
    const initLen = this.data.teamMembers.length;
    this.data.teamMembers = this.data.teamMembers.filter((m) => m.id !== id);
    if (this.data.teamMembers.length !== initLen) {
      this.recalculateAll();
      return true;
    }
    return false;
  }

  // --- SETTINGS ---
  public getSettings(): AppSettings {
    return this.data.settings;
  }

  public updateSettings(updates: Partial<AppSettings>): AppSettings {
    this.data.settings = {
      ...this.data.settings,
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.saveData();
    return this.data.settings;
  }

  // --- INVOICES ---
  public getInvoices(): Invoice[] {
    return this.data.invoices;
  }

  public getInvoiceById(id: string): Invoice | undefined {
    return this.data.invoices.find((i) => i.id === id);
  }

  public createInvoice(invoiceData: Partial<Invoice>): Invoice {
    const subtotal = (invoiceData.items || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const taxRate = Number(invoiceData.taxRate) || 0;
    const taxAmount = Math.round((subtotal * taxRate) / 100);
    const discount = Number(invoiceData.discountAmount) || 0;
    const total = Math.max(0, subtotal + taxAmount - discount);
    const amountPaid = Number(invoiceData.amountPaid) || 0;
    const balanceDue = Math.max(0, total - amountPaid);

    // Auto-generate invoice number if not provided
    const nextSeq = this.data.invoices.length + 1;
    const invNumber = invoiceData.invoiceNumber || `INV-${new Date().getFullYear()}-${String(nextSeq).padStart(3, '0')}`;

    const newInvoice: Invoice = {
      id: invoiceData.id || `inv-${uuidv4().substring(0, 8)}`,
      invoiceNumber: invNumber,
      type: invoiceData.type || 'Invoice',
      clientId: invoiceData.clientId || '',
      clientName: invoiceData.clientName || 'Client',
      clientEmail: invoiceData.clientEmail || '',
      clientPhone: invoiceData.clientPhone || '',
      clientAddress: invoiceData.clientAddress || '',
      projectId: invoiceData.projectId || '',
      projectName: invoiceData.projectName || '',
      issueDate: invoiceData.issueDate || new Date().toISOString().split('T')[0],
      dueDate: invoiceData.dueDate || new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0],
      items: invoiceData.items || [],
      subtotal,
      taxRate,
      taxAmount,
      discountAmount: discount,
      total,
      amountPaid,
      balanceDue,
      status: invoiceData.status || (balanceDue === 0 ? 'Paid' : 'Sent'),
      paymentTerms: invoiceData.paymentTerms || 'Due within 14 days of invoice date',
      notes: invoiceData.notes || 'Thank you for your business. Please complete payment via UPI or direct bank transfer.',
      upiId: invoiceData.upiId || 'intouch@upi',
      bankDetails: invoiceData.bankDetails || {
        accountName: 'Intouch Studio',
        accountNumber: '920020012345678',
        ifscCode: 'HDFC0001234',
        bankName: 'HDFC Bank',
        branch: 'Chennai'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.data.invoices.unshift(newInvoice);
    this.saveData();
    return newInvoice;
  }

  public updateInvoice(id: string, updates: Partial<Invoice>): Invoice | null {
    const idx = this.data.invoices.findIndex((i) => i.id === id);
    if (idx === -1) return null;

    const current = this.data.invoices[idx];
    const items = updates.items !== undefined ? updates.items : current.items;
    const subtotal = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const taxRate = updates.taxRate !== undefined ? Number(updates.taxRate) : current.taxRate;
    const taxAmount = Math.round((subtotal * taxRate) / 100);
    const discount = updates.discountAmount !== undefined ? Number(updates.discountAmount) : (current.discountAmount || 0);
    const total = Math.max(0, subtotal + taxAmount - discount);
    const amountPaid = updates.amountPaid !== undefined ? Number(updates.amountPaid) : current.amountPaid;
    const balanceDue = Math.max(0, total - amountPaid);

    this.data.invoices[idx] = {
      ...current,
      ...updates,
      items,
      subtotal,
      taxRate,
      taxAmount,
      discountAmount: discount,
      total,
      amountPaid,
      balanceDue,
      status: updates.status || (balanceDue === 0 ? 'Paid' : amountPaid > 0 ? 'Partially Paid' : current.status),
      updatedAt: new Date().toISOString()
    };

    this.saveData();
    return this.data.invoices[idx];
  }

  public deleteInvoice(id: string): boolean {
    const initialLen = this.data.invoices.length;
    this.data.invoices = this.data.invoices.filter((i) => i.id !== id);
    if (this.data.invoices.length !== initialLen) {
      this.saveData();
      return true;
    }
    return false;
  }

  // --- LEADS & CRM ---
  public getLeads(): Lead[] {
    return this.data.leads;
  }

  public getLeadById(id: string): Lead | undefined {
    return this.data.leads.find((l) => l.id === id);
  }

  public createLead(leadData: Partial<Lead>): Lead {
    const newLead: Lead = {
      id: leadData.id || `lead-${uuidv4().substring(0, 8)}`,
      clientName: leadData.clientName || 'Prospective Client',
      companyName: leadData.companyName || '',
      email: leadData.email || '',
      phone: leadData.phone || '',
      whatsapp: leadData.whatsapp || leadData.phone || '',
      projectTitle: leadData.projectTitle || 'New Development Project',
      projectType: leadData.projectType || 'Full Stack App',
      estimatedValue: Number(leadData.estimatedValue) || 0,
      source: leadData.source || 'Referral',
      status: leadData.status || 'New',
      priority: leadData.priority || 'Medium',
      notes: leadData.notes || '',
      followUpDate: leadData.followUpDate || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.data.leads.unshift(newLead);
    this.saveData();
    return newLead;
  }

  public updateLead(id: string, updates: Partial<Lead>): Lead | null {
    const idx = this.data.leads.findIndex((l) => l.id === id);
    if (idx === -1) return null;

    this.data.leads[idx] = {
      ...this.data.leads[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.saveData();
    return this.data.leads[idx];
  }

  public deleteLead(id: string): boolean {
    const initialLen = this.data.leads.length;
    this.data.leads = this.data.leads.filter((l) => l.id !== id);
    if (this.data.leads.length !== initialLen) {
      this.saveData();
      return true;
    }
    return false;
  }

  public convertLeadToProject(leadId: string): { project: Project; client: Client; lead: Lead } | null {
    const lead = this.getLeadById(leadId);
    if (!lead) return null;

    // 1. Create or Find Client
    let client = this.data.clients.find(
      (c) => c.name.toLowerCase() === lead.clientName.toLowerCase() || (lead.phone && c.phone === lead.phone)
    );

    if (!client) {
      client = this.addClient({
        name: lead.clientName,
        companyName: lead.companyName || '',
        email: lead.email || '',
        phone: lead.phone || '',
        whatsapp: lead.whatsapp || lead.phone || '',
        notes: `Converted from Lead: ${lead.projectTitle}. Source: ${lead.source}`
      });
    }

    // 2. Create Project
    const project = this.addProject({
      name: lead.projectTitle,
      type: lead.projectType || 'Full Stack App',
      client: client.name,
      clientId: client.id,
      clientDetails: {
        name: client.name,
        companyName: client.companyName,
        email: client.email,
        phone: client.phone,
        whatsapp: client.whatsapp,
        address: client.address || '',
        notes: client.notes || ''
      },
      status: 'Planning',
      description: lead.notes || `Initial inquiry converted from lead CRM. Agreed scope: ${lead.projectTitle}`,
      financials: {
        projectValue: lead.estimatedValue || 0,
        advanceExpected: Math.round((lead.estimatedValue || 0) * 0.5),
        advanceReceived: 0,
        finalPaymentExpected: Math.round((lead.estimatedValue || 0) * 0.5),
        finalPaymentReceived: 0,
        totalReceived: 0,
        outstandingAmount: lead.estimatedValue || 0,
        domainCost: 0,
        otherExpenses: 0,
        totalExpenses: 0,
        netProfit: 0,
        profitSplit: {
          suvedaPercent: 50,
          srimunPercent: 50,
          suvedaAmount: 0,
          srimunAmount: 0
        }
      }
    });

    // 3. Mark Lead as Won & link
    lead.status = 'Won';
    lead.convertedProjectId = project.id;
    lead.convertedClientId = client.id;
    lead.updatedAt = new Date().toISOString();

    this.saveData();
    return { project, client, lead };
  }

  // --- PARTNER PAYOUTS & DRAWINGS ---
  public getPartnerPayouts(): PartnerPayout[] {
    return this.data.partnerPayouts;
  }

  public createPartnerPayout(payoutData: Partial<PartnerPayout>): PartnerPayout {
    const newPayout: PartnerPayout = {
      id: payoutData.id || `payout-${uuidv4().substring(0, 8)}`,
      partner: payoutData.partner === 'Srimun' ? 'Srimun' : 'Suveda',
      amount: Number(payoutData.amount) || 0,
      date: payoutData.date || new Date().toISOString().split('T')[0],
      paymentMethod: payoutData.paymentMethod || 'Bank Transfer',
      referenceId: payoutData.referenceId || '',
      notes: payoutData.notes || '',
      createdAt: new Date().toISOString()
    };

    this.data.partnerPayouts.unshift(newPayout);
    this.saveData();
    return newPayout;
  }

  public deletePartnerPayout(id: string): boolean {
    const initialLen = this.data.partnerPayouts.length;
    this.data.partnerPayouts = this.data.partnerPayouts.filter((p) => p.id !== id);
    if (this.data.partnerPayouts.length !== initialLen) {
      this.saveData();
      return true;
    }
    return false;
  }

  public getPartnerPayoutsSummary(): {
    suvedaWithdrawn: number;
    suvedaBalance: number;
    srimunWithdrawn: number;
    srimunBalance: number;
  } {
    const suvedaEarned = this.data.projects.reduce((sum, p) => sum + (p.financials?.profitSplit?.suvedaAmount || 0), 0);
    const srimunEarned = this.data.projects.reduce((sum, p) => sum + (p.financials?.profitSplit?.srimunAmount || 0), 0);

    const suvedaWithdrawn = this.data.partnerPayouts
      .filter((p) => p.partner === 'Suveda')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const srimunWithdrawn = this.data.partnerPayouts
      .filter((p) => p.partner === 'Srimun')
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    return {
      suvedaWithdrawn,
      suvedaBalance: suvedaEarned - suvedaWithdrawn,
      srimunWithdrawn,
      srimunBalance: srimunEarned - srimunWithdrawn
    };
  }

  // --- MAINTENANCE CONTRACTS & RENEWALS ---
  public getMaintenanceContracts(): MaintenanceContract[] {
    return this.data.maintenanceContracts;
  }

  public createMaintenanceContract(contractData: Partial<MaintenanceContract>): MaintenanceContract {
    const newContract: MaintenanceContract = {
      id: contractData.id || `amc-${uuidv4().substring(0, 8)}`,
      projectId: contractData.projectId || '',
      projectName: contractData.projectName || 'Project Maintenance',
      clientName: contractData.clientName || 'Client',
      amount: Number(contractData.amount) || 0,
      frequency: contractData.frequency || 'Monthly',
      startDate: contractData.startDate || new Date().toISOString().split('T')[0],
      nextRenewalDate: contractData.nextRenewalDate || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
      status: contractData.status || 'Active',
      domainUrl: contractData.domainUrl || '',
      domainExpiryDate: contractData.domainExpiryDate || '',
      sslExpiryDate: contractData.sslExpiryDate || '',
      notes: contractData.notes || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.data.maintenanceContracts.unshift(newContract);
    this.saveData();
    return newContract;
  }

  public updateMaintenanceContract(id: string, updates: Partial<MaintenanceContract>): MaintenanceContract | null {
    const idx = this.data.maintenanceContracts.findIndex((c) => c.id === id);
    if (idx === -1) return null;

    this.data.maintenanceContracts[idx] = {
      ...this.data.maintenanceContracts[idx],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    this.saveData();
    return this.data.maintenanceContracts[idx];
  }

  public deleteMaintenanceContract(id: string): boolean {
    const initialLen = this.data.maintenanceContracts.length;
    this.data.maintenanceContracts = this.data.maintenanceContracts.filter((c) => c.id !== id);
    if (this.data.maintenanceContracts.length !== initialLen) {
      this.saveData();
      return true;
    }
    return false;
  }

  // --- EXPORT / IMPORT ALL ---
  public getAllData(): DatabaseData {
    return this.data;
  }

  public importAllData(imported: DatabaseData): boolean {
    if (!imported.projects || !imported.clients) return false;
    this.data = imported;
    this.recalculateAll();
    return true;
  }

  // --- CLEAR / PURGE ALL DATA ---
  public clearAllData(): boolean {
    this.data.projects = [];
    this.data.clients = [];
    this.data.expenses = [];
    this.data.tools = [];
    this.data.payments = [];
    this.data.documents = [];
    this.data.notifications = [];
    this.data.invoices = [];
    this.data.leads = [];
    this.data.partnerPayouts = [];
    this.data.maintenanceContracts = [];
    this.saveData();
    this.recalculateAll();
    return true;
  }

  public clearAllProjects(): boolean {
    this.data.projects = [];
    this.saveData();
    this.recalculateAll();
    return true;
  }

  public clearAllClients(): boolean {
    this.data.clients = [];
    this.saveData();
    this.recalculateAll();
    return true;
  }

  public clearAllExpenses(): boolean {
    this.data.expenses = [];
    this.saveData();
    this.recalculateAll();
    return true;
  }

  public clearAllTools(): boolean {
    this.data.tools = [];
    this.saveData();
    this.recalculateAll();
    return true;
  }

  public clearAllInvoices(): boolean {
    this.data.invoices = [];
    this.saveData();
    this.recalculateAll();
    return true;
  }

  public clearAllLeads(): boolean {
    this.data.leads = [];
    this.saveData();
    this.recalculateAll();
    return true;
  }

  public resetToDemoData(): boolean {
    this.data.projects = JSON.parse(JSON.stringify(initialProjects));
    this.data.clients = JSON.parse(JSON.stringify(initialClients));
    this.data.expenses = JSON.parse(JSON.stringify(initialExpenses));
    this.data.tools = JSON.parse(JSON.stringify(initialTools));
    this.data.payments = JSON.parse(JSON.stringify(initialPayments));
    this.data.documents = JSON.parse(JSON.stringify(initialDocuments));
    this.data.notifications = JSON.parse(JSON.stringify(initialNotifications));
    this.data.teamMembers = JSON.parse(JSON.stringify(initialTeamMembers));
    this.data.invoices = [];
    this.data.leads = [];
    this.data.partnerPayouts = [];
    this.data.maintenanceContracts = [];
    this.saveData();
    this.recalculateAll();
    return true;
  }
}

export const store = new DataStore();
