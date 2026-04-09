const express = require("express");
const { createConsent, getConsents, revokeConsent } = require("../controllers/consentController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware);

router.post("/", createConsent);
router.get("/", getConsents);
router.patch("/:id/revoke", revokeConsent);

module.exports = router;