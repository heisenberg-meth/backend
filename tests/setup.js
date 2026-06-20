import { beforeAll, afterAll, jest } from '@jest/globals';
import logger from '../src/shared/utils/logger.js';
import process from 'node:process';

jest.unstable_mockModule('bullmq', () => {
  return {
    Queue: class MockQueue {
      constructor(name) {
        this.name = name;
      }
      async add() {
        return { id: 'mock-job-id' };
      }
      async close() {}
      async getJobs() {
        return [];
      }
      async clean() {}
      on() {
        return this;
      }
      off() {
        return this;
      }
    },
    Worker: class MockWorker {
      constructor(name) {
        this.name = name;
      }
      async close() {}
      on() {
        return this;
      }
      off() {
        return this;
      }
    },
  };
});

if (process.env.NODE_ENV === 'test' && !process.env.FORCE_REAL_REDIS) {
  delete process.env.REDIS_URL;
}

beforeAll(async () => {
  const { default: prisma } = await import('../src/config/prisma.js');
  const workerId = process.env.JEST_WORKER_ID || '1';
  const schemaName = `__prisma_test_${workerId}__`;

  // Test DB cleanup (schema drop) - Only if using a real Prisma client
  if (typeof prisma.$executeRawUnsafe === 'function') {
    try {
      await prisma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE;`);
      await prisma.$executeRawUnsafe(`CREATE SCHEMA "${schemaName}";`);
    } catch (err) {
      logger.warn(
        '[SETUP] Could not connect to database for schema setup. Skipping DB initialization.',
        err,
      );
    }
  }

  // Update the prisma client to use this schema
  // Note: This only works if we re-initialize or if we use raw queries for everything
  // In this project, most tests use mocks, but those that use the real DB need this.
  // Actually, standard Prisma parallel testing usually involves setting DATABASE_URL with the schema.
});

afterAll(async () => {
  const { cleanupResources } = await import('../src/shared/utils/cleanup.js');
  await cleanupResources();
});
