const express = require("express");
const { makeDecision, getDecisionSummary } = require("../controllers/decisionController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware);
router.get("/summary", getDecisionSummary);
router.post("/", makeDecision);

module.exports = router;
