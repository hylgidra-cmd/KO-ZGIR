/**
 * 4 KO'ZIR: OMON QOLISH — Core Game State Machine & Rules Engine
 * Flow:
 * 1. Table Suit Selection: All 4 players pick their suit (♦, ♠, ♥, ♣) on the table.
 * 2. 0-O'yin (Oddiy Durak):
 *    - 36 cards, 6 cards dealt to each player.
 *    - ONE trump card (openTrumpCard) is revealed face-up under the deck on the ground!
 *    - All 4 players play classic Durak with that SINGLE shared trump suit (sharedTrumpSuit).
 *    - Whoever wins 0-O'yin attacks first in 1-O'yin; whoever loses 0-O'yin deals 1-O'yin.
 * 3. 1+ O'yin (Asosiy Shaxsiy Ko'zirlar O'yini):
 *    - Bottom card on the ground is HIDDEN (ko'rinmaydi).
 *    - Each player uses the personal suit they chose at the beginning as their personal trump!
 *    - Loser of each round loses their personal trump card in order: 6 -> 7 -> 8 -> 9 -> 10 -> V -> D -> K -> T.
 *    - Cards are dealt sequentially (izma-iz: 6-6-6-5 -> 6-6-5-5 -> 6-5-5-5 -> 5-5-5-5) as the deck shrinks.
 */

const CardsRef = (typeof window !== 'undefined' && window.CardsAPI)
    ? window.CardsAPI
    : (typeof require !== 'undefined' ? require('./cards.js') : null);

const BOUT_PHASE = {
    SELECT_SUIT: 'SELECT_SUIT',           // On-table suit selection before starting 0-O'yin
    INITIAL_ATTACK: 'INITIAL_ATTACK',     // Primary attacker (Right of defender) leads first card
    DEFENSE: 'DEFENSE',                   // Defender must beat the active attack card or Take
    PRIMARY_PODKID: 'PRIMARY_PODKID',     // Primary attacker can throw matching rank or Pass
    SECONDARY_PODKID: 'SECONDARY_PODKID', // Left neighbor can throw matching rank or Pass (Primary is locked out!)
    ROUND_OVER: 'ROUND_OVER',
    GAME_OVER: 'GAME_OVER'
};

class FourTrumpsEngine {
    constructor() {
        this.resetTournament();
    }

    resetTournament() {
        this.players = [];
        this.eliminatedCards = new Set();
        this.roundNumber = 0; // 0 = Oddiy Durak (1 shared trump on ground), 1+ = Personal Trumps (hidden ground card)
        this.deck = [];
        this.openTrumpCard = null;   // Face-up card under the deck in 0-O'yin (Oddiy Durak)
        this.sharedTrumpSuit = null; // Shared trump suit in 0-O'yin

        this.bitaPile = [];
        this.tablePairs = [];

        this.dealerId = 3;
        this.primaryAttackerId = 0;
        this.defenderId = 1;
        this.secondaryAttackerId = 2;
        this.oppositeBlockedId = 3;

        this.primaryPassed = false;
        this.secondaryPassed = false;
        this.phase = BOUT_PHASE.SELECT_SUIT;

        this.roundWinnerId = null;
        this.roundFinishOrder = [];
        this.lastRoundLoserId = null;
        this.lastBurnedCard = null;
        this.tournamentWinnerId = null;

        this.lastDealDistribution = '6 - 6 - 6 - 6';
        this.lastDealDetails = [];
        this.totalCardsAtRoundStart = 36;

        this.logs = [];
    }

