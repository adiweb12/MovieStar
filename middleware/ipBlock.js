const BlockedIP   = require('../models/BlockedIP');
const Log         = require('../models/Log');

const MAX_FAILS   = 5;     // block after 5 fails
const BLOCK_HOURS = 2;

/** Middleware: reject if IP is currently blocked */
const checkIPBlock = async (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  try {
    const rec = await BlockedIP.findOne({ ip });
    if (rec) {
      if (!rec.expiresAt || rec.expiresAt > new Date()) {
        await Log.create({ type: 'blocked', ip, message: 'Blocked IP attempted access', ua: req.headers['user-agent'] });
        return res.status(403).json({ success: false, message: 'Your IP has been blocked due to suspicious activity.' });
      }
      // expired block – remove it
      await BlockedIP.deleteOne({ ip });
    }
  } catch (_) {}
  next();
};

/** Call after a failed login */
const recordFailedLogin = async (ip, username, ua) => {
  try {
    await Log.create({ type: 'login_fail', ip, username, ua, message: `Failed login for "${username}"` });
    const rec = await BlockedIP.findOneAndUpdate(
      { ip },
      { $inc: { attempts: 1 }, $setOnInsert: { ip } },
      { upsert: true, new: true }
    );
    if (rec.attempts >= MAX_FAILS && !rec.expiresAt) {
      const expiresAt = new Date(Date.now() + BLOCK_HOURS * 3600 * 1000);
      await BlockedIP.updateOne({ ip }, { expiresAt });
      await Log.create({ type: 'attack', ip, username, ua,
        message: `IP blocked after ${rec.attempts} failed attempts` });
    }
  } catch (_) {}
};

/** Call after successful login (clear fail count) */
const clearFailedLogin = async (ip) => {
  try { await BlockedIP.deleteOne({ ip }); } catch (_) {}
};

module.exports = { checkIPBlock, recordFailedLogin, clearFailedLogin };
