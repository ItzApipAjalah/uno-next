const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

// Enable CORS for all routes
app.use(cors({
    origin: ["https://uno-next-afew.vercel.app", "http://localhost:3000"],
    methods: ["GET", "POST", "OPTIONS"],
    credentials: true
}));

const server = http.createServer(app);

// Socket.IO configuration
const io = new Server(server, {
    cors: {
        origin: ["https://uno-next-afew.vercel.app", "http://localhost:3000"],
        methods: ["GET", "POST", "OPTIONS"],
        credentials: true,
        allowedHeaders: ["my-custom-header"],
    },
    transports: ['polling', 'websocket'],
    allowEIO3: true,
    path: '/socket.io/'
});

// Add basic health check route
app.get('/', (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send('Uno Backend is running');
});

const PORT = process.env.PORT || 3001;

// Store active rooms
const rooms = new Map();

// Card colors and numbers
const COLORS = ['Red', 'Blue', 'Green', 'Yellow'];
const NUMBERS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

// Function to create a deck
function createDeck() {
    const deck = [];
    // Add number cards
    COLORS.forEach(color => {
        NUMBERS.forEach(number => {
            deck.push({ color, number, type: 'number' });
            if (number !== '0') { // Add duplicate for all except 0
                deck.push({ color, number, type: 'number' });
            }
        });
    });
    return deck;
}

// Function to shuffle deck
function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

// Function to deal initial cards
function dealCards(deck, numCards = 7) {
    const cards = deck.splice(0, numCards);
    return cards;
}

// Function to check if card can be played
function canPlayCard(card, topCard) {
    return card.color === topCard.color || card.number === topCard.number;
}

// Arrays for generating random names
const adjectives = [
    "Happy", "Lucky", "Clever", "Brave", "Swift", 
    "Mighty", "Noble", "Wise", "Sunny", "Jolly",
    "Quick", "Bright", "Wild", "Epic", "Cool"
];

const nouns = [
    "Panda", "Tiger", "Eagle", "Dolphin", "Wolf",
    "Dragon", "Phoenix", "Lion", "Bear", "Fox",
    "Hawk", "Shark", "Falcon", "Jaguar", "Owl"
];

// Function to generate random player name
function generatePlayerName() {
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    return `${adjective}${noun}`;
}

// Function to get card counts
function getCardCounts(room) {
    return room.players.reduce((counts, player) => {
        counts[player.id] = player.cards.length;
        return counts;
    }, {});
}

