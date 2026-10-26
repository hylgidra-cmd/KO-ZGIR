/**
 * 4 KO'ZIR — On-Table Suit Picker -> Round 0 (Oddiy Durak with 1 open trump on ground) -> Round 1+ (Personal Trumps)
 */

const API_BASE = window.location.protocol.startsWith('http')
    ? window.location.origin
    : 'http://localhost:3000';

class GameUI {
    constructor() {
        this.engine = new window.FourTrumpsEngine();
        this.selectedSuit = 'diamonds';
        this.botTimer = null;
        this.particles = [];
        this.particleCanvas = null;
        this.particleCtx = null;

        this.initDOMReferences();
        this.bindEvents();
        this.initParticleCanvas();

        if (typeof window.MultiplayerManager !== 'undefined') {
            this.multiplayer = new window.MultiplayerManager(this);
        }

        this.showTableSuitPicker();
    }

    getMySeatId() {
        if (this.multiplayer && this.multiplayer.isGuest) {
            return this.multiplayer.mySeatId;
        }
        return 0;
    }

    isSeatOccupiedByHuman(seatId) {
        if (seatId === 0) return true;
        if (this.multiplayer && this.multiplayer.playerSlots && this.multiplayer.playerSlots[seatId]) {
            return this.multiplayer.playerSlots[seatId].isConnected && !this.multiplayer.playerSlots[seatId].isBot;
        }
        return false;
    }

    initDOMReferences() {
        this.elRoundBadge = document.getElementById('hud-round-badge');
        this.elTurnBanner = document.getElementById('turn-status-banner');

        this.elSuitPicker = document.getElementById('on-table-suit-picker');
        this.elOpenGroundTrump = document.getElementById('open-ground-trump');
        this.elTalonStack = document.getElementById('talon-stack');
        this.elTalonLabel = document.getElementById('talon-label-text');
        this.elBitaStack = document.getElementById('bita-stack');
        this.elBitaCount = document.getElementById('bita-count-badge');
        this.elBattlePairs = document.getElementById('battle-pairs-grid');
        this.elTableCenterHint = document.getElementById('table-center-hint');

        this.btnPass = document.getElementById('btn-action-pass');
        this.btnTake = document.getElementById('btn-action-take');
        this.btnFastFinish = document.getElementById('btn-fast-finish-round');

        this.modalRoundEnd = document.getElementById('modal-round-end');
        this.modalRules = document.getElementById('modal-rules');

        this.elToastContainer = document.getElementById('toast-container');
    }

    bindEvents() {
        // Clicking one of the 4 suit cards directly on the table
        document.querySelectorAll('.table-pick-card').forEach(cardEl => {
            cardEl.addEventListener('click', (e) => {
                window.soundFX.init();
                window.soundFX.playCardPlace(true);
                this.selectedSuit = cardEl.dataset.suit;
                this.spawnBurstParticles(e.clientX, e.clientY, '#ecc94b', 24);
                this.startWithChosenSuit(this.selectedSuit);
            });
        });

        this.btnPass.addEventListener('click', () => this.onHumanPass());
        this.btnTake.addEventListener('click', () => this.onHumanTake());
        this.btnFastFinish.addEventListener('click', () => this.onFastFinishCurrentRound());

        document.getElementById('btn-open-rules').addEventListener('click', () => {
            window.soundFX.playPass();
            this.modalRules.classList.remove('hidden');
        });
        document.getElementById('btn-close-rules').addEventListener('click', () => {
            this.modalRules.classList.add('hidden');
        });

        document.getElementById('btn-toggle-sound').addEventListener('click', (e) => {
            const muted = window.soundFX.toggleMute();
            e.currentTarget.innerHTML = muted ? '🔇' : '🔊';
        });

        document.getElementById('btn-new-game-top').addEventListener('click', () => {
            if (this.botTimer) clearTimeout(this.botTimer);
            this.modalRoundEnd.classList.add('hidden');
            this.showTableSuitPicker();
        });

        document.getElementById('btn-next-round').addEventListener('click', () => {
            window.soundFX.playCardDeal();
            this.modalRoundEnd.classList.add('hidden');
            this.proceedToNextRound();
        });
    }

