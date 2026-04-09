const { evaluatePrivacyRisk } = require("./riskEngine");
const { getDecisionFromRisk } = require("./decisionEngine");

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

const hasConditions = (conditions) => {
  if (!conditions) return false;
  if (typeof conditions === "string") return conditions.trim().length > 0;
  if (Array.isArray(conditions)) return conditions.length > 0;
  if (typeof conditions === "object") return Object.keys(conditions).length > 0;
  return false;
};

const getAdaptiveMultiplier = (components = {}) => {
  const anomaly = Number(components.A || 0);
  const frequency = Number(components.F || 0);
  const sensitivity = Number(components.S || 0);

  // Higher observed anomaly/frequency/sensitivity => stronger optimization pressure.
  return clamp01(0.4 + 0.4 * anomaly + 0.15 * frequency + 0.05 * sensitivity);
};

const getOptimizationPotential = (consent) => {
  if (!consent || consent.status !== "allowed") {
    return 0.9;
  }

  let potential = 0.1;
  if (!consent.expiry) potential += 0.25;
  if (!hasConditions(consent.conditions)) potential += 0.2;
  return clamp01(potential);
};

const getRecommendedControls = (consent, currentRisk) => {
  if (!consent || consent.status !== "allowed") {
    return ["Keep blocked unless a valid business need appears", "Require explicit re-consent to re-enable"];
  }

  const controls = [];
  if (!consent.expiry) controls.push("Add finite expiry (for example 30 days)");
  if (!hasConditions(consent.conditions)) controls.push("Add contextual conditions (time, scope, or purpose)");
  if (currentRisk > 0.7) controls.push("Escalate to manual review before next access");
  if (currentRisk > 0.5) controls.push("Reduce granted scope to minimum required fields");
  if (controls.length === 0) controls.push("Current controls are healthy; continue periodic review");
  return controls;
};

const getPriority = (riskReduction, currentRisk) => {
  if (currentRisk > 0.75 || riskReduction > 0.22) return "HIGH";
  if (currentRisk > 0.55 || riskReduction > 0.12) return "MEDIUM";
  return "LOW";
};

const evaluateGovernanceItem = async ({ userId, consent }) => {
  const baselineConsent = {
    status: "allowed",
    expiry: null,
    conditions: null
  };

  const baseline = await evaluatePrivacyRisk({
    userId,
    appId: consent.appId,
    dataType: consent.dataType,
    consent: baselineConsent
  });

  const currentRisk = hasActiveConsent(consent)
    ? (
        await evaluatePrivacyRisk({
          userId,
          appId: consent.appId,
          dataType: consent.dataType,
          consent
        })
      ).riskScore
    : 0.08;

  const adaptiveMultiplier = getAdaptiveMultiplier(baseline.components);
  const optimizationPotential = getOptimizationPotential(consent);
  const optimizedRisk = clamp01(
    hasActiveConsent(consent)
      ? currentRisk * (1 - optimizationPotential * adaptiveMultiplier * 0.6)
      : 0.05
  );

  const riskReduction = clamp01(baseline.riskScore - optimizedRisk);
  const recommendedControls = getRecommendedControls(consent, currentRisk);

  return {
    appId: consent.appId,
    dataType: consent.dataType,
    consentStatus: hasActiveConsent(consent) ? "allowed" : "denied",
    baselineRisk: Number(baseline.riskScore.toFixed(4)),
    currentRisk: Number(currentRisk.toFixed(4)),
    optimizedRisk: Number(optimizedRisk.toFixed(4)),
    riskReduction: Number(riskReduction.toFixed(4)),
    decisionBefore: getDecisionFromRisk(currentRisk).decision,
    decisionAfter: getDecisionFromRisk(optimizedRisk).decision,
    priority: getPriority(riskReduction, currentRisk),
    adaptiveMultiplier: Number(adaptiveMultiplier.toFixed(4)),
    recommendedControls
  };
};

const summarizeGovernance = ({ evaluations }) => {
  if (!evaluations.length) {
    return {
      overall: {
        baselineRisk: 0,
        governedRisk: 0,
        optimizedRisk: 0,
        measurablePrivacyImprovementPct: 0,
        controlCoveragePct: 0
      },
      recommendations: []
    };
  }

  const baselineRisk = evaluations.reduce((sum, item) => sum + item.baselineRisk, 0) / evaluations.length;
  const governedRisk = evaluations.reduce((sum, item) => sum + item.currentRisk, 0) / evaluations.length;
  const optimizedRisk = evaluations.reduce((sum, item) => sum + item.optimizedRisk, 0) / evaluations.length;
  const controlCoverage =
    evaluations.filter((item) => item.consentStatus === "allowed" && item.recommendedControls.length <= 2).length /
    evaluations.length;

  const improvement =
    baselineRisk > 0 ? ((baselineRisk - optimizedRisk) / baselineRisk) * 100 : 0;

  return {
    overall: {
      baselineRisk: Number(baselineRisk.toFixed(4)),
      governedRisk: Number(governedRisk.toFixed(4)),
      optimizedRisk: Number(optimizedRisk.toFixed(4)),
      measurablePrivacyImprovementPct: Number(Math.max(0, improvement).toFixed(2)),
      controlCoveragePct: Number((controlCoverage * 100).toFixed(2))
    },
    recommendations: [...evaluations].sort((a, b) => b.riskReduction - a.riskReduction)
  };
};

module.exports = {
  evaluateGovernanceItem,
  summarizeGovernance
};

