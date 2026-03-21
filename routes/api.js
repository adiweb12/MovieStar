const express  = require('express');
const router   = express.Router();
const { body } = require('express-validator');
const { protect } = require('../middleware/auth');
const { apiLimiter, reviewLimiter } = require('../middleware/rateLimiter');
const ctrl = require('../controllers/reviewController');

router.use(apiLimiter);

router.get('/movies',               ctrl.getMovies);
router.get('/reviews/:movieId',     ctrl.getReviews);

router.post('/review',
  protect,
  reviewLimiter,
  [
    body('movieId').notEmpty().isMongoId().withMessage('Invalid movie'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1–5'),
    body('comment').trim().isLength({ min: 5, max: 1000 }).withMessage('Comment: 5–1000 characters'),
  ],
  ctrl.submitReview
);

module.exports = router;
