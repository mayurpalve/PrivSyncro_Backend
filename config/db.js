const mongoose = require("mongoose");

const dropLegacyConsentUniqueIndex = async () => {
  try {
    const collection = mongoose.connection.collection("consents");
    const indexes = await collection.indexes();
    const legacyUniqueIndexes = indexes.filter((index) => {
      if (!index?.unique || !index?.key) {
        return false;
      }
      if (index.name === "_id_") {
        return false;
      }

      const hasUserId = Object.prototype.hasOwnProperty.call(index.key, "userId");
      const hasAppId = Object.prototype.hasOwnProperty.call(index.key, "appId");
      return hasUserId && hasAppId;
    });

    for (const index of legacyUniqueIndexes) {
      await collection.dropIndex(index.name);
      console.log(`Dropped legacy consent unique index: ${index.name}`);
    }
  } catch (error) {
    console.warn("Consent index migration skipped:", error.message);
  }
};

const connectDB = async () => {
  try {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is not defined in environment variables");
    }

    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000
    });
    await dropLegacyConsentUniqueIndex();
    console.log("MongoDB connected");
  } catch (error) {
    console.error("Database connection failed:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
