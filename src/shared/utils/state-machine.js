import { AppError } from './errors.js';

/**
 * Simple State Machine Utility for ERP Workflows
 */
class StateMachine {
  constructor(config) {
    this.name = config.name;
    this.initial = config.initial;
    this.states = config.states; // { STATE: { on: { ACTION: 'TARGET_STATE' } } }
  }

  /**
   * Validates if a transition is possible
   * @param {string} currentState 
   * @param {string} action 
   * @returns {string} The next state
   */
  transition(currentState, action) {
    const stateConfig = this.states[currentState];
    
    if (!stateConfig) {
      throw new AppError(`Invalid current state: ${currentState} for ${this.name}`, 400);
    }

    const nextState = stateConfig.on[action];

    if (!nextState) {
      throw new AppError(
        `Invalid transition: cannot perform '${action}' from '${currentState}' in ${this.name}`, 
        400
      );
    }

    return nextState;
  }

  /**
   * Checks if target state is reachable from current state (direct jump validation)
   * @param {string} currentState 
   * @param {string} targetState 
   */
  canMoveTo(currentState, targetState) {
    const stateConfig = this.states[currentState];
    if (!stateConfig) return false;

    return Object.values(stateConfig.on).includes(targetState);
  }
}

export default StateMachine;