    /**
     * Step 1: Displays the 4 suit cards directly on the center of the green table (No popup!)
     */
    showTableSuitPicker() {
        if (this.botTimer) clearTimeout(this.botTimer);
        this.engine.resetTournament();

        this.elRoundBadge.textContent = '1-Qadam: Masta Tanlash';
        this.elTurnBanner.textContent = "Stoldagi 4 ta kartadan o'zingizga masta tanlang";

        this.elSuitPicker.classList.remove('hidden');
        this.elTableCenterHint.classList.add('hidden');
        this.elBattlePairs.innerHTML = '';
        this.btnFastFinish.classList.add('hidden');

        this.elOpenGroundTrump.classList.add('hidden');
        this.elTalonStack.classList.remove('empty-pile');
        this.elTalonStack.innerHTML = `<div class="talon-layer"></div><div class="talon-secret-lock">36 KARTA</div>`;
        this.elTalonLabel.innerHTML = `Koloda: <strong>36</strong>`;

        this.elBitaStack.classList.add('empty-pile');
        this.elBitaCount.textContent = '0';

        const humanContainer = document.getElementById('human-hand-cards');
        if (humanContainer) humanContainer.innerHTML = '';

        this.btnPass.disabled = true;
        this.btnTake.disabled = true;

        for (let s = 0; s < 4; s++) {
            const seatEl = document.getElementById(`player-seat-${s}`);
            if (!seatEl) continue;
            seatEl.classList.remove('active-turn-seat', 'eliminated-seat');
            const badge = seatEl.querySelector('.seat-trump-badge');
            if (badge) badge.textContent = 'Masta tanlanmoqda...';
            const role = seatEl.querySelector('.seat-role-pill');
            if (role) { role.className = 'seat-role-pill'; role.textContent = ''; }
            const cnt = seatEl.querySelector('.seat-card-count');
            if (cnt) cnt.textContent = '';
            const burn = seatEl.querySelector('.trump-NextBurn');
            if (burn) burn.textContent = '';
            const fan = seatEl.querySelector('.bot-card-fan');
            if (fan) fan.innerHTML = '';
        }
    }

    /**
     * Step 2: Human picked their suit on the table -> Other 3 players get remaining suits -> Start 0-O'yin (Oddiy Durak)!
     */
    startWithChosenSuit(suit) {
        this.elSuitPicker.classList.add('hidden');
        this.btnFastFinish.classList.remove('hidden');

        this.engine.resetTournament();
        this.engine.setupPlayers(suit);
        // Start Round 0: Classic Durak with 1 open trump card on the ground!
        this.engine.startRound(0);

        const openCard = this.engine.openTrumpCard;
        const starter = this.engine.players[this.engine.primaryAttackerId];
        if (openCard) {
            this.showToast(
                `Masta tanlandi! Boshlang'ich Oddiy Durak: Yerdagi umumiy ko'zir — ${openCard.symbol} ${openCard.suitName}. ${starter.name} birinchi yuradi!`
            );
        }

        this.renderAll();
        if (this.multiplayer && this.multiplayer.isHost) {
            this.multiplayer.broadcastState();
        }
        this.scheduleBotTurnIfNeeded();
    }

    /**
     * Fast-forwards the current round using real AI moves so the user can test transitioning from 0-O'yin to 1-O'yin anytime
     */
    onFastFinishCurrentRound() {
        if (this.engine.phase === window.BOUT_PHASE.SELECT_SUIT) return;
        if (this.botTimer) clearTimeout(this.botTimer);

        let safety = 0;
        while (
            this.engine.phase !== window.BOUT_PHASE.ROUND_OVER &&
            this.engine.phase !== window.BOUT_PHASE.GAME_OVER &&
            safety < 2000
        ) {
            safety++;
            const turnId = this.engine.getCurrentTurnPlayerId();
            if (turnId === null) break;
            const move = window.BotAI.decideMove(this.engine, turnId);
            if (!move) break;

            if (move.action === 'attack') this.engine.playAttackCard(turnId, move.cardId);
            else if (move.action === 'defend') this.engine.playDefenseCard(turnId, move.cardId);
            else if (move.action === 'pass') this.engine.declarePass(turnId);
            else if (move.action === 'take') this.engine.defenderTakesCards();
        }

        this.renderAll();
        this.showRoundEndModal();
    }

    renderAll() {
        this.renderTopHUD();
        this.renderAllPlayerSeats();
        this.renderTableCenter();
        this.renderHumanHand();
        this.renderActionButtons();
    }

