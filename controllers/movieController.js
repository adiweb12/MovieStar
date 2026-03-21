const Movie  = require('../models/Movie');
const Review = require('../models/Review');

// ── Homepage ──────────────────────────────────────────────
exports.homepage = async (req, res, next) => {
  try {
    const [trending, malayalam, tamil, telugu, recentlyReleased, upcoming] =
      await Promise.all([
        Movie.find({ type: 'trending' }).sort('-releaseDate').limit(12),
        Movie.find({ language: /malayalam/i, type: { $in: ['released','trending'] } }).sort('-releaseDate').limit(12),
        Movie.find({ language: /tamil/i,     type: { $in: ['released','trending'] } }).sort('-releaseDate').limit(12),
        Movie.find({ language: /telugu/i,    type: { $in: ['released','trending'] } }).sort('-releaseDate').limit(12),
        Movie.find({ type: 'released' }).sort('-releaseDate').limit(12),
        Movie.find({ type: 'upcoming' }).sort('releaseDate').limit(12),
      ]);

    res.render('index', {
      title: 'MovieStar – South Indian Cinema Hub',
      user: req.user || null,
      trending, malayalam, tamil, telugu, recentlyReleased, upcoming,
    });
  } catch (err) { next(err); }
};

// ── Movie detail ──────────────────────────────────────────
exports.movieDetail = async (req, res, next) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).render('404', { title: 'Movie Not Found' });

    const reviews = await Review.find({ movieId: movie._id })
      .populate('userId', 'username')
      .sort('-createdAt')
      .limit(50);

    const userReview = req.user
      ? await Review.findOne({ movieId: movie._id, userId: req.user._id })
      : null;

    res.render('movie', {
      title:  `${movie.title} – MovieStar`,
      user:    req.user || null,
      movie, reviews, userReview,
    });
  } catch (err) { next(err); }
};
