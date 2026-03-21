const Movie        = require('../models/Movie');
const Review       = require('../models/Review');
const Announcement = require('../models/Announcement');

exports.homepage = async (req, res, next) => {
  try {
    const [trending, malayalam, tamil, telugu, kannada, recentlyReleased, upcoming, announcement] =
      await Promise.all([
        Movie.find({ type: 'trending' }).sort('-releaseDate').limit(12),
        Movie.find({ language: /malayalam/i, type: { $ne: 'upcoming' } }).sort('-releaseDate').limit(12),
        Movie.find({ language: /tamil/i,     type: { $ne: 'upcoming' } }).sort('-releaseDate').limit(12),
        Movie.find({ language: /telugu/i,    type: { $ne: 'upcoming' } }).sort('-releaseDate').limit(12),
        Movie.find({ language: /kannada/i,   type: { $ne: 'upcoming' } }).sort('-releaseDate').limit(12),
        Movie.find({ type: 'released' }).sort('-releaseDate').limit(12),
        Movie.find({ type: 'upcoming' }).sort('releaseDate').limit(12),
        Announcement.findOne({ active: true }).sort('-createdAt'),
      ]);

    res.render('index', {
      title: 'MovieStar – South Indian Cinema',
      user: req.user || null,
      trending, malayalam, tamil, telugu, kannada, recentlyReleased, upcoming,
      announcement: announcement || null,
    });
  } catch (err) { next(err); }
};

exports.movieDetail = async (req, res, next) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).render('404', { title: '404' });

    // Sort: pinned first, then by likeCount desc, then newest
    const reviews = await Review.find({ movieId: movie._id })
      .populate('userId', 'username isVerified isAdmin')
      .sort({ pinned: -1, likeCount: -1, createdAt: -1 })
      .limit(100);

    const userReview = req.user
      ? await Review.findOne({ movieId: movie._id, userId: req.user._id })
      : null;

    // For each review, check if current user liked it / is following author
    const enriched = reviews.map(r => {
      const obj      = r.toObject();
      obj.userLiked  = req.user ? r.likes.some(id => id.equals(req.user._id)) : false;
      obj.isFollowing= req.user && r.userId
        ? req.user.following?.some(id => id.equals(r.userId._id))
        : false;
      return obj;
    });

    res.render('movie', {
      title: `${movie.title} – MovieStar`,
      user: req.user || null,
      movie, reviews: enriched, userReview,
    });
  } catch (err) { next(err); }
};