    renderTopHUD() {
        if (this.engine.roundNumber === 0) {
            const sharedSuitObj = window.CardsAPI.SUITS[this.engine.sharedTrumpSuit || 'diamonds'];
            this.elRoundBadge.innerHTML = `Boshlang'ich Durak (Ko'zir: ${sharedSuitObj.symbol} ${sharedSuitObj.name})`;
        } else {
            this.elRoundBadge.textContent = `${this.engine.roundNumber}-O'yin (Shaxsiy Ko'zirlar)`;
        }

        const turnPlayerId = this.engine.getCurrentTurnPlayerId();
        const turnPlayer = turnPlayerId !== null ? this.engine.players[turnPlayerId] : null;
        const defender = this.engine.players[this.engine.defenderId];

        if (this.engine.phase === window.BOUT_PHASE.ROUND_OVER || this.engine.phase === window.BOUT_PHASE.GAME_OVER) {
            this.elTurnBanner.textContent = "O'yin yakunlandi!";
            return;
        }
        if (!turnPlayer) return;

        if (this.engine.phase === window.BOUT_PHASE.INITIAL_ATTACK) {
            this.elTurnBanner.textContent = turnPlayer.id === 0
                ? `Sizning navbatingiz: ${defender.name} ga yuring`
                : `${turnPlayer.name} ➔ ${defender.name} ga yurmoqda...`;
        } else if (this.engine.phase === window.BOUT_PHASE.DEFENSE) {
            this.elTurnBanner.textContent = turnPlayer.id === 0
                ? `Himoyalaning: Kartani kesing yoki ko'taring!`
                : `${defender.name} himoyalanmoqda...`;
        } else if (this.engine.phase === window.BOUT_PHASE.PRIMARY_PODKID) {
            this.elTurnBanner.textContent = turnPlayer.id === 0
                ? `Mos karta tashlang yoki «Pas» bering`
                : `${turnPlayer.name} karta tashlamoqda...`;
        } else if (this.engine.phase === window.BOUT_PHASE.SECONDARY_PODKID) {
            this.elTurnBanner.textContent = turnPlayer.id === 0
                ? `Chap taraf navbati: Mos karta tashlang yoki «Bita» qiling`
                : `${turnPlayer.name} karta tashlamoqda...`;
        } else if (this.engine.phase === window.BOUT_PHASE.TAKING_PODKID) {
            const mySeatId = this.getMySeatId();
            if (turnPlayerId === mySeatId) {
                this.elTurnBanner.textContent = `📥 ${defender.name} ko'tarmoqda! Mos karta tashlang yoki «Bo'ldi» bosing`;
            } else if (mySeatId === this.engine.defenderId) {
                this.elTurnBanner.textContent = `📥 Siz ko'tardingiz. Boshqa o'yinchilar karta qo'shmoqda...`;
            } else {
                this.elTurnBanner.textContent = `📥 ${defender.name} ko'tarmoqda: ${turnPlayer ? turnPlayer.name : ''} karta qo'shmoqda...`;
            }
        }
    }

    renderAllPlayerSeats() {
        const turnPlayerId = this.engine.getCurrentTurnPlayerId();

        for (const p of this.engine.players) {
            const seatEl = document.getElementById(`player-seat-${p.seat}`);
            if (!seatEl) continue;

            const suitObj = window.CardsAPI.SUITS[p.trumpSuit];
            const isTurn = turnPlayerId === p.id;
            const roleInfo = this.getPlayerBoutRoleBadge(p.id);

            seatEl.classList.toggle('active-turn-seat', isTurn);
            seatEl.classList.toggle('eliminated-seat', p.eliminated);

            const roleEl = seatEl.querySelector('.seat-role-pill');
            if (roleEl) {
                roleEl.className = `seat-role-pill ${roleInfo.cssClass}`;
                roleEl.textContent = roleInfo.text;
            }

            const suitBadgeEl = seatEl.querySelector('.seat-trump-badge');
            if (suitBadgeEl) {
                suitBadgeEl.innerHTML = `<span class="suit-sym color-${suitObj.color}">${suitObj.symbol}</span> ${suitObj.name}`;
            }

            const metaEl = seatEl.querySelector('.seat-card-count');
            if (metaEl) {
                metaEl.textContent = `${p.hand.length} ta karta`;
            }

            const burnEl = seatEl.querySelector('.trump-NextBurn');
            if (burnEl) {
                if (this.engine.roundNumber === 0) {
                    burnEl.textContent = `Tanlagan: ${suitObj.symbol}`;
                } else if (p.lostTrumps.length === 0) {
                    burnEl.textContent = `Ko'zir: 9/9`;
                } else {
                    const lastLost = p.lostTrumps[p.lostTrumps.length - 1];
                    const rObj = window.CardsAPI.RANKS.find(r => r.value === lastLost);
                    burnEl.textContent = `Chiqqan: 6..${rObj ? rObj.label : lastLost}${suitObj.symbol} (${9 - p.lostTrumps.length}/9)`;
                }
            }

            if (!p.isHuman) {
                const fanEl = seatEl.querySelector('.bot-card-fan');
                if (fanEl) {
                    if (p.eliminated || p.outOfRound) {
                        fanEl.innerHTML = '';
                    } else {
                        const maxVisible = Math.min(p.hand.length, 8);
                        let backsHTML = '';
                        for (let i = 0; i < maxVisible; i++) {
                            const angle = (i - (maxVisible - 1) / 2) * 4;
                            backsHTML += `<div class="mini-card-back" style="transform: rotate(${angle}deg)"></div>`;
                        }
                        fanEl.innerHTML = backsHTML;
                    }
                }
            }
        }
    }

