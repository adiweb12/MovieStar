const mongoose = require('mongoose');

const movieSchema = new mongoose.Schema(
  {
    title:       { type: String, required: true, trim: true },
    description: { type: String, required: true },
    image:       { type: String, required: true },
    language:    { type: String, required: true },   // Tamil, Telugu, Malayalam, Kannada, Hindi…
    type: {
      type:    String,
      enum:    ['released', 'upcoming', 'trending'],
      default: 'released',
    },
    director:     { type: String, default: '' },
    cast:         [{ type: String }],
    genre:        [{ type: String }],
    duration:     { type: Number },   // minutes
    releaseDate:  { type: Date },
    averageRating: { type: Number, default: 0 },
    reviewCount:   { type: Number, default: 0 },
  },
  { timestamps: true }
);

/** Recompute averageRating and reviewCount from the Review collection */
movieSchema.methods.updateRating = async function () {
  const Review = mongoose.model('Review');
  const agg = await Review.aggregate([
    { $match: { movieId: this._id } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  this.averageRating = agg.length ? Math.round(agg[0].avg * 10) / 10 : 0;
  this.reviewCount   = agg.length ? agg[0].count : 0;
  await this.save();
};

module.exports = mongoose.model('Movie', movieSchema);
