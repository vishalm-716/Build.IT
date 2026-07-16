import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { queries } from './db.js';

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const wss = new WebSocketServer({ server, path: '/ws' });
const clients = new Set<WebSocket>();
const relayChargeState = new Map<string, boolean>();
const rateWindow = new Map<string, number[]>();
const OPERATOR_KEY = process.env.OPERATOR_KEY || 'mesh-ops-47';

function broadcast(type: string, data: unknown) {
  const payload = JSON.stringify({ type, data });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

wss.on('connection', (ws: WebSocket) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'connected', data: { message: 'EMBERLINK node online' } }));
  ws.on('close', () => clients.delete(ws));
});

function requireOperator(req: express.Request, res: express.Response, next: express.NextFunction) {
  const key = req.header('x-operator-key');
  if (key !== OPERATOR_KEY) {
    return res.status(403).json({ error: 'operator key required' });
  }
  next();
}

function nowLabel() {
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date());
}

function isCharging(id: string) {
  return relayChargeState.get(id) === true;
}

function getDrainRate(relay: any) {
  const name = String(relay.name || '').toLowerCase();
  if (name.includes('metro')) return 3;
  if (name.includes('skybridge')) return 2;
  if (name.includes('medcart')) return 2;
  return 1;
}

function getChargeRate(relay: any) {
  const name = String(relay.name || '').toLowerCase();
  if (name.includes('medcart')) return 4;
  if (name.includes('harbor')) return 3;
  return 2;
}

function mapRelay(row: any) {
  return {
    ...row,
    active: !!row.active,
    charging: isCharging(row.id),
    drainRate: getDrainRate(row),
    chargeRate: getChargeRate(row)
  };
}

function mapTask(row: any) {
  return { ...row, completed: !!row.completed };
}

function mapMessage(row: any) {
  return {
    ...row,
    ttlSeconds: Number(row.ttl_seconds),
    expiresAt: Number(row.expires_at),
    handledBy: row.handled_by || null,
    createdAt: Number(row.created_at),
    lastSeenAt: Number(row.last_seen_at)
  };
}

function fingerprintOf(sender: string, zone: string, channel: string, text: string) {
  return `${sender}|${zone}|${channel}|${text.trim().toLowerCase()}`;
}

function getRelayById(id: string) {
  return (queries.getRelays.all() as any[]).find((r) => r.id === id);
}

function getMessageById(id: string) {
  const row = queries.getMessageById.get(id) as any;
  return row ? mapMessage(row) : null;
}

function updateRelayAndBroadcast(id: string, battery: number, active: boolean) {
  const safeBattery = Math.max(0, Math.min(100, Math.round(battery)));
  const nextActive = safeBattery <= 0 ? false : !!active;

  if (safeBattery >= 100 || safeBattery <= 0) {
    relayChargeState.set(id, false);
  }

  queries.updateRelay.run({
    id,
    battery: safeBattery,
    active: nextActive ? 1 : 0
  });

  const fresh = getRelayById(id);
  if (!fresh) return null;

  const updated = mapRelay(fresh);
  broadcast('relay:update', updated);
  return updated;
}

function cleanupExpiredMessages() {
  const now = Date.now();
  const rows = queries.getMessages.all() as any[];
  for (const row of rows) {
    const expired = Number(row.expires_at) <= now;
    const terminal = ['received', 'archived', 'expired'].includes(row.status);
    if (expired && !terminal) {
      queries.updateMessage.run({
        id: row.id,
        status: 'expired',
        handled_by: row.handled_by || '',
        last_seen_at: now
      });
    }
  }
}

const PORT = process.env.PORT || 5000;

app.get('/api/messages', (_req, res) => {
  cleanupExpiredMessages();
  const rows = queries.getMessages.all() as any[];
  res.json(rows.map(mapMessage));
});

