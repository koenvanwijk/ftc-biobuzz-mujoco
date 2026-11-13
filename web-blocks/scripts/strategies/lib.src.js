/**
 * IMU yaw in degrees (counter-clockwise = positive). 0 = the heading at START, which on the
 * BIOBUZZ field is +X (the red start faces the HIVE).
 */
function readHeading() {
  return yaw();
}

/**
 * Heading error targetHeading - heading, normalised to (-180, 180].
 */
function headingError(targetHeading) {
  err = targetHeading - readHeading();
  while (err > 180) {
    err = err - 360;
  }
  while (err <= -180) {
    err = err + 360;
  }
  return err;
}

/**
 * angle (degrees) of the vector (ax, ay), like atan2.
 */
function angleTo(ax, ay) {
  if (ax > 0) {
    ang = atanDeg(ay / ax);
  } else if (ax < 0) {
    if (ay >= 0) {
      ang = atanDeg(ay / ax) + 180;
    } else {
      ang = atanDeg(ay / ax) - 180;
    }
  } else if (ay >= 0) {
    ang = 90;
  } else {
    ang = -90;
  }
  return ang;
}

/**
 * Turn in place to targetHeading (degrees) with a P controller on the IMU yaw.
 * Max power 0.7, min 0.12, done within 1.5 degrees or after 2.5 s.
 */
function turnTo(targetHeading) {
  tStart = runtime();
  err = headingError(targetHeading);
  while (active() && Math.abs(err) > 1.5 && runtime() - tStart < 2.5) {
    turnPower = clamp(err * 0.015, -0.7, 0.7);
    if (Math.abs(turnPower) < 0.12) {
      if (err > 0) {
        turnPower = 0.12;
      } else {
        turnPower = -0.12;
      }
    }
    drive(-turnPower, turnPower);
    err = headingError(targetHeading);
  }
  drive(0, 0);
  sleep(60);
}

/**
 * Drive `meters` on the encoders while holding targetHeading (IMU). power < 0 drives
 * backwards (rear intake first). Slows down over the last 30 cm. Updates the odometry
 * robotX / robotY (field metres) with the distance driven.
 */
function driveDist(meters, targetHeading, power) {
  resetEncoders();
  ticksTarget = meters * TICKS_PER_METER;
  driven = 0;
  tStart = runtime();
  while (active() && driven < ticksTarget && runtime() - tStart < meters * 3 + 1.5) {
    remaining = (ticksTarget - driven) / TICKS_PER_METER;
    pw = power * clamp(remaining / 0.3, 0.3, 1);
    corr = clamp(headingError(targetHeading) * 0.03, -0.3, 0.3);
    drive(pw - corr, pw + corr);
    driven = (Math.abs(leftPos()) + Math.abs(rightPos())) / 2;
  }
  drive(0, 0);
  dist = driven / TICKS_PER_METER;
  if (power < 0) {
    dist = -dist;
  }
  robotX = robotX + dist * cosDeg(targetHeading);
  robotY = robotY + dist * sinDeg(targetHeading);
}

/**
 * Drive to the field point (gx, gy) on odometry. Front first, unless the point is more than
 * 110 degrees behind the robot: then it backs up instead of turning around.
 */
function goTo(gx, gy, power) {
  gdx = gx - robotX;
  gdy = gy - robotY;
  gdist = Math.sqrt(gdx * gdx + gdy * gdy);
  if (gdist > 0.03) {
    goHeading = angleTo(gdx, gdy);
    if (Math.abs(headingError(goHeading)) > 110) {
      backTo(gx, gy, power);
    } else {
      turnTo(goHeading);
      driveDist(gdist, goHeading, power);
    }
  }
}

/**
 * Drive to the field point (gx, gy) backwards: the rear (intake) leads.
 */
function backTo(gx, gy, power) {
  gdx = gx - robotX;
  gdy = gy - robotY;
  gdist = Math.sqrt(gdx * gdx + gdy * gdy);
  if (gdist > 0.03) {
    goHeading = angleTo(-gdx, -gdy);
    turnTo(goHeading);
    driveDist(gdist, goHeading, -power);
  }
}

/**
 * Look for the AprilTag cluster CLUSTER_NAME (max 0.6 s) and compute the robot position
 * (robotX, robotY) from ftcPose (landscape camera pitched CAMERA_PITCH_DEG up) and the IMU.
 * found = true when it worked.
 */
