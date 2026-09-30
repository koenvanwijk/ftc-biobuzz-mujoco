/** Help-sectie: werkbalkknoppen (zonder debugger; zie debugger.js). */
export default {
  id: 'knoppen',
  title: 'Knoppen',
  html: `
<p>De werkbalk, van links naar rechts:</p>
<table class="help-table">
  <thead><tr><th>Knop</th><th>Wat doet het?</th></tr></thead>
  <tbody>
    <tr><td><strong>Voorbeeld</strong> (keuzelijst)</td><td>Kies een voorbeeld-OpMode: <em>TankDrive</em>, <em>Mechanisms</em>, <em>EncoderAuto</em>, <em>ImuAprilTag</em> of <em>DebugDemo</em>. Er gebeurt nog niets tot je op <em>Open in editor</em> klikt.</td></tr>
    <tr><td><strong>Open in editor</strong></td><td>Laadt het gekozen voorbeeld in de Blocks-editor en vult meteen het JS- en Java-paneel.</td></tr>
    <tr><td><strong>Code vernieuwen</strong></td><td>Leest de huidige blokken uit de editor en maakt opnieuw JS en Java. <strong>Klik hierop nadat je zelf blokken hebt aangepast</strong>, voordat je INIT drukt: INIT gebruikt de code die al in het JS-paneel staat, en haalt alleen verse code op als dat paneel (bijna) leeg is.</td></tr>
    <tr><td><strong>Export Java</strong></td><td>Downloadt de Java-versie van je blokken als bestand (naam = gekozen voorbeeld + <code>.java</code>, anders <code>OpMode.java</code>).</td></tr>
    <tr><td><strong>INIT</strong></td><td>Reset de robot en runtime, start je OpMode en draait tot <code>waitForStart</code>. Vanaf nu bestuurt de OpMode de robot (HUD: Control = OpMode). INIT is uitgeschakeld zolang een OpMode loopt.</td></tr>
    <tr><td><strong>START</strong></td><td>Gaat verder voorbij <code>waitForStart</code>: de OpMode loopt (<code>opModeIsActive</code> = waar). Alleen actief na INIT.</td></tr>
    <tr><td><strong>STOP</strong></td><td>Stopt de OpMode, zet drive en mechanismen op nul en geeft de robot terug aan de toetsenbordbesturing (idle teleop). Werkt ook in INIT en tijdens een debugger-pauze.</td></tr>
    <tr><td><strong>Reset sim</strong></td><td>Stopt de OpMode, zet de robot terug op de startpositie, reset de runtime en wist de telemetry. Gebruik dit om opnieuw te beginnen.</td></tr>
    <tr><td><strong>Blocks · Sim · Code · Gelijk</strong></td><td>Weergaveknoppen, zie <a href="#help-panelen" data-help-link="panelen">Panelen</a>.</td></tr>
    <tr><td><strong>Help</strong></td><td>Opent dit venster. Sluiten met <kbd>Esc</kbd>, de ✕-knop of een klik naast het venster. De simulatie loopt gewoon door.</td></tr>
  </tbody>
</table>
<p>Naast de werkbalk staat rechtsboven de <strong>run-status</strong> (Idle, INIT, WAIT_FOR_START, RUN, DONE, ERROR, of een melding dat MuJoCo nog laadt). Bij een fout staat de details in de <em>Runtime-log</em>.</p>
<p>De <strong>Debug</strong>-knoppen staan apart beschreven bij <a href="#help-debugger" data-help-link="debugger">Debugger</a>.</p>
`,
};
