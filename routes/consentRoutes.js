const express = require("express");
const {
  createConsent,
  getConsents,
  updateConsent,
  deleteConsent
} = require("../controllers/consentController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware);

router.get("/", getConsents);
router.post("/", createConsent);
router.put("/:id", updateConsent);
router.delete("/:id", deleteConsent);

module.exports = router;