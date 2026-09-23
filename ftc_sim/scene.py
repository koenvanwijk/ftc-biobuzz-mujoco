"""Build BIOBUZZ field MJCF — CAD meshes for HIVE/FLOWERS + primitives for floor/walls."""

from __future__ import annotations

import math
import xml.etree.ElementTree as ET
from pathlib import Path
from xml.dom import minidom

from . import constants as C

ASSETS_DIR = Path(__file__).resolve().parent / "assets"
MESH_DIR = ASSETS_DIR / "meshes"
TEX_DIR = ASSETS_DIR / "textures"


def _rgba(c: tuple[float, ...]) -> str:
    return " ".join(f"{x:.4f}" for x in c)


def _pos(*xyz: float) -> str:
    return " ".join(f"{x:.5f}" for x in xyz)


def _add_geom(parent: ET.Element, **attrs: str) -> ET.Element:
    return ET.SubElement(parent, "geom", attrs)


def _add_body(parent: ET.Element, name: str, pos: str = "0 0 0", **extra: str) -> ET.Element:
    attrs = {"name": name, "pos": pos}
    attrs.update(extra)
    return ET.SubElement(parent, "body", attrs)


def _mesh_available(name: str) -> bool:
    return (MESH_DIR / f"{name}.stl").exists()


def build_mjcf() -> str:
    """Return MJCF XML string for the full BIOBUZZ scene."""
    mujoco = ET.Element("mujoco", model="biobuzz_ftc_2026")

    # meshdir relative to the XML file location (assets/)
    ET.SubElement(mujoco, "compiler", angle="degree", meshdir="meshes", texturedir="textures", autolimits="true")
    ET.SubElement(
        mujoco,
        "option",
        timestep="0.002",
        gravity="0 0 -9.81",
        integrator="implicitfast",
        cone="elliptic",
        solver="Newton",
        iterations="50",
        tolerance="1e-8",
    )
    visual = ET.SubElement(mujoco, "visual")
    ET.SubElement(visual, "global", offwidth="1280", offheight="720")
    ET.SubElement(visual, "quality", shadowsize="2048")
    ET.SubElement(visual, "headlight", diffuse="0.7 0.7 0.7", ambient="0.3 0.3 0.3")

    default = ET.SubElement(mujoco, "default")
    ET.SubElement(
        default,
        "geom",
        friction="0.8 0.005 0.0001",
        solref="0.02 1",
        solimp="0.9 0.95 0.001",
        condim="3",
    )
    ET.SubElement(default, "joint", damping="0.05", armature="0.01")
    d_wheel = ET.SubElement(default, "default", **{"class": "wheel"})
    ET.SubElement(d_wheel, "geom", type="cylinder", friction="1.2 0.01 0.001", condim="6")
    ET.SubElement(d_wheel, "joint", type="hinge", axis="0 1 0", damping="0.1", armature="0.02")
    d_ball = ET.SubElement(default, "default", **{"class": "pollen"})
    ET.SubElement(
        d_ball,
        "geom",
        type="sphere",
        size=f"{C.POLLEN_R:.5f}",
        mass=f"{C.POLLEN_MASS}",
        rgba=_rgba(C.YELLOW),
        friction="1.1 0.02 0.002",
        solref="0.015 1",
        condim="6",
    )
    d_nectar = ET.SubElement(default, "default", **{"class": "nectar"})
    ET.SubElement(
        d_nectar,
        "geom",
        type="sphere",
        size=f"{C.NECTAR_R:.5f}",
        mass=f"{C.NECTAR_MASS}",
        friction="0.9 0.02 0.002",
        solref="0.015 1",
        condim="6",
    )

    asset = ET.SubElement(mujoco, "asset")
    ET.SubElement(
        asset,
        "texture",
        name="grid",
        type="2d",
        builtin="checker",
        rgb1="0.5 0.5 0.55",
        rgb2="0.42 0.42 0.48",
        width="512",
        height="512",
        mark="edge",
        markrgb="0.35 0.35 0.4",
    )
    ET.SubElement(
        asset,
        "material",
        name="tile_mat",
        texture="grid",
        texrepeat="6 6",
        reflectance="0.05",
    )
    ET.SubElement(asset, "material", name="wall_mat", rgba=_rgba(C.GRAY), reflectance="0.1")
    ET.SubElement(asset, "material", name="hive_mat", rgba=_rgba(C.DARK))
    ET.SubElement(asset, "material", name="red_mat", rgba="0.85 0.12 0.12 0.18")
    ET.SubElement(asset, "material", name="blue_mat", rgba="0.15 0.35 0.9 0.18")
    # Opaque alliance color for CELL rim rings only (set via geom rgba)
    ET.SubElement(asset, "material", name="red_rim_mat", rgba="0.85 0.12 0.12 1")
    ET.SubElement(asset, "material", name="blue_rim_mat", rgba="0.15 0.35 0.9 1")
    ET.SubElement(asset, "material", name="flower_mat", rgba="0.9 0.9 0.92 1")
    ET.SubElement(asset, "material", name="chassis_mat", rgba=_rgba(C.CHASSIS))
    ET.SubElement(asset, "material", name="intake_mat", rgba="0.3 0.3 0.35 1")
    ET.SubElement(asset, "material", name="shooter_mat", rgba="0.55 0.35 0.1 1")

    # CAD meshes (STL already Z-up, meters, field-centered)
    cad_meshes = [
        ("hive_frame", "hive_mat"),
        ("hive_red", "red_mat"),
        ("hive_blue", "blue_mat"),
        ("flower_pos_y", "flower_mat"),
        ("flower_neg_y", "flower_mat"),
        ("flower_neg_x", "flower_mat"),
        ("flower_pos_x", "flower_mat"),
    ]
    for mesh_name, _mat in cad_meshes:
        if _mesh_available(mesh_name):
            ET.SubElement(asset, "mesh", name=mesh_name, file=f"{mesh_name}.stl")
        hull = f"{mesh_name}_hull"
        if _mesh_available(hull):
            ET.SubElement(asset, "mesh", name=hull, file=f"{hull}.stl")

    # CELL rim meshes (CAD Goal Rib aperture silhouette, cell-local frame)
    for rim_name in ("cell_rim_front", "cell_rim_back", "cell_shell", "cell_back_cap"):
        if _mesh_available(rim_name):
            ET.SubElement(asset, "mesh", name=rim_name, file=f"{rim_name}.stl")

    # AprilTag textures + materials
    for cell in C.APRILTAG_CELLS.values():
        for tid in cell["ids"]:
            tex_name = f"apriltag_tex_{tid}"
            mat_name = f"apriltag_mat_{tid}"
            ET.SubElement(
                asset,
                "texture",
                name=tex_name,
                type="2d",
                file=f"apriltag_{tid:02d}.png",
            )
            ET.SubElement(
                asset,
                "material",
                name=mat_name,
                texture=tex_name,
                texuniform="true",
                reflectance="0.0",
                rgba="1 1 1 1",
            )

    world = ET.SubElement(mujoco, "worldbody")
    ET.SubElement(
        world,
        "light",
        name="sun",
        pos="0 0 4",
        dir="0 0 -1",
        diffuse="0.9 0.9 0.85",
        specular="0.3 0.3 0.3",
        castshadow="true",
    )
    ET.SubElement(world, "light", pos="2 2 3", dir="-0.5 -0.5 -1", diffuse="0.4 0.4 0.4")
    # Floor / tiles (primitives — tiles not imported from CAD)
    _add_geom(
        world,
        name="tiles",
        type="box",
        size=_pos(C.HALF, C.HALF, C.TILE_THICKNESS / 2),
        pos=_pos(0, 0, C.TILE_THICKNESS / 2),
        material="tile_mat",
        friction="1.0 0.01 0.001",
    )
    _add_geom(
        world,
        name="ground",
        type="plane",
        size="5 5 0.1",
        pos="0 0 0",
        rgba="0.3 0.3 0.3 0",
        contype="1",
        conaffinity="1",
    )

    _add_walls(world)
    _add_gardens(world)
    _add_loading_zones(world)
    _add_hive(world)
    _add_flowers(world)
    _add_apriltags(world)
    nectar_positions = _add_free_nectar(world)
    pollen_positions = compute_pollen_positions()
    for i, (x, y, z) in enumerate(pollen_positions):
        body = _add_body(world, f"pollen_{i:02d}", pos=_pos(x, y, z))
        ET.SubElement(body, "freejoint", name=f"pollen_fj_{i:02d}")
        _add_geom(body, name=f"pollen_g_{i:02d}", **{"class": "pollen"})

    _add_robot(world)

    actuator = ET.SubElement(mujoco, "actuator")
    ET.SubElement(
        actuator,
        "velocity",
        name="left_drive",
        joint="left_wheel_j",
        kv="20",
        ctrllimited="true",
        ctrlrange=f"{-C.MAX_WHEEL_VEL} {C.MAX_WHEEL_VEL}",
    )
    ET.SubElement(
        actuator,
        "velocity",
        name="right_drive",
        joint="right_wheel_j",
        kv="20",
        ctrllimited="true",
        ctrlrange=f"{-C.MAX_WHEEL_VEL} {C.MAX_WHEEL_VEL}",
    )

    equality = ET.SubElement(mujoco, "equality")
    ET.SubElement(
        equality,
        "joint",
        name="left_couple",
        joint1="left_wheel_j",
        joint2="left_wheel_j2",
        polycoef="0 1 0 0 0",
    )
    ET.SubElement(
        equality,
        "joint",
        name="right_couple",
        joint1="right_wheel_j",
        joint2="right_wheel_j2",
        polycoef="0 1 0 0 0",
    )

    keyframe = ET.SubElement(mujoco, "keyframe")
    ET.SubElement(
        keyframe,
        "key",
        name="home",
        qpos=_home_qpos(pollen_positions, nectar_positions),
    )

    rough = ET.tostring(mujoco, encoding="unicode")
    return minidom.parseString(rough).toprettyxml(indent="  ")


