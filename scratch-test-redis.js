import IORedis from 'ioredis';

async function test() {
  console.log("Connecting to Redis at 127.0.0.1:6379...");
  const redis = new IORedis('redis://127.0.0.1:6379');
  
  redis.on('error', (err) => {
    console.error("Redis Error Event:", err);
  });

  const pong = await redis.ping();
  console.log("Redis Response:", pong);

  await redis.quit();
  console.log("Disconnected from Redis.");
}

test().catch(console.error);
