/** Help-sectie: werkbalkknoppen (zonder debugger; zie debugger.js). */
export default {
  id: 'knoppen',
  title: 'Knoppen',
  html: `
<p>De werkbalk, van links naar rechts:</p>
<table class="help-table">
  <thead><tr><th>Knop</th><th>Wat doet het?</th></tr></thead>
  <tbody>
    <tr><td><strong>Voorbeeld</strong> (keuzelijst)</td><td>Kies een voorbeeld-OpMode: <em>TankDrive</em>, <em>Mechanisms</em>, <em>EncoderAuto</em>, <em>ImuAprilTag</em>, <em>ImuHiveAuto</em>, de drie strategieën <em>StrategyHive</em>, <em>StrategyFlower</em> en <em>StrategyHybrid</em>, of <em>DebugDemo</em>. Er gebeurt nog niets tot je op <em>Open in editor</em> klikt.</td></tr>
    <tr><td><strong>Open in editor</strong></td><td>Laadt het gekozen voorbeeld in de Blocks-editor en vult meteen het JS-paneel.</td></tr>
    <tr><td><strong>Code vernieuwen</strong></td><td>Leest de huidige blokken uit de editor en maakt opnieuw de JS. Het JS-paneel volgt blokwijzigingen automatisch (met een korte vertraging, zodat slepen en typen niet storen). Deze knop ververst meteen. INIT gebruikt de code die al in het JS-paneel staat, en haalt alleen verse code op als dat paneel (bijna) leeg is. Tijdens een lopende of debug-run wordt alleen de weergave bijgewerkt, niet de code die al draait.</td></tr>
    <tr><td><strong>Export Java</strong></td><td>Downloadt de Java-versie van je blokken als bestand (naam = gekozen voorbeeld + <code>.java</code>, anders <code>OpMode.java</code>).</td></tr>
    <tr><td><strong>INIT</strong></td><td>Reset de robot en runtime, start je OpMode en draait tot <code>waitForStart</code>. Vanaf nu bestuurt de OpMode de robot (HUD: Control = OpMode). INIT is uitgeschakeld zolang een OpMode loopt.</td></tr>
    <tr><td><strong>START</strong></td><td>Gaat verder voorbij <code>waitForStart</code>: de OpMode loopt (<code>opModeIsActive</code> = waar). Alleen actief na INIT.</td></tr>
    <tr><td><strong>STOP</strong></td><td>Stopt de OpMode, zet drive en mechanismen op nul en geeft de robot terug aan de toetsenbordbesturing (idle teleop). Werkt ook in INIT en tijdens een debugger-pauze.</td></tr>
    <tr><td><strong>Geluid aanzetten</strong></td><td>Activeert de vier robotopnamen na een bewuste klik (browser-autoplay). Flywheel, intake en rijden herhalen zolang de bijbehorende motor actief is, ook achteruit; botsingen spelen één keer per impact, niet tijdens blijvend contact. Klik opnieuw om te dempen. Geluid stopt bij pauze, reset of een verborgen tab; na STOP hervat de gewone idle-teleop.</td></tr>
    <tr><td><strong>Touch-besturing</strong></td><td>Toont een virtuele joystick linksonder in het simbeeld (rijden = gamepad1 left stick) en een schietknop rechtsboven (Right Trigger, net als Space/F). Op telefoons en tablets standaard aan (liggend/landscape), niet op een laptop met touchscreen en muis: fullscreen sim met joystick linksonder, <em>Schiet</em> linksboven (Right Trigger) en <em>Intake</em> rechtsboven (Right Bumper). In portret zie je “Draai je telefoon om te spelen”. Blocks/code/debug zijn verborgen. Op desktop blijft de layout hetzelfde; overlays kun je hier aan- of uitzetten. Werkt in idle teleop én tijdens een OpMode. Een fysieke gamepad wint als die beweegt.</td></tr>
    <tr><td><strong>Reset sim</strong></td><td>Stopt de OpMode, zet de robot terug op de startpositie, reset de runtime en wist de telemetry. Gebruik dit om opnieuw te beginnen.</td></tr>
    <tr><td><strong>Help</strong></td><td>Opent dit venster. Sluiten met <kbd>Esc</kbd>, de ✕-knop of een klik naast het venster. De simulatie loopt gewoon door.</td></tr>
  </tbody>
</table>
<p>Naast de werkbalk staat rechtsboven de <strong>run-status</strong> (Idle, INIT, WAIT_FOR_START, RUN, DONE, ERROR, of een melding dat MuJoCo nog laadt). Bij een fout staat de details in de <em>Runtime-log</em>.</p>
<p>De <strong>Debug</strong>-knoppen staan apart beschreven bij <a href="#help-debugger" data-help-link="debugger">Debugger</a>.</p>
`,
};
