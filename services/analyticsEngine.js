const Activity = require("../models/Activity");
const { evaluatePrivacyRisk } = require("./riskEngine");

const DAY_MS = 24 * 60 * 60 * 1000;
const clamp01 = (value) => Math.max(0, Math.min(1, value));

const hasActiveConsent = (consent) => {
  if (!consent || consent.status !== "allowed") {
    return false;
  }

  if (!consent.expiry) {
    return true;
  }

  return new Date(consent.expiry).getTime() > Date.now();
};

const getAnomalyTrafficScore = ({ last24h, prev24h, nightRatio }) => {
  const growth = prev24h > 0 ? (last24h - prev24h) / prev24h : last24h > 4 ? 1 : 0;
  return clamp01(0.6 * clamp01(growth / 2) + 0.4 * clamp01(nightRatio / 0.4));
};

const buildAiInsights = (appAnalyses, overall) => {
  if (!appAnalyses.length) {
    return ["No policy data available yet. Create at least one consent policy to start adaptive analytics."];
  }

  const insights = [];
  const topRisk = [...appAnalyses].sort((a, b) => b.averageRisk - a.averageRisk)[0];
  const topAnomaly = [...appAnalyses].sort((a, b) => b.anomalyTrafficScore - a.anomalyTrafficScore)[0];

  if (topRisk && topRisk.averageRisk > 0.65) {
    insights.push(
      `Highest risk app is ${topRisk.appId} (${topRisk.averageRisk.toFixed(
        2
      )}). Tighten scope or add expiry/conditions for its high-risk data types.`
    );
  } else {
    insights.push("Overall risk posture is stable. Continue periodic policy review and event monitoring.");
  }

  if (topAnomaly && topAnomaly.anomalyTrafficScore > 0.6) {
    insights.push(
      `Traffic anomaly detected for ${topAnomaly.appId} (score ${topAnomaly.anomalyTrafficScore.toFixed(
        2
      )}). Investigate sudden spikes and unusual-time access patterns.`
    );
  } else {
    insights.push("No severe traffic anomaly detected across monitored apps.");
  }

  if (overall.highRiskPolicies > 0) {
    insights.push(
      `${overall.highRiskPolicies} high-risk policy path(s) detected. Prioritize controls for these paths first.`
    );
  }

  return insights;
};

const buildAnalysisBoard = async ({ userId, consents }) => {
  const grouped = consents.reduce((acc, consent) => {
    if (!acc[consent.appId]) {
      acc[consent.appId] = [];
    }
    acc[consent.appId].push(consent);
    return acc;
  }, {});

  const appAnalyses = [];

  for (const [appId, appConsents] of Object.entries(grouped)) {
    const now = Date.now();
    const oneDayAgo = new Date(now - DAY_MS);
    const twoDaysAgo = new Date(now - 2 * DAY_MS);
    const thirtyDaysAgo = new Date(now - 30 * DAY_MS);
    const sevenDaysAgo = new Date(now - 7 * DAY_MS);

    const [last24h, prev24h, last7d, monthActivities, suspiciousTransfers, riskEvaluations] = await Promise.all([
      Activity.countDocuments({ userId, appId, timestamp: { $gte: oneDayAgo } }),
      Activity.countDocuments({ userId, appId, timestamp: { $gte: twoDaysAgo, $lt: oneDayAgo } }),
      Activity.countDocuments({ userId, appId, timestamp: { $gte: sevenDaysAgo } }),
      Activity.find({ userId, appId, timestamp: { $gte: thirtyDaysAgo } }).select("timestamp"),
      Activity.countDocuments({
        userId,
        appId,
        timestamp: { $gte: thirtyDaysAgo },
        transferFlags: { $exists: true, $ne: [] }
      }),
      Promise.all(
        appConsents.map(async (consent) => {
          if (!hasActiveConsent(consent)) {
            return { dataType: consent.dataType, riskScore: 1 };
          }
          const risk = await evaluatePrivacyRisk({
            userId,
            appId,
            dataType: consent.dataType,
            consent
          });
          return { dataType: consent.dataType, riskScore: risk.riskScore };
        })
      )
    ]);

    const averageRisk =
      riskEvaluations.reduce((sum, item) => sum + item.riskScore, 0) / Math.max(riskEvaluations.length, 1);

    const highRiskDataTypes = riskEvaluations
      .filter((item) => item.riskScore > 0.7)
      .map((item) => item.dataType);

    const nightCount = monthActivities.filter((item) => {
      const hour = new Date(item.timestamp).getHours();
      return hour >= 0 && hour < 5;
    }).length;
    const nightRatio = monthActivities.length ? nightCount / monthActivities.length : 0;
    const anomalyTrafficScore = getAnomalyTrafficScore({ last24h, prev24h, nightRatio });

    appAnalyses.push({
      appId,
      averageRisk: Number(averageRisk.toFixed(4)),
      anomalyTrafficScore: Number(anomalyTrafficScore.toFixed(4)),
      traffic: {
        last24h,
        prev24h,
        last7d
      },
      suspiciousTransfers,
      highRiskDataTypes,
      monitoredDataTypes: riskEvaluations.map((item) => item.dataType)
    });
  }

  appAnalyses.sort((a, b) => b.averageRisk - a.averageRisk || b.anomalyTrafficScore - a.anomalyTrafficScore);

  const overall = {
    totalApps: appAnalyses.length,
    averageRiskAcrossApps: appAnalyses.length
      ? Number((appAnalyses.reduce((sum, app) => sum + app.averageRisk, 0) / appAnalyses.length).toFixed(4))
      : 0,
    averageAnomalyTraffic: appAnalyses.length
      ? Number((appAnalyses.reduce((sum, app) => sum + app.anomalyTrafficScore, 0) / appAnalyses.length).toFixed(4))
      : 0,
    highRiskPolicies: appAnalyses.reduce((sum, app) => sum + app.highRiskDataTypes.length, 0),
    suspiciousTransfers: appAnalyses.reduce((sum, app) => sum + app.suspiciousTransfers, 0)
  };

  return {
    title: "Data & Risk Analysis Board",
    subtitle: "Unified app-wise risk, anomaly traffic detection, and AI-driven governance insights.",
    overall,
    appAnalyses,
    aiInsights: buildAiInsights(appAnalyses, overall)
  };
};

module.exports = {
  buildAnalysisBoard
};
