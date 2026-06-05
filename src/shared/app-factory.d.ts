import { FastifyInstance } from 'fastify';

interface ServiceAppOptions {
  name: string;
}

declare function createServiceApp(options: ServiceAppOptions): Promise<FastifyInstance>;

export default createServiceApp;
