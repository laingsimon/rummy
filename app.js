var express = require('express');
var http = require('http');
var path = require('path');
var fs = require('fs');
var app = express();
var port = 8082;
var rummy = require('./rummy.js');
var session = require('./session.js');
var cookieParser = require('cookie-parser');

app.configure(function () {
    app.set('port', port);
    app.use(express.bodyParser());
    app.use(express.methodOverride());
    app.use(cookieParser());
    app.use(app.router);
});

app.get('/', function(request, response) {
    var formHtml = fs.readFileSync('./index.html');
    var user = session.getUser(request, response);

	response.contentType("text/html");
	response.send(formHtml);
});

app.get('/Status', function(request, response) {
    response.statusCode = 200;
    response.write("Running");
    response.end();
});

app.get('/Name/:name', function(request, response) {
    var userName = request.params.name;
    var user = session.setUserName(request, response, userName);

    response.send(user);
    response.end();
});

app.get('/Games', function(request, response) {
    var games = rummy.games().map(
        game => {
            return rummy.mapGameStateToOverview(game.getContent());
        }
    );

    response.send(games);
    response.end();
});

app.get('/NewGame', function(request, response) {
    var user = session.getUser(request, response);

    response.send(rummy.mapGameStateToOverview(rummy.newGame(user)));
    response.end();
});

app.get('/Join/:gameId', function(request, response) {
    var user = session.getUser(request, response);
    var gameId = request.params.gameId;

    if (!gameId) {
        response.status(400);
        response.send("No gameId supplied");
        response.end();
        return;
    }

    var game = rummy.game(gameId);
    if (!game) {
        response.status(404);
        response.send("Game not found");
        response.end();
        return;
    }

    var gameState = game.getContent();

    if (gameState.status !== "waiting-for-players") {
        response.status(403);
        response.send("Game is not join-able");
        response.end();
        return;
    }

    if (gameState.players.filter(player => player.id === user.id).length > 0) {
        response.status(200);  //already in the game
        response.send("You're already in the game");
        response.end();
        return;
    }

    var lobby = gameState.lobby || [];
    if (lobby.filter(u => u.id === user.id).length > 0) {
        response.status(202);  //already in the lobby
        response.send("You're already in the lobby");
        response.end();
        return;
    }

    var newLobby = lobby.concat([ user ]);
    game.updateContent({
        lobby: newLobby
    })

    response.status(202);
    response.send("You're in the lobby - the owner will admit you");
    response.end();
});

app.get('/Accept/:gameId/:userId', function(request, response) {
    var user = session.getUser(request, response);
    var gameId = request.params.gameId;
    var userId = request.params.userId;

    if (!gameId) {
        response.status(400);
        response.send("No gameId supplied");
        response.end();
        return;
    }

    if (!userId) {
        response.status(400);
        response.send("No gameId supplied");
        response.end();
        return;
    }

    var game = rummy.game(gameId);
    if (!game) {
        response.status(404);
        response.send("Game not found");
        response.end();
        return;
    }

    var gameState = game.getContent();

    if (user.id !== gameState.game.owner.id) {
        response.status(403);
        response.send("Only the owner can do this");
        response.end();
        return;
    }

    if (gameState.status !== "waiting-for-players") {
        response.status(403);
        response.send("Game is not join-able");
        response.end();
        return;
    }

    var lobby = gameState.lobby;
    if (lobby.filter(u => u.id === userId).length === 0) {
        response.status(403);
        response.send("User has not asked to join this game");
        response.end();
        return;
    }

    var newLobby = lobby.filter(u => u.id !== userId);
    game.updateContent({
        lobby: newLobby
    });

    if (gameState.players.filter(player => player.id === userId).length > 0) {
        response.status(200);  //already in the game
        response.send("You're already in the game");
        response.end();
        return;
    }

    var newPlayer = {
        name: session.getUserName(userId),
        id: userId,
        hand: null,
        considering: []
    };
    game.updateContent({
        players: gameState.players.concat([ newPlayer ])
    });
    response.status(200);
    response.send("They're now part of the game");
    response.end();
    return;
});

app.get('/Reject/:gameId/:userId', function(request, response) {
    var user = session.getUser(request, response);
    var gameId = request.params.gameId;
    var userId = request.params.userId;

    if (!gameId) {
        response.status(400);
        response.send("No gameId supplied");
        response.end();
        return;
    }

    if (!userId) {
        response.status(400);
        response.send("No gameId supplied");
        response.end();
        return;
    }

    var game = rummy.game(gameId);
    if (!game) {
        response.status(404);
        response.send("Game not found");
        response.end();
        return;
    }

    var gameState = game.getContent();

    if (user.id !== gameState.game.owner.id) {
        response.status(403);
        response.send("Only the owner can do this");
        response.end();
        return;
    }

    if (gameState.status !== "waiting-for-players") {
        response.status(403);
        response.send("Game is not join-able");
        response.end();
        return;
    }

    var lobby = gameState.lobby;
    if (lobby.filter(u => u.id === userId).length === 0) {
        response.status(200);
        response.send("User has not asked to join this game");
        response.end();
        return;
    }

    var newLobby = lobby.filter(u => u.id !== userId);
    game.updateContent({
        lobby: newLobby
    });

    response.status(200);
    response.send("They've been removed from the lobby");
    response.end();
    return;
});

app.get('/Eject/:gameId/:userId', function(request, response) {
    var user = session.getUser(request, response);
    var gameId = request.params.gameId;
    var userId = request.params.userId;

    if (!gameId) {
        response.status(400);
        response.send("No gameId supplied");
        response.end();
        return;
    }

    if (!userId) {
        response.status(400);
        response.send("No gameId supplied");
        response.end();
        return;
    }

    var game = rummy.game(gameId);
    if (!game) {
        response.status(404);
        response.send("Game not found");
        response.end();
        return;
    }

    var gameState = game.getContent();

    if (user.id !== gameState.game.owner.id) {
        response.status(403);
        response.send("Only the owner can do this");
        response.end();
        return;
    }

    if (userId === gameState.game.owner.id) {
        response.status(403);
        response.send("You cannot remove yourself");
        response.end();
        return;
    }

    if (gameState.status !== "waiting-for-players") {
        response.status(403);
        response.send("Game has started");
        response.end();
        return;
    }

    var lobby = gameState.lobby;
    var players = gameState.players;
    var changesMade = false;
    if (lobby.filter(u => u.id === userId).length > 0) {
        lobby = lobby.filter(u => u.id !== userId);
        changesMade = true;
    }

    if (players.filter(p => p.id === userId).length > 0) {
        players = players.filter(p => p.id !== userId);
        changesMade = true;
    }

    response.status(200);

    if (changesMade) {
        game.updateContent({
            lobby: lobby,
            players: players
        });

        response.send("They've been removed from the game");
    } else {
        response.send("They weren't part of the game");
    }

    response.end();
});

app.get('/Start/:gameId', function(request, response) {
    var game = rummy.game(request.params.gameId);
    var user = session.getUser(request, response);

    if (!game) {
        response.status(404);
        response.send("Game not found");
        response.end();
        return;
    }

    var gameState = game.getContent();
    if (user.id !== gameState.game.owner.id) {
        response.status(403);
        response.send("Only the owner can do this");
        response.end();
        return;
    }
    game.updateContent({
        status: "dealing"
    });

    response.status(202);
    response.send("Dealing...");
    response.end();
});

http.createServer(app).listen(port, function () {
    console.log("Express server listening on port " + port);
});
