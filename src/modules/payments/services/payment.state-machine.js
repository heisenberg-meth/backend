const VALID_STATES = {
  CREATED: 'CREATED',
  INITIATED: 'INITIATED',
  PENDING: 'PENDING',
  AUTHORIZED: 'AUTHORIZED',
  CAPTURED: 'CAPTURED',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
  REFUNDED: 'REFUNDED',
  PARTIALLY_REFUNDED: 'PARTIALLY_REFUNDED',
  RECONCILING: 'RECONCILING',
  RECOVERY_PENDING: 'RECOVERY_PENDING',
};

const TRANSITIONS = {
  [VALID_STATES.CREATED]: [
    VALID_STATES.INITIATED,
    VALID_STATES.CAPTURED,
    VALID_STATES.SUCCESS,
    VALID_STATES.FAILED,
    VALID_STATES.CANCELLED,
  ],
  [VALID_STATES.INITIATED]: [
    VALID_STATES.PENDING,
    VALID_STATES.AUTHORIZED,
    VALID_STATES.CAPTURED,
    VALID_STATES.SUCCESS,
    VALID_STATES.FAILED,
    VALID_STATES.EXPIRED,
    VALID_STATES.CANCELLED,
  ],
  [VALID_STATES.PENDING]: [
    VALID_STATES.AUTHORIZED,
    VALID_STATES.CAPTURED,
    VALID_STATES.SUCCESS,
    VALID_STATES.FAILED,
    VALID_STATES.EXPIRED,
    VALID_STATES.CANCELLED,
    VALID_STATES.RECOVERY_PENDING,
  ],
  [VALID_STATES.AUTHORIZED]: [
    VALID_STATES.CAPTURED,
    VALID_STATES.SUCCESS,
    VALID_STATES.FAILED,
    VALID_STATES.EXPIRED,
    VALID_STATES.REFUNDED,
  ],
  [VALID_STATES.CAPTURED]: [
    VALID_STATES.SUCCESS,
    VALID_STATES.FAILED,
    VALID_STATES.REFUNDED,
    VALID_STATES.PARTIALLY_REFUNDED,
    VALID_STATES.RECONCILING,
  ],
  [VALID_STATES.SUCCESS]: [
    VALID_STATES.REFUNDED,
    VALID_STATES.PARTIALLY_REFUNDED,
    VALID_STATES.RECONCILING,
  ],
  [VALID_STATES.FAILED]: [
    VALID_STATES.INITIATED,
    VALID_STATES.RECOVERY_PENDING,
    VALID_STATES.CANCELLED,
  ],
  [VALID_STATES.EXPIRED]: [VALID_STATES.CANCELLED, VALID_STATES.RECOVERY_PENDING],
  [VALID_STATES.CANCELLED]: [VALID_STATES.INITIATED, VALID_STATES.RECOVERY_PENDING],
  [VALID_STATES.REFUNDED]: [VALID_STATES.PARTIALLY_REFUNDED],
  [VALID_STATES.PARTIALLY_REFUNDED]: [VALID_STATES.REFUNDED],
  [VALID_STATES.RECONCILING]: [
    VALID_STATES.SUCCESS,
    VALID_STATES.FAILED,
    VALID_STATES.RECOVERY_PENDING,
  ],
  [VALID_STATES.RECOVERY_PENDING]: [
    VALID_STATES.INITIATED,
    VALID_STATES.PENDING,
    VALID_STATES.FAILED,
    VALID_STATES.CAPTURED,
  ],
};

class PaymentStateMachine {
  canTransition(from, to) {
    if (!from || !to) return false;
    const fromUpper = from.toUpperCase();
    const toUpper = to.toUpperCase();
    if (fromUpper === toUpper) return true; // Allow same state transition
    const allowed = TRANSITIONS[fromUpper];
    if (!allowed) return false;
    return allowed.includes(toUpper);
  }

  getAllowedTransitions(currentState) {
    const upper = currentState?.toUpperCase();
    return TRANSITIONS[upper] || [];
  }

  validateTransition(from, to) {
    if (!this.canTransition(from, to)) {
      throw new Error(
        `Invalid payment state transition: ${from} -> ${to}. ` +
          `Allowed from ${from}: [${(TRANSITIONS[from?.toUpperCase()] || []).join(', ')}]`,
      );
    }
    return true;
  }

  isValidState(state) {
    return Object.values(VALID_STATES).includes(state?.toUpperCase());
  }

  isTerminal(state) {
    const terminal = [VALID_STATES.SUCCESS, VALID_STATES.CANCELLED, VALID_STATES.REFUNDED];
    return terminal.includes(state?.toUpperCase());
  }

  isRecoverable(state) {
    const recoverable = [
      VALID_STATES.FAILED,
      VALID_STATES.EXPIRED,
      VALID_STATES.RECOVERY_PENDING,
      VALID_STATES.PENDING,
    ];
    return recoverable.includes(state?.toUpperCase());
  }

  isPending(state) {
    const pending = [
      VALID_STATES.CREATED,
      VALID_STATES.INITIATED,
      VALID_STATES.PENDING,
      VALID_STATES.AUTHORIZED,
      VALID_STATES.RECOVERY_PENDING,
    ];
    return pending.includes(state?.toUpperCase());
  }
}

export { VALID_STATES, TRANSITIONS, PaymentStateMachine };
export default new PaymentStateMachine();
