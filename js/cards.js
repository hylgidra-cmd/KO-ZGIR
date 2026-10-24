/**
 * 4 KO'ZIR: OMON QOLISH — Suits, Ranks, Deck Builder & Luxury SVG Card Renderer
 */

const SUITS = {
    diamonds: {
        id: 'diamonds',
        name: "G'isht",
        symbol: '♦',
        color: 'red',
        hex: '#e53e3e',
        accent: '#fc8181',
        bgGlow: 'rgba(229, 62, 62, 0.28)'
    },
    spades: {
        id: 'spades',
        name: 'Tabbon',
        symbol: '♠',
        color: 'black',
        hex: '#1a202c',
        accent: '#63b3ed',
        bgGlow: 'rgba(99, 179, 237, 0.25)'
    },
    hearts: {
        id: 'hearts',
        name: 'Yurak',
        symbol: '♥',
        color: 'red',
        hex: '#dd2c44',
        accent: '#f687b3',
        bgGlow: 'rgba(221, 44, 68, 0.28)'
    },
    clubs: {
        id: 'clubs',
        name: 'Paxta',
        symbol: '♣',
        color: 'black',
        hex: '#1e293b',
        accent: '#4fd1c5',
        bgGlow: 'rgba(79, 209, 197, 0.25)'
    }
};

const RANKS = [
    { value: 6, label: '6', fullName: '6-lik' },
    { value: 7, label: '7', fullName: '7-lik' },
    { value: 8, label: '8', fullName: '8-lik' },
    { value: 9, label: '9', fullName: '9-lik' },
    { value: 10, label: '10', fullName: '10-lik' },
    { value: 11, label: 'V', fullName: 'Valet' },
    { value: 12, label: 'D', fullName: 'Dama' },
    { value: 13, label: 'K', fullName: 'Qirol' },
    { value: 14, label: 'T', fullName: 'Tuz' }
];

const SUIT_LIST = ['diamonds', 'spades', 'hearts', 'clubs'];

/**
 * Generates a shuffled deck, excluding permanently eliminated cards!
 * @param {Set<string>} eliminatedCardIds Set of card IDs like "diamonds_6", "diamonds_7"
 */
function createDeck(eliminatedCardIds = new Set()) {
    const deck = [];
    for (const suitKey of SUIT_LIST) {
        const suit = SUITS[suitKey];
        for (const r of RANKS) {
            const id = `${suitKey}_${r.value}`;
            if (!eliminatedCardIds.has(id)) {
                deck.push({
                    id,
                    suit: suitKey,
                    suitName: suit.name,
                    symbol: suit.symbol,
                    color: suit.color,
                    rank: r.value,
                    label: r.label,
                    fullName: `${suit.name} ${r.fullName}`
                });
            }
        }
    }
    return shuffleDeck(deck);
}

/**
 * Fisher-Yates cryptographic-grade shuffle
 */