def _add_walls(world: ET.Element) -> None:
    h = C.WALL_HEIGHT
    t = C.WALL_THICKNESS
    half = C.HALF
    z = C.TILE_THICKNESS + h / 2
    walls = [
        ("wall_pos_y", (0, half + t / 2, z), (half + t, t / 2, h / 2)),
        ("wall_neg_y", (0, -(half + t / 2), z), (half + t, t / 2, h / 2)),
        ("wall_neg_x", (-(half + t / 2), 0, z), (t / 2, half, h / 2)),
        ("wall_pos_x", (half + t / 2, 0, z), (t / 2, half, h / 2)),
    ]
    for name, pos, size in walls:
        _add_geom(
            world,
            name=name,
            type="box",
            pos=_pos(*pos),
            size=_pos(*size),
            material="wall_mat",
        )


def _add_gardens(world: ET.Element) -> None:
    z = C.TILE_THICKNESS + 0.002
    _add_geom(
        world,
        name="garden_red",
        type="box",
        pos=_pos(-(C.HALF - C.GARDEN_LEN / 2), -(C.HALF - C.GARDEN_WIDTH / 2), z),
        size=_pos(C.GARDEN_LEN / 2, C.GARDEN_WIDTH / 2, 0.002),
        rgba=_rgba((*C.RED[:3], 0.7)),
        contype="0",
        conaffinity="0",
    )
    _add_geom(
        world,
        name="garden_blue",
        type="box",
        pos=_pos(C.HALF - C.GARDEN_LEN / 2, C.HALF - C.GARDEN_WIDTH / 2, z),
        size=_pos(C.GARDEN_LEN / 2, C.GARDEN_WIDTH / 2, 0.002),
        rgba=_rgba((*C.BLUE[:3], 0.7)),
        contype="0",
        conaffinity="0",
    )


def _add_loading_zones(world: ET.Element) -> None:
    z = C.TILE_THICKNESS + 0.0015
    _add_geom(
        world,
        name="loading_red",
        type="box",
        pos=_pos(-(C.HALF - C.LOADING_D / 2), -(C.HALF - C.LOADING_W / 2 - 0.15), z),
        size=_pos(C.LOADING_D / 2, C.LOADING_W / 2, 0.0015),
        rgba=_rgba((*C.RED[:3], 0.35)),
        contype="0",
        conaffinity="0",
    )
    _add_geom(
        world,
        name="loading_blue",
        type="box",
        pos=_pos(C.HALF - C.LOADING_D / 2, C.HALF - C.LOADING_W / 2 - 0.15, z),
        size=_pos(C.LOADING_D / 2, C.LOADING_W / 2, 0.0015),
        rgba=_rgba((*C.BLUE[:3], 0.35)),
        contype="0",
        conaffinity="0",
    )


