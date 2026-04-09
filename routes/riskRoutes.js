const express = require("express");
const { getRiskByApp } = require("../controllers/riskController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware);
router.get("/:appId", getRiskByApp);

module.exports = router;