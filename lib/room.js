const PALETTE = [
  '#4DE1C1', '#FFB454', '#8AB4FF', '#F7739E',
  '#A8E6A1', '#C6A5FF', '#FFD166', '#6FD5FF',
];

const MAX_EVENT_RING = 300;
const MAX_AGENT_LOG = 80;

export const STATES = new Set([
  'booting', 'idle', 'walking', 'thinking', 'working',
  'blocked', 'error', 'done', 'coffee', 'leaving',
]);

export class Room {
  constructor() {
    this.agents = new Map();
    this.clients = new Set();
    this.events = [];
    this.seq = 0;
    this.takenColors = new Set();
    this.startedAt = Date.now();
  }

  pickColor() {
    for (const c of PALETTE) if (!this.takenColors.has(c)) { this.takenColors.add(c); return c; }
    return PALETTE[this.agents.size % PALETTE.length];
  }

  blank(id, patch = {}) {
    return {
      id,
      name: patch.name || `agent-${id.slice(0, 4)}`,
      color: this.pickColor(),
      source: 'external',
      state: 'idle',
      activity: '',
      prompt: null,
      model: null,
      cwd: null,
      sessionId: null,
      runId: null,
      turns: 0,
      toolCalls: 0,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      todos: [],
      todoDone: 0,
      todoTotal: 0,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      endedAt: null,
      closedAt: null,
      lastTool: null,
      skillsUsed: [],
      agentsUsed: [],
      toolStats: [],
      durationMs: null,
      apiMs: null,
      byModel: [],
      hadTools: null,
      hadAgents: null,
      hadSkills: null,
      log: [],
      parent: null,
      ...patch,
    };
  }

  upsert(id, patch = {}) {
    let agent = this.agents.get(id);
    if (!agent) {
      agent = this.blank(id, patch);
      this.agents.set(id, agent);
    } else {
      Object.assign(agent, patch);
    }
    agent.updatedAt = Date.now();
    return agent;
  }

  touch(id, patch = {}) {
    if (!this.agents.has(id)) return null;
    return this.upsert(id, patch);
  }

  pushLog(id, entry) {
    const agent = this.agents.get(id);
    if (!agent) return;
    agent.log.push({ ts: Date.now(), ...entry });
    if (agent.log.length > MAX_AGENT_LOG) agent.log.splice(0, agent.log.length - MAX_AGENT_LOG);
  }

  broadcast(kind, payload) {
    const ev = { seq: ++this.seq, ts: Date.now(), kind, ...payload };
    this.events.push(ev);
    if (this.events.length > MAX_EVENT_RING) this.events.splice(0, this.events.length - MAX_EVENT_RING);
    const frame = `id: ${ev.seq}\ndata: ${JSON.stringify(ev)}\n\n`;
    for (const res of this.clients) {
      try { res.write(frame); } catch { this.clients.delete(res); }
    }
    return ev;
  }

  syncAgent(id, note) {
    const agent = this.agents.get(id);
    if (!agent) return null;
    this.broadcast('agent:update', { agent: serialize(agent), note: note || null });
    if (note) this.broadcast('ticker', tickerLine(agent, note));
    return agent;
  }

  remove(id) {
    const agent = this.agents.get(id);
    if (!agent) return false;
    this.takenColors.delete(agent.color);
    this.agents.delete(id);
    this.broadcast('agent:remove', { id });
    return true;
  }

  snapshot(health) {
    return {
      agents: [...this.agents.values()].map(serialize),
      events: this.events.slice(-60),
      health,
      inventory: this.inventory?.snapshot() ?? null,
      serverStartedAt: this.startedAt,
    };
  }

  addClient(res) {
    this.clients.add(res);
    return () => this.clients.delete(res);
  }
}

function serialize(a) {
  const { log, ...rest } = a;
  return { ...rest, log: log.slice(-25), logLength: log.length };
}

function tickerLine(agent, note) {
  return {
    agentId: agent.id,
    agentName: agent.name,
    color: agent.color,
    state: agent.state,
    // The ticker is prose for a person; note.text stays the terse technical line.
    text: note.human || note.text || '',
    tool: note.tool || null,
    tone: note.kind || 'info',
  };
}