def _add_hive(world: ET.Element) -> None:
    """CAD HIVE: fixed frame + tipped red/blue bodies; AprilTags glued to CELL undersides."""
    hive = _add_body(world, "hive_structure", pos="0 0 0")
    use_cad = all(_mesh_available(n) for n in ("hive_frame", "hive_red", "hive_blue"))

    # Parent bodies for each alliance hive (meshes already contain CAD tip pose ≈ ±30°).
    # Hinge about field X through pivot → bi-stable tip (0 = CAD start, ±60° = other pose).
    pivot_z = C.TILE_THICKNESS + C.HIVE_PIVOT_Z
    tip_lim = f"{-C.HIVE_TIP_TRAVEL_DEG - 1} {C.HIVE_TIP_TRAVEL_DEG + 1}"
    hive_red = _add_body(hive, "hive_red", pos="0 0 0")
    ET.SubElement(
        hive_red,
        "joint",
        name="hive_red_tip",
        type="hinge",
        axis="1 0 0",
        pos=_pos(0, 0, pivot_z),
        limited="true",
        range=tip_lim,
        damping="8",
        armature="0.2",
        frictionloss="2",
    )
    hive_blue = _add_body(hive, "hive_blue", pos="0 0 0")
    ET.SubElement(
        hive_blue,
        "joint",
        name="hive_blue_tip",
        type="hinge",
        axis="1 0 0",
        pos=_pos(0, 0, pivot_z),
        limited="true",
        range=tip_lim,
        damping="8",
        armature="0.2",
        frictionloss="2",
    )
    hive_parents = {"hive_red": hive_red, "hive_blue": hive_blue}

    if use_cad:
        # Fixed A-frame / ACM / feet
        frame = _add_body(hive, "hive_frame", pos="0 0 0")
        _add_geom(
            frame,
            name="hive_frame_vis",
            type="mesh",
            mesh="hive_frame",
            material="hive_mat",
            contype="0",
            conaffinity="0",
            group="1",
        )
        # CAD A-frame (sawhorse): long axis = ±X, short ends = A-frames at ±X.
        # Long-side underpass (drive along ±Y under the crossbar) stays open.
        # Short ends have a solid base plate between the two feet (official CAD).
        fw, fd = 0.60, 0.46  # CAD foot centroids (±X, ±Y)
        pivot_z = C.TILE_THICKNESS + C.HIVE_PIVOT_Z
        z0 = C.TILE_THICKNESS + 0.02
        # Four slanted legs: feet → peak of each short-end A-frame
        for sx, sy, name in [
            (-1, -1, "leg_sw"),
            (-1, 1, "leg_nw"),
            (1, -1, "leg_se"),
            (1, 1, "leg_ne"),
        ]:
            _add_geom(
                frame,
                name=f"hive_frame_{name}_col",
                type="capsule",
                fromto=_pos(sx * fw, sy * fd, z0, sx * fw, 0.0, pivot_z),
                size="0.03",
                rgba="0.5 0.5 0.5 0",
                contype="1",
                conaffinity="1",
                group="3",
            )
        # Short-side base plates (grey CAD bars between feet) — block drive-through
        plate_h = 0.06
        plate_t = 0.04
        for sx, name in [(-1, "base_neg_x"), (1, "base_pos_x")]:
            _add_geom(
                frame,
                name=f"hive_frame_{name}_col",
                type="box",
                pos=_pos(sx * fw, 0.0, z0 + plate_h / 2),
                size=_pos(plate_t / 2, fd + 0.02, plate_h / 2),
                rgba="0.5 0.5 0.5 0",
                contype="1",
                conaffinity="1",
                group="3",
            )
        # Top crossbar along long axis (±X); thin so underpass clearance remains
        _add_geom(
            frame,
            name="hive_frame_crossbar_col",
            type="capsule",
            fromto=_pos(-fw, 0.0, pivot_z, fw, 0.0, pivot_z),
            size="0.03",
            rgba="0.5 0.5 0.5 0",
            contype="1",
            conaffinity="1",
            group="3",
        )
        # Red / blue tipped CAD (Goal Ribs + skins included); no misleading translucent boxes
        for body, name, mat in (
            (hive_red, "hive_red", "red_mat"),
            (hive_blue, "hive_blue", "blue_mat"),
        ):
            _add_geom(
                body,
                name=f"{name}_vis",
                type="mesh",
                mesh=name,
                material=mat,
                contype="0",
                conaffinity="0",
                group="1",
            )
            if _mesh_available(f"{name}_hull"):
                # Visual-only hull: solid CAD hull intersects CELL cavities and
                # would eject free NECTAR/POLLEN. Robot hits the frame hull instead.
                _add_geom(
                    body,
                    name=f"{name}_col",
                    type="mesh",
                    mesh=f"{name}_hull",
                    rgba="0.5 0.5 0.5 0",
                    contype="0",
                    conaffinity="0",
                    group="3",
                )
        # Translucent CAD skins + opaque front/back CELL rim rings (no full box shell)
        _add_cell_nectar_frames(hive_parents)
    else:
        # Primitive fallback (pre-CAD): tipped ±HIVE_TIP_ANGLE_DEG about X
        fw, fd = C.HIVE_FRAME_W / 2, C.HIVE_FRAME_D / 2
        pivot_z = C.TILE_THICKNESS + C.HIVE_PIVOT_Z
        frame = _add_body(hive, "hive_frame", pos="0 0 0")
        _add_geom(
            frame,
            name="hive_crossbar",
            type="cylinder",
            fromto=_pos(-fw * 0.35, 0, pivot_z, fw * 0.35, 0, pivot_z),
            size="0.025",
            material="hive_mat",
        )
        for sx, sy, name in [(-1, -1, "leg_sw"), (-1, 1, "leg_nw"), (1, -1, "leg_se"), (1, 1, "leg_ne")]:
            _add_geom(
                frame,
                name=f"hive_{name}",
                type="capsule",
                fromto=_pos(sx * fw * 0.9, sy * fd * 0.9, C.TILE_THICKNESS + 0.02, sx * 0.15, sy * 0.05, pivot_z),
                size="0.02",
                material="hive_mat",
            )
        tip = C.HIVE_TIP_ANGLE_DEG
        _add_cell(hive_red, "red_cell_audience_shell", color="red_mat", pos=(-0.22, 0.28, pivot_z - 0.15), tip_x_deg=-tip)
        _add_cell(hive_red, "red_cell_scoring_shell", color="red_mat", pos=(-0.22, -0.28, pivot_z - 0.55), tip_x_deg=-tip)
        _add_cell(hive_blue, "blue_cell_scoring_shell", color="blue_mat", pos=(0.22, -0.28, pivot_z - 0.15), tip_x_deg=tip)
        _add_cell(hive_blue, "blue_cell_audience_shell", color="blue_mat", pos=(0.22, 0.28, pivot_z - 0.55), tip_x_deg=tip)

    # AprilTags rigidly parented under each CELL underside body
    _add_apriltags_on_cells(hive_parents)
    _add_nectar_in_cells(hive_parents)