app.post('/api/messages', (req, res) => {
  cleanupExpiredMessages();

  const { sender, channel, zone, priority, text, ttlSeconds } = req.body;
  if (!text?.trim()) {
    return res.status(400).json({ error: 'text required' });
  }

  const senderSafe = String(sender || 'Field Unit').trim();
  const zoneSafe = String(zone || 'Sector 7').trim();
  const channelSafe = String(channel || 'Search').trim();
  const prioritySafe = String(priority || 'urgent').trim();
  const textSafe = String(text).trim();

  const ttl = Math.max(
    120,
    Math.min(
      3600,
      Number(
        ttlSeconds ||
          (prioritySafe === 'critical' ? 900 : prioritySafe === 'urgent' ? 600 : 300)
      )
    )
  );

  const now = Date.now();
  const rateKey = `${senderSafe}|${zoneSafe}`;
  const recent = (rateWindow.get(rateKey) || []).filter((ts) => now - ts < 30000);

  if (recent.length >= 5) {
    return res.status(429).json({ error: 'rate limit: too many packets from this sender/zone window' });
  }

  recent.push(now);
  rateWindow.set(rateKey, recent);

  const fingerprint = fingerprintOf(senderSafe, zoneSafe, channelSafe, textSafe);
  const dupe = queries.getRecentDuplicate.get({
    fingerprint,
    created_after: now - 90000
  }) as any;

  if (dupe) {
    queries.touchMessage.run({ id: dupe.id, last_seen_at: now });
    return res.status(200).json({ ...mapMessage(dupe), deduplicated: true });
  }

  const activeCount = (queries.getRelays.all() as any[]).filter((r) => r.active).length;
  const hops = Math.max(1, Math.min(6, Math.round(activeCount / 1.3)));
  const status = activeCount > 2 ? 'relaying' : 'queued';
  const id = `msg-${now}-${Math.random().toString(36).slice(2, 6)}`;

  const msg = {
    id,
    sender: senderSafe,
    channel: channelSafe,
    zone: zoneSafe,
    priority: prioritySafe,
    status,
    hops,
    time: nowLabel(),
    text: textSafe,
    ttl_seconds: ttl,
    expires_at: now + ttl * 1000,
    handled_by: '',
    fingerprint,
    created_at: now,
    last_seen_at: now
  };

  queries.addMessage.run(msg);
  const result = mapMessage(msg);
  broadcast('message:new', result);
  res.status(201).json(result);
});

app.patch('/api/messages/:id', requireOperator, (req, res) => {
  const { id } = req.params;
  const row = getMessageById(id);

  if (!row) {
    return res.status(404).json({ error: 'message not found' });
  }

  const allowed = new Set(['queued', 'relaying', 'delivered', 'received', 'archived', 'expired']);
  const nextStatus = allowed.has(req.body.status) ? req.body.status : row.status;
  const handledBy = String(req.body.handledBy || req.body.handled_by || row.handledBy || '').trim();
  const lastSeenAt = Date.now();

  queries.updateMessage.run({
    id,
    status: nextStatus,
    handled_by: handledBy,
    last_seen_at: lastSeenAt
  });

  const fresh = getMessageById(id);
  broadcast('message:update', fresh);
  res.json(fresh);
});

app.get('/api/relays', (_req, res) => {
  res.json((queries.getRelays.all() as any[]).map(mapRelay));
});

app.patch('/api/relays/:id', requireOperator, (req, res) => {
  const { id } = req.params;
  const { battery, active, charging } = req.body;

  const row = getRelayById(id);
  if (!row) {
    return res.status(404).json({ error: 'relay not found' });
  }

  if (typeof charging === 'boolean') {
    relayChargeState.set(id, charging);
  }

  const newBattery = battery ?? row.battery;
  const newActive = active ?? row.active;
  const updated = updateRelayAndBroadcast(id, newBattery, newActive);

  if (!updated) {
    return res.status(500).json({ error: 'relay update failed' });
  }

  res.json(updated);
});

app.get('/api/tasks', (_req, res) => {
  res.json((queries.getTasks.all() as any[]).map(mapTask));
});

app.post('/api/tasks', requireOperator, (req, res) => {
  const { title, owner, deadline } = req.body;

  if (!title?.trim()) {
    return res.status(400).json({ error: 'title required' });
  }

  const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const task = {
    id,
    title: title.trim(),
    owner: owner || 'Operations',
    deadline: deadline || '22:00',
    completed: 0
  };

  queries.addTask.run(task);
  const result = { ...task, completed: false };
  broadcast('task:new', result);
  res.status(201).json(result);
});

