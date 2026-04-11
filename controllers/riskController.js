const Consent = require("../models/Consent");
const { evaluatePrivacyRisk, getSupportedDataTypes } = require("../services/riskEngine");

const hasActiveConsent = (consent) => {
  if (!consent || consent.status !== "allowed") {
    return false;
  }

  if (!consent.expiry) {
    return true;
  }

  return new Date(consent.expiry).getTime() > Date.now();
};

exports.getRiskByApp = async (req, res) => {
  try {
    const { appId } = req.params;
    const { dataType } = req.query;

    if (dataType) {
      const consent = await Consent.findOne({
        userId: req.user.id,
        appId,
        dataType: dataType.toLowerCase()
      }).sort({ updatedAt: -1 });

      if (!consent) {
        return res.status(404).json({ message: "Consent not found for requested dataType" });
      }

      const risk = await evaluatePrivacyRisk({
        userId: req.user.id,
        appId,
        dataType: consent.dataType,
        consent
      });

      return res.status(200).json({
        appId,
        dataType: consent.dataType,
        consentStatus: hasActiveConsent(consent) ? "allowed" : "denied",
        ...risk
      });
    }

    const allConsents = await Consent.find({ userId: req.user.id, appId }).sort({ updatedAt: -1 });
    const latestByDataType = new Map();
    for (const consent of allConsents) {
      if (!latestByDataType.has(consent.dataType)) {
        latestByDataType.set(consent.dataType, consent);
      }
    }
    const consents = Array.from(latestByDataType.values());
    if (consents.length === 0) {
      return res.status(404).json({ message: "No consents found for this app" });
    }

    const evaluations = await Promise.all(
      consents.map(async (consent) => ({
        dataType: consent.dataType,
        consentStatus: hasActiveConsent(consent) ? "allowed" : "denied",
        ...(await evaluatePrivacyRisk({
          userId: req.user.id,
          appId,
          dataType: consent.dataType,
          consent
        }))
      }))
    );

    const overallRiskScore =
      evaluations.reduce((sum, item) => sum + item.riskScore, 0) / evaluations.length;

    return res.status(200).json({
      appId,
      overallRiskScore: Number(overallRiskScore.toFixed(4)),
      risks: evaluations
    });
  } catch (error) {
    console.error("Risk evaluation error:", error.message);
    return res.status(500).json({ message: "Failed to evaluate risk" });
  }
};

exports.getRiskMeta = async (_req, res) => {
  return res.status(200).json({
    supportedDataTypes: getSupportedDataTypes()
  });
};
