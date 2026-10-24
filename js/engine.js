/**
 * 4 KO'ZIR: OMON QOLISH — Core Game State Machine & Rules Engine (Full-Stack Isomorphic: Browser + Node.js Backend)
 * Implements 100% of the Technical Specification (TZ):
 * - 4 Players sitting clockwise: Bottom (0: Siz), Left (1: Chapdagi), Top (2: To'g'ridagi), Right (3: O'ngdagi)
 * - Personal Trump Suits for each player
 * - Izma-iz Tarqatish (Sequential round-robin dealing): when cards < 24, deals 6-6-6-5 -> 6-6-5-5 -> 6-5-5-5 -> 5-5-5-5 ...
 * - Defense cutting rules (own trump vs other suits)
 * - Strict Podkidnoy chain: Right Neighbor -> Pass (locked!) -> Left Neighbor -> Pass -> Bita
 * - Opposite Neighbor (To'g'ridagi) strictly blocked from throwing cards
 * - Survival Elimination: Round loser loses their personal trump cards in sequence 6, 7, 8, 9, 10, V, D, K, T
 */

const CardsRef = (typeof window !== 'undefined' && window.CardsAPI)
    ? window.CardsAPI
    : (typeof require !== 'undefined' ? require('./cards.js') : null);

const BOUT_PHASE = {
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
        this.eliminatedCards = new Set(); // e.g., "diamonds_6", "diamonds_7"
        this.roundNumber = 0; // 0 = Qualification Round (0-Raund), 1+ = Survival Rounds
        this.deck = [];
        this.bitaPile = [];
        this.tablePairs = []; // Array of { attack: Card, defense: Card|null, thrownBy: playerId }

        this.dealerId = 3;
        this.primaryAttackerId = 0;
        this.defenderId = 1;
        this.secondaryAttackerId = 2;
        this.oppositeBlockedId = 3;

        this.primaryPassed = false;
        this.secondaryPassed = false;
        this.phase = BOUT_PHASE.INITIAL_ATTACK;

        this.roundWinnerId = null; // First player to empty hand in current round
        this.roundFinishOrder = [];
        this.lastRoundLoserId = null;
        this.lastBurnedCard = null;
        this.tournamentWinnerId = null;

        // Izma-iz tarqatish (6-6-6-5, 6-6-5-5, 6-5-5-5, 5-5-5-5) tracking
        this.lastDealDistribution = '6 - 6 - 6 - 6';
        this.lastDealDetails = [];
        this.totalCardsAtRoundStart = 36;

        this.logs = [];
    }

    /**
     * Initializes the 4 players around the table clockwise:
     * Seat 0 (Bottom): Human Player ("Siz")
     * Seat 1 (Left):   Chapdagi Bot (Soat mili bo'yicha Sizdan keyingi)
     * Seat 2 (Top):    To'g'ridagi Bot (Sizning ro'parangizda)
     * Seat 3 (Right):  O'ngdagi Bot (Soat mili bo'yicha Sizdan oldingi - Sizga hujum qiluvchi)
     */
    setupPlayers(humanSuit = 'diamonds') {
        const allSuits = ['diamonds', 'spades', 'hearts', 'clubs'];
        const remainingSuits = allSuits.filter(s => s !== humanSuit);

        const botProfiles = [
            { seat: 1, posLabel: 'Chap taraf', name: 'Sardor (Chapda)' },
            { seat: 2, posLabel: "To'g'ri taraf", name: "Ulug'bek (To'g'rida)" },
            { seat: 3, posLabel: "O'ng taraf", name: "Jasur (O'ngda)" }
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
                lostTrumps: [], // Array of ranks lost: [6, 7, ...]
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
     * Sets up a pre-configured late-game scenario where `burnCount` cards (default 13) have already been eliminated,
     * so the deck has 23 cards left and immediately deals 6 - 6 - 6 - 5 (then 6-6-5-5 -> 6-5-5-5 -> 5-5-5-5)!
     */
    setupLateGameScenario(humanSuit = 'diamonds', burnCount = 13) {
        this.resetTournament();
        this.setupPlayers(humanSuit);

        // Distribute `burnCount` losses across the 4 players (e.g. for 13: 3, 3, 4, 3 losses)
        const ranksOrder = [6, 7, 8, 9, 10, 11, 12, 13, 14];
        let burnedSoFar = 0;
        let pIdx = 1; // Start burning from bots first so everyone still has trumps left
        while (burnedSoFar < burnCount) {
            const player = this.players[pIdx % 4];
            const nextRank = ranksOrder.find(r => !player.lostTrumps.includes(r));
            if (nextRank !== undefined && player.lostTrumps.length < 8) {
                player.lostTrumps.push(nextRank);
                this.eliminatedCards.add(`${player.trumpSuit}_${nextRank}`);
                burnedSoFar++;
            }
            pIdx++;
            if (pIdx > 100) break;
        }

        this.addLog(`🧪 MAXSUS REJIM: O'yindan ${burnedSoFar} ta ko'zir chiqarildi (Kolodada ${36 - burnedSoFar} ta karta qoldi).`, 'burn');
        this.startRound(burnedSoFar + 1, 0, 3);
    }

    addLog(message, type = 'info') {
        const time = new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        this.logs.unshift({ id: Date.now() + Math.random(), time, message, type });
        if (this.logs.length > 70) this.logs.pop();
    }

    /**
     * Returns active (non-eliminated from tournament) players in clockwise order
     */
    getTournamentActivePlayers() {
        return this.players.filter(p => !p.eliminated);
    }

    /**
     * Returns players who still have cards in the current round
     */
    getRoundActivePlayers() {
        return this.players.filter(p => !p.eliminated && !p.outOfRound);
    }

    /**
     * Finds the next player clockwise among players still active in the current round
     */
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
     * Starts a round with strict IZMA-IZ (Sequential Round-Robin) card dealing!
     * When total cards < 24:
     * - 23 cards (13 eliminated): 6 - 6 - 6 - 5
     * - 22 cards (14 eliminated): 6 - 6 - 5 - 5
     * - 21 cards (15 eliminated): 6 - 5 - 5 - 5
     * - 20 cards (16 eliminated): 5 - 5 - 5 - 5
     * - 19 cards (17 eliminated): 5 - 5 - 5 - 4 ... and so on!
     */
    startRound(roundNum, starterId = null, dealerId = null) {
        this.roundNumber = roundNum;
        this.tablePairs = [];
        this.bitaPile = [];
        this.roundWinnerId = null;
        this.roundFinishOrder = [];
        this.lastBurnedCard = null;

        // Build deck excluding permanently burned trump cards
        this.deck = CardsRef.createDeck(this.eliminatedCards);
        this.totalCardsAtRoundStart = this.deck.length;

        // Reset player round state
        for (const p of this.players) {
            p.hand = [];
            p.dealtCount = 0;
            p.outOfRound = p.eliminated;
        }

        const activePlayers = this.getTournamentActivePlayers();

        // Determine starter and dealer
        if (starterId === null) {
            starterId = activePlayers[0].id;
        }
        if (dealerId === null) {
            dealerId = activePlayers[activePlayers.length - 1].id;
        }

        if (this.players[starterId].eliminated) {
            starterId = activePlayers[0].id;
        }
        if (this.players[dealerId].eliminated) {
            dealerId = activePlayers[activePlayers.length - 1].id;
        }

        this.dealerId = dealerId;

        // Determine clockwise dealing order starting from player after Dealer, ending with Dealer
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

        // Record the exact Izma-iz Dealing Distribution (e.g., "6 - 6 - 6 - 5")
        const distCounts = dealOrderIds.map(pid => this.players[pid].dealtCount);
        this.lastDealDistribution = distCounts.join(' - ');
        this.lastDealDetails = dealOrderIds.map(pid => ({
            id: pid,
            name: this.players[pid].name,
            count: this.players[pid].dealtCount
        }));

        // Sort hands and check if anyone got 0 cards
        for (const p of this.players) {
            this.sortPlayerHand(p);
            if (!p.eliminated && p.hand.length === 0) {
                p.outOfRound = true;
            }
        }

        const roundTitle = roundNum === 0
            ? "0-RAUND (Saralash: G'olib keyingi o'yinni boshlaydi, mag'lub tarqatadi)"
            : `${roundNum}-RAUND (Jami ${this.totalCardsAtRoundStart} ta karta | ${this.eliminatedCards.size} ta chiqqan)`;

        const detailStr = this.lastDealDetails.map(d => `${d.name}: ${d.count} ta`).join(', ');
        this.addLog(`━━━ ${roundTitle} ━━━`, 'round');
        this.addLog(
            `🃏 Izma-iz tarqatish (${this.lastDealDistribution}): [${detailStr}]. Yerdagi kolodada: ${this.deck.length} ta karta.`,
            this.totalCardsAtRoundStart < 24 ? 'trump' : 'info'
        );

        this.setupBout(starterId);
    }

    getTotalHandCards() {
        return this.players.reduce((sum, p) => sum + p.hand.length, 0);
    }

    /**
     * Sorts a player's hand: non-trumps by suit & rank first, personal trumps on the right sorted by rank
     */
    sortPlayerHand(player) {
        player.hand.sort((a, b) => {
            const aTrump = a.suit === player.trumpSuit ? 1 : 0;
            const bTrump = b.suit === player.trumpSuit ? 1 : 0;
            if (aTrump !== bTrump) return aTrump - bTrump;
            if (a.suit !== b.suit) return a.suit.localeCompare(b.suit);
            return a.rank - b.rank;
        });
    }

    /**
     * Sets up a new Bout (Hujum to'qnashuvi) starting with attackerId attacking next clockwise active player
     */
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

        // Determine Left neighbor of Defender (Clockwise after Defender)
        const leftNeighborId = this.getNextRoundPlayerId(this.defenderId, this.primaryAttackerId);
        this.secondaryAttackerId = (leftNeighborId !== null && leftNeighborId !== this.primaryAttackerId && leftNeighborId !== this.defenderId)
            ? leftNeighborId
            : null;

        // Determine Opposite player (To'g'ridagi odam) — anyone active who is neither Primary, Defender, nor Secondary
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

        const attName = this.players[this.primaryAttackerId].name;
        const defName = this.players[this.defenderId].name;
        this.addLog(`⚔️ Navbat: ${attName} ➡️ ${defName} ga hujum qiladi.`, 'turn');
    }

    /**
     * Returns whose turn it currently is to act
     */
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

    /**
     * Returns all distinct card ranks currently visible on the table
     */
    getTableRanks() {
        const ranks = new Set();
        for (const pair of this.tablePairs) {
            if (pair.attack) ranks.add(pair.attack.rank);
            if (pair.defense) ranks.add(pair.defense.rank);
        }
        return ranks;
    }

    /**
     * Checks if an attacker (Primary or Secondary) can throw `card` right now
     */
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
                    return { valid: false, reason: "Siz himoyachining to'g'risida o'tiribsiz — karta tashlay olmaysiz!" };
                }
                return { valid: false, reason: "Avval o'ng tarafdagi hujumchi pas deyishi kerak!" };
            }
        } else if (this.phase === BOUT_PHASE.SECONDARY_PODKID) {
            if (playerId !== this.secondaryAttackerId) {
                if (playerId === this.primaryAttackerId) {
                    return { valid: false, reason: "Siz 'Pas' degansiz — endi qayta karta tashlay olmaysiz!" };
                }
                if (playerId === this.oppositeBlockedId) {
                    return { valid: false, reason: "Siz himoyachining to'g'risida o'tiribsiz — karta tashlay olmaysiz!" };
                }
                return { valid: false, reason: "Hozir chap tarafdagi o'yinchining podkid navbati!" };
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
                reason: `Stolda «${card.label}» nominalidagi karta yo'q! Faqat stoldagi kartalarga mos karta tashlay olasiz.`
            };
        }

        return { valid: true };
    }

    /**
     * Checks if Defender can beat `attackCard` using `defenseCard` according to the exact Personal Trump rules
     */
    canBeatCard(defenderId, attackCard, defenseCard) {
        const defender = this.players[defenderId];
        const defTrump = defender.trumpSuit;

        // Case 1: Attack card is Defender's OWN personal trump suit!
        if (attackCard.suit === defTrump) {
            if (defenseCard.suit !== defTrump) {
                return {
                    valid: false,
                    reason: `Bu sizning shaxsiy ko'ziringiz (${attackCard.symbol})! Uni faqat kattaroq ${attackCard.suitName} bilan kesa olasiz.`
                };
            }
            if (defenseCard.rank > attackCard.rank) {
                return { valid: true };
            }
            return {
                valid: false,
                reason: `${defenseCard.fullName} hujumdagi ${attackCard.fullName} dan kichik! Kattaroq ko'zir kerak yoki ko'taring.`
            };
        }

        // Case 2: Attack card is NOT Defender's personal trump suit
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
            return { valid: true }; // Personal trump cuts any other suit!
        }

        const suitName = CardsRef.SUITS[defTrump].name;
        return {
            valid: false,
            reason: `Kesishtirish uchun kattaroq ${attackCard.suitName} yoki shaxsiy ko'ziringiz (${suitName}) kerak!`
        };
    }

    /**
     * Executes an attack or podkid move by `playerId` with `cardId`
     */
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

        const isPodkid = this.tablePairs.length > 1;
        const actionWord = isPodkid ? 'podkid tashladi' : 'yurdi';
        this.addLog(`🃏 ${player.name} [${card.label}${card.symbol}] bilan ${actionWord}.`, 'attack');

        this.phase = BOUT_PHASE.DEFENSE;
        return { success: true, card };
    }

    /**
     * Executes a defense move by `defenderId` with `cardId` against the current unbeaten attack card
     */
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

        const usedOwnTrump = defenseCard.suit === defender.trumpSuit && openPair.attack.suit !== defender.trumpSuit;
        this.addLog(
            `🛡️ ${defender.name} [${openPair.attack.label}${openPair.attack.symbol}] ni [${defenseCard.label}${defenseCard.symbol}] ${usedOwnTrump ? "(SHAXSIY KO'ZIR!)" : ''} bilan kesdi!`,
            usedOwnTrump ? 'trump' : 'defense'
        );

        this.checkPlayerOut(defender);

        if (defender.hand.length === 0 || this.tablePairs.length >= 6) {
            this.resolveBita();
            return { success: true, card: defenseCard, usedOwnTrump, bitaTriggered: true };
        }

        this.advanceToNextPodkidPhase();
        return { success: true, card: defenseCard, usedOwnTrump, bitaTriggered: false };
    }

    /**
     * Determines which attacker gets to podkid after Defender beats a card
     */
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

    /**
     * Current attacker declares "PAS / Boshqa karta yo'q"
     */
    declarePass(playerId) {
        if (this.phase === BOUT_PHASE.PRIMARY_PODKID && playerId === this.primaryAttackerId) {
            this.primaryPassed = true;
            this.addLog(`✋ ${this.players[playerId].name} (O'ng taraf): «Menda boshqa yo'q (Pas)» — endi qayta yura olmaydi!`, 'pass');

            if (this.secondaryAttackerId !== null) {
                const secondary = this.players[this.secondaryAttackerId];
                if (secondary && !secondary.outOfRound && secondary.hand.length > 0) {
                    this.phase = BOUT_PHASE.SECONDARY_PODKID;
                    this.addLog(`👉 Navbat ${secondary.name} (Chap taraf) ga o'tdi! Stoldagi kartalarga mos podkid tashlashi mumkin.`, 'turn');
                    return { success: true, bita: false };
                }
            }

            this.resolveBita();
            return { success: true, bita: true };
        }

        if (this.phase === BOUT_PHASE.SECONDARY_PODKID && playerId === this.secondaryAttackerId) {
            this.secondaryPassed = true;
            this.addLog(`✋ ${this.players[playerId].name} (Chap taraf): «Menda ham boshqa yo'q (Bita!)»`, 'pass');
            this.resolveBita();
            return { success: true, bita: true };
        }

        return { success: false, reason: 'Hozir pas berish navbati sizda emas!' };
    }

    /**
     * Defender decides to take all cards on the table ("Ko'tarish / Olish")
     */
    defenderTakesCards() {
        if (this.phase !== BOUT_PHASE.DEFENSE) {
            return { success: false, reason: 'Hozir kartani olish vaqti emas!' };
        }

        const defender = this.players[this.defenderId];
        const takenCards = [];
        for (const pair of this.tablePairs) {
            if (pair.attack) takenCards.push(pair.attack);
            if (pair.defense) takenCards.push(pair.defense);
        }

        defender.hand.push(...takenCards);
        defender.outOfRound = false;
        this.sortPlayerHand(defender);

        this.addLog(`📥 ${defender.name} stoldagi ${takenCards.length} ta kartani ko'tardi (oldi)!`, 'take');

        this.tablePairs = [];

        this.performDobor();

        if (this.checkAndHandleRoundEnd()) {
            return { success: true, roundEnded: true };
        }

        const nextAttackerId = this.getNextRoundPlayerId(this.defenderId);
        this.setupBout(nextAttackerId);
        return { success: true, roundEnded: false };
    }

    /**
     * Resolves Bita (All cards on table are beaten and cleared)
     */
    resolveBita() {
        for (const pair of this.tablePairs) {
            if (pair.attack) this.bitaPile.push(pair.attack);
            if (pair.defense) this.bitaPile.push(pair.defense);
        }
        const count = this.tablePairs.length * 2;
        this.tablePairs = [];

        this.addLog(`✨ BITA! Stoldagi ${count} ta karta yopilib chetga olindi.`, 'bita');

        this.performDobor();

        if (this.checkAndHandleRoundEnd()) {
            return;
        }

        this.setupBout(this.defenderId);
    }

    /**
     * Draws cards from the closed talon up to 6 cards per player in strict order:
     * 1. Primary Attacker
     * 2. Secondary Attacker
     * 3. Defender
     */
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

    /**
     * Checks if a player has emptied their hand when the deck is empty
     */
    checkPlayerOut(player) {
        if (this.deck.length === 0 && player.hand.length === 0 && !player.outOfRound && !player.eliminated) {
            player.outOfRound = true;
            this.roundFinishOrder.push(player.id);
            if (this.roundWinnerId === null) {
                this.roundWinnerId = player.id;
                this.addLog(`🏆 ${player.name} kartalarini birinchi bo'lib tugatdi! (Keyingi raundni boshlaydi)`, 'win');
            } else {
                this.addLog(`✅ ${player.name} kartalarini tugatib raunddan qutuldi!`, 'info');
            }
        }
    }

    /**
     * Checks if the round is over (only 1 or 0 players left with cards when deck is empty)
     */
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

        let loser = null;
        if (remainingPlayers.length === 1) {
            loser = remainingPlayers[0];
        } else {
            loser = this.players[this.defenderId];
        }

        this.lastRoundLoserId = loser.id;
        if (this.roundWinnerId === null || this.roundWinnerId === loser.id) {
            const otherActive = this.getTournamentActivePlayers().find(p => p.id !== loser.id);
            this.roundWinnerId = otherActive ? otherActive.id : 0;
        }

        if (this.roundNumber === 0) {
            this.lastBurnedCard = null;
            this.addLog(
                `🏁 0-Raund yakunlandi! G'olib: ${this.players[this.roundWinnerId].name} (1-raundni boshlaydi). Mag'lub: ${loser.name} (Diler bo'lib tarqatadi).`,
                'round'
            );
            return true;
        }

        // SURVIVAL PENALTY: Eliminate the loser's lowest remaining personal trump card (6 -> 7 -> 8 -> 9 -> 10 -> V -> D -> K -> T)
        const allRanks = [6, 7, 8, 9, 10, 11, 12, 13, 14];
        const nextRankToBurn = allRanks.find(r => !loser.lostTrumps.includes(r));

        if (nextRankToBurn !== undefined) {
            loser.lostTrumps.push(nextRankToBurn);
            const burnedCardId = `${loser.trumpSuit}_${nextRankToBurn}`;
            this.eliminatedCards.add(burnedCardId);

            const rankInfo = CardsRef.RANKS.find(r => r.value === nextRankToBurn);
            const suitInfo = CardsRef.SUITS[loser.trumpSuit];

            // Compute what the NEXT round's Izma-iz dealing distribution will be!
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

            this.addLog(
                `🔥 JAZO! ${loser.name} yutqazdi! Uning [${rankInfo.label}${suitInfo.symbol}] ko'ziri o'yindan CHIQARILDI! Keyingi raund tarqatilishi: ${nextDist.join(' - ')}`,
                'burn'
            );

            if (loser.lostTrumps.length >= 9) {
                loser.eliminated = true;
                this.addLog(`💀 ${loser.name} barcha 9 ta ko'zirini (6 dan Tuzgacha) yo'qotdi va O'YINDAN CHETLATILDI!`, 'burn');
            }
        }

        const survivors = this.getTournamentActivePlayers();
        if (survivors.length <= 1) {
            this.phase = BOUT_PHASE.GAME_OVER;
            this.tournamentWinnerId = survivors[0] ? survivors[0].id : 0;
            this.addLog(`👑 MUTLAQ G'OLIB: ${this.players[this.tournamentWinnerId].name} barcha raqiblarni yengib chempion bo'ldi!`, 'win');
        }

        return true;
    }

    /**
     * Serializes full engine state for Backend REST API & Database persistence
     */
    serializeState() {
        return {
            roundNumber: this.roundNumber,
            phase: this.phase,
            dealerId: this.dealerId,
            primaryAttackerId: this.primaryAttackerId,
            defenderId: this.defenderId,
            secondaryAttackerId: this.secondaryAttackerId,
            oppositeBlockedId: this.oppositeBlockedId,
            primaryPassed: this.primaryPassed,
            secondaryPassed: this.secondaryPassed,
            deckCount: this.deck.length,
            bitaCount: this.bitaPile.length,
            totalCardsAtRoundStart: this.totalCardsAtRoundStart,
            eliminatedCards: Array.from(this.eliminatedCards),
            lastDealDistribution: this.lastDealDistribution,
            lastDealDetails: this.lastDealDetails,
            tablePairs: this.tablePairs,
            roundWinnerId: this.roundWinnerId,
            lastRoundLoserId: this.lastRoundLoserId,
            lastBurnedCard: this.lastBurnedCard,
            tournamentWinnerId: this.tournamentWinnerId,
            players: this.players.map(p => ({
                id: p.id,
                seat: p.seat,
                name: p.name,
                posLabel: p.posLabel,
                isHuman: p.isHuman,
                trumpSuit: p.trumpSuit,
                handCount: p.hand.length,
                hand: p.hand,
                dealtCount: p.dealtCount,
                lostTrumps: p.lostTrumps,
                eliminated: p.eliminated,
                outOfRound: p.outOfRound
            })),
            logs: this.logs.slice(0, 30)
        };
    }
}

if (typeof window !== 'undefined') {
    window.FourTrumpsEngine = FourTrumpsEngine;
    window.BOUT_PHASE = BOUT_PHASE;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FourTrumpsEngine, BOUT_PHASE };
}
