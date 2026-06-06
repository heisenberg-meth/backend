import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).default('5000'),
  FRONTEND_URL: z.string().url().default('https://medassist.viyaninfo.com/'),
  CORS_ORIGIN: z.string().optional(),
  LOG_LEVEL: z.string().default('info'),
  COOKIE_SECRET: z.string().min(10),
  JWT_SECRET: z.string().min(10),
  AWS_BUCKET_NAME: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  REDIS_URL: z.string().url().default('redis://red-d8btcp4m0tmc73erfe0g:6379'),
  RABBITMQ_URL: z.string().url().default('amqp://guest:guest@localhost:5672'),
  ENABLE_EVENTBUS: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

const validatedEnv = parsedEnv.data;

const env = {
  nodeEnv: validatedEnv.NODE_ENV,
  port: validatedEnv.PORT,
  frontendUrl: validatedEnv.FRONTEND_URL,
  cors: {
    origin: validatedEnv.CORS_ORIGIN?.split(',') || [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3000',
      'https://medassist-backend-hryu.onrender.com',
      'https://medassist.viyaninfo.com',
    ],
    credentials: true,
  },
  logLevel: validatedEnv.LOG_LEVEL,

  cookieSecret: validatedEnv.COOKIE_SECRET,
  jwtSecrets: validatedEnv.JWT_SECRET.split(','),

  s3: {
    bucketName: validatedEnv.AWS_BUCKET_NAME,
    region: validatedEnv.AWS_REGION,
    accessKey: validatedEnv.AWS_ACCESS_KEY_ID,
    secretKey: validatedEnv.AWS_SECRET_ACCESS_KEY,
  },

  cloudinary: {
    cloudName: validatedEnv.CLOUDINARY_CLOUD_NAME,
    apiKey: validatedEnv.CLOUDINARY_API_KEY,
    apiSecret: validatedEnv.CLOUDINARY_API_SECRET,
  },

  redis: {
    url: validatedEnv.REDIS_URL,
  },

  rabbitmq: {
    url: validatedEnv.RABBITMQ_URL,
    enabled: validatedEnv.ENABLE_EVENTBUS !== 'false',
  },

  razorpay: {
    keyId: validatedEnv.RAZORPAY_KEY_ID,
    keySecret: validatedEnv.RAZORPAY_KEY_SECRET,
  },
};

export default env;
