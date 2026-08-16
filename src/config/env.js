import 'dotenv/config';
import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']),
    PORT: z.string().transform(Number).default('5000'),
    FRONTEND_URL: z.string().url().default('https://medassist.viyaninfo.com/'),
    MEDIA_BASE_URL: z.string().url().optional(),
    CORS_ORIGIN: z.string().optional(),
    LOG_LEVEL: z.string().default('info'),
    LOG_OTP: z.string().optional(),
    COOKIE_SECRET: z.string().min(10),
    JWT_SECRET: z.string().min(64, 'JWT_SECRET must be at least 64 characters'),
    REFRESH_SECRET: z.string().min(64, 'REFRESH_SECRET must be at least 64 characters').optional(),
    COOKIE_DOMAIN: z.string().optional(),
    AWS_BUCKET_NAME: z.string().optional(),
    AWS_REGION: z.string().default('us-east-1'),
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    REDIS_URL: z.string().url(),
    RABBITMQ_URL: z.string().url().optional(),
    ENABLE_EVENTBUS: z.string().optional(),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    ENCRYPTION_KEY: z.string().length(64, 'ENCRYPTION_KEY must be 64 hex chars (32 bytes)'),
    SENTRY_DSN: z.string().url().optional(),
  })
  .superRefine((data, ctx) => {
    // #17: REFRESH_SECRET is required in production — sharing it with JWT_SECRET
    // means you can't independently rotate refresh tokens without invalidating all access tokens
    if (data.NODE_ENV === 'production' && !data.REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'REFRESH_SECRET must be separately configured in production (cannot fall back to JWT_SECRET)',
        path: ['REFRESH_SECRET'],
      });
    }

    if (data.NODE_ENV === 'production' && !data.COOKIE_DOMAIN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'COOKIE_DOMAIN must be explicitly configured in production',
        path: ['COOKIE_DOMAIN'],
      });
    }

    if (data.NODE_ENV === 'production' && (!data.CORS_ORIGIN || !data.CORS_ORIGIN.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'CORS_ORIGIN must be explicitly configured in production',
        path: ['CORS_ORIGIN'],
      });
    }

    // #03/#15: LOG_OTP must never be enabled in production — OTPs in logs
    // allow any log-reader to take over user accounts.
    if (data.NODE_ENV === 'production' && data.LOG_OTP === 'true') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'LOG_OTP must not be set to "true" in production — this exposes active OTPs in logs',
        path: ['LOG_OTP'],
      });
    }
  });

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

const validatedEnv = parsedEnv.data;

const corsOrigins =
  validatedEnv.CORS_ORIGIN?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean) || [];

const env = {
  nodeEnv: validatedEnv.NODE_ENV,
  port: validatedEnv.PORT,
  frontendUrl: validatedEnv.FRONTEND_URL,
  mediaBaseUrl: validatedEnv.MEDIA_BASE_URL || 'https://api.medassist.viyaninfo.com',
  cors: {
    origin:
      corsOrigins.length > 0
        ? corsOrigins
        : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000'],
    credentials: true,
  },
  logLevel: validatedEnv.LOG_LEVEL,

  cookieSecret: validatedEnv.COOKIE_SECRET,
  cookieDomain: validatedEnv.COOKIE_DOMAIN,
  jwtSecrets: validatedEnv.JWT_SECRET.split(','),
  refreshSecrets: validatedEnv.REFRESH_SECRET ? validatedEnv.REFRESH_SECRET.split(',') : [],

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

  sentry: {
    dsn: validatedEnv.SENTRY_DSN,
  },
};

export default env;
