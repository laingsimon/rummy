module.exports.Player = class Player {
    constructor(id, name, hand, socket) {
        this.id = id;
        this.name = name;
        this.hand = hand;
        this.socket = socket;
        this.adminToken =  {};
        this.won = false;
    }

    administerGame = (game, func) => {
        func.apply(game, [ this.adminToken[game] ]);
    }

    setName = (name) => {
        this.name = name;
    }

    yourTurn = (game, token) => {
        this.won = false;
        this.socket.emit('your-turn', token);
    }

    setAdminToken = (game, token) => {
        this.adminToken[game] = token;
    }

    notifyInGame = (game) => {
        let socket = this.socket;
        let me = this;
        let setWon = (function(value) { this.won = value }).bind(this);
        socket.join(game.id);
        socket.emit('joined', game.id);
        
        this.socket.on('take_face_up', function(token) {
            if (token !== game.playerToken || me.hand.length !== 7) {
                console.log('not right token or already has more than 7 cards');
                return;
            }

            const card = game.takeCardFromFaceUp();
            me.hand = me.hand.concat([ card ]);
            card.new = true;
            socket.emit('hand', me.hand);
        });

        this.socket.on('take_face_down', function(token) {
            if (token !== game.playerToken || me.hand.length !== 7) {
                return;
            }

            const card = game.takeCardFromDeck();
            me.hand = me.hand.concat([ card ]);
            card.new = true;
            socket.emit('hand', me.hand);
        });

        this.socket.on('return_card', function(data) {
            if (data.token !== game.playerToken || me.hand.length === 7) {
                return;
            }

            const returnSuit = Object.keys(data.card)[0];
            const returnValue = data.card[returnSuit];


            me.hand = me.hand.filter(card => {
                if (!card[returnSuit]) {
                    return true; //different suit
                }

                return card[returnSuit] != returnValue;
            });

            game.returnCardFaceUp(data.card);
            me.hand.forEach(card => delete card.new);
            socket.emit('hand', me.hand);
            game.moveToNextPlayer();
        });

        this.socket.on('win', function() {
            game.notifyWinner(me, me.hand);
            setWon(true);
        });

        this.socket.on('agree_winner', function(winner_id) {
            game.agreeWinner(me, winner_id);
        })
    }

    getHand = () => {
        if (!this.won) {
            throw new Error('You cannot see my hand until i have won!');
        }

        return this.hand;
    }

    setHand = (hand) => {
        this.hand = hand;
        this.socket.emit('hand', hand);
    }

    getOverview = () => {
        return {
            id: this.id,
            name: this.name
        }
    }
}