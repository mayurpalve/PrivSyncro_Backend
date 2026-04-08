const mongoose = require("mongoose");

const consentSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    appId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "App",
      required: true
    },
    permissions: {
      type: [String],
      default: []
    },
    expiresAt: {
      type: Date,
      default: null
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

consentSchema.index({ userId: 1, appId: 1 }, { unique: true });

module.exports = mongoose.model("Consent", consentSchema);