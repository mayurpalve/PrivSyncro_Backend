const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    appId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    dataType: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      index: true
    },
    duration: {
      type: Number,
      required: true,
      min: 0,
      default: 0
    },
    payloadSizeKb: {
      type: Number,
      min: 0,
      default: 0
    },
    location: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
      accuracyMeters: { type: Number, min: 0, default: null }
    },
    transferFlags: {
      type: [String],
      default: []
    },
    transferAnomalyScore: {
      type: Number,
      min: 0,
      max: 1,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

activitySchema.index({ userId: 1, appId: 1, dataType: 1, timestamp: -1 });

module.exports = mongoose.model("Activity", activitySchema);