    getPlayerBoutRoleBadge(playerId) {
        const p = this.engine.players[playerId];
        if (p.eliminated) return { text: 'Chiqqan', cssClass: 'role-eliminated' };
        if (this.engine.phase === window.BOUT_PHASE.TAKING_PODKID) {
            if (playerId === this.engine.defenderId) return { text: '📥 Olyapti', cssClass: 'role-defender' };
            if (playerId === this.engine.takingAttackerId) return { text: "⚔️ Qo'shish", cssClass: 'role-secondary-active' };
            return { text: '⏳ Kutilmoqda', cssClass: 'role-secondary-wait' };
        }

        if (playerId === this.engine.defenderId) return { text: '🛡️ Himoya', cssClass: 'role-defender' };

        if (playerId === this.engine.primaryAttackerId) {
            if (this.engine.primaryPassed) return { text: '✋ Pas', cssClass: 'role-passed-locked' };
            return { text: '⚔️ Hujum', cssClass: 'role-attacker' };
        }

        if (playerId === this.engine.secondaryAttackerId) {
            if (this.engine.primaryPassed) {
                if (this.engine.secondaryPassed) return { text: '✋ Pas', cssClass: 'role-passed-locked' };
                return { text: '🎯 Navbat', cssClass: 'role-secondary-active' };
            }
            return { text: '⏳ Chapda', cssClass: 'role-secondary-wait' };
        }

        if (playerId === this.engine.oppositeBlockedId) {
            return { text: '🔒 Blok', cssClass: 'role-opposite-blocked' };
        }

        return { text: '', cssClass: '' };
    }