def _add_cell(
    parent: ET.Element,
    name: str,
    color: str,
    pos: tuple[float, float, float],
    tip_x_deg: float,
    collide: bool = True,
    visible: bool = True,
) -> ET.Element:
    """CELL shell tipped about X by tip_x_deg (CAD bi-stable ≈ ±30°)."""
    w, h, d = C.CELL_OPEN_W / 2, C.CELL_OPEN_H / 2, C.CELL_OPEN_D / 2
    thick = 0.015
    body = _add_body(parent, name, pos=_pos(*pos), euler=f"{tip_x_deg:.4f} 0 0")
    col = {} if collide else {"contype": "0", "conaffinity": "0"}
    alpha = 0.0 if not visible else (0.25 if collide else 1.0)
    base = C.RED if "red" in name else C.BLUE
    rgba = _rgba((*base[:3], alpha))
    group = "3" if not visible else "1"
    _add_geom(
        body,
        name=f"{name}_bottom",
        type="box",
        pos=_pos(0, 0, -h),
        size=_pos(w, d, thick / 2),
        material=color,
        rgba=rgba,
        group=group,
        **col,
    )
    for side, p, s in [
        ("front", (0, d, 0), (w, thick / 2, h)),
        ("back", (0, -d, 0), (w, thick / 2, h)),
        ("left", (-w, 0, 0), (thick / 2, d, h)),
        ("right", (w, 0, 0), (thick / 2, d, h)),
    ]:
        _add_geom(
            body,
            name=f"{name}_{side}",
            type="box",
            pos=_pos(*p),
            size=_pos(*s),
            material=color,
            rgba=rgba,
            group=group,
            **col,
        )
    return body


def _add_cell_nectar_frames(hive_parents: dict[str, ET.Element]) -> None:
    """
    CELL frame bodies at cavity centers: invisible collision cups + opaque
    front/back rim rings (opaque) + translucent CAD shell/back skins.
    """
    for key, spec in C.CELL_SHELLS.items():
        parent = hive_parents[spec["hive"]]
        tip_x = float(spec["tip_euler_x"])
        body = _add_body(
            parent,
            f"{key}_shell",
            pos=_pos(*spec["pos"]),
            euler=f"{tip_x:.4f} 0 0",
        )
        s_open = float(spec.get("open_sign", 1.0))
        _add_invisible_cell_cup(body, key, s_open)
        color = "red" if "red" in key else "blue"
        _add_cell_rim_rings(body, key, s_open, color)
        _add_cell_cad_enclosure(body, key, s_open, color)


def _add_cell_rim_rings(body: ET.Element, key: str, s_open: float, color: str) -> None:
    """
    Solid (alpha=1) CAD-accurate front/back CELL rim meshes.

    Meshes ``cell_rim_front`` / ``cell_rim_back`` are extruded from the official
    Goal Rib (am-5866) aperture silhouette in CELL local frame (opening at +Y).
    For open_sign=-1, yaw 180° so the front rim faces local −Y.
    Visual-only — cups already provide collision.
    """
    base = C.RED if color == "red" else C.BLUE
    rgba = _rgba((*base[:3], 1.0))
    rim_mat = "red_rim_mat" if color == "red" else "blue_rim_mat"
    # Canonical meshes assume open_sign=+1 (front at +Y). Flip 180° about Z when −1.
    euler = "0 0 0" if s_open >= 0.0 else "0 0 180"
    has_front = _mesh_available("cell_rim_front")
    has_back = _mesh_available("cell_rim_back")
    if has_front or has_back:
        if has_front:
            _add_geom(
                body,
                name=f"{key}_ring_front",
                type="mesh",
                mesh="cell_rim_front",
                pos="0 0 0",
                euler=euler,
                material=rim_mat,
                rgba=rgba,
                contype="0",
                conaffinity="0",
                group="1",
            )
        if has_back:
            _add_geom(
                body,
                name=f"{key}_ring_back",
                type="mesh",
                mesh="cell_rim_back",
                pos="0 0 0",
                euler=euler,
                material=rim_mat,
                rgba=rgba,
                contype="0",
                conaffinity="0",
                group="1",
            )
        return

    # Fallback: rectangular box frame if STL missing (thin — match CELL_CUP rim)
    w, h, d = C.CELL_CUP_OPEN_W / 2, C.CELL_CUP_OPEN_H / 2, C.CELL_OPEN_D / 2
    bar_t = 0.010  # ring width
    bar_d = 0.010  # extrusion depth
    for face, y_sign in (("front", s_open), ("back", -s_open)):
        y = y_sign * d
        bars = [
            ("top", (0.0, y, h + bar_t / 2), (w + bar_t, bar_d / 2, bar_t / 2)),
            ("bot", (0.0, y, -(h + bar_t / 2)), (w + bar_t, bar_d / 2, bar_t / 2)),
            ("left", (-(w + bar_t / 2), y, 0.0), (bar_t / 2, bar_d / 2, h)),
            ("right", (w + bar_t / 2, y, 0.0), (bar_t / 2, bar_d / 2, h)),
        ]
        for side, p, s in bars:
            _add_geom(
                body,
                name=f"{key}_ring_{face}_{side}",
                type="box",
                pos=_pos(*p),
                size=_pos(*s),
                rgba=rgba,
                contype="0",
                conaffinity="0",
                group="1",
            )





