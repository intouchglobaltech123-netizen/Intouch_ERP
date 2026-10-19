"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.store = exports.DataStore = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const initialData_1 = require("../seed/initialData");
const DATA_DIR = path_1.default.resolve(__dirname, '../../data');
const DATA_FILE = path_1.default.join(DATA_DIR, 'store.json');
class DataStore {
    data;
    constructor() {
        this.data = this.loadData();
        this.recalculateAll();
    }
    loadData() {
        try {
            if (!fs_1.default.existsSync(DATA_DIR)) {
                fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
            }
            if (fs_1.default.existsSync(DATA_FILE)) {
                const raw = fs_1.default.readFileSync(DATA_FILE, 'utf-8');
                const parsed = JSON.parse(raw);
                // Fallback checks
                return {
                    projects: parsed.projects || initialData_1.initialProjects,
                    clients: parsed.clients || initialData_1.initialClients,
                    expenses: parsed.expenses || initialData_1.initialExpenses,
                    tools: parsed.tools || initialData_1.initialTools,
                    payments: parsed.payments || initialData_1.initialPayments,
                    documents: parsed.documents || initialData_1.initialDocuments,
                    notifications: parsed.notifications || initialData_1.initialNotifications,
                    teamMembers: parsed.teamMembers || initialData_1.initialTeamMembers,
                    settings: parsed.settings || initialData_1.initialSettings
                };
            }
        }
        catch (err) {
            console.error('Error loading database store, falling back to seed data:', err);
        }
        const defaultData = {
            projects: initialData_1.initialProjects,
            clients: initialData_1.initialClients,
            expenses: initialData_1.initialExpenses,
            tools: initialData_1.initialTools,
            payments: initialData_1.initialPayments,
            documents: initialData_1.initialDocuments,
            notifications: initialData_1.initialNotifications,
            teamMembers: initialData_1.initialTeamMembers,
            settings: initialData_1.initialSettings
        };
        this.saveDataDirect(defaultData);
        return defaultData;
    }
    saveData() {
        this.saveDataDirect(this.data);
    }
    saveDataDirect(data) {
        try {
            if (!fs_1.default.existsSync(DATA_DIR)) {
                fs_1.default.mkdirSync(DATA_DIR, { recursive: true });
            }
            fs_1.default.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
        }
        catch (err) {
            console.error('Error saving data store to disk:', err);
        }
    }
    recalculateAll() {
        // Recalculate each project's expenses, net profit, and profit split
        this.data.projects.forEach((proj) => {
            const projectExpenses = this.data.expenses
                .filter((e) => e.projectId === proj.id || e.projectName?.toLowerCase() === proj.name.toLowerCase())
                .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
            const totalReceived = (Number(proj.financials.advanceReceived) || 0) + (Number(proj.financials.finalPaymentReceived) || 0);
            const outstandingAmount = Math.max(0, (Number(proj.financials.projectValue) || 0) - totalReceived);
            const netProfit = totalReceived - projectExpenses;
            const suvedaPct = proj.financials.profitSplit?.suvedaPercent ?? 50;
            const srimunPct = proj.financials.profitSplit?.srimunPercent ?? 50;
            proj.financials.totalReceived = totalReceived;
            proj.financials.outstandingAmount = outstandingAmount;
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
        const suvedaExpenses = this.data.expenses
            .filter((e) => e.paidBy === 'Suveda')
            .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
        const srimunExpenses = this.data.expenses
            .filter((e) => e.paidBy === 'Srimun')
            .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
        const totalRevenue = this.data.projects.reduce((sum, p) => sum + p.financials.totalReceived, 0);
        this.data.teamMembers = this.data.teamMembers.map((member) => {
            const isSuveda = member.name.toLowerCase() === 'suveda';
            return {
                ...member,
                revenueGenerated: totalRevenue,
                profitShareEarned: isSuveda ? totalSuvedaProfit : totalSrimunProfit,
                expensesPaid: isSuveda ? suvedaExpenses : srimunExpenses,
                projectsWorkedOn: this.data.projects.filter((p) => p.teamMembers.some((m) => m.toLowerCase() === member.name.toLowerCase())).length
            };
        });
        // Recalculate clients revenue & pending amounts
        this.data.clients.forEach((c) => {
            const clientProjects = this.data.projects.filter((p) => p.clientId === c.id || p.client.toLowerCase() === c.name.toLowerCase());
            c.totalRevenue = clientProjects.reduce((sum, p) => sum + p.financials.totalReceived, 0);
            c.pendingAmount = clientProjects.reduce((sum, p) => sum + p.financials.outstandingAmount, 0);
            c.projects = clientProjects.map((p) => p.name);
        });
        this.saveData();
    }
    // --- PROJECTS ---
    getProjects() {
        return this.data.projects;
    }
    getProjectById(id) {
        return this.data.projects.find((p) => p.id === id);
    }
    addProject(project) {
        this.data.projects.unshift(project);
        this.recalculateAll();
        return project;
    }
    updateProject(id, updates) {
        const idx = this.data.projects.findIndex((p) => p.id === id);
        if (idx === -1)
            return null;
        const existing = this.data.projects[idx];
        const updated = {
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
    deleteProject(id) {
        const initLen = this.data.projects.length;
        this.data.projects = this.data.projects.filter((p) => p.id !== id);
        if (this.data.projects.length !== initLen) {
            this.recalculateAll();
            return true;
        }
        return false;
    }
    // --- CLIENTS ---
    getClients() {
        return this.data.clients;
    }
    getClientById(id) {
        return this.data.clients.find((c) => c.id === id);
    }
    addClient(client) {
        this.data.clients.unshift(client);
        this.recalculateAll();
        return client;
    }
    updateClient(id, updates) {
        const idx = this.data.clients.findIndex((c) => c.id === id);
        if (idx === -1)
            return null;
        this.data.clients[idx] = {
            ...this.data.clients[idx],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        this.recalculateAll();
        return this.data.clients[idx];
    }
    deleteClient(id) {
        const initLen = this.data.clients.length;
        this.data.clients = this.data.clients.filter((c) => c.id !== id);
        if (this.data.clients.length !== initLen) {
            this.recalculateAll();
            return true;
        }
        return false;
    }
    // --- EXPENSES ---
    getExpenses() {
        return this.data.expenses;
    }
    addExpense(expense) {
        this.data.expenses.unshift(expense);
        this.recalculateAll();
        return expense;
    }
    updateExpense(id, updates) {
        const idx = this.data.expenses.findIndex((e) => e.id === id);
        if (idx === -1)
            return null;
        this.data.expenses[idx] = {
            ...this.data.expenses[idx],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        this.recalculateAll();
        return this.data.expenses[idx];
    }
    deleteExpense(id) {
        const initLen = this.data.expenses.length;
        this.data.expenses = this.data.expenses.filter((e) => e.id !== id);
        if (this.data.expenses.length !== initLen) {
            this.recalculateAll();
            return true;
        }
        return false;
    }
    // --- TOOLS ---
    getTools() {
        return this.data.tools;
    }
    addTool(tool) {
        this.data.tools.unshift(tool);
        this.saveData();
        return tool;
    }
    updateTool(id, updates) {
        const idx = this.data.tools.findIndex((t) => t.id === id);
        if (idx === -1)
            return null;
        this.data.tools[idx] = {
            ...this.data.tools[idx],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        this.saveData();
        return this.data.tools[idx];
    }
    deleteTool(id) {
        const initLen = this.data.tools.length;
        this.data.tools = this.data.tools.filter((t) => t.id !== id);
        if (this.data.tools.length !== initLen) {
            this.saveData();
            return true;
        }
        return false;
    }
    // --- PAYMENTS ---
    getPayments() {
        return this.data.payments;
    }
    addPayment(payment) {
        this.data.payments.unshift(payment);
        this.saveData();
        return payment;
    }
    updatePayment(id, updates) {
        const idx = this.data.payments.findIndex((p) => p.id === id);
        if (idx === -1)
            return null;
        this.data.payments[idx] = {
            ...this.data.payments[idx],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        this.saveData();
        return this.data.payments[idx];
    }
    deletePayment(id) {
        const initLen = this.data.payments.length;
        this.data.payments = this.data.payments.filter((p) => p.id !== id);
        if (this.data.payments.length !== initLen) {
            this.saveData();
            return true;
        }
        return false;
    }
    // --- DOCUMENTS ---
    getDocuments() {
        return this.data.documents;
    }
    addDocument(doc) {
        this.data.documents.unshift(doc);
        this.saveData();
        return doc;
    }
    deleteDocument(id) {
        const initLen = this.data.documents.length;
        this.data.documents = this.data.documents.filter((d) => d.id !== id);
        if (this.data.documents.length !== initLen) {
            this.saveData();
            return true;
        }
        return false;
    }
    // --- NOTIFICATIONS ---
    getNotifications() {
        return this.data.notifications;
    }
    markNotificationRead(id) {
        const notif = this.data.notifications.find((n) => n.id === id);
        if (notif) {
            notif.read = true;
            this.saveData();
            return true;
        }
        return false;
    }
    markAllNotificationsRead() {
        this.data.notifications.forEach((n) => (n.read = true));
        this.saveData();
    }
    // --- TEAM ---
    getTeamMembers() {
        return this.data.teamMembers;
    }
    // --- SETTINGS ---
    getSettings() {
        return this.data.settings;
    }
    updateSettings(updates) {
        this.data.settings = {
            ...this.data.settings,
            ...updates,
            updatedAt: new Date().toISOString()
        };
        this.saveData();
        return this.data.settings;
    }
    // --- EXPORT / IMPORT ALL ---
    getAllData() {
        return this.data;
    }
    importAllData(imported) {
        if (!imported.projects || !imported.clients)
            return false;
        this.data = imported;
        this.recalculateAll();
        return true;
    }
}
exports.DataStore = DataStore;
exports.store = new DataStore();
