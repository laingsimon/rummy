const { Dealer } = require('./Dealer.js');
const { Random } = require('./Random.js');
const { v4: uuidv4 } = require('uuid');

module.exports.Game = class Game {
    random = new Random();

    constructor(app, id, io, owner, minPlayers, maxPlayers, noOfCardsForGame) {
        if (!owner) {
            throw new Error('No owner provided');
        }
        
        this.id = id;
        this.owner = owner;
        this.players = {};
        this.players[owner.id] = owner;
        this.lobby = {};
        this.status = 'waiting_for_players';
        this.io = io;
        this.app = app;
        this.playerToken = null;

        this.minPlayers = minPlayers;
        this.maxPlayers = maxPlayers;
        this.noOfCardsForGame = noOfCardsForGame;

        this.dealer = new Dealer();
        this.playerSequence = [];
        this.currentPlayer = -1;
        this.winnerAgreement = {};

        this.adminToken = uuidv4();
        this.owner.setAdminToken(this, this.adminToken);

        this.owner.notifyInGame(this);
        owner.socket.on('admit', (id) => {
            this.admit(id, this.adminToken);
        });
        owner.socket.on('start', (id) => {
            if (id !== this.id) {
                return;
            }

            this.start(this.adminToken);
        })
    }

    error = (socket, message) => {
        socket.emit('game_error', message);
    };
    
    join = (player) => {
        if (this.lobby[player.id] || this.players[player.id]) {
            return; //already in lobby or playing
        }

        if (this.status !== 'waiting_for_players') {
            this.error(player.socket, 'Game has started, you cannot join');
            return;
        }

        if (this.players[player.id]) {
            return; //already in the game
        }

        this.lobby[player.id] = player;
        this.notifyLobby();
    }

    playerDisconnected = (player) => {
        const hasPlayer = this.players[player.id];

        delete this.lobby[player.id];
        delete this.players[player.id];

        if (hasPlayer && this.status !== 'waiting_for_players') {
            this.status = 'abandoned'; //because a player has left
            this.notifyPlayers({
                state: 'abandoned'
            });
        }

        this.notifyLobby();
    }

    notifyLobby = () => {
        this.owner.socket.emit('joiners', Object.values(this.lobby).map(player => { 
            return player.getOverview();
        }));
        this.app.sendGames();
    }

    leave = (player) => {
        if (!this.lobby[player.id] && !this.players[player.id]) {
            return; //player isn't part of the game
        }

        if (this.status !== 'waiting_for_players') {
            this.error(player.socket, 'Game has started, you cannot leave');
            return;
        }

        delete this.lobby[player.id];
        delete this.players[player.id];

        this.notifyLobby();
    }

    admit = (playerId, adminToken) => {
        if (adminToken !== this.adminToken) {
            return;
        }

        if (this.players[playerId]) {
            delete this.lobby[playerId];           
            return;
        }

        const player = this.lobby[playerId];
        if (!player) {
            this.error(this.owner.socket, 'Player not in the lobby');
            return;
        }

        this.players[player.id] = player;
        delete this.lobby[playerId];
        player.notifyInGame(this);
        this.notifyLobby();

        this.io.in(this.id).emit('welcome', player.getOverview());
    }

    noOfPlayers = () => {
        return Object.keys(this.players).length;
    }

    start = (adminToken) => {
        if (adminToken !== this.adminToken) {
            return;
        }

        if (this.status !== 'waiting_for_players') {
            return; //game has already started
        }

        if (this.noOfPlayers() < this.minPlayers) {
            this.error(this.owner.socket, 'Cannot start game, not enough players, need ' + this.minPlayers + ' or more');
            return;
        }

        if (this.noOfPlayers() > this.maxPlayers) {
            this.error(this.owner.socket, 'Cannot start game, too many players, need ' + this.maxPlayers + ' or less');
            return;
        }

        this.lobby =  {};
        this.status = 'dealing';
        this.notifyPlayers({
            state: 'dealing'
        });

        const cards = this.dealer.deal(this.noOfPlayers(), this.noOfCardsForGame, 0);
        const players = Object.values(this.players);

        for (let playerIndex = 0; playerIndex < players.length; playerIndex++) {
            const player = players[playerIndex];
            player.setHand(cards[playerIndex]);
        }

        this.face_up = [];
        this.face_down = cards.remaining;
        this.playerSequence = this.newPlayerSequence();
        this.currentPlayer = -1;

        this.app.sendGames();
        this.state = 'started';
        this.notifyPlayers({
            state: 'started',
            players: this.playerSequence.map(player => player.getOverview())
        });
        this.moveToNextPlayer();
    }

    takeCardFromDeck = () => {
        if (this.face_down.length === 0) {
            this.face_down = this.face_up;
            this.face_up = [];
        }

        return this.face_down.shift();
    }

    takeCardFromFaceUp = () => {
        const card = this.face_up.shift();
        this.notifyPlayers({
            state: 'face-up-changed',
            faceUp: this.face_up,
            removedFromFaceUp: card
        });
        return card;
    }

    returnCardFaceUp = (card) => {
        this.face_up.unshift(card);
        this.notifyPlayers({
            state: 'face-up-changed',
            faceUp: this.face_up
        });
    }

    abandon = (adminToken) => {
        if (adminToken !== this.adminToken) {
            return;
        }

        if (this.status !== 'waiting_for_players') {
            this.status = 'abandoned';
        }

        this.notifyPlayers({
            state: 'abandoned'
        });

        this.app.removeGame(this);
    }

    notifyWinner = (player, hand) => {
        this.notifyPlayers({
            state: 'potential_winner',
            player: player.getOverview(),
            hand: hand
        });
    }

    agreeWinner = (player, winner_id) => {
        this.winnerAgreement[player.id] = player;

        if (Object.keys(this.winnerAgreement).length >= this.noOfPlayers() / 2) {
            const winner = this.players[winner_id];

            if (!winner) {
                throw new Error('Cannot find winner with id ' + winner_id + '\nPlayers: ' + JSON.stringify(Object.keys(this.players)));
            }

            const winningHand = winner.getHand();

            this.notifyPlayers({
                state: 'won',
                player: winner.getOverview(),
                hand: winningHand
            })

            this.state = 'won';
            this.app.removeGame(this);
        }
    }

    disconnect = () => {
    }

    notifyPlayers = (state) => {
        this.io.sockets.in(this.id).emit('notification', state);
    }

    moveToNextPlayer = () => {
        this.currentPlayer++;
        if (this.currentPlayer >= this.playerSequence.length) {
            this.currentPlayer = 0;
        }

        this.playerToken = uuidv4();
        this.getCurrentPlayer().yourTurn(this, this.playerToken);
        this.notifyPlayers({
            state: 'change-player',
            player: this.getCurrentPlayer().getOverview(),
            faceUp: this.face_up
        })
    }

    getCurrentPlayer = () => {
        return this.playerSequence[this.currentPlayer];
    }

    newPlayerSequence = () => {
        let players = Object.values(this.players);
        let sequence = [];

        while (players.length > 0) {
            const playerIndex = this.random.next(0, players.length - 1);
            sequence.push(players[playerIndex]);
            players.splice(playerIndex, 1);
        }

        return sequence;
    }

    getOverview = () => {
        return {
            id: this.id,
            playerCount: this.noOfPlayers(),
            players: Object.values(this.players).map(player => player.getOverview()),
            state: this.state,
            owner: this.owner.getOverview()
        };
    }
}