import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const schema = join(root, 'prisma', 'schema.prisma');
const client = join(root, 'packages', 'database', 'generated', 'client');
const stamp = join(client, '.schema.sha256');
const digest = createHash('sha256').update(readFileSync(schema)).digest('hex');
const clientReady = existsSync(join(client, 'index.js')) && existsSync(join(client, 'index.d.ts'));

if (clientReady) {
  if (!existsSync(stamp)) {
    writeFileSync(stamp, `${digest}\n`);
    console.log('Prisma client already exists, recorded the schema stamp and skipped generate.');
  } else if (readFileSync(stamp, 'utf8').trim() === digest) {
    console.log('Prisma client is up to date, skipping generate.');
  }
  if (!existsSync(stamp) || readFileSync(stamp, 'utf8').trim() === digest) process.exit(0);
}

const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['exec', 'prisma', 'generate', '--schema', 'prisma/schema.prisma'], { cwd: root, stdio: 'inherit', shell: false });
if (result.status !== 0) {
  console.error('\nPrisma Client generation failed. A running Node process may still lock query_engine-windows.dll.node. Stop the old API/test process once, then rerun pnpm dev:api. Normal startup skips generation when the client is already present.');
  process.exit(result.status ?? 1);
}
writeFileSync(stamp, `${digest}\n`);
