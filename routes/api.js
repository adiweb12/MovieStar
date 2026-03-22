const express  = require('express');
const router   = express.Router();
const { body } = require('express-validator');
const { protect }  = require('../middleware/auth');
const rl = require('../middleware/rateLimiter');
const reviewCtrl = require('../controllers/reviewController');
const userCtrl   = require('../controllers/userController');

router.use(rl.api);

router.get('/movies',           reviewCtrl.getMovies);
router.get('/reviews/:movieId', reviewCtrl.getReviews);
router.get('/search',           userCtrl.search);         // combined movie+user search

router.post('/review',
  protect, rl.review,
  [
    body('movieId').notEmpty().isMongoId(),
    body('rating').isInt({ min:1, max:5 }).withMessage('Rating 1–5'),
    body('comment').trim().isLength({ min:5, max:1000 }).withMessage('Comment: 5–1000 chars'),
  ],
  reviewCtrl.submitReview
);

router.post('/review/:id/like', protect, reviewCtrl.likeReview);
router.post('/follow/:id',      protect, userCtrl.follow);

module.exports = router;
