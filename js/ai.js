/**
 * 4 KO'ZIR: OMON QOLISH — Tactical AI Bot Engine
 * Smart decision-making for Attack, Defense, and Podkidnoy phases
 */

const PHASE_ENUM = (typeof window !== 'undefined' && window.BOUT_PHASE)
    ? window.BOUT_PHASE
    : (typeof require !== 'undefined' ? require('./engine.js').BOUT_PHASE : {});

class BotAI {
    /**
     * Decides the next move for `botId` based on current engine state
     * @param {FourTrumpsEngine} engine
     * @param {number} botId
     * @returns {Object} { action: 'attack'|'defend'|'pass'|'take', cardId?: string }
     */
    static decideMove(engine, botId) {
        const bot = engine.players[botId];
        const defender = engine.players[engine.defenderId];
        const phase = engine.phase;

        if (!bot || bot.eliminated || bot.outOfRound) {
            return null;
        }

        // 1. INITIAL ATTACK
        if (phase === PHASE_ENUM.INITIAL_ATTACK && botId === engine.primaryAttackerId) {
            const candidates = [...bot.hand];
            if (candidates.length === 0) return null;

            // Score each card for leading an attack (lower score = better to throw)
            candidates.sort((a, b) => {
                return BotAI.scoreInitialAttackCard(a, bot, defender, engine) -
                       BotAI.scoreInitialAttackCard(b, bot, defender, engine);
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

            // Sort valid defense cards from cheapest to most expensive
            validDefenseCards.sort((a, b) => {
                const aIsOwnTrump = a.suit === bot.trumpSuit ? 1 : 0;
                const bIsOwnTrump = b.suit === bot.trumpSuit ? 1 : 0;
                if (aIsOwnTrump !== bIsOwnTrump) return aIsOwnTrump - bIsOwnTrump;
                return a.rank - b.rank;
            });

            const bestDefCard = validDefenseCards[0];
            const isOwnTrump = bestDefCard.suit === bot.trumpSuit;

            // Only consider taking instead of wasting Ace/King of own trump early in the round
            if (isOwnTrump && openPair.attack.suit !== bot.trumpSuit) {
                if (bestDefCard.rank === 14 && engine.deck.length > 8 && engine.tablePairs.length === 1 && bot.hand.length <= 5) {
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

            // Filter out cards the bot shouldn't waste on podkid
            const worthwhilePodkids = validPodkids.filter(c => {
                const isOwnTrump = c.suit === bot.trumpSuit;
                const isDefTrump = c.suit === defender.trumpSuit;

                // Never throw own personal trump as podkid unless deck is empty and bot is about to finish hand
                if (isOwnTrump) {
                    return engine.deck.length === 0 && bot.hand.length <= 2;
                }

                // Avoid feeding Defender a high card of Defender's own trump early on
                if (isDefTrump && c.rank >= 12 && engine.deck.length > 4) {
                    return false;
                }

                // Early game: don't throw Aces/Kings of neutral suits unless we want to pressure
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

        return null;
    }

    static scoreInitialAttackCard(card, bot, defender, engine) {
        let score = card.rank;

        // Heavily penalize throwing own personal trump first unless only trumps remain
        if (card.suit === bot.trumpSuit) {
            score += 100;
        }

        // If card is Defender's personal trump:
        // Low defender trumps (6, 7, 8) are actually clever probes because Defender CANNOT cut them with non-trumps
        // and must spend a higher personal trump! High defender trumps (V, D, K, T) are bad to gift to Defender.
        if (card.suit === defender.trumpSuit) {
            if (card.rank >= 11) {
                score += 45;
            } else {
                score += 4;
            }
        }

        // Bonus if bot has multiple cards of the same rank (pairs/triples) for follow-up podkid!
        const sameRankCount = bot.hand.filter(c => c.rank === card.rank && c.suit !== bot.trumpSuit).length;
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
