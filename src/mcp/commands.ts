/**
 * Command queue for server→viewer communication.
 * Redis-backed for Vercel (cross-Lambda), in-memory fallback for local/stdio.
 */

export interface NetworkData {
  viewUUID: string;
  network: {
    name: string;
    variables: Array<{ name: string; outcomes: string[]; parents: string[] }>;
  };
  posteriors: Record<string, Record<string, number>>;
  evidence: Record<string, string>;
}

export type NababCommand = { type: 'update'; data: NetworkData };

export interface CommandQueue {
  enqueue(viewUUID: string, cmd: NababCommand): Promise<void>;
  poll(viewUUID: string, timeoutMs?: number): Promise<NababCommand[]>;
}

// ─── In-memory queue (local / stdio) ────────────────────────────────

export function createMemoryQueue(): CommandQueue {
  const queues = new Map<string, { commands: NababCommand[]; waiters: Array<() => void> }>();

  return {
    async enqueue(viewUUID, cmd) {
      let q = queues.get(viewUUID);
      if (!q) {
        q = { commands: [], waiters: [] };
        queues.set(viewUUID, q);
      }
      q.commands.push(cmd);
      for (const w of q.waiters) w();
      q.waiters = [];
    },

    async poll(viewUUID, timeoutMs = 30_000) {
      let q = queues.get(viewUUID);

      // Return immediately if commands are waiting
      if (q?.commands.length) return q.commands.splice(0);

      // Long-poll: wait for enqueue or timeout
      await new Promise<void>(resolve => {
        if (!q) {
          q = { commands: [], waiters: [] };
          queues.set(viewUUID, q);
        }
        const timer = setTimeout(resolve, timeoutMs);
        q.waiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });

      q = queues.get(viewUUID);
      return q?.commands.length ? q.commands.splice(0) : [];
    },
  };
}

// ─── Redis queue (Vercel / serverless) ──────────────────────────────

export function createRedisQueue(): CommandQueue | null {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;

  // Dynamic import to avoid requiring @upstash/redis when not needed
  let redis: any = null;
  const getRedis = async () => {
    if (!redis) {
      const { Redis } = await import('@upstash/redis');
      redis = new Redis({ url, token });
    }
    return redis;
  };

  const CMD_KEY = (viewUUID: string) => `nabab:cmd:${viewUUID}`;
  const CMD_TTL = 300; // 5 min

  return {
    async enqueue(viewUUID, cmd) {
      const r = await getRedis();
      await r.rpush(CMD_KEY(viewUUID), JSON.stringify(cmd));
      await r.expire(CMD_KEY(viewUUID), CMD_TTL);
    },

    async poll(viewUUID, timeoutMs = 30_000) {
      const r = await getRedis();
      const deadline = Date.now() + timeoutMs;

      while (Date.now() < deadline) {
        const items: string[] = await r.lrange(CMD_KEY(viewUUID), 0, -1);
        if (items.length > 0) {
          await r.del(CMD_KEY(viewUUID));
          return items.map(i => (typeof i === 'string' ? JSON.parse(i) : i) as NababCommand);
        }
        // Poll interval: 500ms
        await new Promise(resolve => setTimeout(resolve, Math.min(500, deadline - Date.now())));
      }
      return [];
    },
  };
}

// ─── Auto-detect: Redis if configured, else in-memory ───────────────

export function createQueue(): CommandQueue {
  return createRedisQueue() ?? createMemoryQueue();
}
