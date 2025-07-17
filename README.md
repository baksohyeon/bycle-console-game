# Racing Bicycle Game (TypeScript)

A fun console-based racing bicycle game built with Node.js and TypeScript where you compete against AI opponents in an exciting race!

## Features

- 🚴‍♂️ Interactive console-based racing game
- 🏁 Race against 3 AI opponents
- ⚡ Energy management system
- 🎯 Strategic gameplay with accelerate, coast, and brake actions
- 🎨 Colorful terminal interface with progress bars
- 📊 Real-time speed and energy indicators
- 🔷 **TypeScript** for type safety and better development experience

## Game Mechanics

### Actions
- **Accelerate**: Increases speed but consumes energy
- **Coast**: Maintains speed while recovering energy
- **Brake**: Reduces speed but recovers energy quickly

### Strategy
- Manage your energy wisely - you can't accelerate without sufficient energy
- Balance speed and energy recovery
- Watch your opponents and time your moves strategically

## Installation

1. Make sure you have Node.js installed on your system
2. Install the dependencies:
   ```bash
   npm install
   ```

## How to Play

### Development Mode (recommended)
Run the game directly with TypeScript:
```bash
npm run dev
```

### Production Mode
Build and run the compiled JavaScript:
```bash
npm run build
npm start
```

### Game Instructions

1. Enter your name when prompted
2. During each turn, choose your action:
   - Press `1` to accelerate
   - Press `2` to coast
   - Press `3` to brake
3. Race to the finish line (100 meters) before your opponents!

## Game Display

The game shows:
- Progress bars for each player
- Speed indicators (bars)
- Energy levels (bars)
- Current position in meters
- Finish line distance

## Dependencies

### Runtime Dependencies
- `chalk`: For colorful terminal output
- `readline-sync`: For interactive user input

### Development Dependencies
- `typescript`: TypeScript compiler
- `ts-node`: Run TypeScript directly
- `@types/node`: Node.js type definitions
- `@types/readline-sync`: readline-sync type definitions

## TypeScript Features

- **Strong typing**: All game classes and interfaces are fully typed
- **Interface definitions**: Clear contracts for game components
- **Type safety**: Compile-time error checking
- **Better IDE support**: Enhanced autocomplete and refactoring

## Project Structure

```
src/
├── types.ts          # Type definitions and interfaces
├── RacingBicycle.ts  # Player class with game mechanics
└── game.ts           # Main game controller
```

## Tips for Winning

1. **Energy Management**: Don't accelerate continuously - you'll run out of energy
2. **Strategic Coasting**: Use coast to maintain speed while recovering energy
3. **Timing**: Save energy for the final sprint to the finish line
4. **Watch Opponents**: Keep an eye on AI opponents' positions

## Game Classes

- **RacingBicycle**: Represents each player with speed, energy, and position management
- **RacingGame**: Main game controller handling turns, display, and win conditions
- **Type Definitions**: Comprehensive interfaces for type safety

## Development

To contribute or modify the game:

1. **Type Checking**: `npx tsc --noEmit`
2. **Build**: `npm run build`
3. **Development**: `npm run dev`

The TypeScript configuration includes strict type checking for better code quality and maintainability.

Have fun racing! 🏆
