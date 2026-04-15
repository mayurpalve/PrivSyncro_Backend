const express = require("express");
const { createConsent, getConsents, revokeConsent, deleteConsent } = require("../controllers/consentController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware);

router.post("/", createConsent);
router.get("/", getConsents);
router.patch("/:id/revoke", revokeConsent);
router.delete("/:id", deleteConsent);

module.exports = router;
