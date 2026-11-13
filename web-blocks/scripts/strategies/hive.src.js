/**
 * BIOBUZZ strategy 1 - HIVE (red, start A6 against the red wall). Every POLLEN goes into the
 * up red CELL with the front shooter, for as many TIPs as possible. The RED AUDIENCE CELL
 * starts with the 3 red NECTAR in it, so 3 POLLEN already TIP it (+20). Then the rear intake
 * collects 4 POLLEN at a time on known red-side spots (floor cluster, back-wall FLOWER,
 * red-wall FLOWER, GARDEN corner) and shoots them into the up red CELL: 8 POLLEN = next TIP.
 * Each pick-up spot is chosen close to the previous shooting spot, where the position was
 * just fixed with the HIVE AprilTags (odometry = IMU + encoders in between). PARK at the end.
 */
function runOpMode() {
  TICKS_PER_METER = 1981;
  CAMERA_PITCH_DEG = 45;
  CAMERA_FORWARD_M = 0.24;
  CAMERA_HEIGHT_M = 0.08;
  SHOOT_DISTANCE_M = 1.1;
  TOTAL_TIME_S = 120;
  PARK_RESERVE_S = 12;
  comment('Start pose (field metres): red wall, tile A6, facing +X (the HIVE).');
  robotX = -1.569;
  robotY = 1.476;
  upCell = 0;
  shotsFired = 0;
  cellShots = 0;
  tips = 0;
  initDrive();
  initImu();
  initVision();
  text('Status', 'HIVE strategy ready. Press START.');
  update();
  waitForStart();
  startT = runtime();
  resetYaw();
  comment('1) 3 preload POLLEN into RED AUDIENCE (holds 3 NECTAR): TIP 1. Keep the 4th.');
  scoreInHive(3);
  upCell = 1;
  tips = 1;
  comment('2) Floor cluster next to the red wall (3 fit next to the kept one, G407: max 4), into RED SCORING.');
  show('Collecting: floor cluster');
  comment('The TIP spills NECTAR/POLLEN towards this spot: leave along the audience wall first.');
  backTo(-0.32, -1.58, 0.5);
  goTo(-0.95, -1.58, 0.7);
  collect(-1.0, -1.229, 0, 0.5);
  scoreInHive(4);
  comment('3) Back-wall FLOWER right behind the RED SCORING spot: 4 more = 8 POLLEN: TIP 2.');
  if (elapsed() < TOTAL_TIME_S - PARK_RESERVE_S - 15) {
    show('Collecting: back-wall FLOWER');
    collect(-0.594, 1.05, -90, 0.38);
    scoreInHive(4);
    upCell = 0;
    tips = 2;
  }
  comment('4) Red-wall FLOWER, into RED AUDIENCE (up again).');
  if (elapsed() < TOTAL_TIME_S - PARK_RESERVE_S - 25) {
    show('Collecting: red-wall FLOWER');
    goTo(-1.1, 1.15, 1);
    collect(-1.05, -0.594, 0, 0.4);
    scoreInHive(4);
  }
  comment('5) GARDEN corner row next to the RED AUDIENCE spot (1 point each where they lie, 2 in the CELL).');
  if (elapsed() < TOTAL_TIME_S - PARK_RESERVE_S - 22) {
    show('Collecting: GARDEN corner');
    collect(-1.15, -1.64, 0, 0.45);
    scoreInHive(4);
  }
  park();
  while (active()) {
    show('Done');
    sleep(200);
  }
}
