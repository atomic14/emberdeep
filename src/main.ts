import { Assets } from './render/assets';
import { View } from './render/scene';
import { AudioSys } from './render/audio';
import { Presenter } from './render/presenter';
import { Screens } from './ui/screens';
import { Hud } from './ui/hud';
import { Game } from './game/game';
import { devApi } from './game/dev';

async function boot() {
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  const screens = new Screens(ui);
  const progress = screens.loading();
  const view = new View(canvas);
  const assets = await Assets.load(progress);
  const audio = new AudioSys();
  const hud = new Hud(ui);
  const presenter = new Presenter(view, assets, ui, audio);
  const game = new Game(view, presenter, hud, screens, audio);
  // unlock audio on first gesture
  const unlock = () => { audio.unlock(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
  window.addEventListener('pointerdown', unlock); window.addEventListener('keydown', unlock);
  game.start();
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    game.update(dt);
    view.update(dt);
    presenter.update(dt);
    view.render();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  (game as any).dev = devApi(game);
  (window as any).game = game;
}
boot().catch(e => { console.error(e); document.body.innerHTML = `<pre style="color:#e8dcc4;padding:20px">Failed to start: ${e?.message ?? e}</pre>`; });
