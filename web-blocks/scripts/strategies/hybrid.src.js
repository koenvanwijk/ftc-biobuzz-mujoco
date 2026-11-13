/**
 * BIOBUZZ strategy 3 - HYBRID / SAFE (red, start A6): HIVE for the points, the back-wall
 * FLOWER as POLLEN supply, GARDEN left alone and an early PARK. Without NECTAR the FLOWERS
 * score nothing for us, so their POLLEN are free to take, while the 4 POLLEN in the GARDEN
 * corner already score 1 point each where they lie. 1) 3 preload POLLEN TIP the RED AUDIENCE
 * CELL (3 NECTAR + 3 POLLEN, +20). 2) Floor cluster into RED SCORING. 3) Back-wall FLOWER
 * (right behind the RED SCORING spot): 8 POLLEN = TIP 2. 4) PARK in the red LOADING ZONE
 * straight away: only the two short, reliable trips, with a large time reserve.
 */
function runOpMode() {
  TICKS_PER_METER = 1981;
  CAMERA_PITCH_DEG = 45;
  CAMERA_FORWARD_M = 0.24;
  CAMERA_HEIGHT_M = 0.08;
  SHOOT_DISTANCE_M = 1.1;
  TOTAL_TIME_S = 120;
  PARK_RESERVE_S = 15;
  robotX = -1.569;
  robotY = 1.476;
  upCell = 0;
  shotsFired = 0;
  cellShots = 0;
  tips = 0;
  initDrive();
  initImu();
  initVision();
  text('Status', 'HYBRID strategy ready. Press START.');
  update();
  waitForStart();
  startT = runtime();
  resetYaw();
  comment('1) 3 preload POLLEN into RED AUDIENCE (holds the 3 red NECTAR): TIP 1. Keep the 4th.');
  scoreInHive(3);
  upCell = 1;
  tips = 1;
  comment('2) Floor cluster: 3 fit next to the kept one (G407: max 4). Leave along the audience wall (TIP spill).');
  show('Collecting: floor cluster');
  backTo(-0.32, -1.58, 0.5);
  goTo(-0.95, -1.58, 0.7);
  collect(-1.0, -1.229, 0, 0.5);
  scoreInHive(4);
  comment('3) Back-wall FLOWER right behind the RED SCORING spot: its POLLEN score nothing there for us. 8 in the CELL = TIP 2.');
  if (elapsed() < TOTAL_TIME_S - PARK_RESERVE_S - 15) {
    show('Collecting: back-wall FLOWER');
    collect(-0.594, 1.05, -90, 0.38);
    scoreInHive(4);
    upCell = 0;
    tips = 2;
  }
  comment('4) PARK right away; the GARDEN POLLEN stay where they score (+1 each).');
  park();
  while (active()) {
    show('Done');
    sleep(200);
  }
}
