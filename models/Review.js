const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  movieId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Movie', required: true },
  userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
  rating:   { type: Number, required: true, min: 1, max: 5 },
  comment:  { type: String, required: true, trim: true, maxlength: 1000 },
  pinned:   { type: Boolean, default: false },
  likes:    [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  likeCount:{ type: Number, default: 0 },
}, { timestamps: true });

reviewSchema.index({ movieId: 1, userId: 1 }, { unique: true });

reviewSchema.post('save', async function () {
  try {
    const Movie = mongoose.model('Movie');
    const m = await Movie.findById(this.movieId);
    if (m) await m.updateRating();
  } catch (_) {}
});

module.exports = mongoose.model('Review', reviewSchema);
