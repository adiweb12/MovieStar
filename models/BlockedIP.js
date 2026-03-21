const mongoose = require('mongoose');

const blockedIPSchema = new mongoose.Schema({
  ip:        { type: String, required: true, unique: true },
  attempts:  { type: Number, default: 0 },
  blockedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date },  // null = permanent
}, { timestamps: true });

module.exports = mongoose.model('BlockedIP', blockedIPSchema);
