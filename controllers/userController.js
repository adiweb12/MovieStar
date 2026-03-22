const User = require('../models/User');

// POST /api/follow/:id
exports.follow = async (req, res, next) => {
  try {
    const targetId = req.params.id;
    if (targetId === req.user._id.toString())
      return res.status(400).json({ success: false, message: "Can't follow yourself" });

    const target = await User.findById(targetId);
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });

    // Re-fetch current user to get up-to-date following array
    const currentUser = await User.findById(req.user._id);
    const isFollowing  = currentUser.following.some(id => id.equals(targetId));

    if (isFollowing) {
      await User.findByIdAndUpdate(req.user._id, { $pull: { following: targetId } });
      await User.findByIdAndUpdate(targetId,     { $pull: { followers: req.user._id } });
      const updated = await User.findById(targetId);
      return res.json({ success: true, following: false, followers: updated.followers.length });
    } else {
      await User.findByIdAndUpdate(req.user._id, { $addToSet: { following: targetId } });
      await User.findByIdAndUpdate(targetId,     { $addToSet: { followers: req.user._id } });
      const updated = await User.findById(targetId);
      return res.json({ success: true, following: true, followers: updated.followers.length });
    }
  } catch (err) { next(err); }
};

// GET /api/search - search movies AND users
exports.search = async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 1)
      return res.json({ success: true, movies: [], users: [] });

    const Movie = require('../models/Movie');
    const [movies, users] = await Promise.all([
      Movie.find({ title: { $regex: q, $options: 'i' } }).limit(10),
      User.find({ username: { $regex: q, $options: 'i' } }).select('username isVerified isAdmin followers').limit(8),
    ]);
    res.json({ success: true, movies, users });
  } catch (err) { next(err); }
};

// GET /api/people/:userId?type=followers|following
exports.people = async (req, res, next) => {
  try {
    const { type = 'followers' } = req.query;
    const user = await User.findById(req.params.userId)
      .populate(type === 'following' ? 'following' : 'followers', 'username isVerified isAdmin followers');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    const users = type === 'following' ? user.following : user.followers;
    res.json({ success: true, users: users || [] });
  } catch (err) { next(err); }
};
