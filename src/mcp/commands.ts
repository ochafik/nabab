/**
 * Command queue for server→viewer communication.
 * In-memory queue (local stdio server and the Cloudflare Durable Object).
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

export function createQueue(): CommandQueue {
  return createMemoryQueue();
}
