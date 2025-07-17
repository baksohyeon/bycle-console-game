import { PlayerStats, PlayerAction, GameConfig, PowerUp, Weather, BikeUpgrade } from './types';

export class RacingBicycle implements PlayerAction {
  private _name: string;
  private _color: string;
  private _position: number;
  private _speed: number;
  private _energy: number;
  private _maxSpeed: number;
  private _maxEnergy: number;
  private _experience: number;
  private _level: number;
  private _config: GameConfig;
  private _activePowerUps: PowerUp[] = [];
  private _currentWeather: Weather | null = null;
  private _bikeUpgrade: BikeUpgrade;
  private _totalDistance: number = 0;
  private _raceTime: number = 0;

  constructor(name: string, color: string, config: GameConfig, bikeUpgrade?: BikeUpgrade) {
    this._name = name;
    this._color = color;
    this._position = 0;
    this._speed = 0;
    this._energy = 100;
    this._maxSpeed = 10;
    this._maxEnergy = 100;
    this._experience = 0;
    this._level = 1;
    this._config = config;
    this._bikeUpgrade = bikeUpgrade || {
      name: 'Basic Bike',
      speedBonus: 0,
      energyBonus: 0,
      cost: 0,
      unlockLevel: 1
    };

    // Apply bike upgrades
    this._maxSpeed += this._bikeUpgrade.speedBonus;
    this._maxEnergy += this._bikeUpgrade.energyBonus;
    this._energy = this._maxEnergy;
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

  get experience(): number {
    return this._experience;
  }

  get level(): number {
    return this._level;
  }

  get activePowerUps(): PowerUp[] {
    return this._activePowerUps;
  }

  get bikeUpgrade(): BikeUpgrade {
    return this._bikeUpgrade;
  }

  get stats(): PlayerStats {
    return {
      name: this._name,
      color: this._color,
      position: this._position,
      speed: this._speed,
      energy: this._energy,
      maxSpeed: this._maxSpeed,
      maxEnergy: this._maxEnergy,
      experience: this._experience,
      level: this._level
    };
  }

  // Weather system
  setWeather(weather: Weather): void {
    this._currentWeather = weather;
  }

  // Power-up system
  addPowerUp(powerUp: PowerUp): void {
    powerUp.effect(this);
    if (powerUp.duration && powerUp.duration > 0) {
      powerUp.isActive = true;
      this._activePowerUps.push(powerUp);
    }
  }

  updatePowerUps(): void {
    this._activePowerUps = this._activePowerUps.filter(powerUp => {
      if (powerUp.duration) {
        powerUp.duration--;
        if (powerUp.duration <= 0) {
          powerUp.isActive = false;
          return false;
        }
      }
      return true;
    });
  }

  // Actions with weather and power-up effects
  accelerate(): void {
    const energyCost = this.calculateEnergyCost('accelerate');

    if (this._energy >= energyCost) {
      let speedIncrease = Math.random() * 3 + 1;

      // Apply weather effects
      if (this._currentWeather) {
        speedIncrease *= this._currentWeather.speedModifier;
      }

      // Check for speed boost power-ups
      const speedBoost = this._activePowerUps.some(p => p.id === 'speed_boost') ? 1.5 : 1;
      speedIncrease *= speedBoost;

      this._speed = Math.min(this._speed + speedIncrease, this._maxSpeed);
      this._energy -= energyCost;
    } else {
      // Not enough energy - penalty
      this._speed = Math.max(this._speed - 1, 0);
    }
  }

  coast(): void {
    this._speed = Math.max(this._speed - 0.5, 0);
    const energyRecovery = this.calculateEnergyRecovery('coast');
    this._energy = Math.min(this._energy + energyRecovery, this._maxEnergy);
  }

  brake(): void {
    this._speed = Math.max(this._speed - 2, 0);
    const energyRecovery = this.calculateEnergyRecovery('brake');
    this._energy = Math.min(this._energy + energyRecovery, this._maxEnergy);
  }

  // Special ability - energy burst (new action)
  energyBurst(): boolean {
    if (this._energy >= 20) {
      this._speed = Math.min(this._speed + 5, this._maxSpeed);
      this._energy -= 20;
      return true;
    }
    return false;
  }

  // Special ability - drafting (when close to another player)
  draft(leadPlayer: RacingBicycle): boolean {
    const distance = Math.abs(this._position - leadPlayer.position);
    if (distance <= 5 && leadPlayer.position > this._position) {
      // Reduce energy consumption and gain slight speed boost
      this._speed = Math.min(this._speed + 1, this._maxSpeed);
      return true;
    }
    return false;
  }

  move(): void {
    // Update power-ups first
    this.updatePowerUps();

    // Add some randomness to movement
    let randomFactor = Math.random() * 0.8 + 0.6; // 0.6 to 1.4

    // Apply weather effects to movement
    if (this._currentWeather) {
      randomFactor *= this._currentWeather.speedModifier;
    }

    // Apply power-up effects
    if (this._activePowerUps.some(p => p.id === 'steady_pace')) {
      randomFactor = 1; // Remove randomness for steady pace
    }

    const distance = this._speed * randomFactor;
    this._position += distance;
    this._totalDistance += distance;
    this._raceTime++;
  }

  // Experience and leveling system
  gainExperience(amount: number): void {
    this._experience += amount;
    this.checkLevelUp();
  }

  private checkLevelUp(): void {
    const requiredExp = this._level * 100; // Simple formula
    if (this._experience >= requiredExp) {
      this._level++;
      this._experience -= requiredExp;
      // Level up bonuses
      this._maxSpeed += 0.5;
      this._maxEnergy += 5;
    }
  }

  // Helper methods for calculations
  private calculateEnergyCost(action: 'accelerate' | 'coast' | 'brake'): number {
    let cost = this._config.energyConsumption[action];

    // Apply weather effects
    if (this._currentWeather && action === 'accelerate') {
      cost *= this._currentWeather.energyModifier;
    }

    // Check for energy efficiency power-ups
    if (this._activePowerUps.some(p => p.id === 'energy_efficiency')) {
      cost *= 0.5;
    }

    return Math.max(cost, 0);
  }

  private calculateEnergyRecovery(action: 'coast' | 'brake'): number {
    let recovery = this._config.energyRecovery[action];

    // Apply weather effects
    if (this._currentWeather) {
      recovery *= this._currentWeather.energyModifier;
    }

    // Check for energy recovery power-ups
    if (this._activePowerUps.some(p => p.id === 'energy_recovery')) {
      recovery *= 1.5;
    }

    return recovery;
  }

  getStatus(): string {
    const speedBar = '█'.repeat(Math.floor(this._speed)) + '░'.repeat(Math.max(10 - Math.floor(this._speed), 0));
    const energyBar = '█'.repeat(Math.floor(this._energy / 10)) + '░'.repeat(Math.max(10 - Math.floor(this._energy / 10), 0));

    let statusString = `Speed[${speedBar}] Energy[${energyBar}] Position: ${Math.floor(this._position)}m`;

    // Add level and experience info
    statusString += ` | Lvl ${this._level} (${this._experience} XP)`;

    // Add active power-ups
    if (this._activePowerUps.length > 0) {
      const powerUpIcons = this._activePowerUps.map(p => p.icon).join('');
      statusString += ` | ${powerUpIcons}`;
    }

    return statusString;
  }

  getDetailedStatus(): string {
    let status = this.getStatus();

    if (this._currentWeather) {
      status += ` | Weather: ${this._currentWeather.icon} ${this._currentWeather.type}`;
    }

    if (this._bikeUpgrade.name !== 'Basic Bike') {
      status += ` | Bike: ${this._bikeUpgrade.name}`;
    }

    return status;
  }

  // Reset player for new race
  reset(): void {
    this._position = 0;
    this._speed = 0;
    this._energy = this._maxEnergy;
    this._activePowerUps = [];
    this._raceTime = 0;
  }

  // Get race statistics
  getRaceStats(): { distance: number; time: number; avgSpeed: number } {
    return {
      distance: this._totalDistance,
      time: this._raceTime,
      avgSpeed: this._raceTime > 0 ? this._totalDistance / this._raceTime : 0
    };
  }

  // Upgrade bike
  upgradeBike(newBike: BikeUpgrade): void {
    // Remove old bike bonuses
    this._maxSpeed -= this._bikeUpgrade.speedBonus;
    this._maxEnergy -= this._bikeUpgrade.energyBonus;

    // Apply new bike
    this._bikeUpgrade = newBike;
    this._maxSpeed += newBike.speedBonus;
    this._maxEnergy += newBike.energyBonus;

    // Refill energy to new max
    this._energy = Math.min(this._energy, this._maxEnergy);
  }
}
