/**
 * 4 KO'ZIR: OMON QOLISH — Full-Stack Luxury UI, Backend Telemetry Client & Izma-iz Dealing Controller
 */

const API_BASE = window.location.protocol.startsWith('http')
    ? window.location.origin
    : 'http://localhost:3000';

class GameUI {
    constructor() {
        this.engine = new window.FourTrumpsEngine();
        this.selectedSuit = 'diamonds';
        this.selectedStartMode = 'round0'; // 'round0' | 'round1' | 'late13'
        this.botTimer = null;
        this.gameSpeed = 1;
        this.particles = [];
        this.particleCanvas = null;
        this.particleCtx = null;

        this.backendOnline = false;
        this.backendData = null;

        this.initDOMReferences();
        this.bindEvents();
        this.initParticleCanvas();
        this.renderSuitSelectionModal();
        this.checkBackendConnection();
    }

    initDOMReferences() {
        // Top HUD
        this.elRoundBadge = document.getElementById('hud-round-badge');
        this.elDeckTotal = document.getElementById('hud-deck-total');
        this.elDealDist = document.getElementById('hud-deal-dist');
        this.elBurnedCount = document.getElementById('hud-burned-count');
        this.elBackendDot = document.getElementById('backend-status-dot');
        this.elBackendText = document.getElementById('backend-status-text');
        this.elTurnBanner = document.getElementById('turn-status-banner');
        this.elTurnSub = document.getElementById('turn-status-sub');

        // Table Center
        this.elTalonStack = document.getElementById('talon-stack');
        this.elTalonCount = document.getElementById('talon-count-badge');
        this.elBitaStack = document.getElementById('bita-stack');
        this.elBitaCount = document.getElementById('bita-count-badge');
        this.elBattlePairs = document.getElementById('battle-pairs-grid');
        this.elTableCenterHint = document.getElementById('table-center-hint');

        // Action Bar (Bottom)
        this.btnPass = document.getElementById('btn-action-pass');
        this.btnTake = document.getElementById('btn-action-take');
        this.btnQuickRound0 = document.getElementById('btn-quick-round0');
        this.btnAutoHint = document.getElementById('btn-action-hint');

        // Modals
        this.modalStart = document.getElementById('modal-start');
        this.modalRoundEnd = document.getElementById('modal-round-end');
        this.modalRules = document.getElementById('modal-rules');
        this.modalGraveyard = document.getElementById('modal-graveyard');
        this.modalBackendStats = document.getElementById('modal-backend-stats');

        // Logs & Toast
        this.elLogList = document.getElementById('game-log-list');
        this.elToastContainer = document.getElementById('toast-container');
    }

