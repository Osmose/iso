import Phaser from 'phaser';

export class StateMachine extends Phaser.Events.EventEmitter {
  constructor(initialState, possibleStates, stateArgs = []) {
    super();
    this.initialState = initialState;
    this.possibleStates = {};
    this.stateArgs = stateArgs;
    this.state = null;
    this.nextStepCallbacks = [];
    this.stateStack = [];
    this.transitioning = false;

    this.addStates(possibleStates);
  }

  addStates(states) {
    this.possibleStates = Object.assign(this.possibleStates, states);

    // State instances get access to the state machine via this.stateMachine.
    // This is annoyingly implicit, but the alternative is fucking up a bunch
    // of method signatures that won't otherwise use this.
    // Useful for triggering a transition outside of `execute`.
    for (const [stateKey, state] of Object.entries(this.possibleStates)) {
      state.stateMachine = this;
      state.stateKey = stateKey;
    }
  }

  preload(scene) {
    for (const state of Object.values(this.possibleStates)) {
      state.preload?.(scene);
    }
  }

  create(scene) {
    for (const state of Object.values(this.possibleStates)) {
      state.create?.(scene);
    }
  }

  currentState() {
    return this.possibleStates[this.state];
  }

  nextStep(callback) {
    this.nextStepCallbacks.push(callback);
  }

  step(...stepArgs) {
    if (this.state === null) {
      this.state = this.initialState;
      this.possibleStates[this.state].init(...this.stateArgs);
      this.possibleStates[this.state].handleEntered(...this.stateArgs);
    }

    if (this.nextStepCallbacks.length > 0) {
      for (const callback of this.nextStepCallbacks) {
        callback(...this.stateArgs, ...stepArgs);
      }
      this.nextStepCallbacks = [];
    }

    // State function returns the state to transition to.
    // Transitions happen instantly rather than next-frame, so we need
    // to loop through until we don't transition.
    // eslint-disable-next-line no-constant-condition
    while (!this.transitioning) {
      const newState = this.possibleStates[this.state].execute(...this.stateArgs, ...stepArgs);
      if (newState) {
        this.transition(newState, ...stepArgs);
      } else {
        break;
      }
    }
  }

  async transition(
    newState,
    { preExit = null, postExit = null, preEnter = null, postEnter = null, ...enterArgs } = {}
  ) {
    if (!(newState in this.possibleStates)) {
      throw Error(`Invalid state ${newState}`);
    }

    this.transitioning = true;

    if (this.state) {
      if (preExit) await preExit?.(...this.stateArgs);
      await this.possibleStates[this.state].handleExited(...this.stateArgs);
      if (postExit) await postExit?.(...this.stateArgs);
    }
    this.state = newState;

    const stateObj = this.possibleStates[this.state];
    if (!stateObj.initialized) {
      stateObj.init(...this.stateArgs);
      stateObj.initialized = true;
    }
    if (preEnter) await preEnter?.(...this.stateArgs);
    await stateObj.handleEntered(...this.stateArgs, enterArgs);
    if (postEnter) await postEnter?.(...this.stateArgs);

    this.transitioning = false;
  }

  pushTransition(newState, args) {
    this.stateStack.push(this.state);
    this.transition(newState, args);
  }

  pushAndWait(newState, args) {
    const stackLength = this.stateStack.length;
    const promise = new Promise((resolve) => {
      const handler = (newStackLength) => {
        if (newStackLength === stackLength) {
          this.off('popTransition', handler);
          resolve();
        }
      };
      this.on('popTransition', handler);
    });
    this.pushTransition(newState, args);
    return promise;
  }

  popTransition() {
    if (this.stateStack.length < 1) {
      throw new Error('Cannot transitionPop, state stack is empty');
    }
    this.transition(this.stateStack.pop());
    this.emit('popTransition', this.stateStack.length);
  }
}

export class State {
  constructor() {
    this.initialized = false;
  }

  init() {}

  handleEntered() {}

  handleExited() {}

  execute() {}

  nextStep(...args) {
    this.stateMachine.nextStep(...args);
  }

  transition(...args) {
    this.stateMachine.transition(...args);
  }

  pushTransition(...args) {
    this.stateMachine.pushTransition(...args);
  }

  popTransition(...args) {
    this.stateMachine.popTransition(...args);
  }

  pushAndWait(...args) {
    return this.stateMachine.pushAndWait(...args);
  }
}

export function getTiledProperty(object, name) {
  return object.properties?.find?.((property) => property.name === name)?.value;
}

