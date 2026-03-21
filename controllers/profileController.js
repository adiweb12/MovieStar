const User   = require('../models/User');
const Review = require('../models/Review');
const Movie  = require('../models/Movie');

exports.profile = async (req, res, next) => {
  try {
    const profile = await User.findOne({ username: req.params.username })
      .populate('following', 'username isVerified')
      .populate('followers', 'username isVerified');
    if (!profile) return res.status(404).render('404', { title: 'User Not Found' });

    // Get all reviews by this user, with movie info
    const reviews = await Review.find({ userId: profile._id })
      .populate('movieId', 'title image language averageRating')
      .sort('-createdAt')
      .limit(50);

    const isOwnProfile  = req.user && req.user._id.equals(profile._id);
    const isFollowing   = req.user
      ? req.user.following?.some(id => id.equals(profile._id))
      : false;

    res.render('profile', {
      title:      `${profile.username} – MovieStar`,
      user:       req.user || null,
      profile,
      reviews,
      isOwnProfile,
      isFollowing,
      followerCount:  profile.followers.length,
      followingCount: profile.following.length,
      reviewCount:    reviews.length,
    });
  } catch (err) { next(err); }
};
