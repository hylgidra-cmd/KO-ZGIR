/**
 * Vercel Serverless Function — 4 KO'ZIR API Endpoint
 */
const { FourTrumpsEngine } = require('../js/engine.js');
const BotAI = require('../js/ai.js');

// In-memory state for serverless environment
let stats = {
    totalRoundsPlayed: 14,
    totalTournamentsCompleted: 3,
    totalTrumpsBurned: 12,
    humanWins: 2,
    suitPickCounts: { diamonds: 4, spades: 3, hearts: 5, clubs: 2 }
};

let leaderboard = [
    { name: "Siz (Asosiy O'yinchi)", rating: 1548, wins: 2, roundsWon: 6, trumpsSaved: 9, badge: '👑 Grandmaster' },
    { name: "Jasur (O'ngda)", rating: 1420, wins: 1, roundsWon: 4, trumpsSaved: 9, badge: '⚔️ Hujum Ustasi' },
    { name: "Sardor (Chapda)", rating: 1390, wins: 0, roundsWon: 3, trumpsSaved: 9, badge: '🎯 Podkid Qiroli' },
    { name: "Ulug'bek (To'g'rida)", rating: 1365, wins: 0, roundsWon: 1, trumpsSaved: 9, badge: '🛡️ Qalqon Sohibi' }
];

let matchHistory = [];
const activeRooms = new Map();

function sendJSON(res, statusCode, payload) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.status(statusCode).json(payload);
}

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') {
        return sendJSON(res, 200, { ok: true });
    }

    const url = req.url || '';

    if (url.includes('/status') || url === '/api' || url === '/api/') {
        return sendJSON(res, 200, {
            online: true,
            serverTime: new Date().toISOString(),
            version: '2.0.0-VercelServerless',
            activeRoomsCount: activeRooms.size,
            stats,
            leaderboard,
            matchHistory: matchHistory.slice(0, 15)
        });
    }

    if (url.includes('/sync-round') && req.method === 'POST') {
        const body = req.body || {};
        stats.totalRoundsPlayed++;
        if (body.humanSuit && stats.suitPickCounts[body.humanSuit] !== undefined) {
            stats.suitPickCounts[body.humanSuit]++;
        }
        if (body.burnedCard) {
            stats.totalTrumpsBurned++;
        }
        if (body.winnerName) {
            const entry = leaderboard.find(item => item.name.startsWith(body.winnerName.split(' ')[0]));
            if (entry) {
                entry.roundsWon = (entry.roundsWon || 0) + 1;
                entry.rating += 12;
            }
        }
        leaderboard.sort((a, b) => b.rating - a.rating);

        matchHistory.unshift({
            id: Date.now(),
            time: new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }),
            roundNumber: body.roundNumber || 0,
            winnerName: body.winnerName || 'Siz',
            loserName: body.loserName || 'Jasur',
            burnedCardText: body.burnedCard ? `${body.burnedCard.fullName} (${body.burnedCard.label}${body.burnedCard.symbol})` : '0-Raund (Jazosiz)',
            dealDistribution: body.dealDistribution || '6 - 6 - 6 - 6',
            remainingDeckTotal: body.remainingDeckTotal || 36
        });
        if (matchHistory.length > 30) matchHistory.pop();

        return sendJSON(res, 200, {
            ok: true,
            stats,
            leaderboard,
            matchHistory: matchHistory.slice(0, 15)
        });
    }

    if (url.includes('/room/create') && req.method === 'POST') {
        const body = req.body || {};
        let code = String(Math.floor(1000 + Math.random() * 9000));
        const humanSuit = body.suit || 'diamonds';
        const engine = new FourTrumpsEngine();
        engine.setupPlayers(humanSuit);
        engine.startRound(body.startRoundZero ? 0 : 1, 0, 3);

        const room = {
            code,
            createdAt: new Date().toISOString(),
            hostSuit: humanSuit,
            engine
        };
        activeRooms.set(code, room);

        return sendJSON(res, 200, {
            ok: true,
            roomCode: code,
            state: engine.serializeState()
        });
    }

    if (url.includes('/room/')) {
        const parts = url.split('/');
        const roomIdx = parts.indexOf('room');
        const code = parts[roomIdx + 1];
        const room = activeRooms.get(code);
        if (!room) {
            return sendJSON(res, 404, { ok: false, error: 'Xona topilmadi!' });
        }
        return sendJSON(res, 200, {
            ok: true,
            roomCode: code,
            state: room.engine.serializeState()
        });
    }

    return sendJSON(res, 200, { ok: true, message: "4 KO'ZIR Serverless API Active" });
};
