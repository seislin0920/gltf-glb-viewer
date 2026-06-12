import argparse
import struct
import json
import math
from pathlib import Path

import numpy as np


_HERE = Path(__file__).parent
GLB_FILE = _HERE / "Beech-200_colored.glb_rotated.glb"

KEYFRAMES = 24
ANIMATION_NAME = "RotorSpin"

# TARGETS 設定說明
# ---------------------------------------------------------------------------
# pivot（支點）：旋翼繞之旋轉的圓心，座標為「目標節點父層」的 local 空間（parent-local）。
#   - auto  ：依 mesh 頂點做 PCA，取 OBB 中心為支點（會略過離群頂點，見 AUTO_OUTLIER_RATIO）。
#            如單一目標幾何被誤判，可在該目標加 pivot_outlier_ratio 覆蓋（例如 0.0=不裁切）。
#   - manual：自行指定 pivot: [x, y, z]。auto 偏移時可改用手動；執行後終端會印出
#             本次實際使用的 pivot，可複製到設定中。
# 腳本會在父層插入 <name>_Pivot 節點，translation = pivot，並把子節點位移改為 child_t - pivot，
# 使動畫 rotation 套在 Pivot 上時，視覺上繞支點轉而非繞節點原點轉。
# ---------------------------------------------------------------------------
# 實務建議：幾何複雜或 auto 不準時，改用 pivot_mode=manual + axis_mode=manual。
TARGETS = [
    {
        "name": "heliceG",
        "pivot_mode": "auto",   # auto | manual（manual 時必填 pivot）
        "pivot": [-0.3984673, -7.5890992, -3.7874104],  # parent-local [x, y, z]
        "axis_mode": "auto",  # auto | manual（manual 時必填 axis）
        "axis": [0.052291, -1e-05, -0.998632], # [x, y, z]
        "reverse": True, # True | False
        "rpm": 3000, # RPM | frequency
        "duration": 0.5, # 動畫週期（秒）
    },
    {
        "name": "heliceD",
        "pivot_mode": "auto",   # auto | manual（manual 時必填 pivot）
        "pivot": [-0.3984673, -7.5890992, -3.7874104],  # parent-local [x, y, z]
        "axis_mode": "auto",  # auto | manual（manual 時必填 axis）
        "axis": [0.052291, -1e-05, -0.998632], # [x, y, z]
        "reverse": True, # True | False
        "rpm": 3000, # RPM | frequency
        "duration": 0.5, # 動畫週期（秒）
    },
    # {
    #     "name": "Object_13",
    #     "pivot_mode": "auto",
    #     "pivot": [-0.395082, -7.59, -3.785],
    #     "pivot_outlier_ratio": 0.0,
    #     "axis_mode": "auto",
    #     "axis": [0.000548, 0.052871, -0.998601],
    #     "reverse": True,
    #     "rpm": 6000,
    #     "duration": 0.5,
    # },
    
]

MIN_POINTS_REQUIRED = 16
AUTO_OUTLIER_RATIO = 0.15


def read_glb(path):
    with path.open("rb") as f:
        magic = f.read(4)
        if magic != b"glTF":
            raise ValueError("not a GLB")
        version = struct.unpack("<I", f.read(4))[0]
        _length = struct.unpack("<I", f.read(4))[0]

        chunk_len = struct.unpack("<I", f.read(4))[0]
        chunk_type = f.read(4)
        if chunk_type != b"JSON":
            raise ValueError("Invalid JSON chunk")
        json_chunk = f.read(chunk_len)

        chunk_len = struct.unpack("<I", f.read(4))[0]
        chunk_type = f.read(4)
        if chunk_type != b"BIN\x00":
            raise ValueError("Invalid BIN chunk")
        bin_chunk = f.read(chunk_len)

    return version, json.loads(json_chunk.decode("utf-8")), bin_chunk


