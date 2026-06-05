export function acquireLock(resource: string, ttl: number): Promise<boolean>;

export function releaseLock(resource: string): Promise<void>;
