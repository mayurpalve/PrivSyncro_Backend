const Activity = require("../models/Activity");
const { analyzeTransferRisk } = require("../services/transferGuardEngine");

exports.createActivity = async (req, res) => {
  try {
    const {
      appId,
      dataType,
      timestamp,
      duration = 0,
      payloadSizeKb = 0,
      location = null
    } = req.body;

    if (!appId || !dataType) {
      return res.status(400).json({ message: "appId and dataType are required" });
    }

    const transferAnalysis = analyzeTransferRisk({
      appId,
      dataType,
      payloadSizeKb,
      location
    });

    const activity = await Activity.create({
      userId: req.user.id,
      appId,
      dataType: dataType.toLowerCase(),
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      duration,
      payloadSizeKb,
      location,
      transferFlags: transferAnalysis.transferFlags,
      transferAnomalyScore: transferAnalysis.transferAnomalyScore
    });

    return res.status(201).json(activity);
  } catch (error) {
    console.error("Create activity error:", error.message);
    return res.status(500).json({ message: "Failed to create activity" });
  }
};

exports.getActivities = async (req, res) => {
  try {
    const { appId, dataType, limit = 100 } = req.query;
    const query = { userId: req.user.id };

    if (appId) query.appId = appId;
    if (dataType) query.dataType = String(dataType).toLowerCase();

    const activities = await Activity.find(query)
      .sort({ timestamp: -1 })
      .limit(Math.min(Number(limit), 500));

    return res.status(200).json(activities);
  } catch (error) {
    console.error("Get activity error:", error.message);
    return res.status(500).json({ message: "Failed to fetch activities" });
  }
};
