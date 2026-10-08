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
    <tr><td><strong>Sim</strong></td><td>De MuJoCo-simulatie van het BIOBUZZ-veld met de robot. Bovenaan een HUD (Robot x&nbsp;/&nbsp;4, Hopper, Rear, AprilTags, Score, Intake, Control: Teleop of OpMode) met rechts de keuzelijst <strong>Camera-zichtveld</strong> en het vinkje <strong>Portret</strong> (zie hieronder). Linksboven in beeld het <strong>score-paneel</strong> (zie hieronder), rechtsboven het <em>camerabeeld van de robot</em>; de lichtblauwe piramide op de robot laat zien wat die camera ziet. Ook een virtuele gamepad (L↑/L↓/R↑/R↓) die je met de muis kunt indrukken.</td></tr>
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

<h3>Score-paneel en spelregels (Competition Manual TU03)</h3>
<p>Linksboven in het simbeeld staat de score per alliantie (<span style="color:#ff7b7b">Rood</span> / <span style="color:#7bb4ff">Blauw</span>), volgens §10.5 en Table 10-2/10-3. Klik op de kop om het paneel in of uit te klappen; in een smal simpaneel klapt het vanzelf in (alleen de totalen) en in een heel smal simpaneel verdwijnt het (de totalen staan altijd ook in de HUD bij <strong>Score</strong>). Het getal tussen haakjes is het aantal (TIPs, elementen, FLOWERS).</p>
<table class="help-table">
  <thead><tr><th>Rij</th><th>Punten</th><th>Wanneer?</th></tr></thead>
  <tbody>
    <tr><td><strong>HIVE TIP</strong></td><td>20</td><td>Live, elke keer dat de eigen HIVE kantelt.</td></tr>
    <tr><td><strong>In CELL</strong></td><td>2 per element</td><td>POLLEN/NECTAR die stil in de omhoog-CELL van de eigen HIVE ligt.</td></tr>
    <tr><td><strong>BLOEM eigenaar</strong></td><td>2 per element</td><td>Alle elementen in een FLOWER (tussen middelste en bovenste ring) waarvan jouw NECTAR de bovenste is.</td></tr>
    <tr><td><strong>Onderste NECTAR</strong></td><td>+5 per FLOWER</td><td>Jouw NECTAR is de onderste scorende NECTAR in die FLOWER.</td></tr>
    <tr><td><strong>GARDEN</strong></td><td>1 per element</td><td>POLLEN/NECTAR (deels) in de eigen GARDEN.</td></tr>
    <tr><td><strong>LEAVE*</strong></td><td>3</td><td>Indicatief: de robot raakt de muur niet meer. Blijft staan tot <em>Reset sim</em>.</td></tr>
    <tr><td><strong>PARK* (nu)</strong></td><td>5</td><td>Indicatief: "als nu geparkeerd" — de robot staat nu (deels) in de eigen LOADING ZONE.</td></tr>
    <tr><td><strong>SWARM* RP</strong></td><td>1 RP</td><td>LEAVE + PARK samen ≥ 16 (met één robot haal je hier max. 8).</td></tr>
    <tr><td><strong>POLLINATOR RP</strong></td><td>1 + 1 RP</td><td>≥ 4 TIPS en ≥ 7 TIPS.</td></tr>
  </tbody>
</table>
<ul>
  <li>CELL, FLOWER, onderste NECTAR en GARDEN rekent de sim uit de <em>huidige</em> veldtoestand: "als de wedstrijd nu zou eindigen". Alleen elementen die <strong>stilliggen</strong> en niet in de robot zitten tellen; rolt er nog iets, dan staat dat onder de tabel.</li>
  <li><strong>* Indicatief:</strong> er is nog <strong>geen wedstrijdklok</strong> (AUTO/TELEOP). Daarom tellen AUTO PARK, WIN/TIE en fouten/penalty's niet mee, en zegt LEAVE niet of het in AUTO gebeurde.</li>
  <li><strong>HIVE kantelt</strong> bij <strong>8 POLLEN</strong> of <strong>3 NECTAR + 3 POLLEN</strong> in de omhoog-CELL (Event Field Setup Guide §12.3). Bij de start liggen er al 3 NECTAR in, dus 3 POLLEN erin schieten kantelt de HIVE.</li>
  <li><strong>G407:</strong> de robot mag maximaal <strong>4</strong> elementen tegelijk hebben (voorhopper + achtercompartiment samen). Hij start met 4 preload-POLLEN, dus eerst schieten voordat de intake iets nieuws oppakt. HUD: <em>Robot x&nbsp;/&nbsp;4</em> (oranje = vol).</li>
  <li>Je robot hoort bij <strong>rood</strong>. Hij start tegen de rode muur, buiten de LOADING ZONE, met 4 POLLEN (G304). Beginscore: rood 10 en blauw 10 (de 3 NECTAR in de omhoog-CELL en de 4 POLLEN in de GARDEN).</li>
  <li><strong>Veldindeling:</strong> de rode LOADING ZONE (lichtrood vak tegen de rode muur) ligt op TILE A5, de blauwe op F2. De GARDENS (smalle strook in de hoek) liggen op A1 en F6. Extra NECTAR na een TIP komt in de eigen LOADING ZONE het veld op. Let op: het sim-veld is gespiegeld t.o.v. de figuren in het handboek. De publiekszijde is de muur bij de rode GARDEN; zie README.</li>
</ul>

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
<p><strong>Standaard</strong> (geometriestudie, bijgesteld zodat nabije ballen niet onder het beeld vallen): portret, lens <strong>16,5&nbsp;cm</strong> boven de mat vóór de intake (<code>x: 0.24, z: 0.121</code>), <code>pitchDeg: 17.5</code>, stand <strong>90°</strong>, 640×480.</p>
<ul>
  <li>Je ziet de vloer-POLLEN vanaf ±0,46&nbsp;m (onderrand −15,7°) en de hoge tags (1,25&nbsp;m) vanaf ±0,9&nbsp;m: beide tegelijk als de robot <strong>±0,9–1,6&nbsp;m</strong> van de tags staat en naar de HIVE kijkt. Dat lukt op ±61&nbsp;% van de veldposities, en tijdens het richten op ±95&nbsp;% van de (aangenomen) schietzone (±1,1–1,5&nbsp;m). Eerdere standaard 18,5&nbsp;cm/+22,5° keek over nabije ballen heen (pas vanaf ±0,79&nbsp;m).</li>
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
