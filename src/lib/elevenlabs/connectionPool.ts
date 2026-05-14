/**
 * ElevenLabs connection pool.
 * Prevents exceeding concurrent WebSocket limits on ElevenLabs plans.
 * Falls back to Twilio <Say> when pool is exhausted.
 */

const MAX_CONCURRENT = Number(process.env.ELEVENLABS_MAX_CONCURRENT) || 10;
let activeConnections = 0;
const waitQueue: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];
const QUEUE_TIMEOUT_MS = 5000;

/**
 * Acquire a connection slot from the pool.
 * Returns a release function — call it when the connection is closed.
 *
 * @throws Error if pool is exhausted and queue timeout is exceeded
 */
export async function acquireConnection(): Promise<() => void> {
  if (activeConnections < MAX_CONCURRENT) {
    activeConnections++;
    return () => releaseConnection();
  }

  // Queue the request and wait for a slot
  return new Promise<() => void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      const idx = waitQueue.findIndex((e) => e.resolve === resolve);
      if (idx !== -1) waitQueue.splice(idx, 1);
      reject(
        new Error(
          `ElevenLabs connection pool exhausted (max ${MAX_CONCURRENT} concurrent). ` +
          "Falling back to Twilio <Say>. Upgrade your ElevenLabs plan for more concurrency."
        )
      );
    }, QUEUE_TIMEOUT_MS);

    waitQueue.push({
      resolve: () => {
        clearTimeout(timeoutId);
        activeConnections++;
        resolve(() => releaseConnection());
      },
      reject,
    });
  });
}

function releaseConnection(): void {
  if (waitQueue.length > 0) {
    const next = waitQueue.shift();
    next?.resolve();
  } else {
    activeConnections = Math.max(0, activeConnections - 1);
  }
}

/**
 * Get current pool status for monitoring.
 */
export function getPoolStatus(): {
  active: number;
  max: number;
  queued: number;
  utilizationPct: number;
} {
  return {
    active: activeConnections,
    max: MAX_CONCURRENT,
    queued: waitQueue.length,
    utilizationPct: Math.round((activeConnections / MAX_CONCURRENT) * 100),
  };
}
