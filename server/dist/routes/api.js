"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const uuid_1 = require("uuid");
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const store_1 = require("../db/store");
const router = (0, express_1.Router)();
// Configure multer for file uploads
const uploadsDir = path_1.default.resolve(__dirname, '../../uploads');
if (!fs_1.default.existsSync(uploadsDir)) {
    fs_1.default.mkdirSync(uploadsDir, { recursive: true });
}
const storage = multer_1.default.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const ext = path_1.default.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 25 * 1024 * 1024 } // 25 MB max
});
// --- HEALTH ---
router.get('/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});
// --- DASHBOARD STATS ---
router.get('/dashboard/stats', (req, res) => {
    const projects = store_1.store.getProjects();
    const expenses = store_1.store.getExpenses();
    const tools = store_1.store.getTools();
    const team = store_1.store.getTeamMembers();
    const notifications = store_1.store.getNotifications();
    const totalProjects = projects.length;
    const activeProjects = projects.filter((p) => ['In Progress', 'Client Review', 'Planning', 'Lead'].includes(p.status)).length;
    const completedProjects = projects.filter((p) => ['Completed', 'Maintenance'].includes(p.status)).length;
    const totalRevenue = projects.reduce((sum, p) => sum + (Number(p.financials.totalReceived) || 0), 0);
    const totalProjectExpenses = projects.reduce((sum, p) => sum + (Number(p.financials.totalExpenses) || 0), 0);
    const totalGeneralExpenses = expenses
        .filter((e) => !e.projectId)
        .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const totalExpenses = totalProjectExpenses + totalGeneralExpenses;
    // Net Profit formula: Total Received - Total Expenses
    const netProfit = totalRevenue - totalExpenses;
    const suvedaShare = projects.reduce((sum, p) => sum + (Number(p.financials.profitSplit?.suvedaAmount) || 0), 0);
    const srimunShare = projects.reduce((sum, p) => sum + (Number(p.financials.profitSplit?.srimunAmount) || 0), 0);
    const pendingPayments = projects.reduce((sum, p) => sum + (Number(p.financials.outstandingAmount) || 0), 0);
    // Expense breakdown by category
    const expenseCategoriesMap = {};
    expenses.forEach((e) => {
        expenseCategoriesMap[e.category] = (expenseCategoriesMap[e.category] || 0) + (Number(e.amount) || 0);
    });
    const expenseBreakdown = Object.entries(expenseCategoriesMap).map(([category, amount]) => ({
        category,
        amount
    }));
    // Tool subscription monthly and yearly totals
    const monthlyToolCost = tools
        .filter((t) => t.status === 'Active')
        .reduce((sum, t) => sum + (t.billing === 'Monthly' ? t.cost : Math.round(t.cost / 12)), 0);
    const yearlyToolCost = monthlyToolCost * 12;
    // Monthly trends (Revenue vs Expenses vs Profit)
    const monthlyTrends = [
        { month: 'Jun 2026', revenue: 10000, expenses: 2500, profit: 7500 },
        { month: 'Jul 2026', revenue: 20000, expenses: 1500, profit: 18500 },
        { month: 'Aug 2026', revenue: 14000, expenses: 2450, profit: 11550 },
        { month: 'Sep 2026', revenue: 2000, expenses: 1000, profit: 1000 }
    ];
    res.json({
        kpis: {
            totalProjects,
            activeProjects,
            completedProjects,
            totalRevenue,
            totalExpenses,
            netProfit,
            pendingPayments,
            monthlyToolCost,
            yearlyToolCost,
            suvedaShare,
            srimunShare
        },
        monthlyTrends,
        expenseBreakdown,
        recentProjects: projects.slice(0, 5),
        recentExpenses: expenses.slice(0, 5),
        unreadNotifications: notifications.filter((n) => !n.read)
    });
});
// --- PROJECTS ---
router.get('/projects', (req, res) => {
    const { search, status, client, sort } = req.query;
    let list = [...store_1.store.getProjects()];
    if (search && typeof search === 'string') {
        const q = search.toLowerCase();
        list = list.filter((p) => p.name.toLowerCase().includes(q) ||
            p.client.toLowerCase().includes(q) ||
            p.type.toLowerCase().includes(q) ||
            p.description.toLowerCase().includes(q));
    }
    if (status && typeof status === 'string' && status !== 'all') {
        list = list.filter((p) => p.status.toLowerCase() === status.toLowerCase());
    }
    if (client && typeof client === 'string' && client !== 'all') {
        list = list.filter((p) => p.client.toLowerCase() === client.toLowerCase());
    }
    if (sort === 'value-desc') {
        list.sort((a, b) => b.financials.projectValue - a.financials.projectValue);
    }
    else if (sort === 'value-asc') {
        list.sort((a, b) => a.financials.projectValue - b.financials.projectValue);
    }
    else if (sort === 'date-asc') {
        list.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    }
    else {
        // default date-desc
        list.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
    }
    res.json(list);
});
router.get('/projects/:id', (req, res) => {
    const project = store_1.store.getProjectById(req.params.id);
    if (!project)
        return res.status(404).json({ error: 'Project not found' });
    res.json(project);
});
router.post('/projects', (req, res) => {
    const body = req.body;
    const now = new Date().toISOString();
    const projectValue = Number(body.financials?.projectValue) || 0;
    const advanceExpected = Number(body.financials?.advanceExpected) || 0;
    const advanceReceived = Number(body.financials?.advanceReceived) || 0;
    const finalPaymentExpected = Number(body.financials?.finalPaymentExpected) || 0;
    const finalPaymentReceived = Number(body.financials?.finalPaymentReceived) || 0;
    const totalReceived = advanceReceived + finalPaymentReceived;
    const outstandingAmount = Math.max(0, projectValue - totalReceived);
    const totalExpenses = Number(body.financials?.totalExpenses) || 0;
    const netProfit = totalReceived - totalExpenses;
    const suvedaPct = body.financials?.profitSplit?.suvedaPercent ?? 50;
    const srimunPct = body.financials?.profitSplit?.srimunPercent ?? 50;
    const newProject = {
        id: 'proj-' + (0, uuid_1.v4)().slice(0, 8),
        name: body.name || 'Untitled Project',
        type: body.type || 'Full Stack Website',
        client: body.client || 'Direct Client',
        clientId: body.clientId,
        teamMembers: body.teamMembers && body.teamMembers.length > 0 ? body.teamMembers : ['Suveda', 'Srimun'],
        startDate: body.startDate || now.split('T')[0],
        expectedCompletionDate: body.expectedCompletionDate,
        actualCompletionDate: body.actualCompletionDate,
        status: body.status || 'Planning',
        description: body.description || '',
        links: {
            githubRepo: body.links?.githubRepo || '',
            githubBranch: body.links?.githubBranch || 'main',
            figmaDesign: body.links?.figmaDesign || '',
            liveWebsite: body.links?.liveWebsite || '',
            googleDrive: body.links?.googleDrive || '',
            deploymentUrl: body.links?.deploymentUrl || '',
            otherLinks: body.links?.otherLinks || ''
        },
        designAndDev: {
            hasFigma: Boolean(body.designAndDev?.hasFigma),
            figmaUrl: body.designAndDev?.figmaUrl || '',
            technologies: body.designAndDev?.technologies || ['React', 'Next.js', 'Tailwind CSS']
        },
        financials: {
            projectValue,
            advanceExpected,
            advanceReceived,
            finalPaymentExpected,
            finalPaymentReceived,
            totalReceived,
            outstandingAmount,
            totalExpenses,
            netProfit,
            profitSplit: {
                suvedaPercent: suvedaPct,
                srimunPercent: srimunPct,
                suvedaAmount: Math.round((netProfit * suvedaPct) / 100),
                srimunAmount: Math.round((netProfit * srimunPct) / 100)
            }
        },
        timeline: body.timeline || [
            { id: 't-' + (0, uuid_1.v4)().slice(0, 6), stage: 'Project Created', completed: true, completedDate: now.split('T')[0], updatedBy: 'Suveda' },
            { id: 't-' + (0, uuid_1.v4)().slice(0, 6), stage: 'Development Started', completed: false },
            { id: 't-' + (0, uuid_1.v4)().slice(0, 6), stage: 'Client Review', completed: false },
            { id: 't-' + (0, uuid_1.v4)().slice(0, 6), stage: 'Final Changes', completed: false },
            { id: 't-' + (0, uuid_1.v4)().slice(0, 6), stage: 'Completed', completed: false },
            { id: 't-' + (0, uuid_1.v4)().slice(0, 6), stage: 'Delivered', completed: false }
        ],
        updates: [
            {
                id: 'upd-' + (0, uuid_1.v4)().slice(0, 6),
                date: now.split('T')[0],
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                title: 'Project created & scope defined',
                description: `Project initialized by ${body.author || 'Suveda'}. Initial scope: ${body.name}`,
                author: body.author || 'Suveda'
            }
        ],
        repositories: body.links?.githubRepo
            ? [
                {
                    id: 'repo-' + (0, uuid_1.v4)().slice(0, 6),
                    name: body.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
                    githubUrl: body.links.githubRepo,
                    owner: 'Srimunn',
                    branch: body.links?.githubBranch || 'main',
                    framework: body.designAndDev?.technologies?.[0] || 'Next.js',
                    lastUpdated: now.split('T')[0],
                    status: 'Active'
                }
            ]
            : [],
        liveWebsite: {
            liveUrl: body.links?.liveWebsite || '',
            adminUrl: body.links?.deploymentUrl || '',
            platform: 'Vercel',
            hosting: 'Vercel / Cloudflare',
            domain: body.links?.liveWebsite ? body.links.liveWebsite.replace(/https?:\/\//, '').replace(/\/.*$/, '') : '',
            sslStatus: body.links?.liveWebsite ? 'Valid' : 'Pending',
            status: body.links?.liveWebsite ? 'Live' : 'Not Deployed'
        },
        tasks: [],
        notes: [],
        maintenance: {
            status: 'Inactive',
            startDate: '',
            endDate: ''
        },
        createdAt: now,
        updatedAt: now
    };
    const created = store_1.store.addProject(newProject);
    res.status(201).json(created);
});
router.put('/projects/:id', (req, res) => {
    const updated = store_1.store.updateProject(req.params.id, req.body);
    if (!updated)
        return res.status(404).json({ error: 'Project not found' });
    res.json(updated);
});
router.delete('/projects/:id', (req, res) => {
    const ok = store_1.store.deleteProject(req.params.id);
    if (!ok)
        return res.status(404).json({ error: 'Project not found' });
    res.json({ message: 'Project deleted successfully' });
});
// Add project update / version history entry
router.post('/projects/:id/updates', (req, res) => {
    const project = store_1.store.getProjectById(req.params.id);
    if (!project)
        return res.status(404).json({ error: 'Project not found' });
    const { title, description, author } = req.body;
    const newUpdate = {
        id: 'upd-' + (0, uuid_1.v4)().slice(0, 6),
        date: new Date().toISOString().split('T')[0],
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        title: title || 'Project Update',
        description: description || '',
        author: author || 'Suveda'
    };
    const updates = [newUpdate, ...(project.updates || [])];
    const updated = store_1.store.updateProject(req.params.id, { updates });
    res.status(201).json(updated);
});
// Add project note
router.post('/projects/:id/notes', (req, res) => {
    const project = store_1.store.getProjectById(req.params.id);
    if (!project)
        return res.status(404).json({ error: 'Project not found' });
    const { title, content, author, category } = req.body;
    const newNote = {
        id: 'note-' + (0, uuid_1.v4)().slice(0, 6),
        date: new Date().toISOString().split('T')[0],
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        title: title || 'Note',
        content: content || '',
        author: author || 'Suveda',
        category: category || 'Meeting'
    };
    const notes = [newNote, ...(project.notes || [])];
    const updated = store_1.store.updateProject(req.params.id, { notes });
    res.status(201).json(updated);
});
// Add project task
router.post('/projects/:id/tasks', (req, res) => {
    const project = store_1.store.getProjectById(req.params.id);
    if (!project)
        return res.status(404).json({ error: 'Project not found' });
    const { title, assignee, dueDate } = req.body;
    const newTask = {
        id: 'task-' + (0, uuid_1.v4)().slice(0, 6),
        title: title || 'New Task',
        status: 'Todo',
        assignee: assignee || 'Both',
        dueDate: dueDate || ''
    };
    const tasks = [...(project.tasks || []), newTask];
    const updated = store_1.store.updateProject(req.params.id, { tasks });
    res.status(201).json(updated);
});
// Toggle task status
router.put('/projects/:id/tasks/:taskId', (req, res) => {
    const project = store_1.store.getProjectById(req.params.id);
    if (!project)
        return res.status(404).json({ error: 'Project not found' });
    const tasks = (project.tasks || []).map((t) => {
        if (t.id === req.params.taskId) {
            return { ...t, ...req.body };
        }
        return t;
    });
    const updated = store_1.store.updateProject(req.params.id, { tasks });
    res.json(updated);
});
// Add repository to project
router.post('/projects/:id/repositories', (req, res) => {
    const project = store_1.store.getProjectById(req.params.id);
    if (!project)
        return res.status(404).json({ error: 'Project not found' });
    const { name, githubUrl, owner, branch, framework, status } = req.body;
    const newRepo = {
        id: 'repo-' + (0, uuid_1.v4)().slice(0, 6),
        name: name || project.name,
        githubUrl: githubUrl || '',
        owner: owner || 'Srimunn',
        branch: branch || 'main',
        framework: framework || 'Next.js',
        lastUpdated: new Date().toISOString().split('T')[0],
        status: status || 'Active'
    };
    const repositories = [...(project.repositories || []), newRepo];
    const updated = store_1.store.updateProject(req.params.id, { repositories });
    res.status(201).json(updated);
});
// Update timeline stage
router.put('/projects/:id/timeline/:timelineId', (req, res) => {
    const project = store_1.store.getProjectById(req.params.id);
    if (!project)
        return res.status(404).json({ error: 'Project not found' });
    const timeline = (project.timeline || []).map((t) => {
        if (t.id === req.params.timelineId) {
            return {
                ...t,
                ...req.body,
                completedDate: req.body.completed ? (req.body.completedDate || new Date().toISOString().split('T')[0]) : undefined
            };
        }
        return t;
    });
    const updated = store_1.store.updateProject(req.params.id, { timeline });
    res.json(updated);
});
// --- CLIENTS ---
router.get('/clients', (req, res) => {
    res.json(store_1.store.getClients());
});
router.get('/clients/:id', (req, res) => {
    const client = store_1.store.getClientById(req.params.id);
    if (!client)
        return res.status(404).json({ error: 'Client not found' });
    res.json(client);
});
router.post('/clients', (req, res) => {
    const now = new Date().toISOString();
    const body = req.body;
    const newClient = {
        id: 'client-' + (0, uuid_1.v4)().slice(0, 8),
        name: body.name || 'New Client',
        companyName: body.companyName || '',
        phone: body.phone || '',
        email: body.email || '',
        whatsapp: body.whatsapp || body.phone || '',
        address: body.address || '',
        projects: [],
        totalRevenue: 0,
        pendingAmount: 0,
        notes: body.notes || '',
        communicationHistory: [],
        createdAt: now,
        updatedAt: now
    };
    const created = store_1.store.addClient(newClient);
    res.status(201).json(created);
});
router.put('/clients/:id', (req, res) => {
    const updated = store_1.store.updateClient(req.params.id, req.body);
    if (!updated)
        return res.status(404).json({ error: 'Client not found' });
    res.json(updated);
});
router.delete('/clients/:id', (req, res) => {
    const ok = store_1.store.deleteClient(req.params.id);
    if (!ok)
        return res.status(404).json({ error: 'Client not found' });
    res.json({ message: 'Client deleted' });
});
// --- EXPENSES ---
router.get('/expenses', (req, res) => {
    const { category, paidBy } = req.query;
    let list = [...store_1.store.getExpenses()];
    if (category && typeof category === 'string' && category !== 'all') {
        list = list.filter((e) => e.category.toLowerCase() === category.toLowerCase());
    }
    if (paidBy && typeof paidBy === 'string' && paidBy !== 'all') {
        list = list.filter((e) => e.paidBy.toLowerCase() === paidBy.toLowerCase());
    }
    res.json(list);
});
router.post('/expenses', (req, res) => {
    const now = new Date().toISOString();
    const body = req.body;
    const newExp = {
        id: 'exp-' + (0, uuid_1.v4)().slice(0, 8),
        name: body.name || 'Expense',
        category: body.category || 'Other',
        amount: Number(body.amount) || 0,
        date: body.date || now.split('T')[0],
        projectId: body.projectId,
        projectName: body.projectName,
        paidBy: body.paidBy || 'Suveda',
        paymentMethod: body.paymentMethod || 'UPI',
        recurring: Boolean(body.recurring),
        frequency: body.frequency || 'One-Time',
        notes: body.notes || '',
        receipt: body.receipt || '',
        createdAt: now,
        updatedAt: now
    };
    const created = store_1.store.addExpense(newExp);
    res.status(201).json(created);
});
router.put('/expenses/:id', (req, res) => {
    const updated = store_1.store.updateExpense(req.params.id, req.body);
    if (!updated)
        return res.status(404).json({ error: 'Expense not found' });
    res.json(updated);
});
router.delete('/expenses/:id', (req, res) => {
    const ok = store_1.store.deleteExpense(req.params.id);
    if (!ok)
        return res.status(404).json({ error: 'Expense not found' });
    res.json({ message: 'Expense deleted' });
});
// --- TOOLS & SUBSCRIPTIONS ---
router.get('/tools', (req, res) => {
    res.json(store_1.store.getTools());
});
router.post('/tools', (req, res) => {
    const now = new Date().toISOString();
    const body = req.body;
    const newTool = {
        id: 'tool-' + (0, uuid_1.v4)().slice(0, 8),
        name: body.name || 'New Tool',
        category: body.category || 'AI Tools',
        plan: body.plan || 'Pro',
        billing: body.billing || 'Monthly',
        cost: Number(body.cost) || 0,
        purchaseDate: body.purchaseDate || now.split('T')[0],
        renewalDate: body.renewalDate || now.split('T')[0],
        usedBy: body.usedBy || 'Both',
        paymentMethod: body.paymentMethod || 'Credit Card',
        status: body.status || 'Active',
        notes: body.notes || '',
        websiteUrl: body.websiteUrl || '',
        createdAt: now,
        updatedAt: now
    };
    const created = store_1.store.addTool(newTool);
    res.status(201).json(created);
});
router.put('/tools/:id', (req, res) => {
    const updated = store_1.store.updateTool(req.params.id, req.body);
    if (!updated)
        return res.status(404).json({ error: 'Tool not found' });
    res.json(updated);
});
router.delete('/tools/:id', (req, res) => {
    const ok = store_1.store.deleteTool(req.params.id);
    if (!ok)
        return res.status(404).json({ error: 'Tool not found' });
    res.json({ message: 'Tool deleted' });
});
// --- FINANCES & TRANSACTIONS ---
router.get('/finances/overview', (req, res) => {
    const projects = store_1.store.getProjects();
    const expenses = store_1.store.getExpenses();
    const payments = store_1.store.getPayments();
    const totalRevenue = projects.reduce((sum, p) => sum + (Number(p.financials.totalReceived) || 0), 0);
    const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
    const netProfit = totalRevenue - totalExpenses;
    const pendingAmount = projects.reduce((sum, p) => sum + (Number(p.financials.outstandingAmount) || 0), 0);
    res.json({
        totalRevenue,
        totalExpenses,
        netProfit,
        pendingAmount,
        suvedaShare: projects.reduce((sum, p) => sum + (Number(p.financials.profitSplit.suvedaAmount) || 0), 0),
        srimunShare: projects.reduce((sum, p) => sum + (Number(p.financials.profitSplit.srimunAmount) || 0), 0),
        transactions: payments
    });
});
router.get('/finances/transactions', (req, res) => {
    res.json(store_1.store.getPayments());
});
router.post('/finances/transactions', (req, res) => {
    const now = new Date().toISOString();
    const body = req.body;
    const newTx = {
        id: 'pay-' + (0, uuid_1.v4)().slice(0, 8),
        projectId: body.projectId,
        projectName: body.projectName,
        clientId: body.clientId,
        clientName: body.clientName,
        type: body.type || 'Income',
        description: body.description || '',
        amount: Number(body.amount) || 0,
        date: body.date || now.split('T')[0],
        paymentMethod: body.paymentMethod || 'UPI',
        reference: body.reference || '',
        status: body.status || 'Paid',
        notes: body.notes || '',
        createdAt: now,
        updatedAt: now
    };
    const created = store_1.store.addPayment(newTx);
    res.status(201).json(created);
});
// --- TEAM ---
router.get('/team', (req, res) => {
    res.json(store_1.store.getTeamMembers());
});
// --- DOCUMENTS ---
router.get('/documents', (req, res) => {
    res.json(store_1.store.getDocuments());
});
router.post('/documents', upload.single('file'), (req, res) => {
    const now = new Date().toISOString();
    const file = req.file;
    const body = req.body;
    const newDoc = {
        id: 'doc-' + (0, uuid_1.v4)().slice(0, 8),
        name: body.name || (file ? file.originalname : 'Document.pdf'),
        type: body.type || 'Other Documents',
        fileUrl: file ? `/uploads/${file.filename}` : '/uploads/sample.pdf',
        fileSize: file ? `${Math.round(file.size / 1024)} KB` : '250 KB',
        uploadedDate: now.split('T')[0],
        projectId: body.projectId,
        projectName: body.projectName,
        uploadedBy: body.uploadedBy || 'Suveda',
        createdAt: now,
        updatedAt: now
    };
    const created = store_1.store.addDocument(newDoc);
    res.status(201).json(created);
});
router.delete('/documents/:id', (req, res) => {
    const ok = store_1.store.deleteDocument(req.params.id);
    if (!ok)
        return res.status(404).json({ error: 'Document not found' });
    res.json({ message: 'Document deleted' });
});
// --- NOTIFICATIONS ---
router.get('/notifications', (req, res) => {
    res.json(store_1.store.getNotifications());
});
router.put('/notifications/:id/read', (req, res) => {
    store_1.store.markNotificationRead(req.params.id);
    res.json({ message: 'Notification marked as read' });
});
router.put('/notifications/read-all', (req, res) => {
    store_1.store.markAllNotificationsRead();
    res.json({ message: 'All notifications marked as read' });
});
// --- SETTINGS ---
router.get('/settings', (req, res) => {
    res.json(store_1.store.getSettings());
});
router.put('/settings', (req, res) => {
    const updated = store_1.store.updateSettings(req.body);
    res.json(updated);
});
// --- GLOBAL SEARCH ---
router.get('/search', (req, res) => {
    const q = (req.query.q || '').toLowerCase().trim();
    if (!q) {
        return res.json({
            projects: [],
            clients: [],
            repositories: [],
            websites: [],
            expenses: [],
            tools: [],
            documents: []
        });
    }
    const projects = store_1.store.getProjects();
    const clients = store_1.store.getClients();
    const expenses = store_1.store.getExpenses();
    const tools = store_1.store.getTools();
    const documents = store_1.store.getDocuments();
    const matchedProjects = projects.filter((p) => p.name.toLowerCase().includes(q) ||
        p.client.toLowerCase().includes(q) ||
        p.type.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.designAndDev.technologies.some((t) => t.toLowerCase().includes(q)));
    const matchedClients = clients.filter((c) => c.name.toLowerCase().includes(q) ||
        c.companyName.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.includes(q));
    const matchedRepos = [];
    projects.forEach((p) => {
        p.repositories?.forEach((r) => {
            if (r.name.toLowerCase().includes(q) || r.githubUrl.toLowerCase().includes(q) || r.branch.toLowerCase().includes(q)) {
                matchedRepos.push({ ...r, projectId: p.id, projectName: p.name });
            }
        });
    });
    const matchedWebsites = [];
    projects.forEach((p) => {
        if (p.liveWebsite?.liveUrl?.toLowerCase().includes(q) ||
            p.liveWebsite?.domain?.toLowerCase().includes(q) ||
            p.liveWebsite?.platform?.toLowerCase().includes(q)) {
            matchedWebsites.push({ ...p.liveWebsite, projectId: p.id, projectName: p.name });
        }
    });
    const matchedExpenses = expenses.filter((e) => e.name.toLowerCase().includes(q) ||
        e.category.toLowerCase().includes(q) ||
        (e.projectName && e.projectName.toLowerCase().includes(q)));
    const matchedTools = tools.filter((t) => t.name.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        t.plan.toLowerCase().includes(q));
    const matchedDocuments = documents.filter((d) => d.name.toLowerCase().includes(q) ||
        d.type.toLowerCase().includes(q) ||
        (d.projectName && d.projectName.toLowerCase().includes(q)));
    res.json({
        projects: matchedProjects,
        clients: matchedClients,
        repositories: matchedRepos,
        websites: matchedWebsites,
        expenses: matchedExpenses,
        tools: matchedTools,
        documents: matchedDocuments
    });
});
// --- EXPORT & BACKUP ---
router.get('/export/json', (req, res) => {
    const data = store_1.store.getAllData();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=freelance-management-backup-${new Date().toISOString().split('T')[0]}.json`);
    res.send(JSON.stringify(data, null, 2));
});
router.post('/export/import', (req, res) => {
    const ok = store_1.store.importAllData(req.body);
    if (!ok)
        return res.status(400).json({ error: 'Invalid backup JSON file structure' });
    res.json({ message: 'Data imported successfully' });
});
// CSV Exports
router.get('/export/csv/:type', (req, res) => {
    const { type } = req.params;
    if (type === 'projects') {
        const projects = store_1.store.getProjects();
        let csv = 'Project ID,Project Name,Client,Type,Status,Start Date,Completion Date,Project Value,Total Received,Pending,Expenses,Net Profit,Suveda Share,Srimun Share,GitHub,Live Website\n';
        projects.forEach((p) => {
            csv += `"${p.id}","${p.name}","${p.client}","${p.type}","${p.status}","${p.startDate}","${p.actualCompletionDate || p.expectedCompletionDate || ''}",${p.financials.projectValue},${p.financials.totalReceived},${p.financials.outstandingAmount},${p.financials.totalExpenses},${p.financials.netProfit},${p.financials.profitSplit.suvedaAmount},${p.financials.profitSplit.srimunAmount},"${p.links.githubRepo || ''}","${p.links.liveWebsite || ''}"\n`;
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=projects-${Date.now()}.csv`);
        return res.send(csv);
    }
    if (type === 'expenses') {
        const expenses = store_1.store.getExpenses();
        let csv = 'Expense ID,Name,Category,Amount,Date,Project,Paid By,Payment Method,Recurring,Notes\n';
        expenses.forEach((e) => {
            csv += `"${e.id}","${e.name}","${e.category}",${e.amount},"${e.date}","${e.projectName || ''}","${e.paidBy}","${e.paymentMethod}","${e.recurring ? 'Yes' : 'No'}","${e.notes || ''}"\n`;
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=expenses-${Date.now()}.csv`);
        return res.send(csv);
    }
    if (type === 'clients') {
        const clients = store_1.store.getClients();
        let csv = 'Client ID,Name,Company,Phone,Email,WhatsApp,Total Revenue,Pending Amount,Projects\n';
        clients.forEach((c) => {
            csv += `"${c.id}","${c.name}","${c.companyName}","${c.phone}","${c.email}","${c.whatsapp}",${c.totalRevenue},${c.pendingAmount},"${c.projects.join('; ')}"\n`;
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=clients-${Date.now()}.csv`);
        return res.send(csv);
    }
    if (type === 'finances') {
        const payments = store_1.store.getPayments();
        let csv = 'Transaction ID,Date,Project,Client,Type,Amount,Payment Method,Status,Reference,Notes\n';
        payments.forEach((p) => {
            csv += `"${p.id}","${p.date}","${p.projectName || ''}","${p.clientName || ''}","${p.type}",${p.amount},"${p.paymentMethod}","${p.status}","${p.reference || ''}","${p.notes || ''}"\n`;
        });
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=finance-ledger-${Date.now()}.csv`);
        return res.send(csv);
    }
    res.status(400).json({ error: 'Invalid export type. Supported: projects, expenses, clients, finances' });
});
exports.default = router;
