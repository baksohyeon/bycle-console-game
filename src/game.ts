import { RacingBicycle } from './RacingBicycle';
import {
  GameConfig,
  GameState,
  PlayerChoice,
  PowerUp,
  Weather,
  BikeUpgrade,
  RaceConfig,
  RaceType,
  Tournament,
  TournamentStanding,
  GameResult,
  PlayerProfile,
  AIPlayer,
  AIStrategy
} from './types';
import chalk from 'chalk';
import readlineSync from 'readline-sync';

class RacingGame {
  private players: RacingBicycle[] = [];
  private raceDistance: number = 100;
  private gameRunning: boolean = false;
  private winner: RacingBicycle | null = null;
  private config: GameConfig;
  private currentWeather!: Weather;
  private powerUps: PowerUp[] = [];
  private availablePowerUps: PowerUp[] = [];
  private gameState: GameState = 'setup';
  private tournament: Tournament | null = null;
  private playerProfile!: PlayerProfile;
  private bikeUpgrades: BikeUpgrade[] = [];
  private currentRaceType: RaceType = 'sprint';
  private raceStartTime: number = 0;
  private turnCount: number = 0;

  constructor() {
    this.config = {
      raceDistance: 100,
      maxPlayers: 4,
      energyConsumption: {
        accelerate: 5,
        coast: 0,
        brake: 0
      },
      energyRecovery: {
        coast: 2,
        brake: 1
      },
      powerUpSpawnRate: 0.15, // 15% chance per turn
      weatherChangeChance: 0.05 // 5% chance per turn
    };

    this.initializeWeather();
    this.initializePowerUps();
    this.initializeBikeUpgrades();
    this.initializePlayerProfile();
  }

  private initializeWeather(): void {
    const weatherTypes: Weather[] = [
      {
        type: 'sunny',
        description: 'Perfect racing conditions',
        speedModifier: 1.0,
        energyModifier: 1.0,
        icon: '☀️'
      },
      {
        type: 'rainy',
        description: 'Slippery roads, slower speeds',
        speedModifier: 0.8,
        energyModifier: 1.2,
        icon: '🌧️'
      },
      {
        type: 'windy',
        description: 'Strong headwinds affect speed',
        speedModifier: 0.9,
        energyModifier: 1.3,
        icon: '💨'
      },
      {
        type: 'stormy',
        description: 'Dangerous conditions!',
        speedModifier: 0.7,
        energyModifier: 1.5,
        icon: '⛈️'
      }
    ];

    this.currentWeather = weatherTypes[0]!; // Start with sunny weather
  }

  private initializePowerUps(): void {
    this.availablePowerUps = [
      {
        id: 'speed_boost',
        name: 'Speed Boost',
        description: '50% speed increase for 3 turns',
        icon: '🚀',
        duration: 3,
        effect: (player: RacingBicycle) => {
          // Effect is handled in the RacingBicycle class
        }
      },
      {
        id: 'energy_refill',
        name: 'Energy Drink',
        description: 'Restore 30 energy instantly',
        icon: '⚡',
        effect: (player: RacingBicycle) => {
          (player as any)._energy = Math.min((player as any)._energy + 30, (player as any)._maxEnergy);
        }
      },
      {
        id: 'energy_efficiency',
        name: 'Efficiency Mode',
        description: 'Half energy consumption for 5 turns',
        icon: '🔋',
        duration: 5,
        effect: (player: RacingBicycle) => {
          // Effect is handled in the RacingBicycle class
        }
      },
      {
        id: 'steady_pace',
        name: 'Steady Pace',
        description: 'Removes speed randomness for 4 turns',
        icon: '🎯',
        duration: 4,
        effect: (player: RacingBicycle) => {
          // Effect is handled in the RacingBicycle class
        }
      },
      {
        id: 'energy_recovery',
        name: 'Recovery Boost',
        description: '50% faster energy recovery for 6 turns',
        icon: '💚',
        duration: 6,
        effect: (player: RacingBicycle) => {
          // Effect is handled in the RacingBicycle class
        }
      }
    ];
  }

