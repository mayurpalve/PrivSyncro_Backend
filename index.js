const express = require("express");
const cors = require("cors");
require("dotenv").config();

const connectDB = require("./config/db");

const app = express();
const PORT = process.env.PORT || 5000;

connectDB();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).json({ message: "PrivSyncro backend is running" });
});

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/apps", require("./routes/appRoutes"));
app.use("/api/consents", require("./routes/consentRoutes"));
app.use("/api/integrations", require("./routes/integrationRoutes"));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});