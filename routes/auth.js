const express  = require('express');
const router   = express.Router();
const { body } = require('express-validator');
const ctrl     = require('../controllers/authController');
const { auth: authLimiter }  = require('../middleware/rateLimiter');
const { checkIPBlock } = require('../middleware/ipBlock');

const loginRules = [
  body('username').trim().notEmpty().withMessage('Username required'),
  body('password').notEmpty().withMessage('Password required'),
];
const registerRules = [
  body('username').trim().isLength({ min:3, max:20 }).withMessage('Username: 3–20 chars')
    .matches(/^[a-zA-Z0-9_]+$/).withMessage('Letters, numbers, underscores only'),
  body('password').isLength({ min:6 }).withMessage('Password: min 6 chars'),
];

router.get('/login',     ctrl.showPage('login'));
router.get('/register',  ctrl.showPage('register'));
router.post('/login',    checkIPBlock, authLimiter, loginRules,    ctrl.login);
router.post('/register', authLimiter, registerRules, ctrl.register);
router.post('/logout',   ctrl.logout);

module.exports = router;
