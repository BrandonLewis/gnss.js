/**
 * GNSS Module - Main entry point
 * 
 * This module provides a JavaScript interface for connecting to GNSS RTK rovers
 * via Web Bluetooth or Web Serial, parsing NMEA data, and managing NTRIP correction data.
 */
import { EventEmitter } from './event-emitter.js';
import { BluetoothConnection } from './bluetooth.js'; 
import { NmeaParser } from './nmea-parser.js';
import { NtripClient } from './ntrip-client.js';
import { Settings } from './settings.js';
import { ConnectionManager } from './connection/connection-manager.js';
import { BluetoothHandler } from './connection/bluetooth-handler.js';
import { SerialHandler } from './connection/serial-handler.js';
import { RtkSettings } from './ui/rtk-settings.js'; 
import { RtkStatus } from './ui/rtk-status.js';

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
    
    // Initialize settings
    this.settings = new Settings(options.settings);
    
    // Initialize other properties
    this.debugSettings = options.debugSettings || {
      info: false,
      debug: false,
      errors: true,
      parsedSentences: false,
      rtcmMessages: false
    };
    
    // Initialize connection manager
    this.connectionManager = new ConnectionManager({
      events: this.events,
      settings: this.settings
    });
    
    // Initialize NMEA parser
    this.nmeaParser = new NmeaParser({
      events: this.events
    });
    
    // Initialize NTRIP client
    this.ntripClient = new NtripClient({
      events: this.events,
      settings: this.settings
    });
    
    // Initialize UI components if enabled
    if (options.ui !== false) {
      this.rtkSettings = new RtkSettings({
        events: this.events,
        settings: this.settings,
        selector: options.rtkSettingsSelector
      });
      
      this.rtkStatus = new RtkStatus({
        events: this.events,
        selector: options.rtkStatusSelector
      });
    }
    
    // Last known position
    this.currentPosition = null;
    
    // Setup internal event listeners
    this._setupEventListeners();
  }
  
  /**
   * Set up internal event listeners
   * @private
   */
  _setupEventListeners() {
    // Listen for position updates from NMEA parser
    this.events.on('nmea:position', (position) => {
      this.currentPosition = position;
      this.events.emit('position', position);
    });
    
    // Listen for satellite updates from NMEA parser
    this.events.on('nmea:satellites', (satellites) => {
      this.satellites = satellites;
      this.events.emit('satellites', satellites);
    });
    
    // Forward RTCM data to device when connected
    this.events.on('ntrip:rtcm', (rtcmData) => {
      if (this.connectionManager.isConnected()) {
        this.connectionManager.sendData(rtcmData.data);
      }
    });
  }
  
  /**
   * Connect to a GNSS device using available methods
   * @param {Object} options - Connection options
   * @returns {Promise<boolean>} Connection success
   */
  async connectDevice(options = {}) {
    try {
      const connected = await this.connectionManager.connect(options);
      
      if (connected) {
        // Setup data flow from device to NMEA parser
        this.connectionManager.on('data', (data) => {
          this.nmeaParser.parse(data);
        });
      }
      
      return connected;
    } catch (error) {
      this.events.emit('connection:error', { message: error.message });
      return false;
    }
  }
  
  /**
   * Connect specifically via Bluetooth
   * @param {Object} options - Bluetooth connection options
   * @returns {Promise<boolean>} Connection success
   */
  async connectBluetooth(options = {}) {
    return this.connectDevice({ 
      ...options,
      method: 'bluetooth'
    });
  }
  
  /**
   * Connect specifically via Serial
   * @param {Object} options - Serial connection options
   * @returns {Promise<boolean>} Connection success
   */
  async connectSerial(options = {}) {
    return this.connectDevice({ 
      ...options,
      method: 'serial'
    });
  }
  
  /**
   * Connect to NTRIP caster
   * @param {Object} options - Connection options
   * @returns {Promise<boolean>} Connection success
   */
  async connectNtrip(options = {}) {
    try {
      return await this.ntripClient.connect({
        ...options,
        position: this.currentPosition
      });
    } catch (error) {
      this.events.emit('ntrip:error', { message: error.message });
      return false;
    }
  }
  
  /**
   * Disconnect from device
   * @returns {Promise<void>}
   */
  async disconnectDevice() {
    return this.connectionManager.disconnect();
  }
  
  /**
   * Disconnect from NTRIP
   * @returns {Promise<void>}
   */
  async disconnectNtrip() {
    return this.ntripClient.disconnect();
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
    return this.satellites || [];
  }
  
  /**
   * Get the settings manager
   * @returns {Settings} Settings manager
   */
  getSettings() {
    return this.settings;
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

// Export other classes for extensibility
export { EventEmitter };
export { BluetoothConnection };
export { NmeaParser };
export { NtripClient };
export { Settings };
export { ConnectionManager };
export { BluetoothHandler };
export { SerialHandler };
export { RtkSettings };
export { RtkStatus };

// Export default GnssModule for backward compatibility
export default GnssModule;