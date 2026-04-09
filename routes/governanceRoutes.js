const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { getGovernanceSummary } = require("../controllers/governanceController");

const router = express.Router();

router.use(authMiddleware);
router.get("/summary", getGovernanceSummary);

module.exports = router;

