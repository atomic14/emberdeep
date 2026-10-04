import fs from 'node:fs';
const f = process.argv[2]; const buf = fs.readFileSync(f);
const jsonLen = buf.readUInt32LE(12); const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString());
const nodes = json.nodes || []; const parent = new Map(); nodes.forEach((n, i) => (n.children || []).forEach(c => parent.set(c, i)));
const skinJoints = new Set((json.skins || []).flatMap(s => s.joints));
const out = [];
nodes.forEach((n, i) => { if (n.mesh !== undefined) { const p = parent.get(i); const skinned = n.skin !== undefined; out.push(`${skinned ? 'SKIN ' : 'MESH '}${n.name} ${p !== undefined && skinJoints.has(p) ? '-> bone ' + nodes[p].name : ''}`); } });
console.log(f.split('/').pop(), 'anims:', (json.animations || []).length, 'mats:', (json.materials || []).map(m => m.name).join(','));
console.log(out.join('\n'));
