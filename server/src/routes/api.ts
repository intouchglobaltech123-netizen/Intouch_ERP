import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { store } from '../db/store';
import { Project, Client, Expense, ToolSubscription, PaymentTransaction, DocumentItem } from '../types';

const router = Router();

// Configure multer for file uploads
const uploadsDir = path.resolve(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25 MB max
});

// --- HEALTH ---
router.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', app: 'Intouch', time: new Date().toISOString() });
});

// --- AUTHENTICATION (Intouch) ---
// Admin password and token secret come from the environment (server/.env).
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const JWT_SECRET = process.env.JWT_SECRET;
if (!ADMIN_PASSWORD || !JWT_SECRET) {
  console.warn('[Auth] ADMIN_PASSWORD and JWT_SECRET must be set in server/.env. Login is disabled until they are.');
}

router.post('/auth/login', (req: Request, res: Response) => {
  const { password } = req.body;

  if (!ADMIN_PASSWORD || !JWT_SECRET) {
    return res.status(503).json({ error: 'Login is not configured on the server.' });
  }

  if (typeof password !== 'string' || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid password.' });
  }

  const token = jwt.sign({ role: 'Admin' }, JWT_SECRET, { expiresIn: '12h' });

  res.json({
    token,
    user: {
      name: 'Admin',
      role: 'Admin',
      email: 'admin@intouch.internal'
    }
  });
});

// Every route registered after this point requires a valid Bearer token.
router.use((req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!JWT_SECRET || !authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  try {
    jwt.verify(authHeader.slice('Bearer '.length), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Not authenticated' });
  }
});

router.get('/auth/me', (req: Request, res: Response) => {
  res.json({ authenticated: true, app: 'Intouch' });
});

// --- DASHBOARD STATS ---
router.get('/dashboard/stats', (req: Request, res: Response) => {
  const projects = store.getProjects();
  const expenses = store.getExpenses();
  const tools = store.getTools();
  const team = store.getTeamMembers();
  const notifications = store.getNotifications();

  const totalProjects = projects.length;
  const activeProjects = projects.filter((p) =>
    ['In Progress', 'Client Review', 'Planning', 'Lead'].includes(p.status)
  ).length;
  const completedProjects = projects.filter((p) =>
    ['Completed', 'Maintenance'].includes(p.status)
  ).length;

  const totalRevenue = projects.reduce((sum, p) => sum + (Number(p.financials.totalReceived) || 0), 0);
  const totalProjectExpenses = projects.reduce((sum, p) => sum + (Number(p.financials.totalExpenses) || 0), 0);
  const totalGeneralExpenses = expenses
    .filter((e) => !e.projectId && e.deductFromProfit !== false)
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const totalExpenses = totalProjectExpenses + totalGeneralExpenses;

  // Net Profit formula: Total Received - Total Deductible Expenses
  const netProfit = totalRevenue - totalExpenses;

  const suvedaShare = projects.reduce((sum, p) => sum + (Number(p.financials.profitSplit?.suvedaAmount) || 0), 0);
  const srimunShare = projects.reduce((sum, p) => sum + (Number(p.financials.profitSplit?.srimunAmount) || 0), 0);

  const pendingPayments = projects.reduce((sum, p) => sum + (Number(p.financials.outstandingAmount) || 0), 0);

  // Expense breakdown by category
  const expenseCategoriesMap: Record<string, number> = {};
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

  // Monthly trends (Revenue vs Expenses vs Profit) - dynamically aggregated from real data
  const monthsMap: Record<string, { revenue: number; expenses: number; profit: number }> = {};
  projects.forEach((p) => {
    (p.milestones || []).forEach((m) => {
      if (m.completed && m.paidDate && m.amount) {
        const d = new Date(m.paidDate);
        const monthKey = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
        if (!monthsMap[monthKey]) monthsMap[monthKey] = { revenue: 0, expenses: 0, profit: 0 };
        monthsMap[monthKey].revenue += Number(m.amount) || 0;
      }
    });
  });
  expenses.forEach((e) => {
    if (e.date && e.amount) {
      const d = new Date(e.date);
      const monthKey = d.toLocaleString('en-US', { month: 'short', year: 'numeric' });
      if (!monthsMap[monthKey]) monthsMap[monthKey] = { revenue: 0, expenses: 0, profit: 0 };
      monthsMap[monthKey].expenses += Number(e.amount) || 0;
    }
  });
  const monthlyTrends = Object.entries(monthsMap).map(([month, val]) => ({
    month,
    revenue: val.revenue,
    expenses: val.expenses,
    profit: val.revenue - val.expenses
  }));

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
    unreadNotifications: notifications.filter((n) => !n.read),
    partnerPayoutsSummary: store.getPartnerPayoutsSummary(),
    activeLeadsCount: store.getLeads().filter((l) => !['Won', 'Lost'].includes(l.status)).length
  });
});

// --- PROJECTS ---
router.get('/projects', (req: Request, res: Response) => {
  const { search, status, client, sort } = req.query;
  let list = [...store.getProjects()];

  if (search && typeof search === 'string') {
    const q = search.toLowerCase();
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.client.toLowerCase().includes(q) ||
        p.type.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q)
    );
  }

  if (status && typeof status === 'string' && status !== 'all') {
    list = list.filter((p) => p.status.toLowerCase() === status.toLowerCase());
  }

  if (client && typeof client === 'string' && client !== 'all') {
    list = list.filter((p) => p.client.toLowerCase() === client.toLowerCase());
  }

  if (sort === 'value-desc') {
    list.sort((a, b) => b.financials.projectValue - a.financials.projectValue);
  } else if (sort === 'value-asc') {
    list.sort((a, b) => a.financials.projectValue - b.financials.projectValue);
  } else if (sort === 'date-asc') {
    list.sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
  } else {
    // default date-desc
    list.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  }

  res.json(list);
});

