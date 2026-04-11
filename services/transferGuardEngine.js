const expectedDataByApp = {
  spotify: ["profile", "email", "media"],
  google: ["profile", "email", "location", "health", "activity"],
  instagram: ["profile", "media", "email", "social_graph"],
  facebook: ["profile", "email", "contacts", "social_graph"],
  twitter: ["profile", "messages", "social_graph", "email"],
  x: ["profile", "messages", "social_graph", "email"]
};

const payloadThresholdKbByType = {
  location: 64,
  health: 512,
  contacts: 256,
  email: 128,
  profile: 128,
  media: 2048,
  social_graph: 512,
  messages: 512
};

const clamp01 = (value) => Math.max(0, Math.min(1, value));

const analyzeTransferRisk = ({ appId, dataType, payloadSizeKb = 0, location }) => {
  const normalizedApp = String(appId || "").toLowerCase();
  const normalizedType = String(dataType || "").toLowerCase();
  const flags = [];

  const expectedData = expectedDataByApp[normalizedApp] || [];
  if (expectedData.length && !expectedData.includes(normalizedType)) {
    flags.push("UNNECESSARY_DATA_TYPE");
  }

  const payloadThreshold = payloadThresholdKbByType[normalizedType] || 256;
  if (payloadSizeKb > payloadThreshold) {
    flags.push("EXCESSIVE_PAYLOAD");
  }

  if (normalizedType === "location") {
    const hasLatLng = Number.isFinite(location?.lat) && Number.isFinite(location?.lng);
    if (!hasLatLng) {
      flags.push("LOCATION_MISSING_COORDINATES");
    } else {
      const { lat, lng } = location;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        flags.push("LOCATION_OUT_OF_RANGE");
      }
    }
  }

  const anomalyScore = clamp01(
    flags.includes("UNNECESSARY_DATA_TYPE") * 0.5 +
      flags.includes("EXCESSIVE_PAYLOAD") * 0.3 +
      (flags.includes("LOCATION_MISSING_COORDINATES") || flags.includes("LOCATION_OUT_OF_RANGE")) * 0.2
  );

  return {
    transferFlags: flags,
    transferAnomalyScore: anomalyScore
  };
};

module.exports = {
  analyzeTransferRisk
};

