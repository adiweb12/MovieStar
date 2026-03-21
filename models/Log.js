const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
  type:    { type: String, enum: ['login','login_fail','blocked','review','register','attack'], required: true },
  ip:      String,
  username:String,
  message: String,
  ua:      String,   // user agent
}, { timestamps: true });

module.exports = mongoose.model('Log', logSchema);