    bindEvents() {
        // Suit selection cards in Start Modal
        document.querySelectorAll('.suit-choice-card').forEach(cardEl => {
            cardEl.addEventListener('click', () => {
                window.soundFX.playPass();
                document.querySelectorAll('.suit-choice-card').forEach(c => c.classList.remove('selected'));
                cardEl.classList.add('selected');
                this.selectedSuit = cardEl.dataset.suit;
                this.renderSuitSelectionModal();
            });
        });

        // Mode radio cards in Start Modal
        document.querySelectorAll('.mode-radio-card').forEach(labelEl => {
            labelEl.addEventListener('click', () => {
                document.querySelectorAll('.mode-radio-card').forEach(l => l.classList.remove('selected'));
                labelEl.classList.add('selected');
                const radio = labelEl.querySelector('input[type="radio"]');
                if (radio) {
                    radio.checked = true;
                    this.selectedStartMode = radio.value;
                }
            });
        });

        // Start Game Button
        document.getElementById('btn-start-game').addEventListener('click', () => {
            window.soundFX.init();
            window.soundFX.playVictory();
            this.startNewTournament();
        });

        // Action Buttons
        this.btnPass.addEventListener('click', () => this.onHumanPass());
        this.btnTake.addEventListener('click', () => this.onHumanTake());
        this.btnAutoHint.addEventListener('click', () => this.onHumanSmartMove());
        this.btnQuickRound0.addEventListener('click', () => this.onQuickFinishRound0());

        // Top Bar Controls
        document.getElementById('btn-open-rules').addEventListener('click', () => {
            window.soundFX.playPass();
            this.modalRules.classList.remove('hidden');
        });
        document.getElementById('btn-close-rules').addEventListener('click', () => {
            this.modalRules.classList.add('hidden');
        });

        const openGraveyardFn = () => {
            window.soundFX.playPass();
            this.renderGraveyardModal();
            this.modalGraveyard.classList.remove('hidden');
        };
        document.getElementById('btn-open-graveyard').addEventListener('click', openGraveyardFn);
        document.getElementById('btn-open-dealing-sim').addEventListener('click', openGraveyardFn);

        document.getElementById('btn-close-graveyard').addEventListener('click', () => {
            this.modalGraveyard.classList.add('hidden');
        });

        // Izma-iz Dealing Simulator Preset Buttons (12, 13, 14, 15, 16, 17 burned cards)
        document.querySelectorAll('.sim-preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const burnCount = parseInt(btn.dataset.burn, 10);
                if (this.botTimer) clearTimeout(this.botTimer);
                this.modalGraveyard.classList.add('hidden');
                this.engine.setupLateGameScenario(this.selectedSuit, burnCount);
                window.soundFX.playCardDeal();
                this.renderAll();
                this.showToast(
                    `🔄 Izma-iz tarqatildi: <strong>${this.engine.lastDealDistribution}</strong> (${burnCount} ta karta chiqqan, jami ${36 - burnCount} ta karta qolgan)`,
                    'gold'
                );
                this.scheduleBotTurnIfNeeded();
            });
        });

        // Backend Stats & Leaderboard Modal
        const openBackendModalFn = async () => {
            window.soundFX.playPass();
            await this.checkBackendConnection();
            this.renderBackendStatsModal();
            this.modalBackendStats.classList.remove('hidden');
        };
        document.getElementById('btn-open-backend-stats').addEventListener('click', openBackendModalFn);
        document.getElementById('btn-open-stats-top').addEventListener('click', openBackendModalFn);
        document.getElementById('btn-close-backend-stats').addEventListener('click', () => {
            this.modalBackendStats.classList.add('hidden');
        });

        document.getElementById('btn-toggle-sound').addEventListener('click', (e) => {
            const muted = window.soundFX.toggleMute();
            e.currentTarget.innerHTML = muted ? '🔇 O\'chirilgan' : '🔊 Ovoz';
        });

        document.getElementById('btn-toggle-speed').addEventListener('click', (e) => {
            this.gameSpeed = this.gameSpeed === 1 ? 2 : 1;
            e.currentTarget.innerHTML = this.gameSpeed === 2 ? '⚡ 2x' : '⏱️ 1x';
            window.soundFX.playPass();
        });

        document.getElementById('btn-new-game-top').addEventListener('click', () => {
            if (this.botTimer) clearTimeout(this.botTimer);
            this.modalStart.classList.remove('hidden');
        });

        // Next Round Button inside Round End Modal
        document.getElementById('btn-next-round').addEventListener('click', () => {
            window.soundFX.playCardDeal();
            this.modalRoundEnd.classList.add('hidden');
            this.proceedToNextRound();
        });
    }

    /**
     * Checks connection to the Node.js Backend (`http://localhost:3000/api/status`)
     */
    async checkBackendConnection() {
        try {
            const res = await fetch(`${API_BASE}/api/status`);
            if (res.ok) {
                const data = await res.json();
                this.backendOnline = true;
                this.backendData = data;
                if (this.elBackendDot) {
                    this.elBackendDot.className = 'status-dot online';
                }
                if (this.elBackendText) {
                    this.elBackendText.textContent = `Backend: Online (${data.stats.totalRoundsPlayed} raund)`;
                }
                return;
            }
        } catch (err) {
            // Fallback to local mode if server isn't reachable
        }
        this.backendOnline = false;
        if (this.elBackendDot) {
            this.elBackendDot.className = 'status-dot local';
        }
        if (this.elBackendText) {
            this.elBackendText.textContent = 'Rejim: Lokal (Avtonom)';
        }
    }

    /**
     * Sends completed round & burned trump telemetry to the Node.js Backend Database
     */
    async syncRoundWithBackend() {
        const winner = this.engine.players[this.engine.roundWinnerId] || this.engine.players[0];
        const loser = this.engine.players[this.engine.lastRoundLoserId] || this.engine.players[3];
        const champ = this.engine.tournamentWinnerId !== null
            ? this.engine.players[this.engine.tournamentWinnerId]
            : null;

        const payload = {
            roundNumber: this.engine.roundNumber,
            humanSuit: this.selectedSuit,
            winnerName: winner.name,
            loserName: loser.name,
            burnedCard: this.engine.lastBurnedCard,
            dealDistribution: this.engine.lastDealDistribution,
            remainingDeckTotal: 36 - this.engine.eliminatedCards.size,
            tournamentWinnerId: this.engine.tournamentWinnerId,
            tournamentWinnerName: champ ? champ.name : null
        };

        try {
            const res = await fetch(`${API_BASE}/api/sync-round`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                const data = await res.json();
                this.backendOnline = true;
                this.backendData = data;
                if (this.elBackendDot) this.elBackendDot.className = 'status-dot online';
                if (this.elBackendText) {
                    this.elBackendText.textContent = `Backend DB: Saqlandi (${data.stats.totalRoundsPlayed} raund)`;
                }
            }
        } catch (e) {
            // Ignore network error if running via file:// offline
        }
    }

    renderBackendStatsModal() {
        const kpiEl = document.getElementById('backend-kpi-grid');
        const lbEl = document.getElementById('backend-leaderboard-list');
        const histEl = document.getElementById('backend-history-list');

        const stats = this.backendData ? this.backendData.stats : {
            totalRoundsPlayed: this.engine.roundNumber,
            totalTournamentsCompleted: 0,
            totalTrumpsBurned: this.engine.eliminatedCards.size,
            humanWins: 0
        };

        kpiEl.innerHTML = `
            <div class="kpi-box">
                <div class="kpi-val">${stats.totalRoundsPlayed}</div>
                <div class="kpi-lbl">O'ynalgan Raundlar</div>
            </div>
            <div class="kpi-box">
                <div class="kpi-val">${stats.totalTrumpsBurned}</div>
                <div class="kpi-lbl">Yoqilgan Ko'zirlar</div>
            </div>
            <div class="kpi-box">
                <div class="kpi-val">${stats.totalTournamentsCompleted}</div>
                <div class="kpi-lbl">Yakunlangan Turnirlar</div>
            </div>
            <div class="kpi-box">
                <div class="kpi-val">${stats.humanWins}</div>
                <div class="kpi-lbl">Sizning Chempionligingiz</div>
            </div>
        `;

        const leaderboard = this.backendData ? this.backendData.leaderboard : [
            { name: "Siz (Asosiy O'yinchi)", rating: 1500, wins: 0, roundsWon: 0, badge: '👑 Grandmaster' },
            { name: "Jasur (O'ngda)", rating: 1420, wins: 0, roundsWon: 0, badge: '⚔️ Hujum Ustasi' },
            { name: 'Sardor (Chapda)', rating: 1390, wins: 0, roundsWon: 0, badge: '🎯 Podkid Qiroli' },
            { name: "Ulug'bek (To'g'rida)", rating: 1365, wins: 0, roundsWon: 0, badge: '🛡️ Qalqon Sohibi' }
        ];

        lbEl.innerHTML = leaderboard.map((item, idx) => `
            <div class="standing-player-row">
                <div class="st-left">
                    <span class="st-suit" style="background:rgba(236,201,75,0.2);color:#ecc94b;font-size:1rem;font-weight:900;">#${idx + 1}</span>
                    <div>
                        <div class="st-name">${item.name} <span style="font-size:0.72rem;color:#ecc94b;">${item.badge || ''}</span></div>
                        <div class="st-sub">Raund g'alabalari: ${item.roundsWon || 0} ta | Turnir chempioni: ${item.wins || 0} marta</div>
                    </div>
                </div>
                <div style="font-weight:900;color:#fce588;font-size:1rem;">
                    ⭐ ${item.rating} ELO
                </div>
            </div>
        `).join('');

        const history = (this.backendData && this.backendData.matchHistory) ? this.backendData.matchHistory : [];
        if (history.length === 0) {
            histEl.innerHTML = `<div class="history-row-item" style="justify-content:center;color:#94a3b8;">Hozircha yakunlangan raundlar yo'q — raund tugagach avtomatik yoziladi.</div>`;
        } else {
            histEl.innerHTML = history.map(h => `
                <div class="history-row-item">
                    <span>🕒 ${h.time} | <strong>${h.roundNumber}-Raund</strong> (Tarqatish: ${h.dealDistribution})</span>
                    <span>🥇 ${h.winnerName} | 💀 ${h.loserName}</span>
                    <span style="color:#fca5a5;font-weight:700;">🔥 ${h.burnedCardText}</span>
                </div>
            `).join('');
        }
    }

    renderSuitSelectionModal() {
        const suitObj = window.CardsAPI.SUITS[this.selectedSuit];
        const previewEl = document.getElementById('selected-suit-preview');
        if (previewEl && suitObj) {
            previewEl.innerHTML = `Sizning shaxsiy ko'ziringiz: <strong style="color:${suitObj.accent}">${suitObj.symbol} ${suitObj.name}</strong> (6 dan Tuzgacha 9 ta karta sizning himoya qalqoningiz bo'ladi)`;
        }
    }

    startNewTournament() {
        if (this.botTimer) clearTimeout(this.botTimer);
        this.modalStart.classList.add('hidden');
        this.modalRoundEnd.classList.add('hidden');

        if (this.selectedStartMode === 'late13') {
            this.engine.setupLateGameScenario(this.selectedSuit, 13);
            this.showToast(
                `🔄 13 ta karta chiqqan rejim! Izma-iz tarqatish: <strong>${this.engine.lastDealDistribution}</strong> (23 ta karta)`,
                'gold'
            );
        } else {
            this.engine.resetTournament();
            this.engine.setupPlayers(this.selectedSuit);
            if (this.selectedStartMode === 'round0') {
                this.engine.startRound(0, 0, 3);
                this.showToast("0-Raund boshlandi! Kim birinchi yutsa 1-raundni boshlaydi, yutqazgan tarqatadi.", "info");
            } else {
                this.engine.startRound(1, 0, 3);
                this.showToast("1-Raund (Survival) boshlandi! Har raundda yutqazganning ko'ziri yonadi.", "info");
            }
        }

        this.renderAll();
        this.scheduleBotTurnIfNeeded();
    }

    /**
     * Simulates the remainder of the current round using real AI moves so the user can immediately see the round outcome & card burning ceremony
     */
    onQuickFinishRound0() {
        if (this.engine.phase === window.BOUT_PHASE.ROUND_OVER ||
            this.engine.phase === window.BOUT_PHASE.GAME_OVER) {
            this.showRoundEndModal();
            return;
        }
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

            if (move.action === 'attack') {
                this.engine.playAttackCard(turnId, move.cardId);
            } else if (move.action === 'defend') {
                this.engine.playDefenseCard(turnId, move.cardId);
            } else if (move.action === 'pass') {
                this.engine.declarePass(turnId);
            } else if (move.action === 'take') {
                this.engine.defenderTakesCards();
            }
        }

        this.renderAll();
        this.showRoundEndModal();
    }

    /**
     * Renders the entire game state to the DOM
     */
    renderAll() {
        this.renderTopHUD();
        this.renderAllPlayerSeats();
        this.renderTableCenter();
        this.renderHumanHand();
        this.renderActionButtons();
        this.renderLogs();
    }

    renderTopHUD() {
        if (this.engine.roundNumber === 0) {
            this.elRoundBadge.innerHTML = `🏁 0-RAUND <span class="badge-sub">(Saralash)</span>`;
        } else {
            this.elRoundBadge.innerHTML = `🔥 ${this.engine.roundNumber}-RAUND <span class="badge-sub">(Survival)</span>`;
        }

        const totalCardsInPlay = 36 - this.engine.eliminatedCards.size;
        this.elDeckTotal.textContent = `${totalCardsInPlay} / 36`;
        if (this.elDealDist) {
            this.elDealDist.textContent = this.engine.lastDealDistribution || '6 - 6 - 6 - 6';
        }
        this.elBurnedCount.textContent = `${this.engine.eliminatedCards.size} ta`;

        // Turn status banner
        const turnPlayerId = this.engine.getCurrentTurnPlayerId();
        const turnPlayer = turnPlayerId !== null ? this.engine.players[turnPlayerId] : null;
        const defender = this.engine.players[this.engine.defenderId];
        const primary = this.engine.players[this.engine.primaryAttackerId];

        if (this.engine.phase === window.BOUT_PHASE.ROUND_OVER) {
            this.elTurnBanner.innerHTML = `🏁 Raund yakunlandi!`;
            this.elTurnSub.textContent = `Natijalar oynasida keyingi raundga o'ting`;
            return;
        }
        if (this.engine.phase === window.BOUT_PHASE.GAME_OVER) {
            const champ = this.engine.players[this.engine.tournamentWinnerId];
            this.elTurnBanner.innerHTML = `👑 CHEMPION: ${champ ? champ.name : ''}!`;
            this.elTurnSub.textContent = `Turnir yakunlandi`;
            return;
        }

        if (!turnPlayer) return;

        if (turnPlayer.id === 0) {
            this.elTurnBanner.classList.add('your-turn-glow');
        } else {
            this.elTurnBanner.classList.remove('your-turn-glow');
        }

        if (this.engine.phase === window.BOUT_PHASE.INITIAL_ATTACK) {
            this.elTurnBanner.innerHTML = turnPlayer.id === 0
                ? `⚔️ SIZNING NAVBATINGIZ: ${defender.name} ga yuring!`
                : `⚔️ ${turnPlayer.name} ➡️ ${defender.name} ga hujum qilmoqda...`;
            this.elTurnSub.textContent = `Soat mili bo'yicha birinchi yurish | Izma-iz tarqatildi: ${this.engine.lastDealDistribution}`;
        } else if (this.engine.phase === window.BOUT_PHASE.DEFENSE) {
            const openPair = this.engine.tablePairs.find(p => p.defense === null);
            const attCardStr = openPair ? `${openPair.attack.fullName} (${openPair.attack.label}${openPair.attack.symbol})` : '';
            this.elTurnBanner.innerHTML = turnPlayer.id === 0
                ? `🛡️ HIMOYALANING: ${attCardStr} ni kesing yoki ko'taring!`
                : `🛡️ ${defender.name} himoyalanmoqda (${attCardStr})...`;
            this.elTurnSub.textContent = openPair && openPair.attack.suit === defender.trumpSuit
                ? `⚠️ Diqqat: Hujum shaxsiy ko'ziringizda! Faqat kattaroq ${openPair.attack.suitName} bilan kesiladi!`
                : `Kattaroq ${openPair ? openPair.attack.suitName : ''} yoki shaxsiy ko'ziringiz bilan kesing`;
        } else if (this.engine.phase === window.BOUT_PHASE.PRIMARY_PODKID) {
            this.elTurnBanner.innerHTML = turnPlayer.id === 0
                ? `🎯 PODKID (O'ng taraf): Mos karta tashlang yoki «Pas» bering!`
                : `🎯 ${primary.name} (O'ng taraf) podkid qidirmoqda...`;
            this.elTurnSub.textContent = `O'ngdagi hujumchi pas bersa, navbat chapdagi o'yinchiga o'tadi va o'ngdagi qayta yura olmaydi!`;
        } else if (this.engine.phase === window.BOUT_PHASE.SECONDARY_PODKID) {
            this.elTurnBanner.innerHTML = turnPlayer.id === 0
                ? `🔥 PODKID (Chap taraf): O'ngdagi pas berdi! Mos karta tashlang yoki «Bita» qiling!`
                : `🔥 ${turnPlayer.name} (Chap taraf) podkid qidirmoqda... (${primary.name} pas bergan)`;
            this.elTurnSub.textContent = `O'ngdagi (${primary.name}) va To'g'ridagi o'yinchi endi aralasha olmaydi!`;
        }
    }

    /**
     * Renders all 4 seats around the table (Seat 0 = Bottom, Seat 1 = Left, Seat 2 = Top, Seat 3 = Right)
     */
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
            seatEl.classList.toggle('blocked-opposite-seat', p.id === this.engine.oppositeBlockedId);

            // Render Role Pill
            const roleEl = seatEl.querySelector('.seat-role-pill');
            if (roleEl) {
                roleEl.className = `seat-role-pill ${roleInfo.cssClass}`;
                roleEl.innerHTML = roleInfo.html;
            }

            // Render Trump Suit Emblem & Name
            const suitBadgeEl = seatEl.querySelector('.seat-trump-badge');
            if (suitBadgeEl) {
                suitBadgeEl.style.borderColor = suitObj.accent;
                suitBadgeEl.style.background = suitObj.bgGlow;
                suitBadgeEl.innerHTML = `<span class="suit-sym color-${suitObj.color}">${suitObj.symbol}</span> <span>${suitObj.name}</span>`;
            }

            // Render Card Count, Dealt Count (e.g. 6 or 5 in 6-6-6-5), & Dealer Badge
            const metaEl = seatEl.querySelector('.seat-card-count');
            if (metaEl) {
                const dealerTag = this.engine.dealerId === p.id ? `<span class="dealer-chip" title="Raund dileri (oxirgi bo'lib karta oladi)">DILER</span>` : '';
                const dealtTag = `<span class="dealt-chip" title="Raund boshida izma-iz tarqatilgan kartalar soni">Tarqatildi: ${p.dealtCount}</span>`;
                metaEl.innerHTML = `🃏 ${p.hand.length} ta ${dealtTag} ${dealerTag}`;
            }

            // Render 9 Personal Trump Survival Strip (6 7 8 9 10 V D K T)
            const stripEl = seatEl.querySelector('.trump-survival-strip');
            if (stripEl) {
                const ranks = [
                    { v: 6, l: '6' }, { v: 7, l: '7' }, { v: 8, l: '8' },
                    { v: 9, l: '9' }, { v: 10, l: '10' }, { v: 11, l: 'V' },
                    { v: 12, l: 'D' }, { v: 13, l: 'K' }, { v: 14, l: 'T' }
                ];
                stripEl.innerHTML = ranks.map(r => {
                    const isLost = p.lostTrumps.includes(r.v);
                    const nextToLose = !isLost && !p.lostTrumps.some(x => x > r.v) &&
                        r.v === Math.min(...[6,7,8,9,10,11,12,13,14].filter(v => !p.lostTrumps.includes(v)));
                    return `<span class="trump-pip-pip ${isLost ? 'pip-burned' : 'pip-alive'} ${nextToLose ? 'pip-next-target' : ''}" title="${suitObj.name} ${r.l}: ${isLost ? 'O\'yindan chiqqan!' : 'O\'yinda bor'}">${r.l}${isLost ? '' : suitObj.symbol}</span>`;
                }).join('');
            }

            // Render Bot Fanned Face-Down Cards (for Seats 1, 2, 3)
            if (!p.isHuman) {
                const fanEl = seatEl.querySelector('.bot-card-fan');
                if (fanEl) {
                    if (p.eliminated) {
                        fanEl.innerHTML = `<div class="eliminated-stamp">💀 CHETLATILDI</div>`;
                    } else if (p.outOfRound) {
                        fanEl.innerHTML = `<div class="safe-stamp">✅ QUTULDI</div>`;
                    } else {
                        const maxVisible = Math.min(p.hand.length, 10);
                        let backsHTML = '';
                        for (let i = 0; i < maxVisible; i++) {
                            const angle = (i - (maxVisible - 1) / 2) * 5;
                            backsHTML += `<div class="mini-card-back" style="transform: rotate(${angle}deg)"></div>`;
                        }
                        fanEl.innerHTML = backsHTML;
                    }
                }
            }
        }
    }

    /**
     * Computes clear Uzbek badge describing each player's exact role in the current bout
     */
    getPlayerBoutRoleBadge(playerId) {
        const p = this.engine.players[playerId];
        if (p.eliminated) {
            return { html: "💀 O'YINDAN CHIQQAN", cssClass: 'role-eliminated' };
        }
        if (p.outOfRound) {
            return { html: '🏆 RAUNDDAN QUTULDI', cssClass: 'role-safe' };
        }

        if (playerId === this.engine.defenderId) {
            return { html: '🛡️ HIMOYACHI', cssClass: 'role-defender' };
        }

        if (playerId === this.engine.primaryAttackerId) {
            if (this.engine.primaryPassed) {
                return { html: '🚫 PAS BERDI (Yura olmaydi)', cssClass: 'role-passed-locked' };
            }
            return { html: "⚔️ HUJUMCHI (O'ng taraf)", cssClass: 'role-attacker' };
        }

        if (playerId === this.engine.secondaryAttackerId) {
            if (this.engine.primaryPassed) {
                if (this.engine.secondaryPassed) {
                    return { html: '✋ PAS BERDI', cssClass: 'role-passed-locked' };
                }
                return { html: '🎯 PODKID NAVBATI (Chap taraf)', cssClass: 'role-secondary-active' };
            }
            return { html: "⏳ CHAP TARAF (O'ngdan keyin)", cssClass: 'role-secondary-wait' };
        }

        if (playerId === this.engine.oppositeBlockedId) {
            return { html: "🔒 TO'G'RIDA (Yura olmaydi!)", cssClass: 'role-opposite-blocked' };
        }

        return { html: '⏳ KUTMOQDA', cssClass: 'role-neutral' };
    }

    /**
     * Renders the central battleground, closed Talon deck, and Bita discard pile
     */
    renderTableCenter() {
        const deckLen = this.engine.deck.length;
        this.elTalonCount.textContent = `${deckLen} ta`;
        if (deckLen === 0) {
            this.elTalonStack.classList.add('empty-pile');
            this.elTalonStack.innerHTML = `<div class="empty-deck-placeholder">KOLODA<br>TUGADI</div>`;
        } else {
            this.elTalonStack.classList.remove('empty-pile');
            const layers = Math.min(4, Math.ceil(deckLen / 4));
            let stackHTML = '';
            for (let i = 0; i < layers; i++) {
                stackHTML += `<div class="talon-layer" style="transform: translate(${-i * 2}px, ${-i * 2}px)"></div>`;
            }
            stackHTML += `<div class="talon-secret-lock" title="Qoidaga binoan yerdagi oxirgi karta ko'rinmaydi!">🔒 YOPIQ KOLODA</div>`;
            this.elTalonStack.innerHTML = stackHTML;
        }

        const bitaLen = this.engine.bitaPile.length;
        this.elBitaCount.textContent = `${bitaLen} ta`;
        this.elBitaStack.classList.toggle('empty-pile', bitaLen === 0);

        if (this.engine.tablePairs.length === 0) {
            this.elBattlePairs.innerHTML = '';
            this.elTableCenterHint.classList.remove('hidden');
            const att = this.engine.players[this.engine.primaryAttackerId];
            const def = this.engine.players[this.engine.defenderId];
            if (att && def) {
                this.elTableCenterHint.innerHTML = `
                    <div class="center-matchup-pill">
                        <span>⚔️ <strong>${att.name}</strong></span>
                        <span class="arrow-pulse">➔</span>
                        <span>🛡️ <strong>${def.name}</strong> (${window.CardsAPI.SUITS[def.trumpSuit].symbol} ${window.CardsAPI.SUITS[def.trumpSuit].name})</span>
                    </div>
                `;
            }
            return;
        }

        this.elTableCenterHint.classList.add('hidden');
        const defender = this.engine.players[this.engine.defenderId];

        this.elBattlePairs.innerHTML = this.engine.tablePairs.map((pair, idx) => {
            const attOwner = this.engine.players[pair.thrownBy];
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
            } else {
                defenseHTML = `<div class="pair-defense-slot awaiting-defense"><div class="awaiting-pulse">🛡️ Kutilmoqda</div></div>`;
            }

            return `
            <div class="battle-pair-slot" data-pair-index="${idx}">
                <div class="pair-thrown-by">${attOwner ? attOwner.name : ''}</div>
                <div class="pair-attack-slot">${attackHTML}</div>
                ${defenseHTML}
            </div>`;
        }).join('');
    }

    /**
     * Renders the Human Player's hand at the bottom with smart playability highlights and tooltips
     */
    renderHumanHand() {
        const human = this.engine.players[0];
        const container = document.getElementById('human-hand-cards');
        if (!container || !human) return;

        if (human.eliminated) {
            container.innerHTML = `<div class="human-status-banner eliminated">💀 Siz barcha 9 ta ko'ziringizni yo'qotib o'yindan chiqdingiz!</div>`;
            return;
        }
        if (human.outOfRound) {
            container.innerHTML = `<div class="human-status-banner safe">🏆 Siz bu raundda kartalaringizni tugatib qutuldingiz! Botlar raundni yakunlamoqda...</div>`;
            return;
        }

        const isMyTurn = this.engine.getCurrentTurnPlayerId() === 0;
        const openPair = this.engine.tablePairs.find(p => p.defense === null);

        container.innerHTML = human.hand.map(card => {
            const isPersonalTrump = card.suit === human.trumpSuit;
            let isPlayable = false;
            let invalidReason = '';

            if (isMyTurn) {
                if (this.engine.phase === window.BOUT_PHASE.DEFENSE && openPair) {
                    const check = this.engine.canBeatCard(0, openPair.attack, card);
                    isPlayable = check.valid;
                    invalidReason = check.reason || '';
                } else if (
                    this.engine.phase === window.BOUT_PHASE.INITIAL_ATTACK ||
                    this.engine.phase === window.BOUT_PHASE.PRIMARY_PODKID ||
                    this.engine.phase === window.BOUT_PHASE.SECONDARY_PODKID
                ) {
                    const check = this.engine.canAttackWithCard(0, card);
                    isPlayable = check.valid;
                    invalidReason = check.reason || '';
                }
            } else {
                invalidReason = 'Hozir sizning navbatingiz emas!';
            }

            return window.CardsAPI.createCardHTML(card, {
                isPersonalTrump,
                isPlayable,
                invalidReason
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
        const turnId = this.engine.getCurrentTurnPlayerId();
        const isMyTurn = turnId === 0;

        const canPass = isMyTurn && (
            this.engine.phase === window.BOUT_PHASE.PRIMARY_PODKID ||
            this.engine.phase === window.BOUT_PHASE.SECONDARY_PODKID
        );
        this.btnPass.disabled = !canPass;
        this.btnPass.classList.toggle('btn-glow-ready', canPass);
        if (this.engine.phase === window.BOUT_PHASE.SECONDARY_PODKID && isMyTurn) {
            this.btnPass.innerHTML = `✨ Bita (Menda boshqa yo'q)`;
        } else {
            this.btnPass.innerHTML = `✋ Pas (Menda boshqa yo'q)`;
        }

        const canTake = isMyTurn && this.engine.phase === window.BOUT_PHASE.DEFENSE;
        this.btnTake.disabled = !canTake;
        this.btnTake.classList.toggle('btn-danger-ready', canTake);

        this.btnAutoHint.disabled = !isMyTurn;
    }

    renderLogs() {
        if (!this.elLogList) return;
        this.elLogList.innerHTML = this.engine.logs.slice(0, 28).map(item => `
            <div class="log-entry log-${item.type}">
                <span class="log-time">${item.time}</span>
                <span class="log-msg">${item.message}</span>
            </div>
        `).join('');
    }

    onHumanCardClick(cardId, cardEl, event) {
        const turnId = this.engine.getCurrentTurnPlayerId();
        if (turnId !== 0) {
            window.soundFX.playError();
            this.showToast('Hozir sizning navbatingiz emas!', 'warn');
            return;
        }

        if (this.engine.phase === window.BOUT_PHASE.DEFENSE) {
            const res = this.engine.playDefenseCard(0, cardId);
            if (!res.success) {
                window.soundFX.playError();
                cardEl.classList.add('shake-card');
                setTimeout(() => cardEl.classList.remove('shake-card'), 400);
                this.showToast(res.reason, 'error');
                return;
            }

            window.soundFX.playCardPlace(res.usedOwnTrump);
            if (res.usedOwnTrump && event) {
                this.spawnBurstParticles(event.clientX, event.clientY, '#ecc94b', 28);
                this.showToast("👑 Shaxsiy ko'ziringiz bilan kesdingiz!", 'gold');
            }
            if (res.bitaTriggered) {
                window.soundFX.playBita();
            }

            this.afterMoveUpdate();
            return;
        }

        if (
            this.engine.phase === window.BOUT_PHASE.INITIAL_ATTACK ||
            this.engine.phase === window.BOUT_PHASE.PRIMARY_PODKID ||
            this.engine.phase === window.BOUT_PHASE.SECONDARY_PODKID
        ) {
            const res = this.engine.playAttackCard(0, cardId);
            if (!res.success) {
                window.soundFX.playError();
                cardEl.classList.add('shake-card');
                setTimeout(() => cardEl.classList.remove('shake-card'), 400);
                this.showToast(res.reason, 'error');
                return;
            }

            const isOwnTrump = res.card.suit === this.engine.players[0].trumpSuit;
            window.soundFX.playCardPlace(isOwnTrump);
            this.afterMoveUpdate();
        }
    }

    onHumanPass() {
        const res = this.engine.declarePass(0);
        if (!res.success) {
            window.soundFX.playError();
            this.showToast(res.reason, 'warn');
            return;
        }
        if (res.bita) {
            window.soundFX.playBita();
        } else {
            window.soundFX.playPass();
        }
        this.afterMoveUpdate();
    }

    onHumanTake() {
        const res = this.engine.defenderTakesCards();
        if (!res.success) {
            window.soundFX.playError();
            this.showToast(res.reason, 'warn');
            return;
        }
        window.soundFX.playTake();
        this.showToast("Stoldagi kartalarni qo'lingizga oldingiz.", 'warn');
        this.afterMoveUpdate();
    }

    onHumanSmartMove() {
        if (this.engine.getCurrentTurnPlayerId() !== 0) return;
        const decision = window.BotAI.decideMove(this.engine, 0);
        if (!decision) return;

        if (decision.action === 'attack' || decision.action === 'defend') {
            const cardEl = document.querySelector(`#human-hand-cards .playing-card[data-card-id="${decision.cardId}"]`);
            this.onHumanCardClick(decision.cardId, cardEl || document.body, null);
        } else if (decision.action === 'pass') {
            this.onHumanPass();
        } else if (decision.action === 'take') {
            this.onHumanTake();
        }
    }

    afterMoveUpdate() {
        this.renderAll();

        if (this.engine.phase === window.BOUT_PHASE.ROUND_OVER ||
            this.engine.phase === window.BOUT_PHASE.GAME_OVER) {
            setTimeout(() => this.showRoundEndModal(), 450);
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
        if (turnPlayerId === null || turnPlayerId === 0) {
            return;
        }

        const humanOut = this.engine.players[0].outOfRound || this.engine.players[0].eliminated;
        const baseDelay = humanOut ? 240 : 750;
        const delay = Math.round(baseDelay / this.gameSpeed);

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

    /**
     * Displays the dramatic Round End & Card Burning Ceremony Modal + Syncs with Node.js Backend
     */
    showRoundEndModal() {
        // Sync round outcome with Backend Database
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
            titleEl.innerHTML = `👑 TURNIR YAKUNLANDI: ${champ.name.toUpperCase()} CHEMPION!`;
            subtitleEl.innerHTML = `Barcha raqiblarning ko'zirlari tugab, yagona mutlaq g'olib aniqlandi!`;
            btnNext.innerHTML = `🔄 Yangi Turnir Boshlash`;
        } else if (this.engine.roundNumber === 0) {
            window.soundFX.playVictory();
            titleEl.innerHTML = `🏁 0-RAUND (SARALASH) YAKUNLANDI!`;
            subtitleEl.innerHTML = `🥇 1-Raundni boshlaydi: <strong>${winner.name}</strong> &nbsp;|&nbsp; 🃏 Diler (Tarqatuvchi): <strong>${loser.name}</strong>`;
            ceremonyBox.innerHTML = `
                <div class="qual-complete-banner">
                    <div class="qual-icon">⚔️</div>
                    <div>
                        <h4>Asosiy Survival O'yin Boshlanmoqda!</h4>
                        <p>0-raundda hech kimning kartasi yonmaydi. Endi 1-raunddan boshlab har safar yutqazgan o'yinchining shaxsiy ko'ziri <strong>6 dan Tuzgacha</strong> bittadan o'yindan butunlay chiqarib yuboriladi!</p>
                    </div>
                </div>
            `;
            btnNext.innerHTML = `🔥 1-Raundni Boshlash`;
        } else {
            window.soundFX.playCardBurn();
            const burned = this.engine.lastBurnedCard;
            titleEl.innerHTML = `🔥 ${this.engine.roundNumber}-RAUND YAKUNLANDI!`;
            subtitleEl.innerHTML = `🥇 Keyingi raundni boshlaydi: <strong>${winner.name}</strong> &nbsp;|&nbsp; 💀 Raund mag'lubi (Diler): <strong>${loser.name}</strong>`;

            if (burned) {
                const burnedCardHTML = window.CardsAPI.createCardHTML(burned, { isPersonalTrump: true });
                ceremonyBox.innerHTML = `
                    <div class="burn-stage">
                        <div class="burning-card-wrapper">
                            ${burnedCardHTML}
                            <div class="fire-overlay">🔥 O'YINDAN CHIQDI</div>
                        </div>
                        <div class="burn-info-panel">
                            <div class="burn-alert-tag">JAZO QO'LLANILDI</div>
                            <h3>${burned.loserName}ning «${burned.fullName}» (${burned.label}${burned.symbol}) ko'ziri yondi!</h3>
                            <p>Ushbu karta kolodadan butunlay olib tashlandi va keyingi o'yinlarda hech qachon qaytmaydi. Kolodada endi <strong>${burned.nextTotalCards} ta</strong> karta qoldi.</p>
                            <div class="remaining-shield-bar">
                                🛡️ Qolgan ko'zirlar: <strong>${burned.remainingTrumps} / 9</strong> &nbsp;|&nbsp;
                                🔄 Keyingi raund izma-iz tarqatilishi: <strong style="color:#6ee7b7">${burned.nextDealPreview}</strong>
                                ${burned.remainingTrumps === 0 ? '<span class="elim-badge">💀 O\'YINDAN CHETLATILDI!</span>' : ''}
                            </div>
                        </div>
                    </div>
                `;
            }
            btnNext.innerHTML = `➡️ ${this.engine.roundNumber + 1}-Raundga O'tish (Tarqatish: ${burned ? burned.nextDealPreview : '6-6-6-6'})`;
        }

        standingsEl.innerHTML = this.engine.players.map(p => {
            const suitObj = window.CardsAPI.SUITS[p.trumpSuit];
            const aliveCount = 9 - p.lostTrumps.length;
            const ranks = [
                { v: 6, l: '6' }, { v: 7, l: '7' }, { v: 8, l: '8' },
                { v: 9, l: '9' }, { v: 10, l: '10' }, { v: 11, l: 'V' },
                { v: 12, l: 'D' }, { v: 13, l: 'K' }, { v: 14, l: 'T' }
            ];
            return `
            <div class="standing-player-row ${p.id === loser.id && this.engine.roundNumber > 0 ? 'loser-row-highlight' : ''} ${p.eliminated ? 'eliminated-row' : ''}">
                <div class="st-left">
                    <span class="st-suit color-${suitObj.color}">${suitObj.symbol}</span>
                    <div>
                        <div class="st-name">${p.name}</div>
                        <div class="st-sub">${suitObj.name} ko'ziri (${aliveCount}/9 tirik)</div>
                    </div>
                </div>
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

        if (this.engine.totalCardsAtRoundStart < 24) {
            this.showToast(
                `🔄 Izma-iz tarqatildi: <strong>${this.engine.lastDealDistribution}</strong> (Diler: ${this.engine.players[dealerId].name})`,
                'gold'
            );
        }

        this.scheduleBotTurnIfNeeded();
    }

    renderGraveyardModal() {
        const container = document.getElementById('graveyard-modal-body');
        if (!container) return;

        const ranks = [
            { v: 6, l: '6' }, { v: 7, l: '7' }, { v: 8, l: '8' },
            { v: 9, l: '9' }, { v: 10, l: '10' }, { v: 11, l: 'V' },
            { v: 12, l: 'D' }, { v: 13, l: 'K' }, { v: 14, l: 'T' }
        ];

        container.innerHTML = this.engine.players.map(p => {
            const suitObj = window.CardsAPI.SUITS[p.trumpSuit];
            const alive = 9 - p.lostTrumps.length;
            return `
            <div class="graveyard-player-card">
                <div class="gp-header">
                    <span class="gp-suit color-${suitObj.color}">${suitObj.symbol} ${suitObj.name}</span>
                    <span class="gp-player">${p.name} (Oxirgi tarqatishda: ${p.dealtCount} ta karta oldi)</span>
                    <span class="gp-count">${alive} / 9 qoldi</span>
                </div>
                <div class="gp-cards-row">
                    ${ranks.map(r => {
                        const burned = p.lostTrumps.includes(r.v);
                        return `
                        <div class="gp-mini-card ${burned ? 'gp-burned' : 'gp-alive'} color-${suitObj.color}">
                            <div class="gp-rank">${r.l}</div>
                            <div class="gp-sym">${suitObj.symbol}</div>
                            ${burned ? '<div class="gp-burn-x">🔥</div>' : ''}
                        </div>`;
                    }).join('')}
                </div>
            </div>`;
        }).join('');
    }

    showToast(message, type = 'info') {
        if (!this.elToastContainer) return;
        const toast = document.createElement('div');
        toast.className = `game-toast toast-${type}`;
        toast.innerHTML = message;
        this.elToastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-fade-out');
            setTimeout(() => toast.remove(), 350);
        }, 3400);
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

        for (let i = 0; i < 32; i++) {
            this.particles.push({
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                vx: (Math.random() - 0.5) * 0.25,
                vy: -Math.random() * 0.35 - 0.1,
                size: Math.random() * 2 + 0.8,
                alpha: Math.random() * 0.35 + 0.1,
                color: '#ecc94b',
                ambient: true
            });
        }

        const animate = () => {
            this.updateParticles();
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }

    spawnBurstParticles(x, y, color = '#ecc94b', count = 24) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 5 + 1.5;
            this.particles.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: Math.random() * 3.5 + 1.5,
                alpha: 1,
                color,
                ambient: false
            });
        }
    }

    updateParticles() {
        if (!this.particleCtx || !this.particleCanvas) return;
        const ctx = this.particleCtx;
        const w = this.particleCanvas.width;
        const h = this.particleCanvas.height;

        ctx.clearRect(0, 0, w, h);

        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;

            if (p.ambient) {
                if (p.y < 0) p.y = h;
                if (p.x < 0) p.x = w;
                if (p.x > w) p.x = 0;
            } else {
                p.alpha -= 0.025;
                p.vy += 0.08;
                if (p.alpha <= 0) {
                    this.particles.splice(i, 1);
                    continue;
                }
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
