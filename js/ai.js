/**
 * 4 KO'ZIR: OMON QOLISH — Tactical AI Bot Engine
 * Uses shared trump suit in 0-O'yin (Oddiy Durak) and personal trump suit in 1+ O'yin!
 */

const PHASE_ENUM = (typeof window !== 'undefined' && window.BOUT_PHASE)
    ? window.BOUT_PHASE
    : (typeof require !== 'undefined' ? require('./engine.js').BOUT_PHASE : {});

class BotAI {
    static decideMove(engine, botId) {
        const bot = engine.players[botId];
        const defender = engine.players[engine.defenderId];
        const phase = engine.phase;

        if (!bot || bot.eliminated || bot.outOfRound) {
            return null;
        }

        const botTrump = engine.getEffectiveTrumpSuit(botId);
        const defTrump = engine.getEffectiveTrumpSuit(engine.defenderId);

        // 1. INITIAL ATTACK
        if (phase === PHASE_ENUM.INITIAL_ATTACK && botId === engine.primaryAttackerId) {
            const candidates = [...bot.hand];
            if (candidates.length === 0) return null;

            candidates.sort((a, b) => {
                return BotAI.scoreInitialAttackCard(a, bot, botTrump, defTrump, engine) -
                       BotAI.scoreInitialAttackCard(b, bot, botTrump, defTrump, engine);
            });

            return {
                action: 'attack',
                cardId: candidates[0].id
            };
        }

        // 2. DEFENSE
        if (phase === PHASE_ENUM.DEFENSE && botId === engine.defenderId) {
            const openPair = engine.tablePairs.find(p => p.defense === null);
            if (!openPair) return null;

            const validDefenseCards = bot.hand.filter(
                c => engine.canBeatCard(botId, openPair.attack, c).valid
            );

            if (validDefenseCards.length === 0) {
                return { action: 'take' };
            }

            validDefenseCards.sort((a, b) => {
                const aIsTrump = a.suit === botTrump ? 1 : 0;
                const bIsTrump = b.suit === botTrump ? 1 : 0;
                if (aIsTrump !== bIsTrump) return aIsTrump - bIsTrump;
                return a.rank - b.rank;
            });

            const bestDefCard = validDefenseCards[0];
            const isTrump = bestDefCard.suit === botTrump;

            if (isTrump && openPair.attack.suit !== botTrump) {
                if (bestDefCard.rank >= 13 && openPair.attack.rank <= 9 && engine.deck.length > 4) {
                    return { action: 'take' };
                }
            }

            return {
                action: 'defend',
                cardId: bestDefCard.id
            };
        }

        // 3. PODKIDNOY (PRIMARY OR SECONDARY)
        if ((phase === PHASE_ENUM.PRIMARY_PODKID && botId === engine.primaryAttackerId) ||
            (phase === PHASE_ENUM.SECONDARY_PODKID && botId === engine.secondaryAttackerId)) {

            const validPodkids = bot.hand.filter(
                c => engine.canAttackWithCard(botId, c).valid
            );

            if (validPodkids.length === 0) {
                return { action: 'pass' };
            }

            const worthwhilePodkids = validPodkids.filter(c => {
                const isOwnTrump = c.suit === botTrump;
                const isDefTrump = c.suit === defTrump;

                if (isOwnTrump) {
                    return engine.deck.length === 0 && bot.hand.length <= 2;
                }

                if (isDefTrump && c.rank >= 12 && engine.deck.length > 4) {
                    return false;
                }

                if (c.rank >= 14 && engine.deck.length > 6) {
                    return false;
                }

                return true;
            });

            if (worthwhilePodkids.length === 0) {
                return { action: 'pass' };
            }

            worthwhilePodkids.sort((a, b) => a.rank - b.rank);
            return {
                action: 'attack',
                cardId: worthwhilePodkids[0].id
            };
        }

        // 4. TAKING_PODKID: Defender has declared Take, other players can dump matching cards!
        if (phase === PHASE_ENUM.TAKING_PODKID && botId === engine.takingAttackerId) {
            const validPodkids = bot.hand.filter(
                c => engine.canAttackWithCard(botId, c).valid
            );

            if (validPodkids.length === 0) {
                return { action: 'pass' };
            }

            // Dump non-trump cards of matching ranks first
            const nonTrumps = validPodkids.filter(c => c.suit !== botTrump);
            if (nonTrumps.length > 0) {
                nonTrumps.sort((a, b) => a.rank - b.rank);
                return { action: 'attack', cardId: nonTrumps[0].id };
            }

            // If only personal trumps match, bot only throws if low rank and late game
            if (engine.deck.length === 0 && validPodkids[0].rank <= 8) {
                return { action: 'attack', cardId: validPodkids[0].id };
            }

            return { action: 'pass' };
        }

        return null;
    }

    static scoreInitialAttackCard(card, bot, botTrump, defTrump, engine) {
        let score = card.rank;

        if (card.suit === botTrump) {
            score += 100;
        }

        if (card.suit === defTrump) {
            if (card.rank >= 11) {
                score += 45;
            } else {
                score += 4;
            }
        }

        const sameRankCount = bot.hand.filter(c => c.rank === card.rank && c.suit !== botTrump).length;
        if (sameRankCount >= 2) {
            score -= 3;
        }

        return score;
    }
}

if (typeof window !== 'undefined') {
    window.BotAI = BotAI;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = BotAI;
}
