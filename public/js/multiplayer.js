/**
 * ============================================================================
 * 4 KO'ZIR: OMON QOLISH — REAL-TIME ONLINE MULTIPLAYER & QR ROOM MANAGER
 * ============================================================================
 * Features:
 * 1. WebRTC P2P Data Channels via PeerJS (Zero-Lag, Browser-to-Browser)
 * 2. Dynamic QR Code Generation for Direct Camera Scan Joining
 * 3. 4-Digit Room PIN & 1-Click Shareable Link System
 * 4. Hybrid Host-Authoritative Engine (Host runs logic + bots for empty seats)
 * 5. Automatic Fallback & Reconnection Handling
 */

class MultiplayerManager {
    constructor(gameUI) {
        this.gameUI = gameUI;
        this.peer = null;
        this.isHost = false;
        this.isGuest = false;
        this.roomCode = null;
        this.mySeatId = 0; // 0: Bottom (Host/Default), 1: Right, 2: Top, 3: Left
        this.myName = "Siz";
        this.hostConn = null; // Guest's connection to host
        this.guestConns = new Map(); // Host's map of seatId -> conn
        this.qrInstance = null;

        this.playerSlots = [
            { seat: 0, name: "Siz (Xona Egasi)", isConnected: true, isBot: false },
            { seat: 1, name: "Jasur (O'ngda)", isConnected: false, isBot: true },
            { seat: 2, name: "Ulug'bek (To'g'rida)", isConnected: false, isBot: true },
            { seat: 3, name: "Sardor (Chapda)", isConnected: false, isBot: true }
        ];

        this.initDOM();
        this.checkURLParams();
    }

    initDOM() {
        this.modal = document.getElementById('modal-multiplayer');
        this.btnOpenModal = document.getElementById('btn-open-multiplayer');
        this.btnCloseModal = document.getElementById('btn-close-multiplayer');

        this.tabHost = document.getElementById('tab-btn-host');
        this.tabJoin = document.getElementById('tab-btn-join');
        this.panelHost = document.getElementById('panel-host-room');
        this.panelJoin = document.getElementById('panel-join-room');

        this.elQRContainer = document.getElementById('room-qr-canvas-box');
        this.elHostCodeDisplay = document.getElementById('host-room-code-display');
        this.btnCopyCode = document.getElementById('btn-copy-room-code');
        this.btnCopyLink = document.getElementById('btn-copy-room-link');
        this.btnStartGame = document.getElementById('btn-start-multiplayer-host');
        this.lobbySlotsContainer = document.getElementById('lobby-players-slots');

        this.inputJoinName = document.getElementById('join-player-name-input');
        this.inputJoinCode = document.getElementById('join-room-code-input');
        this.btnSubmitJoin = document.getElementById('btn-submit-join-room');
        this.joinStatusBox = document.getElementById('join-status-feedback');

        this.bindEvents();
    }

