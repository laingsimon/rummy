$(function () {
    const rememberedName = window.localStorage.getItem('name');
    $("#name").val(rememberedName);

    var socket = io();
    var session = {
      games: [],
      joined: null,
      id: null
    };

    socket.on('connect', function() {
      if ($("#name").val()) {
        socket.emit('name', rememberedName);
      }
    })

    function refreshGames() {
      $("#games").html("");
      $("#new-game").toggle(!session.joined && !session.joining);
      $("#games").toggle(session.games.length > 0);
      if (session.games.length === 0) {
        return;
      }

      session.games.forEach(game => {
        const displayId = game.id.substring(0, 5);

        if (session.joining === game.id) {
          $("#games").append(`<li style='font-weight: bold;'>${displayId} (${game.owner.name}) - ${game.players} player/s</li>`);
        } else if (session.joined === game.id) {
          if (session.id === game.owner.id) {
            $("#games").append(`<li style='font-weight: bold;'><button class='start' data-id='${game.id}'>Start ${displayId} (${game.owner.name}) - ${game.players} player/s</button></li>`);
          } else {
            $("#games").append(`<li style='font-weight: bold;'>${displayId} (${game.owner.name}) - ${game.players} player/s</li>`);
          }
        } else {
          $("#games").append(`<li><button class='join' data-id='${game.id}'>Join ${displayId} (${game.owner.name}) - ${game.players} player/s</button></li>`);
        }
      });
    }

    $("#close-profile").click(function() {
        $("#profile").hide();
        $("#welcome").show();
    });

    socket.on('user-id', function(id) {
      session.id = id;
    });

    socket.on('games', function(games) {
      session.games = games.games;
      refreshGames();
    });

    socket.on('new-game', function(newGame) {
      session.joined = newGame.game.id;
      session.joining = null;
      session.id = newGame.userId;
    });

    socket.on('joiners', function(joiners) {
      $("#admit").html("");
      joiners.forEach(joiner => {
        $("#admit").append(`<li><button class='admit' data-player-id='${joiner.id}' data-game-id='${joiner.gameId}'>Admit ${joiner.name}</button></li>`);
      });
      $("#lobby").toggle(joiners.length > 0);
    });

    socket.on('joined', function(id) {
      session.joined = id;
      session.joining = null;
      $("#games").html("You're in the game!");
    });

    $("#name").change(function() {
      const name = $("#name").val();
      window.localStorage.setItem('name', name);
      socket.emit('name', name);
    });

    $("#new-game").click(function() {
      socket.emit('new-game', {});
    });

    $("#games").on("click", ".join", function(event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const id = $(event.target).data('id');

      socket.emit('join', id);
      session.joining = id;
      session.joined = null;

      refreshGames();
    });

    $("#games").on("click", ".start", function(event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const id = $(event.target).data('id');

      socket.emit('start', id);
    });

    $("#admit").on("click", ".admit", function(event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const playerId = $(event.target).data('player-id');
      const gameId = $(event.target).data('game-id');

      socket.emit('admit', playerId);
    });

    socket.on('notification', function(notification) {
      if (notification.state === 'dealing' || notification.state === 'started') {
        $("#game").show();
        $("#welcome").hide();
      }

      if (notification.state === 'dealing') {
        $("#game-players").text("Dealing...");
      } else if (notification.state === 'abandoned') {
        $("#game").hide();
        $("#welcome").show();
        $("#winner_review").hide();
      } else if (notification.state === 'started') {
        $("#game-players").html("").append(notification.players.map(player => `<span data-id='${player.id}' class='${player.id === session.id ? 'me' : ''}'>${player.name}</span>`));
      } else if (notification.state === 'face-up-changed') {
        updateFaceUp(notification.faceUp);
      } else if (notification.state === 'change-player') {
        $("#game-players span").each(function() { 
          $(this).toggleClass('current-player', $(this).data('id') === notification.player.id);
        });

        $("body").toggleClass('your-turn', notification.player.id === session.id);
        $("#game").show();
        $("#winner_review").hide();
        updateFaceUp(notification.faceUp);
      } else if (notification.state === 'potential_winner') {
          session.potential_winner_id = notification.player.id
          $("#winner-prompt").html(`${notification.player.name} thinks they have won with this hand, do you agree?`);
          showHand($("#winning-hand"), notification.hand);
          $("#agree-winner").toggle(notification.player.id !== session.id);
          $("#disagree-winner").toggle(notification.player.id !== session.id);
          $("#try-again").hide();
          $("#game").hide();
          $("#winner_review").show();
      } else if (notification.state === 'won') {
        $("#winner-prompt").html(`${notification.player.name} has won with this hand`);
        showHand($("#winning-hand"), notification.hand);
        $("body").removeClass('your-turn');
        $("#agree-winner").hide();
        $("#disagree-winner").hide();
        $("#try-again").show();
        session.joined = null;
        session.joining = null;
        session.potential_winner_id = null;
      }
    });

    $("#try-again").click(function() {
        $("#game").hide();
        $("#welcome").show();
        $("#winner_review").hide();
        refreshGames();
    });

    $("#agree-winner").click(function() {
        $("#agree-winner").hide();
        $("#disagree-winner").hide();
        socket.emit('agree_winner', session.potential_winner_id);
    });

    $("#disagree-winner").click(function() {
        $("#game").show();
        $("#winner_review").hide();
  })

    function updateFaceUp(faceUp) {
        $("#face_up").html("");
        if (faceUp.length > 0) {
          const lastFaceUpCard = faceUp[0];
          const suit = Object.keys(lastFaceUpCard)[0];
          const theCard = `<div class='card ${suit}'>${lastFaceUpCard[suit]}</div>`
          $("#face_up").append(theCard).show();
        } else {
          $("#face_up").hide();
        }
    }

    function showHand(parent, hand) {
        parent.html("");

        const suits = {
            hearts: hand.filter(card => card.hearts),
            clubs: hand.filter(card => card.clubs),
            diamonds: hand.filter(card => card.diamonds),
            spades: hand.filter(card => card.spades),
        }
  
        function sortValue(value) {
          if (value === "A") {
              return "0";
          }
          if (value === "10") {
              return "a";
          }
          if (value === "J") {
              return "b";
          }
          if (value === "Q") {
              return "c";
          }
          if (value === "K") {
              return "d";
          }
  
          return value;
        }
  
        function cardSort(cardX, cardY) {
            const suit = Object.keys(cardX)[0];
            const valueX = sortValue(cardX[suit]);
            const valueY = sortValue(cardY[suit]);
  
            return valueX.localeCompare(valueY);
        }
  
        Object.keys(suits).forEach(suit => {
            const cardsInSuit = suits[suit];
            cardsInSuit.sort(cardSort);
  
            cardsInSuit.forEach(card => {
              const theCard = `<div class='card ${suit}${card.new ? ' new-card' : ''}'>${card[suit]}</div>`
              parent.append(theCard);
            });
        });
    }

    socket.on('hand', function(hand) {
      showHand($("#hand"), hand);
    });

    socket.on('game_error', function(message) {
        alert(message);
    });

    socket.on('your-turn', function(token) {
      session.go_token = token;
    });

    $("#face_up").on("click", ".card", function(event) {
        socket.emit('take_face_up', session.go_token);
    });

    $("#face_down").click(function(event) {
        socket.emit('take_face_down', session.go_token);
    });

    $("#hand").on("click", ".card", function(event) {
        if (!session.go_token || $("#hand .new-card").length === 0) {
            return;
        }

        const card = $(event.target);
        card.removeClass("new-card");

        const suit = card[0].className.replace('card ', '');
        const cardData = {};
        cardData[suit] = card.text();

        socket.emit('return_card', {
            card: cardData,
            token: session.go_token
        });
        session.go_token = null;
        card.remove();
        $("#hand .new-card").removeClass("new-card");
    });

    $("#win").click(function() {
        socket.emit('win');
    });
  });