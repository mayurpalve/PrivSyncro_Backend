const Activity = require("../models/Activity");
const Consent = require("../models/Consent");
const { evaluatePrivacyRisk } = require("../services/riskEngine");
const { getDecisionFromRisk } = require("../services/decisionEngine");
const { analyzeTransferRisk } = require("../services/transferGuardEngine");

const hasActiveConsent = (consent) => {
  if (!consent || consent.status !== "allowed") {
    return false;
  }

  if (!consent.expiry) {
    return true;
  }

  return new Date(consent.expiry).getTime() > Date.now();
};

exports.makeDecision = async (req, res) => {
  try {
    const {
      appId,
      dataType,
      duration = 0,
      timestamp,
      payloadSizeKb = 0,
      location = null
    } = req.body;

    if (!appId || !dataType) {
      return res.status(400).json({ message: "appId and dataType are required" });
    }

    const normalizedDataType = dataType.toLowerCase();
    const consent = await Consent.findOne({
      userId: req.user.id,
      appId,
      dataType: normalizedDataType
    }).sort({ updatedAt: -1 });

    if (!hasActiveConsent(consent)) {
      const blockedDecision = {
        decision: "BLOCK_AND_ALERT",
        recommendedAction: "No active consent. Block this access request.",
        indicator: "RED"
      };

      return res.status(200).json({
        appId,
        dataType: normalizedDataType,
        riskScore: 1,
        components: {
          S: 1,
          F: 1,
          L: 1,
          T: 0,
          A: 1
        },
        ...blockedDecision,
        reason: "Consent missing, denied, or expired"
      });
    }

    const { riskScore, components } = await evaluatePrivacyRisk({
      userId: req.user.id,
      appId,
      dataType: normalizedDataType,
      consent
    });

    const decisionPayload = getDecisionFromRisk(riskScore);
    const transferAnalysis = analyzeTransferRisk({
      appId,
      dataType: normalizedDataType,
      payloadSizeKb,
      location
    });

    await Activity.create({
      userId: req.user.id,
      appId,
      dataType: normalizedDataType,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      duration,
      payloadSizeKb,
      location,
      transferFlags: transferAnalysis.transferFlags,
      transferAnomalyScore: transferAnalysis.transferAnomalyScore
    });

    return res.status(200).json({
      appId,
      dataType: normalizedDataType,
      riskScore,
      components,
      payloadSizeKb,
      location,
      transferFlags: transferAnalysis.transferFlags,
      transferAnomalyScore: transferAnalysis.transferAnomalyScore,
      ...decisionPayload
    });
  } catch (error) {
    console.error("Decision error:", error.message);
    return res.status(500).json({ message: "Failed to evaluate decision" });
  }
};

exports.getDecisionSummary = async (req, res) => {
  try {
    const allConsents = await Consent.find({ userId: req.user.id }).sort({ updatedAt: -1 });
    const latestByPolicyKey = new Map();
    for (const consent of allConsents) {
      const key = `${consent.appId}::${consent.dataType}`;
      if (!latestByPolicyKey.has(key)) {
        latestByPolicyKey.set(key, consent);
      }
    }
    const consents = Array.from(latestByPolicyKey.values());

    if (consents.length === 0) {
      return res.status(200).json({
        appSummaries: [],
        totals: {
          apps: 0,
          allowed: 0,
          limited: 0,
          blocked: 0
        }
      });
    }

    const groupedByApp = consents.reduce((acc, consent) => {
      if (!acc[consent.appId]) {
        acc[consent.appId] = [];
      }
      acc[consent.appId].push(consent);
      return acc;
    }, {});

    const appSummaries = [];

    for (const [appId, appConsents] of Object.entries(groupedByApp)) {
      const evaluations = await Promise.all(
        appConsents.map(async (consent) => {
          if (!hasActiveConsent(consent)) {
            return {
              dataType: consent.dataType,
              riskScore: 1,
              components: { S: 1, F: 1, L: 1, T: 0, A: 1 },
              ...getDecisionFromRisk(1)
            };
          }

          const risk = await evaluatePrivacyRisk({
            userId: req.user.id,
            appId,
            dataType: consent.dataType,
            consent
          });

          return {
            dataType: consent.dataType,
            ...risk,
            ...getDecisionFromRisk(risk.riskScore)
          };
        })
      );

      const overallRiskScore =
        evaluations.reduce((sum, item) => sum + item.riskScore, 0) / evaluations.length;
      const overallDecision = getDecisionFromRisk(overallRiskScore);

      appSummaries.push({
        appId,
        overallRiskScore: Number(overallRiskScore.toFixed(4)),
        overallDecision: overallDecision.decision,
        indicator: overallDecision.indicator,
        recommendedAction: overallDecision.recommendedAction,
        evaluations
      });
    }

    const totals = appSummaries.reduce(
      (acc, summary) => {
        if (summary.overallDecision === "ALLOW") acc.allowed += 1;
        else if (summary.overallDecision === "LIMITED_ACCESS") acc.limited += 1;
        else acc.blocked += 1;
        return acc;
      },
      {
        apps: appSummaries.length,
        allowed: 0,
        limited: 0,
        blocked: 0
      }
    );

    return res.status(200).json({
      appSummaries,
      totals
    });
  } catch (error) {
    console.error("Decision summary error:", error.message);
    return res.status(500).json({ message: "Failed to build dashboard summary" });
  }
};
