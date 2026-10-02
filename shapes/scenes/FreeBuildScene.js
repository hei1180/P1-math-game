import { Scene } from '../engine/scenes.js?v=0';

export class FreeBuildScene extends Scene {
  async enter() {
    this.ctx.ui.prompt('製作中', 'Coming soon');
    this.ctx.ui.back(() => this.ctx.go('Workshop'));
  }
}
