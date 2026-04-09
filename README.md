# PrivSyncro Backend

Node.js + Express + MongoDB backend for PrivSyncro intelligent privacy decision system.

## Core System Behavior

- JWT authentication for secure user sessions.
- Structured, fine-grained consent model (not binary global consent).
- Activity logging for every data access.
- Privacy risk evaluation using weighted formula:
  - `R = 0.25*S + 0.2*F + 0.2*L + 0.2*(1-T) + 0.15*A`
- Automated decision engine:
  - `R <= 0.5` -> `ALLOW`
  - `0.5 < R <= 0.7` -> `LIMITED_ACCESS`
  - `R > 0.7` -> `BLOCK_AND_ALERT`
- Dashboard-ready summary endpoint with risk indicator and recommended action.

## Tech Stack

- Node.js
- Express
- MongoDB (Mongoose)
- JWT authentication

## Environment Variables

Create `.env` using `.env.example` as reference:

- `PORT=5000`
- `MONGO_URI=...`
- `JWT_SECRET=...`
- `FRONTEND_BASE_URL=...`

OAuth variables (optional for integration flows):

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REDIRECT_URI`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

## Run

```bash
npm install
npm start
```

## Required APIs

All endpoints are available both with and without `/api` prefix.

### Auth

- `POST /auth/signup`
- `POST /auth/login`

#### Signup body

```json
{
  "email": "user@example.com",
  "password": "secure123",
  "name": "Mayur"
}
```

#### Login body

```json
{
  "email": "user@example.com",
  "password": "secure123"
}
```

### Consent

- `POST /consent`
- `GET /consent`
- `PATCH /consent/:id/revoke`

#### Create/Update consent body

```json
{
  "appId": "spotify",
  "dataType": "location",
  "status": "allowed",
  "expiry": "2026-12-31T23:59:59.000Z",
  "conditions": {
    "timeWindow": "daytime-only"
  }
}
```

### Activity

- `POST /activity`
- `GET /activity`

#### Activity body

```json
{
  "appId": "spotify",
  "dataType": "location",
  "timestamp": "2026-04-09T12:00:00.000Z",
  "duration": 120
}
```

### Risk

- `GET /risk/:appId`
- Optional query: `?dataType=location`

### Decision

- `POST /decision`
- `GET /decision/summary`

#### Decision request body

```json
{
  "appId": "spotify",
  "dataType": "location",
  "duration": 60
}
```

#### Decision response includes

- `riskScore`
- `components` (`S`, `F`, `L`, `T`, `A`)
- `decision` (`ALLOW`, `LIMITED_ACCESS`, `BLOCK_AND_ALERT`)
- `indicator` (`GREEN`, `YELLOW`, `RED`)
- `recommendedAction`

## Collections

### Users

- `email`
- `password`
- `createdAt`

### Consents

- `userId`
- `appId`
- `dataType`
- `status`
- `expiry`
- `conditions`

### Activities

- `userId`
- `appId`
- `dataType`
- `timestamp`
- `duration`

## System Flow

1. App requests access to a data type.
2. Backend checks user consent for app + data type.
3. Backend reads activity history.
4. Risk engine computes privacy risk score.
5. Decision engine returns allow/limit/block.
6. Activity is logged.
7. Dashboard fetches `/decision/summary` for posture overview.