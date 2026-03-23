const Movie        = require('../models/Movie');
const Review       = require('../models/Review');
const Announcement = require('../models/Announcement');

exports.homepage = async (req, res, next) => {
  try {
    // "Latest" = released movies sorted by releaseDate desc (most recent first)
    // "Upcoming" = future release date OR type=upcoming
    // A movie from movie_base may have type="released" but releaseDate in the future
    // so we catch upcoming by BOTH type field AND future release date

    const now = new Date();

    const [trending, malayalam, tamil, telugu, kannada, latest, upcoming, announcement] =
      await Promise.all([
        // Trending: any type marked trending
        Movie.find({ type: 'trending' })
          .sort('-releaseDate').limit(16),

        // Language shelves: released + trending, sorted newest first
        Movie.find({ language: /malayalam/i, type: { $ne: 'upcoming' } })
          .sort('-releaseDate').limit(16),
        Movie.find({ language: /tamil/i,     type: { $ne: 'upcoming' } })
          .sort('-releaseDate').limit(16),
        Movie.find({ language: /telugu/i,    type: { $ne: 'upcoming' } })
          .sort('-releaseDate').limit(16),
        Movie.find({ language: /kannada/i,   type: { $ne: 'upcoming' } })
          .sort('-releaseDate').limit(16),

        // Latest released: released OR trending, sorted by release date desc
        Movie.find({
          type: { $in: ['released', 'trending'] },
        }).sort('-releaseDate').limit(16),

        // Upcoming: type=upcoming OR release date is in the future
        Movie.find({
          $or: [
            { type: 'upcoming' },
            { releaseDate: { $gt: now } },
          ]
        }).sort('releaseDate').limit(16),

        Announcement.findOne({ active: true }).sort('-createdAt'),
      ]);

    res.render('index', {
      title: 'MovieStar – South Indian Cinema',
      user:  req.user || null,
      trending,
      malayalam,
      tamil,
      telugu,
      kannada,
      recentlyReleased: latest,
      upcoming,
      announcement: announcement || null,
    });
  } catch (err) { next(err); }
};

exports.movieDetail = async (req, res, next) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (!movie) return res.status(404).render('404', { title: '404' });

    const sortMode = req.query.sort === 'new' ? 'new' : 'top';
    const sortObj  = sortMode === 'new'
      ? { pinned: -1, createdAt: -1 }
      : { pinned: -1, likeCount: -1, createdAt: -1 };

    const reviews = await Review.find({ movieId: movie._id })
      .populate('userId', 'username isVerified isAdmin')
      .sort(sortObj)
      .limit(100);

    const userReview = req.user
      ? await Review.findOne({ movieId: movie._id, userId: req.user._id })
      : null;

    const enriched = reviews.map(r => {
      const obj       = r.toObject();
      obj.userLiked   = req.user ? r.likes.some(id => id.equals(req.user._id)) : false;
      obj.isFollowing = req.user && r.userId
        ? req.user.following?.some(id => id.equals(r.userId._id))
        : false;
      return obj;
    });

    res.render('movie', {
      title:    `${movie.title} – MovieStar`,
      user:     req.user || null,
      movie, reviews: enriched, userReview, sortMode,
    });
  } catch (err) { next(err); }
};
