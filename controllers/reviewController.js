const { validationResult } = require('express-validator');
const Movie  = require('../models/Movie');
const Review = require('../models/Review');

exports.getReviews = async (req, res, next) => {
  try {
    const reviews = await Review.find({ movieId: req.params.movieId })
      .populate('userId', 'username')
      .sort('-createdAt')
      .limit(50);
    res.json({ success: true, data: reviews });
  } catch (err) { next(err); }
};

exports.submitReview = async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ success: false, message: errors.array()[0].msg });

  try {
    const { movieId, rating, comment } = req.body;

    if (!(await Movie.findById(movieId)))
      return res.status(404).json({ success: false, message: 'Movie not found' });

    // Enforce one review per user per movie
    if (await Review.findOne({ movieId, userId: req.user._id }))
      return res.status(400).json({ success: false, message: 'You have already reviewed this movie' });

    const review = await Review.create({
      movieId, rating: parseInt(rating), comment,
      userId: req.user._id,
    });

    const populated = await review.populate('userId', 'username');
    res.status(201).json({ success: true, data: populated });
  } catch (err) { next(err); }
};

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
