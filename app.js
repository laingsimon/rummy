var express = require('express');
var http = require('http');
var path = require('path');
var fs = require('fs');
var app = express();
var port = 8082;
var rummy = require('./rummy.js');
//var users = require('./users.js');
var session = require('./session.js');
var cookieParser = require('cookie-parser');
const { v4: uuidv4 } = require('uuid');
const { Dealer } = require('./Dealer.js');
const { Player } = require('./Player.js');
const { Game } = require('./Game.js');

app.configure(function () {
    app.set('port', port);
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(cookieParser());
    app.use(app.router);
    app.use(express.static('static'));
});

app.get('/Status', function(request, response) {
    response.statusCode = 200;
    response.write("Running");
    response.end();
});

var server = http.createServer(app).listen(port, function () {
    console.log("Express server listening on port " + port);
});

const io = require('socket.io')(server);
const games = {};
const users = {};

io.on('connection', function(socket){
  var id = uuidv4();
  var session = {
      id: id,
      game: null,
      player: new Player(id, null, null, socket),
      joined: null
  };
  users[session.id] = session;
  console.log('Connected: ' + session.id);

  function sendGames() {
    const data = {
        games: Object.values(games)
            .filter(game => game.status === 'waiting_for_players')
            .map(game => game.getOverview())
    };

    io.emit('games', data);
  }

  socket.emit('user-id', session.id);
  sendGames();
  
  const app = {
      sendGames: () => { sendGames(); },
      removeGame: (game) => {
          delete games[game.id];
          game.disconnect();
      }
  }

  socket.on('new-game', function() {
    if (session.game) {
        session.player.administerGame(session.game, session.game.abandon);
        delete games[session.game.id];
    }

    const minPlayers = 2;
    const maxPlayers = 6;
    const cardsPerPlayer = 7;
    session.game = new Game(app, uuidv4(), io, session.player, minPlayers, maxPlayers, cardsPerPlayer);
    games[session.game.id] = session.game;
    console.log('Game created: ' + session.game.id);

    socket.emit('new-game', {
        game: session.game.getOverview(),
        userId: session.id
    });
    sendGames();
  });

  socket.on('name', function(name) {
    session.player.setName(name);
    console.log(`${session.id} -> ${session.player.name}`);
  });

  socket.on('join', function(gameId) {
    if (session.joined) {
        socket.leave(session.joined);
    }

    const game = games[gameId];
    socket.join(gameId);
    session.joined = gameId;
    game.join(session.player);
  });

  socket.on('disconnect', function(){
    delete users[session.id];

    Object.values(games)
    .forEach(game => {
        game.playerDisconnected(session.player);
        if (game.owner.id === session.player.id) {
            delete games[game.id];
        }
    });

    sendGames(null);
    console.log(`Disconnected: ${session.id} (${session.player.name})`);
  });
});
