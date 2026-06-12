import argparse
import base64
import mimetypes
import os
from copy import deepcopy
from pygltflib import GLTF2, Image, Texture, TextureInfo

INPUT_GLB = "Beech-200.glb"
OUTPUT_GLB = INPUT_GLB.replace(".glb", "_colored.glb")


# 🔥 設定檔（你只要改這裡）
# mode:
# - "color": 使用 RGBA 顏色
# - "texture": 使用貼圖
#
# match:
# - "fuzzy": 模糊比對 name（預設）
# - "exact": 精準比對 mesh 名稱
TARGETS = [
    {
        "name": "Object_42",
        "selector": "node",  # mesh 或 node（線上檢視器通常看 node）
        "match": "exact",
        "mode": "texture",
        "texture": "uh-60_flat-test.png",
    },
    {
        "name": "Object_43",
        "selector": "node",  # mesh 或 node（線上檢視器通常看 node）
        "match": "exact",
        "mode": "texture",
        "texture": "uh-60_flat-test.png",
    },
    {
        "name": "Object_44",
        "selector": "node",  # mesh 或 node（線上檢視器通常看 node）
        "match": "exact",
        "mode": "texture",
        "texture": "uh-60_flat-test.png",
    },
    {
        "name": "Object_13",
        "selector": "node",  # mesh 或 node（線上檢視器通常看 node）
        "match": "exact",
        "mode": "texture",
        "texture": "uh-60_flat-test.png",
    },
    {
        "name": "Object_33",
        "selector": "node", 
        "match": "exact",
        "mode": "color",
        "color": [0, 0, 0, 255],
    },
]


# =========================
# 工具函式
# =========================

def rgba255_to_float(rgba):
    return [c / 255.0 for c in rgba]


def image_file_to_data_uri(image_path):
    with open(image_path, "rb") as f:
        raw = f.read()
    mime_type = mimetypes.guess_type(image_path)[0] or "application/octet-stream"
    encoded = base64.b64encode(raw).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def resolve_texture_file(texture_path, texture_base_dir, input_glb):
    if os.path.isabs(texture_path):
        return texture_path
    if texture_base_dir:
        return os.path.abspath(os.path.join(texture_base_dir, texture_path))
    input_dir = os.path.dirname(os.path.abspath(input_glb))
    return os.path.abspath(os.path.join(input_dir, texture_path))


def add_texture_to_gltf(gltf, texture_path, embed_texture=True):
    if gltf.images is None:
        gltf.images = []
    if gltf.textures is None:
        gltf.textures = []

    texture_uri = texture_path
    if embed_texture and not texture_path.startswith("data:") and os.path.isfile(texture_path):
        texture_uri = image_file_to_data_uri(texture_path)

    # 重複使用同路徑貼圖，避免重複 append
    for tex_index, texture in enumerate(gltf.textures):
        if texture.source is None:
            continue
        image = gltf.images[texture.source]
        if image.uri == texture_uri:
            return tex_index

    image_index = len(gltf.images)
    gltf.images.append(Image(uri=texture_uri))

    texture_index = len(gltf.textures)
    gltf.textures.append(Texture(source=image_index))
    return texture_index


def create_material(gltf, base_mat_index, rgba=None, texture_path=None, remove_texture=False, embed_texture=True):
    new_mat = deepcopy(gltf.materials[base_mat_index])

    pbr = new_mat.pbrMetallicRoughness
    if pbr is None:
        raise Exception("Material 沒有 PBR")

    if texture_path:
        tex_index = add_texture_to_gltf(gltf, texture_path, embed_texture=embed_texture)
        pbr.baseColorTexture = TextureInfo(index=tex_index)
        # 套貼圖時維持原貼圖顏色，不被 baseColorFactor 乘暗
        pbr.baseColorFactor = [1.0, 1.0, 1.0, 1.0]
    elif rgba is not None:
        pbr.baseColorFactor = rgba255_to_float(rgba)

    if remove_texture:
        pbr.baseColorTexture = None

    gltf.materials.append(new_mat)
    return len(gltf.materials) - 1


def find_mesh_indices(gltf, keyword):
    result = []
    for i, mesh in enumerate(gltf.meshes):
        name = mesh.name or ""
        if keyword.lower() in name.lower():
            result.append(i)
    return result


def find_mesh_indices_exact(gltf, mesh_name):
    result = []
    for i, mesh in enumerate(gltf.meshes):
        name = mesh.name or ""
        if name == mesh_name:
            result.append(i)
    return result


def find_mesh_indices_from_nodes(gltf, node_name, exact=False):
    result = []
    for node in gltf.nodes or []:
        if node.mesh is None:
            continue
        name = node.name or ""
        matched = (name == node_name) if exact else (node_name.lower() in name.lower())
        if matched:
            result.append(node.mesh)
    return sorted(set(result))


