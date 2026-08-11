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

if (clientReady && existsSync(stamp) && readFileSync(stamp, 'utf8').trim() === digest) {
  console.log('Prisma client is up to date, skipping generate.');
  process.exit(0);
}

const result = spawnSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['exec', 'prisma', 'generate', '--schema', 'prisma/schema.prisma'], { cwd: root, stdio: 'inherit', shell: false });
if (result.status !== 0) {
  console.error('\nPrisma Client generation failed. On Windows this usually means query_engine-windows.dll.node is locked by a running API/test process. Stop the previous dev process, then run pnpm dev:api again.');
  process.exit(result.status ?? 1);
}
writeFileSync(stamp, `${digest}\n`);
