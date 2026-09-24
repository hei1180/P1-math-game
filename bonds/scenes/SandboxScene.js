import { textStyle } from '../theme.js?v=0';
export class SandboxScene extends Phaser.Scene {
  constructor() { super('Sandbox'); }
  create() {
    this.add.text(20, 20, 'Sandbox (stub)', textStyle(24));
  }
}
