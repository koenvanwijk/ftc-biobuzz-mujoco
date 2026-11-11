import { publicUrl } from '../../publicUrl.js';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CAMERA_SITES, DEFAULT_ROBOT_CAMERA_FOV, activeCameraIndicator, normalizeCameraId } from '../../mujoco/robotCamera.js';
import { flowerVertexColors } from './flowerColors.js';
import { buildTagClusterMap, tagIdFromGeomName, aprilTagLabel } from './aprilTagNames.js';
import { pipLabelCss, renderWithPip, viewerPixelRatio } from './pipViewport.js';

/**
 * Three.js MuJoCo geom viewer (zalo-style): build meshes from model geoms,
 * sync transforms each frame from geom_xpos / geom_xmat.
 * MuJoCo is Z-up; we keep camera.up = Z.
 */
/** Standaard 3D-camera: vanaf de rode muur (-X) kijkend naar +X, zodat scherm-rechts = -Y (publiek). */
export const DEFAULT_CAMERA_POS = [-4.6, 0, 3.0];
export const DEFAULT_CAMERA_TARGET = [0, 0, 0.4];

export class MujocoThreeViewer {
  constructor(canvas, mujoco, model, data) {
    this.canvas = canvas;
    this.mujoco = mujoco;
    this.model = model;
    this.data = data;
    this.bodies = [];

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(viewerPixelRatio(window.devicePixelRatio));
    this.renderer.setClearColor(0x1a1f2a, 1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x1a1f2a, 8, 22);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 40);
    this.camera.up.set(0, 0, 1);
    // Startaanzicht = 2D route-plot (FTC-coördinaten): rode muur (-X sim, -Y_ftc) dichtbij/onder,
    // publiek (-Y sim, +X_ftc) rechts, blauw (+X sim) achter.
    this.camera.position.set(...DEFAULT_CAMERA_POS);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(...DEFAULT_CAMERA_TARGET);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.95;
    this.controls.update();
    this._initTagHover(canvas);