def apply_material_to_mesh(gltf, mesh_indices, material_index):
    for mesh_index in mesh_indices:
        mesh = gltf.meshes[mesh_index]
        for prim in mesh.primitives:
            prim.material = material_index


def all_mesh_indices(gltf):
    return list(range(len(gltf.meshes or [])))


def debug_print_meshes(gltf):
    print("\n=== 所有 Mesh ===")
    for i, mesh in enumerate(gltf.meshes):
        print(f"{i:03d} {mesh.name}")


# =========================
# CLI
# =========================

def parse_args():
    parser = argparse.ArgumentParser(
        description="依 mesh 名稱套用顏色或貼圖材質。",
        epilog="顏色/貼圖與 mesh/node 對應請編輯腳本中的 TARGETS 設定。",
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
        help="輸出 GLB 檔案路徑（預設: 輸入檔名加 _colored 後綴）",
    )
    parser.add_argument(
        "--base-material",
        type=int,
        default=0,
        metavar="N",
        help="複製材質時使用的基底 material 索引（預設: 0）",
    )
    parser.add_argument(
        "--no-list-meshes",
        action="store_true",
        help="不列出模型中所有 mesh 名稱",
    )
    parser.add_argument(
        "--texture-all",
        default=None,
        metavar="PNG",
        help="快速模式：將同一張貼圖套用到所有 meshes（會覆蓋 TARGETS）",
    )
    parser.add_argument(
        "--texture-base-dir",
        default=None,
        metavar="DIR",
        help="將 TARGETS 裡的 texture 視為相對此資料夾，再換算成輸出 GLB 的相對路徑",
    )
    parser.add_argument(
        "--no-embed-texture",
        action="store_true",
        help="不要內嵌貼圖為 data URI，改成外部檔案路徑",
    )
    return parser.parse_args()


# =========================
# 主流程
# =========================

def main():
    args = parse_args()
    input_glb = args.input
    output_glb = args.output or input_glb.replace(".glb", "_colored.glb")

    gltf = GLTF2().load(input_glb)

    if not args.no_list_meshes:
        debug_print_meshes(gltf)

    base_material = args.base_material

    if args.texture_all:
        texture_path = resolve_texture_file(args.texture_all, args.texture_base_dir, input_glb)
        if args.no_embed_texture:
            output_dir = os.path.dirname(os.path.abspath(output_glb))
            texture_path = os.path.relpath(texture_path, output_dir).replace("\\", "/")

        print(f"\n處理: --texture-all -> {texture_path}")
        new_mat_index = create_material(
            gltf,
            base_mat_index=base_material,
            texture_path=texture_path,
            remove_texture=False,
            embed_texture=not args.no_embed_texture,
        )
        mesh_indices = all_mesh_indices(gltf)
        print(f"匹配到 meshes: {mesh_indices}")
        apply_material_to_mesh(gltf, mesh_indices, new_mat_index)
        gltf.save(output_glb)
        print(f"\n完成輸出: {output_glb}")
        return

    for target in TARGETS:
        name = target["name"]
        selector = target.get("selector", "mesh")
        mode = target.get("mode", "color")
        match = target.get("match", "fuzzy")
        color = target.get("color")
        texture_path = target.get("texture")

        if texture_path:
            texture_path = resolve_texture_file(texture_path, args.texture_base_dir, input_glb)
            if args.no_embed_texture:
                output_dir = os.path.dirname(os.path.abspath(output_glb))
                texture_path = os.path.relpath(texture_path, output_dir).replace("\\", "/")

        print(f"\n處理: {name} (selector={selector}, mode={mode}, match={match})")

        if selector == "node":
            mesh_indices = find_mesh_indices_from_nodes(
                gltf,
                node_name=name,
                exact=(match == "exact"),
            )
        elif match == "exact":
            mesh_indices = find_mesh_indices_exact(gltf, name)
        else:
            mesh_indices = find_mesh_indices(gltf, name)

        if not mesh_indices:
            print(f"[WARN] 找不到: {name}")
            continue

        print(f"匹配到 meshes: {mesh_indices}")

        if mode == "texture" and not texture_path:
            print(f"[WARN] {name} 設為 texture 但未提供 texture")
            continue
        if mode == "color" and color is None:
            print(f"[WARN] {name} 設為 color 但未提供 color")
            continue

        new_mat_index = create_material(
            gltf,
            base_mat_index=base_material,
            rgba=color if mode == "color" else None,
            texture_path=texture_path if mode == "texture" else None,
            remove_texture=False,  # 複製現有材質，將 `baseColorFactor` 替換成指定顏色
            embed_texture=not args.no_embed_texture,
        )

        apply_material_to_mesh(gltf, mesh_indices, new_mat_index)

    gltf.save(output_glb)
    print(f"\n完成輸出: {output_glb}")


if __name__ == "__main__":
    main()