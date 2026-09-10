export function acquireLock(resource: string, ttl?: number): Promise<boolean>;

export function extendLock(resource: string, ttl?: number): Promise<boolean>;

export function startLockHeartbeat(resource: string, ttl?: number, intervalMs?: number): () => void;

export function releaseLock(resource: string): Promise<void>;
