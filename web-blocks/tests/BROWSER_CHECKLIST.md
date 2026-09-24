# Browser-checklist

## Automatisch / deels gecontroleerd (2026-09-23 CE(S)T)

| Check | Resultaat |
|-------|-----------|
| `npm install` / `npm run build` | OK (Vite build + MuJoCo wasm) |
| `npm test` (16 tests) | OK |
| `npm run smoke` | OK (artifacts + tests) |
| HTTP 200: app, vendor editor, interpreter, worker, scene, examples | OK (`npm run dev` :5174) |
| Headless Chrome dump-dom na load | `runStatus` = **Idle** (boot + MuJoCo klaar) |
| Volledige INIT/START/STOP met Blocks → physics | **Niet** end-to-end in headless geautomatiseerd |
| .blk bewerken/opslaan/heropenen in UI | Handmatig te doen |
| Gamepad/toetsenbord tijdens teleop | Handmatig te doen |

## Handmatig (aanbevolen)

1. `npm run dev` → http://localhost:5174
2. Voorbeeld TankDrive openen → INIT → START → W/S/I/K → wielen bewegen
3. STOP tijdens loop → motoren stil ≤250ms
4. Mechanisms: trigger/A/B/stick → flywheel/intake/servo/CRServo
5. EncoderAuto: INIT/START → encoders naar target, idle-loop hangt niet
6. Export .blk + Java; herlaad .blk
