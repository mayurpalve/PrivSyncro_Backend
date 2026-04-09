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

const providerManageUrls = {
  google: "https://myaccount.google.com/permissions",
  spotify: "https://www.spotify.com/account/apps/"
};

const getProviderManageUrl = (provider) => providerManageUrls[provider] || "";

const scopeLabelMap = {
  spotify: {
    "user-read-email": "Read Spotify account email",
    "user-read-private": "Read Spotify profile information",
    "user-read-recently-played": "Read recently played tracks"
  },
  google: {
    openid: "Sign in with Google identity",
    email: "Read Google account email",
    profile: "Read Google profile details",
    "https://www.googleapis.com/auth/fitness.activity.read": "Read Google Fit activity data",
    "https://www.googleapis.com/auth/fitness.location.read": "Read Google Fit location data"
  }
};

const toReadablePermissions = (provider, scopes = []) => {
  const labels = scopeLabelMap[provider] || {};

  return scopes.map((scope) => ({
    scope,
    label: labels[scope] || scope
  }));
};

const toFrontendStatusRedirect = (provider, status, detail = "") => {
  const query = new URLSearchParams({ integration: provider, status });
  if (detail) query.append("detail", detail);
  return `${FRONTEND_BASE_URL}/?${query.toString()}`;
};

const extractErrorDetail = (error) => {
  const providerError = error?.response?.data;

  if (typeof providerError === "string" && providerError.trim()) {
    return providerError;
  }

  if (providerError?.error_description) {
    return providerError.error_description;
  }

  if (providerError?.error?.message) {
    return providerError.error.message;
  }

  if (providerError?.error) {
    return String(providerError.error);
  }

  if (error?.response?.statusText) {
    return error.response.statusText;
  }

  return error?.message || "Unknown integration error";
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

const refreshAccessToken = async ({ account, provider, config }) => {
  if (!account?.refreshToken) {
    throw new Error("Refresh token not available");
  }

  const clientId = process.env[config.clientIdEnv];
  const clientSecret = process.env[config.clientSecretEnv];

  if (!clientId || !clientSecret) {
    throw new Error("OAuth client credentials are missing");
  }

  if (provider === "spotify") {
    const payload = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: account.refreshToken
    });

    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

    const response = await axios.post(config.tokenUrl, payload.toString(), {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`
      }
    });

    return response.data;
  }

  const payload = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: account.refreshToken,
    client_id: clientId,
    client_secret: clientSecret
  });

  const response = await axios.post(config.tokenUrl, payload.toString(), {
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    }
  });

  return response.data;
};

const fetchUserInfoWithAutoRefresh = async ({ account, provider, config }) => {
  try {
    const response = await axios.get(config.userInfoUrl, {
      headers: { Authorization: `Bearer ${account.accessToken}` }
    });
    return { profile: response.data, account };
  } catch (error) {
    const status = error?.response?.status;
    if (status !== 401 || !account.refreshToken) {
      throw error;
    }

    const refreshed = await refreshAccessToken({ account, provider, config });
    const updatedAccount = await IntegrationAccount.findByIdAndUpdate(
      account._id,
      {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token || account.refreshToken,
        tokenExpiresAt: refreshed.expires_in
          ? new Date(Date.now() + refreshed.expires_in * 1000)
          : account.tokenExpiresAt,
        scope: refreshed.scope
          ? refreshed.scope.split(" ").filter(Boolean)
          : account.scope
      },
      { new: true }
    );

    const retryResponse = await axios.get(config.userInfoUrl, {
      headers: { Authorization: `Bearer ${updatedAccount.accessToken}` }
    });

    return { profile: retryResponse.data, account: updatedAccount };
  }
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

    const existingAccount = await IntegrationAccount.findOne({
      userId: decodedState.userId,
      provider
    }).select("refreshToken");

    await IntegrationAccount.findOneAndUpdate(
      { userId: decodedState.userId, provider },
      {
        userId: decodedState.userId,
        provider,
        accessToken,
        refreshToken: tokenData.refresh_token || existingAccount?.refreshToken || "",
        scope: (tokenData.scope || "").split(" ").filter(Boolean),
        tokenExpiresAt: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000) : null,
        ...providerProfile
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.redirect(toFrontendStatusRedirect(provider, "connected"));
  } catch (error) {
    const detail = extractErrorDetail(error);

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

    const enrichedAccounts = accounts.map((account) => {
      const accountObject = account.toObject();

      return {
        ...accountObject,
        grantedPermissions: toReadablePermissions(accountObject.provider, accountObject.scope),
        managedByPrivSyncro: true,
        providerManageUrl: getProviderManageUrl(accountObject.provider)
      };
    });

    return res.status(200).json(enrichedAccounts);
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

exports.verifyIntegrationLive = async (req, res) => {
  try {
    const { provider } = req.params;
    const config = getProviderConfig(provider);

    if (!config) {
      return res.status(400).json({ message: "Unsupported provider" });
    }

    const account = await IntegrationAccount.findOne({
      userId: req.user.id,
      provider
    }).select("provider accessToken refreshToken email displayName providerUserId scope updatedAt tokenExpiresAt");

    if (!account) {
      return res.status(404).json({ message: `${provider} account is not connected` });
    }

    const { profile, account: effectiveAccount } = await fetchUserInfoWithAutoRefresh({
      account,
      provider,
      config
    });

    const liveProfile =
      provider === "spotify"
        ? {
            providerUserId: profile.id || effectiveAccount.providerUserId || "",
            email: profile.email || effectiveAccount.email || "",
            displayName: profile.display_name || effectiveAccount.displayName || "",
            country: profile.country || "",
            product: profile.product || ""
          }
        : {
            providerUserId: profile.id || effectiveAccount.providerUserId || "",
            email: profile.email || effectiveAccount.email || "",
            displayName: profile.name || effectiveAccount.displayName || "",
            picture: profile.picture || ""
          };

    return res.status(200).json({
      provider,
      verified: true,
      verifiedAt: new Date().toISOString(),
      tokenLastUpdatedAt: effectiveAccount.updatedAt,
      grantedPermissions: toReadablePermissions(provider, effectiveAccount.scope || []),
      managedByPrivSyncro: true,
      providerManageUrl: getProviderManageUrl(provider),
      liveProfile
    });
  } catch (error) {
    const detail = extractErrorDetail(error);

    console.error("Live verification error:", error.response?.data || error.message);
    return res.status(500).json({
      provider: req.params.provider,
      verified: false,
      message: "Live verification failed",
      detail: String(detail)
    });
  }
};