    /**
     * Renders the Koloda:
     * - In Round 0 (Oddiy Durak): Shows the 1 Open Trump Card (`openTrumpCard`) sticking out sideways from under the deck!
     * - In Round 1+ (Asosiy O'yin): Hides the bottom card (`🔒 YOPIQ KOLODA`)!
     */
    renderTableCenter() {
        const deckLen = this.engine.deck.length;

        if (this.engine.roundNumber === 0 && this.engine.openTrumpCard && deckLen > 0) {
            // Round 0 (Oddiy Durak): Show the face-up trump card under the deck!
            this.elOpenGroundTrump.classList.remove('hidden');
            this.elOpenGroundTrump.innerHTML = window.CardsAPI.createCardHTML(this.engine.openTrumpCard, {
                isPersonalTrump: true
            });
            const sObj = window.CardsAPI.SUITS[this.engine.openTrumpCard.suit];
            this.elTalonLabel.innerHTML = `Yerdagi Ko'zir: <strong class="color-${sObj.color}">${this.engine.openTrumpCard.label}${sObj.symbol}</strong> (${deckLen} ta)`;

            if (deckLen === 1) {
                // Only the open bottom card remains
                this.elTalonStack.classList.add('hidden');
            } else {
                this.elTalonStack.classList.remove('hidden', 'empty-pile');
                this.elTalonStack.innerHTML = `<div class="talon-layer"></div><div class="talon-secret-lock">${deckLen} TA</div>`;
            }
        } else {
            // Round 1+ (or empty deck in Round 0): Bottom card is HIDDEN!
            this.elOpenGroundTrump.classList.add('hidden');
            this.elTalonStack.classList.remove('hidden');

            if (deckLen === 0) {
                this.elTalonStack.classList.add('empty-pile');
                this.elTalonStack.innerHTML = `<span>0</span>`;
                if (this.engine.roundNumber === 0 && this.engine.sharedTrumpSuit) {
                    const sObj = window.CardsAPI.SUITS[this.engine.sharedTrumpSuit];
                    this.elTalonLabel.innerHTML = `Ko'zir: <strong>${sObj.symbol} ${sObj.name}</strong> (0 ta)`;
                } else {
                    this.elTalonLabel.innerHTML = `Koloda: <strong>0</strong>`;
                }
            } else {
                this.elTalonStack.classList.remove('empty-pile');
                this.elTalonStack.innerHTML = `<div class="talon-layer"></div><div class="talon-secret-lock">🔒 YOPIQ<br/>KOLODA</div>`;
                this.elTalonLabel.innerHTML = `Yopiq Koloda: <strong>${deckLen}</strong>`;
            }
        }

        const bitaLen = this.engine.bitaPile.length;
        this.elBitaCount.textContent = bitaLen;
        this.elBitaStack.classList.toggle('empty-pile', bitaLen === 0);

        if (this.engine.tablePairs.length === 0) {
            this.elBattlePairs.innerHTML = '';
            this.elTableCenterHint.classList.remove('hidden');
            const att = this.engine.players[this.engine.primaryAttackerId];
            const def = this.engine.players[this.engine.defenderId];
            if (att && def) {
                this.elTableCenterHint.innerHTML = `⚔️ <strong>${att.name}</strong> ➔ 🛡️ <strong>${def.name}</strong>`;
            }
            return;
        }

        this.elTableCenterHint.classList.add('hidden');
        const defTrump = this.engine.getEffectiveTrumpSuit(this.engine.defenderId);

        this.elBattlePairs.innerHTML = this.engine.tablePairs.map((pair, idx) => {
            const attIsTrump = pair.attack.suit === defTrump;
            const attackHTML = window.CardsAPI.createCardHTML(pair.attack, {
                isPersonalTrump: attIsTrump
            });

            let defenseHTML = '';
            if (pair.defense) {
                const defIsTrump = pair.defense.suit === defTrump;
                defenseHTML = `<div class="pair-defense-slot">${window.CardsAPI.createCardHTML(pair.defense, {
                    isPersonalTrump: defIsTrump
                })}</div>`;
            }

            return `
            <div class="battle-pair-slot ${pair.defense ? 'beaten-pair' : 'unbeaten-pair'}" data-pair-index="${idx}">
                <div class="pair-attack-slot">${attackHTML}</div>
                ${defenseHTML}
            </div>`;
        }).join('');
    }

    renderHumanHand() {
        const mySeatId = this.getMySeatId();
        const human = this.engine.players[mySeatId];
        const container = document.getElementById('human-hand-cards');
        if (!container || !human) return;

        if (human.eliminated) {
            container.innerHTML = `<div class="center-hint-text">Siz o'yindan chiqdingiz</div>`;
            return;
        }
        if (human.outOfRound) {
            container.innerHTML = `<div class="center-hint-text">🏆 Siz qutuldingiz! Boshqa o'yinchilar davom etmoqda...</div>`;
            return;
        }

        const isMyTurn = this.engine.getCurrentTurnPlayerId() === mySeatId;
        const openPair = this.engine.tablePairs.find(p => p.defense === null);
        const myEffectiveTrump = this.engine.getEffectiveTrumpSuit(mySeatId);

        container.innerHTML = human.hand.map(card => {
            const isTrump = card.suit === myEffectiveTrump;
            let isPlayable = false;

            if (isMyTurn) {
                if (this.engine.phase === window.BOUT_PHASE.DEFENSE && openPair) {
                    isPlayable = this.engine.canBeatCard(mySeatId, openPair.attack, card).valid;
                } else if (
                    this.engine.phase === window.BOUT_PHASE.INITIAL_ATTACK ||
                    this.engine.phase === window.BOUT_PHASE.PRIMARY_PODKID ||
                    this.engine.phase === window.BOUT_PHASE.SECONDARY_PODKID ||
                    this.engine.phase === window.BOUT_PHASE.TAKING_PODKID
                ) {
                    isPlayable = this.engine.canAttackWithCard(mySeatId, card).valid;
                }
            }

            return window.CardsAPI.createCardHTML(card, {
                isPersonalTrump: isTrump,
                isPlayable
            });
        }).join('');

        container.querySelectorAll('.playing-card').forEach(cardEl => {
            cardEl.addEventListener('click', (e) => {
                const cardId = cardEl.dataset.cardId;
                this.onHumanCardClick(cardId, cardEl, e);
            });
        });
    }

