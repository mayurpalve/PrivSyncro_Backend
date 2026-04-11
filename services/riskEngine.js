const Activity = require("../models/Activity");

const DAY_MS = 24 * 60 * 60 * 1000;

const sensitivityByDataType = {
  health: 0.95,
  location: 0.9,
  contacts: 0.85,
  biometrics: 0.95,
  financial: 0.9,
  messages: 0.88,
  media: 0.8,
  social_graph: 0.82,
  profile: 0.45,
  email: 0.7
};

const getSupportedDataTypes = () => Object.keys(sensitivityByDataType);

const trustByAppId = {
  spotify: 0.8,
  google: 0.85,
  "google-fit": 0.85,
  googlefit: 0.85,
  instagram: 0.7,
  facebook: 0.68,
  twitter: 0.66,
  x: 0.66
};

const clamp01 = (value) => Math.max(0, Math.min(1, value));

const getSensitivityScore = (dataType) => {
  return sensitivityByDataType[dataType] ?? 0.6;
};

const getTrustScore = (appId) => {
  return trustByAppId[String(appId || "").toLowerCase()] ?? 0.6;
};

const getRetentionScore = (consent) => {
  if (!consent?.expiry) {
    return 1;
  }

  const remainingMs = new Date(consent.expiry).getTime() - Date.now();
  if (remainingMs <= 0) {
    return 0;
  }

  const remainingDays = remainingMs / DAY_MS;
  return clamp01(remainingDays / 90);
};

const getAccessFrequencyScore = async ({ userId, appId, dataType }) => {
  const last30Days = new Date(Date.now() - 30 * DAY_MS);
  const activityCount = await Activity.countDocuments({
    userId,
    appId,
    dataType,
    timestamp: { $gte: last30Days }
  });

  return clamp01(activityCount / 50);
};

const getAnomalyScore = async ({ userId, appId, dataType }) => {
  const now = Date.now();
  const oneDayAgo = new Date(now - DAY_MS);
  const sevenDaysAgo = new Date(now - 7 * DAY_MS);
  const thirtyDaysAgo = new Date(now - 30 * DAY_MS);

  const [last24hCount, previous6DaysCount, monthActivities] = await Promise.all([
    Activity.countDocuments({ userId, appId, dataType, timestamp: { $gte: oneDayAgo } }),
    Activity.countDocuments({
      userId,
      appId,
      dataType,
      timestamp: { $gte: sevenDaysAgo, $lt: oneDayAgo }
    }),
    Activity.find({ userId, appId, dataType, timestamp: { $gte: thirtyDaysAgo } }).select("timestamp")
  ]);

  const avgDaily = previous6DaysCount / 6;
  let anomaly = 0.1;

  if (avgDaily > 0 && last24hCount > avgDaily * 2) {
    anomaly = 0.8;
  } else if (avgDaily > 0 && last24hCount > avgDaily * 1.5) {
    anomaly = 0.6;
  }

  if (monthActivities.length > 5) {
    const nightAccesses = monthActivities.filter((item) => {
      const hour = new Date(item.timestamp).getHours();
      return hour >= 0 && hour < 5;
    }).length;

    if (nightAccesses / monthActivities.length > 0.35) {
      anomaly = Math.max(anomaly, 0.7);
    }
  }

  return clamp01(anomaly);
};

const calculateRiskScore = ({ sensitivity, frequency, retention, trust, anomaly }) => {
  return clamp01(
    0.25 * sensitivity +
      0.2 * frequency +
      0.2 * retention +
      0.2 * (1 - trust) +
      0.15 * anomaly
  );
};

const evaluatePrivacyRisk = async ({ userId, appId, dataType, consent }) => {
  const [frequency, anomaly] = await Promise.all([
    getAccessFrequencyScore({ userId, appId, dataType }),
    getAnomalyScore({ userId, appId, dataType })
  ]);

  const sensitivity = getSensitivityScore(dataType);
  const retention = getRetentionScore(consent);
  const trust = getTrustScore(appId);

  const riskScore = calculateRiskScore({
    sensitivity,
    frequency,
    retention,
    trust,
    anomaly
  });

  return {
    riskScore,
    components: {
      S: sensitivity,
      F: frequency,
      L: retention,
      T: trust,
      A: anomaly
    }
  };
};

module.exports = {
  evaluatePrivacyRisk,
  getSupportedDataTypes
};
