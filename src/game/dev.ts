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
          await (game as any).onClick(w.x, w.y);
          await sleep(1200);
          while (game.presenter.busy) await sleep(200);
        }
        out.push({ turn: cs.turn, party: L.units.filter(u => u.faction === 'party').map(u => [u.name.split(' ')[0], u.hp, u.alive]), enemies: L.units.filter(u => u.alive && u.faction === 'enemy' && cs.aware.has(u.id)).map(u => [u.name, u.hp, u.intent?.label]) });
        game.meta.settings.confirmEndTurn = false;
        await game.endTurn();
        while (game.presenter.busy) await sleep(200);
      }
      return out;
    },
    state() {
      const L = game.level!, cs = game.cs!;
      return { phase: cs.phase, turn: cs.turn, party: L.units.filter(u => u.faction === 'party').map(u => [u.name.split(' ')[0], u.hp, u.pos, u.statuses.map(s => s.kind)]), aware: L.units.filter(u => u.alive && u.faction === 'enemy' && cs.aware.has(u.id)).map(u => [u.name, u.hp, u.pos, u.intent?.label]) };
    },
    async fps() { let n = 0; const t0 = performance.now(); await new Promise<void>(res => { const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); return { fps: n / 2, calls: game.view.renderer.info.render.calls, tris: game.view.renderer.info.render.triangles }; },
  };
}