function localize() {
  tStart = runtime();
  found = false;
  while (active() && !found && runtime() - tStart < 0.6) {
    for (const detection of detections()) {
      if (isCluster(detection) && clusterName(detection) == CLUSTER_NAME) {
        found = true;
        fwd = pose(detection, 'ftcPose.y');
        up = pose(detection, 'ftcPose.z');
        side = -pose(detection, 'ftcPose.x');
      }
    }
    if (!found) {
      sleep(50);
    }
  }
  if (found) {
    heading = readHeading();
    fwdH = fwd * cosDeg(CAMERA_PITCH_DEG) - up * sinDeg(CAMERA_PITCH_DEG);
    robotX = TAG_X - (fwdH * cosDeg(heading) - side * sinDeg(heading)) - CAMERA_FORWARD_M * cosDeg(heading);
    robotY = TAG_Y - (fwdH * sinDeg(heading) + side * cosDeg(heading)) - CAMERA_FORWARD_M * sinDeg(heading);
  }
}

/**
 * Choose the red CELL that is up: upCell 0 = RED AUDIENCE (at the start, it already holds
 * the 3 red NECTAR), 1 = RED SCORING (after a TIP). Sets the tag position, the shooting spot
 * (SHOOT_DISTANCE_M in front of the opening) and the shooting heading.
 */
function setTargetCell() {
  TAG_X = -0.324;
  if (upCell == 0) {
    CLUSTER_NAME = 'RED AUDIENCE';
    TAG_Y = -0.416;
    SHOOT_HEADING = 90;
  } else {
    CLUSTER_NAME = 'RED SCORING';
    TAG_Y = 0.429;
    SHOOT_HEADING = -90;
  }
  spotX = TAG_X - SHOOT_DISTANCE_M * cosDeg(SHOOT_HEADING);
  spotY = TAG_Y - SHOOT_DISTANCE_M * sinDeg(SHOOT_HEADING);
}

/**
 * Drive to the shooting spot of the up CELL. Coming from the other half of the field, go
 * through the corridor x = -1.1 first (clear of the HIVE legs at x = -0.6). Then correct the
 * position with the AprilTags (max 4 tries): sideways error > 6 cm = drive to the spot
 * again, error along the shooting line > 2.5 cm = drive forward/back. Finally face the
 * opening and fine-aim on the tag bearing.
 */
function goToShootingSpot(power) {
  setTargetCell();
  if (robotX < -0.9 || robotY * spotY < 0 || Math.abs(robotY) < 0.9) {
    if (spotY < 0) {
      goTo(-1.1, -1.1, power);
    } else {
      goTo(-1.1, 1.15, power);
    }
  }
  goTo(spotX, spotY, power);
  tries = 0;
  aligned = false;
  while (active() && !aligned && tries < 4) {
    turnTo(SHOOT_HEADING);
    localize();
    if (found) {
      dx = spotX - robotX;
      dy = spotY - robotY;
      along = dx * cosDeg(SHOOT_HEADING) + dy * sinDeg(SHOOT_HEADING);
      lateral = -dx * sinDeg(SHOOT_HEADING) + dy * cosDeg(SHOOT_HEADING);
      if (Math.abs(lateral) > 0.06) {
        goTo(spotX, spotY, 0.4);
      } else if (along > 0.025) {
        driveDist(along, SHOOT_HEADING, 0.3);
      } else if (along < -0.025) {
        driveDist(-along, SHOOT_HEADING, -0.3);
      } else {
        aligned = true;
      }
    } else {
      driveDist(0.05, SHOOT_HEADING, -0.3);
    }
    tries = tries + 1;
  }
  turnTo(SHOOT_HEADING);
  aimAtCell();
}

/**
 * Fine aim: turn until the AprilTag bearing of CLUSTER_NAME is within 1 degree (max 1 s).
 */
function aimAtCell() {
  tStart = runtime();
  aimed = false;
  while (active() && !aimed && runtime() - tStart < 1) {
    seen = false;
    for (const detection of detections()) {
      if (isCluster(detection) && clusterName(detection) == CLUSTER_NAME) {
        seen = true;
        bearing = pose(detection, 'ftcPose.bearing');
      }
    }
    if (!seen) {
      drive(0, 0);
      sleep(50);
    } else if (Math.abs(bearing) < 1) {
      aimed = true;
    } else {
      turnPower = clamp(bearing * 0.02, -0.25, 0.25);
      drive(-turnPower, turnPower);
    }
  }
  drive(0, 0);
}