    renderActionButtons() {
        const mySeatId = this.getMySeatId();
        const isMyTurn = this.engine.getCurrentTurnPlayerId() === mySeatId;

        if (this.engine.phase === window.BOUT_PHASE.TAKING_PODKID) {
            const canPass = isMyTurn;
            this.btnPass.disabled = !canPass;
            this.btnPass.classList.toggle('btn-glow-ready', canPass);
            this.btnPass.textContent = "✋ Bo'ldi (Boshqa yo'q)";

            this.btnTake.disabled = true;
            this.btnTake.classList.remove('btn-danger-ready');
            this.btnTake.textContent = "📥 Ko'tarilyapti...";
            return;
        }

        const canPass = isMyTurn && (
            this.engine.phase === window.BOUT_PHASE.PRIMARY_PODKID ||
            this.engine.phase === window.BOUT_PHASE.SECONDARY_PODKID
        );
        this.btnPass.disabled = !canPass;
        this.btnPass.classList.toggle('btn-glow-ready', canPass);
        this.btnPass.textContent = (this.engine.phase === window.BOUT_PHASE.SECONDARY_PODKID && isMyTurn)
            ? "✨ Bita (Yo'q)"
            : "✋ Pas (Yo'q)";

        const canTake = isMyTurn && this.engine.phase === window.BOUT_PHASE.DEFENSE;
        this.btnTake.disabled = !canTake;
        this.btnTake.classList.toggle('btn-danger-ready', canTake);
        this.btnTake.textContent = "📥 Ko'tarish (Olish)";
    }

    onHumanCardClick(cardId, cardEl, event) {
        const mySeatId = this.getMySeatId();
        if (this.engine.getCurrentTurnPlayerId() !== mySeatId) {
            window.soundFX.playError();
            return;
        }

        // If Guest in Online Multiplayer, send move to Host over WebRTC
        if (this.multiplayer && this.multiplayer.isGuest) {
            const action = this.engine.phase === window.BOUT_PHASE.DEFENSE ? 'defend' : 'attack';
            this.multiplayer.sendMoveToHost(action, cardId);
            return;
        }

        if (this.engine.phase === window.BOUT_PHASE.DEFENSE) {
            const res = this.engine.playDefenseCard(mySeatId, cardId);
            if (!res.success) {
                window.soundFX.playError();
                cardEl.classList.add('shake-card');
                setTimeout(() => cardEl.classList.remove('shake-card'), 350);
                this.showToast(res.reason);
                return;
            }
            window.soundFX.playCardPlace(res.usedOwnTrump);
            if (res.usedOwnTrump && event) {
                this.spawnBurstParticles(event.clientX, event.clientY, '#ecc94b', 20);
            }
            if (res.bitaTriggered) window.soundFX.playBita();
            this.afterMoveUpdate();
            return;
        }

        const res = this.engine.playAttackCard(mySeatId, cardId);
        if (!res.success) {
            window.soundFX.playError();
            cardEl.classList.add('shake-card');
            setTimeout(() => cardEl.classList.remove('shake-card'), 350);
            this.showToast(res.reason);
            return;
        }

        window.soundFX.playCardPlace(false);
        this.afterMoveUpdate();
    }

    onHumanPass() {
        const mySeatId = this.getMySeatId();
        if (this.engine.getCurrentTurnPlayerId() !== mySeatId) return;

        if (this.multiplayer && this.multiplayer.isGuest) {
            this.multiplayer.sendMoveToHost('pass');
            return;
        }

        const res = this.engine.declarePass(mySeatId);
        if (!res.success) return;
        if (res.bita) window.soundFX.playBita();
        else window.soundFX.playPass();
        this.afterMoveUpdate();
    }

    onHumanTake() {
        const mySeatId = this.getMySeatId();
        if (this.engine.getCurrentTurnPlayerId() !== mySeatId) return;

        if (this.multiplayer && this.multiplayer.isGuest) {
            this.multiplayer.sendMoveToHost('take');
            return;
        }

        const res = this.engine.defenderTakesCards();
        if (!res.success) return;
        window.soundFX.playTake();
        if (res.isTaking) {
            this.showToast("Siz ko'tardingiz! Boshqa o'yinchilar karta qo'shmoqda...");
        }
        this.afterMoveUpdate();
    }

    afterMoveUpdate() {
        this.renderAll();

        if (this.multiplayer && this.multiplayer.isHost) {
            this.multiplayer.broadcastState();
        }

        if (this.engine.phase === window.BOUT_PHASE.ROUND_OVER ||
            this.engine.phase === window.BOUT_PHASE.GAME_OVER) {
            setTimeout(() => this.showRoundEndModal(), 400);
            return;
        }

        this.scheduleBotTurnIfNeeded();
    }

