$(function () {
    const rememberedName = window.localStorage.getItem('name');
    $("#name").val(rememberedName);

    var socket = io();
    var session = {
      games: [],
      joined: null,
      id: null,
      manualCardOrder: [],
      hand: null,
      faceUp: [],
      nextCardIndex: null
    };

    window.addEventListener('beforeunload', function(e) {
      e.preventDefault();
      delete e['returnValue'];

      if (session.joined) {
        e.returnValue = 'You are part of a game, reloading the page will abandon the game for everyone.';
      }
    });

    $("#hand").sortable({ 
      scroll: false, 
      beforeStop: function(event, ui) {
        if (ui.helper.hasClass('back') || ui.helper[0].id === 'face_down') {
          socket.emit('take_face_down', session.go_token);
          session.nextCardIndex = Array.from($("#hand")[0].children).indexOf(ui.helper[0]);
        } else {
          socket.emit('take_face_up', session.go_token);
          session.nextCardIndex = Array.from($("#hand")[0].children).indexOf(ui.helper[0]);
        }
        disableDragging();
      },
      update: function( event, ui ) {
        session.manualCardOrder = Array.from(event.target.children).filter(element => !$(element).hasClass('back')).map(element => {
          return getCardFromElement(element);
        });
      } 
    });

    $("#hand").disableSelection();

    $("#face_up").droppable({
      accept: '.card',
      drop: function(event, ui) {
        if (!session.go_token || $("#hand .new-card").length === 0) {
            return;
        }

        const card = ui.draggable;
        $("#hand .new-card").removeClass("new-card");

        const cardData = getCardFromElement(card);
        session.manualCardOrder.splice(findCardIndexInHand(session.manualCardOrder, cardData), 1); //remove the card stored at the manual card order

        socket.emit('return_card', {
            card: cardData,
            token: session.go_token
        });
        session.go_token = null;

        if (session.won) {
          socket.emit('win');
        }
        session.won = false;
      }
    });

    $("#face_down").draggable({
      helper: "clone",
      connectToSortable: "#hand"
    });

    $("#face_up").draggable({
      helper: "clone",
      connectToSortable: "#hand",
      /*helper: function(){
        const helper = $("#face_up")[0].innerHTML;
        tentativeFaceUp = session.faceUp.concat([]);
        tentativeFaceUp.shift();
        updateFaceUp(tentativeFaceUp);
        return $(helper);
      },*/
      stop: function(event, ui) {
        displayFaceUp(session.faceUp);
      }
    });

    function disableDragging() {
      $("#face_down").draggable("disable");
      $("#face_up").draggable("disable");
    }

    function enableDragging() {
      $("#face_down").draggable("enable");
      $("#face_up").draggable("enable");
    }

    function cardElement(card, newCard) {
      const suit = Object.keys(card)[0];
      return $(`<div data-suit='${suit}' class='card ${suit}${newCard ? ' new-card' : ''}'>${card[suit]}</div>`);
    }

    function faceDownCard() {
      return $("<div class='card back' style='position: absolute'></div>");      
    }

    function clearFaceUp() {
      $("#face_up").html("");
    }
    
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
      disableDragging();
      $("#other-hands").html("");
      $("#full-disclosure").hide();
      clearFaceUp();
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

      session.id = socket.id;
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
      } else if (notification.state === 'card-taken-from-face-up') {
        if (notification.player.id !== session.id) {
          animateCardFromFaceUpToPlayer(notification.removedFromFaceUp, notification.faceUp, notification.player, () => {
            updateFaceUp(notification.faceUp);
          });
        }else {
          updateFaceUp(notification.faceUp);
        }
      } else if (notification.state === 'card-taken-returned-face-up') {
        if (notification.player.id !== session.id) {
          animateCardReturnedFaceUp(notification.card, notification.player, () => {
            updateFaceUp(notification.faceUp);
          });
        }
      } else if (notification.state === 'change-player') {
        $("#game-players span").each(function() { 
          $(this).toggleClass('current-player', $(this).data('id') === notification.player.id);
        });

        $("body").toggleClass('your-turn', notification.player.id === session.id);
        if (notification.player.id === session.id) {
          enableDragging();
        } else {
          disableDragging();
        }
        $("#game").show();
        $("#winner_review").hide();
        if (notification.previousPlayer && notification.previousPlayer.id === session.id) {
          updateFaceUp(notification.faceUp);
        }
      } else if (notification.state === 'card-taken-from-deck') {
        if (notification.player.id !== session.id) {
          animateCardFromDeckToPlayer(notification.player);
        }
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
        disableDragging();
        
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
  });

  function animateCardFromDeckToHand() {
    const deck = $("#face_down");

    animateCard(deck, $("#hand .new-card"), faceDownCard());
  }

  function animateCardFromDeckToPlayer(player) {
    if (player === null) {
      return;
    }

    const deck = $("#face_down");

    let playerTab = $(`#game-players > span[data-id='${player.id}']`);
    animateCard(deck, playerTab, faceDownCard());
  }

    function updateFaceUp(faceUp) {
      session.faceUp = faceUp;
      displayFaceUp(faceUp);
    }

    function displayFaceUp(faceUp) {
      clearFaceUp();
      if (faceUp.length > 0) {
        const lastFaceUpCard = faceUp[0];

        $("#face_up").append(cardElement(lastFaceUpCard)).show();
      }
    }

    function animateCardFromFaceUpToPlayer(card, faceUp, player, callback) {
      let playerTab = $(`#game-players > span[data-id='${player.id}']`);

      clearFaceUp();
      if (faceUp.length > 0) {
        $("#face_up").append(cardElement(faceUp[0]));
      }

      animateCard($("#face_up"), playerTab, cardElement(card), callback);
    }

    function animateCardReturnedFaceUp(card, player, callback) {
      let playerTab = $(`#game-players > span[data-id='${player.id}']`);

      animateCard(playerTab, $("#face_up"), cardElement(card), callback);
    }

    function animateCard(fromElement, toElement, card, callback) {
      card.css({
        top: fromElement.position().top + "px",
        left: fromElement.position().left + "px",
        position: 'absolute'
      });

      card.appendTo($("body")).animate(
        {
          top: toElement.position().top + "px",
          left: toElement.position().left + "px",
        },
        250,
        "",
        () => {
          card.remove();
          if (callback) {
            callback();
          }
        });
    }

    function showHand(parent, hand) {
      if (session.nextCardIndex !== null) {
        var newCard = Array.from(hand).filter(card => card.new === true)[0];
        if (newCard) {
          session.manualCardOrder.splice(session.nextCardIndex, 0, newCard);
        }
        session.nextCardIndex = null;        
      }

      const orderOrCards = getHandManualOrder(hand);

      showCards(parent, orderOrCards);
    }

    function getCardFromElement(cardElement) {
      const card = $(cardElement);
      const suit = card.data('suit');
      const cardData = {};
      cardData[suit] = card.text();
      
      return cardData;
    }

    function showCards(parent, cardsInOrder) {
      parent.html("");

      cardsInOrder.forEach(card => {
        parent.append(cardElement(card, card.new));
      });
    }

    function getHandManualOrder(hand) {
      if (hand.length === 0) {
        return [];
      }

      hand = hand.filter(() => true); //copy array
      let orderOfCards = session.manualCardOrder.filter(() => true); //copy array
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

      $("#i-have-won").click(function() {
        if (session.hand.length !== 7) {
          session.won = true;
          alert("Great!\nPut a card back and everyone else can confirm you're the winner");
          return;
        }

        socket.emit('win');
      });
  });