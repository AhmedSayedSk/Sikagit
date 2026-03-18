import { Router, Request, Response } from 'express';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import * as db from '../services/db';
import { io } from '../index';

const router = Router();
const activeProcesses = new Map<string, ChildProcess>();
const detectedPorts = new Map<string, number>();

// Ring buffer of recent output lines per repo (survives client refresh)
const MAX_BUFFER_LINES = 500;
const outputBuffers = new Map<string, string[]>();

function bufferOutput(repoId: string, line: string) {
  let buf = outputBuffers.get(repoId);
  if (!buf) {
    buf = [];
    outputBuffers.set(repoId, buf);
  }
  buf.push(line);
  if (buf.length > MAX_BUFFER_LINES) {
    buf.splice(0, buf.length - MAX_BUFFER_LINES);
  }
}

// ─── Process stats (CPU + Memory) ───

interface ProcStats {
  cpuPercent: number;
  memMB: number;
}

const NUM_CPUS = require('os').cpus().length;
const CLK_TCK = 100; // Standard on Linux
const prevCpu = new Map<string, { total: number; time: number }>();

function getDescendantPids(pid: number): number[] {
  // Read all /proc entries and find children recursively
  const pids: number[] = [pid];
  try {
    const entries = fs.readdirSync('/proc').filter(e => /^\d+$/.test(e));
    const ppidMap = new Map<number, number[]>();
    for (const e of entries) {
      try {
        const stat = fs.readFileSync(`/proc/${e}/stat`, 'utf8');
        const parts = stat.split(') ');
        if (parts.length < 2) continue;
        const fields = parts[1].split(' ');
        const ppid = parseInt(fields[1], 10);
        const p = parseInt(e, 10);
        if (!ppidMap.has(ppid)) ppidMap.set(ppid, []);
        ppidMap.get(ppid)!.push(p);
      } catch { /* process gone */ }
    }
    // BFS to find all descendants
    const queue = [pid];
    while (queue.length > 0) {
      const p = queue.shift()!;
      const children = ppidMap.get(p) || [];
      for (const c of children) {
        pids.push(c);
        queue.push(c);
      }
    }
  } catch { /* ignore */ }
  return pids;
}

function readProcStats(key: string, pid: number): ProcStats | null {
  try {
    const pids = getDescendantPids(pid);
    let totalUtime = 0;
    let totalStime = 0;
    let totalRss = 0;

    for (const p of pids) {
      try {
        const stat = fs.readFileSync(`/proc/${p}/stat`, 'utf8');
        const parts = stat.split(') ');
        if (parts.length < 2) continue;
        const fields = parts[1].split(' ');
        totalUtime += parseInt(fields[11], 10); // utime
        totalStime += parseInt(fields[12], 10); // stime
        totalRss += parseInt(fields[21], 10);   // rss in pages
      } catch { /* process gone */ }
    }

    const totalCpuTicks = totalUtime + totalStime;
    const now = Date.now();
    const prev = prevCpu.get(key);
    let cpuPercent = 0;

    if (prev) {
      const dtSec = (now - prev.time) / 1000;
      if (dtSec > 0) {
        const dTicks = totalCpuTicks - prev.total;
        cpuPercent = (dTicks / CLK_TCK / dtSec / NUM_CPUS) * 100;
        cpuPercent = Math.min(Math.max(cpuPercent, 0), 100 * NUM_CPUS);
      }
    }

    prevCpu.set(key, { total: totalCpuTicks, time: now });

    const pageSize = 4096;
    const memMB = (totalRss * pageSize) / (1024 * 1024);

    return { cpuPercent: Math.round(cpuPercent * 10) / 10, memMB: Math.round(memMB * 10) / 10 };
  } catch {
    return null;
  }
}

// Poll stats every 2 seconds for all active processes
setInterval(() => {
  for (const [key, child] of activeProcesses) {
    if (!child.pid) continue;
    const stats = readProcStats(key, child.pid);
    if (stats) {
      io.emit(`run:stats:${key}`, stats);
    }
  }
}, 2000);

