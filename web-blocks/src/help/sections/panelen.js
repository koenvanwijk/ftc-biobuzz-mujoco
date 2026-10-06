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
    <tr><td><strong>Sim</strong></td><td>De MuJoCo-simulatie van het BIOBUZZ-veld met de robot. Bovenaan een HUD (Hopper, AprilTags, Rear, Score, Intake, Control: Teleop of OpMode) met rechts de keuzelijst <strong>Camera-zichtveld</strong> en het vinkje <strong>Portret</strong> (zie hieronder). Rechtsboven in beeld het <em>camerabeeld van de robot</em>; de lichtblauwe piramide op de robot laat zien wat die camera ziet. Ook een virtuele gamepad (L↑/L↓/R↑/R↓) die je met de muis kunt indrukken.</td></tr>
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

<h3>Robotcamera en Camera-zichtveld</h3>
<p>De gesimuleerde robotcamera is een <strong>Logitech Brio 4K</strong>, net als op de echte robot. Die camera heeft drie standen voor het (diagonale) zichtveld; die kies je op de echte camera met Logi Tune of G HUB, en in de sim met de keuzelijst <strong>Camera-zichtveld</strong> in de HUD:</p>
<table class="help-table">
  <thead><tr><th>Stand</th><th>Zichtveld bij 640×480 (H × V)</th><th>Bij 1280×720 (H × V)</th></tr></thead>
  <tbody>
    <tr><td><strong>Brio 4K 90°</strong> (standaard)</td><td>66° × 52°</td><td>82° × 52°</td></tr>
    <tr><td><strong>78°</strong></td><td>56° × 43°</td><td>70° × 43°</td></tr>
    <tr><td><strong>65°</strong></td><td>45° × 35°</td><td>58° × 35°</td></tr>
  </tbody>
</table>
<ul>
  <li>Een andere stand past meteen het camerabeeld rechtsboven, de blauwe piramide en de <strong>AprilTag-detectie</strong> aan. Naast de keuzelijst staat het huidige zichtveld (H × V zoals je het rechtop ziet) en de resolutie.</li>
  <li>FTC streamt standaard <strong>640×480</strong> (4:3). Dat is een uitsnede uit het 16:9-beeld van de Brio: de hoogte blijft gelijk, de zijkanten vallen weg. Zet je OpMode met <code>setCameraResolution</code> bijvoorbeeld 1280×720, dan wordt het beeld breder (16:9) tot de volgende INIT of Reset sim.</li>
  <li>Een tag telt als <em>gezien</em> als hij binnen de rechthoek van het beeld valt (horizontaal én verticaal binnen het zichtveld), binnen 2,5&nbsp;m, en ongeveer naar de camera gericht is.</li>
  <li>De keuze blijft bewaard in je browser (<code>localStorage</code>, sleutel <code>ftc-sim-camera-dfov-v1</code>).</li>
  <li>De <strong>POLLEN-detectie</strong> (ColorBlobLocator) gebruikt precies dezelfde camera: zelfde stand, resolutie en positie. Een bal telt als hij (deels) in het beeld valt.</li>
</ul>
<h3>Portret: camera 90° gedraaid (standaard)</h3>
<p>Standaard zit de camera <strong>op zijn kant</strong> (portret, 90° om de lens gedraaid). Het beeld wordt dan smal en hoog: bij 640×480 en stand 90° is het rechtop <strong>52° breed × 66° hoog</strong> (480×640), bij 1280×720 zelfs 52° × 82°. Zo passen de POLLEN op de vloer én de AprilTags van de omhoog-CELL samen in één beeld, ook als de camera wat hoger zit.</p>
<ul>
  <li>Het vinkje <strong>Portret</strong> naast de keuzelijst zet de camera direct terug op liggend (of weer op portret). Bewaard in je browser (<code>ftc-sim-camera-orientation-v1</code>).</li>
  <li>Het camerabeeld rechtsboven staat rechtop (smal en hoog); de blauwe piramide draait mee.</li>
  <li><strong>Let op:</strong> de detecties komen, net als op de echte robot, uit het <em>sensorbeeld</em> van 640×480, dat 90° gedraaid is. De FTC-SDK draait een gedraaide webcam niet terug. Bij POLLEN-blobs is <code>X</code> dan "omhoog/omlaag" (kleine X = onderaan in de wereld) en <code>Y</code> "links/rechts" (kleine Y = links). Ook bij AprilTags zijn x/z van <code>ftcPose</code> (en dus bearing/elevation) gedraaid. ROI's gelden ook in dat sensorbeeld.</li>
</ul>
<h3>Camerapositie en kanteling</h3>
<p>Waar de camera op de robot zit, stel je in <code>robots/BIOBUZZ/simulation.json</code> → <code>webcam.camera</code> in: <code>orientation</code> (<code>"portrait"</code> of <code>"landscape"</code>) en <code>mount</code> met <code>x</code> (vooruit), <code>y</code> (links), <code>z</code> (omhoog, vanaf de robot-oorsprong; lenshoogte boven de mat ≈ <code>z</code> + 4,4&nbsp;cm), <code>pitchDeg</code> (graden omhoog) en <code>rollDeg</code> (90 = portret; −90 als de camera andersom gedraaid zit).</p>
<p><strong>Standaard</strong> (uit de geometriestudie): portret, lens <strong>18,5&nbsp;cm</strong> boven de mat vóór de intake (<code>x: 0.24, z: 0.141</code>), <code>pitchDeg: 22.5</code>, stand <strong>90°</strong>, 640×480.</p>
<ul>
  <li>Je ziet de vloer vanaf ±0,8&nbsp;m en de hoge tags (1,25&nbsp;m) vanaf ±0,7&nbsp;m: beide tegelijk als de robot <strong>±0,8–1,6&nbsp;m</strong> van de tags staat en naar de HIVE kijkt. Dat lukt op ±72&nbsp;% van de veldposities, en tijdens het richten op ±96&nbsp;% van de plekken waar de sim-shooter een POLLEN in de CELL krijgt (schietafstand ±1,1–1,5&nbsp;m).</li>
  <li>Liggend op dezelfde plek lukt het nergens (onderrand pas −3,6°: vloer pas vanaf ±2,4&nbsp;m). Liggend kan alleen heel laag (±6,5&nbsp;cm boven de mat, <code>z: 0.021</code>, +22,5°: ±55&nbsp;% van de posities).</li>
  <li>De oude positie (32&nbsp;cm boven de mat, +39,7°, liggend) ziet de tags goed, maar de vloer nooit.</li>
  <li>78° en 65° hebben te weinig zichtveld hiervoor. Occlusie (HIVE-poten, eigen intake, andere robots) is niet meegenomen.</li>
</ul>

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
