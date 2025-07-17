export interface PlayerAction {
  accelerate: () => void;
  coast: () => void;
  brake: () => void;
}

export interface PlayerStats {
  name: string;
  color: string;
  position: number;
  speed: number;
  energy: number;
  maxSpeed: number;
}

export interface GameConfig {
  raceDistance: number;
  maxPlayers: number;
  energyConsumption: {
    accelerate: number;
    coast: number;
    brake: number;
  };
  energyRecovery: {
    coast: number;
    brake: number;
  };
}

export interface AIPlayer {
  name: string;
  color: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export type GameState = 'setup' | 'running' | 'finished';

export type PlayerChoice = '1' | '2' | '3';

export interface GameResult {
  winner: string;
  positions: Array<{
    name: string;
    position: number;
    finalTime: number;
  }>;
}