def _add_cell_cad_enclosure(body: ET.Element, key: str, s_open: float, color: str) -> None:
    """
    CAD Goal-Rib-shaped shell + solid back cap (visual).
    Follows hive aperture silhouette — not a rectangular box.
    Front stays open; collision cup still holds pieces.
    """
    base = C.RED if color == "red" else C.BLUE
    # Transparent hive skins (top/back/sides); rings stay opaque elsewhere
    rgba = _rgba((*base[:3], 0.18))
    euler = "0 0 0" if s_open >= 0.0 else "0 0 180"
    if _mesh_available("cell_shell"):
        _add_geom(
            body,
            name=f"{key}_shell_vis",
            type="mesh",
            mesh="cell_shell",
            pos="0 0 0",
            euler=euler,
            rgba=rgba,
            contype="0",
            conaffinity="0",
            group="1",
        )
    if _mesh_available("cell_back_cap"):
        _add_geom(
            body,
            name=f"{key}_back_cap",
            type="mesh",
            mesh="cell_back_cap",
            pos="0 0 0",
            euler=euler,
            rgba=rgba,
            contype="0",
            conaffinity="0",
            group="1",
        )


def _add_invisible_cell_cup(body: ET.Element, key: str, s_open: float) -> None:
    """
    Invisible sealed cup: floor, ceiling, sides, back, shallow front sill.

    Visual enclosure is CAD-shaped (cell_shell); these boxes are collision-only.
    Aperture uses CELL_CUP_OPEN_* (flush with thin visual rim) so balls do not
    lodge in a pocket behind a thick recessed lip. Back + full-depth sides stay
    thick for tip containment; only the front opening is opened up.
    """
    # Cup aperture (wider than official CELL_OPEN — matches thin rim inner edge)
    w, h = C.CELL_CUP_OPEN_W / 2, C.CELL_CUP_OPEN_H / 2
    d = C.CELL_OPEN_D / 2
    thick = C.CELL_CUP_WALL_T
    lip_t = C.CELL_CUP_LIP_T
    lip_h = C.CELL_CUP_LIP_H
    # Local +Z = underside (floor); local −Z = cavity top.
    # Floor/ceiling/sides: front face at opening plane y=s_open*d (no outward shelf
    # past the rim, no inward overhang that traps balls behind the rim).
    # Center Y so front edge = s_open*d and back edge ≈ -s_open*d.
    y_c = 0.0
    y_half = d
    # Side walls sit OUTSIDE the aperture: inner face at ±w.
    panels = [
        (
            "floor",
            (0.0, y_c, h + thick / 2),
            (w + thick, y_half, thick / 2),
        ),
        (
            "ceiling",
            (0.0, y_c, -(h + thick / 2)),
            (w + thick, y_half, thick / 2),
        ),
        (
            "back",
            (0.0, -s_open * (d + thick * 0.5), 0.0),
            (w + thick, thick / 2, h + thick),
        ),
        (
            "left",
            (-(w + thick / 2), y_c, 0.0),
            (thick / 2, y_half, h + thick),
        ),
        (
            "right",
            (w + thick / 2, y_c, 0.0),
            (thick / 2, y_half, h + thick),
        ),
        # Shallow sill at the opening plane (floor side) — retention without a
        # deep pocket behind the rim.
        (
            "lip",
            (0.0, s_open * (d - lip_t / 2), h - lip_h / 2),
            (w, lip_t / 2, lip_h / 2),
        ),
    ]
    for side, p, s in panels:
        _add_geom(
            body,
            name=f"{key}_cup_{side}",
            type="box",
            pos=_pos(*p),
            size=_pos(*s),
            rgba="0.5 0.5 0.5 0",
            friction="1.4 0.05 0.005",
            condim="6",
            group="3",
        )


def _add_flower_retention(flower: ET.Element, name: str, cx: float, cy: float) -> None:
    """
    Floor disc + segmented retention collar so 4 POLLEN stay under gravity
    until a robot bumper/intake nudge pushes them out.
    """
    floor_z = C.TILE_THICKNESS + C.FLOWER_FLOOR_H / 2
    _add_geom(
        flower,
        name=f"{name}_floor",
        type="cylinder",
        pos=_pos(cx, cy, floor_z),
        size=_pos(C.FLOWER_COLLAR_INNER_R + C.FLOWER_COLLAR_WALL_T, C.FLOWER_FLOOR_H / 2),
        rgba="0.85 0.85 0.88 0",
        friction="1.4 0.05 0.005",
        condim="6",
        group="3",
    )
    # Segmented ring wall (MuJoCo has no hollow cylinder collider)
    n = C.FLOWER_COLLAR_SEGS
    r_mid = C.FLOWER_COLLAR_INNER_R + C.FLOWER_COLLAR_WALL_T / 2
    wall_z = C.TILE_THICKNESS + C.FLOWER_FLOOR_H + C.FLOWER_COLLAR_WALL_H / 2
    # Chord length ≈ 2*r*sin(pi/n); use tangential box length slightly longer
    seg_len = 2.0 * r_mid * math.sin(math.pi / n) * 1.15
    for i in range(n):
        ang = 2.0 * math.pi * i / n
        px = cx + r_mid * math.cos(ang)
        py = cy + r_mid * math.sin(ang)
        yaw = math.degrees(ang + math.pi / 2.0)
        _add_geom(
            flower,
            name=f"{name}_collar_{i}",
            type="box",
            pos=_pos(px, py, wall_z),
            size=_pos(seg_len / 2, C.FLOWER_COLLAR_WALL_T / 2, C.FLOWER_COLLAR_WALL_H / 2),
            euler=f"0 0 {yaw:.4f}",
            rgba="0.9 0.9 0.92 0",
            friction="1.4 0.05 0.005",
            condim="6",
            group="3",
        )


def _add_flowers(world: ET.Element) -> None:
    """CAD FLOWER meshes at official positions; primitive fallback otherwise."""
    for name, x, y, yaw in C.FLOWER_CAD_XY:
        flower = _add_body(world, name, pos="0 0 0")
        if _mesh_available(name):
            _add_geom(
                flower,
                name=f"{name}_vis",
                type="mesh",
                mesh=name,
                material="flower_mat",
                contype="0",
                conaffinity="0",
                group="1",
            )
            if _mesh_available(f"{name}_hull"):
                _add_geom(
                    flower,
                    name=f"{name}_col",
                    type="mesh",
                    mesh=f"{name}_hull",
                    rgba="0.8 0.8 0.8 0",
                    contype="0",
                    conaffinity="0",
                    group="3",
                )
            _add_flower_retention(flower, name, x, y)
        else:
            flower.set("pos", _pos(x, y, 0))
            flower.set("euler", f"0 0 {yaw}")
            _add_flower_retention(flower, name, 0.0, 0.0)
            top_z = C.TILE_THICKNESS + C.FLOWER_TOP_Z
            for i, (px, py) in enumerate([(0.035, 0.035), (0.035, -0.035), (-0.035, 0.035), (-0.035, -0.035)]):
                _add_geom(
                    flower,
                    name=f"{name}_post_{i}",
                    type="capsule",
                    fromto=_pos(px, py, C.TILE_THICKNESS + 0.02, px * 0.6, py * 0.6, top_z),
                    size="0.008",
                    material="flower_mat",
                )
            _add_geom(
                flower,
                name=f"{name}_ring_top",
                type="cylinder",
                pos=_pos(0, 0, top_z),
                size=_pos(C.FLOWER_TOP_DIA / 2, 0.008),
                material="flower_mat",
            )


