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
    }
  },
  {
    timestamps: true
  }
);

activitySchema.index({ userId: 1, appId: 1, dataType: 1, timestamp: -1 });

module.exports = mongoose.model("Activity", activitySchema);