    /**
     * Step 1: Players choose their personal suits before 0-O'yin begins
     */
    setupPlayers(humanSuit = 'diamonds') {
        const allSuits = ['diamonds', 'spades', 'hearts', 'clubs'];
        const remainingSuits = allSuits.filter(s => s !== humanSuit);

        const botProfiles = [
            { seat: 1, posLabel: 'Chap taraf', name: 'Sardor' },
            { seat: 2, posLabel: "To'g'ri taraf", name: "Ulug'bek" },
            { seat: 3, posLabel: "O'ng taraf", name: "Jasur" }
        ];

        this.players = [
            {
                id: 0,
                seat: 0,
                name: 'Siz',
                posLabel: "Asosiy O'yinchi",
                isHuman: true,
                trumpSuit: humanSuit,
                hand: [],
                dealtCount: 0,
                lostTrumps: [],
                eliminated: false,
                outOfRound: false
            }
        ];

        for (let i = 0; i < 3; i++) {
            const suit = remainingSuits[i];
            this.players.push({
                id: i + 1,
                seat: botProfiles[i].seat,
                name: botProfiles[i].name,
                posLabel: botProfiles[i].posLabel,
                isHuman: false,
                trumpSuit: suit,
                hand: [],
                dealtCount: 0,
                lostTrumps: [],
                eliminated: false,
                outOfRound: false
            });
        }
    }

    /**
     * Helper to get the effective trump suit for `playerId` in the current round:
     * - In Round 0 (Oddiy Durak): Everyone uses `this.sharedTrumpSuit` (the face-up card on the ground)!
     * - In Round 1+ (Asosiy O'yin): Each player uses their own `player.trumpSuit`!
     */
    getEffectiveTrumpSuit(playerId) {
        if (this.roundNumber === 0 && this.sharedTrumpSuit) {
            return this.sharedTrumpSuit;
        }
        return this.players[playerId].trumpSuit;
    }

    addLog(message, type = 'info') {
        const time = new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        this.logs.unshift({ id: Date.now() + Math.random(), time, message, type });
        if (this.logs.length > 70) this.logs.pop();
    }

    getTournamentActivePlayers() {
        return this.players.filter(p => !p.eliminated);
    }

    getRoundActivePlayers() {
        return this.players.filter(p => !p.eliminated && !p.outOfRound);
    }

    getNextRoundPlayerId(fromPlayerId, excludeId = null) {
        for (let step = 1; step < 4; step++) {
            const nextId = (fromPlayerId + step) % 4;
            const p = this.players[nextId];
            if (!p.eliminated && !p.outOfRound && nextId !== excludeId && nextId !== fromPlayerId) {
                return nextId;
            }
        }
        return null;
    }

    /**
     * Starts a round:
     * - roundNum === 0: Oddiy Durak (36 cards, 6 each, 1 open trump card under the deck on the ground, lowest trump starts)
     * - roundNum >= 1: Main 4 Ko'zir Survival Game (bottom card hidden, personal trumps active, winner of previous round starts, loser deals)
     */
    startRound(roundNum, starterId = null, dealerId = null) {
        this.roundNumber = roundNum;
        this.tablePairs = [];
        this.bitaPile = [];
        this.roundWinnerId = null;
        this.roundFinishOrder = [];
        this.lastBurnedCard = null;

        this.deck = CardsRef.createDeck(this.eliminatedCards);
        this.totalCardsAtRoundStart = this.deck.length;

        for (const p of this.players) {
            p.hand = [];
            p.dealtCount = 0;
            p.outOfRound = p.eliminated;
        }

        const activePlayers = this.getTournamentActivePlayers();

        if (dealerId === null || this.players[dealerId].eliminated) {
            dealerId = activePlayers[activePlayers.length - 1].id;
        }
        this.dealerId = dealerId;

        // Clockwise dealing order starting from player after Dealer, ending with Dealer
        const dealOrderIds = [];
        for (let step = 1; step <= 4; step++) {
            const pid = (this.dealerId + step) % 4;
            if (!this.players[pid].eliminated) {
                dealOrderIds.push(pid);
            }
        }

        // IZMA-IZ TARQATISH: Deal 1 card at a time in 6 clockwise passes!
        for (let pass = 0; pass < 6; pass++) {
            for (const pid of dealOrderIds) {
                if (this.deck.length > 0) {
                    const player = this.players[pid];
                    player.hand.push(this.deck.pop());
                    player.dealtCount = player.hand.length;
                }
            }
        }

        // Record Izma-iz Dealing Distribution (e.g., "6 - 6 - 6 - 5")
        const distCounts = dealOrderIds.map(pid => this.players[pid].dealtCount);
        this.lastDealDistribution = distCounts.join(' - ');
        this.lastDealDetails = dealOrderIds.map(pid => ({
            id: pid,
            name: this.players[pid].name,
            count: this.players[pid].dealtCount
        }));

        // ROUND 0 (ODDIY DURAK): Reveal 1 face-up trump card at the bottom of the deck (index 0, since pop() draws from end)!
        if (roundNum === 0) {
            this.openTrumpCard = this.deck.length > 0 ? this.deck[0] : null;
            this.sharedTrumpSuit = this.openTrumpCard ? this.openTrumpCard.suit : 'diamonds';

            // In Oddiy Durak, find who has the lowest card of `sharedTrumpSuit` to start first!
            let lowestTrumpRank = 99;
            let lowestHolderId = 0;
            for (const p of activePlayers) {
                for (const c of p.hand) {
                    if (c.suit === this.sharedTrumpSuit && c.rank < lowestTrumpRank) {
                        lowestTrumpRank = c.rank;
                        lowestHolderId = p.id;
                    }
                }
            }
            starterId = lowestHolderId;
        } else {
            // ROUND 1+ (ASOSIY O'YIN): Bottom card is HIDDEN! Personal trumps are active!
            this.openTrumpCard = null;
            this.sharedTrumpSuit = null;
            if (starterId === null || this.players[starterId].eliminated) {
                starterId = activePlayers[0].id;
            }
        }

        for (const p of this.players) {
            this.sortPlayerHand(p);
            if (!p.eliminated && p.hand.length === 0) {
                p.outOfRound = true;
            }
        }

        this.setupBout(starterId);
    }

