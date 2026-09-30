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
| .blk in editor openen/bewerken (voorbeeld) | Handmatig te doen |
| Gamepad/toetsenbord tijdens teleop | Handmatig te doen |

## Handmatig (aanbevolen)

1. `npm run dev` → http://localhost:5174
2. Voorbeeld TankDrive openen → INIT → START → W/S/I/K of ↑/↓ → wielen bewegen (←/→ = leftStickX)
3. STOP tijdens loop → motoren stil ≤250ms
4. Mechanisms: trigger/A/B/stick → flywheel/intake/servo/CRServo
5. EncoderAuto: INIT/START → encoders naar target, idle-loop hangt niet
6. Export Java; herlaad voorbeeld / editor project

## Debugger (handmatig aanbevolen)

1. TankDrive openen → **Debug** aan → INIT → OpMode pauzeert bij het eerste blok (gele rand, status *Gepauzeerd bij blok…*).
2. **Stap** herhaaldelijk; na START door de `opModeIsActive`-loop stappen. Sim-tijd/robot staan stil tijdens pauze.
3. Blok selecteren → **● Breakpoint** → **Doorgaan** → stopt bij dat blok (ook in de loop).
4. **Variabelen:** voorbeeld **DebugDemo** openen → Debug aan → INIT → **Stap**: paneel *Variabelen* toont `teller`/`totaal`/`i`; na het blok *set teller to 0* staat `teller = 0` **geel** en in de statusregel (`… · teller = 0`); een `variables_get` in het huidige blok is **blauw**. Na *for*-blok: `i = 1` geel. Waarden grijs tussen Stap en volgende pauze; paneel weg na STOP / Debug uit.
5. **Stap in vs. over:** bij het blok *verhoog* (aanroep): **Stap** → pauze bij het definitieblok `to verhoog` (functie-diepte 2 in het paneel), verder Stap loopt door de functie-blokken. Opnieuw INIT: **Stap over** op *verhoog* → volgende pauze bij *change teller by 100* met `totaal = 30` en `teller = 15` (functie is uitgevoerd, body niet gestapt). **Stap uit** binnen de functie → pauze bij het blok na de aanroep (knop is uit op diepte 1).
6. **Breakpoint in functie + Stap over:** breakpoint op *set totaal to teller * 2* in `verhoog` → Stap over op *verhoog* pauzeert toch in de functie (Breakpoint-status).
7. **Pauzeer** tijdens `Doorgaan`; **STOP** tijdens pauze. Debug uit → normale Run ongewijzigd, JS-paneel bevat geen `highlightBlock`.
