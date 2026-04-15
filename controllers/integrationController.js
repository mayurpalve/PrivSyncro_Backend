const axios = require("axios");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const IntegrationAccount = require("../models/IntegrationAccount");

const FRONTEND_BASE_URL = (process.env.FRONTEND_BASE_URL || "http://localhost:5173").replace(
  /\/+$/,
  ""
);
const BACKEND_BASE_URL = (
  process.env.BACKEND_BASE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  "http://localhost:5000"
).replace(/\/+$/, "");

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
  },
  instagram: {
    authUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
    userInfoUrl: "https://graph.facebook.com/me?fields=id,name,email",
    clientIdEnv: "INSTAGRAM_CLIENT_ID",
    clientSecretEnv: "INSTAGRAM_CLIENT_SECRET",
    redirectUriEnv: "INSTAGRAM_REDIRECT_URI",
    scope: ["public_profile"]
  },
  facebook: {
    authUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
    userInfoUrl: "https://graph.facebook.com/me?fields=id,name,email",
    clientIdEnv: "FACEBOOK_CLIENT_ID",
    clientSecretEnv: "FACEBOOK_CLIENT_SECRET",
    redirectUriEnv: "FACEBOOK_REDIRECT_URI",
    scope: ["public_profile"]
  },
  twitter: {
    authUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    userInfoUrl: "https://api.twitter.com/2/users/me?user.fields=id,name,username",
    clientIdEnv: "TWITTER_CLIENT_ID",
    clientSecretEnv: "TWITTER_CLIENT_SECRET",
    redirectUriEnv: "TWITTER_REDIRECT_URI",
    scope: ["tweet.read", "users.read", "offline.access"]
  },
  x: {
    authUrl: "https://twitter.com/i/oauth2/authorize",
    tokenUrl: "https://api.twitter.com/2/oauth2/token",
    userInfoUrl: "https://api.twitter.com/2/users/me?user.fields=id,name,username",
    clientIdEnv: "X_CLIENT_ID",
    clientSecretEnv: "X_CLIENT_SECRET",
    redirectUriEnv: "X_REDIRECT_URI",
    scope: ["tweet.read", "users.read", "offline.access"]
  }
};

const getProviderConfig = (provider) => providerConfigs[provider];

const resolveProviderOAuth = (provider, config) => {
  const defaultRedirectUri = `${BACKEND_BASE_URL}/api/integrations/callback/${provider}`;

  if (provider === "instagram") {
    const clientId = process.env[config.clientIdEnv] || process.env.FACEBOOK_CLIENT_ID || "";
    const clientSecret = process.env[config.clientSecretEnv] || process.env.FACEBOOK_CLIENT_SECRET || "";
    const redirectUri = process.env[config.redirectUriEnv] || defaultRedirectUri;
    return { clientId, clientSecret, redirectUri };
  }

  if (provider === "facebook") {
    const clientId = process.env[config.clientIdEnv] || process.env.INSTAGRAM_CLIENT_ID || "";
    const clientSecret = process.env[config.clientSecretEnv] || process.env.INSTAGRAM_CLIENT_SECRET || "";
    const redirectUri = process.env[config.redirectUriEnv] || defaultRedirectUri;
    return { clientId, clientSecret, redirectUri };
  }

  return {
    clientId: process.env[config.clientIdEnv] || "",
    clientSecret: process.env[config.clientSecretEnv] || "",
    redirectUri: process.env[config.redirectUriEnv] || defaultRedirectUri
  };
};

const providerManageUrls = {
  google: "https://myaccount.google.com/permissions",
  spotify: "https://www.spotify.com/account/apps/",
  instagram: "https://www.instagram.com/accounts/manage_access/",
  facebook: "https://www.facebook.com/settings?tab=applications",
  twitter: "https://twitter.com/settings/connected_apps",
  x: "https://x.com/settings/connected_apps"
};

const getProviderManageUrl = (provider) => providerManageUrls[provider] || "";

const toBase64Url = (buffer) =>
  buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

