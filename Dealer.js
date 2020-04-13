const { Random } = require('./Random.js');

module.exports.Dealer = class Dealer {
    random = new Random();

    deal = (noOfPlayers, noOfCards, noToReserve) => {
        let cards = this.getCards(this.getNoOfDecks(noOfCards, noOfPlayers, noToReserve));
        let shuffled = this.shuffle(cards);

        let hands = {};

        while (noToReserve > 0) {
            if (!hands.reserved) {
                hands.reserved = [];
            }

            hands.reserved.push(shuffled.shift());
        }

        for (let round = 0; round < noOfCards; round++) {
            for (let player = 0; player < noOfPlayers; player++) {
                if (!hands[player]) {
                    hands[player] = [];
                }

                const card = shuffled.shift();
                hands[player] = hands[player].concat([ card ]);
            }
        }

        hands.remaining = shuffled;

        return hands;
    }

    getNoOfDecks = (noOfCards, noOfPlayers, noToReserve) => {
        let toDeal = noToReserve + (noOfCards * noOfPlayers);
        let decks = 0;
        if (toDeal > 0 && toDeal < 52) {
            decks++;
            toDeal -= 52;
        }

        return decks;
    }

    shuffle = (cards) => {
        let shuffled = [];

        while (cards.length > 0) {
            let randomCardIndex = this.random.next(0, cards.length - 1);
            let card = cards[randomCardIndex];
            shuffled.push(card);
            
            cards.splice(randomCardIndex, 1);
        }

        return shuffled;
    }

    getCards = (noOfDecks) => {
        let cards = [];

        for (let deck = 1; deck <= noOfDecks; deck++) {
            cards = cards.concat(this.getDeck());
        }

        return cards;
    }

    getDeck = () => {
        const cards = [ 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K' ];
        const suits = [ 'clubs', 'hearts', 'spades', 'diamonds' ];

        let deck = [];

        for (let suitIndex = 0; suitIndex < suits.length; suitIndex++) {
            const suit = suits[suitIndex];
            
            for (let cardIndex = 0; cardIndex < cards.length; cardIndex++) {
                const card = cards[cardIndex];
                let theCard = {};
                theCard[suit] = card;
                deck.push(theCard);
            }
        }

        return deck;
    }
}
