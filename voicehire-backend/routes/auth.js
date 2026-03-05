// routes/auth.js
// Handles: POST /api/auth/register, POST /api/auth/login,
//          GET /api/auth/me, PUT /api/auth/update-profile

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

// ─────────────────────────────────────────
//  Helper: generate JWT token
// ─────────────────────────────────────────
function generateToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, name: user.name },
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

    try {
      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: 'An account with this email already exists.'
        });
      }

      const hashedPassword = await bcrypt.hash(password, 12);
      const newUser = await User.create({ name, email, password: hashedPassword, photo: photo || null });

      const token = generateToken(newUser);

      res.status(201).json({
        success: true,
        message: 'Account created successfully!',
        token,
        user: {
          id: newUser._id,
          name: newUser.name,
          email: newUser.email,
          photo: newUser.photo,
          created_at: newUser.createdAt
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

    try {
      const user = await User.findOne({ email });
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
          id: user._id,
          name: user.name,
          email: user.email,
          photo: user.photo,
          created_at: user.createdAt
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
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }
    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        photo: user.photo,
        created_at: user.createdAt
      }
    });
  } catch (err) {
    console.error('Get me error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ─────────────────────────────────────────
//  PUT /api/auth/update-profile  (protected)
// ─────────────────────────────────────────
router.put('/update-profile', authMiddleware, async (req, res) => {
  const { name, photo } = req.body;

  try {
    const updated = await User.findByIdAndUpdate(
      req.user.id,
      { name: name || req.user.name, photo: photo || null },
      { new: true, select: '-password' }
    );
    res.json({
      success: true,
      message: 'Profile updated.',
      user: {
        id: updated._id,
        name: updated.name,
        email: updated.email,
        photo: updated.photo
      }
    });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ success: false, message: 'Failed to update profile.' });
  }
});

module.exports = router;