/**
 * Fire n POLLEN (rising edge on the flywheel power): 0.2 s on, 0.4 s off.
 */
function shoot(n) {
  k = 0;
  while (active() && k < n) {
    setPower('flywheel', 1);
    sleep(200);
    setPower('flywheel', 0);
    sleep(400);
    k = k + 1;
    shotsFired = shotsFired + 1;
  }
}

/**
 * Fire n POLLEN into the CELL, spread over its 50 cm wide opening so they do not pile up and
 * bounce out: each shot turns to SHOOT_HEADING + an offset (-9, +9, -3, +3 degrees).
 */
function shootSpread(n) {
  k = 0;
  while (active() && k < n) {
    spread = cellShots % 4;
    if (spread == 0) {
      turnTo(aimHeading - 9);
    } else if (spread == 1) {
      turnTo(aimHeading + 9);
    } else if (spread == 2) {
      turnTo(aimHeading - 3);
    } else {
      turnTo(aimHeading + 3);
    }
    setPower('flywheel', 1);
    sleep(200);
    setPower('flywheel', 0);
    sleep(250);
    k = k + 1;
    cellShots = cellShots + 1;
    shotsFired = shotsFired + 1;
  }
}

/**
 * Collect POLLEN with the rear intake: drive to (ax, ay), turn so the rear faces along
 * heading cHeading + 180, intake on, drive backMeters backwards slowly, intake stays on
 * for a moment, then off.
 */
function collect(ax, ay, cHeading, backMeters) {
  goTo(ax, ay, 1);
  turnTo(cHeading);
  setPower('intakeMotor', 1);
  driveDist(backMeters, cHeading, -0.3);
  sleep(300);
  driveDist(0.08, cHeading, 0.3);
  setPower('intakeMotor', 0);
}

/**
 * Seconds since START, for the time budget and the telemetry.
 */
function elapsed() {
  return runtime() - startT;
}

/**
 * Telemetry: phase, time, odometry pose, shots.
 */
function show(phase) {
  text('Phase', phase);
  num('Time (s)', Math.round(elapsed() * 10) / 10);
  num('Robot X (m)', robotX);
  num('Robot Y (m)', robotY);
  num('Shots', shotsFired);
  num('TIPs (counted)', tips);
  update();
}

/**
 * Is the CELL of CLUSTER_NAME up? Measures the height of its AprilTag cluster (max 0.6 s):
 * an up CELL has its tags above 1.2 m. Returns 1 (up), 0 (down) or -1 (not seen).
 */
function cellUp() {
  tStart = runtime();
  res = -1;
  while (active() && res < 0 && runtime() - tStart < 0.6) {
    for (const detection of detections()) {
      if (isCluster(detection) && clusterName(detection) == CLUSTER_NAME) {
        fwd = pose(detection, 'ftcPose.y');
        up = pose(detection, 'ftcPose.z');
        tagZ = CAMERA_HEIGHT_M + fwd * sinDeg(CAMERA_PITCH_DEG) + up * cosDeg(CAMERA_PITCH_DEG);
        if (tagZ > 1.2) {
          res = 1;
        } else {
          res = 0;
        }
      }
    }
    if (res < 0) {
      sleep(50);
    }
  }
  return res;
}

/**
 * Score n POLLEN in the HIVE: drive to the shooting spot of the up CELL, check with the tags
 * that it really is up (else switch to the other red CELL), aim and shoot. The caller keeps
 * track of TIPs (upCell) by counting: 3 NECTAR + 3 POLLEN, or 8 POLLEN.
 */
function scoreInHive(n) {
  goToShootingSpot(0.9);
  if (cellUp() == 0) {
    upCell = 1 - upCell;
    show('Other CELL is up: switching');
    goToShootingSpot(0.9);
  }
  show('Shooting into the HIVE');
  aimHeading = readHeading();
  shootSpread(n);
  sleep(1000);
}

/**
 * Drive to the red LOADING ZONE (A5, against the red wall) and stop there: PARK.
 */
function park() {
  show('Parking in the LOADING ZONE');
  if (robotX > -0.9) {
    if (robotY > 0) {
      goTo(-1.1, 1.15, 1);
    } else {
      goTo(-1.1, -1.1, 1);
    }
  }
  goTo(-1.1, 0.914, 1);
  backTo(-1.5, 0.914, 0.8);
}