  private initializeBikeUpgrades(): void {
    this.bikeUpgrades = [
      {
        name: 'Basic Bike',
        speedBonus: 0,
        energyBonus: 0,
        cost: 0,
        unlockLevel: 1
      },
      {
        name: 'Racing Bike',
        speedBonus: 2,
        energyBonus: 0,
        cost: 100,
        unlockLevel: 2
      },
      {
        name: 'Endurance Bike',
        speedBonus: 0,
        energyBonus: 20,
        cost: 150,
        unlockLevel: 3
      },
      {
        name: 'Pro Racing Bike',
        speedBonus: 3,
        energyBonus: 10,
        cost: 250,
        unlockLevel: 5
      },
      {
        name: 'Elite Carbon Bike',
        speedBonus: 4,
        energyBonus: 15,
        cost: 400,
        unlockLevel: 8
      },
      {
        name: 'Championship Bike',
        speedBonus: 5,
        energyBonus: 25,
        cost: 600,
        unlockLevel: 10
      }
    ];
  }

  private initializePlayerProfile(): void {
    this.playerProfile = {
      name: 'Player',
      level: 1,
      experience: 0,
      totalRaces: 0,
      wins: 0,
      podiumFinishes: 0,
      bestTime: Infinity,
      totalDistance: 0,
      unlockedUpgrades: ['Basic Bike'],
      currentBike: this.bikeUpgrades[0]!,
      credits: 0
    };
  }

  addPlayer(name: string, color: string, isAI: boolean = false, difficulty: 'easy' | 'medium' | 'hard' | 'expert' = 'medium'): void {
    const bike = isAI ? this.bikeUpgrades[0] : this.playerProfile.currentBike;
    const player = new RacingBicycle(name, color, this.config, bike);
    player.setWeather(this.currentWeather);
    this.players.push(player);
  }

  private getAIStrategy(difficulty: 'easy' | 'medium' | 'hard' | 'expert'): AIStrategy {
    const strategies = {
      easy: { aggressiveness: 0.3, energyManagement: 0.4, powerUpUsage: 0.2, riskTaking: 0.3 },
      medium: { aggressiveness: 0.5, energyManagement: 0.6, powerUpUsage: 0.5, riskTaking: 0.5 },
      hard: { aggressiveness: 0.7, energyManagement: 0.8, powerUpUsage: 0.7, riskTaking: 0.6 },
      expert: { aggressiveness: 0.8, energyManagement: 0.9, powerUpUsage: 0.9, riskTaking: 0.7 }
    };
    return strategies[difficulty];
  }

  private makeAIDecision(player: RacingBicycle, difficulty: 'easy' | 'medium' | 'hard' | 'expert'): void {
    const strategy = this.getAIStrategy(difficulty);
    const energyPercentage = player.energy / (player as any)._maxEnergy;
    const positionPercentage = player.position / this.raceDistance;

    // Use power-up if available and strategy suggests it
    if (Math.random() < strategy.powerUpUsage && this.powerUps.length > 0) {
      const powerUp = this.powerUps.shift();
      if (powerUp) {
        player.addPowerUp(powerUp);
        return;
      }
    }

    // Energy management logic
    if (energyPercentage < 0.3 && strategy.energyManagement > Math.random()) {
      if (player.speed > 3 && Math.random() > 0.5) {
        player.brake();
      } else {
        player.coast();
      }
      return;
    }

    // Aggressive strategy in final stretch
    if (positionPercentage > 0.7 && strategy.riskTaking > Math.random()) {
      player.accelerate();
      return;
    }

    // Normal decision making
    const action = Math.random();
    if (action < strategy.aggressiveness && energyPercentage > 0.2) {
      player.accelerate();
    } else if (action < strategy.aggressiveness + 0.3) {
      player.coast();
    } else {
      player.brake();
    }
  }

