const Consent = require("../models/Consent");

const normalizeConsent = (consent) => {
  const output = consent.toObject();
  const isExpired = output.expiry ? new Date(output.expiry).getTime() < Date.now() : false;

  return {
    ...output,
    isExpired,
    effectiveStatus: isExpired ? "denied" : output.status
  };
};

exports.createConsent = async (req, res) => {
  try {
    const { appId, dataType, status = "allowed", expiry = null, conditions = null } = req.body;

    if (!appId || !dataType) {
      return res.status(400).json({ message: "appId and dataType are required" });
    }

    if (!["allowed", "denied"].includes(status)) {
      return res.status(400).json({ message: "status must be 'allowed' or 'denied'" });
    }

    const consent = await Consent.create({
      userId: req.user.id,
      appId,
      dataType: dataType.toLowerCase(),
      status,
      expiry,
      conditions
    });

    return res.status(201).json(normalizeConsent(consent));
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({
        message: "A legacy unique index is blocking multiple policies. Restart backend to apply index migration."
      });
    }
    console.error("Create consent error:", error.message);
    return res.status(500).json({ message: "Failed to create consent" });
  }
};

exports.getConsents = async (req, res) => {
  try {
    const { appId, dataType, status } = req.query;
    const query = { userId: req.user.id };

    if (appId) query.appId = appId;
    if (dataType) query.dataType = String(dataType).toLowerCase();
    if (status) query.status = status;

    const consents = await Consent.find(query).sort({ updatedAt: -1 });
    return res.status(200).json(consents.map(normalizeConsent));
  } catch (error) {
    console.error("Get consent error:", error.message);
    return res.status(500).json({ message: "Failed to fetch consents" });
  }
};

exports.revokeConsent = async (req, res) => {
  try {
    const { id } = req.params;

    const consent = await Consent.findOneAndUpdate(
      { _id: id, userId: req.user.id },
      { status: "denied" },
      { new: true }
    );

    if (!consent) {
      return res.status(404).json({ message: "Consent not found" });
    }

    return res.status(200).json({ message: "Consent revoked", consent: normalizeConsent(consent) });
  } catch (error) {
    console.error("Revoke consent error:", error.message);
    return res.status(500).json({ message: "Failed to revoke consent" });
  }
};
