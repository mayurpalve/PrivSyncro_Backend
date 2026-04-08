const express = require("express");
const { createApp, getApps } = require("../controllers/appController");

const router = express.Router();

router.get("/", getApps);
router.post("/", createApp);

module.exports = router;