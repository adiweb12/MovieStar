const rateLimit = require('express-rate-limit');

const make = (windowMs, max, msg) =>
  rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false,
    message: { success: false, message: msg } });

module.exports = {
  api:    make(15 * 60 * 1000, 200, 'Too many requests'),
  auth:   make(15 * 60 * 1000,  10, 'Too many login attempts – wait 15 min'),
  review: make(60 * 60 * 1000,  15, 'Review limit reached'),
  admin:  make(15 * 60 * 1000, 100, 'Too many admin requests'),
};