app.patch('/api/tasks/:id', requireOperator, (req, res) => {
  const { id } = req.params;
  const { completed } = req.body;

  const row = (queries.getTasks.all() as any[]).find((t) => t.id === id);
  if (!row) {
    return res.status(404).json({ error: 'task not found' });
  }

  const newVal = completed ? 1 : 0;
  queries.toggleTask.run({ id, completed: newVal });

  const updated = {
    ...row,
    completed: !!newVal
  };

  broadcast('task:update', updated);
  res.json(updated);
});

app.get('/api/capsules', (_req, res) => {
  res.json(queries.getCapsules.all());
});

app.post('/api/capsules', requireOperator, (req, res) => {
  const { title, unlock, note } = req.body;

  if (!title?.trim() || !note?.trim()) {
    return res.status(400).json({ error: 'title and note required' });
  }

  const id = `cap-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const capsule = {
    id,
    title: title.trim(),
    unlock: unlock?.trim() || 'On trusted relay contact',
    note: note.trim(),
    status: 'sealed'
  };

  queries.addCapsule.run(capsule);
  broadcast('capsule:new', capsule);
  res.status(201).json(capsule);
});

app.get('/api/stats', (_req, res) => {
  cleanupExpiredMessages();

  const messages = (queries.getMessages.all() as any[]).map(mapMessage);
  const relays = (queries.getRelays.all() as any[]).map(mapRelay);
  const tasks = (queries.getTasks.all() as any[]).map(mapTask);
  const capsules = queries.getCapsules.all() as any[];

  const activeRelays = relays.filter((r) => r.active);
  const avgBattery = relays.length
    ? Math.round(relays.reduce((sum, relay) => sum + relay.battery, 0) / relays.length)
    : 0;

  const completedTasks = tasks.filter((t) => t.completed).length;
  const relayShare = relays.length ? activeRelays.length / relays.length : 0;
  const taskShare = tasks.length ? completedTasks / tasks.length : 0;

  const liveMessages = messages.filter(
    (m) => !['received', 'archived', 'expired'].includes(m.status)
  ).length;

  const archivedMessages = messages.filter(
    (m) => m.status === 'archived' || m.status === 'received'
  ).length;

  const msgBoost = Math.min(liveMessages / 12, 1);

  const resilience = Math.min(
    99,
    Math.round(avgBattery * 0.45 + relayShare * 30 + taskShare * 15 + msgBoost * 9)
  );

  res.json({
    resilience,
    activeRelays: activeRelays.length,
    totalRelays: relays.length,
    activeMessages: liveMessages,
    archivedMessages,
    openTasks: tasks.length - completedTasks,
    totalTasks: tasks.length,
    capsuleCount: capsules.length
  });
});

app.get('/api/health', (req, res) => {
  const operatorKeySupplied = req.header('x-operator-key') === OPERATOR_KEY;

  res.json({
    status: 'ok',
    uptime: process.uptime(),
    clients: clients.size,
    operatorUnlocked: operatorKeySupplied,
    mode: 'local-first-dtn-node'
  });
});

setInterval(() => {
  const relays = queries.getRelays.all() as any[];

  for (const relay of relays) {
    const charging = isCharging(relay.id);

    if (charging) {
      const nextBattery = Math.min(100, relay.battery + getChargeRate(relay));
      updateRelayAndBroadcast(relay.id, nextBattery, true);
      continue;
    }

    if (!relay.active) continue;

    const nextBattery = Math.max(0, relay.battery - getDrainRate(relay));
    updateRelayAndBroadcast(relay.id, nextBattery, nextBattery > 0);
  }
}, 10000);

setInterval(cleanupExpiredMessages, 15000);

server.listen(PORT, () => {
  console.log(`EMBERLINK V2 node running on http://127.0.0.1:${PORT}`);
  console.log(`Operator key for demo: ${OPERATOR_KEY}`);
  console.log('Mode: local-first DTN mesh node simulator');
});