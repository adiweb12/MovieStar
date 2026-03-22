# 🎬 MovieStar v3

Production-ready South Indian Movie Review App — Node.js + Express + EJS + MongoDB.

---

## 🚀 Quick Start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# Edit .env → set MONGO_URI and JWT_SECRET

# 3. Seed 50 movies (generates local SVG posters)
npm run seed

# 4. Start
npm start          # production
npm run dev        # development (nodemon)
```

Open → **https://moviestar-vz2t.onrender.com/**

---

## 🔑 Admin Access

Register with the username **`Websinaro`** (set in `.env` as `ADMIN_USERNAME`).  
This account is automatically granted admin + verified status.

Admin panel → **http://localhost:3000/admin**

---

## 📁 Structure

```
moviestar/
├── app.js
├── config/        db.js, multer.js
├── models/        Movie, User, Review, Log, BlockedIP, Announcement
├── controllers/   movie, auth, review, user, admin
├── routes/        web, auth, api, admin
├── middleware/    auth, ipBlock, rateLimiter, errorHandler
├── views/         index, movie, login, 404
│   ├── partials/  header, footer, movieCard
│   └── admin/     dashboard, movies, users, logs, _sidebar
├── public/
│   ├── css/style.css
│   ├── js/main.js
│   └── images/    (posters stored here by multer)
└── data/seedMovies.js
```

---

## ✅ Features

| Feature | Status |
|---|---|
| Netflix-style dark UI | ✅ |
| 50 South Indian movies | ✅ |
| Local image upload (multer) | ✅ |
| JWT auth (HTTP-only cookie) | ✅ |
| bcrypt password hashing | ✅ |
| Admin panel | ✅ |
| Add/delete movies with poster upload | ✅ |
| Verify users by username/UniqueID | ✅ |
| View all users + hashed passwords | ✅ |
| Pin reviews (admin) | ✅ |
| Reviews: pinned → liked → newest | ✅ |
| Like reviews | ✅ |
| Follow/unfollow users | ✅ |
| IP blocking after 5 failed logins | ✅ |
| Security logs (login, fail, attack) | ✅ |
| Export full DB as JSON | ✅ |
| Pin announcement on homepage | ✅ |
| Helmet + XSS clean + mongo-sanitize | ✅ |
| Rate limiting | ✅ |
| Responsive mobile design | ✅ |

---

## 🌐 Deploy to Render

1. Push to GitHub
2. New Web Service → connect repo
3. Build: `npm install` · Start: `npm start`
4. Add env vars in Render dashboard
5. Open Render shell → `npm run seed`
