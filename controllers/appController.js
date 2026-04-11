const App = require("../models/App");

const DEFAULT_APPS = [
  {
    name: "Spotify",
    provider: "Spotify",
    permissions: ["profile", "email", "listening_history"]
  },
  {
    name: "Google Fit",
    provider: "Google",
    permissions: ["health_data", "activity", "location"]
  },
  {
    name: "Instagram",
    provider: "Instagram",
    permissions: ["profile", "email", "media", "social_graph"]
  },
  {
    name: "Facebook",
    provider: "Facebook",
    permissions: ["profile", "email", "contacts", "social_graph"]
  },
  {
    name: "Twitter/X",
    provider: "Twitter",
    permissions: ["profile", "email", "messages", "social_graph"]
  },
  {
    name: "WeatherNow",
    provider: "WeatherNow",
    permissions: ["location"]
  }
];

const ensureDefaultApps = async () => {
  const appCount = await App.countDocuments();
  if (appCount > 0) {
    return;
  }

  await App.insertMany(DEFAULT_APPS);
};

exports.createApp = async (req, res) => {
  try {
    const { name, provider, permissions } = req.body;

    if (!name || !provider || !Array.isArray(permissions) || permissions.length === 0) {
      return res.status(400).json({
        message: "name, provider and at least one permission are required"
      });
    }

    const existingApp = await App.findOne({ name: name.trim() });
    if (existingApp) {
      return res.status(409).json({ message: "App already exists" });
    }

    const app = await App.create({ name, provider, permissions });
    return res.status(201).json(app);
  } catch (error) {
    console.error("Create app error:", error.message);
    return res.status(500).json({ message: "Failed to create app" });
  }
};

exports.getApps = async (req, res) => {
  try {
    await ensureDefaultApps();
    const apps = await App.find().sort({ createdAt: -1 });
    return res.status(200).json(apps);
  } catch (error) {
    console.error("Get apps error:", error.message);
    return res.status(500).json({ message: "Failed to fetch apps" });
  }
};
