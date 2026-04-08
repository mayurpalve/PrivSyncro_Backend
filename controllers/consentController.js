const Consent = require("../models/Consent");
const App = require("../models/App");

const hasConsentExpired = (expiresAt) => {
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
};

exports.createConsent = async (req, res) => {
  try {
    const { appId, permissions = [], expiresAt = null } = req.body;

    if (!appId) {
      return res.status(400).json({ message: "appId is required" });
    }

    const app = await App.findById(appId);
    if (!app) {
      return res.status(404).json({ message: "App not found" });
    }

    const invalidPermissions = permissions.filter(
      (permission) => !app.permissions.includes(permission)
    );

    if (invalidPermissions.length > 0) {
      return res.status(400).json({
        message: "Some permissions are invalid for this app",
        invalidPermissions
      });
    }

    const existingConsent = await Consent.findOne({ userId: req.user.id, appId });
    if (existingConsent) {
      return res.status(409).json({ message: "Consent already exists for this app" });
    }

    const consent = await Consent.create({
      userId: req.user.id,
      appId,
      permissions,
      expiresAt,
      isActive: true
    });

    const populatedConsent = await consent.populate("appId", "name provider permissions");

    return res.status(201).json(populatedConsent);
  } catch (error) {
    console.error("Create consent error:", error.message);
    return res.status(500).json({ message: "Failed to create consent" });
  }
};

exports.getConsents = async (req, res) => {
  try {
    const consents = await Consent.find({ userId: req.user.id })
      .populate("appId", "name provider permissions")
      .sort({ updatedAt: -1 });

    const normalizedConsents = consents.map((consent) => {
      const consentObject = consent.toObject();
      const expired = hasConsentExpired(consentObject.expiresAt);

      return {
        ...consentObject,
        isActive: consentObject.isActive && !expired,
        isExpired: expired
      };
    });

    return res.status(200).json(normalizedConsents);
  } catch (error) {
    console.error("Get consents error:", error.message);
    return res.status(500).json({ message: "Failed to fetch consents" });
  }
};

exports.updateConsent = async (req, res) => {
  try {
    const { id } = req.params;
    const { permissions, expiresAt, isActive } = req.body;

    const consent = await Consent.findOne({ _id: id, userId: req.user.id }).populate(
      "appId",
      "name provider permissions"
    );

    if (!consent) {
      return res.status(404).json({ message: "Consent not found" });
    }

    if (Array.isArray(permissions)) {
      const invalidPermissions = permissions.filter(
        (permission) => !consent.appId.permissions.includes(permission)
      );

      if (invalidPermissions.length > 0) {
        return res.status(400).json({
          message: "Some permissions are invalid for this app",
          invalidPermissions
        });
      }

      consent.permissions = permissions;
    }

    if (typeof isActive === "boolean") {
      consent.isActive = isActive;
    }

    if (typeof expiresAt !== "undefined") {
      consent.expiresAt = expiresAt;
    }

    await consent.save();

    const updatedConsent = await Consent.findById(consent._id).populate(
      "appId",
      "name provider permissions"
    );

    return res.status(200).json(updatedConsent);
  } catch (error) {
    console.error("Update consent error:", error.message);
    return res.status(500).json({ message: "Failed to update consent" });
  }
};

exports.deleteConsent = async (req, res) => {
  try {
    const { id } = req.params;

    const consent = await Consent.findOne({ _id: id, userId: req.user.id });

    if (!consent) {
      return res.status(404).json({ message: "Consent not found" });
    }

    consent.isActive = false;
    consent.permissions = [];
    await consent.save();

    return res.status(200).json({ message: "Consent revoked successfully" });
  } catch (error) {
    console.error("Delete consent error:", error.message);
    return res.status(500).json({ message: "Failed to revoke consent" });
  }
};