    sortPlayerHand(player) {
        const effTrump = this.getEffectiveTrumpSuit(player.id);
        player.hand.sort((a, b) => {
            const aTrump = a.suit === effTrump ? 1 : 0;
            const bTrump = b.suit === effTrump ? 1 : 0;
            if (aTrump !== bTrump) return aTrump - bTrump;
            if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
            return a.rank - b.rank;
        });
    }

    setupBout(attackerId) {
        this.tablePairs = [];
        this.primaryPassed = false;
        this.secondaryPassed = false;

        if (this.checkAndHandleRoundEnd()) {
            return;
        }

        let actualAttackerId = attackerId;
        if (this.players[actualAttackerId].outOfRound || this.players[actualAttackerId].eliminated) {
            actualAttackerId = this.getNextRoundPlayerId(actualAttackerId);
        }

        const defenderId = this.getNextRoundPlayerId(actualAttackerId);
        if (actualAttackerId === null || defenderId === null || actualAttackerId === defenderId) {
            this.checkAndHandleRoundEnd();
            return;
        }

        this.primaryAttackerId = actualAttackerId;
        this.defenderId = defenderId;

        const leftNeighborId = this.getNextRoundPlayerId(this.defenderId, this.primaryAttackerId);
        this.secondaryAttackerId = (leftNeighborId !== null && leftNeighborId !== this.primaryAttackerId && leftNeighborId !== this.defenderId)
            ? leftNeighborId
            : null;

        this.oppositeBlockedId = null;
        for (const p of this.players) {
            if (!p.eliminated && !p.outOfRound &&
                p.id !== this.primaryAttackerId &&
                p.id !== this.defenderId &&
                p.id !== this.secondaryAttackerId) {
                this.oppositeBlockedId = p.id;
            }
        }

        this.phase = BOUT_PHASE.INITIAL_ATTACK;
    }

    getCurrentTurnPlayerId() {
        switch (this.phase) {
            case BOUT_PHASE.INITIAL_ATTACK:
            case BOUT_PHASE.PRIMARY_PODKID:
                return this.primaryAttackerId;
            case BOUT_PHASE.DEFENSE:
                return this.defenderId;
            case BOUT_PHASE.SECONDARY_PODKID:
                return this.secondaryAttackerId;
            default:
                return null;
        }
    }

    getTableRanks() {
        const ranks = new Set();
        for (const pair of this.tablePairs) {
            if (pair.attack) ranks.add(pair.attack.rank);
            if (pair.defense) ranks.add(pair.defense.rank);
        }
        return ranks;
    }

