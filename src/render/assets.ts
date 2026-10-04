import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const TILE = 4; // KayKit Dungeon Remastered: 4 world units per cell

export const DUNGEON_PIECES = [
  'wall', 'wall_corner', 'wall_Tsplit', 'wall_crossing', 'wall_endcap', 'wall_pillar', 'wall_doorway', 'wall_cracked', 'wall_broken', 'wall_shelves', 'wall_half', 'wall_arched', 'wall_archedwindow_open', 'wall_window_closed',
  'floor_tile_large', 'floor_tile_large_rocks', 'floor_dirt_large', 'floor_dirt_large_rocky', 'floor_tile_big_grate', 'floor_tile_small', 'floor_wood_large',
  'pillar', 'pillar_decorated', 'column', 'barrel_large', 'barrel_small', 'barrel_small_stack', 'chest', 'chest_gold', 'torch_lit', 'torch_mounted', 'candle_lit', 'candle_triple', 'candle_melted',
  'rubble_large', 'rubble_half', 'stairs', 'stairs_walled', 'stairs_wide', 'bottle_A_green', 'box_small', 'crates_stacked', 'trunk_small_A', 'shelf_small_candles', 'table_small', 'table_medium_broken',
  'banner_red', 'coin_stack_small', 'coin_stack_medium', 'keg', 'sword_shield_broken', 'chair', 'stool', 'plate_food_A', 'bed_floor',
];
export const BITS = ['skull', 'skull_candle', 'bone_A', 'bone_B', 'ribcage', 'lantern_standing', 'post_lantern', 'shrine_candles', 'shrine', 'coffin', 'gravestone', 'plaque_candles'];
export const CHARS = ['Knight', 'Barbarian', 'Mage', 'Rogue', 'Rogue_Hooded', 'Skeleton_Warrior', 'Skeleton_Rogue', 'Skeleton_Mage', 'Skeleton_Minion'];
export const WEAPONS = ['Skeleton_Blade', 'Skeleton_Crossbow', 'Skeleton_Staff', 'Skeleton_Axe', 'Skeleton_Shield_Small_A'];

export interface Piece { geometry: THREE.BufferGeometry; object: THREE.Object3D; size: THREE.Vector3; min: THREE.Vector3; max: THREE.Vector3 }

export class Assets {
  dungeonMaterial!: THREE.MeshStandardMaterial;
  pieces = new Map<string, Piece>();
  bits = new Map<string, THREE.Object3D>();
  chars = new Map<string, GLTF>();
  weapons = new Map<string, THREE.Object3D>();

  static async load(onProgress: (frac: number, label: string) => void): Promise<Assets> {
    const a = new Assets();
    const loader = new GLTFLoader();
    const total = DUNGEON_PIECES.length + BITS.length + CHARS.length + WEAPONS.length; let done = 0;
    const tick = (label: string) => onProgress(++done / total, label);
    const loadOne = (url: string) => new Promise<GLTF>((res, rej) => loader.load(url, res, undefined, rej));

    // Dungeon pieces: share one material/texture.
    const results = await Promise.all(DUNGEON_PIECES.map(async n => { try { const g = await loadOne(`/models/dungeon/${n}.glb`); tick(n); return [n, g] as const; } catch (e) { console.warn('missing piece', n, e); tick(n); return [n, undefined] as const; } }));
    for (const [n, g] of results) {
      if (!g) continue;
      if (!a.dungeonMaterial) {
        g.scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && !a.dungeonMaterial) { const mat = (Array.isArray(m.material) ? m.material[0] : m.material) as THREE.MeshStandardMaterial; a.dungeonMaterial = mat; mat.roughness = 0.85; mat.metalness = 0.0; if (mat.map) { mat.map.anisotropy = 4; mat.map.colorSpace = THREE.SRGBColorSpace; } } });
      }
      const geos: THREE.BufferGeometry[] = [];
      g.scene.updateMatrixWorld(true);
      g.scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { const geo = m.geometry.clone(); geo.applyMatrix4(m.matrixWorld); for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k); geos.push(geo); m.material = a.dungeonMaterial; m.castShadow = true; m.receiveShadow = true; } });
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false)!;
      merged.computeBoundingBox();
      const bb = merged.boundingBox!;
      a.pieces.set(n, { geometry: merged, object: g.scene, size: bb.getSize(new THREE.Vector3()), min: bb.min.clone(), max: bb.max.clone() });
    }
    // Decorative bits (separate texture)
    for (const n of BITS) { try { const g = await loadOne(`/models/bits/${n}.gltf`); g.scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; const mat = m.material as THREE.MeshStandardMaterial; if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace; mat.roughness = 0.85; } }); a.bits.set(n, g.scene); } catch (e) { console.warn('missing bit', n); } tick(n); }
    // Characters
    for (const n of CHARS) { try { const g = await loadOne(`/models/chars/${n}.glb`); g.scene.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = false; m.frustumCulled = false; } }); a.chars.set(n, g); } catch (e) { console.warn('missing char', n, e); } tick(n); }
    for (const n of WEAPONS) { try { const g = await loadOne(`/models/weapons/${n}.gltf`); a.weapons.set(n, g.scene); } catch { } tick(n); }
    return a;
  }
}
