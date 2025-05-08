/**
 * EventEmitter - Simple event system for component communication
 */
export class EventEmitter {
  constructor() {
    this.events = {};
    this.debugMode = false;
  }

  /**
   * Subscribe to an event
   * @param {string} event - Event name
   * @param {Function} listener - Callback function
   * @returns {Function} Unsubscribe function
   */
  on(event, listener) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    
    this.events[event].push(listener);
    
    // Return unsubscribe function
    return () => {
      this.events[event] = this.events[event].filter(l => l !== listener);
    };
  }
  
  /**
   * Modern DOM-style event subscription (alias for on)
   * @param {string} event - Event name
   * @param {Function} listener - Callback function
   */
  addEventListener(event, listener) {
    return this.on(event, listener);
  }

  /**
   * Subscribe to an event once
   * @param {string} event - Event name
   * @param {Function} listener - Callback function
   */
  once(event, listener) {
    const remove = this.on(event, (...args) => {
      remove();
      listener(...args);
    });
  }

  /**
   * Emit an event with data
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    if (this.debugMode) {
      console.log(`[EventEmitter] ${event}:`, data);
    }
    
    if (this.events[event]) {
      this.events[event].forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in event listener for '${event}':`, error);
        }
      });
    }
  }

  /**
   * Remove a specific listener for an event
   * @param {string} event - Event name
   * @param {Function} listener - Callback function to remove
   */
  off(event, listener) {
    if (this.events[event]) {
      this.events[event] = this.events[event].filter(l => l !== listener);
    }
  }
  
  /**
   * Modern DOM-style event unsubscription (alias for off)
   * @param {string} event - Event name
   * @param {Function} listener - Callback function to remove
   */
  removeEventListener(event, listener) {
    return this.off(event, listener);
  }
  
  /**
   * Remove all listeners for an event
   * @param {string} event - Event name
   */
  removeAllListeners(event) {
    if (event) {
      delete this.events[event];
    } else {
      this.events = {};
    }
  }

  /**
   * Enable/disable debug mode
   * @param {boolean} enabled - Whether debug mode is enabled
   */
  setDebug(enabled) {
    this.debugMode = enabled;
  }
}

// For backward compatibility
export default EventEmitter;