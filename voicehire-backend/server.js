// server.js
// VoiceHire Backend — Main Entry Point

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

// ─────────────────────────────────────────
//  Initialize DB on startup
// ─────────────────────────────────────────
const { getDB } = require('./db/database');
getDB(); // creates voicehire.db and schema if not exists

// ─────────────────────────────────────────
//  App
// ─────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 5000;

// ─────────────────────────────────────────
//  Middleware
// ─────────────────────────────────────────
app.use(cors({
  origin: true,   // allow any origin (including file:// and localhost variants)
  credentials: true
}));

app.use(express.json({ limit: '10mb' })); // 10mb allows base64 photos
app.use(express.urlencoded({ extended: true }));

// HTTP request logger (dev only)
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ─────────────────────────────────────────
//  Rate Limiting
// ─────────────────────────────────────────
// General: 100 requests / 15 min per IP
app.use('/api/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests. Please try again in 15 minutes.' }
}));

// Auth: 10 requests / 15 min per IP (prevent brute force)
app.use('/api/auth/', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many auth attempts. Please try again in 15 minutes.' }
}));

// ─────────────────────────────────────────
//  Serve Frontend (static files)
// ─────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'voicehire-frontend')));

// ─────────────────────────────────────────
//  Routes
// ─────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/interview', require('./routes/interview'));
app.use('/api/report', require('./routes/report'));

// ─────────────────────────────────────────
//  Health Check
// ─────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'VoiceHire API is running',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// ─────────────────────────────────────────
//  404 Handler
// ─────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// ─────────────────────────────────────────
//  Global Error Handler
// ─────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

// ─────────────────────────────────────────
//  Start Server
// ─────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║   VoiceHire Backend                  ║
  ║   Running on http://localhost:${PORT}  ║
  ║   Environment: ${(process.env.NODE_ENV || 'development').padEnd(19)}║
  ╚══════════════════════════════════════╝
  `);
  console.log('📡 API Endpoints:');
  console.log('   POST   /api/auth/register');
  console.log('   POST   /api/auth/login');
  console.log('   GET    /api/auth/me');
  console.log('   POST   /api/interview/start');
  console.log('   POST   /api/interview/:id/answer');
  console.log('   GET    /api/interview/history');
  console.log('   POST   /api/report/generate/:interviewId');
  console.log('   GET    /api/report/:interviewId');
  console.log('   GET    /api/health\n');
});