    bindEvents() {
        if (this.btnOpenModal) {
            this.btnOpenModal.addEventListener('click', () => {
                this.modal.classList.remove('hidden');
                if (!this.isHost && !this.isGuest) {
                    this.setupHostRoom();
                }
            });
        }

        if (this.btnCloseModal) {
            this.btnCloseModal.addEventListener('click', () => {
                this.modal.classList.add('hidden');
            });
        }

        if (this.tabHost) {
            this.tabHost.addEventListener('click', () => {
                this.tabHost.classList.add('active');
                this.tabJoin.classList.remove('active');
                this.panelHost.classList.remove('hidden');
                this.panelJoin.classList.add('hidden');
                if (!this.isHost && !this.isGuest) {
                    this.setupHostRoom();
                }
            });
        }

        if (this.tabJoin) {
            this.tabJoin.addEventListener('click', () => {
                this.tabJoin.classList.add('active');
                this.tabHost.classList.remove('active');
                this.panelJoin.classList.remove('hidden');
                this.panelHost.classList.add('hidden');
            });
        }

        if (this.btnCopyCode) {
            this.btnCopyCode.addEventListener('click', () => {
                if (!this.roomCode) return;
                navigator.clipboard.writeText(this.roomCode).then(() => {
                    this.gameUI.showToast(`Xona kodi (${this.roomCode}) nusxalandi!`);
                });
            });
        }

        if (this.btnCopyLink) {
            this.btnCopyLink.addEventListener('click', () => {
                const url = this.getRoomURL();
                navigator.clipboard.writeText(url).then(() => {
                    this.gameUI.showToast("Havola nusxalandi! Telegram yoki WhatsApp'da do'stlarga yuboring.");
                });
            });
        }

        if (this.btnStartGame) {
            this.btnStartGame.addEventListener('click', () => {
                this.modal.classList.add('hidden');
                this.gameUI.showToast("Onlayn o'yin boshlandi! Boshlang'ich Oddiy Durak o'ynalmoqda.");
                if (this.isHost) {
                    this.broadcastState();
                }
            });
        }

        if (this.btnSubmitJoin) {
            this.btnSubmitJoin.addEventListener('click', () => {
                const code = (this.inputJoinCode.value || '').trim();
                const name = (this.inputJoinName.value || '').trim() || "Do'st";
                if (!code || code.length < 4) {
                    this.setJoinStatus("Iltimos, 4 xonali xona kodini to'liq kiriting!", "error");
                    return;
                }
                this.joinRoom(code, name);
            });
        }
    }

    checkURLParams() {
        const params = new URLSearchParams(window.location.search);
        const room = params.get('room');
        if (room) {
            setTimeout(() => {
                if (this.modal) this.modal.classList.remove('hidden');
                if (this.tabJoin) this.tabJoin.click();
                if (this.inputJoinCode) this.inputJoinCode.value = room;
                this.setJoinStatus(`QR kod orqali ${room}-xonaga ulanish tayyor. Ismingizni kiritib "Xonaga Ulanish"ni bosing!`, 'info');
            }, 500);
        }
    }

    getRoomURL() {
        const base = window.location.origin + window.location.pathname;
        return `${base}?room=${this.roomCode}`;
    }

    /**
     * Create Host Peer with room code
     */
    setupHostRoom() {
        if (this.isHost && this.roomCode) {
            this.renderLobbySlots();
            return;
        }

        this.isHost = true;
        this.isGuest = false;
        this.mySeatId = 0;
        this.roomCode = String(Math.floor(1000 + Math.random() * 9000));

        if (this.elHostCodeDisplay) {
            this.elHostCodeDisplay.textContent = this.roomCode;
        }

        // Render QR Code
        this.renderQRCode(this.getRoomURL());
        this.renderLobbySlots();

        // Initialize PeerJS Host
        if (typeof window.Peer === 'undefined') {
            console.warn('PeerJS library loading...');
            return;
        }

        const peerId = `kozgir-v2-${this.roomCode}`;
        try {
            if (this.peer) this.peer.destroy();
            this.peer = new window.Peer(peerId, {
                debug: 1
            });

            this.peer.on('open', (id) => {
                console.log('Host Peer ready:', id);
                this.gameUI.showToast(`Xona ochildi: #${this.roomCode}. Do'stlaringizni taklif qiling!`);
            });

            this.peer.on('connection', (conn) => {
                this.handleIncomingGuestConnection(conn);
            });

            this.peer.on('error', (err) => {
                console.warn('Host Peer error:', err);
                if (err.type === 'unavailable-id') {
                    // Try another code if occupied
                    this.roomCode = String(Math.floor(1000 + Math.random() * 9000));
                    this.setupHostRoom();
                }
            });
        } catch (e) {
            console.error('Peer creation failed:', e);
        }
    }

