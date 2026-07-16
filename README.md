# EMBERLINK

EMBERLINK is a hackathon MVP built for the **First Contact** prompt.

It is designed as a **local node simulator** for a delay-tolerant, disruption-resilient communication platform — not a normal internet chat application.

## Problem framing

In this scenario, aliens disable long-range centralized digital communication infrastructure. That means conventional tools like messaging apps, email, and cloud-dependent coordination platforms become unreliable or unusable.

EMBERLINK explores how communication can still continue when:
- the old internet cannot be trusted,
- connectivity is intermittent,
- packets must survive delays,
- and coordination must happen through local storage, relays, and controlled handoff.

## Core idea

EMBERLINK models how a single resilient response node would:

- queue short packets locally,
- forward them during contact windows,
- suppress duplicates,
- apply TTL expiry,
- archive handled traffic,
- simulate relay battery and charging behavior,
- support mission coordination,
- and store delayed operational directives for later release.

## What this MVP is

This project is a **simulation prototype** of one node in a larger communication mesh.

The browser app represents the node console.  
The backend simulates:
- local packet storage,
- relay behavior,
- packet lifecycle,
- operator-gated actions,
- and coordination logic.

## Why it fits the prompt

Instead of assuming normal internet still works, EMBERLINK is based on a **local-first, store-and-forward** communication model.

That makes it a more realistic response to the hackathon challenge:
- people can still submit short packets,
- operators can manage relay availability,
- handled traffic can be cleared from live feeds,
- and delayed directives can be stored for later release when the right network condition appears.

## Demo operator key

Use this operator key inside the UI:
```text
mesh-ops-47
```
## Run the project

### From project root

```bash
npm install
npm run dev
```

### Or run separately

```bash
npm install --prefix server
npm run dev --prefix server
```

```bash
npm install --prefix client
npm run dev --prefix client
```

## Local URLs

- Frontend: [http://localhost:5173](http://localhost:5173)
- Backend: [http://127.0.0.1:5000](http://127.0.0.1:5000)

## Demo framing for judges


"EMBERLINK simulates one resilient node in a post-infrastructure communication mesh. It is local-first, packet-based, store-and-forward, and operator-safe. The browser app acts as the node console, while the backend simulates local packet storage, relay behavior, coordination logic, and controlled operational access."

## Main features

- Signal feed with packet lifecycle states
- Message acknowledgement and archive flow
- Relay mesh simulation with variable battery drain
- Slow charging mode for active relay recovery
- Mission queue for operator-led coordination
- Delayed directives for time- or condition-based release
- Rate limiting and duplicate suppression
- Operator lock for critical controls

## Postman

Base URL:
```text
http://127.0.0.1:5000
```

### Useful endpoints
- `GET /api/health`
- `GET /api/messages`
- `POST /api/messages`
- `PATCH /api/messages/:id` *(operator key required)*
- `GET /api/relays`
- `PATCH /api/relays/:id` *(operator key required)*
- `GET /api/tasks`
- `POST /api/tasks` *(operator key required)*
- `PATCH /api/tasks/:id` *(operator key required)*
- `GET /api/capsules`
- `POST /api/capsules` *(operator key required)*
- `GET /api/stats`

Add this header for operator routes:
```text
x-operator-key: mesh-ops-47
```

## Important note
This hackathon MVP focuses on the **communication model** and **resilient coordination logic**.

In a production version, the same ideas would be connected to real short-range transport layers such as:
- Bluetooth mesh,
- Wi-Fi Direct,
- LoRa relay hardware,
- or other peer-to-peer offline networking systems.

## Repository purpose
This repository is intended to demonstrate:
- a credible response to disrupted infrastructure,
- a strong local-first architecture concept,
- and a practical UI/UX for emergency coordination after first contact.
