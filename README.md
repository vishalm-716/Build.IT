# EMBERLINK V2

EMBERLINK V2 is a hackathon MVP for the "First Contact" prompt.
It is intentionally positioned as a **local node simulator** for a delay-tolerant mesh communication platform, not a normal internet chat app.

## Core idea

The aliens disable long-range centralized digital infrastructure.
Local devices, portable relays, and short contact windows still exist.
EMBERLINK models how one response node would:
- queue short packets locally,
- forward them during contact windows,
- suppress duplicates,
- apply TTL expiry,
- gate critical controls behind operator access,
- archive handled traffic,
- and use dead-drop capsules for delayed delivery.

## Demo operator key

Use this operator key in the UI:

mesh-ops-47

## Run

### Root

npm install
npm run dev

### Or separately

- server: npm install --prefix server && npm run dev --prefix server
- client: npm install --prefix client && npm run dev --prefix client

## Local URLs

- Frontend: http://localhost:5173
- Backend: http://127.0.0.1:5000

## Important demo framing

Say this clearly to judges:

> This MVP simulates one resilient node in a post-infrastructure communication mesh. It is local-first, packet-based, store-and-forward, and operator-safe. The browser app is the node console; the backend simulates its local cache, relay behavior, packet lifecycle, and trust controls.

## Postman

Base URL:

http://127.0.0.1:5000

Useful endpoints:
- GET /api/health
- GET /api/messages
- POST /api/messages
- PATCH /api/messages/:id (operator key required)
- GET /api/relays
- PATCH /api/relays/:id (operator key required)
- GET /api/tasks
- POST /api/tasks (operator key required)
- PATCH /api/tasks/:id (operator key required)
- GET /api/capsules
- POST /api/capsules (operator key required)
- GET /api/stats

Add this header for operator routes:

x-operator-key: mesh-ops-47
