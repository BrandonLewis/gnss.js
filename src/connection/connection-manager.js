/**
 * ConnectionManager - Manages and prioritizes different connection methods for GNSS devices
 */
class ConnectionManager {
  constructor(eventEmitter, options = {}) {
    this.eventEmitter = eventEmitter;
    this.connectionMethods = []; // List of registered connection handlers
    this.activeConnection = null;
    this.isConnected = false;
    this.isConnecting = false;
    this.debugSettings = options.debug || { 
      info: false, 
      debug: false,
      errors: true 
    };
    
    // Logger for debugging
    this.logger = {
      info: (...args) => {
        if (this.debugSettings.info) {
          console.info('[CONN-MGR]', ...args);
        }
      },
      debug: (...args) => {
        if (this.debugSettings.debug) {
          console.debug('[CONN-MGR]', ...args);
        }
      },
      warn: (...args) => {
        // Warnings are typically shown regardless of debug settings
        console.warn('[CONN-MGR]', ...args);
      },
      error: (...args) => {
        if (this.debugSettings.errors) {
          console.error('[CONN-MGR]', ...args);
        }
      }
    };
  }
  
  /**
   * Register a connection handler
   * @param {ConnectionHandler} handler - The connection handler to register
   */
  registerConnectionMethod(handler) {
    this.connectionMethods.push(handler);
    this.logger.info(`Registered connection method: ${handler.name}`);
  }
  
  /**
   * Get available connection methods
   * @param {Object} options - Connection options that may affect availability
   * @returns {Array} - List of available connection handlers
   */
  getAvailableMethods(options = {}) {
    const available = this.connectionMethods
      .filter(handler => handler.isAvailable())
      .sort((a, b) => b.getPriority(options) - a.getPriority(options));
    
    this.logger.debug(`Available connection methods: ${available.map(h => h.name).join(', ')}`);
    return available;
  }
  
  /**
   * Connect to a GNSS device using the most appropriate method
   * @param {Object} options - Connection options
   * @returns {Promise<boolean>} - Whether connection was successful
   */
  async connect(options = {}) {
    if (this.isConnected) {
      this.logger.info('Already connected');
      return true;
    }
    
    if (this.isConnecting) {
      this.logger.info('Connection already in progress');
      return false;
    }
    
    this.isConnecting = true;
    this.eventEmitter.emit('connection:connecting', {});
    
    try {
      // Get available connection methods sorted by priority
      const availableMethods = this.getAvailableMethods(options);
      
      if (availableMethods.length === 0) {
        throw new Error('No connection methods available');
      }
      
      // Try specific method if requested
      if (options.method && options.method !== 'auto') {
        const specificMethod = this.connectionMethods
          .find(handler => handler.name === options.method && handler.isAvailable());
          
        if (specificMethod) {
          this.logger.info(`Trying specifically requested method: ${options.method}`);
          const success = await specificMethod.connect(options);
          
          if (success) {
            this.activeConnection = specificMethod;
            this.isConnected = true;
            this.isConnecting = false;
            this.eventEmitter.emit('connection:connected', {
              method: specificMethod.name,
              deviceInfo: specificMethod.getDeviceInfo()
            });
            return true;
          }
          
          // Do not fall back to auto if a specific method was requested
          this.logger.info(`Requested method ${options.method} failed`);
          this.isConnecting = false;
          this.eventEmitter.emit('connection:error', {
            message: `Failed to connect with ${options.method} method`
          });
          return false;
        } else {
          this.logger.warn(`Requested method ${options.method} not available`);
          this.isConnecting = false;
          this.eventEmitter.emit('connection:error', {
            message: `Requested connection method '${options.method}' is not available`
          });
          return false;
        }
      }
      
      // Try each method in priority order
      for (const handler of availableMethods) {
        this.logger.info(`Trying connection method: ${handler.name}`);
        this.eventEmitter.emit('connection:connecting', { method: handler.name });
        
        try {
          const success = await handler.connect(options);
          
          if (success) {
            this.activeConnection = handler;
            this.isConnected = true;
            this.isConnecting = false;
            this.eventEmitter.emit('connection:connected', {
              method: handler.name,
              deviceInfo: handler.getDeviceInfo()
            });
            return true;
          }
        } catch (err) {
          this.logger.error(`Error with ${handler.name}:`, err);
          // Continue with next method
        }
        
        this.logger.info(`Connection with ${handler.name} failed, trying next method`);
      }
      
      // If we get here, all methods failed
      this.logger.error('All connection methods failed');
      this.isConnecting = false;
      this.eventEmitter.emit('connection:error', {
        message: 'Failed to connect with any available method'
      });
      return false;
    } catch (error) {
      this.logger.error('Connection error:', error);
      this.isConnecting = false;
      this.eventEmitter.emit('connection:error', {
        message: error.message,
        error
      });
      return false;
    }
  }
  
  /**
   * Disconnect from the device
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (!this.isConnected || !this.activeConnection) {
      return;
    }
    
    try {
      await this.activeConnection.disconnect();
      this.activeConnection = null;
      this.isConnected = false;
      this.eventEmitter.emit('connection:disconnected', {});
    } catch (error) {
      this.logger.error('Error during disconnect:', error);
      this.eventEmitter.emit('connection:error', {
        message: 'Failed to disconnect properly',
        error
      });
    }
  }
  
  /**
   * Send data to the connected device
   * @param {string|ArrayBuffer} data - Data to send
   * @returns {Promise<boolean>} - Whether data was sent successfully
   */
  async sendData(data) {
    if (!this.isConnected || !this.activeConnection) {
      this.logger.error('Cannot send data: no active connection');
      return false;
    }
    
    try {
      return await this.activeConnection.sendData(data);
    } catch (error) {
      this.logger.error('Error sending data:', error);
      this.eventEmitter.emit('connection:warning', {
        message: `Failed to send data: ${error.message}`,
        error
      });
      return false;
    }
  }
  
  /**
   * Check if device is connected
   * @returns {boolean} - Whether device is connected
   */
  isDeviceConnected() {
    return this.isConnected && this.activeConnection !== null;
  }
  
  /**
   * Get connection status information
   * @returns {Object} - Connection status
   */
  getConnectionInfo() {
    if (this.activeConnection) {
      return {
        connected: this.isConnected,
        connecting: this.isConnecting,
        method: this.activeConnection.name,
        deviceInfo: this.activeConnection.getDeviceInfo()
      };
    }
    
    return {
      connected: false,
      connecting: this.isConnecting,
      method: null,
      deviceInfo: null
    };
  }
}

export default ConnectionManager;