import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import apiRoutes from './routes/api';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5100;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}));
app.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Serve static uploads
const uploadsDir = path.resolve(__dirname, '../uploads');
app.use('/uploads', express.static(uploadsDir));

// API Routes
app.use('/api', apiRoutes);

app.get('/', (req, res) => {
  res.json({
    message: 'Intouch — Freelance Project & Finance Management System API',
    status: 'online',
    version: '1.0.0'
  });
});

const server = app.listen(Number(PORT), '127.0.0.1', () => {
  console.log(`[Server] Freelance Management API running on http://127.0.0.1:${PORT}`);
});

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`[Server] Port ${PORT} is temporarily busy. Retrying in 1s...`);
    setTimeout(() => {
      try {
        server.close();
      } catch {}
      server.listen(Number(PORT), '127.0.0.1', () => {
        console.log(`[Server] Freelance Management API running on http://127.0.0.1:${PORT}`);
      });
    }, 1000);
  } else {
    console.error('[Server] Error:', err);
  }
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});