    const hemi = new THREE.HemisphereLight(0xdde7ff, 0x3a3020, 0.85);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2d6, 1.15);
    sun.position.set(2.5, -1.5, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 14;
    sun.shadow.camera.left = -4;
    sun.shadow.camera.right = 4;
    sun.shadow.camera.top = 4;
    sun.shadow.camera.bottom = -4;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0x88aaff, 0.35);
    fill.position.set(-3, 2, 3);
    this.scene.add(fill);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this._meshCache = new Map();
    this._texLoader = new THREE.TextureLoader();
    this._aprilTextures = new Map();

    // Second camera: robot upward view (PiP) — Logitech Brio 4K (see robotCamera.js).
    // Three.js fov = VERTICAL field of view; aspect from the stream resolution.
    this._camFov = { ...DEFAULT_ROBOT_CAMERA_FOV };
    this.robotCam = new THREE.PerspectiveCamera(pipVfov(this._camFov), pipAspect(this._camFov), 0.05, 40);
    this.robotCam.up.set(0, 0, 1);
    this._robotCamSiteId = -1;
    this._frustumHelper = null;
    this._frustumLines = null;
    // Twee robotcamera's: voor (AprilTags) en achter (vloer, POLLEN). De PiP toont de actieve.
    this._activeCam = 'front';
    this._fovs = { front: { ...DEFAULT_ROBOT_CAMERA_FOV }, rear: { ...DEFAULT_ROBOT_CAMERA_FOV, rollDeg: 0 } };
    this._siteIds = { front: -1, rear: -1 };
    this._helpers = {};

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    if (typeof ResizeObserver !== 'undefined' && canvas.parentElement) {
      // Observe the panel, not the canvas — setSize would otherwise re-enter.
      this._ro = new ResizeObserver(() => this.resize());
      this._ro.observe(canvas.parentElement);
    }
    this.resize();
  }

  async init() {
    await this._preloadAprilTagTextures();
    this._buildGeoms();
    const SITE = this.mujoco.mjtObj.mjOBJ_SITE.value;
    for (const id of ['front', 'rear']) {
      this._siteIds[id] = this.mujoco.mj_name2id(this.model, SITE, CAMERA_SITES[id]);
      if (this._siteIds[id] < 0) console.warn(`[PiP] site ${CAMERA_SITES[id]} not found`);
    }
    this._robotCamSiteId = this._siteIds.front;
    this._pipLabel = document.getElementById('pip-label');
    this._helpers.front = this._addRobotCamFrustumHelper(0x33ddff, this._fovs.front);
    if (this._siteIds.rear >= 0) this._helpers.rear = this._addRobotCamFrustumHelper(0xffaa33, this._fovs.rear);
    this._frustumHelper = this._helpers.front.group;
    this._frustumLines = this._helpers.front.lines;
    this._applyActiveCam();
    this.sync();
    this._layoutPipLabel();
  }

  _addRobotCamFrustumHelper(color = 0x33ddff, fov = this._camFov) {
    // Simple axis helper at camera site (updated each sync)
    const group = new THREE.Group();
    group.name = color === 0x33ddff ? 'robot_up_cam_helper' : 'robot_rear_cam_helper';
    const origin = new THREE.Mesh(
      new THREE.SphereGeometry(0.015, 10, 10),
      new THREE.MeshBasicMaterial({ color }),
    );
    group.add(origin);
    // Look ray
    const dirGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -0.45),
    ]);
    const dirLine = new THREE.Line(dirGeom, new THREE.LineBasicMaterial({ color }));
    group.add(dirLine);
    // Frustum pyramid: rectangular, same H/V field of view as the PiP + detection.
    const fGeom = new THREE.BufferGeometry();
    fGeom.setAttribute('position', new THREE.Float32BufferAttribute(frustumLinePositions(fov), 3));
    const frustum = new THREE.LineSegments(
      fGeom,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.55 }),
    );
    group.add(frustum);
    this.scene.add(group);
    return { group, lines: frustum };
  }

  _setHelperFov(id, fov) {
    const lines = this._helpers[id]?.lines;
    if (!lines) return;
    lines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(frustumLinePositions(fov), 3));
    lines.geometry.attributes.position.needsUpdate = true;
    lines.geometry.computeBoundingSphere();
  }

  /** PiP-projectie, kijkpiramide-nadruk en label voor de actieve camera. */
  _applyActiveCam() {
    const id = this._activeCam;
    this._camFov = { ...this._fovs[id] };
    this._robotCamSiteId = this._siteIds[id];
    this.robotCam.fov = pipVfov(this._camFov);
    this.robotCam.aspect = pipAspect(this._camFov);
    this.robotCam.updateProjectionMatrix();
    for (const [hid, h] of Object.entries(this._helpers)) {
      if (h?.lines?.material) h.lines.material.opacity = hid === id ? 0.9 : 0.25;
    }
    const label = this._pipLabel || document.getElementById('pip-label');
    if (label) {
      const ind = activeCameraIndicator(id);
      label.textContent = `● ${ind.label}`;
      label.style.color = ind.color;
      label.dataset.camera = id;
    }
    this._layoutPipLabel?.();
  }

  /** Wissel de actieve robotcamera ('front' | 'rear'): PiP volgt meteen. */
  setActiveCamera(id) {
    const n = normalizeCameraId(id) || 'front';
    this._activeCam = n === 'rear' && this._siteIds.rear < 0 ? 'front' : n;
    this._applyActiveCam();
    return this._activeCam;
  }

  get activeCamera() {
    return this._activeCam;
  }

  /** Zichtveld van de achtercamera (zelfde Brio-preset, altijd liggend). */
  setRearCameraFov(fov) {
    if (!fov || !(fov.vfovDeg > 0) || !(fov.aspect > 0)) return;
    this._fovs.rear = { ...fov };
    this._setHelperFov('rear', fov);
    if (this._activeCam === 'rear') this._applyActiveCam();
  }

  /**
   * Switch the robot camera field of view (Brio preset / stream resolution).
   * Updates PiP projection + aspect, frustum gizmo and MuJoCo cam_fovy.
   * @param {{ hfovDeg: number, vfovDeg: number, aspect: number }} fov
   */
  setCameraFov(fov) {
    if (!fov || !(fov.vfovDeg > 0) || !(fov.aspect > 0)) return;
    // Voorcamera. PiP volgt het liggende camerabeeld (H × V van de stream).
    this._fovs.front = { ...fov };
    this._setHelperFov('front', fov);
    if (this._activeCam === 'front') this._applyActiveCam();
    // MuJoCo camera (not used for the PiP — that is the Three.js robotCam — but keep in sync).
    try {
      const CAM = this.mujoco.mjtObj?.mjOBJ_CAMERA?.value;
      const camId = CAM == null ? -1 : this.mujoco.mj_name2id(this.model, CAM, 'robot_up_cam');
      if (camId >= 0 && this.model.cam_fovy) this.model.cam_fovy[camId] = fov.vfovDeg;
    } catch {
      /* cam_fovy not writable in this build — PiP is what matters */
    }
    this._layoutPipLabel();
  }

  /** Current robot camera field of view (for tests / debugging). */
  get cameraFov() {
    return { ...this._camFov };
  }

  async _preloadAprilTagTextures() {
    const ids = Array.from({ length: 16 }, (_, i) => 30 + i);
    await Promise.all(
      ids.map(
        (id) =>
          new Promise((resolve) => {
            this._texLoader.load(
              publicUrl(`assets/textures/apriltag_${id}.png`),
              (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                tex.magFilter = THREE.NearestFilter;
                tex.minFilter = THREE.NearestFilter;
                this._aprilTextures.set(id, tex);
                resolve();
              },
              undefined,
              () => resolve(),
            );
          }),
      ),
    );
  }

  _buildGeoms() {
    const model = this.model;
    const mujoco = this.mujoco;
    const GEOM = mujoco.mjtObj.mjOBJ_GEOM.value;
    const types = mujoco.mjtGeom;

    for (let i = 0; i < model.ngeom; i++) {
      const group = model.geom_group[i];
      if (group >= 3) continue; // collision hulls

      const rgba = [
        model.geom_rgba[i * 4],
        model.geom_rgba[i * 4 + 1],
        model.geom_rgba[i * 4 + 2],
        model.geom_rgba[i * 4 + 3],
      ];
      // Prefer material rgba when present
      const matid = model.geom_matid[i];
      if (matid >= 0) {
        rgba[0] = model.mat_rgba[matid * 4];
        rgba[1] = model.mat_rgba[matid * 4 + 1];
        rgba[2] = model.mat_rgba[matid * 4 + 2];
        rgba[3] = model.mat_rgba[matid * 4 + 3];
      }
      if (rgba[3] < 0.01) continue;

      const gtype = model.geom_type[i];
      const size = [
        model.geom_size[i * 3],
        model.geom_size[i * 3 + 1],
        model.geom_size[i * 3 + 2],
      ];
      const name = mujoco.mj_id2name(model, GEOM, i) || `geom_${i}`;

      let geometry = null;
      if (gtype === types.mjGEOM_PLANE.value) {
        const w = (size[0] || 1) * 2;
        const h = (size[1] || 1) * 2;
        geometry = new THREE.PlaneGeometry(w, h);
        // MuJoCo plane lies in XY, normal +Z — PlaneGeometry is XY already
      } else if (gtype === types.mjGEOM_SPHERE.value) {
        geometry = new THREE.SphereGeometry(size[0] || 0.05, 24, 16);
      } else if (gtype === types.mjGEOM_BOX.value) {
        geometry = new THREE.BoxGeometry(size[0] * 2, size[1] * 2, size[2] * 2);
      } else if (gtype === types.mjGEOM_CYLINDER.value) {
        geometry = new THREE.CylinderGeometry(size[0], size[0], size[1] * 2, 24);
        geometry.rotateX(Math.PI / 2); // MuJoCo cylinder axis = Z
      } else if (gtype === types.mjGEOM_CAPSULE.value) {
        geometry = new THREE.CapsuleGeometry(size[0], size[1] * 2, 6, 16);
        geometry.rotateX(Math.PI / 2);
      } else if (gtype === types.mjGEOM_ELLIPSOID.value) {
        geometry = new THREE.SphereGeometry(1, 24, 16);
        geometry.scale(size[0], size[1], size[2]);
      } else if (gtype === types.mjGEOM_MESH.value) {
        const dataid = model.geom_dataid[i];
        if (dataid < 0) continue;
        geometry = this._getMeshGeometry(dataid);
        if (geometry && /^flower_\w+_vis$/.test(name)) geometry = this._flowerGeometry(geometry, i);
      } else {
        continue;
      }
      if (!geometry) continue;

      let material;
      const aprilMatch = /^apriltag_geom_(\d+)$/.exec(name);
      if (aprilMatch && this._aprilTextures.has(Number(aprilMatch[1]))) {
        material = new THREE.MeshStandardMaterial({
          map: this._aprilTextures.get(Number(aprilMatch[1])),
          roughness: 0.85,
          metalness: 0.05,
          side: THREE.DoubleSide,
        });
      } else if (geometry.userData?.flowerColored) {
        material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15 });
      } else if (name === 'tiles') {
        material = new THREE.MeshStandardMaterial({
          map: makeCheckerTexture(),
          roughness: 0.92,
          metalness: 0.05,
        });
      } else {
        material = new THREE.MeshStandardMaterial({
          color: new THREE.Color(rgba[0], rgba[1], rgba[2]),
          transparent: rgba[3] < 0.99,
          opacity: rgba[3],
          roughness: 0.7,
          metalness: 0.08,
          depthWrite: rgba[3] > 0.9,
        });
      }

      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = group !== 0 || name.startsWith('pollen') || name === 'chassis';
      mesh.receiveShadow = true;
      mesh.name = name;
      this.root.add(mesh);
      this.bodies.push({ mesh, geomId: i });
    }
  }

  /** FLOWER-mesh met vertexkleuren per deel (zie flowerColors.js). */
  _flowerGeometry(base, geomId) {
    const g = base.clone();
    const pos = g.getAttribute('position').array;
    const q = this.model.geom_quat.slice(geomId * 4, geomId * 4 + 4);
    const [w, x, y, z] = q;
    const r0 = 2 * (x * z - w * y), r1 = 2 * (y * z + w * x), r2 = 1 - 2 * (x * x + y * y);
    const pz = this.model.geom_pos[geomId * 3 + 2];
    const n = pos.length / 3;
    const worldZ = new Float32Array(n);
    for (let v = 0; v < n; v++) worldZ[v] = pz + r0 * pos[v * 3] + r1 * pos[v * 3 + 1] + r2 * pos[v * 3 + 2];
    const { colors } = flowerVertexColors(worldZ, g.getIndex().array);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.userData.flowerColored = true;
    return g;
  }

  _getMeshGeometry(meshId) {
    if (this._meshCache.has(meshId)) return this._meshCache.get(meshId);
    const model = this.model;
    const vertAdr = model.mesh_vertadr[meshId];
    const vertNum = model.mesh_vertnum[meshId];
    const faceAdr = model.mesh_faceadr[meshId];
    const faceNum = model.mesh_facenum[meshId];

    // MuJoCo mesh_vert is Float64 (mjtNum); WebGL needs Float32.
    const positions = new Float32Array(
      model.mesh_vert.slice(vertAdr * 3, (vertAdr + vertNum) * 3),
    );
    const indices = new Uint32Array(
      model.mesh_face.slice(faceAdr * 3, (faceAdr + faceNum) * 3),
    );

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    // Ensure non-empty bounds for frustum culling
    geometry.computeBoundingSphere();
    this._meshCache.set(meshId, geometry);
    return geometry;
  }

  sync() {
    const xpos = this.data.geom_xpos;
    const xmat = this.data.geom_xmat;
    const mat = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3(1, 1, 1);

    for (const { mesh, geomId } of this.bodies) {
      const i = geomId;
      pos.set(xpos[i * 3], xpos[i * 3 + 1], xpos[i * 3 + 2]);
      // MuJoCo geom_xmat is row-major 3x3; THREE.Matrix4.set takes row-major args.
      const m = i * 9;
      mat.set(
        xmat[m + 0], xmat[m + 1], xmat[m + 2], 0,
        xmat[m + 3], xmat[m + 4], xmat[m + 5], 0,
        xmat[m + 6], xmat[m + 7], xmat[m + 8], 0,
        0, 0, 0, 1,
      );
      quat.setFromRotationMatrix(mat);
      mesh.position.copy(pos);
      mesh.quaternion.copy(quat);
      mesh.scale.copy(scl);
    }
    this._syncRobotCam();
  }

  _syncRobotCam() {
    if (this._robotCamSiteId < 0) return;
    const sid = this._robotCamSiteId;
    const xpos = this.data.site_xpos;
    const xmat = this.data.site_xmat;
    const o = sid * 3;
    const m = sid * 9;
    const pos = new THREE.Vector3(xpos[o], xpos[o + 1], xpos[o + 2]);
    // site_xmat is row-major 3x3 (same as geom_xmat). Camera looks along -Z axis.
    const mat = new THREE.Matrix4().set(
      xmat[m + 0], xmat[m + 1], xmat[m + 2], 0,
      xmat[m + 3], xmat[m + 4], xmat[m + 5], 0,
      xmat[m + 6], xmat[m + 7], xmat[m + 8], 0,
      0, 0, 0, 1,
    );
    const quat = new THREE.Quaternion().setFromRotationMatrix(mat);
    this.robotCam.position.copy(pos);
    // De site volgt de camerarol (sensorframe, voor detectie en kijkpiramide). Een eventuele roll
    // wordt voor de PiP teruggedraaid om de optische as (lokaal Z); standaard is roll 0.
    const roll = ((this._camFov?.rollDeg || 0) * Math.PI) / 180;
    const unroll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -roll);
    this.robotCam.quaternion.copy(quat).multiply(unroll);
    this.robotCam.up.set(0, 0, 1);
    for (const [id, h] of Object.entries(this._helpers)) {
      const hs = this._siteIds[id];
      if (!h?.group || hs < 0) continue;
      const ho = hs * 3;
      const hm = hs * 9;
      h.group.position.set(xpos[ho], xpos[ho + 1], xpos[ho + 2]);
      h.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().set(
        xmat[hm + 0], xmat[hm + 1], xmat[hm + 2], 0,
        xmat[hm + 3], xmat[hm + 4], xmat[hm + 5], 0,
        xmat[hm + 6], xmat[hm + 7], xmat[hm + 8], 0,
        0, 0, 0, 1,
      ));
    }
  }

  /** CSS-pixel PiP box (top-right). Sized from laid-out canvas, never window. */
  _pipCssBox() {
    const canvas = this.canvas;
    let cw = canvas.clientWidth;
    let ch = canvas.clientHeight;
    // Avoid window fallback: that oversized the buffer and clipped the PiP under the next panel.
    if (cw < 2 || ch < 2) {
      const parent = canvas.parentElement;
      const rect = parent?.getBoundingClientRect?.();
      cw = Math.max(2, Math.floor(rect?.width || 640));
      ch = Math.max(2, Math.floor(rect?.height || 360));
    }
    const margin = 16;
    // Top-right on desktop; bottom-right in mobile-play so Schiet/Intake (top corners) stay clear.
    const mobilePlay = typeof document !== 'undefined' && document.getElementById('app')?.classList.contains('mobile-play');
    const rightInset = 24;
    // Lange zijde 140–280 px; een staand beeld (aspect < 1) wordt smal en hoog.
    const base = Math.min(280, Math.max(140, Math.floor(cw * 0.24)));
    const aspect = pipAspect(this._camFov);
    let pipW = aspect >= 1 ? base : Math.floor(base * aspect);
    let pipH = aspect >= 1 ? Math.floor(base / aspect) : base;
    // Laag paneel: PiP (met rand) past altijd in de hoogte.
    const maxH = Math.max(40, ch - 2 * margin - 4);
    if (pipH > maxH) {
      pipW = Math.max(1, Math.floor((pipW * maxH) / pipH));
      pipH = maxH;
    }
    // Leave room for the bottom-left joystick in mobile landscape.
    if (mobilePlay) {
      const maxW = Math.max(40, cw - 2 * margin - 120);
      if (pipW > maxW) {
        pipH = Math.max(1, Math.floor((pipH * maxW) / pipW));
        pipW = maxW;
      }
    }
    return { cw, ch, margin, rightInset, pipW, pipH, corner: mobilePlay ? 'bottom-right' : 'top-right' };
  }

  _layoutPipLabel() {
    const label = this._pipLabel || document.getElementById('pip-label');
    if (!label) return;
    this._pipLabel = label;
    // Zelfde CSS-pixel-rechthoeken als render(): label sluit aan op de cyaan rand.
    const pos = pipLabelCss(this._pipCssBox());
    label.style.right = `${pos.right}px`;
    label.style.top = pos.top != null ? `${pos.top}px` : 'auto';
    label.style.bottom = pos.bottom != null ? `${pos.bottom}px` : 'auto';
    label.style.width = `${pos.width}px`;
    label.style.textAlign = 'center';
    label.style.boxSizing = 'border-box';
    label.hidden = false;
  }

  resize() {
    // devicePixelRatio verandert bij browser-zoom of een ander scherm: volg het (begrensd op 2).
    const ratio = viewerPixelRatio(window.devicePixelRatio);
    if (this.renderer.getPixelRatio() !== ratio) this.renderer.setPixelRatio(ratio);
    const { cw, ch } = this._pipCssBox();
    this.renderer.setSize(cw, ch, false);
    // Keep CSS box = panel slot so the buffer never paints past overflow:hidden.
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.camera.aspect = cw / Math.max(ch, 1);
    this.camera.updateProjectionMatrix();
    // PiP aspect = camera stream aspect (4:3 for 640x480, 16:9 for 1280x720).
    this.robotCam.aspect = pipAspect(this._camFov);
    this.robotCam.updateProjectionMatrix();
    this._layoutPipLabel();
  }

  render() {
    this.controls.update();
    const dpr = this.renderer.getPixelRatio();
    const box = this._pipCssBox();
    // Buffer = CSS-box × pixelratio (three.js: canvas.width = floor(cw · dpr)); stale maat herstellen.
    if (this.canvas.width !== Math.floor(box.cw * dpr) || this.canvas.height !== Math.floor(box.ch * dpr)) {
      this.renderer.setSize(box.cw, box.ch, false);
      this.camera.aspect = box.cw / Math.max(box.ch, 1);
      this.camera.updateProjectionMatrix();
    }
    // Viewport/scissor in CSS-pixels: three.js vermenigvuldigt zelf met de pixelratio.
    const helpers = Object.values(this._helpers).map((h) => h.group);
    const fog = this.scene.fog;
    renderWithPip(this.renderer, {
      scene: this.scene,
      camera: this.camera,
      robotCam: this.robotCam,
      box,
      clearColor: 0x1a1f2a,
      frameColor: this._activeCam === 'rear' ? 0xffaa33 : 0x33ddff,
      insetColor: 0x0a1624,
      // Kijkpiramide niet in de PiP (zit op de lens); geen mist zodat de tip leesbaar blijft.
      beforePip: () => {
        for (const h of helpers) h.visible = false;
        this.scene.fog = null;
      },
      afterPip: () => {
        this.scene.fog = fog;
        for (const h of helpers) h.visible = true;
      },
    });
  }

  /** Tag-id -> cluster uit het MuJoCo-model (ouder-body van de tag-body). */
  _tagMap() {
    if (this._tagClusterMap) return this._tagClusterMap;
    const { mujoco, model } = this;
    const entries = [];
    const BODY = mujoco.mjtObj.mjOBJ_BODY.value;
    for (let b = 0; b < model.nbody; b++) {
      const m = /^apriltag_body_(\d+)$/.exec(mujoco.mj_id2name(model, BODY, b) || '');
      if (m) entries.push({ tagId: Number(m[1]), cluster: mujoco.mj_id2name(model, BODY, model.body_parentid[b]) || 'world' });
    }
    this._tagClusterMap = buildTagClusterMap(entries);
    return this._tagClusterMap;
  }

  /** Hover-tooltip met AprilTag/cluster-naam (raycast, ~20 Hz, niet tijdens slepen). */
  _initTagHover(canvas) {
    const tip = document.createElement('div');
    tip.className = 'apriltag-tooltip';
    Object.assign(tip.style, {
      position: 'fixed', pointerEvents: 'none', zIndex: 50, display: 'none',
      background: 'rgba(15,18,26,0.92)', color: '#eee', font: '12px sans-serif',
      padding: '3px 7px', borderRadius: '4px', border: '1px solid #556', whiteSpace: 'nowrap',
    });
    document.body.appendChild(tip);
    this._tagTip = tip;
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let dragging = false, last = 0;
    const hide = () => { tip.style.display = 'none'; };
    this._onTagDown = () => { dragging = true; hide(); };
    this._onTagUp = () => { dragging = false; };
    this._onTagMove = (e) => {
      if (dragging || e.buttons) return hide();
      const now = performance.now();
      if (now - last < 50) return;
      last = now;
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      const hit = ray.intersectObjects(this.root.children, false).find((h) => h.object.visible && (tagIdFromGeomName(h.object.name) != null || (h.object.material?.opacity ?? 1) > 0.5));
      const id = hit ? tagIdFromGeomName(hit.object.name) : null;
      if (id == null) return hide();
      tip.textContent = aprilTagLabel(id, this._tagMap());
      tip.style.left = `${e.clientX + 14}px`;
      tip.style.top = `${e.clientY + 12}px`;
      tip.style.display = 'block';
    };
    canvas.addEventListener('pointerdown', this._onTagDown);
    window.addEventListener('pointerup', this._onTagUp);
    canvas.addEventListener('pointermove', this._onTagMove);
    canvas.addEventListener('pointerleave', hide);
    this._onTagLeave = hide;
  }

  dispose() {
    this.canvas.removeEventListener('pointerdown', this._onTagDown);
    window.removeEventListener('pointerup', this._onTagUp);
    this.canvas.removeEventListener('pointermove', this._onTagMove);
    this.canvas.removeEventListener('pointerleave', this._onTagLeave);
    this._tagTip?.remove();
    window.removeEventListener('resize', this._onResize);
    this._ro?.disconnect?.();
    this.controls.dispose();
    this.renderer.dispose();
  }
}

