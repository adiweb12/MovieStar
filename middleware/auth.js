const jwt  = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ success: false, message: 'Login required' });
    const dec  = jwt.verify(token, process.env.JWT_SECRET);
    req.user   = await User.findById(dec.id);
    if (!req.user) return res.status(401).json({ success: false, message: 'User not found' });
    next();
  } catch {
    res.status(401).json({ success: false, message: 'Invalid or expired session' });
  }
};

const adminOnly = async (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (!token) return res.redirect('/auth/login?redirect=/admin');
    const dec  = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(dec.id);
    if (!user || !user.isAdmin) return res.status(403).render('404', { title: 'Access Denied' });
    req.user = user;
    next();
  } catch {
    res.redirect('/auth/login?redirect=/admin');
  }
};

const softAuth = async (req, res, next) => {
  try {
    const token = req.cookies.token;
    if (token) {
      const dec = jwt.verify(token, process.env.JWT_SECRET);
      req.user  = await User.findById(dec.id);
    }
  } catch (_) {}
  next();
};

module.exports = { protect, adminOnly, softAuth };
