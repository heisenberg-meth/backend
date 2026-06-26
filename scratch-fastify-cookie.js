import Fastify from 'fastify';
import cookie from '@fastify/cookie';

const fastify = Fastify();
fastify.register(cookie);

fastify.get('/', (req, reply) => {
  reply.clearCookie('accessToken', { path: '/', secure: true, sameSite: 'none' });
  reply.setCookie('accessToken', 'my-new-token', { domain: '.example.com', path: '/', secure: true, sameSite: 'none' });
  reply.send('ok');
});

fastify.inject({ method: 'GET', url: '/' }).then((res) => {
  console.log(res.headers['set-cookie']);
});
