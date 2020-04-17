$(function () {
    const rememberedName = window.localStorage.getItem('name');
    $("#name").val(rememberedName);

    var socket = io();
    var session = {
      games: [],
      joined: null,
      id: null,
      manualCardOrder: [],
      hand: null
    };

    window.addEventListener('beforeunload', function(e) {
      e.preventDefault();
      delete e['returnValue'];

      if (session.joined) {
        e.returnValue = 'You are part of a game, reloading the page will abandon the game for everyone.';
      }
    });

    $("#hand").sortable({ axis: "x", containment: "parent", scroll: false, delay: 500 });
    $("#hand").disableSelection();

    $("#hand").sortable({
      update: function( event, ui ) {
        session.manualCardOrder = Array.from(event.target.children).map(element => {
          return getCardFromElement(element);
        });
      }
    });

    function resetUi(showName) {
      if (!$("#name").val() || showName) {
        $("#profile").show();
        $("#welcome").hide();
      } else {
        $("#welcome").show();
        $("#profile").hide();
      }
      
      $("#try-again").hide();
      $("#game").hide();
      $("#winner_review").hide();
      $("body").removeClass('your-turn');
      $("#other-hands").html("");
      $("#full-disclosure").hide();
      session.joined = null;
      session.joining = null;
      session.potential_winner_id = null;
      session.manualCardOrder = [];
      session.hand = null;
    }
    
    socket.on('connect', function() {
      if ($("#name").val()) {
        socket.emit('name', rememberedName);
      }

      resetUi(true);
    });

    function refreshGames() {
      $("#games").html("");
      $("#games").toggle(session.games.length > 0);
      if (session.games.length === 0) {
        return;
      }

      session.games.forEach(game => {
        const displayId = game.id.substring(0, 5);
        
        
        function playerItem(player) {
          return `<li>${playerText(player)}</li>`;
        }

        function playerText(player) {
          if (player.id === session.id) {
            return `You`;
          }

          return player.name;
        }

        if (session.joining === game.id) {
          $("#games").append(`<div style='font-weight: bold;'>
            You've asked to be admitted to game ${displayId},<br />${game.owner.name} needs to admit you
          </div>`);
        } else if (session.joined === game.id) {
          if (session.id === game.owner.id) {
            $("#games").append(`<div style='font-weight: bold;'>
              <button class='start' data-id='${game.id}'>
                Start game <b>${displayId}</b> with players:
                <ol>
                  ${game.players.map(playerItem).join('')}
                </ol>
              </button>
            </div>`);
          } else {
            $("#games").append(`<div style='font-weight: bold;'>
              You've joined ${displayId} and are waiting to play against<br />
              ${game.players.map(playerText).join(', ')}<br />
              <br/>
              ${game.owner.name} can start the game
            </div>`);
          }
        } else {
          $("#games").append(`<div>
          <button class='join' data-id='${game.id}'>Join <b>${displayId}</b>, players are:
            <ol>
              ${game.players.map(playerItem).join('')}
            </ol>
          </button>
          </div>`);
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
      session.manualCardOrder = [];
      session.hand = null;
    });

    socket.on('joiners', function(joiners) {
      $("#admit").html("");
      joiners.forEach(joiner => {
        $("#admit").append(`<div>
          <button class='admit' data-player-id='${joiner.id}' data-game-id='${joiner.gameId}'>
            Admit <b>${joiner.name}</b> into your game
          </button>
          </div>`);
      });
      $("#lobby").toggle(joiners.length > 0);
    });

    socket.on('joined', function(id) {
      session.joined = id;
      session.joining = null;
      session.manualCardOrder = [];
      session.hand = null;
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

    $("#games").on("click", "button.join", function(event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const id = $(event.currentTarget).data('id');

      if (!id) {
        console.log('No game Id found on element');
        console.log(event.currentTarget);
        return;
      }

      socket.emit('join', id);
      session.joining = id;
      session.joined = null;
      session.manualCardOrder = [];
      session.hand = null;

      refreshGames();
    });

    $("#games").on("click", "button.start", function(event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const id = $(event.currentTarget).data('id');

      socket.emit('start', id);
    });

    $("#admit").on("click", "button.admit", function(event) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const playerId = $(event.currentTarget).data('player-id');

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
        resetUi();
      } else if (notification.state === 'started') {
        $("#game-players")
        .html("")
        .append(notification.players.map(player => `<span data-id='${player.id}' class='${player.id === session.id ? 'me' : ''}'>${player.name}</span>`));
      } else if (notification.state === 'face-up-changed') {
        updateFaceUp(notification.faceUp);
      } else if (notification.state === 'change-player') {
        $("#game-players span").each(function() { 
          $(this).toggleClass('current-player', $(this).data('id') === notification.player.id);
        });

        $("body").toggleClass('your-turn', notification.player.id === session.id);
        $("#win").prop('checked', false);
        $("#win").parent().toggle(notification.player.id === session.id)
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
          $("body").addClass('white-background');
      } else if (notification.state === 'won') {
        $("#winner-prompt").html(`${notification.player.name} has won with this hand`);
        let winningHand = notification.hands[notification.player.id];

        showHand($("#winning-hand"), winningHand.hand);
        $("#try-again").show();
        $("body").removeClass('your-turn');
        $("#other-hands").html("");

        Object.keys(notification.hands)
          .filter(id => id !== notification.player.id)
          .forEach(id => {
            const player = notification.hands[id];
            const name = player.id === session.id 
              ? 'You'
              : player.name;

            $("#other-hands").append(`<div data-player-id='${player.id}'><div class='name'>${name}</div><div class='hand'></div></div>`);
            showHand($(`#other-hands > div[data-player-id='${player.id}'] > div.hand`), player.hand);
          });

          $("#full-disclosure").show();
      }
    });

    $("#try-again").click(function() {
      resetUi();
    });

    $("#agree-winner").click(function() {
        $("body").removeClass('white-background');
        $("#agree-winner").hide();
        $("#disagree-winner").hide();
        socket.emit('agree_winner', session.potential_winner_id);
    });

    $("#disagree-winner").click(function() {
        $("body").removeClass('white-background');
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
      const orderOrCards = getHandManualOrder(hand);

      showCards(parent, orderOrCards);
    }

    function getCardFromElement(cardElement) {
      const card = $(cardElement);
      const suit = card[0].className.replace('new-card', '').replace('card', '').trim();
      const cardData = {};
      cardData[suit] = card.text();
      
      return cardData;
    }

    function showCards(parent, cardsInOrder) {
      parent.html("");

      cardsInOrder.forEach(card => {
        const suit = Object.keys(card)[0];
        const theCard = `<li class='card ${suit}${card.new ? ' new-card' : ''}'>${card[suit]}</li>`
        parent.append(theCard);
      });
    }

    function getHandManualOrder(hand) {
      if (hand.length === 0) {
        return [];
      }

      hand = hand.filter(card => true); //copy array
      let orderOfCards = session.manualCardOrder.filter(card => true); //copy array
      let orderedHand = [];
      while (orderOfCards.length > 0) {
        const nextCardToShow = orderOfCards.shift();
        const nextCardIndex = findCardIndexInHand(hand, nextCardToShow);

        if (nextCardIndex !== null && nextCardIndex !== -1) {
          let nextCard = hand[nextCardIndex];
          orderedHand.push(nextCard);
          hand.splice(nextCardIndex, 1);
        }
      }

      const remainingCardOrder = getHandAutoOrder(hand);
      return orderedHand.concat(remainingCardOrder);
    }

    function findCardInHand(hand, cardToFind) {
      const suitToFind = Object.keys(cardToFind)[0];

      const cardInHand = hand.filter(card => {
        return card[suitToFind] && card[suitToFind] == cardToFind[suitToFind];
      });

      return cardInHand.length === 1 
        ? cardInHand[0] 
        : null;
    }

    function findCardIndexInHand(hand, cardToFind) {
      const cardInHand = findCardInHand(hand, cardToFind);

      if (!cardInHand) {
        return -1;
      }

      for (let index = 0; index < hand.length; index++) {
        if (cardInHand === hand[index]) {
          return index;
        }
      }

      return null; //should never get here!
    }

    function getHandAutoOrder(hand) {
        if (hand.length === 0) {
          return [];
        }

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
  
        let cardOrder = [];
        Object.keys(suits).forEach(suit => {
            const cardsInSuit = suits[suit];
            cardsInSuit.sort(cardSort);
  
            cardsInSuit.forEach(card => {
              cardOrder.push(card);
            });
        });

        return cardOrder;
    }

    socket.on('hand', function(hand) {
      session.hand = hand;
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

        const card = $(event.currentTarget);
        card.removeClass("new-card");

        const cardData = getCardFromElement(card);
        session.manualCardOrder.splice(findCardIndexInHand(session.manualCardOrder, cardData), 1); //remove the card stored at the manual card order
        
        socket.emit('return_card', {
            card: cardData,
            token: session.go_token
        });
        session.go_token = null;
        card.remove();
        $("#hand .new-card").removeClass("new-card");

        if ($("#win").prop('checked')) {
          socket.emit('win');
        }
    });
  });