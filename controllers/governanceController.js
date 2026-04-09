const Consent = require("../models/Consent");
const { evaluateGovernanceItem, summarizeGovernance } = require("../services/governanceEngine");

exports.getGovernanceSummary = async (req, res) => {
  try {
    const consents = await Consent.find({ userId: req.user.id }).sort({ updatedAt: -1 });

    if (!consents.length) {
      return res.status(200).json({
        title: "Adaptive, Risk-Aware, Optimized Governance Model",
        subtitle: "Enabling measurable privacy improvement and intelligent consent control.",
        ...summarizeGovernance({ evaluations: [] })
      });
    }

    const evaluations = await Promise.all(
      consents.map((consent) => evaluateGovernanceItem({ userId: req.user.id, consent }))
    );

    return res.status(200).json({
      title: "Adaptive, Risk-Aware, Optimized Governance Model",
      subtitle: "Enabling measurable privacy improvement and intelligent consent control.",
      ...summarizeGovernance({ evaluations })
    });
  } catch (error) {
    console.error("Governance summary error:", error.message);
    return res.status(500).json({ message: "Failed to build governance summary" });
  }
};

