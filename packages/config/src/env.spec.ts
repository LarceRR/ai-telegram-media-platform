import { EnvValidationError, isStorageConfigured, parseEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://atmp:atmp@localhost:5432/atmp?schema=public',
  REDIS_URL: 'redis://localhost:6379',
};

describe('parseEnv', () => {
  it('applies defaults for optional values', () => {
    const env = parseEnv({ ...base } as NodeJS.ProcessEnv);

    expect(env.NODE_ENV).toBe('development');
    expect(env.API_PORT).toBe(3001);
    expect(env.API_GLOBAL_PREFIX).toBe('api/v1');
    expect(env.CORS_ALLOWED_ORIGINS).toEqual(['http://localhost:3000']);
    expect(env.WORKER_CONCURRENCY).toBe(5);
  });

  it('splits CORS origins into a list', () => {
    const env = parseEnv({
      ...base,
      CORS_ALLOWED_ORIGINS: 'http://a.local, http://b.local',
    } as NodeJS.ProcessEnv);

    expect(env.CORS_ALLOWED_ORIGINS).toEqual(['http://a.local', 'http://b.local']);
  });

  it('fails fast when a required value is missing', () => {
    expect(() => parseEnv({ REDIS_URL: base.REDIS_URL } as NodeJS.ProcessEnv)).toThrow(
      EnvValidationError,
    );
  });

  it('rejects a non-postgres database url', () => {
    expect(() =>
      parseEnv({ ...base, DATABASE_URL: 'mysql://localhost:3306/db' } as NodeJS.ProcessEnv),
    ).toThrow(EnvValidationError);
  });

  it('treats storage as unconfigured unless every field is present', () => {
    const env = parseEnv({ ...base, S3_ENDPOINT: 'http://localhost:9000' } as NodeJS.ProcessEnv);
    expect(isStorageConfigured(env)).toBe(false);
  });
});