def write_glb(path, version, gltf, bin_chunk):
    json_data = json.dumps(gltf, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    json_pad = (4 - (len(json_data) % 4)) % 4
    bin_pad = (4 - (len(bin_chunk) % 4)) % 4

    with path.open("wb") as f:
        f.write(b"glTF")
        f.write(struct.pack("<I", version))
        total_length = 12 + 8 + len(json_data) + json_pad + 8 + len(bin_chunk) + bin_pad
        f.write(struct.pack("<I", total_length))

        f.write(struct.pack("<I", len(json_data) + json_pad))
        f.write(b"JSON")
        f.write(json_data)
        f.write(b" " * json_pad)

        f.write(struct.pack("<I", len(bin_chunk) + bin_pad))
        f.write(b"BIN\x00")
        f.write(bin_chunk)
        f.write(b"\x00" * bin_pad)


def normalize(v, eps=1e-12):
    v = np.asarray(v, dtype=np.float64)
    n = np.linalg.norm(v)
    if n < eps:
        return v
    return v / n


def quaternion(axis, angle_rad):
    axis = normalize(axis)
    s = math.sin(angle_rad / 2.0)
    return (
        float(axis[0] * s),
        float(axis[1] * s),
        float(axis[2] * s),
        float(math.cos(angle_rad / 2.0)),
    )


def ensure_continuity(quats):
    out = []
    prev = None
    for q in quats:
        if prev is not None and sum(p * c for p, c in zip(prev, q)) < 0:
            q = tuple(-c for c in q)
        out.append(q)
        prev = q
    return out


COMPONENT_TYPE_TO_DTYPE = {
    5120: np.int8,
    5121: np.uint8,
    5122: np.int16,
    5123: np.uint16,
    5125: np.uint32,
    5126: np.float32,
}

TYPE_TO_NUM_COMPONENTS = {
    "SCALAR": 1,
    "VEC2": 2,
    "VEC3": 3,
    "VEC4": 4,
    "MAT2": 4,
    "MAT3": 9,
    "MAT4": 16,
}


def get_accessor_array(gltf, bin_chunk, accessor_index):
    accessor = gltf["accessors"][accessor_index]
    if accessor.get("sparse"):
        raise NotImplementedError("Sparse accessor is not supported")

    bv = gltf["bufferViews"][accessor["bufferView"]]
    component_type = accessor["componentType"]
    dtype = COMPONENT_TYPE_TO_DTYPE[component_type]
    num_components = TYPE_TO_NUM_COMPONENTS[accessor["type"]]
    count = accessor["count"]

    accessor_byte_offset = accessor.get("byteOffset", 0)
    bv_byte_offset = bv.get("byteOffset", 0)
    byte_offset = bv_byte_offset + accessor_byte_offset

    stride = bv.get("byteStride")
    itemsize = np.dtype(dtype).itemsize
    packed_stride = itemsize * num_components

    if stride is None or stride == packed_stride:
        raw = bin_chunk[byte_offset: byte_offset + count * packed_stride]
        arr = np.frombuffer(raw, dtype=dtype).reshape(count, num_components)
        return arr.copy()

    out = np.empty((count, num_components), dtype=dtype)
    for i in range(count):
        start = byte_offset + i * stride
        end = start + packed_stride
        raw = bin_chunk[start:end]
        out[i] = np.frombuffer(raw, dtype=dtype, count=num_components)
    return out


def build_parent_map(nodes):
    parent_map = {}
    for i, n in enumerate(nodes):
        for c in n.get("children", []) or []:
            parent_map[c] = i
    return parent_map


def build_name_to_index(nodes):
    out = {}
    for i, n in enumerate(nodes):
        name = n.get("name")
        if name:
            out[name] = i
    return out


def get_node_translation(node):
    return node.get("translation", [0.0, 0.0, 0.0])


def get_mesh_positions_local(gltf, bin_chunk, mesh_index):
    mesh = gltf["meshes"][mesh_index]
    pts_all = []

    for prim in mesh.get("primitives", []):
        attrs = prim.get("attributes", {})
        if "POSITION" not in attrs:
            continue
        positions = get_accessor_array(gltf, bin_chunk, attrs["POSITION"]).astype(np.float64)
        pts_all.append(positions)

    if not pts_all:
        raise ValueError(f"Mesh {mesh_index} has no POSITION data")

    return np.concatenate(pts_all, axis=0)


def trim_outliers_by_radius(points, keep_ratio=0.85):
    points = np.asarray(points, dtype=np.float64)
    if len(points) < 10:
        return points

    center = points.mean(axis=0)
    dist = np.linalg.norm(points - center, axis=1)
    threshold = np.quantile(dist, keep_ratio)
    trimmed = points[dist <= threshold]

    if len(trimmed) < max(MIN_POINTS_REQUIRED, int(len(points) * 0.2)):
        return points
    return trimmed


def estimate_pivot_and_axis_from_local_points(local_points, child_translation, outlier_ratio=AUTO_OUTLIER_RATIO):
    """
    專門給這份 UH-60M 這種『mesh 幾何 baked 在 local，父層幾乎 identity』的實務簡化版。
    估計結果直接回傳成和 child translation 同一個 parent-local 座標系下的值。
    """
    pts = np.asarray(local_points, dtype=np.float64)
    if pts.shape[0] < MIN_POINTS_REQUIRED:
        raise ValueError("Not enough vertices to estimate pivot/axis")

    outlier_ratio = float(outlier_ratio)
    if outlier_ratio < 0.0 or outlier_ratio >= 1.0:
        raise ValueError("outlier_ratio must be in [0.0, 1.0)")
    if outlier_ratio > 0.0:
        pts = trim_outliers_by_radius(pts, keep_ratio=1.0 - outlier_ratio)

    mean = pts.mean(axis=0)
    centered = pts - mean

    cov = np.cov(centered.T)
    eigvals, eigvecs = np.linalg.eigh(cov)

    # 最小變異方向當法線
    axis_local = normalize(eigvecs[:, 0])

    # OBB 中心
    basis = eigvecs
    proj = centered @ basis
    mins = proj.min(axis=0)
    maxs = proj.max(axis=0)
    obb_center = mean + basis @ ((mins + maxs) * 0.5)

    # 轉到 parent-local：mesh local + child translation
    child_t = np.asarray(child_translation, dtype=np.float64)
    pivot_parent_local = obb_center + child_t

    return pivot_parent_local, axis_local


def validate_targets(targets, name_to_index):
    seen = set()
    for cfg in targets:
        name = cfg.get("name")
        if not name:
            raise SystemExit("Each target needs a name")
        if name in seen:
            raise SystemExit(f"Duplicate target name: {name}")
        seen.add(name)

        if name not in name_to_index:
            raise SystemExit(f"Target node not found: {name}")

        if cfg.get("pivot_mode", "auto") not in ("auto", "manual"):
            raise SystemExit(f"{name}: pivot_mode must be auto/manual")
        if cfg.get("axis_mode", "auto") not in ("auto", "manual"):
            raise SystemExit(f"{name}: axis_mode must be auto/manual")

        if cfg.get("pivot_mode", "auto") == "manual" and "pivot" not in cfg:
            raise SystemExit(f"{name}: manual pivot requires pivot")
        if cfg.get("axis_mode", "auto") == "manual" and "axis" not in cfg:
            raise SystemExit(f"{name}: manual axis requires axis")

        if "rpm" in cfg and "frequency" in cfg:
            raise SystemExit(f"{name}: use rpm or frequency, not both")
        if "rpm" not in cfg and "frequency" not in cfg:
            raise SystemExit(f"{name}: rpm or frequency is required")

        duration = float(cfg.get("duration", 1.0))
        if duration <= 0:
            raise SystemExit(f"{name}: duration must be > 0")

        outlier_ratio = float(cfg.get("pivot_outlier_ratio", AUTO_OUTLIER_RATIO))
        if outlier_ratio < 0.0 or outlier_ratio >= 1.0:
            raise SystemExit(f"{name}: pivot_outlier_ratio must be in [0.0, 1.0)")


def compute_rps(cfg):
    if "rpm" in cfg:
        return float(cfg["rpm"]) / 60.0
    return float(cfg["frequency"])


def add_buffer_view(buffer_views, offset, length):
    entry = {"buffer": 0, "byteOffset": offset, "byteLength": length}
    buffer_views.append(entry)
    return len(buffer_views) - 1


def add_accessor(accessors, bv_idx, count, component_type, accessor_type, min_val=None, max_val=None):
    entry = {
        "bufferView": bv_idx,
        "byteOffset": 0,
        "componentType": component_type,
        "count": count,
        "type": accessor_type,
    }
    if min_val is not None:
        entry["min"] = min_val
    if max_val is not None:
        entry["max"] = max_val
    accessors.append(entry)
    return len(accessors) - 1


# =========================================================
# CLI
# =========================================================
PIVOT_HELP_EPILOG = """
Pivot（支點）說明
  旋翼實際繞之旋轉的圓心。座標系為目標節點「父層」的 local（parent-local），
  與 glTF node.translation 同一參考系，不是世界座標。

  pivot_mode
    auto    分析該節點 mesh 頂點，以 PCA 求 OBB 中心作為支點；會過濾約 15% 離群頂點。
    manual  在 TARGETS 中設定 pivot: [x, y, z]。auto 結果偏移、或模型幾何特殊時建議使用。

  執行後終端會列出各目標的 pivot / axis，可複製為 manual 數值微調。

  機制
    在父層新增 <節點名>_Pivot，translation = 支點；子節點位移改為 child_t - pivot。
    動畫 channel 寫在 Pivot 的 rotation，視覺上即繞支點旋轉。

TARGETS 另可設定：name、axis_mode、axis、reverse、rpm（或 frequency）、duration。
詳見腳本頂部 TARGETS 註解與 readme.md。
"""


def parse_args():
    default_input = str(GLB_FILE)
    parser = argparse.ArgumentParser(
        description="為 GLB 螺旋槳節點自動建立旋轉動畫（插入 pivot 父節點、寫入 glTF animation）。",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=PIVOT_HELP_EPILOG,
    )
    parser.add_argument(
        "-i",
        "--input",
        default=default_input,
        metavar="GLB",
        help=f"輸入 GLB 檔案路徑（預設: {default_input}）",
    )
    parser.add_argument(
        "-o",
        "--output",
        default=None,
        metavar="GLB",
        help="輸出 GLB 檔案路徑（預設: 輸入檔名加 _animated_auto 後綴）",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    input_path = Path(args.input)
    output_path = (
        Path(args.output)
        if args.output
        else input_path.parent / f"{input_path.stem}_animated_auto.glb"
    )

    version, gltf, bin_data = read_glb(input_path)
    if gltf.get("animations"):
        raise SystemExit("GLB already has animations")

    nodes = gltf.get("nodes", [])
    if not nodes:
        raise SystemExit("GLB has no nodes")

    parent_map = build_parent_map(nodes)
    name_to_index = build_name_to_index(nodes)
    validate_targets(TARGETS, name_to_index)

    resolved_targets = []

    for cfg in TARGETS:
        node_index = name_to_index[cfg["name"]]
        node = nodes[node_index]
        parent_idx = parent_map.get(node_index)
        if parent_idx is None:
            raise SystemExit(f"{cfg['name']}: node has no parent")

        if "mesh" not in node:
            raise SystemExit(f"{cfg['name']}: node has no mesh")

        child_t = get_node_translation(node)

        auto_pivot = None
        auto_axis = None
        need_auto_pivot = cfg.get("pivot_mode", "auto") == "auto"
        need_auto_axis = cfg.get("axis_mode", "auto") == "auto"

        if need_auto_pivot or need_auto_axis:
            local_points = get_mesh_positions_local(gltf, bin_data, node["mesh"])
            outlier_ratio = cfg.get("pivot_outlier_ratio", AUTO_OUTLIER_RATIO)
            auto_pivot, auto_axis = estimate_pivot_and_axis_from_local_points(
                local_points,
                child_t,
                outlier_ratio=outlier_ratio,
            )

        if cfg.get("pivot_mode", "auto") == "manual":
            pivot = np.asarray(cfg["pivot"], dtype=np.float64)
        else:
            pivot = auto_pivot

        if cfg.get("axis_mode", "auto") == "manual":
            axis = normalize(np.asarray(cfg["axis"], dtype=np.float64))
        else:
            axis = normalize(auto_axis)

        if cfg.get("reverse", False):
            axis = -axis

        resolved_targets.append({
            "config": cfg,
            "node_index": node_index,
            "parent_index": parent_idx,
            "pivot": pivot,
            "axis": axis,
        })

    pivot_indices = {}

    # 這段沿用成功邏輯：
    # pivot 直接插在 parent local
    # child translation 直接設成 child_t - pivot
    # 不做 matrix decomposition
    for item in resolved_targets:
        target_node = item["node_index"]
        pivot_name = f"{nodes[target_node].get('name', f'node_{target_node}')}_Pivot"
        pivot = item["pivot"]

        pivot_idx = None
        for i, n in enumerate(nodes):
            if n.get("name") == pivot_name:
                pivot_idx = i
                break

        if pivot_idx is None:
            pivot_idx = len(nodes)

            parent_idx = item["parent_index"]
            child_node = nodes[target_node]
            child_t = np.asarray(child_node.get("translation", [0.0, 0.0, 0.0]), dtype=np.float64)

            pivot_translation = [
                float(pivot[0]),
                float(pivot[1]),
                float(pivot[2]),
            ]

            nodes.append({
                "name": pivot_name,
                "translation": pivot_translation,
                "rotation": [0.0, 0.0, 0.0, 1.0],
                "scale": [1.0, 1.0, 1.0],
                "children": [target_node],
            })

            child_node["translation"] = [
                float(child_t[0] - pivot[0]),
                float(child_t[1] - pivot[1]),
                float(child_t[2] - pivot[2]),
            ]

            parent_children = nodes[parent_idx].get("children", []) or []
            nodes[parent_idx]["children"] = [pivot_idx if c == target_node else c for c in parent_children]

        pivot_indices[target_node] = pivot_idx

    gltf["nodes"] = nodes

    buffer_views = gltf.get("bufferViews", [])
    accessors = gltf.get("accessors", [])

    new_bin_offset = len(bin_data)
    all_sampler_defs = []
    all_channel_defs = []

    for item in resolved_targets:
        cfg = item["config"]
        node_index = item["node_index"]
        pivot_idx = pivot_indices[node_index]
        axis = item["axis"]

        duration = float(cfg.get("duration", 1.0))
        rps = compute_rps(cfg)
        key_times = [i * (duration / (KEYFRAMES - 1)) for i in range(KEYFRAMES)]

        angles = [2.0 * math.pi * rps * t for t in key_times]
        quats = [quaternion(axis, angle) for angle in angles]
        quats = ensure_continuity(quats)

        rot_data = b"".join(struct.pack("<ffff", *q) for q in quats)
        rot_pad = (4 - (len(rot_data) % 4)) % 4
        rot_start = new_bin_offset
        bin_data += rot_data + (b"\x00" * rot_pad)
        new_bin_offset += len(rot_data) + rot_pad

        time_data = b"".join(struct.pack("<f", t) for t in key_times)
        time_pad = (4 - (len(time_data) % 4)) % 4
        time_start = new_bin_offset
        bin_data += time_data + (b"\x00" * time_pad)
        new_bin_offset += len(time_data) + time_pad

        bv_rot = add_buffer_view(buffer_views, rot_start, len(rot_data))
        acc_rot = add_accessor(accessors, bv_rot, KEYFRAMES, 5126, "VEC4")

        bv_time = add_buffer_view(buffer_views, time_start, len(time_data))
        acc_time = add_accessor(
            accessors,
            bv_time,
            KEYFRAMES,
            5126,
            "SCALAR",
            [float(min(key_times))],
            [float(max(key_times))],
        )

        sampler_idx = len(all_sampler_defs)
        all_sampler_defs.append({
            "input": acc_time,
            "interpolation": "LINEAR",
            "output": acc_rot,
        })
        all_channel_defs.append({
            "sampler": sampler_idx,
            "target": {"node": pivot_idx, "path": "rotation"},
        })

    gltf["bufferViews"] = buffer_views
    gltf["accessors"] = accessors
    gltf["animations"] = [{
        "name": ANIMATION_NAME,
        "samplers": all_sampler_defs,
        "channels": all_channel_defs,
    }]

    gltf["buffers"][0]["byteLength"] = len(bin_data)

    write_glb(output_path, version, gltf, bin_data)

    print(f"wrote {output_path}")
    print("")
    print("Applied targets:")
    for item in resolved_targets:
        cfg = item["config"]
        print(f"- {cfg['name']}")
        print(f"  pivot   : {[round(float(v), 6) for v in item['pivot']]}")
        print(f"  axis    : {[round(float(v), 6) for v in item['axis']]}")
        if "rpm" in cfg:
            print(f"  rpm     : {cfg['rpm']}")
        else:
            print(f"  freq    : {cfg['frequency']}")
        print(f"  duration: {cfg.get('duration', 1.0)}")
        print(f"  reverse : {cfg.get('reverse', False)}")
        print("")


if __name__ == "__main__":
    main()