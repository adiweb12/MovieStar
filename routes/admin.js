const express = require('express');
const router  = express.Router();
const { adminOnly } = require('../middleware/auth');
const { admin: adminLimiter } = require('../middleware/rateLimiter');
const { single: uploadSingle } = require('../config/multer');
const ctrl    = require('../controllers/adminController');

router.use(adminOnly, adminLimiter);

router.get('/',                    ctrl.dashboard);
router.get('/movies',              ctrl.movieList);
router.post('/movies/add',         uploadSingle('image'), ctrl.addMovie);
router.post('/movies/delete/:id',  ctrl.deleteMovie);
router.get('/movies/edit/:id',     ctrl.editMovie);
router.post('/movies/edit/:id',    uploadSingle('image'), ctrl.updateMovie);
router.get('/users',               ctrl.userList);
router.post('/users/search',       ctrl.searchUser);
router.post('/users/verify/:id',   ctrl.verifyUser);
router.get('/logs',                ctrl.logs);
router.get('/export',              ctrl.exportDB);
router.post('/announcement',       ctrl.setAnnouncement);
router.post('/review/:id/pin',     ctrl.pinReview);
router.post('/ip/unblock/:ip',     ctrl.unblockIP);

// Manual movie_base sync trigger
router.post('/sync-movies', async (req, res) => {
  try {
    const sync = require('../services/movieBaseSync');
    sync.runSync().catch(e => console.error('Manual sync error:', e));
    res.redirect('/admin?success=Movie+sync+started+in+background');
  } catch(e) {
    res.redirect('/admin?error=Sync+failed:+'+encodeURIComponent(e.message));
  }
});

// Force re-pull from movie_base (gets latest Cloudinary URLs)
router.post('/repull-movies', async (req, res) => {
  try {
    const { pullMovies } = require('../services/movieBaseSync');
    pullMovies(false).then(r => console.log('[Admin] Re-pull done:', r))
      .catch(e => console.error('[Admin] Re-pull error:', e));
    res.redirect('/admin?success=Re-pull+started+—+fetching+latest+Cloudinary+URLs');
  } catch(e) {
    res.redirect('/admin?error='+encodeURIComponent(e.message));
  }
});

module.exports = router;