    canAttackWithCard(playerId, card) {
        if (this.phase === BOUT_PHASE.INITIAL_ATTACK) {
            if (playerId !== this.primaryAttackerId) {
                return { valid: false, reason: "Hozir asosiy hujumchining navbati!" };
            }
            return { valid: true };
        }

        if (this.phase === BOUT_PHASE.PRIMARY_PODKID) {
            if (playerId !== this.primaryAttackerId) {
                if (playerId === this.oppositeBlockedId) {
                    return { valid: false, reason: "To'g'rida o'tirgan odam karta tashlay olmaydi!" };
                }
                return { valid: false, reason: "Avval o'ng tarafdagi hujumchi pas deyishi kerak!" };
            }
        } else if (this.phase === BOUT_PHASE.SECONDARY_PODKID) {
            if (playerId !== this.secondaryAttackerId) {
                if (playerId === this.primaryAttackerId) {
                    return { valid: false, reason: "Siz 'Pas' degansiz — endi qayta karta tashlay olmaysiz!" };
                }
                if (playerId === this.oppositeBlockedId) {
                    return { valid: false, reason: "To'g'rida o'tirgan odam karta tashlay olmaydi!" };
                }
                return { valid: false, reason: "Hozir chap tarafdagi o'yinchining navbati!" };
            }
        } else {
            return { valid: false, reason: "Hozir hujum qilish bosqichi emas!" };
        }

        const defender = this.players[this.defenderId];
        if (this.tablePairs.length >= 6) {
            return { valid: false, reason: "Bitta hujumda maksimal 6 ta karta tashlash mumkin!" };
        }
        if (defender.hand.length === 0) {
            return { valid: false, reason: "Himoyachining qo'lida karta qolmadi!" };
        }

        const tableRanks = this.getTableRanks();
        if (!tableRanks.has(card.rank)) {
            return {
                valid: false,
                reason: `Stolda «${card.label}» yo'q! Faqat stoldagi kartalarga mos karta tashlay olasiz.`
            };
        }

        return { valid: true };
    }

    /**
     * Checks if Defender can beat `attackCard` using `defenseCard`:
     * - In Round 0 (Oddiy Durak): `defTrump` is the single shared trump on the ground (`sharedTrumpSuit`).
     * - In Round 1+ (Asosiy O'yin): `defTrump` is Defender's personal chosen suit (`defender.trumpSuit`).
     */
    canBeatCard(defenderId, attackCard, defenseCard) {
        const defTrump = this.getEffectiveTrumpSuit(defenderId);

        // Case 1: Attack card is of Defender's effective trump suit
        if (attackCard.suit === defTrump) {
            if (defenseCard.suit !== defTrump) {
                return {
                    valid: false,
                    reason: `Ko'zirni (${attackCard.symbol}) faqat kattaroq ${attackCard.suitName} ko'ziri bilan kesa olasiz!`
                };
            }
            if (defenseCard.rank > attackCard.rank) {
                return { valid: true };
            }
            return {
                valid: false,
                reason: `${defenseCard.fullName} hujumdagi ${attackCard.fullName} dan kichik!`
            };
        }

        // Case 2: Attack card is NOT Defender's effective trump suit
        if (defenseCard.suit === attackCard.suit) {
            if (defenseCard.rank > attackCard.rank) {
                return { valid: true };
            }
            return {
                valid: false,
                reason: `${defenseCard.fullName} hujumdagi ${attackCard.fullName} dan kichik!`
            };
        }

        if (defenseCard.suit === defTrump) {
            return { valid: true };
        }

        const suitName = CardsRef.SUITS[defTrump].name;
        return {
            valid: false,
            reason: `Kesishtirish uchun kattaroq ${attackCard.suitName} yoki ko'zir (${suitName}) kerak!`
        };
    }