  displayRace(): void {
    console.clear();
    console.log(chalk.yellow.bold('🚴‍♂️ ENHANCED BICYCLE RACING GAME 🚴‍♀️'));
    console.log(chalk.gray('═'.repeat(60)));

    // Display race info
    console.log(`${chalk.cyan('Race Type:')} ${this.currentRaceType.toUpperCase()} | ${chalk.cyan('Distance:')} ${this.raceDistance}m`);
    console.log(`${chalk.cyan('Weather:')} ${this.currentWeather.icon} ${this.currentWeather.type} - ${this.currentWeather.description}`);

    // Display tournament info if in tournament mode
    if (this.tournament) {
      console.log(`${chalk.magenta('Tournament:')} Race ${this.tournament.currentRace + 1}/${this.tournament.races.length}`);
    }

    console.log('');

    // Display each player's status
    this.players.forEach((player, index) => {
      const progressBar = this.createProgressBar(player.stats.position, this.raceDistance);
      const coloredName = (chalk as any)[player.stats.color](player.stats.name);
      const position = index === 0 ? '👤' : '🤖';

      console.log(`${position} ${coloredName}: ${progressBar}`);
      console.log(`  ${player.getDetailedStatus()}`);
      console.log('');
    });

    // Display available power-ups
    if (this.powerUps.length > 0) {
      console.log(chalk.yellow('💫 Available Power-ups: ') + this.powerUps.map(p => `${p.icon} ${p.name}`).join(', '));
      console.log('');
    }

    if (this.winner) {
      console.log(chalk.green.bold(`🏆 ${this.winner.stats.name} WINS! 🏆`));

      // Display final standings
      const sortedPlayers = [...this.players].sort((a, b) => b.position - a.position);
      console.log(chalk.yellow.bold('\n🏁 FINAL STANDINGS:'));
      sortedPlayers.forEach((player, index) => {
        const medal = ['🥇', '🥈', '🥉', '4️⃣'][index] || `${index + 1}️⃣`;
        const coloredName = (chalk as any)[player.stats.color](player.stats.name);
        console.log(`${medal} ${coloredName} - ${Math.floor(player.position)}m`);
      });
    }
  }

  createProgressBar(position: number, total: number): string {
    const barLength = 40;
    const progress = Math.min(position / total, 1);
    const filled = Math.floor(progress * barLength);
    const empty = barLength - filled;

    return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
  }

  private spawnPowerUp(): void {
    if (Math.random() < this.config.powerUpSpawnRate && this.availablePowerUps.length > 0) {
      const randomIndex = Math.floor(Math.random() * this.availablePowerUps.length);
      const randomPowerUp = this.availablePowerUps[randomIndex];
      if (randomPowerUp) {
        // Create a copy of the power-up
        const powerUpCopy = { ...randomPowerUp };
        if (powerUpCopy.duration && randomPowerUp.duration) {
          powerUpCopy.duration = randomPowerUp.duration; // Reset duration
        }
        this.powerUps.push(powerUpCopy);
      }
    }
  }

  private updateWeather(): void {
    if (Math.random() < this.config.weatherChangeChance) {
      const weatherTypes = ['sunny', 'rainy', 'windy', 'stormy'] as const;
      const randomIndex = Math.floor(Math.random() * weatherTypes.length);
      const newWeatherType = weatherTypes[randomIndex];

      if (newWeatherType) {
        // Find the weather object
        const weatherMap = {
          sunny: { type: 'sunny' as const, description: 'Perfect racing conditions', speedModifier: 1.0, energyModifier: 1.0, icon: '☀️' },
          rainy: { type: 'rainy' as const, description: 'Slippery roads, slower speeds', speedModifier: 0.8, energyModifier: 1.2, icon: '🌧️' },
          windy: { type: 'windy' as const, description: 'Strong headwinds affect speed', speedModifier: 0.9, energyModifier: 1.3, icon: '💨' },
          stormy: { type: 'stormy' as const, description: 'Dangerous conditions!', speedModifier: 0.7, energyModifier: 1.5, icon: '⛈️' }
        };

        this.currentWeather = weatherMap[newWeatherType];

        // Update weather for all players
        this.players.forEach(player => player.setWeather(this.currentWeather));
      }
    }
  }

  checkWinner(): boolean {
    for (let player of this.players) {
      if (player.stats.position >= this.raceDistance) {
        this.winner = player;
        this.gameRunning = false;
        this.finishRace();
        return true;
      }
    }
    return false;
  }

