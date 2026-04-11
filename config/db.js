const mongoose = require("mongoose");

const dropLegacyConsentUniqueIndex = async () => {
  try {
    const collection = mongoose.connection.collection("consents");
    const indexes = await collection.indexes();
    const legacyIndex = indexes.find(
      (index) =>
        index.unique &&
        index.key &&
        index.key.userId === 1 &&
        index.key.appId === 1 &&
        index.key.dataType === 1 &&
        Object.keys(index.key).length === 3
    );

    if (legacyIndex?.name) {
      await collection.dropIndex(legacyIndex.name);
      console.log(`Dropped legacy consent unique index: ${legacyIndex.name}`);
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