    playAttackCard(playerId, cardId) {
        const player = this.players[playerId];
        const cardIdx = player.hand.findIndex(c => c.id === cardId);
        if (cardIdx === -1) return { success: false, reason: 'Karta topilmadi!' };

        const card = player.hand[cardIdx];
        const check = this.canAttackWithCard(playerId, card);
        if (!check.valid) {
            return { success: false, reason: check.reason };
        }

        player.hand.splice(cardIdx, 1);
        this.tablePairs.push({
            attack: card,
            defense: null,
            thrownBy: playerId
        });

        this.checkPlayerOut(player);
        this.phase = BOUT_PHASE.DEFENSE;
        return { success: true, card };
    }

    playDefenseCard(defenderId, cardId) {
        if (this.phase !== BOUT_PHASE.DEFENSE || defenderId !== this.defenderId) {
            return { success: false, reason: 'Hozir sizning himoyalanish navbatingiz emas!' };
        }

        const openPair = this.tablePairs.find(p => p.defense === null);
        if (!openPair) {
            return { success: false, reason: "Stolda yopilmagan karta yo'q!" };
        }

        const defender = this.players[defenderId];
        const cardIdx = defender.hand.findIndex(c => c.id === cardId);
        if (cardIdx === -1) return { success: false, reason: 'Karta topilmadi!' };

        const defenseCard = defender.hand[cardIdx];
        const check = this.canBeatCard(defenderId, openPair.attack, defenseCard);
        if (!check.valid) {
            return { success: false, reason: check.reason };
        }

        defender.hand.splice(cardIdx, 1);
        openPair.defense = defenseCard;

        const defTrump = this.getEffectiveTrumpSuit(defenderId);
        const usedOwnTrump = defenseCard.suit === defTrump && openPair.attack.suit !== defTrump;

        this.checkPlayerOut(defender);

        if (defender.hand.length === 0 || this.tablePairs.length >= 6) {
            this.resolveBita();
            return { success: true, card: defenseCard, usedOwnTrump, bitaTriggered: true };
        }

        this.advanceToNextPodkidPhase();
        return { success: true, card: defenseCard, usedOwnTrump, bitaTriggered: false };
    }

    advanceToNextPodkidPhase() {
        const primary = this.players[this.primaryAttackerId];

        if (!this.primaryPassed && primary && primary.hand.length > 0 && !primary.outOfRound) {
            this.phase = BOUT_PHASE.PRIMARY_PODKID;
            return;
        }

        if (!this.primaryPassed) {
            this.primaryPassed = true;
        }

        if (this.secondaryAttackerId !== null) {
            const secondary = this.players[this.secondaryAttackerId];
            if (!this.secondaryPassed && secondary && secondary.hand.length > 0 && !secondary.outOfRound) {
                this.phase = BOUT_PHASE.SECONDARY_PODKID;
                return;
            }
        }

        this.resolveBita();
    }

    declarePass(playerId) {
        if (this.phase === BOUT_PHASE.PRIMARY_PODKID && playerId === this.primaryAttackerId) {
            this.primaryPassed = true;

            if (this.secondaryAttackerId !== null) {
                const secondary = this.players[this.secondaryAttackerId];
                if (secondary && !secondary.outOfRound && secondary.hand.length > 0) {
                    this.phase = BOUT_PHASE.SECONDARY_PODKID;
                    return { success: true, bita: false };
                }
            }

            this.resolveBita();
            return { success: true, bita: true };
        }

        if (this.phase === BOUT_PHASE.SECONDARY_PODKID && playerId === this.secondaryAttackerId) {
            this.secondaryPassed = true;
            this.resolveBita();
            return { success: true, bita: true };
        }

        return { success: false, reason: 'Hozir pas berish navbati sizda emas!' };
    }

    defenderTakesCards() {
        if (this.phase !== BOUT_PHASE.DEFENSE) {
            return { success: false, reason: 'Hozir kartani olish vaqti emas!' };
        }

        const defender = this.players[this.defenderId];
        for (const pair of this.tablePairs) {
            if (pair.attack) defender.hand.push(pair.attack);
            if (pair.defense) defender.hand.push(pair.defense);
        }

        defender.outOfRound = false;
        this.sortPlayerHand(defender);
        this.tablePairs = [];

        this.performDobor();

        if (this.checkAndHandleRoundEnd()) {
            return { success: true, roundEnded: true };
        }

        const nextAttackerId = this.getNextRoundPlayerId(this.defenderId);
        this.setupBout(nextAttackerId);
        return { success: true, roundEnded: false };
    }

