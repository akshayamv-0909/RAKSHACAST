# NDRF Command Center Dashboard Architecture

## Overview
The NDRF Command Center was integrated directly into the existing `rakshacast` architecture without creating a separate backend or database.

It adheres to the core requirement:
**ONE BACKEND. ONE DATABASE. MULTIPLE CLIENTS.**

```
            EXISTING CITIZEN APP
                     │
                     ▼
             EXISTING BACKEND (Node.js)
                     │
              ┌──────┴──────┐
              ▼             ▼
      SQLite Database   Socket.IO (Realtime)
              │             │
              └──────┬──────┘
                     ▼
          NDRF COMMAND CENTER
```

## Existing Backend Reused
- The existing native `http` Node.js server (`server/index.js`) was retained and upgraded.
- Existing REST endpoints (`/api/weather/live`, `/api/state`) were kept and wired to the database to ensure backward compatibility with the mobile app.

## Database Additions
- Replaced the ephemeral in-memory Javascript `DB` object with a persistent **SQLite Database** (`rakshacast.db`).
- **Tables created:**
  - `sosRequests`: Stores distress calls with triage scores.
  - `rescueTeams`: Stores NDRF teams, boats, and their statuses.
  - `alerts`: Stores mass polygon alerts.

## Realtime Implementation
- **Socket.IO** was integrated into the Node server.
- The Citizen app was updated to emit `POST /api/sos` instead of mutating local arrays. The server then triggers a `new_sos` WebSocket event.
- The Command Center listens for `new_sos`, `incident_updated`, and `mass_alert` events to update the GIS Map and Triage Kanban board instantly without manual page refreshes.

## Map & Triage Implementation
- **GIS Map:** Utilizes `Leaflet.js` to render the dark-themed command center map.
- **Triage Board:** Built using the HTML5 Drag and Drop API. Dragging a card triggers a `PATCH /api/sos/:id` to the backend, which updates SQLite and broadcasts the change to all connected clients (including the mobile app).
- **Mass Alert:** Uses `Leaflet.draw` to allow commanders to draw polygons over affected areas. The GeoJSON polygon is saved to the backend via `POST /api/alerts/mass`.

## New APIs Created
- `PATCH /api/sos/:id`: Used by the Triage Board to update SOS status (e.g., NEW -> DISPATCHED) and assign rescue boats.
- `POST /api/alerts/mass`: Used by the GIS Map to submit drawn polygon alerts.
- `GET /api/statistics`: Returns live aggregate counts (Active SOS, Critical SOS, Deployed Teams) for the dashboard header.

## Local Setup & Testing
1. Install dependencies: `npm install`
2. Start the unified backend: `npm run server`
3. Start the mobile app: `npm start`
4. Access the mobile app at `http://localhost:8080/`
5. Access the Command Center at `http://localhost:8080/dashboard/index.html`

Test the realtime flow by submitting an SOS from the mobile app and watching it instantly appear on the Command Center map.
