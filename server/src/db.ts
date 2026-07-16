import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });

const db = new Database(join(dataDir, 'emberlink.db'));
db.pragma('journal_mode = WAL');

const schemaVersion = db.pragma('user_version', { simple: true }) as number;
if (schemaVersion !== 2) {
  db.exec(`
    DROP TABLE IF EXISTS messages;
    DROP TABLE IF EXISTS relays;
    DROP TABLE IF EXISTS tasks;
    DROP TABLE IF EXISTS capsules;
  `);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    sender TEXT NOT NULL,
    channel TEXT NOT NULL,
    zone TEXT NOT NULL,
    priority TEXT NOT NULL,
    status TEXT NOT NULL,
    hops INTEGER NOT NULL,
    time TEXT NOT NULL,
    text TEXT NOT NULL,
    ttl_seconds INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    handled_by TEXT DEFAULT '',
    fingerprint TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS relays (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    zone TEXT NOT NULL,
    battery INTEGER NOT NULL,
    hops INTEGER NOT NULL,
    reach TEXT NOT NULL,
    active INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    owner TEXT NOT NULL,
    deadline TEXT NOT NULL,
    completed INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS capsules (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    unlock TEXT NOT NULL,
    note TEXT NOT NULL,
    status TEXT NOT NULL
  );
`);

db.pragma('user_version = 2');

const relayCount = db.prepare('SELECT COUNT(*) as c FROM relays').get() as { c: number };
if (relayCount.c === 0) {
  const now = Date.now();
  const insertMsg = db.prepare(`
    INSERT INTO messages (id, sender, channel, zone, priority, status, hops, time, text, ttl_seconds, expires_at, handled_by, fingerprint, created_at, last_seen_at)
    VALUES (@id, @sender, @channel, @zone, @priority, @status, @hops, @time, @text, @ttl_seconds, @expires_at, @handled_by, @fingerprint, @created_at, @last_seen_at)
  `);

  const seedMessages = [
    {
      id: 'seed-m1', sender: 'Skybridge-01', channel: 'Search', zone: 'Central Corridor', priority: 'urgent', status: 'relaying', hops: 3,
      time: '19:22', text: 'Heat signatures near metro tunnel. Escort two civilians to Shelter Delta.', ttl_seconds: 900,
      expires_at: now + 900000, handled_by: '', fingerprint: 'skybridge|central corridor|search|heat signatures near metro tunnel. escort two civilians to shelter delta.', created_at: now - 180000, last_seen_at: now - 60000
    },
    {
      id: 'seed-m2', sender: 'MedCart-9', channel: 'Medical', zone: 'North Sector', priority: 'critical', status: 'received', hops: 1,
      time: '19:10', text: 'Blood packs at 18%. Runner team dispatched and cold storage confirmed.', ttl_seconds: 1200,
      expires_at: now + 1200000, handled_by: 'Operator Console', fingerprint: 'medcart-9|north sector|medical|blood packs at 18%. runner team dispatched and cold storage confirmed.', created_at: now - 300000, last_seen_at: now - 120000
    },
    {
      id: 'seed-m3', sender: 'Harbor-Node', channel: 'Supply', zone: 'East Sector', priority: 'normal', status: 'queued', hops: 4,
      time: '18:56', text: 'Water purifier tablets and dry rations staged for pickup window.', ttl_seconds: 600,
      expires_at: now + 600000, handled_by: '', fingerprint: 'harbor-node|east sector|supply|water purifier tablets and dry rations staged for pickup window.', created_at: now - 240000, last_seen_at: now - 90000
    }
  ];
  seedMessages.forEach((m) => insertMsg.run(m));

  const insertRelay = db.prepare('INSERT INTO relays (id, name, zone, battery, hops, reach, active) VALUES (?, ?, ?, ?, ?, ?, ?)');
  [
    ['r1', 'Skybridge-01', 'Central', 87, 2, '8.1 km', 1],
    ['r2', 'Harbor-Node', 'East', 63, 4, '5.4 km', 1],
    ['r3', 'Metro-Shelter', 'South', 39, 5, '4.9 km', 0],
    ['r4', 'Hillwatch', 'West', 74, 3, '7.0 km', 1],
    ['r5', 'MedCart-9', 'North', 58, 2, '3.8 km', 1]
  ].forEach((r) => insertRelay.run(...r));

  const insertTask = db.prepare('INSERT INTO tasks (id, title, owner, deadline, completed) VALUES (?, ?, ?, ?, ?)');
  [
    ['t1', 'Map safe water points', 'Logistics', '20:30', 0],
    ['t2', 'Verify shelter occupancy', 'Civic Team', '21:00', 1],
    ['t3', 'Route insulin delivery', 'Medical', '21:20', 0]
  ].forEach((t) => insertTask.run(...t));

  const insertCapsule = db.prepare('INSERT INTO capsules (id, title, unlock, note, status) VALUES (?, ?, ?, ?, ?)');
  [
  [
    'c1',
    'Fallback Shelter Routing',
    'When East corridor relay contact resumes',
    'Redirect civilian movement from the engineering block to Shelter Delta if the south stairwell remains unsafe.',
    'sealed'
  ],
  [
    'c2',
    'Fallback Supply Route',
    'When Harbor-Node battery falls below 30%',
    'Shift medical packets to Hillwatch and wake Metro-Shelter for the next contact window.',
    'sealed'
  ]
]
}

export const queries = {
  getMessages: db.prepare('SELECT * FROM messages ORDER BY created_at DESC, last_seen_at DESC'),
  getMessageById: db.prepare('SELECT * FROM messages WHERE id = ?'),
  getRecentDuplicate: db.prepare('SELECT * FROM messages WHERE fingerprint = @fingerprint AND created_at >= @created_after ORDER BY created_at DESC LIMIT 1'),
  addMessage: db.prepare(`
    INSERT INTO messages (id, sender, channel, zone, priority, status, hops, time, text, ttl_seconds, expires_at, handled_by, fingerprint, created_at, last_seen_at)
    VALUES (@id, @sender, @channel, @zone, @priority, @status, @hops, @time, @text, @ttl_seconds, @expires_at, @handled_by, @fingerprint, @created_at, @last_seen_at)
  `),
  updateMessage: db.prepare('UPDATE messages SET status = @status, handled_by = @handled_by, last_seen_at = @last_seen_at WHERE id = @id'),
  touchMessage: db.prepare('UPDATE messages SET last_seen_at = @last_seen_at WHERE id = @id'),
  getRelays: db.prepare('SELECT * FROM relays ORDER BY name'),
  updateRelay: db.prepare('UPDATE relays SET battery = @battery, active = @active WHERE id = @id'),
  getTasks: db.prepare('SELECT * FROM tasks ORDER BY completed ASC, deadline ASC'),
  addTask: db.prepare('INSERT INTO tasks (id, title, owner, deadline, completed) VALUES (@id, @title, @owner, @deadline, @completed)'),
  toggleTask: db.prepare('UPDATE tasks SET completed = @completed WHERE id = @id'),
  getCapsules: db.prepare('SELECT * FROM capsules ORDER BY id DESC'),
  addCapsule: db.prepare('INSERT INTO capsules (id, title, unlock, note, status) VALUES (@id, @title, @unlock, @note, @status)')
};

export default db;
