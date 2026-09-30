/** Help-sectie: stapsgewijs voorbeeld (TankDrive). */
export default {
  id: 'voorbeeld',
  title: 'Voorbeeld: TankDrive rijden',
  html: `
<p>In vijf minuten de robot laten rijden met het voorbeeld <em>TankDrive</em>. De OpMode zet <code>leftPow</code> en <code>rightPow</code> op het omgekeerde van de linker en rechter stick en stuurt beide wielen aan. Ook komen de encoders (<em>L enc</em>, <em>R enc</em>) in de telemetry.</p>
<ol class="help-steps">
  <li>Kies in de keuzelijst <strong>Voorbeeld</strong> de optie <strong>TankDrive</strong> en klik op <strong>Open in editor</strong>. De blokken verschijnen in het Blocks-paneel en in het Code-paneel staat nu JS en Java.</li>
  <li>Klik op <strong>INIT</strong>. De robot gaat naar de startpositie en de OpMode wacht op <code>waitForStart</code>. <strong>START</strong> en <strong>STOP</strong> worden actief.</li>
  <li>Klik op <strong>START</strong>. De OpMode loopt nu in de <code>opModeIsActive</code>-lus.</li>
  <li>Klik op de simulatie (niet in de Blocks-editor) zodat het toetsenbord bij de pagina hoort.</li>
  <li>Houd <kbd>W</kbd> en <kbd>I</kbd> tegelijk ingedrukt: beide wielen draaien vooruit en de robot rijdt rechtdoor. <kbd>S</kbd> en <kbd>K</kbd> samen = achteruit.</li>
  <li>Houd alleen <kbd>W</kbd> ingedrukt (alleen het linkerwiel) en de robot draait naar rechts. Alleen <kbd>I</kbd> draait naar links.</li>
  <li>Kijk in het Code-paneel bij <strong>Telemetry</strong>: de waarden <em>L enc</em> en <em>R enc</em> lopen op zolang de wielen draaien.</li>
  <li>Klik op <strong>STOP</strong>. De motoren gaan uit en je kunt weer vrij rijden met de idle-toetsen (HUD: Control = Teleop). Met <strong>Reset sim</strong> begin je opnieuw.</li>
</ol>
<p><strong>Zelf aanpassen?</strong> Verander een blok in de editor, klik op <strong>Code vernieuwen</strong>, en dan weer <strong>INIT</strong> en <strong>START</strong>. Zet eventueel eerst <strong>Debug</strong> aan om blok voor blok mee te kijken.</p>
<p class="help-note">Gaat er iets mis? Kijk in de <em>Runtime-log</em> (Code-paneel, onderaan) voor de foutmelding.</p>
`,
};
