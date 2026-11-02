import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
// Write only after successful generation; never truncate a valid file on CLI failure.
const result = spawnSync('supabase', ['gen','types','typescript','--local'], { encoding: 'utf8' });
if (result.error || result.status !== 0) {
  console.error(result.error?.message || result.stderr);
  process.exit(1);
}
writeFileSync(new URL('../src/shared/lib/database.generated.ts', import.meta.url), result.stdout);
