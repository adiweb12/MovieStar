const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username:   { type: String, required: true, unique: true, trim: true, minlength: 3, maxlength: 20 },
  password:   { type: String, required: true, select: false },
  isAdmin:    { type: Boolean, default: false },
  isVerified: { type: Boolean, default: false },
  uniqueId:   { type: String, unique: true, sparse: true }, // for admin verify lookup
  following:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  followers:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  loginAttempts: { type: Number, default: 0 },
  lockUntil:     { type: Date },
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password  = await bcrypt.hash(this.password, 12);
  // generate a unique ID for verification
  if (!this.uniqueId) this.uniqueId = 'USR-' + Date.now().toString(36).toUpperCase();
  next();
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.virtual('followingCount').get(function () { return this.following.length; });
userSchema.virtual('followerCount').get(function ()  { return this.followers.length; });

module.exports = mongoose.model('User', userSchema);