def _add_apriltags(world: ET.Element) -> None:
    """No-op: tags are parented under CELL bodies inside _add_hive."""
    return


def _add_apriltags_on_cells(hive_parents: dict[str, ET.Element]) -> None:
    """
    Glue 36h11 AprilTags to each CELL underside (facing tiles).
    Parent under hive_red / hive_blue so sites track tip.
    CAD tip_euler_x: red −150°, blue +150° (plate tip 30°; +Z toward tiles).
    Strip: 4 tags, 3.25 in, bottom edge toward field center (manual §9.9).
    """
    half = C.APRILTAG_SIZE / 2
    pair_pitch = C.APRILTAG_SIZE * 1.12
    pair_gap = C.APRILTAG_SIZE * 0.55
    offsets_x = [
        -1.5 * pair_pitch - pair_gap / 2,
        -0.5 * pair_pitch - pair_gap / 2,
        0.5 * pair_pitch + pair_gap / 2,
        1.5 * pair_pitch + pair_gap / 2,
    ]

    for cell_name, spec in C.APRILTAG_CELLS.items():
        parent = hive_parents[spec["hive"]]
        cx, cy, cz = spec["pos"]
        tip_x = float(spec["tip_euler_x"])
        # CELL underside body at CAD plate centroid; euler so geom +Z faces tiles
        cell = _add_body(
            parent,
            spec["cell"],
            pos=_pos(cx, cy, cz),
            euler=f"{tip_x:.4f} 0 0",
        )
        # Strip along ±X; flip so production left→right reads with bottom toward field center
        x_sign = 1.0 if cx < 0 else -1.0
        for i, tid in enumerate(spec["ids"]):
            ox = x_sign * offsets_x[i]
            # Slight lift along local +Z (toward tiles) so plate sits on outer skin
            gbody = _add_body(cell, f"apriltag_body_{tid}", pos=_pos(ox, 0.0, 0.004))
            _add_geom(
                gbody,
                name=f"apriltag_geom_{tid}",
                type="box",
                size=_pos(half, half, 0.003),
                material=f"apriltag_mat_{tid}",
                contype="0",
                conaffinity="0",
                group="1",
            )
            # Site on same body: local +Z toward tiles; +X toward field center when possible
            # After body euler, local +Z is face normal toward tiles. Build xyaxes in CELL frame:
            # x along strip toward center projection onto plate, y = z × x
            # In cell-local coords: z=(0,0,1), prefer x toward center.
            # World center direction projected: for red (cx<0) center is +X → local +X.
            x_sign = 1.0 if cx < 0 else -1.0
            xx, xy, xz = x_sign, 0.0, 0.0
            # y = z × x = (0,0,1)×(x_sign,0,0) = (0,1,0)*x_sign? → (0, x_sign, 0) wait
            # z×x = (z_y*xz - z_z*xy, z_z*xx - z_x*xz, z_x*xy - z_y*xx) = (0, xx, 0) with z=(0,0,1)
            yx, yy, yz = 0.0, xx, 0.0
            xyaxes = f"{xx:.5f} {xy:.5f} {xz:.5f} {yx:.5f} {yy:.5f} {yz:.5f}"
            ET.SubElement(
                gbody,
                "site",
                name=f"apriltag_{tid}",
                pos="0 0 0",
                size="0.01",
                rgba="0 1 0 0",
                xyaxes=xyaxes,
            )


def _add_nectar_visual(world: ET.Element) -> None:
    """No-op: free nectar added via _add_free_nectar."""
    return


def _cell_local_to_world(
    shell_key: str, local: tuple[float, float, float]
) -> tuple[float, float, float]:
    """Map CELL-local point to world (CAD tip pose, tip joint = 0)."""
    spec = C.CELL_SHELLS[shell_key]
    tip = math.radians(float(spec["tip_euler_x"]))
    c, s = math.cos(tip), math.sin(tip)
    # Rx(tip) * local + pos
    lx, ly, lz = local
    wy = c * ly - s * lz
    wz = s * ly + c * lz
    px, py, pz = spec["pos"]
    return (px + lx, py + wy, pz + wz)


def _nectar_stage_locals(shell_key: str, x_sign: float) -> list[tuple[float, float, float]]:
    w, h, d = C.CELL_OPEN_W / 2, C.CELL_OPEN_H / 2, C.CELL_OPEN_D / 2
    s_open = float(C.CELL_SHELLS[shell_key].get("open_sign", 1.0))
    y_back = -s_open * (d - C.NECTAR_R - 0.02)
    z_bot = h - C.NECTAR_R - 0.02
    return [(x_sign * (0.05 + i * 0.09), y_back, z_bot) for i in range(3)]


def _add_nectar_in_cells(hive_parents: dict[str, ET.Element]) -> None:
    """No-op: free nectar staged in world so they can fall on tip."""
    return


def _add_free_nectar(world: ET.Element) -> list[tuple[str, float, float, float, tuple]]:
    """
    Free NECTAR: 3 staged per alliance in upward CELLs + NECTAR_EXTRA_POOL parked
    extras each (released one-per-tip into loading zone, up to 8 total per color).
    Returns list of (name, x, y, z, rgba) for keyframe qpos.
    """
    staged: list[tuple[str, float, float, float, tuple]] = []
    specs = [
        ("red_audience", C.RED, "nectar_red", -1.0),
        ("blue_scoring", C.BLUE, "nectar_blue", 1.0),
    ]
    for shell_key, rgba, prefix, x_sign in specs:
        for i, local in enumerate(_nectar_stage_locals(shell_key, x_sign)):
            x, y, z = _cell_local_to_world(shell_key, local)
            name = f"{prefix}_{i}"
            body = _add_body(world, name, pos=_pos(x, y, z))
            ET.SubElement(body, "freejoint", name=f"{name}_fj")
            _add_geom(body, name=f"{prefix}_g_{i}", **{"class": "nectar"}, rgba=_rgba(rgba))
            staged.append((name, x, y, z, rgba))
    # Parked extras: nectar_extra_{color}_{i} — released one per tip
    for color, rgba in (("red", C.RED), ("blue", C.BLUE)):
        for i in range(C.NECTAR_EXTRA_POOL):
            name = f"nectar_extra_{color}_{i}"
            x = (-0.15 if color == "red" else 0.15) + i * 0.02
            y, z = 0.0, C.EXTRA_NECTAR_PARK_Z
            body = _add_body(world, name, pos=_pos(x, y, z))
            ET.SubElement(body, "freejoint", name=f"{name}_fj")
            _add_geom(
                body,
                name=f"{name}_g",
                **{"class": "nectar"},
                rgba=_rgba(rgba),
            )
            staged.append((name, x, y, z, rgba))
    return staged


