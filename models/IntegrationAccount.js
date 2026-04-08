const mongoose = require("mongoose");

const integrationAccountSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    provider: {
      type: String,
      required: true,
      enum: ["spotify", "google"],
      index: true
    },
    providerUserId: {
      type: String,
      default: ""
    },
    email: {
      type: String,
      default: ""
    },
    displayName: {
      type: String,
      default: ""
    },
    accessToken: {
      type: String,
      required: true
    },
    refreshToken: {
      type: String,
      default: ""
    },
    scope: {
      type: [String],
      default: []
    },
    tokenExpiresAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

integrationAccountSchema.index({ userId: 1, provider: 1 }, { unique: true });

module.exports = mongoose.model("IntegrationAccount", integrationAccountSchema);