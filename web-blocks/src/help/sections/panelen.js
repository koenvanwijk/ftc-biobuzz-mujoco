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
    <tr><td><strong>Sim</strong></td><td>De MuJoCo-simulatie van het BIOBUZZ-veld met de robot. Bovenaan een HUD (Robot x&nbsp;/&nbsp;4, Hopper, Rear, AprilTags, Intake, Control: Teleop of OpMode) met rechts de keuzelijst <strong>Camera-zichtveld</strong>. Linksboven in beeld het <strong>score-paneel</strong> (zie hieronder), rechtsboven het <em>camerabeeld van de robot</em>; de lichtblauwe piramide op de robot laat zien wat die camera ziet.</td></tr>
    <tr><td><strong>Code</strong></td><td>Drie stukken onder elkaar: <em>Telemetry</em> (de telemetry van je OpMode plus mechanisme-status; de hoogte is te slepen), de <em>Route</em>-plot (bovenaanzicht van de gereden route; tab <em>JS</em> toont de gegenereerde code) en de <em>Runtime-log</em> (meldingen en fouten).</td></tr>
  </tbody>
</table>

<h3>Hoe hangen ze samen?</h3>
<ol>
  <li>Jij bouwt blokken in <strong>Blocks</strong>.</li>
  <li>Het tabblad <strong>JS</strong> toont de JavaScript van je blokken en wordt automatisch bijgewerkt na een wijziging; <strong>Code vernieuwen</strong> doet hetzelfde meteen.</li>
  <li><strong>INIT</strong> draait dat JavaScript in een aparte worker. De OpMode stuurt motoren en servo's aan in de <strong>Sim</strong>.</li>
  <li>Sensoren (encoders, IMU, AprilTags) en je gamepad/toetsen gaan de andere kant op: van de sim naar je blokken. Telemetry en fouten komen terug in het <strong>Code</strong>-paneel.</li>
</ol>

<h3>Score-paneel en spelregels (Competition Manual TU03)</h3>
<p>Linksboven in het simbeeld staat de score per alliantie (<span style="color:#ff7b7b">Rood</span> / <span style="color:#7bb4ff">Blauw</span>), volgens §10.5 en Table 10-2/10-3. Klik op de kop om het paneel in of uit te klappen; in een smal simpaneel klapt het vanzelf in (alleen de totalen). Het getal tussen haakjes is het aantal (TIPs, elementen, FLOWERS).</p>
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
  <li><strong>Veldindeling:</strong> de rode LOADING ZONE (lichtrood vak tegen de rode muur) ligt op TILE A5, de blauwe op F2. De GARDENS (smalle strook in de hoek) liggen op A1 en F6. Extra NECTAR na een TIP komt in de eigen LOADING ZONE het veld op. Het sim-veld ligt zoals de figuren in het handboek: vanaf het publiek gezien zit rood links. De rode GARDEN ligt aan de publiekszijde, de robot start achterin (A6).</li>
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
  <li>Een andere stand past meteen het camerabeeld rechtsboven, de blauwe piramide en de <strong>AprilTag-detectie</strong> aan. Naast de keuzelijst staat het huidige zichtveld (H × V) en de resolutie.</li>
  <li>FTC streamt standaard <strong>640×480</strong> (4:3). Dat is een uitsnede uit het 16:9-beeld van de Brio: de hoogte blijft gelijk, de zijkanten vallen weg. Zet je OpMode met <code>setCameraResolution</code> bijvoorbeeld 1280×720, dan wordt het beeld breder (16:9) tot de volgende INIT of Reset sim.</li>
  <li>Een tag telt als <em>gezien</em> als hij binnen de rechthoek van het beeld valt (horizontaal én verticaal binnen het zichtveld), binnen 2,5&nbsp;m, en ongeveer naar de camera gericht is.</li>
  <li>De keuze blijft bewaard in je browser (<code>localStorage</code>, sleutel <code>ftc-sim-camera-dfov-v1</code>).</li>
  <li>De <strong>POLLEN-detectie</strong> (ColorBlobLocator) gebruikt de <strong>achtercamera</strong> (zie hieronder) met dezelfde stand en resolutie. Een bal telt als hij (deels) in het beeld valt.</li>
