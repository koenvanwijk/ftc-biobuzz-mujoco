/** Help-sectie: panelen en weergaveknoppen. */
export default {
  id: 'panelen',
  title: 'Panelen',
  html: `
<p>De app heeft drie panelen naast elkaar (op smalle schermen, onder 1100&nbsp;px breed, onder elkaar):</p>
<table class="help-table">
  <thead><tr><th>Paneel</th><th>Wat zie je?</th></tr></thead>
  <tbody>
    <tr><td><strong>Blocks</strong></td><td>De officiële FTC Blocks-editor (offline, in een iframe). Hier bouw je je OpMode met blokken.</td></tr>
    <tr><td><strong>Sim</strong></td><td>De MuJoCo-simulatie van het BIOBUZZ-veld met de robot. Bovenaan een HUD (Hopper, AprilTags, Rear, Score, Intake, Control: Teleop of OpMode). Ook een virtuele gamepad (L↑/L↓/R↑/R↓) die je met de muis kunt indrukken.</td></tr>
    <tr><td><strong>Code</strong></td><td>Vier stukken onder elkaar: <em>Telemetry</em> (de telemetry van je OpMode plus mechanisme-status; de hoogte is te slepen), <em>JS (gegenereerd)</em>, <em>Java (preview)</em> en de <em>Runtime-log</em> (meldingen en fouten).</td></tr>
  </tbody>
</table>

<h3>Hoe hangen ze samen?</h3>
<ol>
  <li>Jij bouwt blokken in <strong>Blocks</strong>.</li>
  <li>Met <strong>Code vernieuwen</strong> wordt daaruit JavaScript (en een Java-preview) gemaakt en in het <strong>Code</strong>-paneel getoond.</li>
  <li><strong>INIT</strong> draait dat JavaScript in een aparte worker. De OpMode stuurt motoren en servo's aan in de <strong>Sim</strong>.</li>
  <li>Sensoren (encoders, IMU, AprilTags) en je gamepad/toetsen gaan de andere kant op: van de sim naar je blokken. Telemetry en fouten komen terug in het <strong>Code</strong>-paneel.</li>
</ol>

<h3>Weergaveknoppen: Blocks / Sim / Code / Gelijk</h3>
<p>Rechts in de werkbalk. Elke knop maakt één paneel groot; de andere twee worden klein.</p>
<ul>
  <li><strong>Blocks</strong> – Blocks-editor groot (ca. 70% / 15% / 15%).</li>
  <li><strong>Sim</strong> – simulatie groot.</li>
  <li><strong>Code</strong> – code/telemetry groot.</li>
  <li><strong>Gelijk</strong> – terug naar de standaardverdeling (ca. 40% / 35% / 25%). Nogmaals op de actieve knop klikken doet hetzelfde.</li>
</ul>

<h3>Panelen aanpassen</h3>
<ul>
  <li><strong>Slepen:</strong> sleep de dunne verticale balk (splitter) tussen twee panelen om ze groter of kleiner te maken (horizontaal bij smalle schermen). Minimale breedte ca. 120&nbsp;px.</li>
  <li><strong>◀ Inklappen</strong> in de titelbalk van een paneel klapt het op tot een smalle strook; nogmaals klikken klapt het weer uit. Je kunt niet alle drie tegelijk inklappen.</li>
  <li><strong>⛶ Vergroot</strong> in de titelbalk doet hetzelfde als de bijbehorende weergaveknop; nogmaals klikken herstelt Gelijk.</li>
  <li>De indeling blijft bewaard in je browser (<code>localStorage</code>, sleutel <code>ftc-blocks-layout-v1</code>). De sim-canvas past zich automatisch aan.</li>
</ul>
<p class="help-note">Het formaat van de panelen heeft geen invloed op een lopende OpMode of de simulatie.</p>
`,
};
