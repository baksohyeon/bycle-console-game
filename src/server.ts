import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { RacingGame } from './game';
import { RacingBicycle } from './RacingBicycle';

interface WebPlayer {
  id: string;
  name: string;
  color: string;
  bicycle: RacingBicycle;
  isConnected: boolean;
}

interface GameRoom {
  id: string;
  game: RacingGame;
  players: Map<string, WebPlayer>;
  isStarted: boolean;
  maxPlayers: number;
}

class WebGameServer {
  private app: express.Application;
  private server: ReturnType<typeof createServer>;
  private io: Server;
  private rooms: Map<string, GameRoom> = new Map();

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    this.setupExpress();
    this.setupSocketIO();
  }

  private setupExpress(): void {
    this.app.use(express.static(path.join(__dirname, '../public')));
    this.app.use(express.json());

    this.app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../public/index.html'));
    });

    this.app.get('/api/rooms', (req, res) => {
      const roomList = Array.from(this.rooms.values()).map(room => ({
        id: room.id,
        playerCount: room.players.size,
        maxPlayers: room.maxPlayers,
        isStarted: room.isStarted
      }));
      res.json(roomList);
    });

    this.app.post('/api/rooms', (req, res) => {
      const roomId = this.generateRoomId();
      const game = new RacingGame();
      const room: GameRoom = {
        id: roomId,
        game,
        players: new Map(),
        isStarted: false,
        maxPlayers: 4
      };
      this.rooms.set(roomId, room);
      res.json({ roomId });
    });
  }

  private setupSocketIO(): void {
    this.io.on('connection', (socket) => {
      console.log('Player connected:', socket.id);

      socket.on('join-room', ({ roomId, playerName, playerColor }) => {
        const room = this.rooms.get(roomId);
        if (!room) {
          socket.emit('error', { message: 'Room not found' });
          return;
        }

        if (room.players.size >= room.maxPlayers) {
          socket.emit('error', { message: 'Room is full' });
          return;
        }

        if (room.isStarted) {
          socket.emit('error', { message: 'Game already started' });
          return;
        }

        const bicycle = new RacingBicycle(playerName, playerColor, room.game['config']);
        const player: WebPlayer = {
          id: socket.id,
          name: playerName,
          color: playerColor,
          bicycle,
          isConnected: true
        };

        room.players.set(socket.id, player);
        room.game.addPlayer(playerName, playerColor, false);
        socket.join(roomId);

        socket.emit('joined-room', {
          playerId: socket.id,
          roomId,
          players: Array.from(room.players.values()).map(p => ({
            id: p.id,
            name: p.name,
            color: p.color,
            isConnected: p.isConnected
          }))
        });

        socket.to(roomId).emit('player-joined', {
          id: socket.id,
          name: playerName,
          color: playerColor
        });
      });

      socket.on('player-action', ({ roomId, action }) => {
        const room = this.rooms.get(roomId);
        if (!room || !room.isStarted) return;

        const player = room.players.get(socket.id);
        if (!player) return;

        switch (action) {
          case 'accelerate':
            player.bicycle.accelerate();
            break;
          case 'coast':
            player.bicycle.coast();
            break;
          case 'brake':
            player.bicycle.brake();
            break;
          case 'energy-burst':
            player.bicycle.energyBurst();
            break;
        }

        this.broadcastGameState(roomId);
      });

      socket.on('start-game', ({ roomId }) => {
        const room = this.rooms.get(roomId);
        if (!room || room.isStarted) return;

        if (room.players.size < 1) {
          socket.emit('error', { message: 'Need at least 1 player to start' });
          return;
        }

        room.isStarted = true;
        this.io.to(roomId).emit('game-started');
        this.startGameLoop(roomId);
      });

      socket.on('disconnect', () => {
        console.log('Player disconnected:', socket.id);
        
        for (const [roomId, room] of this.rooms) {
          const player = room.players.get(socket.id);
          if (player) {
            player.isConnected = false;
            socket.to(roomId).emit('player-disconnected', { playerId: socket.id });
            
            if (Array.from(room.players.values()).every(p => !p.isConnected)) {
              this.rooms.delete(roomId);
            }
            break;
          }
        }
      });
    });
  }

  private startGameLoop(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const gameInterval = setInterval(() => {
      if (!room.isStarted) {
        clearInterval(gameInterval);
        return;
      }

      room.players.forEach(player => {
        player.bicycle.move();
      });

      const gameState = this.getGameState(room);
      this.io.to(roomId).emit('game-update', gameState);

      const winner = this.checkWinner(room);
      if (winner) {
        room.isStarted = false;
        this.io.to(roomId).emit('game-finished', {
          winner: winner.name,
          results: this.getFinalResults(room)
        });
        clearInterval(gameInterval);
      }
    }, 1000);
  }

  private getGameState(room: GameRoom): any {
    const players = Array.from(room.players.values()).map(player => ({
      id: player.id,
      name: player.name,
      color: player.color,
      position: player.bicycle.position,
      speed: player.bicycle.speed,
      energy: player.bicycle.energy,
      maxEnergy: player.bicycle['_maxEnergy'],
      level: player.bicycle.level,
      activePowerUps: player.bicycle.activePowerUps
    }));

    return {
      players,
      raceDistance: room.game['raceDistance'],
      weather: room.game['currentWeather'],
      powerUps: room.game['powerUps']
    };
  }

  private checkWinner(room: GameRoom): WebPlayer | null {
    for (const player of room.players.values()) {
      if (player.bicycle.position >= room.game['raceDistance']) {
        return player;
      }
    }
    return null;
  }

  private getFinalResults(room: GameRoom): any[] {
    return Array.from(room.players.values())
      .sort((a, b) => b.bicycle.position - a.bicycle.position)
      .map((player, index) => ({
        position: index + 1,
        name: player.name,
        finalPosition: player.bicycle.position,
        stats: player.bicycle.getRaceStats()
      }));
  }

  private broadcastGameState(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const gameState = this.getGameState(room);
    this.io.to(roomId).emit('game-update', gameState);
  }

  private generateRoomId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  start(port: number = 3000): void {
    this.server.listen(port, () => {
      console.log(`🚴‍♂️ Racing Game Server running on http://localhost:${port}`);
    });
  }
}

const server = new WebGameServer();
server.start();

export { WebGameServer };