export function getObjectTileIndex(object, tilemap) {
  let tileset;
  for (const ts of tilemap.tilesets) {
    if (ts.firstgid <= object.gid) {
      tileset = ts;
    }
  }
  return object.gid - tileset.firstgid;
}

export function getObjectTileFrame(object, tilemap) {
  let tileset;
  for (const ts of tilemap.tilesets) {
    if (ts.firstgid <= object.gid) {
      tileset = ts;
    }
  }
  return [tileset.name, object.gid - tileset.firstgid];
}

export function getObjectTexture(object, tilemap) {
  let imageCollection;
  for (const ic of tilemap.imageCollections) {
    if (ic.firstgid <= object.gid) {
      imageCollection = ic;
    }
  }
  const index = object.gid - imageCollection.firstgid;

  return `tileset_${imageCollection.name}_${index}`;
}

export function getRelativeDirection(source, target) {
  const angle = Phaser.Math.Angle.BetweenPoints(source, target) / Math.PI;
  if (angle === 0) {
    return Phaser.RIGHT;
  } else if (angle === -0.5) {
    return Phaser.UP;
  } else if (angle === 1) {
    return Phaser.LEFT;
  } else {
    return Phaser.DOWN;
  }
}

export function randomChoice(list) {
  const index = Math.floor(Math.random() * list.length);
  return list[index];
}

export function randomChoices(list, count) {
  const listCopy = [...list];
  const choices = [];
  for (let k = 0; k < count && listCopy.length > 0; k++) {
    const index = Math.floor(Math.random() * listCopy.length);
    choices.push(...listCopy.splice(index, 1));
  }
  return choices;
}

export function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

export function randomChance(percent) {
  return Math.random() < percent;
}

export function weightedChoice(choices) {
  const total = choices.map((choice) => choice.weight).reduce((acc, weight) => acc + weight, 0);

  let prevWeight = 0;
  const reweightedChoices = [...choices];
  for (const choice of reweightedChoices) {
    choice.cutoff = prevWeight + choice.weight / total;
    prevWeight = choice.cutoff;
  }

  const chosenCutoff = Math.random();
  let chosenIndex = reweightedChoices.length - 1;
  for (let k = reweightedChoices.length - 1; k >= 0; k--) {
    if (reweightedChoices[k].cutoff >= chosenCutoff) {
      chosenIndex = k;
    } else {
      break;
    }
  }

  return choices[chosenIndex];
}

export function withinGameObject({ x, y }, gameObject) {
  const left = gameObject.x - gameObject.width / 2;
  const top = gameObject.y - gameObject.height / 2;
  return left <= x && left + gameObject.width >= x && top <= y && top + gameObject.height >= y;
}

export function asyncTween(scene, config) {
  let tween;
  const promise = new Promise((resolve) => {
    tween = scene.add.tween({
      ...config,
      onComplete(...args) {
        if (config.onComplete) {
          config.onComplete(...args);
        }
        resolve();
      },
    });
  });
  promise.tween = tween;
  return promise;
}

export function asyncCounter(scene, config) {
  let tween;
  const promise = new Promise((resolve) => {
    tween = scene.tweens.addCounter({
      ...config,
      onComplete(...args) {
        if (config.onComplete) {
          config.onComplete(...args);
        }
        resolve();
      },
    });
  });
  promise.tween = tween;
  return promise;
}

export function wait(scene, duration) {
  return new Promise((resolve) => {
    scene.time.delayedCall(duration, resolve);
  });
}

export function asyncSound(scene, key) {
  return new Promise((resolve) => {
    const sound = scene.sound.add(key);
    sound.once('complete', resolve);
    sound.play();
  });
}

export function asyncAnimation(sprite, key) {
  return new Promise((resolve) => {
    sprite.once('animationcomplete', resolve);
    sprite.play(key);
  });
}

export function fadeOut(sceneOrCamera, duration = 300, r = 0, g = 0, b = 0) {
  let camera = sceneOrCamera;
  if (sceneOrCamera.cameras?.main) {
    camera = sceneOrCamera.cameras.main;
  }

  return new Promise((resolve) => {
    camera.once('camerafadeoutcomplete', resolve);
    camera.fadeOut(duration, r, g, b);
  });
}

export function fadeIn(sceneOrCamera, duration = 300, r = 0, g = 0, b = 0) {
  let camera = sceneOrCamera;
  if (sceneOrCamera.cameras?.main) {
    camera = sceneOrCamera.cameras.main;
  }

  return new Promise((resolve) => {
    camera.once('camerafadeincomplete', resolve);
    camera.fadeIn(duration, r, g, b);
  });
}

