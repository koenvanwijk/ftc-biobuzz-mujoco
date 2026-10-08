import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ROBOT_UP_CAM_FOVY, ROBOT_UP_CAM_ASPECT } from './constants.js';
import { pipLabelCss, renderWithPip, viewerPixelRatio } from './pipViewport.js';

/**
 * Three.js MuJoCo geom viewer (zalo-style): build meshes from model geoms,
 * sync transforms each frame from geom_xpos / geom_xmat.
 * MuJoCo is Z-up; we keep camera.up = Z.
 */
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
    this.camera.position.set(3.2, -3.6, 2.4);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0, 0.4);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.95;
    this.controls.update();

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

    // Second camera: robot upward view (PiP)
    this.robotCam = new THREE.PerspectiveCamera(ROBOT_UP_CAM_FOVY, ROBOT_UP_CAM_ASPECT, 0.05, 40);
    this.robotCam.up.set(0, 0, 1);
    this._robotCamSiteId = -1;
    this._frustumHelper = null;

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
    this._robotCamSiteId = this.mujoco.mj_name2id(this.model, SITE, 'robot_up_cam');
    if (this._robotCamSiteId < 0) {
      console.warn('[PiP] site robot_up_cam not found — upward cam will stay at default pose');
    } else {
      console.info(`[PiP] robot_up_cam site id=${this._robotCamSiteId}`);
    }
    this._pipLabel = document.getElementById('pip-label');
    this._addRobotCamFrustumHelper();
    this.sync();
    this._layoutPipLabel();
  }

  _addRobotCamFrustumHelper() {
    // Simple axis helper at camera site (updated each sync)
    const group = new THREE.Group();
    group.name = 'robot_up_cam_helper';
    const origin = new THREE.Mesh(
      new THREE.SphereGeometry(0.015, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0x33ddff }),
    );
    group.add(origin);
    // Look ray
    const dirGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -0.45),
    ]);
    const dirLine = new THREE.Line(dirGeom, new THREE.LineBasicMaterial({ color: 0x33ddff }));
    group.add(dirLine);
    // Frustum pyramid: Logitech Brio 4K 90° preset at 640x480 (vfov 52.2°, 4:3 → hfov 66.3°)
    const fovy = (ROBOT_UP_CAM_FOVY * Math.PI) / 180;
    const aspect = ROBOT_UP_CAM_ASPECT;
    const near = 0.12;
    const far = 0.5;
    const nh = Math.tan(fovy / 2) * near;
    const nw = nh * aspect;
    const fh = Math.tan(fovy / 2) * far;
    const fw = fh * aspect;
    // Camera looks along -Z; build near/far rects in cam frame
    const pts = [
      // near
      new THREE.Vector3(-nw, -nh, -near),
      new THREE.Vector3(nw, -nh, -near),
      new THREE.Vector3(nw, nh, -near),
      new THREE.Vector3(-nw, nh, -near),
      // far
      new THREE.Vector3(-fw, -fh, -far),
      new THREE.Vector3(fw, -fh, -far),
      new THREE.Vector3(fw, fh, -far),
      new THREE.Vector3(-fw, fh, -far),
    ];
    const idx = [
      0,1, 1,2, 2,3, 3,0,
      4,5, 5,6, 6,7, 7,4,
      0,4, 1,5, 2,6, 3,7,
    ];
    const positions = [];
    for (let i = 0; i < idx.length; i++) {
      const p = pts[idx[i]];
      positions.push(p.x, p.y, p.z);
    }
    const fGeom = new THREE.BufferGeometry();
    fGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const frustum = new THREE.LineSegments(
      fGeom,
      new THREE.LineBasicMaterial({ color: 0x33ddff, transparent: true, opacity: 0.55 }),
    );
    group.add(frustum);
    this.scene.add(group);
    this._frustumHelper = group;
  }

  async _preloadAprilTagTextures() {
    const ids = Array.from({ length: 16 }, (_, i) => 30 + i);
    await Promise.all(
      ids.map(
        (id) =>
          new Promise((resolve) => {
            this._texLoader.load(
              `/assets/textures/apriltag_${id}.png`,
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
    this.robotCam.quaternion.copy(quat);
    this.robotCam.up.set(0, 0, 1);
    if (this._frustumHelper) {
      this._frustumHelper.position.copy(pos);
      this._frustumHelper.quaternion.copy(quat);
    }
  }

  /** CSS-pixel PiP box (bottom-right). Sized from laid-out canvas, never window. */
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
    // Keep whole cyan frame clear of the panel/splitter edge (48px was still clipped).
    const rightInset = Math.max(100, Math.min(220, Math.round(cw * 0.2)));
    let pipW = Math.min(280, Math.max(140, Math.floor(cw * 0.24)));
    let pipH = Math.floor(pipW / ROBOT_UP_CAM_ASPECT);
    // Laag venster: PiP (met rand) past altijd in de hoogte.
    const maxH = Math.max(40, ch - 2 * margin - 4);
    if (pipH > maxH) {
      pipW = Math.max(1, Math.floor((pipW * maxH) / pipH));
      pipH = maxH;
    }
    return { cw, ch, margin, rightInset, pipW, pipH, corner: 'bottom-right' };
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
    // PiP aspect ~ 4:3
    this.robotCam.aspect = ROBOT_UP_CAM_ASPECT;
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
    const helper = this._frustumHelper;
    const fog = this.scene.fog;
    renderWithPip(this.renderer, {
      scene: this.scene,
      camera: this.camera,
      robotCam: this.robotCam,
      box,
      clearColor: 0x1a1f2a,
      frameColor: 0x33ddff,
      insetColor: 0x0a1624,
      // Kijkpiramide niet in de PiP (zit op de lens); geen mist zodat de tip leesbaar blijft.
      beforePip: () => {
        if (helper) helper.visible = false;
        this.scene.fog = null;
      },
      afterPip: () => {
        this.scene.fog = fog;
        if (helper) helper.visible = true;
      },
    });
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this._ro?.disconnect?.();
    this.controls.dispose();
    this.renderer.dispose();
  }
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
