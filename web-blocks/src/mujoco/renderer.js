import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Three.js MuJoCo geom-viewer (patroon van ftc-biobuzz-mujoco/web/src/renderer.js).
 * MuJoCo is Z-up.
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
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setClearColor(0x1a1f2a, 1);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x1a1f2a, 8, 22);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 40);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(1.8, -2.2, 1.4);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0, 0.15);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.update();

    this.scene.add(new THREE.HemisphereLight(0xdde7ff, 0x3a3020, 0.9));
    const sun = new THREE.DirectionalLight(0xfff2d6, 1.1);
    sun.position.set(2.5, -1.5, 5);
    this.scene.add(sun);

    this.root = new THREE.Group();
    this.scene.add(this.root);

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  init() {
    this._buildGeoms();
    this.sync();
  }

  resize() {
    const parent = this.canvas.parentElement;
    const w = parent?.clientWidth || 640;
    const h = parent?.clientHeight || 480;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(h, 1);
    this.camera.updateProjectionMatrix();
  }

  _buildGeoms() {
    while (this.root.children.length) {
      const c = this.root.children.pop();
      c.geometry?.dispose?.();
      c.material?.dispose?.();
    }
    this.bodies = [];
    const ngeom = this.model.ngeom;
    for (let i = 0; i < ngeom; i++) {
      const type = this.model.geom_type[i];
      const size = [
        this.model.geom_size[i * 3],
        this.model.geom_size[i * 3 + 1],
        this.model.geom_size[i * 3 + 2],
      ];
      const rgba = [
        this.model.geom_rgba[i * 4],
        this.model.geom_rgba[i * 4 + 1],
        this.model.geom_rgba[i * 4 + 2],
        this.model.geom_rgba[i * 4 + 3],
      ];
      let geometry = null;
      // mjtGeom: PLANE=0, HFIELD=1, SPHERE=2, CAPSULE=3, ELLIPSOID=4, CYLINDER=5, BOX=6
      switch (type) {
        case 0: // plane
          geometry = new THREE.PlaneGeometry(size[0] * 2 || 6, size[1] * 2 || 6);
          break;
        case 2:
          geometry = new THREE.SphereGeometry(size[0], 16, 12);
          break;
        case 3:
          geometry = new THREE.CapsuleGeometry(size[0], size[1] * 2, 6, 10);
          break;
        case 5:
          geometry = new THREE.CylinderGeometry(size[0], size[0], size[1] * 2, 16);
          break;
        case 6:
          geometry = new THREE.BoxGeometry(size[0] * 2, size[1] * 2, size[2] * 2);
          break;
        default:
          geometry = new THREE.BoxGeometry(0.05, 0.05, 0.05);
      }
      const material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(rgba[0], rgba[1], rgba[2]),
        transparent: rgba[3] < 1,
        opacity: rgba[3],
        roughness: 0.65,
        metalness: 0.05,
      });
      const mesh = new THREE.Mesh(geometry, material);
      if (type === 0) {
        // plane default is XY; MuJoCo plane is Z-up → rotate
        mesh.rotation.x = -Math.PI / 2;
      }
      this.root.add(mesh);
      this.bodies.push({ mesh, geomId: i, isPlane: type === 0 });
    }
  }

  sync() {
    for (const b of this.bodies) {
      if (b.isPlane) continue;
      const i = b.geomId;
      const pos = this.data.geom_xpos;
      const mat = this.data.geom_xmat;
      b.mesh.position.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      const m = mat;
      const o = i * 9;
      const e = new THREE.Matrix4().set(
        m[o], m[o + 3], m[o + 6], 0,
        m[o + 1], m[o + 4], m[o + 7], 0,
        m[o + 2], m[o + 5], m[o + 8], 0,
        0, 0, 0, 1,
      );
      b.mesh.quaternion.setFromRotationMatrix(e);
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.renderer.dispose();
  }
}