    handleIncomingGuestConnection(conn) {
        conn.on('open', () => {
            conn.on('data', (data) => {
                if (data.type === 'REQUEST_JOIN') {
                    // Find first available seat among 1, 2, 3
                    let assignedSeat = null;
                    for (let s = 1; s <= 3; s++) {
                        if (!this.playerSlots[s].isConnected) {
                            assignedSeat = s;
                            break;
                        }
                    }

                    if (assignedSeat === null) {
                        conn.send({ type: 'JOIN_REJECTED', reason: "Xona to'lgan! (4/4)" });
                        return;
                    }

                    // Assign seat
                    this.playerSlots[assignedSeat].isConnected = true;
                    this.playerSlots[assignedSeat].isBot = false;
                    this.playerSlots[assignedSeat].name = data.playerName || `O'yinchi ${assignedSeat + 1}`;
                    this.guestConns.set(assignedSeat, conn);

                    // Update UI Seat Name
                    const seatEl = document.getElementById(`player-seat-${assignedSeat}`);
                    if (seatEl) {
                        const nameEl = seatEl.querySelector('.player-name');
                        if (nameEl) nameEl.textContent = `🟢 ${this.playerSlots[assignedSeat].name}`;
                    }

                    // Welcome payload
                    conn.send({
                        type: 'JOIN_ACCEPTED',
                        seatId: assignedSeat,
                        roomCode: this.roomCode,
                        players: this.playerSlots,
                        state: this.gameUI.engine.serializeState()
                    });

                    this.renderLobbySlots();
                    this.broadcastLobbyUpdate();
                    this.gameUI.showToast(`🎉 ${this.playerSlots[assignedSeat].name} stolga qo'shildi!`);
                } else if (data.type === 'CLIENT_MOVE') {
                    this.handleClientMove(conn, data);
                }
            });
        });

        conn.on('close', () => {
            // Find which seat disconnected
            for (const [seatId, c] of this.guestConns.entries()) {
                if (c === conn) {
                    this.guestConns.delete(seatId);
                    this.playerSlots[seatId].isConnected = false;
                    this.playerSlots[seatId].isBot = true;
                    this.playerSlots[seatId].name = seatId === 1 ? "Jasur (Bot)" : seatId === 2 ? "Ulug'bek (Bot)" : "Sardor (Bot)";
                    this.gameUI.showToast(`⚠️ ${seatId}-o'yinchi chiqdi, uning o'rnini bot oldi.`);
                    this.renderLobbySlots();
                    this.broadcastLobbyUpdate();
                    break;
                }
            }
        });
    }

    handleClientMove(conn, data) {
        if (!this.isHost) return;
        const seatId = data.seatId;
        const turnId = this.gameUI.engine.getCurrentTurnPlayerId();

        if (turnId !== seatId) {
            console.warn(`Move ignored: not seat ${seatId}'s turn`);
            return;
        }

        const engine = this.gameUI.engine;
        let success = false;

        if (data.action === 'attack') {
            success = engine.playAttackCard(seatId, data.cardId);
        } else if (data.action === 'defend') {
            success = engine.playDefenseCard(seatId, data.cardId);
        } else if (data.action === 'pass') {
            success = engine.declarePass(seatId);
        } else if (data.action === 'take') {
            success = engine.defenderTakesCards();
        }

        if (success) {
            this.gameUI.renderAll();
            this.broadcastState();
            this.gameUI.scheduleBotTurnIfNeeded();
        }
    }

    /**
     * Join an existing host's room as Guest
     */
    joinRoom(code, playerName) {
        this.setJoinStatus("Xona qidirilmoqda va ulanmoqda...", "info");
        this.isHost = false;
        this.isGuest = true;
        this.roomCode = code;
        this.myName = playerName;

        if (typeof window.Peer === 'undefined') {
            this.setJoinStatus("Tarmoq xatosi: Peer kutubxonasi topilmadi", "error");
            return;
        }

        if (this.peer) this.peer.destroy();
        const guestId = `kozgir-guest-${Math.floor(100000 + Math.random() * 900000)}`;
        this.peer = new window.Peer(guestId, { debug: 1 });

        this.peer.on('open', () => {
            const hostPeerId = `kozgir-v2-${code}`;
            const conn = this.peer.connect(hostPeerId, { reliable: true });
            this.hostConn = conn;

            conn.on('open', () => {
                this.setJoinStatus("Xona egasiga so'rov yuborildi...", "info");
                conn.send({
                    type: 'REQUEST_JOIN',
                    playerName: this.myName
                });
            });

            conn.on('data', (data) => {
                this.handleHostMessage(data);
            });

            conn.on('error', (err) => {
                this.setJoinStatus("Ulanishda xatolik: " + err.message, "error");
            });

            conn.on('close', () => {
                this.setJoinStatus("Xona egasi o'yindan chiqdi yoki aloqa uzildi.", "error");
            });
        });

        this.peer.on('error', (err) => {
            this.setJoinStatus("Xonaga ulanib bo'lmadi! Kodni to'g'ri kiritganingizni tekshiring.", "error");
        });
    }