// Socket.IO connection
io.on('connection', (socket) => {
    console.log('A user connected');

    // Generate a random player name
    const playerName = generatePlayerName();
    socket.emit('playerName', playerName);

    // Handle room creation
    socket.on('createRoom', () => {
        const roomId = Math.random().toString(36).substring(7);
        const player = { id: socket.id, name: playerName };
        const deck = shuffleDeck(createDeck());
        const playerCards = dealCards(deck);
        const topCard = deck.pop();
        
        rooms.set(roomId, {
            players: [{ ...player, cards: playerCards }],
            deck: deck,
            topCard: topCard,
            currentTurn: 0,
            gameState: 'waiting'
        });
        
        socket.join(roomId);
        socket.emit('roomCreated', { 
            roomId, 
            players: [player],
            cards: playerCards,
            topCard: topCard,
            cardCounts: { [socket.id]: playerCards.length }
        });
    });

    // Handle joining rooms
    socket.on('joinRoom', (roomId) => {
        const room = rooms.get(roomId);
        if (room && room.players.length < 4) {
            const player = { id: socket.id, name: playerName };
            const playerCards = dealCards(room.deck);
            room.players.push({ ...player, cards: playerCards });
            
            socket.join(roomId);

            // Get card counts for all players
            const cardCounts = room.players.reduce((counts, p) => {
                counts[p.id] = p.cards.length;
                return counts;
            }, {});

            // Send room info to the joining player
            socket.emit('joinedRoom', { 
                roomId, 
                players: room.players.map(p => ({ id: p.id, name: p.name })),
                cards: playerCards,
                topCard: room.topCard,
                cardCounts: cardCounts
            });
            
            // Update all players with new player info and card counts
            io.to(roomId).emit('updatePlayers', {
                players: room.players.map(p => ({ id: p.id, name: p.name })),
                cardCounts: cardCounts
            });

            // Start game if 2 or more players
            if (room.players.length >= 2 && room.gameState === 'waiting') {
                room.gameState = 'playing';
                io.to(roomId).emit('gameStart', {
                    currentPlayer: room.players[room.currentTurn].id,
                    cardCounts: cardCounts
                });
            }
        } else {
            socket.emit('roomError', 'Room is full or does not exist');
        }
    });

    socket.on('playCard', ({ roomId, card }) => {
        const room = rooms.get(roomId);
        if (!room) return;

        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex === -1 || playerIndex !== room.currentTurn) return;

        if (canPlayCard(card, room.topCard)) {
            // Remove card from player's hand
            const player = room.players[playerIndex];
            const cardIndex = player.cards.findIndex(c => 
                c.color === card.color && c.number === card.number
            );
            
            if (cardIndex !== -1) {
                // Remove the played card
                player.cards.splice(cardIndex, 1);
                room.topCard = card;

                // Check for winner immediately after playing card
                if (player.cards.length === 0) {
                    const gameResult = {
                        winner: player.name,
                        gameEndReason: 'winner',
                        players: room.players.map(p => ({
                            name: p.name,
                            cardsLeft: p.cards.length
                        })).sort((a, b) => a.cardsLeft - b.cardsLeft)
                    };

                    // Emit game over event with results
                    io.to(roomId).emit('gameOver', gameResult);
                    rooms.delete(roomId);
                    return; // Exit early after game over
                }

                // If no winner, continue game
                const nextPlayer = (playerIndex + 1) % room.players.length;
                room.currentTurn = nextPlayer;

                // Emit updates
                io.to(roomId).emit('cardPlayed', {
                    playerId: socket.id,
                    card: card,
                    nextPlayer: room.players[nextPlayer].id,
                    cardCounts: getCardCounts(room)
                });

                // Check if deck is empty and no one can play
                if (room.deck.length === 0) {
                    let canAnyonePlay = false;
                    for (const p of room.players) {
                        if (p.cards.some(c => canPlayCard(c, room.topCard))) {
                            canAnyonePlay = true;
                            break;
                        }
                    }

                    if (!canAnyonePlay) {
                        const gameResult = {
                            winner: 'Game Draw',
                            gameEndReason: 'noCards',
                            players: room.players.map(p => ({
                                name: p.name,
                                cardsLeft: p.cards.length
                            })).sort((a, b) => a.cardsLeft - b.cardsLeft)
                        };

                        io.to(roomId).emit('gameOver', gameResult);
                        rooms.delete(roomId);
                    }
                }
            }
        }
    });

    socket.on('drawCard', (roomId) => {
        const room = rooms.get(roomId);
        if (!room) return;

        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex === -1 || playerIndex !== room.currentTurn) return;

        if (room.deck.length > 0) {
            const card = room.deck.pop();
            room.players[playerIndex].cards.push(card);
            
            // Send the drawn card to the player
            socket.emit('cardDrawn', { card });

            // Check if this was the last card in deck
            if (room.deck.length === 0) {
                let canAnyonePlay = false;
                for (const p of room.players) {
                    if (p.cards.some(c => canPlayCard(c, room.topCard))) {
                        canAnyonePlay = true;
                        break;
                    }
                }

                if (!canAnyonePlay) {
                    const gameResult = {
                        winner: 'Game Draw',
                        gameEndReason: 'noCards',
                        players: room.players.map(p => ({
                            name: p.name,
                            cardsLeft: p.cards.length
                        })).sort((a, b) => a.cardsLeft - b.cardsLeft)
                    };

                    io.to(roomId).emit('gameOver', gameResult);
                    rooms.delete(roomId);
                    return;
                }
            }

            // Move to next player if no playable cards
            if (!room.players[playerIndex].cards.some(c => canPlayCard(c, room.topCard))) {
                room.currentTurn = (room.currentTurn + 1) % room.players.length;
                io.to(roomId).emit('turnChanged', {
                    nextPlayer: room.players[room.currentTurn].id
                });
            }
        } else {
            // If deck is empty, end the game
            const gameResult = {
                winner: 'Game Draw',
                gameEndReason: 'noCards',
                players: room.players.map(p => ({
                    name: p.name,
                    cardsLeft: p.cards.length
                })).sort((a, b) => a.cardsLeft - b.cardsLeft)
            };

            io.to(roomId).emit('gameOver', gameResult);
            rooms.delete(roomId);
        }

        io.to(roomId).emit('updateCardCounts', {
            cardCounts: getCardCounts(room)
        });
    });

    // Handle disconnection during game
    socket.on('disconnect', () => {
        console.log('A user disconnected:', socket.id);
        rooms.forEach((room, roomId) => {
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                const disconnectedPlayer = room.players[playerIndex];
                room.players.splice(playerIndex, 1);

                // If game is in progress
                if (room.gameState === 'playing') {
                    // If less than 2 players remain, end the game
                    if (room.players.length < 2) {
                        const gameResult = {
                            winner: room.players.length > 0 ? room.players[0].name : 'No Winner',
                            gameEndReason: 'disconnected',
                            players: [
                                ...(room.players.map(p => ({
                                    name: p.name,
                                    cardsLeft: p.cards.length
                                }))),
                                {
                                    name: disconnectedPlayer.name,
                                    cardsLeft: 'Disconnected'
                                }
                            ]
                        };

                        io.to(roomId).emit('gameOver', gameResult);
                        rooms.delete(roomId);
                    } else {
                        // Adjust current turn if needed
                        if (playerIndex <= room.currentTurn) {
                            room.currentTurn = room.currentTurn % room.players.length;
                        } else if (room.currentTurn >= room.players.length) {
                            room.currentTurn = 0;
                        }

                        // Get updated card counts
                        const cardCounts = room.players.reduce((counts, p) => {
                            counts[p.id] = p.cards.length;
                            return counts;
                        }, {});
                        
                        // Update remaining players
                        io.to(roomId).emit('updatePlayers', {
                            players: room.players.map(p => ({ id: p.id, name: p.name })),
                            cardCounts: cardCounts
                        });

                        // Notify about disconnection and next player
                        io.to(roomId).emit('playerDisconnected', {
                            playerName: disconnectedPlayer.name,
                            nextPlayer: room.players[room.currentTurn].id,
                            cardCounts: cardCounts
                        });
                    }
                } else {
                    // If game hasn't started, just update player list
                    io.to(roomId).emit('updatePlayers', {
                        players: room.players.map(p => ({ id: p.id, name: p.name })),
                        cardCounts: room.players.reduce((counts, p) => {
                            counts[p.id] = p.cards.length;
                            return counts;
                        }, {})
                    });
                }
                
                // Clean up empty rooms
                if (room.players.length === 0) {
                    rooms.delete(roomId);
                }
            }
        });
    });
});

// Start the server
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
}); 