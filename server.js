/**
 * ============================================================================
 * 4 KO'ZIR: OMON QOLISH — FULL-STACK NODE.JS BACKEND SERVER
 * ============================================================================
 * Features:
 * 1. Persistent JSON Database (data/database.json) for Match History, ELO Leaderboard & Trump Burn Stats
 * 2. Server-Authoritative Game Rooms & Move Validation API (/api/room/*)
 * 3. Real-Time Round & Tournament Telemetry Sync (/api/sync-round)
 * 4. High-Speed Static Asset Server for the Luxury Casino Frontend
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { FourTrumpsEngine, BOUT_PHASE } = require('./js/engine.js');
const BotAI = require('./js/ai.js');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

// Ensure data directory and persistent DB exist
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DEFAULT_DB = {
    stats: {
        totalRoundsPlayed: 0,
        totalTournamentsCompleted: 0,
        totalTrumpsBurned: 0,
        humanWins: 0,
        suitPickCounts: {
            diamonds: 1,
            spades: 0,
            hearts: 0,
            clubs: 0
        }
    },
    leaderboard: [
        { name: 'Siz (Asosiy O\'yinchi)', rating: 1500, wins: 0, roundsWon: 0, trumpsSaved: 9, badge: '👑 Grandmaster' },
        { name: 'Jasur (O\'ngda)', rating: 1420, wins: 0, roundsWon: 0, trumpsSaved: 9, badge: '⚔️ Hujum Ustasi' },
        { name: 'Sardor (Chapda)', rating: 1390, wins: 0, roundsWon: 0, trumpsSaved: 9, badge: '🎯 Podkid Qiroli' },
        { name: 'Ulug\'bek (To\'g\'rida)', rating: 1365, wins: 0, roundsWon: 0, trumpsSaved: 9, badge: '🛡️ Qalqon Sohibi' }
    ],
    matchHistory: []
};

function loadDB() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const raw = fs.readFileSync(DB_FILE, 'utf-8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error('DB read error:', e);
    }
    saveDB(DEFAULT_DB);
    return JSON.parse(JSON.stringify(DEFAULT_DB));
}

function saveDB(dbData) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2), 'utf-8');
    } catch (e) {
        console.error('DB write error:', e);
    }
}

let db = loadDB();

// Active Server-Hosted Rooms Map (roomCode -> { code, createdAt, engine, hostName, playersJoined })
const activeRooms = new Map();

function generateRoomCode() {
    let code = '';
    do {
        code = String(Math.floor(1000 + Math.random() * 9000));
    } while (activeRooms.has(code));
    return code;
}

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

function sendJSON(res, statusCode, payload) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(payload));
}

function parseBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
            if (body.length > 1e6) req.destroy();
        });
        req.on('end', () => {
            if (!body) return resolve({});
            try {
                resolve(JSON.parse(body));
            } catch (e) {
                resolve({});
            }
        });
    });
}

const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') {
        return sendJSON(res, 200, { ok: true });
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // ========================================================================
    // 1. BACKEND API ROUTES
    // ========================================================================
    if (pathname === '/api/status' && req.method === 'GET') {
        return sendJSON(res, 200, {
            online: true,
            serverTime: new Date().toISOString(),
            version: '2.0.0-FullStack',
            activeRoomsCount: activeRooms.size,
            stats: db.stats,
            leaderboard: db.leaderboard,
            matchHistory: db.matchHistory.slice(0, 15)
        });
    }

    // Record Round / Tournament outcome in Persistent Database
    if (pathname === '/api/sync-round' && req.method === 'POST') {
        const body = await parseBody(req);
        db.stats.totalRoundsPlayed++;

        if (body.humanSuit && db.stats.suitPickCounts[body.humanSuit] !== undefined) {
            db.stats.suitPickCounts[body.humanSuit]++;
        }

        if (body.burnedCard) {
            db.stats.totalTrumpsBurned++;
        }

        // Update round winner rating
        if (body.winnerName) {
            const entry = db.leaderboard.find(item => item.name.startsWith(body.winnerName.split(' ')[0]));
            if (entry) {
                entry.roundsWon = (entry.roundsWon || 0) + 1;
                entry.rating += 12;
            }
        }

        if (body.loserName) {
            const loserEntry = db.leaderboard.find(item => item.name.startsWith(body.loserName.split(' ')[0]));
            if (loserEntry) {
                loserEntry.rating = Math.max(1000, loserEntry.rating - 8);
            }
        }

        if (body.tournamentWinnerName) {
            db.stats.totalTournamentsCompleted++;
            if (body.tournamentWinnerId === 0) {
                db.stats.humanWins++;
            }
            const champEntry = db.leaderboard.find(item => item.name.startsWith(body.tournamentWinnerName.split(' ')[0]));
            if (champEntry) {
                champEntry.wins = (champEntry.wins || 0) + 1;
                champEntry.rating += 45;
            }
        }

        // Sort leaderboard by rating descending
        db.leaderboard.sort((a, b) => b.rating - a.rating);

        // Prepend to match history
        db.matchHistory.unshift({
            id: Date.now(),
            time: new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            roundNumber: body.roundNumber || 0,
            winnerName: body.winnerName || 'Siz',
            loserName: body.loserName || 'Jasur',
            burnedCardText: body.burnedCard ? `${body.burnedCard.fullName} (${body.burnedCard.label}${body.burnedCard.symbol})` : '0-Raund (Jazosiz)',
            dealDistribution: body.dealDistribution || '6 - 6 - 6 - 6',
            remainingDeckTotal: body.remainingDeckTotal || 36
        });

        if (db.matchHistory.length > 40) {
            db.matchHistory.pop();
        }

        saveDB(db);
        return sendJSON(res, 200, {
            ok: true,
            stats: db.stats,
            leaderboard: db.leaderboard,
            matchHistory: db.matchHistory.slice(0, 15)
        });
    }

    // Create a Server-Authoritative Multiplayer / Bot Room
    if (pathname === '/api/room/create' && req.method === 'POST') {
        const body = await parseBody(req);
        const code = generateRoomCode();
        const humanSuit = body.suit || 'diamonds';
        const mode = body.mode || 'standard'; // 'standard' | 'late13'

        const engine = new FourTrumpsEngine();
        if (mode === 'late13') {
            engine.setupLateGameScenario(humanSuit, 13);
        } else {
            engine.setupPlayers(humanSuit);
            engine.startRound(body.startRoundZero ? 0 : 1, 0, 3);
        }

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

    // Get Server Room State
    if (pathname.startsWith('/api/room/') && req.method === 'GET') {
        const parts = pathname.split('/');
        const code = parts[3];
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

    // Execute Move in Server Room
    if (pathname.startsWith('/api/room/') && pathname.endsWith('/move') && req.method === 'POST') {
        const parts = pathname.split('/');
        const code = parts[3];
        const room = activeRooms.get(code);
        if (!room) {
            return sendJSON(res, 404, { ok: false, error: 'Xona topilmadi!' });
        }

        const body = await parseBody(req);
        const engine = room.engine;
        const playerId = body.playerId !== undefined ? body.playerId : 0;
        let result = { success: false };

        if (body.action === 'attack') {
            result = engine.playAttackCard(playerId, body.cardId);
        } else if (body.action === 'defend') {
            result = engine.playDefenseCard(playerId, body.cardId);
        } else if (body.action === 'pass') {
            result = engine.declarePass(playerId);
        } else if (body.action === 'take') {
            result = engine.defenderTakesCards();
        } else if (body.action === 'bot-step') {
            const turnId = engine.getCurrentTurnPlayerId();
            if (turnId !== null && turnId !== 0) {
                const move = BotAI.decideMove(engine, turnId);
                if (move) {
                    if (move.action === 'attack') result = engine.playAttackCard(turnId, move.cardId);
                    else if (move.action === 'defend') result = engine.playDefenseCard(turnId, move.cardId);
                    else if (move.action === 'pass') result = engine.declarePass(turnId);
                    else if (move.action === 'take') result = engine.defenderTakesCards();
                }
            }
        }

        return sendJSON(res, 200, {
            ok: true,
            result,
            state: engine.serializeState()
        });
    }

    // ========================================================================
    // 2. STATIC FRONTEND FILE SERVER
    // ========================================================================
    let safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[\/\\])+/, '');
    if (safePath === '/' || safePath === '\\') {
        safePath = '/index.html';
    }

    const filePath = path.join(__dirname, safePath);
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        return res.end('Forbidden');
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            return res.end('404 - Fayl topilmadi');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache'
        });
        fs.createReadStream(filePath).pipe(res);
    });
});

process.on('uncaughtException', (err) => {
    // Keep server alive on any stream/socket error
});
process.on('unhandledRejection', (err) => {
    // Keep server alive
});

server.on('error', (err) => {
    // Keep server alive
});

server.listen(PORT, '0.0.0.0', () => {
    console.log('====================================================================');
    console.log(`🚀 4 KO'ZIR: OMON QOLISH — FULL-STACK SERVER ISHGA TUSHDI!`);
    console.log(`🌐 Web Manzil (Frontend): http://localhost:${PORT}`);
    console.log(`🔌 REST API (Backend):    http://localhost:${PORT}/api/status`);
    console.log(`💾 Ma'lumotlar bazasi:    ${DB_FILE}`);
    console.log('====================================================================');
});
