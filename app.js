require('dotenv').config();
const express    = require('express');
const path       = require('path');
const cookieParser = require('cookie-parser');
const morgan     = require('morgan');
const helmet     = require('helmet');
const xssClean   = require('xss-clean');
const mongoSanitize = require('express-mongo-sanitize');

const connectDB      = require('./config/db');
const webRoutes      = require('./routes/web');
const apiRoutes      = require('./routes/api');
const authRoutes     = require('./routes/auth');
const errorHandler   = require('./middleware/errorHandler');

const app = express();

// ── Database ──────────────────────────────────────────────
connectDB();

// ── View engine ───────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Security middleware ────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      styleSrc:    ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc:     ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc:      ["'self'", "data:", "https:", "http:"],
      scriptSrc:   ["'self'", "'unsafe-inline'"],
    },
  },
}));
app.use(xssClean());           // sanitise req.body / req.query / req.params
app.use(mongoSanitize());      // strip $ and . from user input

// ── Body / cookies ────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// ── Static files ──────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Logging ───────────────────────────────────────────────
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

// ── Routes ────────────────────────────────────────────────
app.use('/', webRoutes);
app.use('/auth', authRoutes);
app.use('/api', apiRoutes);

// ── 404 ───────────────────────────────────────────────────
app.use((req, res) => res.status(404).render('404', { title: '404 – Page Not Found' }));

// ── Global error handler ──────────────────────────────────
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🎬  MovieStar running → http://localhost:${PORT}`));

module.exports = app;
