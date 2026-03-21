const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema(
  {
    movieId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Movie', required: true },
    userId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
    rating:   { type: Number, required: true, min: 1, max: 5 },
    comment:  { type: String, required: true, trim: true, maxlength: 1000 },
  },
  { timestamps: true }
);

// Enforce one review per user per movie
reviewSchema.index({ movieId: 1, userId: 1 }, { unique: true });

// After save → update the movie's denormalised rating fields
reviewSchema.post('save', async function () {
  try {
    const Movie = mongoose.model('Movie');
    const movie = await Movie.findById(this.movieId);
    if (movie) await movie.updateRating();
  } catch (_) {}
});

module.exports = mongoose.model('Review', reviewSchema);
