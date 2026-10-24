/**
 * 4 KO'ZIR — Clean, Uncluttered UI Controller
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
        this.renderSuitSelectionModal();
    }

    initDOMReferences() {
        this.elRoundBadge = document.getElementById('hud-round-badge');
        this.elTurnBanner = document.getElementById('turn-status-banner');

        this.elTalonStack = document.getElementById('talon-stack');
        this.elTalonCount = document.getElementById('talon-count-badge');
        this.elBitaStack = document.getElementById('bita-stack');
        this.elBitaCount = document.getElementById('bita-count-badge');
        this.elBattlePairs = document.getElementById('battle-pairs-grid');
        this.elTableCenterHint = document.getElementById('table-center-hint');

        this.btnPass = document.getElementById('btn-action-pass');
        this.btnTake = document.getElementById('btn-action-take');

        this.modalStart = document.getElementById('modal-start');
        this.modalRoundEnd = document.getElementById('modal-round-end');
        this.modalRules = document.getElementById('modal-rules');

        this.elToastContainer = document.getElementById('toast-container');
    }

    bindEvents() {
        document.querySelectorAll('.suit-choice-card').forEach(cardEl => {
            cardEl.addEventListener('click', () => {
                window.soundFX.playPass();
                document.querySelectorAll('.suit-choice-card').forEach(c => c.classList.remove('selected'));
                cardEl.classList.add('selected');
                this.selectedSuit = cardEl.dataset.suit;
                this.renderSuitSelectionModal();
            });
        });

        document.getElementById('btn-start-game').addEventListener('click', () => {
            window.soundFX.init();
            window.soundFX.playVictory();
            this.startNewTournament();
        });

        this.btnPass.addEventListener('click', () => this.onHumanPass());
        this.btnTake.addEventListener('click', () => this.onHumanTake());

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
            this.modalStart.classList.remove('hidden');
        });

        document.getElementById('btn-next-round').addEventListener('click', () => {
            window.soundFX.playCardDeal();
            this.modalRoundEnd.classList.add('hidden');
            this.proceedToNextRound();
        });
    }

    renderSuitSelectionModal() {
        const suitObj = window.CardsAPI.SUITS[this.selectedSuit];
        const previewEl = document.getElementById('selected-suit-preview');
        if (previewEl && suitObj) {
            previewEl.innerHTML = `Sizning shaxsiy ko'ziringiz: <strong style="color:${suitObj.accent}">${suitObj.symbol} ${suitObj.name}</strong>`;
        }
    }

    startNewTournament() {
        if (this.botTimer) clearTimeout(this.botTimer);
        this.modalStart.classList.add('hidden');
        this.modalRoundEnd.classList.add('hidden');

        this.engine.resetTournament();
        this.engine.setupPlayers(this.selectedSuit);
        // Start with 0-raund (36 cards)
        this.engine.startRound(0, 0, 3);

        this.renderAll();
        this.scheduleBotTurnIfNeeded();
    }

    renderAll() {
        this.renderTopHUD();
        this.renderAllPlayerSeats();
        this.renderTableCenter();
        this.renderHumanHand();
        this.renderActionButtons();
    }

    renderTopHUD() {
        this.elRoundBadge.textContent = this.engine.roundNumber === 0
            ? '0-O\'yin (Boshlang\'ich)'
            : `${this.engine.roundNumber}-O\'yin`;

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

            // Show compact lost trump status
            const burnEl = seatEl.querySelector('.trump-NextBurn');
            if (burnEl) {
                if (p.lostTrumps.length === 0) {
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
        if (p.outOfRound) return { text: 'Qutuldi', cssClass: 'role-safe' };
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

    renderTableCenter() {
        const deckLen = this.engine.deck.length;
        this.elTalonCount.textContent = deckLen;
        if (deckLen === 0) {
            this.elTalonStack.classList.add('empty-pile');
            this.elTalonStack.innerHTML = `<span>0</span>`;
        } else {
            this.elTalonStack.classList.remove('empty-pile');
            this.elTalonStack.innerHTML = `<div class="talon-layer"></div><div class="talon-secret-lock">🔒 YOPIQ</div>`;
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
        const defender = this.engine.players[this.engine.defenderId];

        // Clean pairs on table — NO dashed box covering the card!
        this.elBattlePairs.innerHTML = this.engine.tablePairs.map((pair, idx) => {
            const attIsDefTrump = pair.attack.suit === defender.trumpSuit;
            const attackHTML = window.CardsAPI.createCardHTML(pair.attack, {
                isPersonalTrump: attIsDefTrump
            });

            let defenseHTML = '';
            if (pair.defense) {
                const defIsOwnTrump = pair.defense.suit === defender.trumpSuit;
                defenseHTML = `<div class="pair-defense-slot">${window.CardsAPI.createCardHTML(pair.defense, {
                    isPersonalTrump: defIsOwnTrump
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
        const human = this.engine.players[0];
        const container = document.getElementById('human-hand-cards');
        if (!container || !human) return;

        if (human.eliminated) {
            container.innerHTML = `<div class="center-hint-text">Siz o'yindan chiqdingiz</div>`;
            return;
        }
        if (human.outOfRound) {
            container.innerHTML = `<div class="center-hint-text">🏆 Siz qutuldingiz! Botlar tugatmoqda...</div>`;
            return;
        }

        const isMyTurn = this.engine.getCurrentTurnPlayerId() === 0;
        const openPair = this.engine.tablePairs.find(p => p.defense === null);

        container.innerHTML = human.hand.map(card => {
            const isPersonalTrump = card.suit === human.trumpSuit;
            let isPlayable = false;

            if (isMyTurn) {
                if (this.engine.phase === window.BOUT_PHASE.DEFENSE && openPair) {
                    isPlayable = this.engine.canBeatCard(0, openPair.attack, card).valid;
                } else if (
                    this.engine.phase === window.BOUT_PHASE.INITIAL_ATTACK ||
                    this.engine.phase === window.BOUT_PHASE.PRIMARY_PODKID ||
                    this.engine.phase === window.BOUT_PHASE.SECONDARY_PODKID
                ) {
                    isPlayable = this.engine.canAttackWithCard(0, card).valid;
                }
            }

            return window.CardsAPI.createCardHTML(card, {
                isPersonalTrump,
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
        const isMyTurn = this.engine.getCurrentTurnPlayerId() === 0;

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
    }

    onHumanCardClick(cardId, cardEl, event) {
        if (this.engine.getCurrentTurnPlayerId() !== 0) {
            window.soundFX.playError();
            return;
        }

        if (this.engine.phase === window.BOUT_PHASE.DEFENSE) {
            const res = this.engine.playDefenseCard(0, cardId);
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

        const res = this.engine.playAttackCard(0, cardId);
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
        const res = this.engine.declarePass(0);
        if (!res.success) return;
        if (res.bita) window.soundFX.playBita();
        else window.soundFX.playPass();
        this.afterMoveUpdate();
    }

    onHumanTake() {
        const res = this.engine.defenderTakesCards();
        if (!res.success) return;
        window.soundFX.playTake();
        this.afterMoveUpdate();
    }

    afterMoveUpdate() {
        this.renderAll();

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
            this.engine.phase === window.BOUT_PHASE.GAME_OVER) {
            return;
        }

        const turnPlayerId = this.engine.getCurrentTurnPlayerId();
        if (turnPlayerId === null || turnPlayerId === 0) return;

        const humanOut = this.engine.players[0].outOfRound || this.engine.players[0].eliminated;
        const delay = humanOut ? 220 : 700;

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
            titleEl.textContent = `0-O'yin Yakunlandi`;
            subtitleEl.innerHTML = `Keyingi o'yinni boshlaydi: <strong>${winner.name}</strong> | Kartalarni tarqatadi: <strong>${loser.name}</strong>`;
            ceremonyBox.innerHTML = '';
            btnNext.textContent = `➡️ Asosiy O'yinni Boshlash`;
        } else {
            window.soundFX.playCardBurn();
            const burned = this.engine.lastBurnedCard;
            titleEl.textContent = `${this.engine.roundNumber}-O'yin Yakunlandi`;
            subtitleEl.innerHTML = `Yutdi: <strong>${winner.name}</strong> | Yutqazdi: <strong>${loser.name}</strong>`;

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
            this.modalStart.classList.remove('hidden');
            return;
        }
        const nextRoundNum = this.engine.roundNumber + 1;
        const starterId = this.engine.roundWinnerId !== null ? this.engine.roundWinnerId : 0;
        const dealerId = this.engine.lastRoundLoserId !== null ? this.engine.lastRoundLoserId : 3;

        this.engine.startRound(nextRoundNum, starterId, dealerId);
        this.renderAll();
        this.scheduleBotTurnIfNeeded();
    }

    showToast(message) {
        if (!this.elToastContainer) return;
        const toast = document.createElement('div');
        toast.className = 'game-toast';
        toast.textContent = message;
        this.elToastContainer.appendChild(toast);
        setTimeout(() => toast.remove(), 2500);
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
