const { validationResult } = require('express-validator');
const Movie  = require('../models/Movie');
const Review = require('../models/Review');

// GET /api/movies
exports.getMovies = async (req, res, next) => {
  try {
    const { language, type, search, page = 1, limit = 24 } = req.query;
    const filter = {};
    if (language) filter.language = { $regex: language, $options: 'i' };
    if (type)     filter.type     = type;
    if (search)   filter.title    = { $regex: search,   $options: 'i' };
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [movies, total] = await Promise.all([
      Movie.find(filter).sort('-releaseDate').skip(skip).limit(parseInt(limit)),
      Movie.countDocuments(filter),
    ]);
    res.json({ success: true, data: movies, total, page: parseInt(page) });
  } catch (err) { next(err); }
};

// GET /api/reviews/:movieId
exports.getReviews = async (req, res, next) => {
  try {
    const reviews = await Review.find({ movieId: req.params.movieId })
      .populate('userId', 'username isVerified isAdmin')
      .sort({ pinned: -1, likeCount: -1, createdAt: -1 });
    res.json({ success: true, data: reviews });
  } catch (err) { next(err); }
};

// POST /api/review
exports.submitReview = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ success: false, message: errors.array()[0].msg });
  try {
    const { movieId, rating, comment } = req.body;
    if (!(await Movie.findById(movieId)))
      return res.status(404).json({ success: false, message: 'Movie not found' });
    if (await Review.findOne({ movieId, userId: req.user._id }))
      return res.status(400).json({ success: false, message: 'You already reviewed this movie' });
    const review = await (await Review.create({
      movieId, rating: parseInt(rating), comment, userId: req.user._id
    })).populate('userId', 'username isVerified isAdmin');
    res.status(201).json({ success: true, data: review });
  } catch (err) { next(err); }
};

// POST /api/review/:id/like
exports.likeReview = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: 'Review not found' });
    const uid    = req.user._id;
    const liked  = review.likes.some(id => id.equals(uid));
    if (liked) {
      review.likes = review.likes.filter(id => !id.equals(uid));
    } else {
      review.likes.push(uid);
    }
    review.likeCount = review.likes.length;
    await review.save();
    res.json({ success: true, liked: !liked, likeCount: review.likeCount });
  } catch (err) { next(err); }
};
