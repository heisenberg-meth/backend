import StateMachine from '../utils/state-machine.js';
import { PROCUREMENT_STATUS, PRESCRIPTION_STATUS, BILLING_STATUS } from './events.js';

export const procurementStateMachine = new StateMachine({
  name: 'Procurement Workflow',
  initial: PROCUREMENT_STATUS.DRAFT,
  states: {
    [PROCUREMENT_STATUS.DRAFT]: {
      on: {
        SUBMIT: PROCUREMENT_STATUS.PENDING_APPROVAL,
        CANCEL: PROCUREMENT_STATUS.CANCELLED,
      },
    },
    [PROCUREMENT_STATUS.PENDING_APPROVAL]: {
      on: {
        APPROVE: PROCUREMENT_STATUS.APPROVED,
        REJECT: PROCUREMENT_STATUS.DRAFT,
        CANCEL: PROCUREMENT_STATUS.CANCELLED,
      },
    },
    [PROCUREMENT_STATUS.APPROVED]: {
      on: {
        PLACE_ORDER: PROCUREMENT_STATUS.ORDERED,
        CANCEL: PROCUREMENT_STATUS.CANCELLED,
      },
    },
    [PROCUREMENT_STATUS.ORDERED]: {
      on: {
        RECEIVE_PARTIAL: PROCUREMENT_STATUS.PARTIALLY_RECEIVED,
        RECEIVE_FULL: PROCUREMENT_STATUS.RECEIVED,
        CANCEL: PROCUREMENT_STATUS.CANCELLED,
      },
    },
    [PROCUREMENT_STATUS.PARTIALLY_RECEIVED]: {
      on: {
        RECEIVE_MORE: PROCUREMENT_STATUS.PARTIALLY_RECEIVED,
        RECEIVE_FINAL: PROCUREMENT_STATUS.RECEIVED,
      },
    },
    [PROCUREMENT_STATUS.RECEIVED]: {
      on: {
        RECONCILE: PROCUREMENT_STATUS.RECONCILED,
      },
    },
    [PROCUREMENT_STATUS.RECONCILED]: {
      on: {}, // Terminal state
    },
    [PROCUREMENT_STATUS.CANCELLED]: {
      on: {}, // Terminal state
    },
  },
});

export const prescriptionStateMachine = new StateMachine({
  name: 'Prescription Workflow',
  initial: PRESCRIPTION_STATUS.UPLOADED,
  states: {
    [PRESCRIPTION_STATUS.UPLOADED]: {
      on: {
        VERIFY: PRESCRIPTION_STATUS.VERIFIED,
        REJECT: PRESCRIPTION_STATUS.REJECTED,
        CANCEL: PRESCRIPTION_STATUS.CANCELLED,
      },
    },
    [PRESCRIPTION_STATUS.VERIFIED]: {
      on: {
        FULFILL: PRESCRIPTION_STATUS.FULFILLED,
        REJECT: PRESCRIPTION_STATUS.REJECTED,
        CANCEL: PRESCRIPTION_STATUS.CANCELLED,
      },
    },
    [PRESCRIPTION_STATUS.REJECTED]: {
      on: {
        UPLOAD_NEW: PRESCRIPTION_STATUS.UPLOADED,
      },
    },
    [PRESCRIPTION_STATUS.FULFILLED]: {
      on: {}, // Terminal state
    },
    [PRESCRIPTION_STATUS.CANCELLED]: {
      on: {}, // Terminal state
    },
  },
});

export const billingStateMachine = new StateMachine({
  name: 'Billing Workflow',
  initial: BILLING_STATUS.DRAFT,
  states: {
    [BILLING_STATUS.DRAFT]: {
      on: {
        FINALIZE: BILLING_STATUS.PENDING,
        VOID: BILLING_STATUS.VOIDED,
      },
    },
    [BILLING_STATUS.PENDING]: {
      on: {
        RECORD_PARTIAL_PAYMENT: BILLING_STATUS.PARTIALLY_PAID,
        RECORD_FULL_PAYMENT: BILLING_STATUS.PAID,
        VOID: BILLING_STATUS.VOIDED,
      },
    },
    [BILLING_STATUS.PARTIALLY_PAID]: {
      on: {
        RECORD_PAYMENT: BILLING_STATUS.PARTIALLY_PAID,
        RECORD_FINAL_PAYMENT: BILLING_STATUS.PAID,
        VOID: BILLING_STATUS.VOIDED,
      },
    },
    [BILLING_STATUS.PAID]: {
      on: {
        REFUND: BILLING_STATUS.REFUNDED,
      },
    },
    [BILLING_STATUS.VOIDED]: { on: {} },
    [BILLING_STATUS.REFUNDED]: { on: {} },
  },
});

export const RETURN_STATUS = {
  REQUESTED: 'REQUESTED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  REFUNDED: 'REFUNDED',
  COMPLETED: 'COMPLETED',
};

export const returnStateMachine = new StateMachine({
  name: 'Return Workflow',
  initial: RETURN_STATUS.REQUESTED,
  states: {
    [RETURN_STATUS.REQUESTED]: {
      on: {
        SUBMIT_REVIEW: RETURN_STATUS.UNDER_REVIEW,
        REJECT: RETURN_STATUS.REJECTED,
      },
    },
    [RETURN_STATUS.UNDER_REVIEW]: {
      on: {
        APPROVE: RETURN_STATUS.APPROVED,
        REJECT: RETURN_STATUS.REJECTED,
      },
    },
    [RETURN_STATUS.APPROVED]: {
      on: {
        PROCESS_REFUND: RETURN_STATUS.REFUNDED,
        COMPLETE: RETURN_STATUS.COMPLETED,
      },
    },
    [RETURN_STATUS.REJECTED]: {
      on: {},
    },
    [RETURN_STATUS.REFUNDED]: {
      on: {
        COMPLETE: RETURN_STATUS.COMPLETED,
      },
    },
    [RETURN_STATUS.COMPLETED]: {
      on: {},
    },
  },
});
