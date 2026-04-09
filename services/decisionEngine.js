const getDecisionFromRisk = (riskScore) => {
  if (riskScore <= 0.5) {
    return {
      decision: "ALLOW",
      recommendedAction: "Continue access under current consent settings.",
      indicator: "GREEN"
    };
  }

  if (riskScore <= 0.7) {
    return {
      decision: "LIMITED_ACCESS",
      recommendedAction: "Restrict access duration or reduce shared data types.",
      indicator: "YELLOW"
    };
  }

  return {
    decision: "BLOCK_AND_ALERT",
    recommendedAction: "Block app access and notify user immediately.",
    indicator: "RED"
  };
};

module.exports = {
  getDecisionFromRisk
};