const express = require("express");
const { getRiskByApp, getRiskMeta } = require("../controllers/riskController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware);
router.get("/meta", getRiskMeta);
router.get("/:appId", getRiskByApp);

module.exports = router;
