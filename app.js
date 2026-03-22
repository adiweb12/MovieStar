require('dotenv').config();

const express       = require('express');
const path          = require('path');
const cookieParser  = require('cookie-parser');
const morgan        = require('morgan');
const helmet        = require('helmet');
const xss           = require('xss-clean');
const mongoSanitize = require('express-mongo-sanitize');
const mongoose      = require('mongoose');

const connectDB     = require('./config/db');
const webRoutes     = require('./routes/web');
const authRoutes    = require('./routes/auth');
const apiRoutes     = require('./routes/api');
const adminRoutes   = require('./routes/admin');
const errorHandler  = require('./middleware/errorHandler');
const movieBaseSync = require('./services/movieBaseSync');

const app = express();

// ── Connect DB ────────────────────────────────────
connectDB();

// ── On DB ready: admin init + immediate movie sync ─
mongoose.connection.once('open', async () => {
  console.log('✅  MongoDB connected — running startup tasks…');

  // 1. Ensure admin account exists
  try {
    const User      = require('./models/User');
    const adminName = process.env.ADMIN_USERNAME || 'Websinaro';
    const adminPass = process.env.ADMIN_PASSWORD || 'Admin@1234';
    const exists    = await User.findOne({ username: adminName });
    if (!exists) {
      await User.create({ username: adminName, password: adminPass, isAdmin: true, isVerified: true });
      console.log(`✅  Admin created → login: ${adminName} / ${adminPass}`);
    } else if (!exists.isAdmin) {
      await User.updateOne({ username: adminName }, { isAdmin: true, isVerified: true });
      console.log(`✅  "${adminName}" promoted to admin`);
    }
  } catch (e) {
    console.error('Admin init error:', e.message);
  }

  // 2. Immediately pull movies from movie_base on first connect
  //    (runs in background — does NOT block the server from starting)
  if (process.env.MOVIE_BASE_URL) {
    console.log('🔄  Starting initial movie_base sync…');
    movieBaseSync.runSync()
      .then(() => console.log('✅  Initial movie_base sync complete'))
      .catch(e => console.error('❌  Initial movie_base sync failed:', e.message));
  } else {
    console.log('ℹ️   MOVIE_BASE_URL not set — skipping movie_base sync');
  }
});

// ── Trust reverse proxy (Render/Heroku) ──────────
app.set('trust proxy', 1);

// ── View engine ───────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── Security middleware ───────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
      imgSrc:     ["'self'", "data:", "https:", "http:"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],
    },
  },
}));
app.use(xss());
app.use(mongoSanitize());
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));

// ── Routes ────────────────────────────────────────
app.use('/',      webRoutes);
app.use('/auth',  authRoutes);
app.use('/api',   apiRoutes);
app.use('/admin', adminRoutes);

// ── 404 + error handler ───────────────────────────
app.use((req, res) => res.status(404).render('404', { title: '404 – Not Found' }));
app.use(errorHandler);

// ── Start recurring 3-hour sync scheduler ────────
movieBaseSync.start();

// ── Start server ──────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🎬  MovieStar → http://localhost:${PORT}`));
module.exports = app;