export function waitForKey(...keys) {
  return new Promise((resolve) => {
    const handleKeyDown = (downKey) => {
      Phaser.Input.Keyboard.JustDown(downKey);
      keys.forEach((key) => key.off(handleKeyDown));
      resolve();
    };
    keys.forEach((key) => key.once('down', handleKeyDown));
  });
}

export async function wiggleTween(scene, { targets, axis, distance, duration, repeat = 0 }) {
  for (let k = 0; k < repeat + 1; k++) {
    await asyncTween(scene, { targets, [axis]: `-=${distance}`, duration: duration / 4 });
    await asyncTween(scene, { targets, [axis]: `+=${distance * 2}`, duration: duration / 2 });
    await asyncTween(scene, { targets, [axis]: `-=${distance}`, duration: duration / 4 });
  }
}

export function padStart(value, length, padString) {
  return value.toString().padStart(length, padString);
}

export function padEnd(value, length, padString) {
  return value.toString().padEnd(length, padString);
}

export function padCenter(value, length, padString = ' ') {
  const string = value.toString();
  const extra = length - value.length;
  if (extra < 1) {
    return string;
  }

  const leftPad = Math.ceil(extra / 2);
  const rightPad = Math.floor(extra / 2);
  return padString.repeat(leftPad) + string + padString.repeat(rightPad);
}

export function asyncLoad(scene, loadFunc) {
  return new Promise((resolve) => {
    loadFunc(scene);
    scene.load.once('complete', resolve);
    scene.load.start();
  });
}

export function formatLevel(level) {
  if (level === 100) {
    return level.toString();
  }

  return `{LV}${padEnd(level, 2)}`;
}

export function range(start, end) {
  if (end === undefined) {
    end = start;
    start = 0;
  }
  const list = [];
  for (let k = start; k < end; k++) {
    list.push(k);
  }
  return list;
}

export function reduceToObject(list, keyFunc) {
  return list.reduce((acc, item, index) => {
    acc[keyFunc(item, index)] = item;
    return acc;
  }, {});
}

export class GameObjectContainer {
  getChildren() {
    return [];
  }

  setVisible(visible) {
    for (const child of this.getChildren()) {
      child.setVisible(visible);
    }
    return this;
  }

  setDepth(depth) {
    for (const child of this.getChildren()) {
      child.setDepth(depth);
    }
    return this;
  }

  destroy() {
    for (const child of this.getChildren()) {
      child.destroy();
    }
    return this;
  }
}

export function oppositeDir(direction) {
  if (direction === 'left') {
    return 'right';
  } else if (direction === 'right') {
    return 'left';
  } else if (direction === 'up') {
    return 'down';
  } else if (direction === 'down') {
    return 'up';
  }
}

export function towardsDir(speed, direction) {
  if (direction === 'left' || direction === 'up') {
    return -speed;
  } else {
    return speed;
  }
}

export function justDown(key, repeatDelay, repeatRate) {
  const justDown = Phaser.Input.Keyboard.JustDown(key);
  if (repeatDelay === undefined) {
    return justDown;
  }

  if (!key.isDown) {
    return false;
  }

  const duration = key.getDuration();
  if (justDown || duration < repeatDelay) {
    key._repeatCounter = 0;
    return justDown;
  }

  if (duration > repeatDelay + repeatRate * key._repeatCounter) {
    key._repeatCounter++;
    return true;
  }

  return false;
}

export function justUp(key, delay) {
  const justUp = Phaser.Input.Keyboard.JustUp(key);
  if (delay === undefined) {
    return justUp;
  }

  if (!key.isUp) {
    return false;
  }

  const duration = key.plugin.game.loop.time - key.timeUp;
  if (justUp) {
    key._checkedJustUp = false;
  }

  if (!key._checkedJustUp && duration >= delay) {
    key._checkedJustUp = true;
    return true;
  }

  return false;
}

export function resetRepeat(key) {
  key.timeDown = key.plugin.game.loop.time;
  key._repeatCounter = 0;
}

const CLOCKWISE = {
  left: 'up',
  up: 'right',
  right: 'down',
  down: 'left',
};
export function clockwiseDirection(direction) {
  return CLOCKWISE[direction];
}

const COUNTER_CLOCKWISE = {
  right: 'up',
  up: 'left',
  left: 'down',
  down: 'right',
};
export function counterClockwiseDirection(direction) {
  return COUNTER_CLOCKWISE[direction];
}