  private finishRace(): void {
    // Award experience and credits to human player
    const humanPlayer = this.players[0];
    if (humanPlayer) {
      const raceStats = humanPlayer.getRaceStats();
      let experience = 10; // Base experience
      let credits = 5; // Base credits

      // Bonus for finishing position
      const sortedPlayers = [...this.players].sort((a, b) => b.position - a.position);
      const position = sortedPlayers.indexOf(humanPlayer) + 1;

      if (position === 1) {
        experience += 30;
        credits += 25;
        this.playerProfile.wins++;
      } else if (position <= 3) {
        experience += 15;
        credits += 15;
        this.playerProfile.podiumFinishes++;
      }

      // Bonus for race type
      const raceMultipliers = { sprint: 1, endurance: 1.5, time_trial: 1.2, elimination: 1.3 };
      experience *= raceMultipliers[this.currentRaceType];
      credits *= raceMultipliers[this.currentRaceType];

      humanPlayer.gainExperience(Math.floor(experience));
      this.playerProfile.experience = humanPlayer.experience;
      this.playerProfile.level = humanPlayer.level;
      this.playerProfile.credits += Math.floor(credits);
      this.playerProfile.totalRaces++;
      this.playerProfile.totalDistance += raceStats.distance;

      if (raceStats.time < this.playerProfile.bestTime) {
        this.playerProfile.bestTime = raceStats.time;
      }
    }
  }

  async playTurn(): Promise<void> {
    this.turnCount++;

    // Update weather and spawn power-ups
    this.updateWeather();
    this.spawnPowerUp();

    // AI players make decisions
    const difficulties: ('easy' | 'medium' | 'hard' | 'expert')[] = ['medium', 'hard', 'expert'];
    for (let i = 1; i < this.players.length; i++) {
      const player = this.players[i];
      const difficultyIndex = (i - 1) % difficulties.length;
      const difficulty = difficulties[difficultyIndex] || 'medium';

      if (player) {
        this.makeAIDecision(player, difficulty);
      }
    }

    // Human player's turn
    const humanPlayer = this.players[0];
    this.displayRace();

    if (!this.gameRunning || !humanPlayer) return;

    console.log(chalk.cyan.bold('🎮 Your turn! Choose an action:'));
    console.log('1. 🚀 Accelerate (uses energy)');
    console.log('2. 🌊 Coast (recover energy)');
    console.log('3. 🛑 Brake (recover energy, slow down)');
    console.log('4. ⚡ Energy Burst (20 energy for speed boost)');

    if (this.powerUps.length > 0) {
      console.log('5. 💫 Use Power-up');
    }

    const choice = readlineSync.question('Enter your choice (1-5): ') as PlayerChoice;

    switch (choice) {
      case '1':
        humanPlayer.accelerate();
        break;
      case '2':
        humanPlayer.coast();
        break;
      case '3':
        humanPlayer.brake();
        break;
      case '4':
        if (humanPlayer.energyBurst()) {
          console.log(chalk.green('💥 Energy burst activated!'));
        } else {
          console.log(chalk.red('❌ Not enough energy for burst!'));
          humanPlayer.coast(); // Default to coast
        }
        break;
      case '5':
        if (this.powerUps.length > 0) {
          this.showPowerUpMenu(humanPlayer);
        } else {
          console.log('No power-ups available, coasting...');
          humanPlayer.coast();
        }
        break;
      default:
        console.log('Invalid choice, coasting...');
        humanPlayer.coast();
    }

    // Move all players
    this.players.forEach((player) => player.move());

    // Check for winner
    this.checkWinner();
  }

  private showPowerUpMenu(player: RacingBicycle): void {
    console.log(chalk.yellow.bold('\n💫 Available Power-ups:'));
    this.powerUps.forEach((powerUp, index) => {
      console.log(`${index + 1}. ${powerUp.icon} ${powerUp.name} - ${powerUp.description}`);
    });

    const choice = readlineSync.question('Choose power-up (number): ');
    const powerUpIndex = parseInt(choice) - 1;

    if (powerUpIndex >= 0 && powerUpIndex < this.powerUps.length) {
      const selectedPowerUp = this.powerUps.splice(powerUpIndex, 1)[0]!;
      player.addPowerUp(selectedPowerUp);
      console.log(chalk.green(`✅ Applied ${selectedPowerUp.name}!`));
    } else {
      console.log('Invalid choice, coasting...');
      player.coast();
    }
  }