function shuffleDeck(deck) {
    const arr = [...deck];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Renders the inner center artwork for any card (pips for 6-10, Royal SVG for V, D, K, Ornate Ace for T)
 */
function renderCardCenterArt(card) {
    const s = card.symbol;
    if (card.rank >= 6 && card.rank <= 10) {
        const pipCount = card.rank;
        const pips = [];
        for (let i = 0; i < pipCount; i++) {
            pips.push(`<span class="card-pip">${s}</span>`);
        }
        return `<div class="card-pips-grid pips-${pipCount}">${pips.join('')}</div>`;
    }

    if (card.rank === 11) {
        // VALET (Knight / Warrior crest)
        return `
        <div class="card-court-art court-valet">
            <svg viewBox="0 0 80 100" class="court-svg">
                <defs>
                    <linearGradient id="goldGrad_${card.id}" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stop-color="#f6e05e"/>
                        <stop offset="50%" stop-color="#d69e2e"/>
                        <stop offset="100%" stop-color="#975a16"/>
                    </linearGradient>
                </defs>
                <rect x="6" y="6" width="68" height="88" rx="6" fill="none" stroke="url(#goldGrad_${card.id})" stroke-width="1.5" stroke-dasharray="3,2"/>
                <!-- Halberd / Shield -->
                <path d="M40 16 L60 28 L55 62 L40 82 L25 62 L20 28 Z" fill="rgba(214,158,46,0.12)" stroke="url(#goldGrad_${card.id})" stroke-width="2"/>
                <path d="M26 24 L54 76 M54 24 L26 76" stroke="url(#goldGrad_${card.id})" stroke-width="1.6" opacity="0.7"/>
                <circle cx="40" cy="49" r="16" fill="rgba(15,23,42,0.06)" stroke="url(#goldGrad_${card.id})" stroke-width="1.8"/>
            </svg>
            <div class="court-emblem">${s}</div>
            <div class="court-title">VALET</div>
        </div>`;
    }

    if (card.rank === 12) {
        // DAMA (Queen / Royal Tiara & Rose crest)
        return `
        <div class="card-court-art court-dama">
            <svg viewBox="0 0 80 100" class="court-svg">
                <defs>
                    <linearGradient id="goldGrad_${card.id}" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stop-color="#fbd38d"/>
                        <stop offset="50%" stop-color="#dd6b20"/>
                        <stop offset="100%" stop-color="#9c4221"/>
                    </linearGradient>
                </defs>
                <rect x="6" y="6" width="68" height="88" rx="6" fill="none" stroke="url(#goldGrad_${card.id})" stroke-width="1.5"/>
                <!-- Tiara Crown -->
                <path d="M22 36 L30 20 L40 31 L50 20 L58 36 Z" fill="url(#goldGrad_${card.id})" opacity="0.85"/>
                <circle cx="40" cy="54" r="19" fill="rgba(214,158,46,0.12)" stroke="url(#goldGrad_${card.id})" stroke-width="2"/>
                <circle cx="30" cy="18" r="2.2" fill="#ecc94b"/>
                <circle cx="40" cy="15" r="2.6" fill="#ecc94b"/>
                <circle cx="50" cy="18" r="2.2" fill="#ecc94b"/>
            </svg>
            <div class="court-emblem">${s}</div>
            <div class="court-title">DAMA</div>
        </div>`;
    }

    if (card.rank === 13) {
        // QIROL (King / Imperial Crown & Scepter)
        return `
        <div class="card-court-art court-qirol">
            <svg viewBox="0 0 80 100" class="court-svg">
                <defs>
                    <linearGradient id="goldGrad_${card.id}" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stop-color="#fefcbf"/>
                        <stop offset="45%" stop-color="#ecc94b"/>
                        <stop offset="100%" stop-color="#b7791f"/>
                    </linearGradient>
                </defs>
                <rect x="5" y="5" width="70" height="90" rx="6" fill="none" stroke="url(#goldGrad_${card.id})" stroke-width="2"/>
                <!-- Royal Crown -->
                <path d="M18 36 L22 18 L33 28 L40 14 L47 28 L58 18 L62 36 Z" fill="url(#goldGrad_${card.id})"/>
                <rect x="20" y="36" width="40" height="4" rx="2" fill="#975a16"/>
                <polygon points="40,34 62,56 40,78 18,56" fill="rgba(236,201,75,0.16)" stroke="url(#goldGrad_${card.id})" stroke-width="2"/>
            </svg>
            <div class="court-emblem">${s}</div>
            <div class="court-title">QIROL</div>
        </div>`;
    }

    // TUZ (Ace / Supreme Medallion)
    return `
    <div class="card-court-art court-tuz">
        <svg viewBox="0 0 80 100" class="court-svg">
            <defs>
                <linearGradient id="goldGrad_${card.id}" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stop-color="#faf089"/>
                    <stop offset="50%" stop-color="#d69e2e"/>
                    <stop offset="100%" stop-color="#744210"/>
                </linearGradient>
            </defs>
            <circle cx="40" cy="50" r="28" fill="rgba(236,201,75,0.14)" stroke="url(#goldGrad_${card.id})" stroke-width="2" stroke-dasharray="4,2"/>
            <circle cx="40" cy="50" r="22" fill="none" stroke="url(#goldGrad_${card.id})" stroke-width="1.4"/>
            <polygon points="40,14 44,22 36,22" fill="url(#goldGrad_${card.id})"/>
            <polygon points="40,86 44,78 36,78" fill="url(#goldGrad_${card.id})"/>
        </svg>
        <div class="ace-giant-symbol">${s}</div>
        <div class="court-title">TUZ</div>
    </div>`;
}

/**
 * Generates HTML string for a face-up playing card
 * @param {Object} card Card object
 * @param {Object} options { isPersonalTrump, isPlayable, isSelected, small, ownerTrumpSuit }
 */
function createCardHTML(card, options = {}) {
    const {
        isPersonalTrump = false,
        isPlayable = false,
        small = false,
        invalidReason = ''
    } = options;

    const classes = [
        'playing-card',
        `suit-${card.suit}`,
        `color-${card.color}`,
        isPersonalTrump ? 'is-personal-trump' : '',
        isPlayable ? 'is-playable' : '',
        small ? 'card-small' : ''
    ].filter(Boolean).join(' ');

    const trumpBadge = isPersonalTrump
        ? `<div class="card-trump-crown" title="Sizning shaxsiy ko'ziringiz!">👑 KO'ZIR</div>`
        : '';

    return `
    <div class="${classes}" data-card-id="${card.id}" ${invalidReason ? `data-reason="${invalidReason}"` : ''}>
        <div class="card-inner-frame">
            ${trumpBadge}
            <div class="card-corner top-left">
                <span class="corner-rank">${card.label}</span>
                <span class="corner-suit">${card.symbol}</span>
            </div>
            <div class="card-center">
                ${renderCardCenterArt(card)}
            </div>
            <div class="card-corner bottom-right">
                <span class="corner-rank">${card.label}</span>
                <span class="corner-suit">${card.symbol}</span>
            </div>
        </div>
    </div>`;
}

/**
 * Generates HTML string for a face-down card back
 */
function createCardBackHTML(extraClass = '') {
    return `
    <div class="playing-card card-back ${extraClass}">
        <div class="card-back-pattern">
            <div class="card-back-emblem">♦♠♥♣</div>
        </div>
    </div>`;
}

const CardsAPI = {
    SUITS,
    RANKS,
    SUIT_LIST,
    createDeck,
    shuffleDeck,
    createCardHTML,
    createCardBackHTML
};

if (typeof window !== 'undefined') {
    window.CardsAPI = CardsAPI;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CardsAPI;
}
