const mongoose = require("mongoose");

const consentSchema = new mongoose.Schema(
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
    status: {
      type: String,
      enum: ["allowed", "denied"],
      required: true,
      default: "allowed"
    },
    expiry: {
      type: Date,
      default: null
    },
    conditions: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    }
  },
  {
    timestamps: true
  }
);

consentSchema.index({ userId: 1, appId: 1, dataType: 1, updatedAt: -1 });

module.exports = mongoose.model("Consent", consentSchema);
