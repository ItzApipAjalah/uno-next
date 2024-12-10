"use client";

/* eslint-disable @typescript-eslint/no-unused-vars */

import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import Image from 'next/image';
import Swal from 'sweetalert2';
import CardBack from './components/CardBack';

let socket: Socket;

interface Player {
    id: string;
    name: string;
}

interface Card {
    color: string;
    number: string;
    type: string;
}

interface GameResult {
    winner: string;
    gameEndReason: 'winner' | 'noCards' | 'disconnected';
    players: {
        name: string;
        cardsLeft: number | 'Disconnected';
    }[];
}

interface PlayerWithCards extends Player {
    cardCount?: number;
}

export default function UnoGame() {
    const [playerName, setPlayerName] = useState<string>('');
    const [roomId, setRoomId] = useState('');
    const [gameStarted, setGameStarted] = useState(false);
    const [joinRoomId, setJoinRoomId] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const [players, setPlayers] = useState<Player[]>([]);
    const [error, setError] = useState<string>('');
    const [cards, setCards] = useState<Card[]>([]);
    const [topCard, setTopCard] = useState<Card | null>(null);
    const [currentPlayer, setCurrentPlayer] = useState<string>('');
    const [winner, setWinner] = useState<string>('');
    const [gameResult, setGameResult] = useState<GameResult | null>(null);
    const [playerCardCounts, setPlayerCardCounts] = useState<{[key: string]: number}>({});

    useEffect(() => {
        socket = io(process.env.NEXT_PUBLIC_BACKEND_URL || 'https://uno-backend-eta.vercel.app', {
            transports: ['polling', 'websocket'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            timeout: 20000,
            forceNew: true,
            path: '/socket.io/'
        });

        socket.on('connect', () => {
            console.log('Connected to server');
            setIsConnected(true);
            setError('');
        });

        socket.on('disconnect', () => {
            console.log('Disconnected from server');
            setIsConnected(false);
        });

        socket.on('playerName', (name: string) => {
            console.log('Received player name:', name);
            setPlayerName(name);
        });

        socket.on('roomCreated', ({ roomId, players, cards, topCard, cardCounts }) => {
            setRoomId(roomId);
            setPlayers(players);
            setCards(cards);
            setTopCard(topCard);
            setPlayerCardCounts(cardCounts);
            setGameStarted(true);
            setError('');
        });

        socket.on('joinedRoom', ({ roomId, players, cards, topCard, cardCounts }) => {
            setRoomId(roomId);
            setPlayers(players);
            setCards(cards);
            setTopCard(topCard);
            setPlayerCardCounts(cardCounts);
            setGameStarted(true);
            setError('');
        });

        socket.on('gameStart', ({ currentPlayer, cardCounts }) => {
            setCurrentPlayer(currentPlayer);
            setPlayerCardCounts(cardCounts);
        });

        socket.on('cardPlayed', ({ playerId, card, nextPlayer, cardCounts }) => {
            setTopCard(card);
            setCurrentPlayer(nextPlayer);
            setPlayerCardCounts(cardCounts);
            if (playerId === socket.id) {
                setCards(prev => prev.filter(c => 
                    !(c.color === card.color && c.number === card.number)
                ));
            }
        });

        socket.on('cardDrawn', ({ card }) => {
            setCards(prev => [...prev, card]);
        });

        socket.on('turnChanged', ({ nextPlayer }) => {
            setCurrentPlayer(nextPlayer);
        });

        socket.on('gameOver', (result: GameResult) => {
            let title = 'Game Over!';
            let winnerText = '';
            let textColor = 'text-green-600';

            switch (result.gameEndReason) {
                case 'winner':
                    winnerText = `${result.winner} Wins! 🎉`;
                    break;
                case 'noCards':
                    title = 'Game Ended';
                    winnerText = 'Game Draw - No Cards Left!';
                    textColor = 'text-blue-600';
                    break;
                case 'disconnected':
                    title = 'Game Ended';
                    winnerText = 'Game Ended - Player Disconnected';
                    textColor = 'text-red-600';
                    break;
            }

            Swal.fire({
                title: title,
                html: `
                    <div class="text-center mb-4">
                        <p class="text-xl ${textColor} font-bold mb-4">
                            ${winnerText}
                        </p>
                        <div class="border-t pt-4">
                            <h3 class="font-bold mb-2 text-left">Final Standings:</h3>
                            ${result.players.map((player, index) => `
                                <div class="p-2 rounded mb-2 text-left ${
                                    player.name === result.winner && result.gameEndReason === 'winner'
                                        ? 'bg-green-100' 
                                        : 'bg-gray-100'
                                }">
                                    <span class="font-medium">${player.name}</span>
                                    <span class="float-right">
                                        ${player.cardsLeft === 'Disconnected' 
                                            ? 'Disconnected' 
                                            : `${player.cardsLeft} cards left`}
                                    </span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `,
                confirmButtonText: 'Start New Game',
                allowOutsideClick: false,
                showCancelButton: true,
                cancelButtonText: 'Close',
                customClass: {
                    container: 'game-over-alert',
                    popup: 'rounded-lg',
                    confirmButton: 'bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors',
                    cancelButton: 'bg-gray-500 text-white px-6 py-2 rounded-lg hover:bg-gray-600 transition-colors'
                }
            }).then((result) => {
                if (result.isConfirmed) {
                    startNewGame();
                }
            });

            setGameResult(result);
            setGameStarted(false);
        });

        socket.on('roomError', (message: string) => {
            setError(message);
        });

        socket.on('playerDisconnected', ({ playerName, nextPlayer, cardCounts }) => {
            Swal.fire({
                title: 'Player Disconnected',
                text: `${playerName} has left the game`,
                icon: 'warning',
                confirmButtonText: 'Continue Playing',
                customClass: {
                    container: 'game-over-alert',
                    confirmButton: 'bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors'
                }
            });
            setCurrentPlayer(nextPlayer);
            if (cardCounts) {
                setPlayerCardCounts(cardCounts);
            }
        });

        socket.on('updateCardCounts', ({ cardCounts }) => {
            setPlayerCardCounts(cardCounts);
        });

        socket.on('updatePlayers', ({ players, cardCounts }) => {
            console.log('Updating players:', players, 'Card counts:', cardCounts);
            setPlayers(players);
            if (cardCounts) {
                setPlayerCardCounts(cardCounts);
            }
        });

        socket.on('connect_error', (error) => {
            console.error('Socket connection error:', error);
            setError('Connection error. Please try again.');
        });

        return () => {
            socket.off('connect');
            socket.off('disconnect');
            socket.off('playerName');
            socket.off('roomCreated');
            socket.off('joinedRoom');
            socket.off('gameStart');
            socket.off('cardPlayed');
            socket.off('cardDrawn');
            socket.off('turnChanged');
            socket.off('gameOver');
            socket.off('roomError');
            socket.off('playerDisconnected');
            socket.off('updateCardCounts');
            socket.off('updatePlayers');
            socket.close();
        };
    }, []);

    const createRoom = () => {
        if (isConnected) {
            socket.emit('createRoom');
        }
    };

    const joinRoom = () => {
        if (isConnected && joinRoomId) {
            socket.emit('joinRoom', joinRoomId);
        }
    };

    const playCard = (card: Card) => {
        if (currentPlayer === socket.id) {
            socket.emit('playCard', { roomId, card });
        }
    };

    const drawCard = () => {
        console.log('drawCard called', currentPlayer, socket.id); // Debug log
        if (currentPlayer === socket.id) {
            socket.emit('drawCard', roomId);
        }
    };

    const startNewGame = () => {
        setGameResult(null);
        setCards([]);
        setTopCard(null);
        setCurrentPlayer('');
        setGameStarted(false);
        setRoomId('');
        setJoinRoomId('');
    };

    if (!gameStarted) {
        return (
            <div className="flex flex-col gap-6 p-8 bg-white rounded-lg shadow-lg">
                <h1 className="text-2xl font-bold text-center">Welcome to Uno!</h1>
                <p className="text-lg">
                    {isConnected 
                        ? `Your player name is: ${playerName || 'Connecting...'}`
                        : 'Connecting to server...'}
                </p>
                
                {error && (
                    <p className="text-red-500 text-center">{error}</p>
                )}
                
                <div className="flex flex-col gap-4">
                    <button 
                        onClick={createRoom}
                        disabled={!isConnected}
                        className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors disabled:bg-gray-400"
                    >
                        Create New Room
                    </button>
                    
                    <div className="flex flex-col gap-2">
                        <input 
                            type="text"
                            value={joinRoomId}
                            onChange={(e) => setJoinRoomId(e.target.value)}
                            placeholder="Enter Room ID"
                            className="border p-2 rounded-lg"
                            disabled={!isConnected}
                        />
                        <button 
                            onClick={joinRoom}
                            disabled={!isConnected}
                            className="bg-green-500 text-white px-6 py-2 rounded-lg hover:bg-green-600 transition-colors disabled:bg-gray-400"
                        >
                            Join Room
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    console.log('Current card counts:', playerCardCounts);

    return (
        <div className="min-h-screen bg-gradient-to-br from-green-800 to-green-900 p-4 md:p-6">
            {/* Game Info Bar */}
            <div className="bg-white/95 backdrop-blur-sm p-4 rounded-xl shadow-lg flex flex-col md:flex-row justify-between items-center gap-3 mb-6">
                <div className="flex items-center gap-2">
                    <span className="text-gray-500 font-medium">Room:</span>
                    <span className="bg-gray-100 px-3 py-1 rounded-lg font-mono">{roomId}</span>
                </div>
                <div className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold">
                    {currentPlayer === socket.id ? 
                        "🎮 Your Turn!" : 
                        `👉 ${players.find(p => p.id === currentPlayer)?.name}'s Turn`
                    }
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-gray-500 font-medium">Playing as:</span>
                    <span className="font-semibold">{playerName}</span>
                </div>
            </div>

            {/* Game Table */}
            <div className="relative h-[calc(100vh-12rem)] rounded-2xl bg-gradient-to-br from-green-700/50 to-green-800/50 backdrop-blur-sm shadow-xl overflow-hidden">
                {/* Center play area */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative flex items-center gap-8 md:gap-16">
                        {/* Deck */}
                        <div className="absolute -left-40 top-1/2 -translate-y-1/2 z-10">
                            <button 
                                onClick={() => {
                                    console.log('Draw button clicked', currentPlayer, socket.id); // Debug log
                                    if (currentPlayer === socket.id) {
                                        drawCard();
                                    }
                                }}
                                disabled={currentPlayer !== socket.id}
                                className={`
                                    flex flex-col items-center 
                                    ${currentPlayer === socket.id 
                                        ? 'cursor-pointer hover:scale-105' 
                                        : 'opacity-70 cursor-not-allowed'
                                    } 
                                    transition-all duration-200
                                `}
                            >
                                <CardBack 
                                    width={120}
                                    height={180}
                                    className="rounded-lg shadow-xl mb-2"
                                />
                                <span className="text-white font-medium">
                                    {currentPlayer === socket.id ? 'Click to Draw' : 'Draw Pile'}
                                </span>
                            </button>
                        </div>

                        {/* Top Card */}
                        {topCard && (
                            <div className="transform transition-all duration-300">
                                <div className="relative">
                                    <Image 
                                        src={`/uno/${topCard.color}_${topCard.number}.jpg`}
                                        alt={`${topCard.color} ${topCard.number}`}
                                        width={120}
                                        height={180}
                                        className="rounded-xl shadow-2xl"
                                    />
                                    <div className="absolute inset-0 rounded-xl ring-2 ring-white/20" />
                                </div>
                                <span className="block mt-3 text-center text-white/80 text-sm font-medium">
                                    Current Card
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Other Players */}
                <div className="absolute inset-0">
                    {players.filter(p => p.id !== socket.id).map((player, index) => {
                        const totalPlayers = players.length - 1;
                        const angle = (index * (360 / totalPlayers)) * (Math.PI / 180);
                        const radius = Math.min(window.innerWidth, window.innerHeight) * 0.3;
                        const left = `${50 + Math.cos(angle) * 35}%`;
                        const top = `${50 + Math.sin(angle) * 35}%`;

                        return (
                            <div 
                                key={player.id}
                                className={`absolute transform -translate-x-1/2 -translate-y-1/2 transition-all duration-300 ${
                                    player.id === currentPlayer ? 'scale-110 z-10' : 'z-0'
                                }`}
                                style={{ left, top }}
                            >
                                <div className={`
                                    p-4 rounded-xl backdrop-blur-sm shadow-xl
                                    ${player.id === currentPlayer 
                                        ? 'bg-yellow-100/90 ring-2 ring-yellow-400' 
                                        : 'bg-white/90'
                                    }
                                `}>
                                    <p className="font-medium text-center mb-3">{player.name}</p>
                                    <div className="flex -space-x-6 justify-center">
                                        {[...Array(playerCardCounts[player.id] || 0)].map((_, i) => (
                                            <div 
                                                key={i}
                                                style={{
                                                    transform: `translateX(${i * 4}px) rotate(${i * 3}deg)`,
                                                    zIndex: i
                                                }}
                                            >
                                                <CardBack 
                                                    width={40} 
                                                    height={60}
                                                    className="shadow-lg"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-2 text-center">
                                        <span className="inline-block px-2 py-1 bg-gray-100 rounded-full text-xs font-medium">
                                            {playerCardCounts[player.id] || 0} cards
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Player's Hand */}
                <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 p-6 w-full max-w-4xl">
                    <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-6 shadow-xl">
                        <div className="flex justify-center items-end -space-x-12 md:-space-x-8">
                            {cards.map((card, index) => (
                                <div 
                                    key={index}
                                    onClick={() => currentPlayer === socket.id && playCard(card)}
                                    className={`
                                        transform hover:-translate-y-8 
                                        ${currentPlayer === socket.id 
                                            ? 'cursor-pointer hover:z-10' 
                                            : 'cursor-not-allowed opacity-50'
                                        }
                                        transition-all duration-300 ease-in-out
                                    `}
                                    style={{
                                        transform: `translateX(${index * 2}px) rotate(${
                                            -15 + (index * (30 / cards.length))
                                        }deg)`,
                                        transformOrigin: 'bottom center'
                                    }}
                                >
                                    <Image 
                                        src={`/uno/${card.color}_${card.number}.jpg`}
                                        alt={`${card.color} ${card.number}`}
                                        width={100}
                                        height={150}
                                        className="rounded-xl shadow-lg"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
} 