router.get('/projects/:id', (req: Request, res: Response) => {
  const project = store.getProjectById(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });
  res.json(project);
});

router.post('/projects', (req: Request, res: Response) => {
  const body = req.body;
  const now = new Date().toISOString();

  const domainCost = Number(body.financials?.domainCost ?? body.liveWebsite?.domainCost ?? body.domainCost) || 0;
  const domainClientExtra = Number(body.financials?.domainClientExtra ?? body.liveWebsite?.domainClientExtra ?? body.domainClientExtra) || 0;
  const domainClientPaidStatus = (body.financials?.domainClientPaidStatus ?? body.liveWebsite?.domainClientPaidStatus ?? body.domainClientPaidStatus) || (domainClientExtra > 0 ? 'Received' : 'Pending');
  const domainClientReceived = domainClientPaidStatus === 'Received'
    ? domainClientExtra
    : (Number(body.financials?.domainClientReceived ?? body.liveWebsite?.domainClientReceived ?? body.domainClientReceived) || 0);

  const otherExpenses = Number(body.financials?.otherExpenses) || 0;
  const projectValue = Number(body.financials?.projectValue) || 0;
  const totalProjectBilling = projectValue + domainClientExtra;
  const advanceExpected = Number(body.financials?.advanceExpected) || 0;
  const advanceReceived = Number(body.financials?.advanceReceived) || 0;
  const finalPaymentExpected = Number(body.financials?.finalPaymentExpected) || 0;
  const finalPaymentReceived = Number(body.financials?.finalPaymentReceived) || 0;
  const totalReceived = advanceReceived + finalPaymentReceived + domainClientReceived;
  const outstandingAmount = Math.max(0, totalProjectBilling - totalReceived);
  const totalExpenses = Number(body.financials?.totalExpenses) || (domainCost + otherExpenses);
  const netProfit = totalReceived - totalExpenses;

  const suvedaPct = body.financials?.profitSplit?.suvedaPercent ?? 50;
  const srimunPct = body.financials?.profitSplit?.srimunPercent ?? 50;

  // --- Client Management: Associate or automatically create/update Client in database ---
  let finalClientId = body.clientId;
  let finalClientName = (body.client || '').trim();

  const clientInfo = body.clientDetails || {
    name: body.clientName || finalClientName,
    companyName: body.clientCompanyName || body.companyName || '',
    email: body.clientEmail || '',
    phone: body.clientPhone || '',
    whatsapp: body.clientWhatsapp || body.clientPhone || '',
    address: body.clientAddress || '',
    notes: body.clientNotes || ''
  };

  const candidateName = (clientInfo.name || finalClientName || '').trim();

  if (finalClientId && finalClientId !== 'new') {
    const existingClient = store.getClientById(finalClientId);
    if (existingClient) {
      finalClientName = existingClient.name;
      // Update contact details if provided
      store.updateClient(finalClientId, {
        companyName: clientInfo.companyName || existingClient.companyName,
        email: clientInfo.email || existingClient.email,
        phone: clientInfo.phone || existingClient.phone,
        whatsapp: clientInfo.whatsapp || existingClient.whatsapp,
        address: clientInfo.address || existingClient.address,
        notes: clientInfo.notes || existingClient.notes
      });
    }
  } else if (candidateName) {
    // Check if client with this name or email already exists
    const allClients = store.getClients();
    let matched = allClients.find((c) => c.name.toLowerCase() === candidateName.toLowerCase());
    if (!matched && clientInfo.email) {
      matched = allClients.find((c) => c.email && c.email.toLowerCase() === clientInfo.email.toLowerCase());
    }

    if (matched) {
      finalClientId = matched.id;
      finalClientName = matched.name;
      store.updateClient(matched.id, {
        companyName: clientInfo.companyName || matched.companyName,
        email: clientInfo.email || matched.email,
        phone: clientInfo.phone || matched.phone,
        whatsapp: clientInfo.whatsapp || matched.whatsapp,
        address: clientInfo.address || matched.address,
        notes: clientInfo.notes || matched.notes
      });
    } else {
      // Auto-create new Client in store
      const newClient: Client = {
        id: 'client-' + uuidv4().slice(0, 8),
        name: candidateName,
        companyName: clientInfo.companyName || '',
        phone: clientInfo.phone || '',
        email: clientInfo.email || '',
        whatsapp: clientInfo.whatsapp || clientInfo.phone || '',
        address: clientInfo.address || '',
        projects: [body.name || 'Untitled Project'],
        totalRevenue: 0,
        pendingAmount: 0,
        notes: clientInfo.notes || '',
        communicationHistory: [],
        createdAt: now,
        updatedAt: now
      };
      const createdClient = store.addClient(newClient);
      finalClientId = createdClient.id;
      finalClientName = createdClient.name;
    }
  }

  if (!finalClientName) {
    finalClientName = 'Direct Client';
  }

  const newProject: Project = {
    id: 'proj-' + uuidv4().slice(0, 8),
    name: body.name || 'Untitled Project',
    type: body.type || 'Full Stack Website',
    client: finalClientName,
    clientId: finalClientId,
    clientDetails: clientInfo,
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
      otherLinks: body.links?.otherLinks || '',
      ga4Link: body.links?.ga4Link || body.analytics?.ga4Link || body.ga4Link || '',
      blogUrl: body.links?.blogUrl || body.blogSchedule?.blogUrl || body.blogUrl || ''
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
      domainClientExtra,
      domainClientReceived,
      domainClientPaidStatus,
      domainCost,
      otherExpenses,
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
      { id: 't-' + uuidv4().slice(0, 6), stage: 'Project Created', completed: true, completedDate: now.split('T')[0], updatedBy: 'Suveda' },
      { id: 't-' + uuidv4().slice(0, 6), stage: 'Development Started', completed: false },
      { id: 't-' + uuidv4().slice(0, 6), stage: 'Client Review', completed: false },
      { id: 't-' + uuidv4().slice(0, 6), stage: 'Final Changes', completed: false },
      { id: 't-' + uuidv4().slice(0, 6), stage: 'Completed', completed: false },
      { id: 't-' + uuidv4().slice(0, 6), stage: 'Delivered', completed: false }
    ],
    updates: [
      {
        id: 'upd-' + uuidv4().slice(0, 6),
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
            id: 'repo-' + uuidv4().slice(0, 6),
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
      liveUrl: body.links?.liveWebsite || body.liveWebsite?.liveUrl || '',
      adminUrl: body.links?.deploymentUrl || body.liveWebsite?.adminUrl || '',
      platform: body.liveWebsite?.platform || 'Vercel',
      hosting: body.liveWebsite?.hosting || 'Vercel / Cloudflare',
      domain: body.liveWebsite?.domain || (body.links?.liveWebsite ? body.links.liveWebsite.replace(/https?:\/\//, '').replace(/\/.*$/, '') : ''),
      domainOwnership: body.liveWebsite?.domainOwnership || body.domainOwnership || 'Client Owned',
      domainRegistrar: body.liveWebsite?.domainRegistrar || body.domainRegistrar || '',
      domainRenewalDate: body.liveWebsite?.domainRenewalDate || '',
      domainCost,
      domainClientExtra,
      domainClientReceived,
      domainClientPaidStatus,
      domainPaidBy: body.liveWebsite?.domainPaidBy || (body.liveWebsite?.domainOwnership === 'Studio Needed' ? 'Studio' : 'Client'),
      sslStatus: (body.links?.liveWebsite || body.liveWebsite?.liveUrl) ? 'Valid' : 'Pending',
      status: (body.links?.liveWebsite || body.liveWebsite?.liveUrl) ? 'Live' : 'Not Deployed'
    },
    analytics: {
      ga4MeasurementId: body.analytics?.ga4MeasurementId || body.ga4MeasurementId || '',
      ga4Link: body.analytics?.ga4Link || body.links?.ga4Link || body.ga4Link || '',
      notes: body.analytics?.notes || ''
    },
    blogSchedule: {
      hasBlog: Boolean(body.blogSchedule?.hasBlog ?? body.hasBlog),
      postsPerWeek: Number(body.blogSchedule?.postsPerWeek ?? body.postsPerWeek) || 1,
      scheduleDays: body.blogSchedule?.scheduleDays || body.scheduleDays || ['Monday'],
      blogUrl: body.blogSchedule?.blogUrl || body.links?.blogUrl || body.blogUrl || '',
      notifyOnSchedule: body.blogSchedule?.notifyOnSchedule ?? body.notifyOnSchedule ?? true,
      lastPublishedDate: body.blogSchedule?.lastPublishedDate || '',
      notes: body.blogSchedule?.notes || ''
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

  const created = store.addProject(newProject);

  // If client paid extra money for domain upfront, log automatically into the finance / income payment ledger
  if (domainClientExtra > 0 && domainClientPaidStatus === 'Received') {
    const domainIncomeTx: PaymentTransaction = {
      id: 'pay-' + uuidv4().slice(0, 8),
      projectId: newProject.id,
      projectName: newProject.name,
      clientId: newProject.clientId,
      clientName: newProject.client,
      type: 'Income',
      description: `Client Extra Domain Payment: ${newProject.liveWebsite?.domain || newProject.name}`,
      amount: domainClientExtra,
      date: newProject.startDate || now.split('T')[0],
      paymentMethod: 'UPI',
      status: 'Paid',
      notes: `Extra domain fee received from client (separate from fixed price of ₹${projectValue})`,
      createdAt: now,
      updatedAt: now
    };
    store.addPayment(domainIncomeTx);
  }

  // If domain cost is specified and paid by studio, log automatically into the finance / expense ledger
  if (domainCost > 0 && (newProject.liveWebsite?.domainOwnership === 'Studio Needed' || newProject.liveWebsite?.domainPaidBy === 'Studio')) {
    const domainExp: Expense = {
      id: 'exp-' + uuidv4().slice(0, 8),
      name: `Domain Fee: ${newProject.liveWebsite?.domain || newProject.name}`,
      category: 'Domain',
      amount: domainCost,
      date: newProject.startDate || now.split('T')[0],
      projectId: newProject.id,
      projectName: newProject.name,
      paidBy: (body.author === 'Srimun' ? 'Srimun' : 'Suveda'),
      paymentMethod: 'UPI',
      recurring: false,
      frequency: 'One-Time',
      notes: `Domain fee for ${newProject.name} (Registrar: ${newProject.liveWebsite?.domainRegistrar || 'Registrar'})`,
      createdAt: now,
      updatedAt: now
    };
    store.addExpense(domainExp);
  }

  res.status(201).json(created);
});

router.put('/projects/:id', (req: Request, res: Response) => {
  const body = req.body;
  if (body.ga4MeasurementId || body.ga4Link) {
    body.analytics = {
      ...(body.analytics || {}),
      ...(body.ga4MeasurementId !== undefined ? { ga4MeasurementId: body.ga4MeasurementId } : {}),
      ...(body.ga4Link !== undefined ? { ga4Link: body.ga4Link } : {})
    };
  }
  if (body.hasBlog !== undefined || body.postsPerWeek !== undefined || body.scheduleDays !== undefined) {
    body.blogSchedule = {
      ...(body.blogSchedule || {}),
      ...(body.hasBlog !== undefined ? { hasBlog: Boolean(body.hasBlog) } : {}),
      ...(body.postsPerWeek !== undefined ? { postsPerWeek: Number(body.postsPerWeek) } : {}),
      ...(body.scheduleDays !== undefined ? { scheduleDays: body.scheduleDays } : {}),
      ...(body.blogUrl !== undefined ? { blogUrl: body.blogUrl } : {}),
      ...(body.notifyOnSchedule !== undefined ? { notifyOnSchedule: Boolean(body.notifyOnSchedule) } : {})
    };
  }

  // Handle client updates if clientDetails or clientId or client name is provided
  const existingProject = store.getProjectById(req.params.id);
  if (existingProject && (body.clientDetails || body.clientId || body.client)) {
    const targetClientId = (body.clientId && body.clientId !== 'new') ? body.clientId : existingProject.clientId;
    const clientInfo = body.clientDetails || {
      name: body.clientName || body.client || existingProject.client,
      companyName: body.clientCompanyName || body.companyName || '',
      email: body.clientEmail || '',
      phone: body.clientPhone || '',
      whatsapp: body.clientWhatsapp || body.clientPhone || '',
      address: body.clientAddress || '',
      notes: body.clientNotes || ''
    };

    const candidateName = (clientInfo.name || body.client || existingProject.client || '').trim();

    if (targetClientId && targetClientId !== 'new') {
      const existingClient = store.getClientById(targetClientId);
      if (existingClient) {
        store.updateClient(targetClientId, {
          name: candidateName || existingClient.name,
          companyName: clientInfo.companyName !== undefined ? clientInfo.companyName : existingClient.companyName,
          email: clientInfo.email !== undefined ? clientInfo.email : existingClient.email,
          phone: clientInfo.phone !== undefined ? clientInfo.phone : existingClient.phone,
          whatsapp: clientInfo.whatsapp !== undefined ? clientInfo.whatsapp : existingClient.whatsapp,
          address: clientInfo.address !== undefined ? clientInfo.address : existingClient.address,
          notes: clientInfo.notes !== undefined ? clientInfo.notes : existingClient.notes
        });
        body.clientId = targetClientId;
        body.client = candidateName || existingClient.name;
      }
    } else if (candidateName) {
      const allClients = store.getClients();
      let matched = allClients.find((c) => c.name.toLowerCase() === candidateName.toLowerCase());
      if (!matched && clientInfo.email) {
        matched = allClients.find((c) => c.email && c.email.toLowerCase() === clientInfo.email.toLowerCase());
      }
      if (matched) {
        store.updateClient(matched.id, {
          companyName: clientInfo.companyName || matched.companyName,
          email: clientInfo.email || matched.email,
          phone: clientInfo.phone || matched.phone,
          whatsapp: clientInfo.whatsapp || matched.whatsapp,
          address: clientInfo.address || matched.address,
          notes: clientInfo.notes || matched.notes
        });
        body.clientId = matched.id;
        body.client = matched.name;
      } else {
        const newClient: Client = {
          id: 'client-' + uuidv4().slice(0, 8),
          name: candidateName,
          companyName: clientInfo.companyName || '',
          phone: clientInfo.phone || '',
          email: clientInfo.email || '',
          whatsapp: clientInfo.whatsapp || clientInfo.phone || '',
          address: clientInfo.address || '',
          projects: [existingProject.name],
          totalRevenue: 0,
          pendingAmount: 0,
          notes: clientInfo.notes || '',
          communicationHistory: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        const createdClient = store.addClient(newClient);
        body.clientId = createdClient.id;
        body.client = createdClient.name;
      }
    }
  }

  const updated = store.updateProject(req.params.id, body);
  if (!updated) return res.status(404).json({ error: 'Project not found' });

  // If domain cost was explicitly changed, sync or add domain expense in finance ledger
  const newDomainCost = req.body.liveWebsite?.domainCost ?? req.body.financials?.domainCost;
  if (newDomainCost !== undefined && Number(newDomainCost) >= 0) {
    const existingExp = store.getExpenses().find((e) => e.projectId === updated.id && e.category === 'Domain');
    if (existingExp) {
      store.updateExpense(existingExp.id, { amount: Number(newDomainCost) });
    } else if (Number(newDomainCost) > 0 && (updated.liveWebsite?.domainOwnership === 'Studio Needed' || updated.liveWebsite?.domainPaidBy === 'Studio')) {
      const newDomainExp: Expense = {
        id: 'exp-' + uuidv4().slice(0, 8),
        name: `Domain Fee: ${updated.liveWebsite?.domain || updated.name}`,
        category: 'Domain',
        amount: Number(newDomainCost),
        date: new Date().toISOString().split('T')[0],
        projectId: updated.id,
        projectName: updated.name,
        paidBy: 'Suveda',
        paymentMethod: 'UPI',
        recurring: false,
        frequency: 'One-Time',
        notes: `Domain registration fee for ${updated.name} (Registrar: ${updated.liveWebsite?.domainRegistrar || 'Registrar'})`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      store.addExpense(newDomainExp);
    }
  }

  res.json(updated);
});

router.delete('/projects/:id', (req: Request, res: Response) => {
  const ok = store.deleteProject(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Project not found' });
  res.json({ message: 'Project deleted successfully' });
});

router.delete('/projects', (req: Request, res: Response) => {
  store.clearAllProjects();
  res.json({ message: 'All projects removed successfully' });
});

// Add project update / version history entry
router.post('/projects/:id/updates', (req: Request, res: Response) => {
  const project = store.getProjectById(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { title, description, author } = req.body;
  const newUpdate = {
    id: 'upd-' + uuidv4().slice(0, 6),
    date: new Date().toISOString().split('T')[0],
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    title: title || 'Project Update',
    description: description || '',
    author: author || 'Suveda'
  };

  const updates = [newUpdate, ...(project.updates || [])];
  const updated = store.updateProject(req.params.id, { updates });
  res.status(201).json(updated);
});

// Add project note
router.post('/projects/:id/notes', (req: Request, res: Response) => {
  const project = store.getProjectById(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { title, content, author, category } = req.body;
  const newNote = {
    id: 'note-' + uuidv4().slice(0, 6),
    date: new Date().toISOString().split('T')[0],
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    title: title || 'Note',
    content: content || '',
    author: author || 'Suveda',
    category: category || 'Meeting'
  };

  const notes = [newNote, ...(project.notes || [])];
  const updated = store.updateProject(req.params.id, { notes });
  res.status(201).json(updated);
});

// Add project task
router.post('/projects/:id/tasks', (req: Request, res: Response) => {
  const project = store.getProjectById(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { title, assignee, dueDate } = req.body;
  const newTask = {
    id: 'task-' + uuidv4().slice(0, 6),
    title: title || 'New Task',
    status: 'Todo' as const,
    assignee: assignee || 'Both',
    dueDate: dueDate || ''
  };

  const tasks = [...(project.tasks || []), newTask];
  const updated = store.updateProject(req.params.id, { tasks });
  res.status(201).json(updated);
});

// Toggle task status
router.put('/projects/:id/tasks/:taskId', (req: Request, res: Response) => {
  const project = store.getProjectById(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const tasks = (project.tasks || []).map((t) => {
    if (t.id === req.params.taskId) {
      return { ...t, ...req.body };
    }
    return t;
  });

  const updated = store.updateProject(req.params.id, { tasks });
  res.json(updated);
});

// Add repository to project
router.post('/projects/:id/repositories', (req: Request, res: Response) => {
  const project = store.getProjectById(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

  const { name, githubUrl, owner, branch, framework, status } = req.body;
  const newRepo = {
    id: 'repo-' + uuidv4().slice(0, 6),
    name: name || project.name,
    githubUrl: githubUrl || '',
    owner: owner || 'Srimunn',
    branch: branch || 'main',
    framework: framework || 'Next.js',
    lastUpdated: new Date().toISOString().split('T')[0],
    status: status || 'Active'
  };

  const repositories = [...(project.repositories || []), newRepo];
  const updated = store.updateProject(req.params.id, { repositories });
  res.status(201).json(updated);
});

// Update timeline stage
router.put('/projects/:id/timeline/:timelineId', (req: Request, res: Response) => {
  const project = store.getProjectById(req.params.id);
  if (!project) return res.status(404).json({ error: 'Project not found' });

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

  const updated = store.updateProject(req.params.id, { timeline });
  res.json(updated);
});

// --- CLIENTS ---
router.get('/clients', (req: Request, res: Response) => {
  store.recalculateAll();
  res.json(store.getClients());
});

router.get('/clients/:id', (req: Request, res: Response) => {
  const client = store.getClientById(req.params.id);
  if (!client) return res.status(404).json({ error: 'Client not found' });
  res.json(client);
});

router.post('/clients', (req: Request, res: Response) => {
  const now = new Date().toISOString();
  const body = req.body;
  const newClient: Client = {
    id: 'client-' + uuidv4().slice(0, 8),
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
  const created = store.addClient(newClient);
  res.status(201).json(created);
});

router.put('/clients/:id', (req: Request, res: Response) => {
  const updated = store.updateClient(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Client not found' });
  res.json(updated);
});

router.delete('/clients/:id', (req: Request, res: Response) => {
  const ok = store.deleteClient(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Client not found' });
  res.json({ message: 'Client deleted' });
});

router.delete('/clients', (req: Request, res: Response) => {
  store.clearAllClients();
  res.json({ message: 'All clients cleared successfully' });
});

// --- EXPENSES ---
router.get('/expenses', (req: Request, res: Response) => {
  const { category, paidBy, deductFromProfit } = req.query;
  let list = [...store.getExpenses()];

  if (category && typeof category === 'string' && category !== 'all') {
    list = list.filter((e) => e.category.toLowerCase() === category.toLowerCase());
  }

  if (paidBy && typeof paidBy === 'string' && paidBy !== 'all') {
    list = list.filter((e) => e.paidBy.toLowerCase() === paidBy.toLowerCase());
  }

  if (deductFromProfit !== undefined && deductFromProfit !== 'all') {
    const shouldDeduct = deductFromProfit === 'true';
    list = list.filter((e) => (e.deductFromProfit !== false) === shouldDeduct);
  }

  res.json(list);
});

router.post('/expenses', (req: Request, res: Response) => {
  const now = new Date().toISOString();
  const body = req.body;
  const newExp: Expense = {
    id: 'exp-' + uuidv4().slice(0, 8),
    name: body.name || 'Expense',
    category: body.category || 'Other',
    amount: Number(body.amount) || 0,
    date: body.date || now.split('T')[0],
    projectId: body.projectId,
    projectName: body.projectName,
    paidBy: body.paidBy || 'Suveda',
    splitDetails: body.splitDetails || ((body.paidBy === 'Both' || body.paidBy === 'Shared') ? {
      suvedaAmount: Math.round((Number(body.amount) || 0) / 2),
      srimunAmount: (Number(body.amount) || 0) - Math.round((Number(body.amount) || 0) / 2),
      suvedaPercent: 50,
      srimunPercent: 50
    } : undefined),
    paymentMethod: body.paymentMethod || 'UPI',
    recurring: Boolean(body.recurring),
    frequency: body.frequency || 'One-Time',
    deductFromProfit: body.deductFromProfit !== undefined ? Boolean(body.deductFromProfit) : true,
    notes: body.notes || '',
    receipt: body.receipt || '',
    receiptName: body.receiptName || '',
    receiptType: body.receiptType || '',
    createdAt: now,
    updatedAt: now
  };
  const created = store.addExpense(newExp);

  // If this was a domain expense linked to a project, sync to the project
  if (newExp.projectId && newExp.category === 'Domain') {
    const proj = store.getProjectById(newExp.projectId);
    if (proj) {
      store.updateProject(proj.id, {
        liveWebsite: {
          ...proj.liveWebsite,
          domainCost: newExp.amount
        },
        financials: {
          ...proj.financials,
          domainCost: newExp.amount
        }
      });
    }
  }

  res.status(201).json(created);
});

router.put('/expenses/:id', (req: Request, res: Response) => {
  const updated = store.updateExpense(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Expense not found' });
  res.json(updated);
});

router.delete('/expenses/:id', (req: Request, res: Response) => {
  const ok = store.deleteExpense(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Expense not found' });
  res.json({ message: 'Expense deleted' });
});

router.delete('/expenses', (req: Request, res: Response) => {
  store.clearAllExpenses();
  res.json({ message: 'All expenses cleared successfully' });
});

// --- TOOLS & SUBSCRIPTIONS ---
router.get('/tools', (req: Request, res: Response) => {
  res.json(store.getTools());
});

router.post('/tools', (req: Request, res: Response) => {
  const now = new Date().toISOString();
  const body = req.body;
  const newTool: ToolSubscription = {
    id: 'tool-' + uuidv4().slice(0, 8),
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
    billProof: body.billProof || '',
    billProofName: body.billProofName || '',
    billProofType: body.billProofType || '',
    createdAt: now,
    updatedAt: now
  };
  const created = store.addTool(newTool);
  res.status(201).json(created);
});

router.put('/tools/:id', (req: Request, res: Response) => {
  const updated = store.updateTool(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Tool not found' });
  res.json(updated);
});

router.delete('/tools/:id', (req: Request, res: Response) => {
  const ok = store.deleteTool(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Tool not found' });
  res.json({ message: 'Tool deleted' });
});

router.delete('/tools', (req: Request, res: Response) => {
  store.clearAllTools();
  res.json({ message: 'All tools cleared successfully' });
});

router.post('/system/reset', (req: Request, res: Response) => {
  store.clearAllData();
  res.json({ message: 'All system data reset to empty successfully' });
});

router.post('/system/reset-demo', (req: Request, res: Response) => {
  store.resetToDemoData();
  res.json({ message: 'Sample demo data restored successfully' });
});

// --- FINANCES & TRANSACTIONS ---
router.get('/finances/overview', (req: Request, res: Response) => {
  const projects = store.getProjects();
  const expenses = store.getExpenses();
  const payments = store.getPayments();

  const totalRevenue = projects.reduce((sum, p) => sum + (Number(p.financials.totalReceived) || 0), 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const profitDeductibleExpenses = expenses
    .filter((e) => e.deductFromProfit !== false)
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const netProfit = totalRevenue - profitDeductibleExpenses;
  const pendingAmount = projects.reduce((sum, p) => sum + (Number(p.financials.outstandingAmount) || 0), 0);

  const domainExpensesInLedger = expenses
    .filter((e) => e.category === 'Domain')
    .reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
  const projectDomainCosts = projects
    .reduce((sum, p) => sum + (Number(p.financials?.domainCost ?? p.liveWebsite?.domainCost) || 0), 0);
  const totalDomainMoney = Math.max(domainExpensesInLedger, projectDomainCosts);

  const domainExpensesCount = expenses.filter((e) => e.category === 'Domain').length ||
    projects.filter((p) => Number(p.financials?.domainCost ?? p.liveWebsite?.domainCost) > 0).length;

  const totalDomainClientExtra = projects
    .reduce((sum, p) => sum + (Number(p.financials?.domainClientExtra ?? p.liveWebsite?.domainClientExtra) || 0), 0);
  const totalDomainClientReceived = projects
    .reduce((sum, p) => sum + (Number(p.financials?.domainClientReceived ?? p.liveWebsite?.domainClientReceived) || 0), 0);

  res.json({
    totalRevenue,
    totalExpenses,
    netProfit,
    pendingAmount,
    domainExpenses: totalDomainMoney,
    domainExpensesCount,
    domainClientExtra: totalDomainClientExtra,
    domainClientReceived: totalDomainClientReceived,
    suvedaShare: projects.reduce((sum, p) => sum + (Number(p.financials.profitSplit.suvedaAmount) || 0), 0),
    srimunShare: projects.reduce((sum, p) => sum + (Number(p.financials.profitSplit.srimunAmount) || 0), 0),
    partnerPayoutsSummary: store.getPartnerPayoutsSummary(),
    transactions: payments
  });
});

router.get('/finances/transactions', (req: Request, res: Response) => {
  res.json(store.getPayments());
});

router.post('/finances/transactions', (req: Request, res: Response) => {
  const now = new Date().toISOString();
  const body = req.body;
  const newTx: PaymentTransaction = {
    id: 'pay-' + uuidv4().slice(0, 8),
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
  const created = store.addPayment(newTx);
  res.status(201).json(created);
});

// --- PARTNER PAYOUTS / DRAWINGS ---
router.get('/finances/payouts', (req: Request, res: Response) => {
  res.json({
    payouts: store.getPartnerPayouts(),
    summary: store.getPartnerPayoutsSummary()
  });
});

router.post('/finances/payouts', (req: Request, res: Response) => {
  const body = req.body;
  const payout = store.createPartnerPayout(body);
  res.status(201).json({
    payout,
    summary: store.getPartnerPayoutsSummary()
  });
});

router.delete('/finances/payouts/:id', (req: Request, res: Response) => {
  const ok = store.deletePartnerPayout(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Payout record not found' });
  res.json({
    message: 'Payout deleted',
    summary: store.getPartnerPayoutsSummary()
  });
});

// --- TEAM ---
router.get('/team', (req: Request, res: Response) => {
  res.json(store.getTeamMembers());
});

router.post('/team', (req: Request, res: Response) => {
  const now = new Date().toISOString();
  const body = req.body;
  const newMember = {
    id: 'team-' + uuidv4().slice(0, 8),
    name: body.name || 'Team Member',
    role: body.role || 'Developer',
    email: body.email || '',
    phone: body.phone || '',
    avatar: body.avatar || '',
    projectsWorkedOn: 0,
    revenueGenerated: 0,
    profitShareEarned: 0,
    expensesPaid: 0,
    createdAt: now,
    updatedAt: now
  };
  const created = store.addTeamMember(newMember);
  res.status(201).json(created);
});

router.put('/team/:id', (req: Request, res: Response) => {
  const updated = store.updateTeamMember(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Team member not found' });
  res.json(updated);
});

router.delete('/team/:id', (req: Request, res: Response) => {
  const ok = store.deleteTeamMember(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Team member not found' });
  res.json({ message: 'Team member deleted' });
});

// --- DOCUMENTS ---
router.get('/documents', (req: Request, res: Response) => {
  res.json(store.getDocuments());
});

router.post('/documents', upload.single('file'), (req: Request, res: Response) => {
  const now = new Date().toISOString();
  const file = req.file;
  const body = req.body;

  const newDoc: DocumentItem = {
    id: 'doc-' + uuidv4().slice(0, 8),
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

  const created = store.addDocument(newDoc);
  res.status(201).json(created);
});

router.delete('/documents/:id', (req: Request, res: Response) => {
  const ok = store.deleteDocument(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Document not found' });
  res.json({ message: 'Document deleted' });
});

// --- NOTIFICATIONS ---
router.get('/notifications', (req: Request, res: Response) => {
  store.reloadFromDisk();
  res.json(store.getNotifications());
});

router.put('/notifications/:id/read', (req: Request, res: Response) => {
  store.markNotificationRead(req.params.id);
  res.json({ message: 'Notification marked as read' });
});

router.put('/notifications/read-all', (req: Request, res: Response) => {
  store.markAllNotificationsRead();
  res.json({ message: 'All notifications marked as read' });
});

router.post('/notifications/trigger-blog', (req: Request, res: Response) => {
  const { projectId } = req.body;
  const project = projectId ? store.getProjectById(projectId) : store.getProjects().find((p) => p.blogSchedule?.hasBlog);
  if (!project) return res.status(404).json({ error: 'No blog project found' });

  const now = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayDay = dayNames[now.getDay()];
  const postsPerWk = project.blogSchedule?.postsPerWeek || 1;

  const notif: NotificationItem = {
    id: 'notif-blog-' + uuidv4().slice(0, 8),
    title: `📝 Blog Due Today: ${project.name}`,
    message: `Today (${todayDay}) is a scheduled blog post day for ${project.name} (${postsPerWk} blog${postsPerWk > 1 ? 's' : ''}/week). Time to draft, publish, and track in GA4!`,
    type: 'blog',
    date: now.toISOString().split('T')[0],
    read: false,
    link: `/projects?projectId=${project.id}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  store.addNotification(notif);
  res.json(notif);
});

// --- SETTINGS ---
router.get('/settings', (req: Request, res: Response) => {
  res.json(store.getSettings());
});

router.put('/settings', (req: Request, res: Response) => {
  const updated = store.updateSettings(req.body);
  res.json(updated);
});

// --- INVOICES & QUOTATIONS ---
router.get('/invoices', (req: Request, res: Response) => {
  const { status, clientId, projectId } = req.query;
  let list = store.getInvoices();

  if (status && typeof status === 'string' && status !== 'all') {
    list = list.filter((i) => i.status.toLowerCase() === status.toLowerCase());
  }
  if (clientId && typeof clientId === 'string') {
    list = list.filter((i) => i.clientId === clientId);
  }
  if (projectId && typeof projectId === 'string') {
    list = list.filter((i) => i.projectId === projectId);
  }

  res.json(list);
});

router.get('/invoices/:id', (req: Request, res: Response) => {
  const inv = store.getInvoiceById(req.params.id);
  if (!inv) return res.status(404).json({ error: 'Invoice not found' });
  res.json(inv);
});

router.post('/invoices', (req: Request, res: Response) => {
  const invoice = store.createInvoice(req.body);
  res.status(201).json(invoice);
});

router.put('/invoices/:id', (req: Request, res: Response) => {
  const updated = store.updateInvoice(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Invoice not found' });
  res.json(updated);
});

router.delete('/invoices/:id', (req: Request, res: Response) => {
  const ok = store.deleteInvoice(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Invoice not found' });
  res.json({ message: 'Invoice deleted successfully' });
});

// --- LEADS & CRM ---
router.get('/leads', (req: Request, res: Response) => {
  const { status, priority } = req.query;
  let list = store.getLeads();

  if (status && typeof status === 'string' && status !== 'all') {
    list = list.filter((l) => l.status.toLowerCase() === status.toLowerCase());
  }
  if (priority && typeof priority === 'string' && priority !== 'all') {
    list = list.filter((l) => l.priority.toLowerCase() === priority.toLowerCase());
  }

  res.json(list);
});

router.get('/leads/:id', (req: Request, res: Response) => {
  const lead = store.getLeadById(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });
  res.json(lead);
});

router.post('/leads', (req: Request, res: Response) => {
  const lead = store.createLead(req.body);
  res.status(201).json(lead);
});

router.put('/leads/:id', (req: Request, res: Response) => {
  const updated = store.updateLead(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Lead not found' });
  res.json(updated);
});

router.delete('/leads/:id', (req: Request, res: Response) => {
  const ok = store.deleteLead(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Lead not found' });
  res.json({ message: 'Lead deleted successfully' });
});

router.post('/leads/:id/convert', (req: Request, res: Response) => {
  const result = store.convertLeadToProject(req.params.id);
  if (!result) return res.status(404).json({ error: 'Lead not found or conversion failed' });
  res.status(201).json({
    message: 'Lead converted to active project and client successfully',
    ...result
  });
});

// --- MAINTENANCE CONTRACTS (AMC) ---
router.get('/maintenance', (req: Request, res: Response) => {
  res.json(store.getMaintenanceContracts());
});

router.post('/maintenance', (req: Request, res: Response) => {
  const contract = store.createMaintenanceContract(req.body);
  res.status(201).json(contract);
});

router.put('/maintenance/:id', (req: Request, res: Response) => {
  const updated = store.updateMaintenanceContract(req.params.id, req.body);
  if (!updated) return res.status(404).json({ error: 'Contract not found' });
  res.json(updated);
});

router.delete('/maintenance/:id', (req: Request, res: Response) => {
  const ok = store.deleteMaintenanceContract(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Contract not found' });
  res.json({ message: 'Maintenance contract deleted' });
});

// --- GLOBAL SEARCH ---
router.get('/search', (req: Request, res: Response) => {
  const q = (req.query.q as string || '').toLowerCase().trim();
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

  const projects = store.getProjects();
  const clients = store.getClients();
  const expenses = store.getExpenses();
  const tools = store.getTools();
  const documents = store.getDocuments();

  const matchedProjects = projects.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.client.toLowerCase().includes(q) ||
      p.type.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.designAndDev.technologies.some((t) => t.toLowerCase().includes(q))
  );

  const matchedClients = clients.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.companyName.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.phone.includes(q)
  );

  const matchedRepos: any[] = [];
  projects.forEach((p) => {
    p.repositories?.forEach((r) => {
      if (r.name.toLowerCase().includes(q) || r.githubUrl.toLowerCase().includes(q) || r.branch.toLowerCase().includes(q)) {
        matchedRepos.push({ ...r, projectId: p.id, projectName: p.name });
      }
    });
  });

  const matchedWebsites: any[] = [];
  projects.forEach((p) => {
    if (
      p.liveWebsite?.liveUrl?.toLowerCase().includes(q) ||
      p.liveWebsite?.domain?.toLowerCase().includes(q) ||
      p.liveWebsite?.platform?.toLowerCase().includes(q)
    ) {
      matchedWebsites.push({ ...p.liveWebsite, projectId: p.id, projectName: p.name });
    }
  });

  const matchedExpenses = expenses.filter(
    (e) =>
      e.name.toLowerCase().includes(q) ||
      e.category.toLowerCase().includes(q) ||
      (e.projectName && e.projectName.toLowerCase().includes(q))
  );

  const matchedTools = tools.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      t.plan.toLowerCase().includes(q)
  );

  const matchedDocuments = documents.filter(
    (d) =>
      d.name.toLowerCase().includes(q) ||
      d.type.toLowerCase().includes(q) ||
      (d.projectName && d.projectName.toLowerCase().includes(q))
  );

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
router.get('/export/json', (req: Request, res: Response) => {
  const data = store.getAllData();
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename=freelance-management-backup-${new Date().toISOString().split('T')[0]}.json`);
  res.send(JSON.stringify(data, null, 2));
});

router.post('/export/import', (req: Request, res: Response) => {
  const ok = store.importAllData(req.body);
  if (!ok) return res.status(400).json({ error: 'Invalid backup JSON file structure' });
  res.json({ message: 'Data imported successfully' });
});

// CSV Exports
router.get('/export/csv/:type', (req: Request, res: Response) => {
  const { type } = req.params;

  if (type === 'projects') {
    const projects = store.getProjects();
    let csv = 'Project ID,Project Name,Client,Type,Status,Start Date,Completion Date,Project Value,Total Received,Pending,Expenses,Net Profit,Suveda Share,Srimun Share,GitHub,Live Website\n';
    projects.forEach((p) => {
      csv += `"${p.id}","${p.name}","${p.client}","${p.type}","${p.status}","${p.startDate}","${p.actualCompletionDate || p.expectedCompletionDate || ''}",${p.financials.projectValue},${p.financials.totalReceived},${p.financials.outstandingAmount},${p.financials.totalExpenses},${p.financials.netProfit},${p.financials.profitSplit.suvedaAmount},${p.financials.profitSplit.srimunAmount},"${p.links.githubRepo || ''}","${p.links.liveWebsite || ''}"\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=projects-${Date.now()}.csv`);
    return res.send(csv);
  }

  if (type === 'expenses') {
    const expenses = store.getExpenses();
    let csv = 'Expense ID,Name,Category,Amount,Date,Project,Paid By,Payment Method,Recurring,Deduct From Profit,Notes\n';
    expenses.forEach((e) => {
      csv += `"${e.id}","${e.name}","${e.category}",${e.amount},"${e.date}","${e.projectName || ''}","${e.paidBy}","${e.paymentMethod}","${e.recurring ? 'Yes' : 'No'}","${e.deductFromProfit !== false ? 'Yes' : 'No'}","${e.notes || ''}"\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=expenses-${Date.now()}.csv`);
    return res.send(csv);
  }

  if (type === 'clients') {
    const clients = store.getClients();
    let csv = 'Client ID,Name,Company,Phone,Email,WhatsApp,Total Revenue,Pending Amount,Projects\n';
    clients.forEach((c) => {
      csv += `"${c.id}","${c.name}","${c.companyName}","${c.phone}","${c.email}","${c.whatsapp}",${c.totalRevenue},${c.pendingAmount},"${c.projects.join('; ')}"\n`;
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=clients-${Date.now()}.csv`);
    return res.send(csv);
  }

  if (type === 'finances') {
    const payments = store.getPayments();
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

export default router;