    resolveBita() {
        for (const pair of this.tablePairs) {
            if (pair.attack) this.bitaPile.push(pair.attack);
            if (pair.defense) this.bitaPile.push(pair.defense);
        }
        this.tablePairs = [];

        this.performDobor();

        if (this.checkAndHandleRoundEnd()) {
            return;
        }

        this.setupBout(this.defenderId);
    }

    performDobor() {
        const order = [this.primaryAttackerId, this.secondaryAttackerId, this.defenderId].filter(
            (id, idx, arr) => id !== null && arr.indexOf(id) === idx
        );

        for (const pid of order) {
            const p = this.players[pid];
            if (p.eliminated) continue;
            let drawn = 0;
            while (p.hand.length < 6 && this.deck.length > 0) {
                p.hand.push(this.deck.pop());
                drawn++;
            }
            if (drawn > 0) {
                this.sortPlayerHand(p);
                p.outOfRound = false;
            }
            this.checkPlayerOut(p);
        }
    }

    checkPlayerOut(player) {
        if (this.deck.length === 0 && player.hand.length === 0 && !player.outOfRound && !player.eliminated) {
            player.outOfRound = true;
            this.roundFinishOrder.push(player.id);
            if (this.roundWinnerId === null) {
                this.roundWinnerId = player.id;
            }
        }
    }

    checkAndHandleRoundEnd() {
        if (this.deck.length > 0) return false;

        for (const p of this.players) {
            this.checkPlayerOut(p);
        }

        const remainingPlayers = this.players.filter(p => !p.eliminated && !p.outOfRound && p.hand.length > 0);
        if (remainingPlayers.length > 1) {
            return false;
        }

        this.phase = BOUT_PHASE.ROUND_OVER;

        let loser = remainingPlayers.length === 1 ? remainingPlayers[0] : this.players[this.defenderId];
        this.lastRoundLoserId = loser.id;

        if (this.roundWinnerId === null || this.roundWinnerId === loser.id) {
            const otherActive = this.getTournamentActivePlayers().find(p => p.id !== loser.id);
            this.roundWinnerId = otherActive ? otherActive.id : 0;
        }

        // Round 0 (Oddiy Durak) has no card elimination — it only determines Winner (starts Round 1) and Loser (deals Round 1)
        if (this.roundNumber === 0) {
            this.lastBurnedCard = null;
            return true;
        }

        // Round 1+: Eliminate loser's lowest remaining personal trump (6 -> 7 -> 8 -> 9 -> 10 -> V -> D -> K -> T)
        const allRanks = [6, 7, 8, 9, 10, 11, 12, 13, 14];
        const nextRankToBurn = allRanks.find(r => !loser.lostTrumps.includes(r));

        if (nextRankToBurn !== undefined) {
            loser.lostTrumps.push(nextRankToBurn);
            const burnedCardId = `${loser.trumpSuit}_${nextRankToBurn}`;
            this.eliminatedCards.add(burnedCardId);

            const rankInfo = CardsRef.RANKS.find(r => r.value === nextRankToBurn);
            const suitInfo = CardsRef.SUITS[loser.trumpSuit];

            const nextTotalCards = 36 - this.eliminatedCards.size;
            const activeAfter = this.players.filter(p => !p.eliminated && p.lostTrumps.length < 9).length;
            const nextDist = [];
            for (let i = 0; i < activeAfter; i++) nextDist.push(0);
            let rem = nextTotalCards;
            for (let pass = 0; pass < 6; pass++) {
                for (let i = 0; i < activeAfter; i++) {
                    if (rem > 0) {
                        nextDist[i]++;
                        rem--;
                    }
                }
            }

            this.lastBurnedCard = {
                id: burnedCardId,
                suit: loser.trumpSuit,
                suitName: suitInfo.name,
                symbol: suitInfo.symbol,
                color: suitInfo.color,
                rank: nextRankToBurn,
                label: rankInfo.label,
                fullName: `${suitInfo.name} ${rankInfo.fullName}`,
                loserName: loser.name,
                loserId: loser.id,
                remainingTrumps: 9 - loser.lostTrumps.length,
                nextTotalCards,
                nextDealPreview: nextDist.join(' - ')
            };

            if (loser.lostTrumps.length >= 9) {
                loser.eliminated = true;
            }
        }

        const survivors = this.getTournamentActivePlayers();
        if (survivors.length <= 1) {
            this.phase = BOUT_PHASE.GAME_OVER;
            this.tournamentWinnerId = survivors[0] ? survivors[0].id : 0;
        }

        return true;
    }