    scheduleBotTurnIfNeeded() {
        if (this.botTimer) clearTimeout(this.botTimer);
        if (this.engine.phase === window.BOUT_PHASE.ROUND_OVER ||
            this.engine.phase === window.BOUT_PHASE.GAME_OVER ||
            this.engine.phase === window.BOUT_PHASE.SELECT_SUIT) {
            return;
        }

        const turnPlayerId = this.engine.getCurrentTurnPlayerId();
        if (turnPlayerId === null || this.isSeatOccupiedByHuman(turnPlayerId)) return;

        const humanOut = this.engine.players[0].outOfRound || this.engine.players[0].eliminated;
        const delay = humanOut ? 220 : 680;

        this.botTimer = setTimeout(() => {
            this.executeBotTurn(turnPlayerId);
        }, delay);
    }

    executeBotTurn(botId) {
        const decision = window.BotAI.decideMove(this.engine, botId);
        if (!decision) return;

        if (decision.action === 'attack') {
            const res = this.engine.playAttackCard(botId, decision.cardId);
            if (res.success) window.soundFX.playCardPlace(false);
        } else if (decision.action === 'defend') {
            const res = this.engine.playDefenseCard(botId, decision.cardId);
            if (res.success) {
                window.soundFX.playCardPlace(res.usedOwnTrump);
                if (res.bitaTriggered) window.soundFX.playBita();
            }
        } else if (decision.action === 'pass') {
            const res = this.engine.declarePass(botId);
            if (res.bita) window.soundFX.playBita();
            else window.soundFX.playPass();
        } else if (decision.action === 'take') {
            this.engine.defenderTakesCards();
            window.soundFX.playTake();
        }

        this.afterMoveUpdate();
    }

