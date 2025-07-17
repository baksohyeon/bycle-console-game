import { RacingBicycle } from './RacingBicycle';
import { GameConfig, GameState, PlayerChoice } from './types';
import chalk from 'chalk';
import readlineSync from 'readline-sync';

class RacingGame {
  private players: RacingBicycle[] = [];
  private raceDistance: number = 100;
  private gameRunning: boolean = false;
  private winner: RacingBicycle | null = null;
  private config: GameConfig;

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
      }
    };
  }

  addPlayer(name: string, color: string): void {
    this.players.push(new RacingBicycle(name, color, this.config));
  }

  displayRace(): void {
    console.clear();
    console.log(chalk.yellow.bold('== BICYCLE RACING GAME =='));
    console.log(chalk.gray('═'.repeat(50)));

    // Display finish line
    console.log(`Finish Line: ${this.raceDistance}m`);
    console.log('');

    // Display each player's status
    this.players.forEach((player) => {
      const progressBar = this.createProgressBar(player.stats.position, this.raceDistance);
      const coloredName = (chalk as any)[player.stats.color](player.stats.name);
      console.log(`${coloredName}: ${progressBar}`);
      console.log(`  ${player.getStatus()}`);
      console.log('');
    });

    if (this.winner) {
      console.log(chalk.green.bold(`🏆 ${this.winner.stats.name} WINS! 🏆`));
    }
  }

  createProgressBar(position: number, total: number): string {
    const barLength = 30;
    const progress = Math.min(position / total, 1);
    const filled = Math.floor(progress * barLength);
    const empty = barLength - filled;

    return '[' + '█'.repeat(filled) + '░'.repeat(empty) + ']';
  }

  checkWinner(): boolean {
    for (let player of this.players) {
      if (player.stats.position >= this.raceDistance) {
        this.winner = player;
        this.gameRunning = false;
        return true;
      }
    }
    return false;
  }

  async playTurn(): Promise<void> {
    // AI players make random decisions
    for (let i = 1; i < this.players.length; i++) {
      const action = Math.floor(Math.random() * 3);
      const player = this.players[i];

      if (player) {
        if (action === 0) {
          player.accelerate();
        } else if (action === 1) {
          player.coast();
        } else {
          player.brake();
        }
      }
    }

    // Human player's turn
    const humanPlayer = this.players[0];
    this.displayRace();

    if (!this.gameRunning || !humanPlayer) return;

    console.log(chalk.cyan('Your turn! Choose an action:'));
    console.log('1. Accelerate (uses energy)');
    console.log('2. Coast (recover energy)');
    console.log('3. Brake (recover energy, slow down)');

    const choice = readlineSync.question('Enter your choice (1-3): ') as PlayerChoice;

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
      default:
        console.log('Invalid choice, coasting...');
        humanPlayer.coast();
    }

    // Move all players
    this.players.forEach((player) => player.move());

    // Check for winner
    this.checkWinner();
  }

  async startRace(): Promise<void> {
    console.log(chalk.green.bold('🏁 RACE STARTING! 🏁'));
    console.log('Press Enter to continue...');
    readlineSync.question('');

    this.gameRunning = true;

    while (this.gameRunning) {
      await this.playTurn();

      if (this.gameRunning) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    this.displayRace();
    console.log(chalk.yellow('\nThanks for playing! Press Enter to exit...'));
    readlineSync.question('');
  }

  setupGame(): void {
    console.log(chalk.blue.bold('Welcome to the Bicycle Racing Game!'));
    console.log('');

    const playerName = readlineSync.question('Enter your name: ') || 'Player';
    this.addPlayer(playerName, 'cyan');

    // Add AI opponents
    const aiNames = ['Speed Demon', 'Wind Rider', 'Gear Shifter'];
    const aiColors = ['red', 'green', 'yellow'];

    for (let i = 0; i < 3; i++) {
      const aiName = aiNames[i];
      const aiColor = aiColors[i];
      if (aiName && aiColor) {
        this.addPlayer(aiName, aiColor);
      }
    }

    console.log(chalk.green(`\nRace setup complete! You're racing against ${aiNames.join(', ')}`));
    console.log(chalk.gray('Race distance: 100 meters'));
    console.log('');
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







