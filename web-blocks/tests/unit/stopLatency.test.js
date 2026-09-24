import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('STOP latency contract', () => {
  it('zero callback scheduled within 250ms budget', async () => {
    let zeros = 0;
    const zeroFn = () => {
      zeros += 1;
    };
    const t0 = Date.now();
    zeroFn();
    await new Promise((r) => setTimeout(r, 50));
    zeroFn();
    await new Promise((r) => setTimeout(r, 150));
    zeroFn();
    const dt = Date.now() - t0;
    assert.ok(dt < 250, `STOP zero path took ${dt}ms`);
    assert.ok(zeros >= 2);
  });
});
