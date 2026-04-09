const express = require("express");
const { signup, login, register } = require("../controllers/authController");

const router = express.Router();

router.post("/signup", signup);
router.post("/register", register);
router.post("/login", login);

module.exports = router;