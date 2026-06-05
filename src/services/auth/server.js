import createServiceApp from '../../shared/app-factory.js';
import authRoutes from '../../modules/auth/routes/auth.fastify.routes.js';

const start = async () => {
  const app = await createServiceApp({
    name: 'Auth Service',
    description: 'Handles authentication and user management',
  });

  await app.register(authRoutes, { prefix: '/api/auth' });

  const port = process.env.SERVICE_PORT || 5001;
  app.listen({ port, host: '0.0.0.0' });
};

start();