    async syncRoundWithBackend() {
        const winner = this.engine.players[this.engine.roundWinnerId] || this.engine.players[0];
        const loser = this.engine.players[this.engine.lastRoundLoserId] || this.engine.players[3];
        try {
            await fetch(`${API_BASE}/api/sync-round`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roundNumber: this.engine.roundNumber,
                    humanSuit: this.selectedSuit,
                    winnerName: winner.name,
                    loserName: loser.name,
                    burnedCard: this.engine.lastBurnedCard,
                    dealDistribution: this.engine.lastDealDistribution,
                    remainingDeckTotal: 36 - this.engine.eliminatedCards.size
                })
            });
        } catch (e) {}
    }

    showRoundEndModal() {
        this.syncRoundWithBackend();

        const titleEl = document.getElementById('round-end-title');
        const subtitleEl = document.getElementById('round-end-subtitle');
        const ceremonyBox = document.getElementById('burned-card-ceremony');
        const standingsEl = document.getElementById('round-standings-grid');
        const btnNext = document.getElementById('btn-next-round');

        const winner = this.engine.players[this.engine.roundWinnerId] || this.engine.players[0];
        const loser = this.engine.players[this.engine.lastRoundLoserId] || this.engine.players[3];

        if (this.engine.phase === window.BOUT_PHASE.GAME_OVER) {
            const champ = this.engine.players[this.engine.tournamentWinnerId];
            window.soundFX.playVictory();
            titleEl.textContent = `👑 G'OLIB: ${champ.name}!`;
            subtitleEl.textContent = `Barcha raqiblar o'yindan chiqdi.`;
            ceremonyBox.innerHTML = '';
            btnNext.textContent = `🔄 Yangi O'yin Boshlash`;
        } else if (this.engine.roundNumber === 0) {
            window.soundFX.playVictory();
            titleEl.textContent = `🏁 Boshlang'ich Durak Yakunlandi!`;
            subtitleEl.innerHTML = `🥇 Keyingi o'yinni birinchi boshlaydi: <strong>${winner.name}</strong><br/>🃏 Kartalarni yig'ib tarqatadi: <strong>${loser.name}</strong>`;
            ceremonyBox.innerHTML = `
                <div style="background:rgba(16,185,129,0.15);border:1px solid #34d399;padding:12px;border-radius:10px;margin-bottom:14px;font-size:0.86rem;color:#d1fae5;text-align:center;">
                    Endi <strong>Asosiy O'yin</strong> boshlanadi: Yerdagi oxirgi karta ko'rinmaydi va har kim boshida tanlagan mastasi o'zining <strong>shaxsiy ko'ziri</strong> bo'ladi!
                </div>
            `;
            btnNext.textContent = `➡️ Asosiy O'yinni Boshlash (${winner.name} yuradi)`;
        } else {
            window.soundFX.playCardBurn();
            const burned = this.engine.lastBurnedCard;
            titleEl.textContent = `${this.engine.roundNumber}-O'yin Yakunlandi`;
            subtitleEl.innerHTML = `Yutdi (Boshlaydi): <strong>${winner.name}</strong> | Yutqazdi (Tarqatadi): <strong>${loser.name}</strong>`;

            if (burned) {
                const burnedCardHTML = window.CardsAPI.createCardHTML(burned, { isPersonalTrump: true });
                ceremonyBox.innerHTML = `
                    <div class="burn-stage">
                        <div>
                            ${burnedCardHTML}
                            <div class="fire-overlay">🔥 CHIQDI</div>
                        </div>
                        <div>
                            <h3 style="color:#fca5a5;margin-bottom:6px;">${burned.loserName}ning «${burned.fullName}» kartasi o'yindan chiqdi!</h3>
                            <p style="font-size:0.85rem;color:#cbd5e1;">Keyingi o'yinda tarqatish: <strong>${burned.nextDealPreview}</strong> (Jami ${burned.nextTotalCards} ta karta qoldi)</p>
                        </div>
                    </div>
                `;
            }
            btnNext.textContent = `➡️ Keyingi O'yinni Boshlash`;
        }

        const ranks = [
            { v: 6, l: '6' }, { v: 7, l: '7' }, { v: 8, l: '8' },
            { v: 9, l: '9' }, { v: 10, l: '10' }, { v: 11, l: 'V' },
            { v: 12, l: 'D' }, { v: 13, l: 'K' }, { v: 14, l: 'T' }
        ];
        standingsEl.innerHTML = this.engine.players.map(p => {
            const suitObj = window.CardsAPI.SUITS[p.trumpSuit];
            return `
            <div class="standing-player-row">
                <div><strong>${p.name}</strong> (${suitObj.symbol} ${suitObj.name})</div>
                <div class="st-trumps-row">
                    ${ranks.map(r => {
                        const lost = p.lostTrumps.includes(r.v);
                        return `<span class="st-card-chip ${lost ? 'chip-burned' : 'chip-intact'}">${r.l}${suitObj.symbol}</span>`;
                    }).join('')}
                </div>
            </div>`;
        }).join('');

        this.modalRoundEnd.classList.remove('hidden');
    }

    proceedToNextRound() {
        if (this.engine.phase === window.BOUT_PHASE.GAME_OVER) {
            this.showTableSuitPicker();
            return;
        }
        const nextRoundNum = this.engine.roundNumber + 1;
        const starterId = this.engine.roundWinnerId !== null ? this.engine.roundWinnerId : 0;
        const dealerId = this.engine.lastRoundLoserId !== null ? this.engine.lastRoundLoserId : 3;

        this.engine.startRound(nextRoundNum, starterId, dealerId);
        this.renderAll();
        if (this.multiplayer && this.multiplayer.isHost) {
            this.multiplayer.broadcastState();
        }
        this.scheduleBotTurnIfNeeded();
    }

    showToast(message) {
        if (!this.elToastContainer) return;
        const toast = document.createElement('div');
        toast.className = 'game-toast';
        toast.textContent = message;
        this.elToastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    initParticleCanvas() {
        this.particleCanvas = document.getElementById('fx-canvas');
        if (!this.particleCanvas) return;
        this.particleCtx = this.particleCanvas.getContext('2d');

        const resize = () => {
            this.particleCanvas.width = window.innerWidth;
            this.particleCanvas.height = window.innerHeight;
        };
        window.addEventListener('resize', resize);
        resize();

        const animate = () => {
            this.updateParticles();
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }

    spawnBurstParticles(x, y, color = '#ecc94b', count = 20) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 4 + 1.5;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: Math.random() * 3 + 1.5,
                alpha: 1,
                color
            });
        }
    }

    updateParticles() {
        if (!this.particleCtx || !this.particleCanvas) return;
        const ctx = this.particleCtx;
        ctx.clearRect(0, 0, this.particleCanvas.width, this.particleCanvas.height);

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.alpha -= 0.03;
            if (p.alpha <= 0) {
                this.particles.splice(i, 1);
                continue;
            }
            ctx.save();
            ctx.globalAlpha = Math.max(0, p.alpha);
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.gameUI = new GameUI();
});
