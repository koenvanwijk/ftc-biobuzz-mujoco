/**
 * Help-sectie: ondersteunde blokken.
 * Bronnen: SUPPORT_MATRIX.md, src/config/extensions.md, toolbox in vendor/ftc-blocks/js/FtcOfflineBlocks.js,
 * stubs in src/ftc-runtime en src/execution/opModeWorker.js.
 */
export default {
  id: 'blokken',
  title: 'Blokken',
  html: `
<p>De toolbox van de Blocks-editor is de officiële FTC-toolbox, aangepast voor de simulator. Hieronder wat de sim doet met elke categorie. De volledige lijst staat in <code>SUPPORT_MATRIX.md</code>.</p>

<h3>Werkt</h3>
<ul>
  <li><strong>LinearOpMode</strong>: <code>waitForStart</code>, <code>sleep</code>, <code>idle</code>, <code>opModeIsActive</code>, <code>isStopRequested</code>. <code>sleep</code> telt in simulatietijd.</li>
  <li><strong>Actuators → DcMotor</strong>: power, direction, zero-power behavior, mode, target position, encoders (<code>getCurrentPosition</code>, <code>STOP_AND_RESET_ENCODER</code>), dual-blokken.</li>
  <li><strong>Actuators → Servo en CRServo</strong>: positie / power / direction / scale range.</li>
  <li><strong>Gamepad</strong> (<code>gamepad1</code>, <code>gamepad2</code>): sticks, triggers, knoppen, D-pad. Deadzone 0,05. Bron: fysieke gamepad of de toetsen/virtuele gamepad.</li>
  <li><strong>Telemetry</strong>: <code>addData</code>, <code>addLine</code>, <code>update</code>, <code>clear</code>.</li>
  <li><strong>Utilities</strong>: ElapsedTime (simulatieklok), Color, Range, System.</li>
  <li><strong>Logic, Loops, Math, Text, Lists, Variables, Functions, Miscellaneous</strong>: gewone Blockly-blokken; draaien in de JavaScript-interpreter.</li>
  <li><strong>Sensors → VoltageSensor</strong>: vaste, instelbare spanning.</li>
</ul>

<h3>Gedeeltelijk of gesimuleerd</h3>
<ul>
  <li><strong>RUN_TO_POSITION / <code>isBusy</code></strong>: eenvoudige benadering, geen echte PID. <strong><code>setVelocity</code></strong> rekent om via ticks/s.</li>
  <li><strong>Sensors → IMU</strong>: gesimuleerd uit de romporiëntatie (yaw/pitch/roll, hoeksnelheid, <code>resetYaw</code>).</li>
  <li><strong>Vision → AprilTag</strong>: gesimuleerde detecties van de BIOBUZZ-tags (ID 30–45, als vier CELL-clusters); <code>robotPose</code> is bewust leeg.</li>
  <li><strong>Vision → ColorBlobLocator</strong>: herkent de gele POLLEN-ballen vanuit de robotcamera. <code>getBlobs</code>, blob-eigenschappen, filters en sortering worden gesimuleerd.</li>
  <li><strong>Vision → VisionPortal</strong> en camerabesturing (exposure, focus, gain, white balance, PTZ): stubs zonder effect op beeld.</li>
  <li><strong>ServoController, REVModule / bulk caching</strong>: alleen status/stubs.</li>
  <li><strong>Hardware-XML import</strong>: de hardwareconfiguratie blijft de vaste BIOBUZZ/REVStarterBot2026-configuratie.</li>
</ul>

<h3>Niet ondersteund</h3>
<ul>
  <li><strong>TFOD en Vuforia</strong>: buiten scope; geen blokken in de toolbox en geen beeldherkenning.</li>
  <li><strong>PIDF-coëfficiënten</strong> en <strong>stroom-alerts</strong> (<code>getCurrent</code>, <code>setCurrentAlert</code>, …): geven een duidelijke foutmelding.</li>
  <li><strong>Gamepad rumble en LED-effecten</strong>, <strong><code>telemetry.speak</code></strong>, <code>saveNextFrameRaw</code> en camera wisselen: niet ondersteund (foutmelding).</li>
  <li><strong>Android</strong> (SoundPool, TextToSpeech): staat nog in de toolbox, maar de sim heeft er geen implementatie voor. Verwacht een fout in de Runtime-log.</li>
  <li><strong>Other Devices</strong> en andere hardware (kleur-, afstands-, touch-sensoren, enz.): de sim heeft alleen de vaste BIOBUZZ-hardware uit de tabel hieronder, plus IMU en webcam.</li>
  <li>Overige <strong>Utilities</strong> die niet in de lijst hierboven staan (bijv. Blackboard, Matrix, Pose2D): niet getest of gegarandeerd.</li>
</ul>
<p class="help-note">Een niet-ondersteund blok stopt de OpMode met een melding in de <em>Runtime-log</em> (status ERROR). Het valt dus nooit stilzwijgend weg.</p>

<h3>BIOBUZZ: wat doen de actuators?</h3>
<p>Op het BIOBUZZ-veld zijn alleen de wielen echte joint-actuators. De rest zijn "soft" mechanismen:</p>
<table class="help-table">
  <thead><tr><th>Blok-apparaat</th><th>Effect in de sim</th></tr></thead>
  <tbody>
    <tr><td><code>leftDrive</code>, <code>rightDrive</code></td><td>Aandrijving. Positieve power = vooruit op beide wielen (zoals op de echte robot; links staat standaard op REVERSE).</td></tr>
    <tr><td><code>intakeMotor</code></td><td>Power &gt; 0,05 = intake aan; &lt; −0,05 = achterste FIFO uitspugen.</td></tr>
    <tr><td><code>flywheel</code></td><td>Stijgende flank van |power| &gt; 0,3 = één schot.</td></tr>
    <tr><td><code>pollenServo</code></td><td>Stijgende flank van positie &gt; 0,7 = nectar plaatsen.</td></tr>
    <tr><td><code>crServo</code></td><td>|power| &gt; 0,3 = achterste FIFO uitwerpen zolang het aanstaat.</td></tr>
  </tbody>
</table>
<p>Encoders van flywheel en intake blijven 0; de wiel-encoders werken wel.</p>
`,
};
