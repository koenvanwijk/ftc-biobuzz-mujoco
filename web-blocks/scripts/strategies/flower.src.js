/**
 * BIOBUZZ strategy 2 - FLOWERS (red, start A6). Shoots POLLEN into the red-wall FLOWER
 * (red wall, seam 2/3). The shooter has a fixed 75 degree arc that comes down about 1.57 m
 * away, and that point happens to lie on the RED AUDIENCE shooting line: 0.88 m in front of
 * the CELL opening. So the robot lines up there exactly with the HIVE AprilTags, turns towards
 * the FLOWER and shoots; then it collects the floor cluster with the rear intake, shoots that
 * into the FLOWER too, and PARKs. Rule check (TU03 10.5.2): elements in a FLOWER only score when
 * the FLOWER is owned, i.e. its top NECTAR is red. This robot (rearPollen layout) cannot pick up
 * or place NECTAR, so the FLOWER points stay 0: this script measures that.
 */
function runOpMode() {
  TICKS_PER_METER = 1981;
  CAMERA_PITCH_DEG = 45;
  CAMERA_FORWARD_M = 0.24;
  CAMERA_HEIGHT_M = 0.08;
  SHOOT_DISTANCE_M = 0.881;
  FLOWER_X = -1.728;
  FLOWER_Y = -0.594;
  TOTAL_TIME_S = 120;
  robotX = -1.569;
  robotY = 1.476;
  upCell = 0;
  shotsFired = 0;
  cellShots = 0;
  tips = 0;
  initDrive();
  initImu();
  initVision();
  text('Status', 'FLOWER strategy ready. Press START.');
  update();
  waitForStart();
  startT = runtime();
  resetYaw();
  comment('1) The 4 preload POLLEN into the red-wall FLOWER, from the FLOWER spot on the RED AUDIENCE line.');
  show('To the FLOWER shooting spot (AprilTags)');
  goToShootingSpot(1);
  turnTo(angleTo(FLOWER_X - robotX, FLOWER_Y - robotY));
  show('Shooting into the FLOWER');
  shoot(4);
  comment('2) Floor cluster (4 POLLEN) with the rear intake, then shoot them into the FLOWER too.');
  show('Collecting: floor cluster');
  collect(-1.0, -1.229, 0, 0.5);
  show('To the FLOWER shooting spot (AprilTags)');
  goToShootingSpot(1);
  turnTo(angleTo(FLOWER_X - robotX, FLOWER_Y - robotY));
  show('Shooting into the FLOWER');
  shoot(4);
  comment('3) PARK in the red LOADING ZONE.');
  park();
  while (active()) {
    show('Done');
    sleep(200);
  }
}
