"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const api_1 = __importDefault(require("./routes/api"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
// Middleware
app.use((0, cors_1.default)({
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    credentials: true
}));
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '50mb' }));
// Serve static uploads
const uploadsDir = path_1.default.resolve(__dirname, '../uploads');
app.use('/uploads', express_1.default.static(uploadsDir));
// API Routes
app.use('/api', api_1.default);
app.get('/', (req, res) => {
    res.json({
        message: 'Freelance Project & Finance Management System API (Suveda & Srimun)',
        status: 'online',
        version: '1.0.0'
    });
});
app.listen(PORT, () => {
    console.log(`[Server] Freelance Management API running on http://localhost:${PORT}`);
});
