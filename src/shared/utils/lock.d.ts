export function acquireLock(
  resource: string,
  ttl?: number,
  customToken?: string | null,
): Promise<boolean>;

export function extendLock(
  resource: string,
  ttl?: number,
  customToken?: string | null,
): Promise<boolean>;

export function startLockHeartbeat(
  resource: string,
  ttl?: number,
  intervalMs?: number | null,
  customToken?: string | null,
): () => void;

export function releaseLock(resource: string, customToken?: string | null): Promise<boolean>;

export function getLockToken(resource: string): string | null;
