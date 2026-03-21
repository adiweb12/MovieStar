const User = require('../models/User');

// POST /api/follow/:id
exports.follow = async (req, res, next) => {
  try {
    const targetId = req.params.id;
    if (targetId === req.user._id.toString())
      return res.status(400).json({ success: false, message: "Can't follow yourself" });

    const target = await User.findById(targetId);
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });

    const isFollowing = req.user.following.some(id => id.equals(targetId));
    if (isFollowing) {
      await User.findByIdAndUpdate(req.user._id, { $pull: { following: targetId } });
      await User.findByIdAndUpdate(targetId,     { $pull: { followers: req.user._id } });
      return res.json({ success: true, following: false,
        followers: target.followers.length - 1 });
    } else {
      await User.findByIdAndUpdate(req.user._id, { $addToSet: { following: targetId } });
      await User.findByIdAndUpdate(targetId,     { $addToSet: { followers: req.user._id } });
      return res.json({ success: true, following: true,
        followers: target.followers.length + 1 });
    }
  } catch (err) { next(err); }
};
