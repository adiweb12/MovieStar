const jwt  = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');

const COOKIE = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge:   7 * 24 * 60 * 60 * 1000,
};

const signToken = id => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

// ── Show login / register page ────────────────────────────
exports.showPage = (mode) => (req, res) => {
  if (req.cookies.token) return res.redirect(req.query.redirect || '/');
  res.render('login', {
    title:    mode === 'register' ? 'Register – MovieStar' : 'Login – MovieStar',
    error:    null,
    redirect: req.query.redirect || '/',
    mode,
  });
};

// ── Handle login ──────────────────────────────────────────
exports.login = async (req, res) => {
  const errors = validationResult(req);
  const { redirect = '/' } = req.body;
  if (!errors.isEmpty()) {
    return res.render('login', { title: 'Login – MovieStar', error: errors.array()[0].msg, redirect, mode: 'login' });
  }
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return res.render('login', { title: 'Login – MovieStar', error: 'Invalid username or password', redirect, mode: 'login' });
    }
    res.cookie('token', signToken(user._id), COOKIE);
    res.redirect(redirect);
  } catch {
    res.render('login', { title: 'Login – MovieStar', error: 'Something went wrong', redirect, mode: 'login' });
  }
};

// ── Handle register ───────────────────────────────────────
exports.register = async (req, res) => {
  const errors = validationResult(req);
  const { redirect = '/' } = req.body;
  if (!errors.isEmpty()) {
    return res.render('login', { title: 'Register – MovieStar', error: errors.array()[0].msg, redirect, mode: 'register' });
  }
  try {
    const { username, password } = req.body;
    if (await User.findOne({ username })) {
      return res.render('login', { title: 'Register – MovieStar', error: 'Username already taken', redirect, mode: 'register' });
    }
    const user = await User.create({ username, password });
    res.cookie('token', signToken(user._id), COOKIE);
    res.redirect(redirect);
  } catch {
    res.render('login', { title: 'Register – MovieStar', error: 'Something went wrong', redirect, mode: 'register' });
  }
};

// ── Logout ────────────────────────────────────────────────
exports.logout = (req, res) => {
  res.clearCookie('token');
  res.redirect('/');
};
