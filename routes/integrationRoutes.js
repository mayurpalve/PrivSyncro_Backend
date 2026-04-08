const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const {
  getConnectUrl,
  handleOAuthCallback,
  getIntegrationHealth,
  getLinkedAccounts,
  disconnectIntegration
} = require("../controllers/integrationController");

const router = express.Router();

router.get("/callback/:provider", handleOAuthCallback);

router.use(authMiddleware);
router.get("/health", getIntegrationHealth);
router.post("/:provider/connect", getConnectUrl);
router.get("/linked", getLinkedAccounts);
router.delete("/:provider", disconnectIntegration);

module.exports = router;
