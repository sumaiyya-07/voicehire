// routes/auth.js
// Handles: POST /api/auth/register, POST /api/auth/login, GET /api/auth/me

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { getDB } = require('../db/database');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// ─────────────────────────────────────────
//  Helper: generate JWT token
// ─────────────────────────────────────────
function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// ─────────────────────────────────────────
//  POST /api/auth/register
// ─────────────────────────────────────────
router.post(
  '/register',
  [
    body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
    body('email').isEmail().normalizeEmail().withMessage('Enter a valid email'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { name, email, password, photo } = req.body;
    const db = getDB();

    try {
      // Check if email already exists
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (existing) {
        return res.status(409).json({
          success: false,
          message: 'An account with this email already exists.'
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 12);

      // Insert user
      const result = db.prepare(`
        INSERT INTO users (name, email, password, photo)
        VALUES (?, ?, ?, ?)
      `).run(name, email, hashedPassword, photo || null);

      const newUser = db.prepare('SELECT id, name, email, photo, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);

      const token = generateToken(newUser);

      res.status(201).json({
        success: true,
        message: 'Account created successfully!',
        token,
        user: {
          id: newUser.id,
          name: newUser.name,
          email: newUser.email,
          photo: newUser.photo,
          created_at: newUser.created_at
        }
      });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ success: false, message: 'Server error during registration.' });
    }
  }
);

// ─────────────────────────────────────────
//  POST /api/auth/login
// ─────────────────────────────────────────
router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail().withMessage('Enter a valid email'),
    body('password').notEmpty().withMessage('Password is required')
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { email, password } = req.body;
    const db = getDB();

    try {
      const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
      if (!user) {
        return res.status(401).json({ success: false, message: 'Invalid email or password.' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(401).json({ success: false, message: 'Invalid email or password.' });
      }

      const token = generateToken(user);

      res.json({
        success: true,
        message: 'Logged in successfully!',
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          photo: user.photo,
          created_at: user.created_at
        }
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ success: false, message: 'Server error during login.' });
    }
  }
);

// ─────────────────────────────────────────
//  GET /api/auth/me  (protected)
// ─────────────────────────────────────────
router.get('/me', authMiddleware, (req, res) => {
  const db = getDB();
  const user = db.prepare('SELECT id, name, email, photo, created_at FROM users WHERE id = ?').get(req.user.id);

  if (!user) {
    return res.status(404).json({ success: false, message: 'User not found.' });
  }

  res.json({ success: true, user });
});

// ─────────────────────────────────────────
//  PUT /api/auth/update-profile  (protected)
// ─────────────────────────────────────────
router.put('/update-profile', authMiddleware, async (req, res) => {
  const { name, photo } = req.body;
  const db = getDB();

  try {
    db.prepare(`
      UPDATE users SET name = ?, photo = ?, updated_at = datetime('now') WHERE id = ?
    `).run(name || req.user.name, photo || null, req.user.id);

    const updated = db.prepare('SELECT id, name, email, photo FROM users WHERE id = ?').get(req.user.id);
    res.json({ success: true, message: 'Profile updated.', user: updated });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
});

module.exports = router;
