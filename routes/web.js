const express = require('express');
const router  = express.Router();
const { softAuth } = require('../middleware/auth');
const { homepage, movieDetail } = require('../controllers/movieController');
const { profile }  = require('../controllers/profileController');
const User  = require('../models/User');
const Movie = require('../models/Movie');

router.get('/',             softAuth, homepage);
router.get('/movie/:id',    softAuth, movieDetail);
router.get('/profile/:username', softAuth, profile);

// Search page
router.get('/search', softAuth, async (req, res, next) => {
  try {
    const { q = '' } = req.query;
    const query = q.trim();
    let movies = [], users = [];
    if (query.length >= 1) {
      [movies, users] = await Promise.all([
        Movie.find({ title: { $regex: query, $options: 'i' } }).limit(24),
        User.find({ username: { $regex: query, $options: 'i' } })
          .select('username isVerified isAdmin followers').limit(12),
      ]);
    }
    res.render('search', {
      title: query ? `Search: ${query} – MovieStar` : 'Search – MovieStar',
      user: req.user || null,
      query, movies, users,
    });
  } catch (err) { next(err); }
});

module.exports = router;
