/**
 * aprilTagAccess — simulated AprilTag processor (no real image CV).
 * getDetections / getFreshDetections return JSON **strings** (generators JSON.parse / nullOrJson).
 * Detections come from MuJoCo sensor snapshot key `aprilTagDetections`.
 */

function emptyLibrary() {
  return { __type: 'AprilTagLibrary', tags: [] };
}

function parseMaybeJson(arg) {
  if (arg == null) return null;
  if (typeof arg === 'string') {
    try {
      return JSON.parse(arg);
    } catch {
      return arg;
    }
  }
  return arg;
}

export function createAprilTagAccess(readDetections) {
  let lastFreshJson = null;
  let lastFreshGen = -1;

  const api = {
    easyCreateWithDefaults() {
      return { __type: 'AprilTagProcessor', decimation: 3 };
    },

    createAprilTagProcessorBuilder() {
      return { __type: 'AprilTagProcessor.Builder', _cfg: {} };
    },

    setDrawAxes(builder, v) {
      if (builder) builder._cfg = { ...builder._cfg, drawAxes: v };
    },
    setDrawCubeProjection(builder, v) {
      if (builder) builder._cfg = { ...builder._cfg, drawCube: v };
    },
    setDrawTagOutline(builder, v) {
      if (builder) builder._cfg = { ...builder._cfg, drawOutline: v };
    },
    setDrawTagID(builder, v) {
      if (builder) builder._cfg = { ...builder._cfg, drawId: v };
    },
    setCameraPose(builder) {
      return builder;
    },
    setLensIntrinsics(builder) {
      return builder;
    },
    setSuppressCalibrationWarnings(builder, v) {
      if (builder) builder._cfg = { ...builder._cfg, suppress: v };
    },
    setNumThreads(builder, v) {
      if (builder) builder._cfg = { ...builder._cfg, threads: v };
    },
    setOutputUnits(builder) {
      return builder;
    },
    setTagFamily(builder, v) {
      if (builder) builder._cfg = { ...builder._cfg, family: v };
    },
    setTagLibrary(builder, v) {
      if (builder) builder._cfg = { ...builder._cfg, library: v };
    },

    buildAprilTagProcessor(builder) {
      return {
        __type: 'AprilTagProcessor',
        decimation: 3,
        ...(builder && builder._cfg ? builder._cfg : {}),
      };
    },

    setDecimation(processor, d) {
      if (processor) processor.decimation = d;
    },
    setPoseSolver(processor, s) {
      if (processor) processor.poseSolver = s;
    },
    getPerTagAvgPoseSolveTime() {
      return 0;
    },

    /**
     * @returns {string} JSON array of detections
     */
    getDetections(_processor) {
      const snap = readDetections() || { json: '[]', generation: 0 };
      return typeof snap.json === 'string' ? snap.json : JSON.stringify(snap.json || []);
    },

    /**
     * @returns {string|null} JSON string when generation advanced, else null
     */
    getFreshDetections(_processor) {
      const snap = readDetections() || { json: '[]', generation: 0 };
      const gen = snap.generation ?? 0;
      const json = typeof snap.json === 'string' ? snap.json : JSON.stringify(snap.json || []);
      if (gen === lastFreshGen) return null;
      lastFreshGen = gen;
      lastFreshJson = json;
      return json;
    },

    createAprilTagPoseFtc(_mode, _type, _property, jsonArg) {
      return parseMaybeJson(jsonArg) || { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, range: 0, bearing: 0, elevation: 0 };
    },
    createAprilTagPoseRaw(_mode, _type, _property, jsonArg) {
      return parseMaybeJson(jsonArg) || { x: 0, y: 0, z: 0 };
    },
    createAprilTagPoseRobot(_mode, _type, _property, jsonArg) {
      return parseMaybeJson(jsonArg) || {
        position: { x: 0, y: 0, z: 0 },
        orientation: { pitch: 0, roll: 0, yaw: 0 },
      };
    },
    createMatrixF(_mode, _type, _property, jsonArg) {
      return parseMaybeJson(jsonArg) || [];
    },
    createQuaternion(_mode, _type, _property, jsonArg) {
      return parseMaybeJson(jsonArg) || { w: 1, x: 0, y: 0, z: 0 };
    },
    createVectorF(_mode, _type, _property, jsonArg) {
      return parseMaybeJson(jsonArg) || [];
    },
    createMetadata() {
      return { __type: 'AprilTagMetadata', id: -1, name: '', tagsize: 0.1016 };
    },
    createMetadata_withoutPoseInfo() {
      return api.createMetadata();
    },

    getCurrentGameTagLibrary: emptyLibrary,
    getCenterStageTagLibrary: emptyLibrary,
    getIntoTheDeepTagLibrary: emptyLibrary,
    getDecodeTagLibrary: emptyLibrary,
    getBioBuzzTagLibrary: emptyLibrary,
    getSampleTagLibrary: emptyLibrary,

    createAprilTagLibraryBuilder() {
      return { __type: 'AprilTagLibrary.Builder', tags: [] };
    },
    setAllowOverwrite(builder, v) {
      if (builder) builder.allowOverwrite = v;
    },
    addTag(builder) {
      return builder;
    },
    addTag_WithMetadata(builder) {
      return builder;
    },
    addTag_withoutPoseInfo(builder) {
      return builder;
    },
    addTags(builder) {
      return builder;
    },
    buildAprilTagLibrary(builder) {
      return { __type: 'AprilTagLibrary', tags: (builder && builder.tags) || [] };
    },
    lookupTag() {
      return null;
    },

    /** @internal */
    _resetFresh() {
      lastFreshGen = -1;
      lastFreshJson = null;
    },
  };

  return api;
}
