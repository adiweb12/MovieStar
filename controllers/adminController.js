const Movie        = require('../models/Movie');
const User         = require('../models/User');
const Review       = require('../models/Review');
const Log          = require('../models/Log');
const Announcement = require('../models/Announcement');
const BlockedIP    = require('../models/BlockedIP');
const path         = require('path');
const fs           = require('fs');

// GET /admin
exports.dashboard = async (req, res, next) => {
  try {
    const [movieCount, userCount, reviewCount, logs, announcement, blockedIPs] =
      await Promise.all([
        Movie.countDocuments(),
        User.countDocuments(),
        Review.countDocuments(),
        Log.find().sort('-createdAt').limit(50),
        Announcement.findOne({ active: true }).sort('-createdAt'),
        BlockedIP.find().sort('-createdAt').limit(20),
      ]);
    res.render('admin/dashboard', {
      title: 'Admin – MovieStar',
      user: req.user,
      movieCount, userCount, reviewCount, logs, announcement, blockedIPs,
      success: req.query.success ? req.query.success.replace(/\+/g, ' ') : null,
      error:   req.query.error   ? req.query.error.replace(/\+/g, ' ')   : null,
    });
  } catch (err) { next(err); }
};

// GET /admin/movies
exports.movieList = async (req, res, next) => {
  try {
    const movies = await Movie.find().sort('-createdAt');
    res.render('admin/movies', {
      title: 'Manage Movies', user: req.user, movies,
      success: req.query.success ? req.query.success.replace(/\+/g, ' ') : null,
      error:   req.query.error   ? req.query.error.replace(/\+/g, ' ')   : null,
    });
  } catch (err) { next(err); }
};

// POST /admin/movies/add
exports.addMovie = async (req, res, next) => {
  try {
    const { title, description, language, type, director, cast, genre, releaseDate, duration } = req.body;
    if (!req.file) return res.redirect('/admin/movies?error=Image+required');
    const image = `/images/movies/${req.file.filename}`;
    await Movie.create({
      title, description, language, type: type || 'released',
      director: director || '',
      cast:  cast  ? cast.split(',').map(s => s.trim()).filter(Boolean)  : [],
      genre: genre ? genre.split(',').map(s => s.trim()).filter(Boolean) : [],
      releaseDate: releaseDate ? new Date(releaseDate) : null,
      duration:    duration    ? parseInt(duration)    : null,
      image,
    });
    res.redirect('/admin/movies?success=Movie+added+successfully');
  } catch (err) { next(err); }
};

// POST /admin/movies/delete/:id
exports.deleteMovie = async (req, res, next) => {
  try {
    const movie = await Movie.findById(req.params.id);
    if (movie) {
      const imgPath = path.join(__dirname, '..', 'public', movie.image);
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
      await Movie.deleteOne({ _id: movie._id });
      await Review.deleteMany({ movieId: movie._id });
    }
    res.redirect('/admin/movies?success=Movie+deleted');
  } catch (err) { next(err); }
};

// GET /admin/users
exports.userList = async (req, res, next) => {
  try {
    const users = await User.find().select('+password').sort('-createdAt');
    res.render('admin/users', {
      title: 'Manage Users', user: req.user, users, query: '',
      success: req.query.success ? req.query.success.replace(/\+/g, ' ') : null,
      error:   null,
    });
  } catch (err) { next(err); }
};

// POST /admin/users/verify/:id
exports.verifyUser = async (req, res, next) => {
  try {
    const target = await User.findById(req.params.id);
    if (target) { target.isVerified = !target.isVerified; await target.save(); }
    res.redirect('/admin/users?success=User+updated');
  } catch (err) { next(err); }
};

// POST /admin/users/search
exports.searchUser = async (req, res, next) => {
  try {
    const { q } = req.body;
    const users = await User.find({
      $or: [
        { username: { $regex: q, $options: 'i' } },
        { uniqueId:  { $regex: q, $options: 'i' } },
      ]
    }).select('+password');
    res.render('admin/users', {
      title: 'User Search', user: req.user, users, query: q,
      success: null, error: null,
    });
  } catch (err) { next(err); }
};

// GET /admin/logs
exports.logs = async (req, res, next) => {
  try {
    const { type } = req.query;
    const filter = type ? { type } : {};
    const logs = await Log.find(filter).sort('-createdAt').limit(200);
    res.render('admin/logs', {
      title: 'Logs', user: req.user, logs, filterType: type || 'all',
    });
  } catch (err) { next(err); }
};

// GET /admin/export
exports.exportDB = async (req, res, next) => {
  try {
    const [movies, users, reviews, logs] = await Promise.all([
      Movie.find().lean(), User.find().lean(),
      Review.find().lean(), Log.find().lean(),
    ]);
    res.setHeader('Content-Disposition', 'attachment; filename="moviestar-db.json"');
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify({ exportedAt: new Date(), movies, users, reviews, logs }, null, 2));
  } catch (err) { next(err); }
};

// POST /admin/announcement
exports.setAnnouncement = async (req, res, next) => {
  try {
    const { message, active } = req.body;
    await Announcement.deleteMany({});
    if (message && message.trim())
      await Announcement.create({ message: message.trim(), active: active === 'on' });
    res.redirect('/admin?success=Announcement+updated');
  } catch (err) { next(err); }
};

// POST /admin/review/:id/pin
exports.pinReview = async (req, res, next) => {
  try {
    const review = await Review.findById(req.params.id);
    if (review) { review.pinned = !review.pinned; await review.save(); }
    res.json({ success: true, pinned: review ? review.pinned : false });
  } catch (err) { next(err); }
};

// POST /admin/ip/unblock/:id
exports.unblockIP = async (req, res, next) => {
  try {
    await BlockedIP.deleteOne({ ip: req.params.ip });
    res.redirect('/admin?success=IP+unblocked');
  } catch (err) { next(err); }
};