</ul>
<h3>Twee camera's: Voor en Achter</h3>
<p>De robot heeft twee Brio 4K-camera's:</p>
<ul>
  <li><strong>Voor</strong> (<code>Webcam 1</code>, lichtblauw): liggend aan de voorkant, 8&nbsp;cm boven de mat, 35° omhoog. Voor de <strong>AprilTags</strong> van de HIVE (schieten).</li>
  <li><strong>Achter</strong> (<code>Webcam 2</code>, oranje): liggend achterop (x −0,18&nbsp;m), 24,4&nbsp;cm boven de mat, achteruit en <strong>50° omlaag</strong> naar de vloer. Bij stand 90° ziet hij de vloer van ±6&nbsp;cm tot ±55&nbsp;cm achter de lens, precies waar gele POLLEN de achter-intake in gaan. Voor de <strong>POLLEN-detectie</strong> (ColorBlobLocator).</li>
</ul>
<p>Met de knoppen <strong>Voor / Achter</strong> in de HUD kies je welke camera het beeld rechtsboven toont. De actieve knop is gekleurd, ernaast staat <em>Actieve camera: …</em>, de rand van het camerabeeld krijgt dezelfde kleur en de kijkpiramide van de actieve camera is fel (de andere vaag). Beide camera's detecteren altijd; de knop kiest alleen de weergave. Bewaard in je browser (<code>ftc-sim-active-camera-v1</code>). Montage achter: <code>simulation.json</code> → <code>webcam.camera.rearMount</code> (met <code>yawDeg: 180</code> = achteruit).</p>
<h3>Camerapositie en kanteling</h3>
<p>Waar de camera op de robot zit, stel je in <code>robots/BIOBUZZ/simulation.json</code> → <code>webcam.camera.mount</code> in: <code>x</code> (vooruit), <code>y</code> (links), <code>z</code> (omhoog, vanaf de robot-oorsprong; lenshoogte boven de mat ≈ <code>z</code> + 4,4&nbsp;cm) en <code>pitchDeg</code> (graden omhoog). De camera is altijd liggend (<code>rollDeg: 0</code>).</p>
<p><strong>Standaard</strong> (robot met shooter voor en intake achter): <strong>liggend</strong> aan de voorkant, lens <strong>8&nbsp;cm</strong> boven de mat (<code>x: 0.24, z: 0.036</code>), <code>pitchDeg: 45</code>, stand <strong>90°</strong>, 640×480 (66° × 52°). Zo ziet hij de AprilTags van de omhoog-CELL vanaf de schietplekken (1,1&nbsp;m voor de opening) en vanuit het midden (−1,45,&nbsp;0) beide rode clusters, in beide standen van de HIVE. De vloer ziet hij dan niet; dat hoeft ook niet, ImuHiveAuto zoekt geen gele ballen.</p>

<h3>Panelen aanpassen</h3>
<ul>
  <li><strong>Slepen:</strong> sleep de dunne verticale balk (splitter) tussen twee panelen om ze groter of kleiner te maken (horizontaal bij smalle schermen). Minimale breedte ca. 120&nbsp;px.</li>
  <li><strong>◀ Inklappen</strong> in de titelbalk van een paneel klapt het op tot een smalle strook; nogmaals klikken klapt het weer uit. Je kunt niet alle drie tegelijk inklappen.</li>
  <li><strong>⛶ Vergroot</strong> in de titelbalk maakt dat paneel groot; nogmaals klikken herstelt de standaardverdeling.</li>
  <li>De indeling blijft bewaard in je browser (<code>localStorage</code>, sleutel <code>ftc-blocks-layout-v1</code>). De sim-canvas past zich automatisch aan.</li>
</ul>
<p class="help-note">Het formaat van de panelen heeft geen invloed op een lopende OpMode of de simulatie.</p>
`,
};
