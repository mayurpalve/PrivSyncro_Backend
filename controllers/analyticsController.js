const Consent = require("../models/Consent");
const { buildAnalysisBoard } = require("../services/analyticsEngine");

exports.getAnalysisBoard = async (req, res) => {
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
    const board = await buildAnalysisBoard({ userId: req.user.id, consents });
    return res.status(200).json(board);
  } catch (error) {
    console.error("Analysis board error:", error.message);
    return res.status(500).json({ message: "Failed to build analysis board" });
  }
};
