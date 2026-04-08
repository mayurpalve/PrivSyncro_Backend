const axios = require("axios");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const IntegrationAccount = require("../models/IntegrationAccount");

const FRONTEND_BASE_URL = (process.env.FRONTEND_BASE_URL || "http://localhost:5173").replace(
  /\/+$/,
  ""
);

const providerConfigs = {
  spotify: {
    authUrl: "https://accounts.spotify.com/authorize",
    tokenUrl: "https://accounts.spotify.com/api/token",
    userInfoUrl: "https://api.spotify.com/v1/me",
    clientIdEnv: "SPOTIFY_CLIENT_ID",
    clientSecretEnv: "SPOTIFY_CLIENT_SECRET",
    redirectUriEnv: "SPOTIFY_REDIRECT_URI",
    scope: ["user-read-email", "user-read-private", "user-read-recently-played"]
  },
  google: {
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    redirectUriEnv: "GOOGLE_REDIRECT_URI",
    scope: [
      "openid",
      "email",
      "profile",
      "https://www.googleapis.com/auth/fitness.activity.read",
      "https://www.googleapis.com/auth/fitness.location.read"
    ]
  }
};

const getProviderConfig = (provider) => providerConfigs[provider];

const toFrontendStatusRedirect = (provider, status, detail = "") => {
  const query = new URLSearchParams({ integration: provider, status });
  if (detail) query.append("detail", detail);
  return `${FRONTEND_BASE_URL}/?${query.toString()}`;
};

const exchangeCodeForToken = async ({ provider, code, config, clientId, clientSecret, redirectUri }) => {
  if (provider === "spotify") {
    const tokenPayload = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri
    });

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    return axios.post(config.tokenUrl, tokenPayload.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`
      }
    });
  }

  const tokenPayload = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret
  });

  return axios.post(config.tokenUrl, tokenPayload.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" }
  });
};

const createStateToken = (userId, provider) =>
  jwt.sign(
    {
      userId,
      provider,
      nonce: crypto.randomBytes(16).toString("hex")
    },
    process.env.JWT_SECRET,
    { expiresIn: "10m" }
  );

exports.getConnectUrl = async (req, res) => {
  try {
    const { provider } = req.params;
    const config = getProviderConfig(provider);

    if (!config) return res.status(400).json({ message: "Unsupported provider" });
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "JWT_SECRET is missing in backend environment" });
    }

    const clientId = process.env[config.clientIdEnv];
    const redirectUri = process.env[config.redirectUriEnv];

    if (!clientId || !redirectUri) {
      return res.status(400).json({
        message: `${provider} OAuth is not configured. Set ${config.clientIdEnv} and ${config.redirectUriEnv}`
      });
    }

    const state = createStateToken(req.user.id, provider);
    const query = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: config.scope.join(" "),
      state
    });

    if (provider === "google") {
      query.append("access_type", "offline");
      query.append("include_granted_scopes", "true");
      query.append("prompt", "consent");
    }

    return res.status(200).json({ authUrl: `${config.authUrl}?${query.toString()}` });
  } catch (error) {
    console.error("Create connect URL error:", error.message);
    return res.status(500).json({ message: "Failed to create connect URL" });
  }
};

exports.handleOAuthCallback = async (req, res) => {
  try {
    const { provider } = req.params;
    const { code, state, error } = req.query;
    const config = getProviderConfig(provider);

    if (!config) return res.status(400).send("Unsupported provider");
    if (error) return res.redirect(toFrontendStatusRedirect(provider, "denied", String(error)));
    if (!code || !state) return res.redirect(toFrontendStatusRedirect(provider, "invalid_callback"));
    if (!process.env.JWT_SECRET) {
      return res.redirect(toFrontendStatusRedirect(provider, "not_configured", "missing_jwt_secret"));
    }

    let decodedState;
    try {
      decodedState = jwt.verify(state, process.env.JWT_SECRET);
    } catch (_verifyError) {
      return res.redirect(toFrontendStatusRedirect(provider, "invalid_state"));
    }

    if (decodedState.provider !== provider || !decodedState.userId) {
      return res.redirect(toFrontendStatusRedirect(provider, "invalid_state"));
    }

    const clientId = process.env[config.clientIdEnv];
    const clientSecret = process.env[config.clientSecretEnv];
    const redirectUri = process.env[config.redirectUriEnv];

    if (!clientId || !clientSecret || !redirectUri) {
      return res.redirect(toFrontendStatusRedirect(provider, "not_configured", "missing_oauth_env"));
    }

    const tokenResponse = await exchangeCodeForToken({
      provider,
      code,
      config,
      clientId,
      clientSecret,
      redirectUri
    });

    const tokenData = tokenResponse.data;
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token || "";

    const userInfoResponse = await axios.get(config.userInfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const profile = userInfoResponse.data;
    const providerProfile =
      provider === "spotify"
        ? {
            providerUserId: profile.id,
            email: profile.email || "",
            displayName: profile.display_name || "Spotify User"
          }
        : {
            providerUserId: profile.id,
            email: profile.email || "",
            displayName: profile.name || "Google User"
          };

    await IntegrationAccount.findOneAndUpdate(
      { userId: decodedState.userId, provider },
      {
        userId: decodedState.userId,
        provider,
        accessToken,
        refreshToken,
        scope: (tokenData.scope || "").split(" ").filter(Boolean),
        tokenExpiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
        ...providerProfile
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.redirect(toFrontendStatusRedirect(provider, "connected"));
  } catch (error) {
    const detail =
      error.response?.data?.error_description ||
      error.response?.data?.error ||
      error.response?.statusText ||
      error.message;

    console.error("OAuth callback error:", error.response?.data || error.message);
    return res.redirect(toFrontendStatusRedirect(req.params.provider, "failed", String(detail)));
  }
};

exports.getIntegrationHealth = async (req, res) => {
  const providers = Object.entries(providerConfigs).map(([provider, config]) => ({
    provider,
    configured: Boolean(
      process.env[config.clientIdEnv] &&
        process.env[config.clientSecretEnv] &&
        process.env[config.redirectUriEnv]
    ),
    redirectUri: process.env[config.redirectUriEnv] || ""
  }));

  return res.status(200).json({
    jwtSecretConfigured: Boolean(process.env.JWT_SECRET),
    frontendBaseUrl: FRONTEND_BASE_URL,
    providers
  });
};

exports.getLinkedAccounts = async (req, res) => {
  try {
    const accounts = await IntegrationAccount.find({ userId: req.user.id })
      .select("provider email displayName scope tokenExpiresAt updatedAt")
      .sort({ updatedAt: -1 });

    return res.status(200).json(accounts);
  } catch (error) {
    console.error("Get linked accounts error:", error.message);
    return res.status(500).json({ message: "Failed to fetch linked accounts" });
  }
};

exports.disconnectIntegration = async (req, res) => {
  try {
    const { provider } = req.params;
    const config = getProviderConfig(provider);

    if (!config) {
      return res.status(400).json({ message: "Unsupported provider" });
    }

    await IntegrationAccount.findOneAndDelete({ userId: req.user.id, provider });
    return res.status(200).json({ message: `${provider} disconnected` });
  } catch (error) {
    console.error("Disconnect integration error:", error.message);
    return res.status(500).json({ message: "Failed to disconnect integration" });
  }
};