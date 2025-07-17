import { PlayerStats, PlayerAction, GameConfig } from './types';

export class RacingBicycle implements PlayerAction {
  private _name: string;
  private _color: string;
  private _position: number;
  private _speed: number;
  private _energy: number;
  private _maxSpeed: number;
  private _config: GameConfig;

  constructor(name: string, color: string, config: GameConfig) {
    this._name = name;
    this._color = color;
    this._position = 0;
    this._speed = 0;
    this._energy = 100;
    this._maxSpeed = 10;
    this._config = config;
  }

  // Getters
  get name(): string {
    return this._name;
  }

  get color(): string {
    return this._color;
  }

  get position(): number {
    return this._position;
  }

  get speed(): number {
    return this._speed;
  }

  get energy(): number {
    return this._energy;
  }

  get maxSpeed(): number {
    return this._maxSpeed;
  }

  get stats(): PlayerStats {
    return {
      name: this._name,
      color: this._color,
      position: this._position,
      speed: this._speed,
      energy: this._energy,
      maxSpeed: this._maxSpeed
    };
  }

  // Actions
  accelerate(): void {
    if (this._energy > this._config.energyConsumption.accelerate) {
      const speedIncrease = Math.random() * 3 + 1;
      this._speed = Math.min(this._speed + speedIncrease, this._maxSpeed);
      this._energy -= this._config.energyConsumption.accelerate;
    } else {
      this._speed = Math.max(this._speed - 1, 0);
    }
  }

  coast(): void {
    this._speed = Math.max(this._speed - 0.5, 0);
    this._energy = Math.min(this._energy + this._config.energyRecovery.coast, 100);
  }

  brake(): void {
    this._speed = Math.max(this._speed - 2, 0);
    this._energy = Math.min(this._energy + this._config.energyRecovery.brake, 100);
  }

  move(): void {
    // Add some randomness to movement
    const randomFactor = Math.random() * 0.8 + 0.6; // 0.6 to 1.4
    this._position += this._speed * randomFactor;
  }

  getStatus(): string {
    const speedBar = '█'.repeat(Math.floor(this._speed)) + '░'.repeat(10 - Math.floor(this._speed));
    const energyBar = '█'.repeat(Math.floor(this._energy / 10)) + '░'.repeat(10 - Math.floor(this._energy / 10));
    
    return `${this._name}: Speed[${speedBar}] Energy[${energyBar}] Position: ${Math.floor(this._position)}m`;
  }

  // Reset player for new race
  reset(): void {
    this._position = 0;
    this._speed = 0;
    this._energy = 100;
  }
}
