const express = require('express');
const router  = express.Router();
const { adminOnly } = require('../middleware/auth');
const { admin: adminLimiter } = require('../middleware/rateLimiter');
const upload  = require('../config/multer');
const ctrl    = require('../controllers/adminController');

router.use(adminOnly, adminLimiter);

router.get('/',                    ctrl.dashboard);
router.get('/movies',              ctrl.movieList);
router.post('/movies/add',         upload.single('image'), ctrl.addMovie);
router.post('/movies/delete/:id',  ctrl.deleteMovie);
router.get('/users',               ctrl.userList);
router.post('/users/search',       ctrl.searchUser);
router.post('/users/verify/:id',   ctrl.verifyUser);
router.get('/logs',                ctrl.logs);
router.get('/export',              ctrl.exportDB);
router.post('/announcement',       ctrl.setAnnouncement);
router.post('/review/:id/pin',     ctrl.pinReview);
router.post('/ip/unblock/:ip',     ctrl.unblockIP);

module.exports = router;