  private setupRaceType(): RaceType {
    console.log(chalk.blue.bold('\n🏁 Choose Race Type:'));
    console.log('1. 🏃 Sprint (100m) - Quick race');
    console.log('2. 🏃‍♂️ Endurance (200m) - Longer race');
    console.log('3. ⏱️ Time Trial (150m) - Race against time');
    console.log('4. 🔥 Elimination (120m) - High stakes');

    const choice = readlineSync.question('Enter choice (1-4): ');

    const raceConfigs: Record<string, RaceConfig> = {
      '1': { type: 'sprint', distance: 100, description: 'Quick 100m race', pointMultiplier: 1.0 },
      '2': { type: 'endurance', distance: 200, description: 'Endurance 200m race', pointMultiplier: 1.5 },
      '3': { type: 'time_trial', distance: 150, description: 'Time trial 150m race', pointMultiplier: 1.2 },
      '4': { type: 'elimination', distance: 120, description: 'High-stakes 120m race', pointMultiplier: 1.3 }
    };

    const selectedConfig = raceConfigs[choice] || raceConfigs['1']!;
    this.currentRaceType = selectedConfig.type;
    this.raceDistance = selectedConfig.distance;
    this.config.raceDistance = selectedConfig.distance;

    console.log(chalk.green(`Selected: ${selectedConfig.description}`));
    return selectedConfig.type;
  }