    handleHostMessage(data) {
        if (data.type === 'JOIN_ACCEPTED') {
            this.mySeatId = data.seatId;
            this.setJoinStatus(`Ulandingiz! Sizning o'rningiz: ${this.mySeatId + 1}-o'yinchi`, 'success');
            setTimeout(() => {
                this.modal.classList.add('hidden');
            }, 900);

            // Re-label human bottom bar with player's actual assigned seat
            const nameEl = document.querySelector('#player-seat-0 .player-name');
            if (nameEl) nameEl.textContent = `👤 ${this.myName} (Siz)`;

            if (data.state) {
                this.syncEngineFromState(data.state);
            }
        } else if (data.type === 'JOIN_REJECTED') {
            this.setJoinStatus(data.reason || "Xonaga kirib bo'lmadi", 'error');
        } else if (data.type === 'LOBBY_UPDATE') {
            this.playerSlots = data.players;
        } else if (data.type === 'STATE_UPDATE') {
            this.syncEngineFromState(data.state);
        }
    }

    syncEngineFromState(serializedState) {
        // Apply state to local engine
        this.gameUI.engine.deserializeState(serializedState);
        this.gameUI.renderAll();
    }

    /**
     * Send client move to host
     */
    sendMoveToHost(action, cardId = null) {
        if (!this.isGuest || !this.hostConn) return false;
        this.hostConn.send({
            type: 'CLIENT_MOVE',
            seatId: this.mySeatId,
            action,
            cardId
        });
        return true;
    }

    broadcastState() {
        if (!this.isHost) return;
        const serialized = this.gameUI.engine.serializeState();
        for (const conn of this.guestConns.values()) {
            if (conn && conn.open) {
                conn.send({
                    type: 'STATE_UPDATE',
                    state: serialized
                });
            }
        }
    }

    broadcastLobbyUpdate() {
        if (!this.isHost) return;
        for (const conn of this.guestConns.values()) {
            if (conn && conn.open) {
                conn.send({
                    type: 'LOBBY_UPDATE',
                    players: this.playerSlots
                });
            }
        }
    }

    renderQRCode(url) {
        if (!this.elQRContainer) return;
        this.elQRContainer.innerHTML = '';
        if (typeof window.QRCode !== 'undefined') {
            this.qrInstance = new window.QRCode(this.elQRContainer, {
                text: url,
                width: 190,
                height: 190,
                colorDark: '#1a202c',
                colorLight: '#ffffff',
                correctLevel: window.QRCode.CorrectLevel.M
            });
        } else {
            this.elQRContainer.innerHTML = `<div style="padding: 20px; color:#fff;">QR kod yuklanmoqda...</div>`;
        }
    }

    renderLobbySlots() {
        if (!this.lobbySlotsContainer) return;
        this.lobbySlotsContainer.innerHTML = this.playerSlots.map((p, idx) => {
            const isMe = (this.isHost && idx === 0) || (this.isGuest && idx === this.mySeatId);
            const statusBadge = p.isConnected
                ? `<span class="slot-badge connected">🟢 Ulandi</span>`
                : `<span class="slot-badge bot">🤖 Bot</span>`;
            return `
                <div class="lobby-slot-card ${isMe ? 'slot-me' : ''}">
                    <div class="slot-num">${idx + 1}-O'rin</div>
                    <div class="slot-name">${p.name}</div>
                    ${statusBadge}
                </div>
            `;
        }).join('');
    }

    setJoinStatus(msg, type = 'info') {
        if (!this.joinStatusBox) return;
        this.joinStatusBox.className = `join-status-msg status-${type}`;
        this.joinStatusBox.textContent = msg;
    }
}

window.MultiplayerManager = MultiplayerManager;
