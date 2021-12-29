import Phaser from 'phaser';

export default class BoardScene extends Phaser.Scene {
  constructor() {
    super({
      key: 'board',
    });
  }

  preload() {}

  create() {
    // Keyboard
    this.keys = {
      ...this.input.keyboard.createCursorKeys(),
      ...this.input.keyboard.addKeys('S,D,F,ENTER,SHIFT'),
    };

    console.log('test');
  }

  update(time, delta) {}
}