  async startRace(): Promise<void> {
    console.log(chalk.green.bold('🏁 RACE STARTING! 🏁'));
    console.log('Press Enter to continue...');
    readlineSync.question('');

    this.gameRunning = true;
    this.raceStartTime = Date.now();
    this.turnCount = 0;

    while (this.gameRunning) {
      await this.playTurn();

      if (this.gameRunning) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    this.displayRace();
    this.showRaceResults();
    this.handleGameCompletion();
  }

  private showRaceResults(): void {
    console.log(chalk.yellow.bold('\n📊 RACE RESULTS:'));

    const humanPlayer = this.players[0]!;
    const raceTime = (Date.now() - this.raceStartTime) / 1000;
    const stats = humanPlayer.getRaceStats();

    console.log(`🏁 Race completed in ${raceTime.toFixed(1)} seconds`);
    console.log(`⚡ Experience gained: ${humanPlayer.experience - this.playerProfile.experience}`);
    console.log(`💰 Credits earned: ${this.playerProfile.credits}`);
    console.log(`📈 Current level: ${humanPlayer.level}`);

    if (humanPlayer.level > this.playerProfile.level) {
      console.log(chalk.green.bold('🎉 LEVEL UP! 🎉'));
      this.checkNewUpgrades();
    }
  }

  private checkNewUpgrades(): void {
    const availableUpgrades = this.bikeUpgrades.filter(
      upgrade => upgrade.unlockLevel <= this.playerProfile.level &&
        !this.playerProfile.unlockedUpgrades.includes(upgrade.name)
    );

    if (availableUpgrades.length > 0) {
      console.log(chalk.green.bold('\n🔓 New bike upgrades unlocked!'));
      availableUpgrades.forEach(upgrade => {
        console.log(`🚲 ${upgrade.name} - Speed +${upgrade.speedBonus}, Energy +${upgrade.energyBonus}`);
        this.playerProfile.unlockedUpgrades.push(upgrade.name);
      });
    }
  }

  private showUpgradeShop(): void {
    console.log(chalk.blue.bold('\n🛒 BIKE UPGRADE SHOP'));
    console.log(chalk.gray('═'.repeat(50)));
    console.log(`💰 Your credits: ${this.playerProfile.credits}`);
    console.log(`🚲 Current bike: ${this.playerProfile.currentBike.name}`);
    console.log('');

    const availableUpgrades = this.bikeUpgrades.filter(
      upgrade => this.playerProfile.unlockedUpgrades.includes(upgrade.name) &&
        upgrade.name !== this.playerProfile.currentBike.name
    );

    if (availableUpgrades.length === 0) {
      console.log(chalk.yellow('No new upgrades available. Level up to unlock more!'));
      return;
    }

    availableUpgrades.forEach((upgrade, index) => {
      const canAfford = this.playerProfile.credits >= upgrade.cost;
      const color = canAfford ? chalk.green : chalk.red;
      console.log(`${index + 1}. ${color(upgrade.name)} - ${upgrade.cost} credits`);
      console.log(`   Speed +${upgrade.speedBonus}, Energy +${upgrade.energyBonus}`);
    });

    console.log('0. Exit shop');

    const choice = readlineSync.question('\nChoose upgrade (number): ');
    const upgradeIndex = parseInt(choice) - 1;

    if (choice === '0') return;

    if (upgradeIndex >= 0 && upgradeIndex < availableUpgrades.length) {
      const selectedUpgrade = availableUpgrades[upgradeIndex]!;
      if (this.playerProfile.credits >= selectedUpgrade.cost) {
        this.playerProfile.credits -= selectedUpgrade.cost;
        this.playerProfile.currentBike = selectedUpgrade;
        console.log(chalk.green(`✅ Purchased ${selectedUpgrade.name}!`));
      } else {
        console.log(chalk.red('❌ Not enough credits!'));
      }
    }
  }

  setupGame(): void {
    console.log(chalk.blue.bold('🚴‍♂️ Welcome to the Enhanced Bicycle Racing Game! 🚴‍♀️'));
    console.log('');

    // Show player profile
    console.log(chalk.cyan.bold('👤 PLAYER PROFILE:'));
    console.log(`Level: ${this.playerProfile.level} | Experience: ${this.playerProfile.experience}`);
    console.log(`Total Races: ${this.playerProfile.totalRaces} | Wins: ${this.playerProfile.wins}`);
    console.log(`Credits: ${this.playerProfile.credits} | Current Bike: ${this.playerProfile.currentBike.name}`);
    console.log('');

    // Game mode selection
    console.log(chalk.yellow.bold('🎮 Choose Game Mode:'));
    console.log('1. 🏁 Single Race');
    console.log('2. 🏆 Tournament Mode');
    console.log('3. 🛒 Upgrade Shop');
    console.log('4. 📊 View Statistics');

    const modeChoice = readlineSync.question('Enter choice (1-4): ');

    switch (modeChoice) {
      case '2':
        this.setupTournament();
        return;
      case '3':
        this.showUpgradeShop();
        this.setupGame(); // Return to menu after shopping
        return;
      case '4':
        this.showStatistics();
        this.setupGame(); // Return to menu after viewing stats
        return;
      default:
        // Continue with single race setup
        break;
    }

    const playerName = readlineSync.question('Enter your name: ') || 'Player';
    this.playerProfile.name = playerName;

    // Setup race type
    this.setupRaceType();

    this.addPlayer(playerName, 'cyan', false);

    // Add AI opponents with different difficulties
    const aiOpponents = [
      { name: 'Speed Demon', color: 'red', difficulty: 'hard' as const },
      { name: 'Wind Rider', color: 'green', difficulty: 'medium' as const },
      { name: 'Gear Shifter', color: 'yellow', difficulty: 'expert' as const }
    ];

    aiOpponents.forEach(ai => {
      this.addPlayer(ai.name, ai.color, true, ai.difficulty);
    });

    console.log(chalk.green(`\n🏁 Race setup complete! You're racing against ${aiOpponents.map(ai => ai.name).join(', ')}`));
    console.log(chalk.gray(`Race type: ${this.currentRaceType} | Distance: ${this.raceDistance} meters`));
    console.log(chalk.gray(`Weather: ${this.currentWeather.icon} ${this.currentWeather.type}`));
    console.log('');
  }

  private setupTournament(): void {
    console.log(chalk.magenta.bold('\n🏆 TOURNAMENT MODE'));
    console.log('Race through multiple events to become champion!');

    const tournamentRaces: RaceConfig[] = [
      { type: 'sprint', distance: 100, description: 'Sprint Championship', pointMultiplier: 1.0 },
      { type: 'endurance', distance: 200, description: 'Endurance Challenge', pointMultiplier: 1.5 },
      { type: 'time_trial', distance: 150, description: 'Time Trial Masters', pointMultiplier: 1.2 },
      { type: 'elimination', distance: 120, description: 'Final Showdown', pointMultiplier: 2.0 }
    ];

    this.tournament = {
      races: tournamentRaces,
      currentRace: 0,
      playerScores: new Map(),
      standings: []
    };

    console.log('Tournament races:');
    tournamentRaces.forEach((race, index) => {
      console.log(`${index + 1}. ${race.description} (${race.distance}m)`);
    });

    readlineSync.question('\nPress Enter to start tournament...');
    this.runTournament();
  }

  private async runTournament(): Promise<void> {
    if (!this.tournament) return;

    for (let i = 0; i < this.tournament.races.length; i++) {
      this.tournament.currentRace = i;
      const raceConfig = this.tournament.races[i]!;

      console.log(chalk.magenta.bold(`\n🏆 TOURNAMENT RACE ${i + 1}: ${raceConfig.description}`));

      // Setup for this race
      this.currentRaceType = raceConfig.type;
      this.raceDistance = raceConfig.distance;
      this.config.raceDistance = raceConfig.distance;

      // Reset players
      this.players.forEach(player => player.reset());
      this.gameRunning = false;
      this.winner = null;

      await this.startRace();

      // Calculate points and update standings
      this.updateTournamentStandings(raceConfig.pointMultiplier);
      this.showTournamentStandings();

      if (i < this.tournament.races.length - 1) {
        readlineSync.question('\nPress Enter for next race...');
      }
    }

    this.showTournamentResults();
  }

  private updateTournamentStandings(pointMultiplier: number): void {
    if (!this.tournament) return;

    const sortedPlayers = [...this.players].sort((a, b) => b.position - a.position);
    const points = [100, 75, 50, 25]; // Points for 1st, 2nd, 3rd, 4th place

    sortedPlayers.forEach((player, index) => {
      const playerPoints = Math.floor((points[index] || 0) * pointMultiplier);
      const currentScore = this.tournament!.playerScores.get(player.name) || 0;
      this.tournament!.playerScores.set(player.name, currentScore + playerPoints);
    });
  }

  private showTournamentStandings(): void {
    if (!this.tournament) return;

    console.log(chalk.yellow.bold('\n🏆 TOURNAMENT STANDINGS:'));

    const standings = Array.from(this.tournament.playerScores.entries())
      .sort((a, b) => b[1] - a[1]);

    standings.forEach(([name, points], index) => {
      const medal = ['🥇', '🥈', '🥉', '4️⃣'][index] || `${index + 1}️⃣`;
      console.log(`${medal} ${name}: ${points} points`);
    });
  }

  private showTournamentResults(): void {
    console.log(chalk.green.bold('\n🎉 TOURNAMENT COMPLETE! 🎉'));
    this.showTournamentStandings();

    const standings = Array.from(this.tournament!.playerScores.entries())
      .sort((a, b) => b[1] - a[1]);

    const winner = standings[0];
    if (winner && winner[0] === this.playerProfile.name) {
      console.log(chalk.green.bold('\n👑 CONGRATULATIONS! YOU ARE THE TOURNAMENT CHAMPION! 👑'));
      this.playerProfile.credits += 500; // Tournament champion bonus
    } else if (winner) {
      console.log(chalk.yellow(`\n🏆 Tournament Champion: ${winner[0]}`));
    }
  }

  private showStatistics(): void {
    console.log(chalk.blue.bold('\n📊 PLAYER STATISTICS'));
    console.log(chalk.gray('═'.repeat(40)));
    console.log(`👤 Name: ${this.playerProfile.name}`);
    console.log(`📈 Level: ${this.playerProfile.level} (${this.playerProfile.experience} XP)`);
    console.log(`🏁 Total Races: ${this.playerProfile.totalRaces}`);
    console.log(`🏆 Wins: ${this.playerProfile.wins} (${this.playerProfile.totalRaces > 0 ? ((this.playerProfile.wins / this.playerProfile.totalRaces) * 100).toFixed(1) : 0}%)`);
    console.log(`🥉 Podium Finishes: ${this.playerProfile.podiumFinishes}`);
    console.log(`⚡ Best Time: ${this.playerProfile.bestTime === Infinity ? 'N/A' : this.playerProfile.bestTime.toFixed(1)}s`);
    console.log(`📏 Total Distance: ${this.playerProfile.totalDistance.toFixed(1)}m`);
    console.log(`💰 Credits: ${this.playerProfile.credits}`);
    console.log(`🚲 Current Bike: ${this.playerProfile.currentBike.name}`);

    readlineSync.question('\nPress Enter to continue...');
  }
}

// Game execution
function main(): void {
  const game = new RacingGame();
  game.setupGame();
  game.startRace();
}

// Start the game
if (require.main === module) {
  main();
}

export { RacingGame };







