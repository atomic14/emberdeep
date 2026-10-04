/** Developer helpers exposed on window.game.dev for scripted browser testing. */
import * as THREE from 'three';
import type { Game } from './game';
import { cheb } from '../sim/types';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function devApi(game: Game) {
  return {
    /** Auto-explore until combat starts or screens open; clicks through simple screens. */
    async explore(maxSteps = 14) {
      for (let i = 0; i < maxSteps; i++) {
        if (!game.cs || game.cs.phase !== 'explore') break;
        if (game.screens.isOpen) { (document.querySelector('.screen .choice, .screen #ok') as HTMLElement | null)?.click(); }
        else if (!(game as any).walking) game.autoExplore();
        await sleep(2500);
      }
      return { phase: game.cs?.phase, aware: game.cs ? [...game.cs.aware].length : 0, open: game.screens.isOpen };
    },
    /** Each party member clicks the nearest aware enemy (move+attack), then Hold. Repeats `turns` times. */
    async fight(turns = 1) {
      const out: any[] = [];
      for (let t = 0; t < turns; t++) {
        const L = game.level!, cs = game.cs!; if (cs.phase !== 'player') break;
        for (const u of L.units.filter(x => x.alive && x.faction === 'party')) {
          while (game.presenter.busy) await sleep(200);
          if (u.acted) continue;
          const enemies = L.units.filter(e => e.alive && e.faction === 'enemy' && cs.aware.has(e.id)).sort((a, b) => cheb(a.pos, u.pos) - cheb(b.pos, u.pos));
          const tg = enemies[0]; if (!tg) break;
          game.selectedId = u.id; game.refreshHud(); game.refreshOverlays();
          const w = game.view.worldToScreen(new THREE.Vector3(tg.pos.x * 4, 0, tg.pos.y * 4));
          const before = { ...u.pos, acted: u.acted };
          await (game as any).onClick(w.x, w.y);
          await sleep(900);
          while (game.presenter.busy) await sleep(200);
          if (!u.acted && u.pos.x === before.x && u.pos.y === before.y && !game.screens.isOpen) {
            // out of reach: step toward the target along the safest reachable tile
            const { moveRange, threatTiles } = await import('../sim/combat');
            const { key: k } = await import('../sim/types');
            const reach = moveRange(L, u); const threats = threatTiles(L, cs);
            let best: { pos: { x: number; y: number }; score: number } | undefined;
            for (const r of reach.values()) { const t = (L.tiles[r.pos.y * L.w + r.pos.x]); if (t.kind === 'chasm' || t.fire) continue; const d = cheb(r.pos, tg.pos); const thr = threats.get(k(r.pos)); const dmg = thr ? thr.reduce((a, x) => a + x.dmg, 0) : 0; const score = -d - Math.min(dmg * 2, 6); if (!best || score > best.score) best = { pos: r.pos, score }; }
            if (best) { const w2 = game.view.worldToScreen(new THREE.Vector3(best.pos.x * 4, 0, best.pos.y * 4)); await (game as any).onClick(w2.x, w2.y); await sleep(700); while (game.presenter.busy) await sleep(200); const t2 = game.level!.units.filter(e => e.alive && e.faction === 'enemy' && cs.aware.has(e.id)).sort((a, b) => cheb(a.pos, u.pos) - cheb(b.pos, u.pos))[0]; if (t2 && !u.acted) { const w3 = game.view.worldToScreen(new THREE.Vector3(t2.pos.x * 4, 0, t2.pos.y * 4)); await (game as any).onClick(w3.x, w3.y); await sleep(700); while (game.presenter.busy) await sleep(200); } }
          }
        }
        out.push({ turn: cs.turn, party: L.units.filter(u => u.faction === 'party').map(u => [u.name.split(' ')[0], u.hp, u.alive]), enemies: L.units.filter(u => u.alive && u.faction === 'enemy' && cs.aware.has(u.id)).map(u => [u.name, u.hp, u.intent?.label]) });
        game.meta.settings.confirmEndTurn = false;
        await game.endTurn();
        while (game.presenter.busy) await sleep(200);
      }
      return out;
    },
    /** Explore and fight until the stairs dialog (or death/screens that need a choice). Returns a log. */
    async playFloor(maxLoops = 40) {
      const log: string[] = [];
      for (let i = 0; i < maxLoops; i++) {
        if (game.mode !== 'run' || !game.cs) break;
        if (game.screens.isOpen) {
          const txt = document.querySelector('.screen')?.textContent ?? '';
          if (/The stair/.test(txt)) { log.push('stairs'); break; }
          if (/Lantern goes out/.test(txt)) { log.push('dead'); break; }
          const btn = document.querySelector('.screen .boon, .screen .choice:not([disabled]), .screen #ok, .screen #y') as HTMLElement | null;
          if (btn) { log.push('screen: ' + txt.slice(0, 40).replace(/\s+/g, ' ')); btn.click(); await sleep(400); continue; }
        }
        if (game.cs.phase === 'player') { const r = await this.fight(1); log.push(`fight turn ${r[0]?.turn}: ${r[0]?.party.map((p: any) => p[1]).join('/')}`); continue; }
        if (game.cs.phase === 'explore' && !(game as any).walking) { const r = game.autoExplore(); if (r === 'nothing') { log.push('nothing left'); break; } }
        await sleep(2000);
      }
      return log;
    },
    state() {
      const L = game.level!, cs = game.cs!;
      return { phase: cs.phase, turn: cs.turn, party: L.units.filter(u => u.faction === 'party').map(u => [u.name.split(' ')[0], u.hp, u.pos, u.statuses.map(s => s.kind)]), aware: L.units.filter(u => u.alive && u.faction === 'enemy' && cs.aware.has(u.id)).map(u => [u.name, u.hp, u.pos, u.intent?.label]) };
    },
    async fps() { let n = 0; const t0 = performance.now(); await new Promise<void>(res => { const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); return { fps: n / 2, calls: game.view.renderer.info.render.calls, tris: game.view.renderer.info.render.triangles }; },
  };
}
