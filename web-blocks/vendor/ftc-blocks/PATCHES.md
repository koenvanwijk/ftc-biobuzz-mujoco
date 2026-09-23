# Vendor-patches

## 1. IndexedDB-namespace-isolatie

- **Bestand:** `blocks/project_util.js`
- **Wijziging:** `indexedDB.open('FtcBlocksDatabase', 1)` → `indexedDB.open('FtcBlocksDatabase_MuJoCoSim', 1)`
- **Reden:** voorkomt dat seed-data van deze simulator een bestaande offline Blocks-database van de gebruiker overschrijft of vervuilt. De seed (`getBlkFiles()`) draait alleen bij `onupgradeneeded` van een nieuwe DB.
- **Impact:** gebruiker ziet een aparte projectenlijst in deze app; geen dataverlies in de standaard `FtcBlocksDatabase`.

## 2. Simulated IMU + Webcam dropdowns & toolbox (explicit extension)

- **Bestand:** `js/FtcOfflineBlocks.js`
- **Bron-ZIP SHA-256 (ongewijzigd):** zie `VENDOR.md` — deze patch is lokaal bovenop de uitgepakte pin.
- **Wijzigingen:**
  1. `createImuDropdown()` — was leeg; nu `[['imu', 'imuAsIMU']]` (config-naam `imu` → JS-id `imuAsIMU`).
  2. `createWebcamDeviceNameDropdown()` — was leeg; nu `[['Webcam 1', 'Webcam 1']]`.
  3. `getToolbox()` Sensors-sectie — na VoltageSensor: subcategory **IMU** met `imu_initialize` (shadow `imuParameters_create` + RevHub orientation), `imu_getProperty_YawPitchRollAngles`, `imu_resetYaw`, `imu_getRobotAngularVelocity`, YPR getters.
  4. Top-level **Vision** category — AprilTag essentials + VisionPortal essentials + `navigation_webcamName`.
- **Reden:** user-requested simulated Webcam + IMU; hergebruikt officiële block definitions/generators (geen parallel blockset). Geen stille placeholders — runtime is een **gesimuleerde** bridge (zie `src/config/extensions.md`).
- **Impact:** toolbox toont IMU/Vision; gegenereerde JS roept `imuAsIMU` / `aprilTagAccess` / `visionPortalAccess` / `yawPitchRollAnglesAccess` aan zoals op een echte RC.
