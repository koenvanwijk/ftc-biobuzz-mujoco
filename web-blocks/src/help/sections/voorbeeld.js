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
<p><strong>Autonoom: ImuHiveAuto.</strong> Dit voorbeeld rijdt zelf van de start (A6, rood) naar de HIVE, schiet, pakt gele POLLEN op en schiet opnieuw. <strong>Robot:</strong> de shooter zit aan de <strong>voorkant</strong>, de intake (alleen gele POLLEN) aan de <strong>achterkant</strong>, en de camera ligt (landscape) aan de voorkant, 35° omhoog zodat hij de AprilTags van de HIVE goed ziet. Er is <strong>geen gele-balherkenning</strong>: het programma gebruikt geen ColorBlobLocator.</p>
<ul>
  <li><strong>Rijden en draaien</strong> met de IMU: <code>driveStraight</code> houdt de koers vast, <code>turnToHeading</code> draait. <code>goTo</code> rijdt op odometrie (encoders + IMU) naar een veldpunt.</li>
  <li><strong>Positie</strong> met de AprilTag-clusters (<code>localize</code>, <code>localizeAny</code>). Liggende camera: <code>ftcPose.y</code> = vooruit langs de lens, <code>ftcPose.z</code> = omhoog, <code>ftcPose.x</code> = rechts. Omdat de lens 35° omhoog kijkt, rekent het programma zelf de horizontale afstand uit (<code>forwardH</code>) en de hoogte van de cluster (<code>tagZ</code>).</li>
  <li><strong>Schietplek</strong> (<code>goToShootingSpot</code>): in het verlengde van de wip, 1,10&nbsp;m recht voor de opening van de omhoog-CELL, met de voorkant (shooter) recht in de opening (<code>SHOOT_HEADING</code> +90° voor RED AUDIENCE, −90° voor RED SCORING). De robot rijdt via de gang x = −1,0 en y = ±1,2, ruim langs de palen van de wip en de FLOWER bij de muur. Daar stelt hij bij met de tags en richt precies. <code>shootAll</code> schiet 4 keer.</li>
  <li><strong>Gele POLLEN oppakken</strong> (<code>collectAt</code>): de ballen liggen op bekende plekken, dus de robot rijdt naar een startpunt, draait zijn achterkant naar de ballen en rijdt met de intake aan achteruit. Plekken: 1) 4 POLLEN op de vloer bij (−1,58,&nbsp;−1,23); 2) de stapel in de FLOWER bij de achtermuur (−0,59,&nbsp;1,73); 3) de stapel in de FLOWER bij de rode muur (−1,73,&nbsp;−0,59). Zonder sensor kan het programma niet meten of het lukte, dus het schiet daarna gewoon 4 keer.</li>
  <li><strong>Welke CELL staat omhoog?</strong> (<code>shootRound</code>): eerst in het midden (−1,45,&nbsp;0) beide rode clusters meten (<code>decideUpCell</code>, 6 beelden: de hoogste staat omhoog), daarna op de schietplek nog een keer. Alleen schieten als het zeker is.</li>
  <li>Het programma stopt (fase <em>Klaar</em>) als alle 3 plekken gehad zijn of de tijd bijna op is (120&nbsp;s min 5&nbsp;s).</li>
</ul>
<p>Gebruik INIT en START; de telemetry laat de fase, de positie, de schietafstand en het aantal schoten zien.</p>
<p class="help-note">Gaat er iets mis? Kijk in de <em>Runtime-log</em> (Code-paneel, onderaan) voor de foutmelding.</p>
`,
};
