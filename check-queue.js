import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL);

async function run() {
  const keys = await redis.keys("bull:erp-events*");
  console.log(keys);

  for (const key of keys) {
    console.log(
      key,
      await redis.type(key)
    );
  }

  process.exit(0);
}

run();