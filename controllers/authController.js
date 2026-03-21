const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const Log  = require('../models/Log');
const { recordFailedLogin, clearFailedLogin } = require('../middleware/ipBlock');

const COOKIE = {
  httpOnly: true,
  secure:   true,
  sameSite: 'lax',
  maxAge:   7 * 24 * 60 * 60 * 1000,
};

const sign = id => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

exports.showPage = mode => (req, res) => {
  // If we have a token, try to see if it's actually valid
  if (req.cookies.token) {
    try {
      jwt.verify(req.cookies.token, process.env.JWT_SECRET);
      // If valid, go to the page we wanted
      return res.redirect(req.query.redirect || '/');
    } catch (err) {
      // If invalid/expired, KILL the cookie so we don't loop
      res.clearCookie('token');
    }
  }

  res.render('login', {
    title: mode === 'register' ? 'Register' : 'Login',
    error: null, 
    redirect: req.query.redirect || '/', 
    mode,
    user: null // Keeps EJS from crashing on mobile
  });
};

exports.login = async (req, res) => {
  const errors = validationResult(req);
  const { redirect = '/' } = req.body;
  const ip = req.ip;
  const ua = req.headers['user-agent'];
  if (!errors.isEmpty())
    return res.render('login', { title: 'Login', error: errors.array()[0].msg, redirect, mode: 'login' });

  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      await recordFailedLogin(ip, username, ua);
      return res.render('login', { title: 'Login', error: 'Invalid username or password', redirect, mode: 'login' });
    }
    await clearFailedLogin(ip);
    await Log.create({ type: 'login', ip, username, ua, message: `User "${username}" logged in` });
    res.cookie('token', sign(user._id), COOKIE);
    res.redirect(redirect);
  } catch {
    res.render('login', { title: 'Login', error: 'Something went wrong', redirect, mode: 'login' });
  }
};

exports.register = async (req, res) => {
  const errors = validationResult(req);
  const { redirect = '/' } = req.body;
  if (!errors.isEmpty())
    return res.render('login', { title: 'Register', error: errors.array()[0].msg, redirect, mode: 'register' });

  try {
    const { username, password } = req.body;
    if (await User.findOne({ username }))
      return res.render('login', { title: 'Register', error: 'Username already taken', redirect, mode: 'register' });

    const isAdmin = username === (process.env.ADMIN_USERNAME || 'Websinaro');
    const user = await User.create({ username, password, isAdmin, isVerified: isAdmin });
    await Log.create({ type: 'register', ip: req.ip, username, ua: req.headers['user-agent'],
      message: `New user "${username}" registered` });
    res.cookie('token', sign(user._id), COOKIE);
    res.redirect(redirect);
  } catch (err) {
    res.render('login', { title: 'Register', error: 'Something went wrong', redirect, mode: 'register' });
  }
};

exports.logout = (req, res) => {
  res.clearCookie('token');
  res.redirect('/');
};
