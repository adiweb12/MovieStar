const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  message: { type: String, required: true, trim: true, maxlength: 500 },
  active:  { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Announcement', announcementSchema);
