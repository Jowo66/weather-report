#!/usr/bin/env python3
"""
Convert the Quaternius "Universal Base Characters" (Standard, CC0) into the compact runtime format
read by src/scene/character/ubc.ts.

    python3 tools/characters/build-ubc.py "<path to Universal Base Characters[Standard]>"

Needs numpy and Pillow (pip install numpy pillow). Writes public/models/characters/:

  characters.json   manifest: skeletons, mesh layouts, texture names
  male.bin          male body + eyes (bind pose, T-pose, metres, +Y up, facing +Z)
  female.bin        female body + eyes
  hair.bin          hair styles, beard and brows (each still in its source skeleton's bind pose)
  *.webp            textures, downsized

Skin and hair base colours are converted to *detail* maps: the source albedo divided by its mean
colour (x0.5 so values up to 2x fit in 8 bits). The runtime multiplies them by the chosen skin tone
or hair colour, so every tone/colour keeps the painted shading without a texture per option.
The body detail map's alpha is 1 on skin and 0 on the (grey) baked underwear.
"""
import json
import os
import struct
import sys

import numpy as np
from PIL import Image

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'models', 'characters')

BODY = {
    'male': ('Superhero_Male_FullBody.gltf', 'T_Superhero_Male_Ligh.png', 'T_Superhero_Male_Normal.png'),
    'female': (
        'Superhero_Female_FullBody.gltf',
        'T_Superhero_Female_Light_BaseColor.png',
        'T_Superhero_Female_Normal.png',
    ),
}
HAIR = {
    'buzzed': 'Hair_Buzzed.gltf',
    'cropped': 'Hair_BuzzedFemale.gltf',
    'side_part': 'Hair_SimpleParted.gltf',
    'long': 'Hair_Long.gltf',
    'buns': 'Hair_Buns.gltf',
    'beard': 'Hair_Beard.gltf',
    'brows_regular': 'Eyebrows_Regular.gltf',
    'brows_female': 'Eyebrows_Female.gltf',
}

COMP = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


class Gltf:
    def __init__(self, path):
        self.dir = os.path.dirname(path)
        with open(path, encoding='utf8') as f:
            self.j = json.load(f)
        self.bufs = []
        for b in self.j['buffers']:
            with open(os.path.join(self.dir, b['uri']), 'rb') as f:
                self.bufs.append(f.read())

    def acc(self, i):
        a = self.j['accessors'][i]
        bv = self.j['bufferViews'][a['bufferView']]
        dt = np.dtype(COMP[a['componentType']])
        n = NCOMP[a['type']]
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = bv.get('byteStride', dt.itemsize * n)
        buf = self.bufs[bv['buffer']]
        if stride == dt.itemsize * n:
            arr = np.frombuffer(buf, dt, a['count'] * n, off).reshape(a['count'], n)
        else:
            arr = np.stack(
                [np.frombuffer(buf, dt, n, off + k * stride) for k in range(a['count'])]
            )
        if a.get('normalized'):
            arr = arr.astype(np.float32) / np.iinfo(dt).max
        return arr

    def skin(self):
        s = self.j['skins'][0]
        names = [self.j['nodes'][i]['name'] for i in s['joints']]
        parent_of = {}
        for ni, n in enumerate(self.j['nodes']):
            for c in n.get('children', []):
                parent_of[c] = ni
        parents = []
        for i in s['joints']:
            p = parent_of.get(i)
            parents.append(s['joints'].index(p) if p in s['joints'] else -1)
        ibm = self.acc(s['inverseBindMatrices']).astype(np.float32)
        return names, parents, ibm

    def mesh(self, name=None, index=None):
        nodes = [n for n in self.j['nodes'] if 'mesh' in n]
        node = nodes[index] if index is not None else next(n for n in nodes if n['name'] == name)
        prim = self.j['meshes'][node['mesh']]['primitives']
        assert len(prim) == 1, node['name']
        p = prim[0]
        at = p['attributes']
        w = self.acc(at['WEIGHTS_0']).astype(np.float32)
        w = w / np.maximum(w.sum(1, keepdims=True), 1e-9)
        return {
            'position': self.acc(at['POSITION']).astype(np.float32),
            'normal': self.acc(at['NORMAL']).astype(np.float32),
            'uv': self.acc(at['TEXCOORD_0']).astype(np.float32),
            'joints': self.acc(at['JOINTS_0']).astype(np.uint8),
            'weights': np.round(w * 255).astype(np.uint8),
            'index': self.acc(p['indices']).astype(np.uint16).reshape(-1),
        }


class Bin:
    def __init__(self):
        self.data = bytearray()

    def add(self, arr):
        while len(self.data) % 4:
            self.data.append(0)
        off = len(self.data)
        self.data += np.ascontiguousarray(arr).tobytes()
        return off


def pack_mesh(b, m):
    return {
        'vertices': int(len(m['position'])),
        'indices': int(len(m['index'])),
        'position': b.add(m['position']),
        'normal': b.add(m['normal']),
        'uv': b.add(m['uv']),
        'joints': b.add(m['joints']),
        'weights': b.add(m['weights']),
        'index': b.add(m['index']),
    }


def head_box(m, head, ibm):
    """Bounds of the head-weighted body vertices in Head-bone space (glTF matrices are column-major)."""
    sel = (m['joints'] == head) & (m['weights'] > 128)
    p = m['position'][sel.any(1)]
    mat = ibm.reshape(4, 4).T
    loc = p @ mat[:3, :3].T + mat[:3, 3]
    return {'min': [float(x) for x in loc.min(0)], 'max': [float(x) for x in loc.max(0)]}


