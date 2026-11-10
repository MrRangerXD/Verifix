/**
 * Pricing / plan matrix. Sab kuch yahin se control hota hai.
 * Price aapke currency unit me — gateway kuch nahi karta, sirf display.
 */
module.exports = {
  CURRENCY: 'INR',
  PREFIX_SYMBOL: '₹',

  /** per-user plan defaults */
  TIERS: {
    BRONZE: {
      label: 'Bronze', price: 49, days: 7,
      joinsQuota: 100, runs: 3, cooldown: 30,
      priority: 1, onlinerSlots: 0, humanizer: false, brain: false,
    },
    SILVER: {
      label: 'Silver', price: 149, days: 14,
      joinsQuota: 350, runs: 10, cooldown: 60,
      priority: 2, onlinerSlots: 2, humanizer: true, brain: false,
    },
    GOLD: {
      label: 'Gold', price: 299, days: 30,
      joinsQuota: 800, runs: 25, cooldown: 90,
      priority: 3, onlinerSlots: 5, humanizer: true, brain: true,
    },
    PLATINUM: {
      label: 'Platinum', price: 599, days: 30,
      joinsQuota: 2000, runs: 60, cooldown: 120,
      priority: 4, onlinerSlots: 15, humanizer: true, brain: true,
    },
    DIAMOND: {
      label: 'Diamond', price: 1199, days: 30,
      joinsQuota: 5000, runs: Infinity, cooldown: 180,
      priority: 5, onlinerSlots: 50, humanizer: true, brain: true,
    },
  },

  /** default plan for new/unauth users */
  DEFAULT_TIER: 'BRONZE',

  /** payment methods shown in /buy */
  METHODS: ['wallet', 'upi', 'crypto', 'paypal'],

  /** how many tokens one djoin run may pull at once, per tier */
  MAX_PULL_PER_RUN: {
    BRONZE: 3, SILVER: 10, GOLD: 20, PLATINUM: 35, DIAMOND: 50,
  },
};