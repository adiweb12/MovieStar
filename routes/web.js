const express = require('express');
const router  = express.Router();
const { softAuth } = require('../middleware/auth');
const { homepage, movieDetail } = require('../controllers/movieController');

router.get('/',           softAuth, homepage);
router.get('/movie/:id',  softAuth, movieDetail);

module.exports = router;
