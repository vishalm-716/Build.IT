import { useCallback, useEffect, useMemo, useState } from 'react';
import { quickBursts } from './data/bootstrap';
import { usePersistentState } from './hooks/usePersistentState';
import { apiClient, clearOperatorKey, getOperatorKey, setOperatorKey } from './api';

const clock = () =>
  new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(new Date());

const defaultMessage = {
  sender: 'Field Unit',
  channel: 'Search',
  zone: 'Sector 7',
  priority: 'urgent',
  ttlSeconds: 600,
  text: ''
};

export default function App() {
  const [messages, setMessages] = usePersistentState('emberlink-v2-messages', []);
  const [relays, setRelays] = usePersistentState('emberlink-v2-relays', []);
  const [tasks, setTasks] = usePersistentState('emberlink-v2-tasks', []);
  const [capsules, setCapsules] = usePersistentState('emberlink-v2-capsules', []);
  const [stats, setStats] = useState({
    resilience: 0,
    activeRelays: 0,
    totalRelays: 0,
    activeMessages: 0,
    archivedMessages: 0,
    openTasks: 0,
    capsuleCount: 0
  });
  const [serverOnline, setServerOnline] = useState(false);
  const [messageForm, setMessageForm] = useState(defaultMessage);
  const [taskForm, setTaskForm] = useState({
    title: '',
    owner: 'Operations',
    deadline: '22:00'
  });
  const [capsuleForm, setCapsuleForm] = useState({
    title: '',
    unlock: 'When East corridor relay contact resumes',
    note: ''
  });
  const [operatorInput, setOperatorInput] = useState(getOperatorKey());
  const [operatorUnlocked, setOperatorUnlocked] = useState(Boolean(getOperatorKey()));
  const [error, setError] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [msgs, relaysData, tasksData, capsData, statsData] = await Promise.all([
        apiClient.getMessages(),
        apiClient.getRelays(),
        apiClient.getTasks(),
        apiClient.getCapsules(),
        apiClient.getStats()
      ]);

      setMessages(Array.isArray(msgs) ? msgs.slice(0, 80) : []);
      setRelays(Array.isArray(relaysData) ? relaysData : []);
      setTasks(Array.isArray(tasksData) ? tasksData : []);
      setCapsules(Array.isArray(capsData) ? capsData : []);
      setStats(statsData || {});
      setServerOnline(true);
      setError('');
    } catch (err) {
      setServerOnline(false);
      if (err instanceof Error) setError(err.message);
    }
  }, [setCapsules, setMessages, setRelays, setTasks]);

  useEffect(() => {
    loadAll();
    const interval = setInterval(loadAll, 4000);
    return () => clearInterval(interval);
  }, [loadAll]);

  const refreshStats = useCallback(async () => {
    try {
      const s = await apiClient.getStats();
      setStats(s);
      setServerOnline(true);
    } catch (err) {
      setServerOnline(false);
      if (err instanceof Error) setError(err.message);
    }
  }, []);

  const unlockOperator = async () => {
    try {
      setOperatorKey(operatorInput.trim());
      await apiClient.getHealth();
      setOperatorUnlocked(true);
      setError('');
    } catch (err) {
      clearOperatorKey();
      setOperatorUnlocked(false);
      setError(err instanceof Error ? err.message : 'Operator unlock failed');
    }
  };

  const lockOperator = () => {
    clearOperatorKey();
    setOperatorUnlocked(false);
    setOperatorInput('');
  };

  const addMessage = useCallback(
    async (payload) => {
      if (!payload.text.trim()) return;

      try {
        await apiClient.sendMessage({
          ...payload,
          text: payload.text.trim()
        });
        await loadAll();
      } catch (err) {
        const relaySpan = Math.max(1, Math.min(6, Math.round(relays.filter((r) => r.active).length / 1.3)));
        const fallback = {
          id: `local-${Date.now()}`,
          sender: payload.sender,
          channel: payload.channel,
          zone: payload.zone,
          priority: payload.priority,
          status: 'local-cache',
          hops: relaySpan,
          time: clock(),
          text: payload.text.trim(),
          ttlSeconds: payload.ttlSeconds,
          expiresAt: Date.now() + Number(payload.ttlSeconds || 600) * 1000,
          handledBy: null
        };

        setMessages((prev) => [fallback, ...prev].slice(0, 80));
        setServerOnline(false);
        if (err instanceof Error) setError(err.message);
      }
    },
    [loadAll, relays, setMessages]
  );

  const submitMessage = async (e) => {
    e.preventDefault();
    await addMessage(messageForm);
    setMessageForm((current) => ({ ...current, text: '' }));
  };

  const triggerBurst = async (payload) => {
    await addMessage({
      sender: 'Rapid Beacon',
      zone: messageForm.zone,
      ttlSeconds: payload.priority === 'critical' ? 900 : 600,
      ...payload
    });
  };

  const patchMessage = async (id, data) => {
    try {
      await apiClient.updateMessage(id, data);
      await loadAll();
    } catch (err) {
      if (err instanceof Error) setError(err.message);
    }
  };

  const submitTask = async (e) => {
    e.preventDefault();
    if (!taskForm.title.trim()) return;

    try {
      await apiClient.addTask(taskForm);
      await loadAll();
      setTaskForm((current) => ({ ...current, title: '' }));
    } catch (err) {
      if (err instanceof Error) setError(err.message);
    }
  };

  const toggleTask = async (id, completed) => {
    try {
      await apiClient.toggleTask(id, !completed);
      await loadAll();
    } catch (err) {
      if (err instanceof Error) setError(err.message);
    }
  };

  const submitCapsule = async (e) => {
    e.preventDefault();
    if (!capsuleForm.title.trim() || !capsuleForm.note.trim()) return;

    try {
      await apiClient.addCapsule(capsuleForm);
      await loadAll();
      setCapsuleForm({
        title: '',
        unlock: 'When East corridor relay contact resumes',
        note: ''
      });
    } catch (err) {
      if (err instanceof Error) setError(err.message);
    }
  };

  const toggleRelay = async (relay) => {
    try {
      await apiClient.updateRelay(relay.id, {
        active: !relay.active,
        battery: relay.active ? relay.battery : Math.min(100, relay.battery + 5)
      });
      await loadAll();
      await refreshStats();
    } catch (err) {
      if (err instanceof Error) setError(err.message);
    }
  };

  const toggleChargeRelay = async (relay) => {
    try {
      await apiClient.updateRelay(relay.id, {
        charging: !relay.charging,
        active: !relay.charging ? true : relay.active
      });
      await loadAll();
      await refreshStats();
    } catch (err) {
      if (err instanceof Error) setError(err.message);
    }
  };

  const resilience = stats.resilience || 0;

  const routingHint = useMemo(() => {
    if (resilience >= 78) {
      return 'Local mesh stable. Keep forwarding critical packets and archive handled traffic.';
    }
    if (resilience >= 58) {
      return 'Store-and-forward routes are usable. Keep bursts short and acknowledge received packets.';
    }
    return 'Relay gaps detected. Use delayed directives, limit spam, and wake nearby nodes for contact windows.';
  }, [resilience]);

  const visibleMessages = useMemo(() => {
    const list = showArchived ? messages : messages.filter((m) => m.status !== 'archived');
    return list.slice(0, 10);
  }, [messages, showArchived]);

  const activeTaskCount = tasks.filter((t) => !t.completed).length;

  return (
    <div className="shell">
      <div className="scanlines" aria-hidden="true" />

      <header className="card hero">
        <div>
          <p className="eyebrow">FIRST CONTACT // DTN MESH RESPONSE NODE</p>
          <h1>EMBERLINK V2</h1>
          <p className="hero-copy">
            A local-first, delay-tolerant communication console for a world where long-range centralized
            networks are gone. Each node stores packets locally, forwards them during contact windows,
            and uses relays, acknowledgements, delayed directives, and operator controls to keep coordination alive
            without the old internet.
          </p>
        </div>

        <div className="hero-panel">
          <span className="sync-pill online">Sync mode: local-first polling</span>
          <span className={`sync-pill ${serverOnline ? 'server' : 'offline'}`}>
            Backend: {serverOnline ? 'local node online' : 'offline cache active'}
          </span>
          <span className="sync-pill mesh">Protocol: store-and-forward mesh</span>
          <p>{routingHint}</p>
        </div>
      </header>

      <section className="status-grid">
        <article className="card stat-card">
          <span>Resilience score</span>
          <strong>{resilience}%</strong>
          <small>Blends relay battery, active coverage, completed missions, and packet survivability.</small>
        </article>

        <article className="card stat-card">
          <span>Live relays</span>
          <strong>
            {stats.activeRelays}/{stats.totalRelays}
          </strong>
          <small>Nearby nodes wake on demand and drain at different rates based on hardware and load.</small>
        </article>

        <article className="card stat-card">
          <span>Active traffic</span>
          <strong>{stats.activeMessages}</strong>
          <small>Only unresolved packets stay in the hot feed; received or archived traffic is cleared out.</small>
        </article>

        <article className="card stat-card">
          <span>Archived traffic</span>
          <strong>{stats.archivedMessages}</strong>
          <small>Acknowledged packets remain searchable without overloading the live operator view.</small>
        </article>
      </section>

      <section className="layout two-col">
        <article className="card section-card">
          <div className="section-head">
            <h2>Operator lock</h2>
            <span className="tag">Abuse control</span>
          </div>

          <div className="panel-form compact">
            <label>
              Operator key
              <input
                value={operatorInput}
                onChange={(e) => setOperatorInput(e.target.value)}
                placeholder="Enter operator key"
              />
            </label>

            <div className="field-row end-row">
              <button type="button" className="primary-btn" onClick={unlockOperator}>
                Unlock controls
              </button>
              <button type="button" className="ghost-btn" onClick={lockOperator}>
                Lock
              </button>
            </div>

            <p style={{ color: 'var(--muted)', marginTop: '0.5rem' }}>
              Relay controls, packet acknowledgement, delayed directives, and mission changes require an operator key.
            </p>

            {error && <p style={{ color: '#fda4af', marginTop: '0.6rem' }}>{error}</p>}
          </div>
        </article>

        <article className="card section-card">
          <div className="section-head">
            <h2>Node model</h2>
            <span className="tag">Why it works</span>
          </div>

          <div className="protocol-list">
            <div>
              <h3>No old internet</h3>
              <p>
                EMBERLINK assumes long-range centralized systems are gone, but nearby devices and portable
                relays still compute and exchange short packets.
              </p>
            </div>
            <div>
              <h3>Store and forward</h3>
              <p>
                Messages are cached locally first, then handed off when a relay, runner, or contact
                window appears.
              </p>
            </div>
            <div>
              <h3>Safer ops</h3>
              <p>
                Critical actions are operator-gated, duplicate packets are suppressed, and TTL limits
                stale traffic.
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="layout two-col">
        <article className="card section-card">
          <div className="section-head">
            <h2>Pulse composer</h2>
            <span className="tag">Civilian packet input</span>
          </div>

          <form className="panel-form" onSubmit={submitMessage}>
            <div className="field-row">
              <label>
                Sender
                <input
                  value={messageForm.sender}
                  onChange={(e) => setMessageForm({ ...messageForm, sender: e.target.value })}
                />
              </label>

              <label>
                Zone
                <input
                  value={messageForm.zone}
                  onChange={(e) => setMessageForm({ ...messageForm, zone: e.target.value })}
                />
              </label>
            </div>

            <div className="field-row">
              <label>
                Channel
                <select
                  value={messageForm.channel}
                  onChange={(e) => setMessageForm({ ...messageForm, channel: e.target.value })}
                >
                  <option>Search</option>
                  <option>Medical</option>
                  <option>Supply</option>
                  <option>Emergency</option>
                  <option>Neighborhood</option>
                </select>
              </label>

              <label>
                Priority
                <select
                  value={messageForm.priority}
                  onChange={(e) => setMessageForm({ ...messageForm, priority: e.target.value })}
                >
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                  <option value="critical">Critical</option>
                </select>
              </label>
            </div>

            <div className="field-row">
              <label>
                TTL
                <select
                  value={messageForm.ttlSeconds}
                  onChange={(e) =>
                    setMessageForm({ ...messageForm, ttlSeconds: Number(e.target.value) })
                  }
                >
                  <option value={300}>5 min</option>
                  <option value={600}>10 min</option>
                  <option value={900}>15 min</option>
                  <option value={1800}>30 min</option>
                </select>
              </label>

              <label>
                Open missions
                <input value={activeTaskCount} readOnly />
              </label>
            </div>

            <label>
              Burst text
              <textarea
                rows="5"
                placeholder="Transmit a short, actionable packet."
                value={messageForm.text}
                onChange={(e) => setMessageForm({ ...messageForm, text: e.target.value })}
              />
            </label>

            <button type="submit" className="primary-btn">
              Queue packet
            </button>
          </form>

          <div className="burst-grid">
            {quickBursts.map((burst) => (
              <button
                key={burst.label}
                type="button"
                className="ghost-btn"
                onClick={() => triggerBurst(burst.payload)}
              >
                {burst.label}
              </button>
            ))}
          </div>
        </article>

        <article className="card section-card">
          <div className="section-head">
            <h2>Signal feed</h2>
            <span className="tag">Acknowledge to clear</span>
          </div>

          <div className="field-row end-row" style={{ marginBottom: '1rem' }}>
            <button type="button" className="ghost-btn" onClick={() => setShowArchived(false)}>
              Live traffic
            </button>
            <button type="button" className="ghost-btn" onClick={() => setShowArchived(true)}>
              Archived
            </button>
          </div>

          <div
            className="stack-list"
            style={{ maxHeight: '44rem', overflowY: 'auto', paddingRight: '0.35rem' }}
          >
            {visibleMessages.length === 0 && (
              <p style={{ color: 'var(--muted)' }}>No packets in this view.</p>
            )}

            {visibleMessages.map((m) => (
              <div key={m.id} className="message-card">
                <div className="message-top">
                  <div>
                    <strong>{m.sender}</strong>
                    <p>
                      {m.channel} // {m.zone}
                    </p>
                  </div>

                  <div className="message-meta">
                    <span className={`priority-badge ${m.priority}`}>{m.priority}</span>
                    <span className="status-badge">{m.status}</span>
                  </div>
                </div>

                <p className="message-text">{m.text}</p>

                <div className="message-bottom">
                  <span>
                    {m.hops} hops • TTL {Math.round(Number(m.ttlSeconds || 0) / 60)}m
                  </span>
                  <span>{m.time}</span>
                </div>

                <div className="field-row end-row" style={{ marginTop: '0.8rem' }}>
                  <button
                    type="button"
                    className="ghost-btn"
                    disabled={!operatorUnlocked || m.status === 'received'}
                    onClick={() => patchMessage(m.id, { status: 'received', handledBy: 'Operator Console' })}
                  >
                    Mark received
                  </button>

                  <button
                    type="button"
                    className="ghost-btn"
                    disabled={!operatorUnlocked || m.status === 'archived'}
                    onClick={() => patchMessage(m.id, { status: 'archived', handledBy: 'Operator Console' })}
                  >
                    Archive
                  </button>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="layout two-col">
        <article className="card section-card">
          <div className="section-head">
            <h2>Relay mesh</h2>
            <span className="tag">Variable drain + charge mode</span>
          </div>

          <div className="relay-grid">
            {relays.map((r) => (
              <div key={r.id} className={`relay-card ${r.active ? 'active' : 'sleeping'}`}>
                <div className="relay-top">
                  <div>
                    <strong>{r.name}</strong>
                    <p>
                      {r.zone} sector // reach {r.reach}
                    </p>
                  </div>
                  <span className={`node-dot ${r.active ? 'green' : 'amber'}`} />
                </div>

                <div className="meter-row">
                  <span>Battery</span>
                  <span>{r.battery}%</span>
                </div>

                <div className="meter">
                  <div className="meter-fill" style={{ width: `${r.battery}%` }} />
                </div>

                <div style={{ marginTop: '0.6rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
                  Drain {r.drainRate ?? 1}% / tick • Charge {r.chargeRate ?? 2}% / tick{' '}
                  {r.charging ? '• charging' : ''}
                </div>

                <div className="relay-bottom">
                  <span>{r.hops} relay hops</span>

                  <div className="relay-actions">
                    <button
                      type="button"
                      className="ghost-btn"
                      disabled={!operatorUnlocked}
                      onClick={() => toggleRelay(r)}
                    >
                      {r.active ? 'Sleep' : 'Wake'}
                    </button>

                    <button
                      type="button"
                      className="ghost-btn"
                      disabled={!operatorUnlocked}
                      onClick={() => toggleChargeRelay(r)}
                    >
                      {r.charging ? 'Stop charge' : 'Charge'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="card section-card">
          <div className="section-head">
            <h2>Mission queue</h2>
            <span className="tag">Operator only</span>
          </div>

          <form className="panel-form compact" onSubmit={submitTask}>
            <div className="field-row">
              <label>
                Task
                <input
                  value={taskForm.title}
                  onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                  placeholder="Evac route survey"
                  disabled={!operatorUnlocked}
                />
              </label>

              <label>
                Owner
                <input
                  value={taskForm.owner}
                  onChange={(e) => setTaskForm({ ...taskForm, owner: e.target.value })}
                  disabled={!operatorUnlocked}
                />
              </label>
            </div>

            <div className="field-row end-row">
              <label>
                Deadline
                <input
                  value={taskForm.deadline}
                  onChange={(e) => setTaskForm({ ...taskForm, deadline: e.target.value })}
                  disabled={!operatorUnlocked}
                />
              </label>

              <button type="submit" className="primary-btn" disabled={!operatorUnlocked}>
                Add mission
              </button>
            </div>
          </form>

          <div className="task-list">
            {tasks.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`task-row ${t.completed ? 'done' : ''}`}
                onClick={() => toggleTask(t.id, t.completed)}
                disabled={!operatorUnlocked}
              >
                <span className="checkbox">{t.completed ? '✓' : ''}</span>
                <span className="task-copy">
                  <strong>{t.title}</strong>
                  <small>
                    {t.owner} // due {t.deadline}
                  </small>
                </span>
              </button>
            ))}
          </div>
        </article>
      </section>

      <section className="layout two-col">
        <article className="card section-card">
          <div className="section-head">
            <h2>Delayed directives</h2>
            <span className="tag">Timed or conditional release</span>
          </div>

          <form className="panel-form compact" onSubmit={submitCapsule}>
            <label>
              Directive title
              <input
                value={capsuleForm.title}
                onChange={(e) => setCapsuleForm({ ...capsuleForm, title: e.target.value })}
                placeholder="Fallback shelter routing"
                disabled={!operatorUnlocked}
              />
            </label>

            <label>
              Release when
              <input
                value={capsuleForm.unlock}
                onChange={(e) => setCapsuleForm({ ...capsuleForm, unlock: e.target.value })}
                disabled={!operatorUnlocked}
              />
            </label>

            <label>
              Directive note
              <textarea
                rows="4"
                value={capsuleForm.note}
                onChange={(e) => setCapsuleForm({ ...capsuleForm, note: e.target.value })}
                placeholder="Activate this instruction only after the next safe relay contact window."
                disabled={!operatorUnlocked}
              />
            </label>

            <button type="submit" className="primary-btn" disabled={!operatorUnlocked}>
              Save directive
            </button>
          </form>

          <div className="capsule-list">
            {capsules.map((c) => (
              <div key={c.id} className="capsule-card">
                <div className="capsule-head">
                  <strong>{c.title}</strong>
                  <span className="status-badge">{c.status}</span>
                </div>
                <p>{c.note}</p>
                <small>Release when: {c.unlock}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="card section-card">
          <div className="section-head">
            <h2>Protocol board</h2>
            <span className="tag">Hackathon framing</span>
          </div>

          <div className="protocol-list">
            <div>
              <h3>What this MVP is</h3>
              <p>
                A local node simulator for a disruption-tolerant mesh platform, not a normal internet chat app.
              </p>
            </div>
            <div>
              <h3>How judges should read it</h3>
              <p>
                The browser UI represents one device node; the backend simulates its local cache, relay logic,
                rate limiting, and packet lifecycle.
              </p>
            </div>
            <div>
              <h3>Why it fits the prompt</h3>
              <p>
                It prioritizes local storage, short contact windows, delayed forwarding, and operator-safe
                coordination under collapsed infrastructure.
              </p>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}