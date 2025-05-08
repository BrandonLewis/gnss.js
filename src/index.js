/**
 * GNSS Module - Main entry point
 * 
 * This module provides a JavaScript interface for connecting to GNSS RTK rovers
 * via Web Bluetooth or Web Serial, parsing NMEA data, and managing NTRIP correction data.
 */
import { EventEmitter } from './event-emitter.js';

/**
 * Main GNSS Module class
 * Manages device connections, NMEA parsing, and NTRIP client
 */
class GnssModule {
  /**
   * Create a new GNSS module instance
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    // Initialize event system
    this.events = new EventEmitter();
    
    // Initialize other properties
    this.debugSettings = options.debugSettings || {
      info: false,
      debug: false,
      errors: true,
      parsedSentences: false,
      rtcmMessages: false
    };
    
    // Last known position
    this.currentPosition = null;
  }
  
  /**
   * Set up internal event listeners
   * @private
   */
  _setupEventListeners() {
    // To be implemented as components are added
  }
  
  /**
   * Connect to a GNSS device using available methods
   * @param {Object} options - Connection options
   * @returns {Promise<boolean>} Connection success
   */
  async connectDevice(options = {}) {
    console.log('connectDevice not yet implemented');
    return false;
  }
  
  /**
   * Connect to NTRIP caster
   * @param {Object} options - Connection options
   * @returns {Promise<boolean>} Connection success
   */
  async connectNtrip(options = {}) {
    console.log('connectNtrip not yet implemented');
    return false;
  }
  
  /**
   * Disconnect from device
   * @returns {Promise<void>}
   */
  async disconnectDevice() {
    console.log('disconnectDevice not yet implemented');
  }
  
  /**
   * Disconnect from NTRIP
   * @returns {Promise<void>}
   */
  async disconnectNtrip() {
    console.log('disconnectNtrip not yet implemented');
  }
  
  /**
   * Get current position
   * @returns {Object|null} Current position
   */
  getPosition() {
    return this.currentPosition;
  }
  
  /**
   * Get satellite information
   * @returns {Array|null} Satellite information
   */
  getSatellites() {
    return [];
  }
  
  /**
   * Subscribe to an event
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  on(event, callback) {
    return this.events.on(event, callback);
  }
  
  /**
   * Unsubscribe from an event
   * @param {string} event - Event name
   * @param {Function} callback - Callback function
   */
  off(event, callback) {
    this.events.off(event, callback);
  }
}

// Export the main module class
export { GnssModule };

// Export EventEmitter for extensibility
export { EventEmitter };

// Export default GnssModule for backward compatibility
export default GnssModule;