export function defaultHitProcess(_, other) {
  if (other instanceof Phaser.Tilemaps.Tile) {
    return other.getCollisionGroup() !== null;
  }
  return true;
}

export function wouldHit(
  scene,
  gameObject,
  other,
  dx = 0,
  dy = 0,
  collideCallback = null,
  processCallback = defaultHitProcess
) {
  gameObject.body.position.x += dx;
  gameObject.body.position.y += dy;
  const hit = scene.physics.overlap(gameObject, other, collideCallback, processCallback);
  gameObject.body.position.x -= dx;
  gameObject.body.position.y -= dy;
  return hit;
}

const PIECE_VEL_X = 30;
const PIECE_GRAVITY = 150;
let pieceId = 0;
export async function toPieces(scene, sprite, { duration = 1000, flash = true, speed = 1, gravity = 1 } = {}) {
  // Create a temporary canvas texture with the sprite's current frame
  const frame = sprite.frame;
  const key = `pieces${pieceId++}`;
  const texture = scene.textures.createCanvas(key, frame.width, frame.height);
  const context = texture.getSourceImage().getContext('2d');
  context.drawImage(
    frame.texture.getSourceImage(),
    frame.x,
    frame.y,
    frame.width,
    frame.height,
    0,
    0,
    frame.width,
    frame.height
  );
  texture.refresh();

  const frameWidth = frame.width / 2;
  const frameHeight = 8;

  // Split it into 8x8 chunks
  Phaser.Textures.Parsers.SpriteSheet(texture, 0, 0, 0, frame.width, frame.height, {
    frameWidth,
    frameHeight,
  });

  const { x, y } = sprite;
  const left = x - sprite.width / 2;
  const top = y - sprite.height / 2;
  const rows = Math.ceil(frame.height / frameHeight);
  const cols = Math.ceil(frame.width / frameWidth);

  const pieces = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const side = col < cols / 2 ? 'left' : 'right';
      pieces.push(
        scene.physics.add
          .sprite(left + col * frameWidth, top + row * frameHeight, key, row * cols + col)
          .setVelocity(side === 'left' ? -PIECE_VEL_X * speed : PIECE_VEL_X * speed, -100 + row * 20 * speed)
      );
    }
  }

  for (const piece of pieces) {
    piece.setGravityY(PIECE_GRAVITY * gravity);
  }

  await asyncCounter(scene, {
    from: 0,
    to: 25,
    duration: duration,
    onUpdate: (tween) => {
      for (const piece of pieces) {
        const alpha = Math.floor(tween.getValue() % 2);
        if (flash) {
          piece.setAlpha(alpha);
        }
        if (alpha === 0) {
          piece.setAngle(piece.angle + 90);
        }
      }
    },
  });

  for (const piece of pieces) {
    piece.destroy();
  }

  texture.destroy();
}

export function flash(gameObject, duration, times) {
  return asyncCounter(gameObject.scene, {
    from: 0,
    to: 2,
    ease: 'stepped',
    easeParams: [2],
    duration: times === -1 ? duration : duration / times,
    loop: times,
    onUpdate(tween) {
      const alpha = Math.floor(tween.getValue() % 2);
      gameObject.setAlpha(alpha);
    },
    onComplete() {
      gameObject.setAlpha(1);
    },
  });
}

export function flashVisible(gameObject, duration, times) {
  return asyncCounter(gameObject.scene, {
    from: 0,
    to: 2,
    ease: 'stepped',
    easeParams: [2],
    duration: times === -1 ? duration : duration / times,
    loop: times,
    onUpdate(tween) {
      gameObject.setVisible(tween.getValue() === 1);
    },
    onComplete() {
      gameObject.setVisible(true);
    },
  });
}

export function panWithinBounds(camera, bounds, targetX, targetY, ...args) {
  const originX = camera.width / 2;
  const originY = camera.height / 2;

  let x = targetX - originX;
  let y = targetY - originY;

  const by = bounds.y + (camera.displayHeight - camera.height) / 2;
  const bh = Math.max(by, by + bounds.height - camera.displayHeight);
  if (y < by) {
    y = by;
  } else if (y > bh) {
    y = bh;
  }

  const bx = bounds.x + (camera.displayWidth - camera.width) / 2;
  const bw = Math.max(by, by + bounds.width - camera.displayWidth);
  if (x < bx) {
    x = bx;
  } else if (x > bw) {
    x = bw;
  }

  return camera.pan(x, y, ...args);
}

export function roundToNearest(value, factor) {
  return Math.floor(value / factor) * factor;
}
