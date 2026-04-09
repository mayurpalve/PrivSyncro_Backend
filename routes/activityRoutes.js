const express = require("express");
const { createActivity, getActivities } = require("../controllers/activityController");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware);

router.post("/", createActivity);
router.get("/", getActivities);

module.exports = router;