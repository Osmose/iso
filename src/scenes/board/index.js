import Phaser from 'phaser';

import { State, StateMachine, getTiledProperty } from 'iso/util';

export default class BoardScene extends Phaser.Scene {
  constructor() {
    super({
      key: 'board',
    });
  }

  preload() {
    Player.preload(this);

    this.load.tilemapTiledJSONExternal('overworld', `tilemaps/overworld.json`);
    this.load.spritesheet('tileset_overworld', 'img/tileset_overworld.png', { frameWidth: 16, frameHeight: 16 });
  }

  create() {
    // Keyboard
    this.keys = {
      ...this.input.keyboard.createCursorKeys(),
      ...this.input.keyboard.addKeys('S,D,F,ENTER,SHIFT'),
    };

    this.board = new Board(this, 'overworld');

    const start = this.board.getStart();
    this.player = new Player(this, start.x, start.y);

    const startRoom = this.board.getRoomForObject(start);
    this.lockCameraToRoom(startRoom);

    this.stateMachine = new StateMachine(
      'running',
      {
        running: new RunningState(),
      },
      [this]
    );
  }

  lockCameraToRoom(room) {
    this.cameras.main.startFollow(this.player).setBounds(room.x, room.y, room.width, room.height);
  }

  unlockCamera() {
    this.cameras.main.stopFollow().removeBounds();
  }

  update(time, delta) {
    this.stateMachine.step(time, delta);
  }
}

class Board {
  constructor(scene, key) {
    this.tilemap = scene.make.tilemap({ key, insertNull: true });

    this.tilesets = [];
    const tilemapData = scene.cache.tilemap.get(key).data;
    for (const { name, tilewidth, tileheight } of tilemapData.tilesets) {
      this.tilesets.push(this.tilemap.addTilesetImage(name, `tileset_${name}`, tilewidth, tileheight));
    }

    this.mainLayer = this.tilemap.createLayer('main', this.tilesets, 0, 0);
    this.mainLayer.setCollisionFromCollisionGroup(true);

    this.objectLayer = this.tilemap.getObjectLayer('objects');

    this.rooms = [];
    if (getTiledProperty(this.tilemap, 'roomType') === 'grid') {
      const roomWidthTiles = getTiledProperty(this.tilemap, 'roomWidth');
      const roomHeightTiles = getTiledProperty(this.tilemap, 'roomHeight');
      if (!roomWidthTiles || !roomHeightTiles) {
        throw new Error('Missing tilemap properties roomWidth and/or roomHeight');
      } else if (this.tilemap.width % roomWidthTiles !== 0 || this.tilemap.height % roomHeightTiles !== 0) {
        throw new Error('Room width or height is not even with map dimensions');
      }

      const roomWidth = roomWidthTiles * this.tilemap.tileWidth;
      const roomHeight = roomHeightTiles * this.tilemap.tileHeight;
      const mapWidth = this.tilemap.width * this.tilemap.tileWidth;
      const mapHeight = this.tilemap.height * this.tilemap.tileHeight;
      for (let x = 0; x < mapWidth; x += roomWidth) {
        for (let y = 0; y < mapHeight; y += roomHeight) {
          this.rooms.push(new Room(this, x, y, roomWidth, roomHeight));
        }
      }
    }
  }

  getStart(name = 'default') {
    return this.objectLayer.objects.find((o) => o.type === 'start' && o.name === name);
  }

  getRoomForObject(object) {
    return this.rooms.find((room) => room.contains(object.x, object.y));
  }
}

class Room extends Phaser.Geom.Rectangle {
  constructor(board, x, y, width, height) {
    super(x, y, width, height);

    this.board = board;
  }
}

class RunningState extends State {
  execute(scene, time, delta) {
    scene.player.update(time, delta);
  }
}

const PLAYER_VELOCITY = 80;
const PLAYER_DIAGONAL_SLOWDOWN = 0.7;

class Player extends Phaser.GameObjects.Container {
  constructor(scene, x, y) {
    super(scene, x, y);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.sprite = scene.add.sprite(0, 0, 'player', 0);
    this.add(this.sprite);

    this.stateMachine = new StateMachine(
      'idle',
      {
        idle: new IdleState(),
        walk: new WalkingState(),
      },
      [scene, this]
    );
  }

  static preload(scene) {
    scene.load.spritesheet('player', 'img/player.png', { frameWidth: 16, frameHeight: 16 });
  }

  update(time, delta) {
    this.stateMachine.step(time, delta);
  }
}

class IdleState extends State {
  handleEntered(scene, player) {
    player.body.setVelocity(0).stop();
  }

  execute(scene) {
    const { right, left, up, down } = scene.keys;
    if (right.isDown || left.isDown || up.isDown || down.isDown) {
      return 'walk';
    }
  }
}

class WalkingState extends State {
  execute(scene, player) {
    const { right, left, up, down } = scene.keys;
    let dx = 0;
    let dy = 0;

    if (right.isDown && !left.isDown) {
      dx = PLAYER_VELOCITY;
    } else if (left.isDown && !right.isDown) {
      dx = -PLAYER_VELOCITY;
    }

    if (down.isDown && !up.isDown) {
      dy = PLAYER_VELOCITY;
    } else if (up.isDown && !down.isDown) {
      dy = -PLAYER_VELOCITY;
    }

    // Slow down diagonal movement to get same speed
    if (dx !== 0 && dy !== 0) {
      dx *= PLAYER_DIAGONAL_SLOWDOWN;
      dy *= PLAYER_DIAGONAL_SLOWDOWN;
    }

    // Exit to idle state if we're not moving
    if (dx === 0 && dy === 0) {
      return 'idle';
    }

    player.body.setVelocity(dx, dy);
  }
}
