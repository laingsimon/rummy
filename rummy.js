var fs = require('fs');
const { v4: uuidv4 } = require('uuid');
var session = require('./session.js');

module.exports.mapGameStateToOverview = function mapGameStateToOverview(gameState) {
    return {
        id: gameState.id,
        players: gameState.players.map(player => {
            return {
                id: player.id,
                name: session.getUserName(player.id)
            }
        }),
        status: gameState.status,
        game: {
            'created-by': {
                id: gameState.game.owner.id,
                name: session.getUserName(gameState.game.owner.id)
            },
            created: gameState.game.created
        },
        lobby: gameState.lobby.map(player => {
            return {
                id: player.id,
                name: session.getUserName(player.id)
            }
        })
    };
}

module.exports.games = function games() {
    return fs.readdirSync('./games')
    .filter(filename => filename.endsWith('.game'))
    .map(filename => {
        return {
            filename: filename,
            id: filename.replace(/\.game$/, ''),
            getContent: function() {
                return JSON.parse(fs.readFileSync('./games/' + filename));
            },
            updateContent: function(changes) {
                var newState = Object.assign({}, this.getContent(), changes);

                fs.writeFileSync('./games/' + filename, JSON.stringify(newState, null, 4));
                return newState;
            }
        }
    });
}

module.exports.game = function game(id) {
    var games = this.games().filter(game => { 
        return game.id === id;
    });

    return games.length === 1 
        ? games[0]
        : null;
}

module.exports.newGame = function newGame(user) {
    var id = uuidv4();

    var newState = {
        id: id,
        "face-down": null,
        "face-up": [],
        status: "waiting-for-players",
        "current-player": null,
        players: [
            {
                id: user.id,
                hand: null,
                considering: []
            }
        ],
        game: {
            owner: {
                id: user.id
            },
            created: new Date().toISOString()
        },
        lobby: [ ]
    }

    var newStateJson = JSON.stringify(newState, null, 4);

    fs.writeFileSync('./games/' + id + '.game', newStateJson);
    return newState;
}