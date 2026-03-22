require('dotenv').config();
// ── Auto-create admin after DB connects ──────────
const mongoose = require('mongoose');
mongoose.connection.once('open', async () => {
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
      console.log(`✅  Existing "${adminName}" promoted to admin`);
    }
  } catch (e) { console.error('Admin init:', e.message); }
});
const express      = require('express');
const path         = require('path');
const cookieParser = require('cookie-parser');
const morgan       = require('morgan');
const helmet       = require('helmet');
const xss          = require('xss-clean');
const mongoSanitize= require('express-mongo-sanitize');

const connectDB    = require('./config/db');
const webRoutes    = require('./routes/web');
const authRoutes   = require('./routes/auth');
const apiRoutes    = require('./routes/api');
const adminRoutes  = require('./routes/admin');
const errorHandler = require('./middleware/errorHandler');

const app = express();
connectDB();

// Trust Render/Heroku/nginx reverse proxy — fixes rate-limit X-Forwarded-For error
app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

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

app.use('/',      webRoutes);
app.use('/auth',  authRoutes);
app.use('/api',   apiRoutes);
app.use('/admin', adminRoutes);

app.use((req, res) => res.status(404).render('404', { title: '404 – Not Found' }));
app.use(errorHandler);

// Start movie_base sync (only if MOVIE_BASE_URL is set)
movieBaseSync.start();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🎬  MovieStar → http://localhost:${PORT}`));
module.exports = app;