def flower_bottom_xy() -> list[tuple[float, float]]:
    """Official CAD flower XY centers (for pollen staging)."""
    return [(x, y) for _n, x, y, _yaw in C.FLOWER_CAD_XY]


def compute_pollen_positions() -> list[tuple[float, float, float]]:
    """
    Legal staging per Competition Manual §10.3.1:
      16 in FLOWERS (4×4)
       4 in red GARDEN
       4 in blue GARDEN
       4 preload (start in hopper — staged at robot; sim moves into hopper)
      12 at other three loading/start positions (3×4)
    Total 40.
    """
    positions: list[tuple[float, float, float]] = []
    z0 = C.TILE_THICKNESS + C.POLLEN_R + 0.001
    spacing = C.POLLEN_DIA * 1.05

    # FLOWERS: 4 POLLEN stacked & recessed in retention collar (centered)
    flower_z0 = C.TILE_THICKNESS + C.FLOWER_FLOOR_H + C.POLLEN_R + 0.001
    for fx, fy in flower_bottom_xy():
        for k in range(4):
            positions.append((fx, fy, flower_z0 + k * C.POLLEN_DIA * 0.98))

    for i in range(4):
        x = -(C.HALF - C.POLLEN_R - 0.01) + i * spacing
        y = -(C.HALF - C.POLLEN_R - 0.01)
        positions.append((x, y, z0))

    for i in range(4):
        x = (C.HALF - C.POLLEN_R - 0.01) - i * spacing
        y = C.HALF - C.POLLEN_R - 0.01
        positions.append((x, y, z0))

    rx, ry, _ = robot_start_pose()

    # Preload indices 24..27 — staged near robot; HopperController sucks them at reset
    for i in range(4):
        positions.append(
            (
                rx + 0.05 + (i % 2) * spacing,
                ry - 0.08 + (i // 2) * spacing,
                z0,
            )
        )

    other_starts = [
        (-(C.HALF - 0.25), C.HALF - 0.6),
        (C.HALF - 0.25, -(C.HALF - 0.6)),
        (C.HALF - 0.25, C.HALF - 0.6),
    ]
    for sx, sy in other_starts:
        for i in range(4):
            positions.append(
                (
                    sx + ((i % 2) - 0.5) * spacing,
                    sy + ((i // 2) - 0.5) * spacing,
                    z0,
                )
            )

    assert len(positions) == C.NUM_POLLEN, f"Expected {C.NUM_POLLEN} pollen, got {len(positions)}"
    return positions


def robot_start_pose() -> tuple[float, float, float]:
    x = -(C.HALF - C.ROBOT_L / 2 - 0.02)
    y = -(C.HALF - C.LOADING_W / 2 - 0.2)
    yaw = 0.0
    return x, y, yaw


def _add_robot(world: ET.Element) -> None:
    rx, ry, yaw = robot_start_pose()
    z = C.TILE_THICKNESS + C.WHEEL_R - 0.001  # 1 mm sink for reliable wheel contact
    robot = _add_body(world, "robot", pos=_pos(rx, ry, z), euler=f"0 0 {yaw}")
    ET.SubElement(robot, "freejoint", name="robot_free")

    # Chassis sat higher; drop body so underside is closer to the field.
    _add_geom(
        robot,
        name="chassis",
        type="box",
        pos=_pos(0, 0, C.ROBOT_H / 2 - 0.025),
        size=_pos(C.ROBOT_L / 2, C.ROBOT_W / 2, C.ROBOT_H / 2),
        mass="3.5",
        material="chassis_mat",
        friction="0.4 0.01 0.001",
    )
    # Low colliding bumper skirt (was visual-only and too high → drove over balls).
    # Ground ≈ z=-WHEEL_R; keep ~5 mm clearance.
    skirt_z = -C.WHEEL_R + 0.028
    _add_geom(
        robot,
        name="bumper",
        type="box",
        pos=_pos(0, 0, skirt_z),
        size=_pos(C.ROBOT_L / 2 + 0.015, C.ROBOT_W / 2 + 0.015, 0.022),
        rgba=_rgba((*C.RED[:3], 0.9)),
        mass="0.35",
        friction="1.2 0.05 0.005",
        condim="6",
        solref="0.004 1",
        solimp="0.95 0.99 0.001",
    )
    # Extra front plow lip — catches balls dead-ahead of the intake
    _add_geom(
        robot,
        name="front_plow",
        type="box",
        pos=_pos(C.ROBOT_L / 2 + 0.01, 0, skirt_z),
        size=_pos(0.012, C.ROBOT_W / 2 + 0.01, 0.028),
        rgba="0.2 0.2 0.22 1",
        mass="0.15",
        friction="1.4 0.05 0.005",
        condim="6",
    )

    # Upward Limelight-style camera: chassis-mounted above hopper, looks mostly +Z
    # with slight forward (+X) tilt so tipped CELL underside AprilTags are in view.
    # Local pose: pos=(0.16, 0, 0.28) — above hopper & ahead of shooter so lens is clear.
    # look ≈ normalize(0.77, 0, 0.64) in robot frame (~40° elevation).
    # MuJoCo camera looks along -Z; with x=(0,-1,0), y=(-0.64,0,0.77) → look=(0.77,0,0.64).
    ET.SubElement(
        robot,
        "camera",
        name="robot_up_cam",
        pos=_pos(0.16, 0.0, 0.28),
        xyaxes="0 -1 0  -0.64 0 0.77",
        fovy="70",
    )
    ET.SubElement(
        robot,
        "site",
        name="robot_up_cam",
        pos=_pos(0.16, 0.0, 0.28),
        xyaxes="0 -1 0  -0.64 0 0.77",
        size="0.02",
        rgba="0.2 0.9 1 0.35",
        type="sphere",
    )

    # Hopper volume (visual)
    _add_geom(
        robot,
        name="hopper",
        type="box",
        pos=_pos(0.0, 0.0, 0.14),
        size=_pos(0.08, 0.08, 0.06),
        rgba="0.4 0.4 0.15 0.35",
        mass="0.15",
        contype="0",
        conaffinity="0",
    )

    # Front intake (+X): rollers visual + capture site
    ix, iy, iz = C.INTAKE_SITE_POS
    intake = _add_body(robot, "intake", pos=_pos(ix, iy, iz))
    _add_geom(
        intake,
        name="intake_housing",
        type="box",
        size=_pos(0.03, 0.06, 0.04),
        material="intake_mat",
        mass="0.2",
    )
    _add_geom(
        intake,
        name="intake_roller",
        type="cylinder",
        size=_pos(0.035, 0.025),
        euler="0 90 0",
        rgba="0.15 0.15 0.18 1",
        mass="0.05",
        contype="0",
        conaffinity="0",
    )
    ET.SubElement(
        intake,
        "site",
        name="intake_site",
        pos="0.04 0 0",
        size=f"{C.INTAKE_CAPTURE_R}",
        rgba="0.2 0.9 0.2 0.15",
        type="sphere",
    )

    # Rear nectar intake (−X): wider rollers + capture site for red/blue NECTAR
    nx, ny, nz = C.NECTAR_INTAKE_SITE_POS
    nintake = _add_body(robot, "nectar_intake", pos=_pos(nx, ny, nz))
    _add_geom(
        nintake,
        name="nectar_intake_housing",
        type="box",
        size=_pos(0.04, 0.08, 0.05),
        material="intake_mat",
        mass="0.25",
        rgba="0.55 0.2 0.55 1",
    )
    _add_geom(
        nintake,
        name="nectar_intake_roller",
        type="cylinder",
        size=_pos(0.045, 0.04),
        euler="0 90 0",
        rgba="0.7 0.15 0.5 1",
        mass="0.08",
        contype="0",
        conaffinity="0",
    )
    ET.SubElement(
        nintake,
        "site",
        name="nectar_intake_site",
        pos="-0.05 0 0",
        size=f"{C.NECTAR_INTAKE_CAPTURE_R}",
        rgba="0.9 0.2 0.8 0.18",
        type="sphere",
    )

    # Arc shooter: barrel along robot +X, elevated (matches fire direction)
    sx, sy, sz = C.SHOOTER_MUZZLE_POS
    elev = float(C.SHOOT_ELEVATION_DEG)
    # Body euler Ry(90-elev): local +Z = forward+up shoot axis
    shooter = _add_body(
        robot,
        "shooter",
        pos=_pos(sx, sy, sz),
        euler=f"0 {90.0 - elev:.4f} 0",
    )
    _add_geom(
        shooter,
        name="shooter_housing",
        type="cylinder",
        size=_pos(0.03, 0.05),
        material="shooter_mat",
        mass="0.25",
    )
    ET.SubElement(
        shooter,
        "site",
        name="shooter_muzzle",
        pos="0 0 0.06",
        size="0.015",
        rgba="1 0.5 0 0.5",
    )

    tw = C.TRACK_WIDTH / 2
    ax = C.ROBOT_L * 0.28
    for side, syw, jname, jname2 in [
        ("left", tw, "left_wheel_j", "left_wheel_j2"),
        ("right", -tw, "right_wheel_j", "right_wheel_j2"),
    ]:
        for idx, (wx, jn) in enumerate([(ax, jname), (-ax, jname2)]):
            wb = _add_body(robot, f"{side}_wheel_{idx}", pos=_pos(wx, syw, 0))
            ET.SubElement(wb, "joint", name=jn, type="hinge", axis="0 1 0")
            _add_geom(
                wb,
                name=f"{side}_wheel_g_{idx}",
                type="cylinder",
                size=_pos(C.WHEEL_R, C.WHEEL_W / 2),
                euler="90 0 0",
                mass="0.15",
                rgba="0.1 0.1 0.1 1",
                friction="1.8 0.02 0.002",
                condim="6",
                margin="0.001",
                gap="0.0005",
            )


def _home_qpos(
    pollen_positions: list[tuple[float, float, float]],
    nectar_positions: list[tuple[str, float, float, float, tuple]] | None = None,
) -> str:
    """
    Keyframe qpos order follows MJCF joint order:
      hive_red_tip, hive_blue_tip,
      nectar freejoints (6 staged + 10 extra pool),
      pollen freejoints (40),
      robot freejoint + 4 wheel hinges.
    """
    q: list[float] = []
    # Tip hinges at CAD pose (0)
    q.extend([0.0, 0.0])
    if nectar_positions:
        for _name, x, y, z, _rgba in nectar_positions:
            q.extend([x, y, z, 1.0, 0.0, 0.0, 0.0])
    for x, y, pz in pollen_positions:
        q.extend([x, y, pz, 1.0, 0.0, 0.0, 0.0])
    rx, ry, yaw = robot_start_pose()
    z = C.TILE_THICKNESS + C.WHEEL_R
    cy = math.cos(math.radians(yaw) / 2)
    sy = math.sin(math.radians(yaw) / 2)
    q.extend([rx, ry, z, cy, 0.0, 0.0, sy])
    q.extend([0.0, 0.0, 0.0, 0.0])
    return " ".join(f"{v:.5f}" for v in q)


def write_scene(path: Path | None = None) -> Path:
    if path is None:
        path = ASSETS_DIR / "biobuzz_scene.xml"
    path.parent.mkdir(parents=True, exist_ok=True)
    xml = build_mjcf()
    path.write_text(xml, encoding="utf-8")
    return path


def cad_mesh_status() -> dict[str, bool]:
    names = [
        "hive_frame",
        "hive_red",
        "hive_blue",
        "flower_pos_y",
        "flower_neg_y",
        "flower_neg_x",
        "flower_pos_x",
        "cell_rim_front",
        "cell_rim_back",
        "cell_shell",
        "cell_back_cap",
    ]
    return {n: _mesh_available(n) for n in names}


if __name__ == "__main__":
    out = write_scene()
    print(f"Wrote {out}")
    print(f"POLLEN count: {len(compute_pollen_positions())}")
    print("CAD meshes:", cad_mesh_status())
