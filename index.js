const express = require("express");
const cors = require("cors");
require("dotenv").config();

const connectDB = require("./config/db");

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  process.env.FRONTEND_BASE_URL,
  "https://priv-syncro.vercel.app",
  "http://localhost:5173"
].filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).json({ message: "PrivSyncro backend is running" });
});

app.use("/auth", require("./routes/authRoutes"));
app.use("/consent", require("./routes/consentRoutes"));
app.use("/activity", require("./routes/activityRoutes"));
app.use("/risk", require("./routes/riskRoutes"));
app.use("/decision", require("./routes/decisionRoutes"));

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/apps", require("./routes/appRoutes"));
app.use("/api/consent", require("./routes/consentRoutes"));
app.use("/api/consents", require("./routes/consentRoutes"));
app.use("/api/activity", require("./routes/activityRoutes"));
app.use("/api/risk", require("./routes/riskRoutes"));
app.use("/api/decision", require("./routes/decisionRoutes"));
app.use("/api/integrations", require("./routes/integrationRoutes"));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();
