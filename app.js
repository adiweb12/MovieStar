require('dotenv').config();
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🎬  MovieStar → http://localhost:${PORT}`));
module.exports = app;
