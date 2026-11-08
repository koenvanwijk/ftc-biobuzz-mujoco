import { it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

it('ships all four original recordings unmodified, not placeholders', () => {
  const expected = {
    flywheel: '9b4a8b2c4c82df4d61df1659c289d4eb18878a4541308aee02fda4712a047247',
    intake: '166231791e12e551193f277396dd65d1017d5659d72b57b30173bd4414683017',
    drive: 'eb81038ba62366ccacf4a03cb083bf4bc304f366c5cf18506642875ee78185b5',
    collision: 'da6992e61e2f5b2d03718960a8f3fec0a5accf94a4103947797e43d6224870c7',
  };
  for (const [name, hash] of Object.entries(expected)) {
    const bytes = readFileSync(new URL(`../../public/audio/${name}.m4a`, import.meta.url));
    assert.equal(bytes.subarray(4, 8).toString(), 'ftyp', name);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, name);
  }
});