def srgb_to_lin(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def detail_map(src, size, mask_underwear):
    """Albedo / mean albedo (x0.5), linear space, re-encoded as sRGB. Alpha 0 = underwear."""
    im = Image.open(src).convert('RGB').resize((size, size), Image.LANCZOS)
    c = np.asarray(im, np.float32) / 255
    lin = srgb_to_lin(c)
    mx, mn = c.max(2), c.min(2)
    sat = (mx - mn) / np.maximum(mx, 1e-4)
    if mask_underwear:
        # Skin is clearly saturated (~0.35+); the baked underwear is neutral grey.
        skin = np.clip((sat - 0.08) / 0.1, 0, 1)
    else:
        skin = np.ones(sat.shape, np.float32)
    sel = skin > 0.99
    mean = lin[sel].mean(0)
    det = lin / mean * 0.5
    if mask_underwear:
        # Underwear keeps only its luminance detail (it is re-tinted at runtime).
        lum = (lin * [0.2126, 0.7152, 0.0722]).sum(2, keepdims=True)
        uw_mean = lum[skin < 0.01].mean()
        det = det * skin[..., None] + (lum / uw_mean * 0.5) * (1 - skin[..., None])
    rgb = (lin_to_srgb(det) * 255 + 0.5).astype(np.uint8)
    a = (skin * 255 + 0.5).astype(np.uint8)
    return Image.fromarray(np.dstack([rgb, a]) if mask_underwear else rgb, 'RGBA' if mask_underwear else 'RGB')


def save_webp(im, name, quality=86):
    path = os.path.join(OUT, name)
    im.save(path, 'WEBP', quality=quality, method=6, exact=True, alpha_quality=100)
    return name


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    root = sys.argv[1]
    base = os.path.join(root, 'Base Characters', 'Godot - UE')
    tex = os.path.join(root, 'Base Characters', 'Textures')
    hair_dir = os.path.join(root, 'Hairstyles', 'Rigged to Head Bone', 'glTF (Godot -Unreal)')
    os.makedirs(OUT, exist_ok=True)
    head_ibm = {}
    manifest = {'version': 1, 'source': 'Quaternius Universal Base Characters (Standard), CC0 1.0', 'bodies': {}, 'hair': {}}
    for sex, (gltf, albedo, normal) in BODY.items():
        g = Gltf(os.path.join(base, gltf))
        names, parents, ibm = g.skin()
        b = Bin()
        body = g.mesh(index=2)
        head_ibm[sex] = ibm[names.index('Head')]
        manifest['bodies'][sex] = {
            'headBox': head_box(body, names.index('Head'), head_ibm[sex]),
            'file': f'{sex}.bin',
            'bones': names,
            'parents': parents,
            'inverseBind': b.add(ibm),
            'body': pack_mesh(b, body),
            'eyes': pack_mesh(b, g.mesh(index=1)),
            'textures': {
                'detail': save_webp(detail_map(os.path.join(tex, albedo), 1024, True), f'{sex}_detail.webp'),
                'normal': save_webp(Image.open(os.path.join(tex, normal)).convert('RGB').resize((1024, 1024), Image.LANCZOS), f'{sex}_normal.webp', 82),
            },
        }
        with open(os.path.join(OUT, f'{sex}.bin'), 'wb') as f:
            f.write(b.data)
        print(sex, len(body['position']), 'verts', len(body['index']) // 3, 'tris', len(b.data) // 1024, 'KB')
    hb = Bin()
    for style, gltf in HAIR.items():
        g = Gltf(os.path.join(hair_dir, gltf))
        names, _, ibm = g.skin()
        m = g.mesh(index=0)
        mat = g.j['materials'][g.j['meshes'][0]['primitives'][0]['material']]['name']
        entry = pack_mesh(hb, m)
        h = ibm[names.index('Head')]
        entry['headInverseBind'] = [float(x) for x in h]
        # Which body this piece was modelled on (hair is refitted to the other head at runtime).
        entry['fittedTo'] = min(head_ibm, key=lambda s: float(np.abs(head_ibm[s] - h).sum()))
        entry['texture'] = 'hair1' if mat.endswith('_1') else 'hair2'
        manifest['hair'][style] = entry
    with open(os.path.join(OUT, 'hair.bin'), 'wb') as f:
        f.write(hb.data)
    # Both hair textures side by side (hair1 | hair2) so all hair, brows and beard are one draw call.
    atlas = Image.new('RGB', (1024, 512))
    for i in (1, 2):
        atlas.paste(detail_map(os.path.join(tex, f'T_Hair_{i}_BaseColor.png'), 512, False), ((i - 1) * 512, 0))
    manifest['hairTexture'] = save_webp(atlas, 'hair_detail.webp')
    manifest['eyeTexture'] = save_webp(Image.open(os.path.join(tex, 'T_Eye_Brown.png')).convert('RGB'), 'eye.webp', 90)
    with open(os.path.join(OUT, 'characters.json'), 'w', encoding='utf8') as f:
        json.dump(manifest, f, separators=(',', ':'))
    total = sum(os.path.getsize(os.path.join(OUT, x)) for x in os.listdir(OUT))
    print('hair', len(hb.data) // 1024, 'KB; total', total // 1024, 'KB')


if __name__ == '__main__':
    main()
