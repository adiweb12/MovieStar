const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const Log  = require('../models/Log');
const { recordFailedLogin, clearFailedLogin } = require('../middleware/ipBlock');

const COOKIE = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge:   7 * 24 * 60 * 60 * 1000,
};

const sign = id => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });

const getValidUser = async (token) => {
  if (!token) return null;
  try {
    const dec = jwt.verify(token, process.env.JWT_SECRET);
    return await User.findById(dec.id) || null;
  } catch { return null; }
};

const getSuggestions = async (base) => {
  const tries = [
    `${base}_${Math.floor(Math.random()*900+100)}`,
    `${base}${Math.floor(Math.random()*90+10)}`,
    `${base}_official`,
    `the_${base}`,
    `${base}_fan`,
  ];
  const out = [];
  for (const t of tries) {
    if (!(await User.findOne({ username: t }))) out.push(t);
    if (out.length >= 3) break;
  }
  return out;
};

exports.showPage = mode => async (req, res) => {
  const user = await getValidUser(req.cookies.token);
  if (user) return res.redirect(req.query.redirect || '/');
  res.render('login', {
    title: mode === 'register' ? 'Register – MovieStar' : 'Login – MovieStar',
    user: null, error: null, suggestions: [],
    redirect: req.query.redirect || '/', mode,
  });
};

exports.login = async (req, res) => {
  const errors = validationResult(req);
  const { redirect = '/' } = req.body;
  const ip = req.ip; const ua = req.headers['user-agent'];
  if (!errors.isEmpty())
    return res.render('login', { title:'Login', user:null, error:errors.array()[0].msg, suggestions:[], redirect, mode:'login' });
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      await recordFailedLogin(ip, username, ua);
      return res.render('login', { title:'Login', user:null, error:'Invalid username or password', suggestions:[], redirect, mode:'login' });
    }
    await clearFailedLogin(ip);
    await Log.create({ type:'login', ip, username, ua, message:`"${username}" logged in` });
    res.cookie('token', sign(user._id), COOKIE);
    res.redirect(redirect);
  } catch(err) {
    console.error(err);
    res.render('login', { title:'Login', user:null, error:'Something went wrong', suggestions:[], redirect, mode:'login' });
  }
};

exports.register = async (req, res) => {
  const errors = validationResult(req);
  const { redirect = '/' } = req.body;
  const ip = req.ip; const ua = req.headers['user-agent'];
  if (!errors.isEmpty())
    return res.render('login', { title:'Register', user:null, error:errors.array()[0].msg, suggestions:[], redirect, mode:'register' });
  try {
    const { username, password } = req.body;
    if (await User.findOne({ username })) {
      const suggestions = await getSuggestions(username);
      return res.render('login', { title:'Register', user:null,
        error:`"${username}" is already taken. Try one of these:`,
        suggestions, redirect, mode:'register' });
    }
    const adminName = process.env.ADMIN_USERNAME || 'Websinaro';
    const isAdmin   = username === adminName;
    const user      = await User.create({ username, password, isAdmin, isVerified: isAdmin });
    await Log.create({ type:'register', ip, username, ua, message:`"${username}" registered` });
    res.cookie('token', sign(user._id), COOKIE);
    res.redirect(redirect);
  } catch(err) {
    console.error(err);
    res.render('login', { title:'Register', user:null, error:'Something went wrong', suggestions:[], redirect, mode:'register' });
  }
};

exports.logout = (req, res) => {
  res.clearCookie('token', { httpOnly:true, sameSite:'strict' });
  res.redirect('/');
};

exports.checkUsername = async (req, res) => {
  try {
    const { username } = req.query;
    if (!username || username.length < 3) return res.json({ available:false, suggestions:[] });
    const taken       = await User.findOne({ username });
    const suggestions = taken ? await getSuggestions(username) : [];
    res.json({ available: !taken, suggestions });
  } catch { res.json({ available:false, suggestions:[] }); }
};
