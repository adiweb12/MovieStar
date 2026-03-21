const rateLimit = require('express-rate-limit');

const make = (windowMs, max, message) =>
  rateLimit({ windowMs, max, standardHeaders: true, legacyHeaders: false,
    message: { success: false, message } });

module.exports = {
  apiLimiter:    make(15 * 60 * 1000, 200, 'Too many requests – try again in 15 min'),
  reviewLimiter: make(60 * 60 * 1000,  10, 'Review limit reached – try again in an hour'),
  authLimiter:   make(15 * 60 * 1000,  10, 'Too many login attempts – wait 15 min'),
};
