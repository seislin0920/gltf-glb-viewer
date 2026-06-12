import argparse
import math
from pygltflib import GLTF2, Node


INPUT_GLB = "Beech-200_colored.glb"
OUTPUT_GLB = INPUT_GLB.replace(".glb", "_orientated.glb")


# =========================================================
# 設定區
# =========================================================
TRANSFORM_CONFIG = {
    # 模式：
    #   wrapper         -> 推薦，新增外層父節點套用變換
    #   overwrite_root  -> 直接覆蓋 root node 的 rotation / translation
    "mode": "overwrite_root",

    # wrapper 名稱
    "wrapper_name": "GlobalTransformWrapper",

    # 若同名 wrapper 已存在，是否重用
    "reuse_existing_wrapper": True,

    # -------------------------
    # 旋轉設定
    # -------------------------
    "rotation": {
        "enabled": False,
        "axis": "Y",        # X / Y / Z
        "angle_deg": 0,
    },

    # -------------------------
    # 直接調整模型在父節點坐標系中的位置
    # glTF translation 單位就是模型本身的座標單位
    # 通常是公尺，但仍要看模型來源
    # -------------------------
    "translation": {
        "enabled": False,
        "x": 0.0,
        "y": 1.584,
        "z": 0.0,
    },

    # -------------------------
    # 縮放設定（等比例）
    # -------------------------
    "scale": {
        "enabled": False,
        "factor": 2.0,  # 將模型放大倍率（1.0 = 不變）
    },
}


# =========================================================
# 工具函式
# =========================================================
def quaternion_from_axis_angle(axis: str, angle_deg: float):
    axis = axis.upper()
    half = math.radians(angle_deg) / 2.0
    s = math.sin(half)
    c = math.cos(half)

    if axis == "X":
        return [s, 0.0, 0.0, c]
    elif axis == "Y":
        return [0.0, s, 0.0, c]
    elif axis == "Z":
        return [0.0, 0.0, s, c]
    else:
        raise ValueError(f"不支援的 axis: {axis}，只能是 X / Y / Z")


def get_scene(gltf: GLTF2):
    scene_index = gltf.scene if gltf.scene is not None else 0
    return gltf.scenes[scene_index]


def find_node_index_by_name(gltf: GLTF2, name: str):
    for i, node in enumerate(gltf.nodes):
        if node.name == name:
            return i
    return None


def build_rotation(config):
    if not config["enabled"]:
        return None
    return quaternion_from_axis_angle(config["axis"], config["angle_deg"])


def build_translation(config):
    if not config["enabled"]:
        return None
    return [float(config["x"]), float(config["y"]), float(config["z"])]


def build_scale(config):
    if not config["enabled"]:
        return None
    factor = float(config["factor"])
    return [factor, factor, factor]


def apply_wrapper_transform(
    gltf: GLTF2,
    wrapper_name: str,
    reuse_existing_wrapper: bool,
    rotation,
    translation,
    scale,
):
    scene = get_scene(gltf)
    original_root_nodes = list(scene.nodes or [])

    if not original_root_nodes:
        raise RuntimeError("此 GLB 沒有 root nodes")

    existing_wrapper_index = find_node_index_by_name(gltf, wrapper_name)

    if reuse_existing_wrapper and existing_wrapper_index is not None:
        wrapper = gltf.nodes[existing_wrapper_index]

        if rotation is not None:
            wrapper.rotation = rotation
        if translation is not None:
            wrapper.translation = translation
        if scale is not None:
            wrapper.scale = scale

        if scene.nodes != [existing_wrapper_index]:
            wrapper.children = list(scene.nodes or [])
            scene.nodes = [existing_wrapper_index]

        print(f"[INFO] 已重用既有 wrapper: {wrapper_name} (index={existing_wrapper_index})")
        print(f"[INFO] rotation = {wrapper.rotation}")
        print(f"[INFO] translation = {wrapper.translation}")
        print(f"[INFO] scale = {getattr(wrapper, 'scale', None)}")
        return

    wrapper = Node()
    wrapper.name = wrapper_name
    wrapper.children = original_root_nodes

    if rotation is not None:
        wrapper.rotation = rotation
    if translation is not None:
        wrapper.translation = translation
    if scale is not None:
        wrapper.scale = scale

    gltf.nodes.append(wrapper)
    wrapper_index = len(gltf.nodes) - 1
    scene.nodes = [wrapper_index]

    print(f"[INFO] 已新增 wrapper: {wrapper_name} (index={wrapper_index})")
    print(f"[INFO] children = {original_root_nodes}")
    print(f"[INFO] rotation = {getattr(wrapper, 'rotation', None)}")
    print(f"[INFO] translation = {getattr(wrapper, 'translation', None)}")
    print(f"[INFO] scale = {getattr(wrapper, 'scale', None)}")


def apply_overwrite_root_transform(gltf: GLTF2, rotation, translation):
    scene = get_scene(gltf)
    root_nodes = list(scene.nodes or [])

    if not root_nodes:
        raise RuntimeError("此 GLB 沒有 root nodes")

    for node_index in root_nodes:
        node = gltf.nodes[node_index]

        if rotation is not None:
            node.rotation = rotation
        if translation is not None:
            node.translation = translation

        print(
            f"[WARN] overwrite root transform: "
            f"index={node_index}, name={node.name}, "
            f"rotation={node.rotation}, translation={node.translation}"
        )


# =========================================================
# CLI
# =========================================================
def parse_args():
    parser = argparse.ArgumentParser(
        description="為 GLB 模型套用全域旋轉與平移（wrapper 或覆寫 root）。",
        epilog="變換模式、角度、平移等請編輯腳本中的 TRANSFORM_CONFIG 設定。",
    )
    parser.add_argument(
        "-i",
        "--input",
        default=INPUT_GLB,
        metavar="GLB",
        help=f"輸入 GLB 檔案路徑（預設: {INPUT_GLB}）",
    )
    parser.add_argument(
        "-o",
        "--output",
        default=None,
        metavar="GLB",
        help="輸出 GLB 檔案路徑（預設: 輸入檔名加 _orientated 後綴）",
    )
    return parser.parse_args()


# =========================================================
# 主程式
# =========================================================
def main():
    args = parse_args()
    input_glb = args.input
    output_glb = args.output or input_glb.replace(".glb", "_orientated.glb")

    gltf = GLTF2().load(input_glb)

    mode = TRANSFORM_CONFIG["mode"]
    rotation = build_rotation(TRANSFORM_CONFIG["rotation"])
    translation = build_translation(TRANSFORM_CONFIG["translation"])
    scale = build_scale(TRANSFORM_CONFIG["scale"])

    print(f"[INFO] mode = {mode}")
    print(f"[INFO] rotation = {rotation}")
    print(f"[INFO] translation = {translation}")
    print(f"[INFO] scale = {scale}")

    if mode == "wrapper":
        apply_wrapper_transform(
            gltf=gltf,
            wrapper_name=TRANSFORM_CONFIG["wrapper_name"],
            reuse_existing_wrapper=TRANSFORM_CONFIG["reuse_existing_wrapper"],
            rotation=rotation,
            translation=translation,
            scale=scale,
        )
    elif mode == "overwrite_root":
        apply_overwrite_root_transform(
            gltf=gltf,
            rotation=rotation,
            translation=translation,
        )
    else:
        raise ValueError('mode 只能是 "wrapper" 或 "overwrite_root"')

    gltf.save(output_glb)
    print(f"[DONE] 已輸出: {output_glb}")


if __name__ == "__main__":
    main()