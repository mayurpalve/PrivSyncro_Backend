const mongoose = require("mongoose");

const appSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true
    },
    provider: {
      type: String,
      required: true,
      trim: true
    },
    permissions: {
      type: [String],
      default: [],
      validate: {
        validator: (permissions) => permissions.length > 0,
        message: "At least one permission must be configured for an app"
      }
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("App", appSchema);