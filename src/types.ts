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
  maxEnergy: number;
  experience: number;
  level: number;
}

export interface BikeUpgrade {
  name: string;
  speedBonus: number;
  energyBonus: number;
  cost: number;
  unlockLevel: number;
}

export interface PowerUp {
  id: string;
  name: string;
  description: string;
  icon: string;
  effect: (player: any) => void;
  duration?: number;
  isActive?: boolean;
}

export interface Weather {
  type: 'sunny' | 'rainy' | 'windy' | 'stormy';
  description: string;
  speedModifier: number;
  energyModifier: number;
  icon: string;
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
  powerUpSpawnRate: number;
  weatherChangeChance: number;
}

export interface AIPlayer {
  name: string;
  color: string;
  difficulty: 'easy' | 'medium' | 'hard' | 'expert';
  strategy: AIStrategy;
}

export interface AIStrategy {
  aggressiveness: number; // 0-1, how often they accelerate
  energyManagement: number; // 0-1, how well they manage energy
  powerUpUsage: number; // 0-1, how likely to use power-ups
  riskTaking: number; // 0-1, willingness to take risks
}

export type GameState = 'setup' | 'running' | 'finished' | 'tournament' | 'upgrading';

export type PlayerChoice = '1' | '2' | '3' | '4' | '5'; // Added more choices for power-ups

export type RaceType = 'sprint' | 'endurance' | 'time_trial' | 'elimination';

export interface RaceConfig {
  type: RaceType;
  distance: number;
  description: string;
  pointMultiplier: number;
  specialRules?: string[];
}

export interface Tournament {
  races: RaceConfig[];
  currentRace: number;
  playerScores: Map<string, number>;
  standings: TournamentStanding[];
}

export interface TournamentStanding {
  playerName: string;
  totalPoints: number;
  wins: number;
  podiumFinishes: number;
}

export interface GameResult {
  winner: string;
  positions: Array<{
    name: string;
    position: number;
    finalTime: number;
    points: number;
  }>;
  raceType: RaceType;
  weather: Weather;
}

export interface PlayerProfile {
  name: string;
  level: number;
  experience: number;
  totalRaces: number;
  wins: number;
  podiumFinishes: number;
  bestTime: number;
  totalDistance: number;
  unlockedUpgrades: string[];
  currentBike: BikeUpgrade;
  credits: number;
}

export interface GameStats {
  totalRaces: number;
  totalPlayers: number;
  averageRaceTime: number;
  mostUsedPowerUp: string;
  fastestRace: GameResult;
}
