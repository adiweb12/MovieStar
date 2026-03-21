const express  = require('express');
const router   = express.Router();
const { body } = require('express-validator');
const ctrl     = require('../controllers/authController');
const { auth: authLimiter } = require('../middleware/rateLimiter');
const { checkIPBlock }      = require('../middleware/ipBlock');

const loginRules = [
  body('username').trim().notEmpty().withMessage('Username required'),
  body('password').notEmpty().withMessage('Password required'),
];
const registerRules = [
  body('username').trim()
    .isLength({ min:3, max:20 }).withMessage('Username must be 3–20 characters')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Only letters, numbers and underscores'),
  body('password').isLength({ min:6 }).withMessage('Password must be at least 6 characters'),
];

router.get('/login',           ctrl.showPage('login'));
router.get('/register',        ctrl.showPage('register'));
router.get('/check-username',  ctrl.checkUsername);          // AJAX availability check
router.post('/login',    checkIPBlock, authLimiter, loginRules,    ctrl.login);
router.post('/register', authLimiter,  registerRules, ctrl.register);
router.post('/logout',   ctrl.logout);

module.exports = router;