const generatePkcePair = () => {
  const codeVerifier = toBase64Url(crypto.randomBytes(48));
  const codeChallenge = toBase64Url(crypto.createHash("sha256").update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
};

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
  },
  instagram: {
    public_profile: "Read Instagram basic profile"
  },
  facebook: {
    public_profile: "Read Facebook basic profile"
  },
  twitter: {
    "tweet.read": "Read tweets",
    "users.read": "Read profile data",
    "offline.access": "Maintain long-lived access"
  },
  x: {
    "tweet.read": "Read posts",
    "users.read": "Read profile data",
    "offline.access": "Maintain long-lived access"
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

const normalizeProviderProfile = (provider, rawProfile = {}, fallbackAccount = null) => {
  const profile = rawProfile?.data && typeof rawProfile.data === "object" ? rawProfile.data : rawProfile;
  const safeFallbackName = fallbackAccount?.displayName || "Connected User";
  const safeFallbackEmail = fallbackAccount?.email || "";

  if (provider === "spotify") {
    return {
      providerUserId: profile.id || fallbackAccount?.providerUserId || "",
      email: profile.email || safeFallbackEmail,
      displayName: profile.display_name || safeFallbackName
    };
  }

  if (provider === "google") {
    return {
      providerUserId: profile.id || fallbackAccount?.providerUserId || "",
      email: profile.email || safeFallbackEmail,
      displayName: profile.name || safeFallbackName
    };
  }

  if (provider === "facebook" || provider === "instagram") {
    return {
      providerUserId: profile.id || fallbackAccount?.providerUserId || "",
      email: profile.email || safeFallbackEmail,
      displayName: profile.name || profile.username || safeFallbackName
    };
  }

  if (provider === "twitter" || provider === "x") {
    return {
      providerUserId: profile.id || fallbackAccount?.providerUserId || "",
      email: profile.email || safeFallbackEmail,
      displayName: profile.name || profile.username || safeFallbackName
    };
  }

  return {
    providerUserId: profile.id || fallbackAccount?.providerUserId || "",
    email: profile.email || safeFallbackEmail,
    displayName: profile.name || profile.username || safeFallbackName
  };
};

const exchangeCodeForToken = async ({
  provider,
  code,
  config,
  clientId,
  clientSecret,
  redirectUri,
  codeVerifier
}) => {
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

  if (provider === "twitter" || provider === "x") {
    const tokenPayload = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId
    });

    if (codeVerifier) {
      tokenPayload.set("code_verifier", codeVerifier);
    }

    const headers = { "Content-Type": "application/x-www-form-urlencoded" };
    if (clientSecret) {
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      headers.Authorization = `Basic ${basicAuth}`;
    }

    return axios.post(config.tokenUrl, tokenPayload.toString(), { headers });
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

  const { clientId, clientSecret } = resolveProviderOAuth(provider, config);

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

const createStateToken = (userId, provider, extra = {}) =>
  jwt.sign(
    {
      userId,
      provider,
      nonce: crypto.randomBytes(16).toString("hex"),
      ...extra
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

    const { clientId, redirectUri } = resolveProviderOAuth(provider, config);

    if (!clientId || !redirectUri) {
      return res.status(400).json({
        message: `${provider} OAuth is not configured. Set ${config.clientIdEnv} and ${config.redirectUriEnv}`
      });
    }

    const isXProvider = provider === "twitter" || provider === "x";
    const pkce = isXProvider ? generatePkcePair() : null;
    const state = createStateToken(req.user.id, provider, pkce ? { codeVerifier: pkce.codeVerifier } : {});
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

    if (isXProvider && pkce) {
      query.append("code_challenge", pkce.codeChallenge);
      query.append("code_challenge_method", "S256");
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

    const { clientId, clientSecret, redirectUri } = resolveProviderOAuth(provider, config);

    if (!clientId || !clientSecret || !redirectUri) {
      return res.redirect(toFrontendStatusRedirect(provider, "not_configured", "missing_oauth_env"));
    }

    const tokenResponse = await exchangeCodeForToken({
      provider,
      code,
      config,
      clientId,
      clientSecret,
      redirectUri,
      codeVerifier: decodedState?.codeVerifier
    });

    const tokenData = tokenResponse.data;
    const accessToken = tokenData.access_token;

    const userInfoResponse = await axios.get(config.userInfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });

    const profile = userInfoResponse.data;
    const providerProfile = normalizeProviderProfile(provider, profile);

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
  const providers = Object.entries(providerConfigs).map(([provider, config]) => {
    const { clientId, clientSecret, redirectUri } = resolveProviderOAuth(provider, config);

    return {
      provider,
      configured: Boolean(clientId && clientSecret && redirectUri),
      redirectUri
    };
  });

  return res.status(200).json({
    jwtSecretConfigured: Boolean(process.env.JWT_SECRET),
    frontendBaseUrl: FRONTEND_BASE_URL,
    backendBaseUrl: BACKEND_BASE_URL,
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

    const normalized = normalizeProviderProfile(provider, profile, effectiveAccount);
    const liveProfile =
      provider === "spotify"
        ? {
            ...normalized,
            country: profile.country || "",
            product: profile.product || ""
          }
        : {
            ...normalized,
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