/** Line-segment positions (camera looks along -Z) for a rectangular H/V frustum. */
/** Aspect van het PiP-beeld. */
function pipAspect(fov) {
  return fov?.viewAspect > 0 ? fov.viewAspect : fov?.aspect > 0 ? fov.aspect : 4 / 3;
}

/** Verticaal zichtveld van het PiP-beeld. */
function pipVfov(fov) {
  return fov?.viewVfovDeg > 0 ? fov.viewVfovDeg : fov?.vfovDeg || 52.23;
}

/** Kijkpiramide in het (meegedraaide) sensorframe van de site: beeld-X = hfov, beeld-Y = vfov. */
function frustumLinePositions(fov, near = 0.12, far = 0.5) {
  const th = Math.tan(((fov.hfovDeg || 66.34) / 2) * (Math.PI / 180));
  const tv = Math.tan(((fov.vfovDeg || 52.23) / 2) * (Math.PI / 180));
  const nw = th * near;
  const nh = tv * near;
  const fw = th * far;
  const fh = tv * far;
  const pts = [
    [-nw, -nh, -near], [nw, -nh, -near], [nw, nh, -near], [-nw, nh, -near],
    [-fw, -fh, -far], [fw, -fh, -far], [fw, fh, -far], [-fw, fh, -far],
  ];
  const idx = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7];
  const out = [];
  for (const i of idx) out.push(...pts[i]);
  return out;
}

function makeCheckerTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const n = 6;
  const cell = size / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#8c8c94' : '#7a7a82';
      ctx.fillRect(x * cell, y * cell, cell + 1, cell + 1);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}