// Strip non-color ANSI sequences (cursor movement, erase, etc.) but keep SGR color codes
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /\u001b\[[0-9]*[ABCDEFGHJKST]|\u001b\[\?[0-9;]*[hl]|\u001b\[=[0-9]*[A-Za-z]|\r/g;
function stripControl(str: string): string {
  return str.replace(CONTROL_RE, '');
}

// Strip ALL ANSI for pattern matching (SGR color codes too)
// eslint-disable-next-line no-control-regex
const ALL_ANSI_RE = /\u001b\[[0-9;]*[A-Za-z]/g;
function stripAllAnsi(str: string): string {
  return str.replace(ALL_ANSI_RE, '');
}

// Matches webpack-style progress lines: [XX%] stage (detail)
const PROGRESS_RE = /^\[(\d+)%\]\s+(\S+)/;

// Lines to suppress entirely (noisy duplicates)
const SUPPRESS_RE = /^Build finished at .* by 0\.000s$/;

// Common patterns dev servers use to announce their port
const PORT_PATTERNS = [
  /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::\]):(\d+)/i,   // http://localhost:8080
  /(?:listening|running|started|serving|available)\s+(?:on|at)\s+.*?(?:port\s+)?(\d{3,5})/i,  // Listening on port 3000
  /port\s*[=:]\s*(\d{3,5})/i,                                         // port=3000 or port: 3000
  /on\s+port\s+(\d{3,5})/i,                                           // on port 3000
];

function detectPort(line: string): number | null {
  // Strip ANSI for pattern matching
  // eslint-disable-next-line no-control-regex
  const plain = line.replace(/\u001b\[[0-9;]*m/g, '');
  for (const re of PORT_PATTERNS) {
    const m = plain.match(re);
    if (m) {
      const port = parseInt(m[1], 10);
      if (port >= 1024 && port <= 65535) return port;
    }
  }
  return null;
}

// Per-repo state for coalescing noisy progress output
interface OutputState {
  lastStage: string;
  lastEmittedPercent: number;   // last percent we actually sent to client
  flushTimer: ReturnType<typeof setTimeout> | null;
  pendingLine: string;
}

const outputStates = new Map<string, OutputState>();

function getOutputState(repoId: string): OutputState {
  let state = outputStates.get(repoId);
  if (!state) {
    state = { lastStage: '', lastEmittedPercent: 0, flushTimer: null, pendingLine: '' };
    outputStates.set(repoId, state);
  }
  return state;
}

function clearOutputState(repoId: string) {
  const state = outputStates.get(repoId);
  if (state?.flushTimer) clearTimeout(state.flushTimer);
  outputStates.delete(repoId);
}

function processOutput(repoId: string, raw: string) {
  const cleaned = stripControl(raw);
  const lines = cleaned.split('\n');

  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (!trimmed) continue;

    // Use plain text (no ANSI at all) for pattern matching
    const plain = stripAllAnsi(trimmed).trim();
    if (!plain) continue;

    // Suppress duplicate noise lines
    if (SUPPRESS_RE.test(plain)) continue;

    // Try to detect port (only if not already detected for this run)
    if (!detectedPorts.has(repoId)) {
      const port = detectPort(plain);
      if (port) {
        detectedPorts.set(repoId, port);
        const repo = db.getRepoById(repoId);
        const runTarget = repo?.isWSL ? 'wsl' : 'windows';
        io.emit(`run:port:${repoId}`, { port, runTarget });
      }
    }

    const match = plain.match(PROGRESS_RE);
    if (match) {
      const percent = parseInt(match[1], 10);
      const stage = match[2];
      const state = getOutputState(repoId);

      // Emit immediately only on: stage change, or 25%+ jump
      const shouldEmit = stage !== state.lastStage || percent >= state.lastEmittedPercent + 25;

      if (shouldEmit) {
        if (state.flushTimer) {
          clearTimeout(state.flushTimer);
          state.flushTimer = null;
        }
        state.lastStage = stage;
        state.lastEmittedPercent = percent;
        state.pendingLine = '';
        bufferOutput(repoId, plain + '\n');
        io.emit(`run:output:${repoId}`, plain + '\n');
      } else {
        // Buffer — only emit the latest after 500ms of quiet
        state.pendingLine = plain;
        if (state.flushTimer) clearTimeout(state.flushTimer);
        state.flushTimer = setTimeout(() => {
          if (state.pendingLine) {
            bufferOutput(repoId, state.pendingLine + '\n');
            io.emit(`run:output:${repoId}`, state.pendingLine + '\n');
            state.lastEmittedPercent = percent;
            state.pendingLine = '';
          }
          state.flushTimer = null;
        }, 500);
      }
    } else {
      const state = getOutputState(repoId);
      // Flush any buffered progress before emitting a normal line
      if (state.pendingLine) {
        if (state.flushTimer) clearTimeout(state.flushTimer);
        bufferOutput(repoId, state.pendingLine + '\n');
        io.emit(`run:output:${repoId}`, state.pendingLine + '\n');
        state.pendingLine = '';
        state.flushTimer = null;
      }
      bufferOutput(repoId, trimmed + '\n');
      io.emit(`run:output:${repoId}`, trimmed + '\n');
    }
  }
}

// POST /api/v1/run/:id/start
router.post('/:id/start', (req: Request, res: Response) => {
  const repo = db.getRepoById(req.params.id);
  if (!repo) {
    res.status(404).json({ success: false, error: 'Repository not found' });
    return;
  }
  if (!repo.runCommand) {
    res.status(400).json({ success: false, error: 'No run command configured for this repository' });
    return;
  }
  if (activeProcesses.has(repo.id)) {
    res.status(409).json({ success: false, error: 'Command is already running' });
    return;
  }

  // Clear previous state
  detectedPorts.delete(repo.id);
  outputBuffers.delete(repo.id);

  // If a fixed port is configured, set PORT env and append --port flag
  let cmd = repo.runCommand;
  const portEnv: Record<string, string> = {};
  if (repo.runPort) {
    portEnv.PORT = String(repo.runPort);
    // Append --port flag if the command doesn't already have one
    if (!/--port\b/.test(cmd)) {
      cmd = `${cmd} --port ${repo.runPort}`;
    }
    detectedPorts.set(repo.id, repo.runPort);
  }

  // Force Webpack mode for Next.js 16+ (Turbopack ignores WATCHPACK_POLLING;
  // its own polling requires per-project next.config changes).
  // Webpack respects WATCHPACK_POLLING, so --webpack ensures HMR works.
  if (/\bnext\s+dev\b/.test(cmd) && !/--webpack\b/.test(cmd) && !/--turbopack\b/.test(cmd)) {
    cmd = cmd.replace(/\bnext\s+dev\b/, 'next dev --webpack');
  }

  const child = spawn('sh', ['-c', cmd], {
    cwd: repo.path,
    env: {
      ...process.env,
      FORCE_COLOR: '1',
      // Enable polling-based file watching for HMR inside Docker
      // (inotify doesn't work reliably on mounted host volumes)
      WATCHPACK_POLLING: 'true',       // Next.js / Webpack
      CHOKIDAR_USEPOLLING: 'true',     // Vite, CRA, Angular, most Node.js tools
      CHOKIDAR_INTERVAL: '1000',       // 1s poll interval (reduce CPU)
      ...portEnv,
    },
    detached: true,
  });

  activeProcesses.set(repo.id, child);

  child.stdout?.on('data', (data: Buffer) => {
    processOutput(repo.id, data.toString());
  });

  child.stderr?.on('data', (data: Buffer) => {
    processOutput(repo.id, data.toString());
  });

  child.on('exit', (code) => {
    clearOutputState(repo.id);
    detectedPorts.delete(repo.id);
    prevCpu.delete(repo.id);
    activeProcesses.delete(repo.id);
    io.emit(`run:exit:${repo.id}`, code ?? 1);
  });

  child.on('error', (err) => {
    clearOutputState(repo.id);
    detectedPorts.delete(repo.id);
    prevCpu.delete(repo.id);
    activeProcesses.delete(repo.id);
    bufferOutput(repo.id, `Error: ${err.message}\n`);
    io.emit(`run:output:${repo.id}`, `Error: ${err.message}\n`);
    io.emit(`run:exit:${repo.id}`, 1);
  });

  const runTarget = repo.isWSL ? 'wsl' : 'windows';

  // If port is pre-configured, emit it right away
  if (repo.runPort) {
    io.emit(`run:port:${repo.id}`, { port: repo.runPort, runTarget });
  }

  res.json({ success: true, data: { status: 'started', runTarget, port: repo.runPort ?? null } });
});

// POST /api/v1/run/:id/stop — idempotent
router.post('/:id/stop', (req: Request, res: Response) => {
  const child = activeProcesses.get(req.params.id);
  if (child && child.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }
  }
  res.json({ success: true, data: { wasRunning: !!child } });
});

// GET /api/v1/run/:id/status
router.get('/:id/status', (req: Request, res: Response) => {
  const running = activeProcesses.has(req.params.id);
  const port = detectedPorts.get(req.params.id);
  const repo = db.getRepoById(req.params.id);
  const runTarget = repo?.isWSL ? 'wsl' : 'windows';
  res.json({ success: true, data: { running, port: port ?? null, runTarget } });
});

// GET /api/v1/run/:id/output — returns buffered output lines
router.get('/:id/output', (req: Request, res: Response) => {
  const lines = outputBuffers.get(req.params.id) ?? [];
  res.json({ success: true, data: { lines } });
});

// ─── Build endpoints ───

const buildKey = (id: string) => `build:${id}`;

// POST /api/v1/run/:id/build
router.post('/:id/build', (req: Request, res: Response) => {
  const repo = db.getRepoById(req.params.id);
  if (!repo) {
    res.status(404).json({ success: false, error: 'Repository not found' });
    return;
  }
  if (!repo.buildCommand) {
    res.status(400).json({ success: false, error: 'No build command configured for this repository' });
    return;
  }
  const bk = buildKey(repo.id);
  if (activeProcesses.has(bk)) {
    res.status(409).json({ success: false, error: 'Build is already running' });
    return;
  }

  outputBuffers.delete(bk);

  const child = spawn('sh', ['-c', repo.buildCommand], {
    cwd: repo.path,
    env: { ...process.env, FORCE_COLOR: '1' },
    detached: true,
  });

  activeProcesses.set(bk, child);

  child.stdout?.on('data', (data: Buffer) => {
    processOutput(bk, data.toString());
  });

  child.stderr?.on('data', (data: Buffer) => {
    processOutput(bk, data.toString());
  });

  child.on('exit', (code) => {
    clearOutputState(bk);
    prevCpu.delete(bk);
    activeProcesses.delete(bk);
    io.emit(`run:exit:${bk}`, code ?? 1);
  });

  child.on('error', (err) => {
    clearOutputState(bk);
    prevCpu.delete(bk);
    activeProcesses.delete(bk);
    bufferOutput(bk, `Error: ${err.message}\n`);
    io.emit(`run:output:${bk}`, `Error: ${err.message}\n`);
    io.emit(`run:exit:${bk}`, 1);
  });

  const runTarget = repo.isWSL ? 'wsl' : 'windows';
  res.json({ success: true, data: { status: 'started', runTarget } });
});

// POST /api/v1/run/:id/build/stop
router.post('/:id/build/stop', (req: Request, res: Response) => {
  const bk = buildKey(req.params.id);
  const child = activeProcesses.get(bk);
  if (child && child.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      try { child.kill('SIGKILL'); } catch { /* ignore */ }
    }
  }
  res.json({ success: true, data: { wasRunning: !!child } });
});

// GET /api/v1/run/:id/build/status
router.get('/:id/build/status', (req: Request, res: Response) => {
  const bk = buildKey(req.params.id);
  const running = activeProcesses.has(bk);
  const repo = db.getRepoById(req.params.id);
  const runTarget = repo?.isWSL ? 'wsl' : 'windows';
  res.json({ success: true, data: { running, runTarget } });
});

// GET /api/v1/run/:id/build/output
router.get('/:id/build/output', (req: Request, res: Response) => {
  const bk = buildKey(req.params.id);
  const lines = outputBuffers.get(bk) ?? [];
  res.json({ success: true, data: { lines } });
});

export default router;
