import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().min(1).default('127.0.0.1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  WEB_ORIGIN: z.string().url().default('http://127.0.0.1:5173'),
  SETLISTFM_API_KEY: z.string().min(1, 'is required'),
  SPOTIFY_CLIENT_ID: z.string().min(1, 'is required'),
  SPOTIFY_CLIENT_SECRET: z.string().min(1, 'is required'),
  SPOTIFY_REDIRECT_URI: z
    .string()
    .url()
    .refine((value) => new URL(value).hostname !== 'localhost', {
      message: 'Spotify rejects "localhost"; use 127.0.0.1 or an https URL',
    }),
});

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  host: string;
  logLevel: string;
  /** Origin (scheme + host + port) of the browser app; used for redirects and CSRF origin checks. */
  webOrigin: string;
  cookieSecure: boolean;
  setlistFmApiKey: string;
  spotify: { clientId: string; clientSecret: string; redirectUri: string };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${details}\nSee .env.example.`);
  }
  const e = parsed.data;
  const webOrigin = new URL(e.WEB_ORIGIN).origin;
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    host: e.HOST,
    logLevel: e.LOG_LEVEL,
    webOrigin,
    cookieSecure: webOrigin.startsWith('https:'),
    setlistFmApiKey: e.SETLISTFM_API_KEY,
    spotify: {
      clientId: e.SPOTIFY_CLIENT_ID,
      clientSecret: e.SPOTIFY_CLIENT_SECRET,
      redirectUri: e.SPOTIFY_REDIRECT_URI,
    },
  };
}