    serializeState() {
        return {
            roundNumber: this.roundNumber,
            phase: this.phase,
            openTrumpCard: this.openTrumpCard,
            sharedTrumpSuit: this.sharedTrumpSuit,
            dealerId: this.dealerId,
            primaryAttackerId: this.primaryAttackerId,
            defenderId: this.defenderId,
            secondaryAttackerId: this.secondaryAttackerId,
            oppositeBlockedId: this.oppositeBlockedId,
            deckCount: this.deck.length,
            deck: [...this.deck],
            bitaCount: this.bitaPile.length,
            bitaPile: [...this.bitaPile],
            lastDealDistribution: this.lastDealDistribution,
            tablePairs: this.tablePairs,
            roundWinnerId: this.roundWinnerId,
            lastRoundLoserId: this.lastRoundLoserId,
            lastBurnedCard: this.lastBurnedCard,
            tournamentWinnerId: this.tournamentWinnerId,
            eliminatedCards: Array.from(this.eliminatedCards),
            players: this.players.map(p => ({
                id: p.id,
                name: p.name,
                seat: p.seat,
                trumpSuit: p.trumpSuit,
                lostTrumps: [...p.lostTrumps],
                eliminated: p.eliminated,
                outOfRound: p.outOfRound,
                isHuman: p.isHuman,
                hand: [...p.hand]
            }))
        };
    }

    deserializeState(state) {
        if (!state) return;
        this.roundNumber = state.roundNumber;
        this.phase = state.phase;
        this.openTrumpCard = state.openTrumpCard;
        this.sharedTrumpSuit = state.sharedTrumpSuit;
        this.dealerId = state.dealerId;
        this.primaryAttackerId = state.primaryAttackerId;
        this.defenderId = state.defenderId;
        this.secondaryAttackerId = state.secondaryAttackerId;
        this.oppositeBlockedId = state.oppositeBlockedId;
        this.lastDealDistribution = state.lastDealDistribution;
        this.tablePairs = state.tablePairs || [];
        this.roundWinnerId = state.roundWinnerId;
        this.lastRoundLoserId = state.lastRoundLoserId;
        this.lastBurnedCard = state.lastBurnedCard;
        this.tournamentWinnerId = state.tournamentWinnerId;

        this.deck = state.deck ? [...state.deck] : (state.deckCount ? new Array(state.deckCount).fill({ suit: 'diamonds', rank: 6 }) : []);
        this.bitaPile = state.bitaPile ? [...state.bitaPile] : (state.bitaCount ? new Array(state.bitaCount).fill({ suit: 'diamonds', rank: 6 }) : []);

        if (state.eliminatedCards) {
            this.eliminatedCards = new Set(state.eliminatedCards);
        }

        if (state.players && state.players.length === 4) {
            this.players = state.players.map(p => ({
                id: p.id,
                name: p.name,
                seat: p.seat,
                trumpSuit: p.trumpSuit,
                lostTrumps: [...p.lostTrumps],
                eliminated: p.eliminated,
                outOfRound: p.outOfRound,
                isHuman: p.isHuman,
                hand: [...p.hand]
            }));
        }
    }
}

if (typeof window !== 'undefined') {
    window.FourTrumpsEngine = FourTrumpsEngine;
    window.BOUT_PHASE = BOUT_PHASE;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FourTrumpsEngine, BOUT_PHASE };
}
