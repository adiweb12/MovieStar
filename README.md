# 🎬 MovieStar v2

A production-ready, Netflix-style South Indian movie review web application.

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment
```bash
cp .env.example .env
```
Edit `.env` and set:
| Variable | Description |
|---|---|
| `MONGO_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Any long random string |
| `PORT` | 3000 (default) |
| `NODE_ENV` | `development` or `production` |

### 3. Seed the database (50 movies)
```bash
npm run seed
```

### 4. Start the app
```bash
npm start          # production
npm run dev        # development with auto-reload
```

Open → **http://localhost:3000**

---

## 📁 Project Structure

```
moviestar/
├── app.js                  # Entry point
├── config/
│   └── db.js               # MongoDB connection
├── models/
│   ├── Movie.js
│   ├── User.js
│   └── Review.js
├── controllers/
│   ├── movieController.js
│   ├── authController.js
│   └── reviewController.js
├── routes/
│   ├── web.js
│   ├── auth.js
│   └── api.js
├── middleware/
│   ├── auth.js             # JWT protect + softAuth
│   ├── rateLimiter.js      # express-rate-limit configs
│   └── errorHandler.js
├── views/
│   ├── index.ejs
│   ├── movie.ejs
│   ├── login.ejs
│   ├── 404.ejs
│   └── partials/
│       ├── header.ejs
│       ├── footer.ejs
│       └── movieCard.ejs
├── public/
│   ├── css/style.css
│   ├── js/main.js
│   └── images/placeholder.svg
└── data/
    └── seedMovies.js       # 50-movie dataset
```

---

## 🔐 Security Features

- **Helmet** – secure HTTP headers
- **xss-clean** – XSS attack prevention
- **express-mongo-sanitize** – NoSQL injection prevention
- **express-rate-limit** – spam / brute-force protection
- **bcryptjs** – password hashing (cost factor 12)
- **JWT** – stored in HTTP-only cookies (7-day expiry)
- **express-validator** – server-side input validation
- **Duplicate review prevention** – unique compound index

---

## 🌐 Deploy to Render

1. Push code to GitHub
2. Create **New Web Service** on [render.com](https://render.com)
3. Set **Build Command**: `npm install`
4. Set **Start Command**: `npm start`
5. Add environment variables in Render dashboard
6. After first deploy, run the seed: open the Render shell → `npm run seed`

---

## ✅ Features Checklist

- [x] 50 South Indian movies (Tamil, Telugu, Malayalam, Kannada, Hindi)
- [x] Homepage sections: Trending, Malayalam, Tamil, Telugu, Recent, Upcoming
- [x] Movie detail page with reviews
- [x] Star rating + review form
- [x] Login / Register
- [x] JWT authentication (HTTP-only cookie)
- [x] One review per user per movie
- [x] Average rating auto-calculated
- [x] Reviews sorted by latest
- [x] Live search
- [x] Filter by language / type
- [x] Rate limiting
- [x] Fully responsive (mobile-first)
- [x] Dark OTT theme
