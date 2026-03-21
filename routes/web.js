const express = require('express');
const router  = express.Router();
const { softAuth } = require('../middleware/auth');
const { homepage, movieDetail } = require('../controllers/movieController');
const { profile } = require('../controllers/profileController');

router.get('/',             softAuth, homepage);
router.get('/movie/:id',    softAuth, movieDetail);
router.get('/profile/:username', softAuth, profile);

module.exports = router;
