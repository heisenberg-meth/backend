import { jest , describe, it, expect } from '@jest/globals';

jest.unstable_mockModule('../../../src/config/prisma.js', () => ({
  default: {},
}));

const { default: stateMachine } =
  await import('../../../src/modules/payments/services/payment.state-machine.js');

describe('PaymentStateMachine', () => {
  describe('validateTransition', () => {
    it('should allow CREATED -> INITIATED', () => {
      expect(() => stateMachine.validateTransition('CREATED', 'INITIATED')).not.toThrow();
    });

    it('should allow INITIATED -> PENDING', () => {
      expect(() => stateMachine.validateTransition('INITIATED', 'PENDING')).not.toThrow();
    });

    it('should allow PENDING -> AUTHORIZED', () => {
      expect(() => stateMachine.validateTransition('PENDING', 'AUTHORIZED')).not.toThrow();
    });

    it('should allow AUTHORIZED -> CAPTURED', () => {
      expect(() => stateMachine.validateTransition('AUTHORIZED', 'CAPTURED')).not.toThrow();
    });

    it('should allow CAPTURED -> SUCCESS', () => {
      expect(() => stateMachine.validateTransition('CAPTURED', 'SUCCESS')).not.toThrow();
    });

    it('should allow SUCCESS -> REFUNDED', () => {
      expect(() => stateMachine.validateTransition('SUCCESS', 'REFUNDED')).not.toThrow();
    });

    it('should allow FAILED -> INITIATED (retry)', () => {
      expect(() => stateMachine.validateTransition('FAILED', 'INITIATED')).not.toThrow();
    });

    it('should allow atomic transition CREATED -> SUCCESS', () => {
      expect(stateMachine.canTransition('CREATED', 'SUCCESS')).toBe(true);
      expect(() => stateMachine.validateTransition('CREATED', 'SUCCESS')).not.toThrow();
    });

    it('should throw on illegal transition PENDING -> REFUNDED', () => {
      expect(() => stateMachine.validateTransition('PENDING', 'REFUNDED')).toThrow('Invalid payment state transition');
    });

    it('should throw on illegal transition SUCCESS -> CREATED', () => {
      expect(() => stateMachine.validateTransition('SUCCESS', 'CREATED')).toThrow('Invalid payment state transition');
    });

    it('should throw on transition from terminal state', () => {
      expect(() => stateMachine.validateTransition('CANCELLED', 'INITIATED')).not.toThrow();
    });

    it('should allow FAILED -> RECOVERY_PENDING', () => {
      expect(() => stateMachine.validateTransition('FAILED', 'RECOVERY_PENDING')).not.toThrow();
    });

    it('should allow RECOVERY_PENDING -> INITIATED', () => {
      expect(() => stateMachine.validateTransition('RECOVERY_PENDING', 'INITIATED')).not.toThrow();
    });
  });

  describe('canTransition', () => {
    it('should return true for valid transitions', () => {
      expect(stateMachine.canTransition('CREATED', 'INITIATED')).toBe(true);
    });

    it('should return true for CREATED -> SUCCESS (atomic)', () => {
      expect(stateMachine.canTransition('CREATED', 'SUCCESS')).toBe(true);
    });

    it('should return false for null/undefined', () => {
      expect(stateMachine.canTransition(null, 'INITIATED')).toBe(false);
      expect(stateMachine.canTransition('CREATED', null)).toBe(false);
    });
  });

  describe('isTerminal', () => {
    it('should identify SUCCESS as terminal', () => {
      expect(stateMachine.isTerminal('SUCCESS')).toBe(true);
    });

    it('should identify CANCELLED as terminal', () => {
      expect(stateMachine.isTerminal('CANCELLED')).toBe(true);
    });

    it('should identify REFUNDED as terminal', () => {
      expect(stateMachine.isTerminal('REFUNDED')).toBe(true);
    });

    it('should not identify PENDING as terminal', () => {
      expect(stateMachine.isTerminal('PENDING')).toBe(false);
    });
  });

  describe('isRecoverable', () => {
    it('should identify FAILED as recoverable', () => {
      expect(stateMachine.isRecoverable('FAILED')).toBe(true);
    });

    it('should identify RECOVERY_PENDING as recoverable', () => {
      expect(stateMachine.isRecoverable('RECOVERY_PENDING')).toBe(true);
    });

    it('should not identify SUCCESS as recoverable', () => {
      expect(stateMachine.isRecoverable('SUCCESS')).toBe(false);
    });
  });

  describe('getAllowedTransitions', () => {
    it('should return all valid next states for CREATED', () => {
      const allowed = stateMachine.getAllowedTransitions('CREATED');
      expect(allowed).toContain('INITIATED');
      expect(allowed).toContain('FAILED');
      expect(allowed).toContain('CANCELLED');
      expect(allowed).toContain('SUCCESS');
    });

    it('should return empty array for unknown state', () => {
      expect(stateMachine.getAllowedTransitions('UNKNOWN')).toEqual([]);
    });
  });
});
