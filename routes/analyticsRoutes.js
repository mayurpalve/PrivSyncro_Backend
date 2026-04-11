const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const { getAnalysisBoard } = require("../controllers/analyticsController");

const router = express.Router();

router.use(authMiddleware);
router.get("/board", getAnalysisBoard);

module.exports = router;

