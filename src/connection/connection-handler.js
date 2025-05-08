/**
 * ConnectionHandler - Base class for implementing different connection methods
 */
export class ConnectionHandler {
  constructor(eventEmitter, options = {}) {
    this.eventEmitter = eventEmitter;
    this.isConnected = false;
    this.isConnecting = false;
    this.name = 'unknown';
    this.debugSettings = options.debug || { 
      info: false, 
      debug: false,
      errors: true 
    };
    
    // Logger for debugging
    this.logger = {
      info: (...args) => {
        if (this.debugSettings.info) {
          console.info(`[${this.name.toUpperCase()}]`, ...args);
        }
      },
      debug: (...args) => {
        if (this.debugSettings.debug) {
          console.debug(`[${this.name.toUpperCase()}]`, ...args);
        }
      },
      warn: (...args) => {
        // Warnings are typically shown regardless of debug settings
        console.warn(`[${this.name.toUpperCase()}]`, ...args);
      },
      error: (...args) => {
        if (this.debugSettings.errors) {
          console.error(`[${this.name.toUpperCase()}]`, ...args);
        }
      }
    };
  }
  
  /**
   * Check if this connection method is available
   * @returns {boolean} - Whether this method is available
   */
  isAvailable() {
    throw new Error('isAvailable() must be implemented by subclass');
  }
  
  /**
   * Get priority level for this connection method
   * @param {Object} options - Connection options that may affect priority
   * @returns {number} - Priority level (higher = try first)
   */
  getPriority(options = {}) {
    throw new Error('getPriority() must be implemented by subclass');
  }
  
  /**
   * Connect to a device
   * @param {Object} options - Connection options
   * @returns {Promise<boolean>} - Whether connection was successful
   */
  async connect(options = {}) {
    throw new Error('connect() must be implemented by subclass');
  }
  
  /**
   * Disconnect from the device
   * @returns {Promise<void>}
   */
  async disconnect() {
    throw new Error('disconnect() must be implemented by subclass');
  }
  
  /**
   * Send data to the device
   * @param {string|ArrayBuffer} data - Data to send
   * @returns {Promise<boolean>} - Whether data was sent successfully
   */
  async sendData(data) {
    throw new Error('sendData() must be implemented by subclass');
  }
  
  /**
   * Get information about the connected device
   * @returns {Object} - Device information
   */
  getDeviceInfo() {
    throw new Error('getDeviceInfo() must be implemented by subclass');
  }
}

export default ConnectionHandler;