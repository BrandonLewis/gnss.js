/**
 * @brandon7lewis/gnss.js v1.7.1
 * JavaScript module for GNSS device connections, NMEA parsing, and NTRIP client functionality
 * https://github.com/BrandonLewis/gnss.js#readme
 * 
 * @license MIT
 * @copyright 2025 Your Name <your.email@example.com>
 */

(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.GnssModule = {}));
})(this, (function (exports) { 'use strict';

  /**
   * EventEmitter - Simple event system for component communication
   */
  class EventEmitter {
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

  /**
   * NmeaParser - Parses NMEA sentences from the GNSS receiver
   */
  class NmeaParser {
    constructor(options = {}) {
      this.lastPosition = null;
      this.lastSatellites = [];
      this.satellitesById = {};
      this.buffer = '';
      this.sentenceStats = {
        GGA: 0,
        GSA: 0,
        GSV: 0,
        RMC: 0,
        GST: 0,
        VTG: 0,
        UNKNOWN: 0
      };
      this.lastSentenceTime = Date.now();
      
      // Store the event emitter if provided
      this.events = options.events || null;
      
      // Debug settings
      this.debug = options.debug || { 
        info: false,
        debug: false,
        errors: true,
        parsedSentences: false,
        rtcmMessages: false
      };
      
      // Set up logger functions
      this.logger = {
        info: (...args) => {
          if (this.debug.info) {
            console.info('[NMEA-INFO]', ...args);
          }
        },
        debug: (...args) => {
          if (this.debug.debug) {
            console.debug('[NMEA-DEBUG]', ...args);
          }
        },
        error: (...args) => {
          if (this.debug.errors) {
            console.error('[NMEA-ERROR]', ...args);
          }
        },
        warn: (...args) => {
          if (this.debug.errors) {
            console.warn('[NMEA-WARN]', ...args);
          }
        },
        parsedSentence: (...args) => {
          if (this.debug.parsedSentences) {
            console.log('[NMEA-PARSED]', ...args);
          }
        }
      };
    }

    /**
     * Parse data received from the device
     * @param {string|ArrayBuffer} data - Raw data from receiver
     * @returns {Object} Parsed NMEA data
     */
    parseData(data) {
      // Convert ArrayBuffer to string if needed
      let stringData = '';
      if (data instanceof ArrayBuffer) {
        stringData = new TextDecoder().decode(data);
      } else {
        stringData = data;
      }
      
      // Add to buffer and process any complete sentences
      this.buffer += stringData;
      return this.processBuffer();
    }
    
    /**
     * Alias for parseData for backward compatibility
     * @param {string|ArrayBuffer} data - Raw data from receiver
     * @returns {Object} Parsed NMEA data
     */
    parse(data) {
      return this.parseData(data);
    }

    /**
     * Process the current buffer for complete NMEA sentences
     * @returns {Object[]} Array of parsed NMEA objects
     */
    processBuffer() {
      // Handle different line endings (CRLF, LF, CR)
      const sentences = this.buffer.split(/\r\n|\n|\r/);
      // Keep the last potentially incomplete sentence in the buffer
      this.buffer = sentences.pop() || '';
      
      const results = [];
      let positionUpdated = false;
      let satellitesUpdated = false;
      
      for (const sentence of sentences) {
        if (sentence.trim() === '') continue;
        
        try {
          const parsed = this.parseSentence(sentence);
          if (parsed) {
            results.push(parsed);
            
            // Check if position data has been updated
            if ((parsed.type === 'GGA' || parsed.type === 'RMC') && this.lastPosition) {
              positionUpdated = true;
            }
            
            // Check if satellite data has been updated
            // GSV data updates satellites in view
            if (parsed.type === 'GSV' && parsed.messageNumber === parsed.totalMessages) {
              satellitesUpdated = true;
            }
            // GSA data also updates satellite information (which satellites are used in the fix)
            else if (parsed.type === 'GSA') {
              satellitesUpdated = true;
            }
          }
        } catch (error) {
          this.logger.error('Error parsing NMEA sentence:', error, sentence);
        }
      }
      
      // Emit position event if we have new position data and an event emitter
      if (positionUpdated && this.events) {
        const position = this.getPosition();
        if (position) {
          // Add a timestamp for convenience
          const positionWithTimestamp = {
            ...position,
            timestamp: new Date()
          };
          // Use the standardized event name from constants.js (position:update)
          this.events.emit('position:update', positionWithTimestamp);
        }
      }
      
      // Emit satellites event if we have new satellite data and an event emitter
      if (satellitesUpdated && this.events) {
        const satellites = this.getSatellites();
        if (satellites && satellites.length > 0) {
          // Use the standardized event name from constants.js (satellites:update)
          this.events.emit('satellites:update', satellites);
        }
      }
      
      return results;
    }

    /**
     * Parse a single NMEA sentence
     * @param {string} sentence - NMEA sentence
     * @returns {Object|null} Parsed data or null if invalid
     */
    parseSentence(sentence) {
      try {
        // Basic validation
        if (!sentence || typeof sentence !== 'string') {
          this.logger.debug('Invalid NMEA sentence (not a string):', sentence);
          return null;
        }
        
        sentence = sentence.trim();
        
        if (!sentence.startsWith('$') || sentence.length < 9) {
          this.logger.debug('Invalid NMEA sentence format:', sentence);
          return null;
        }
        
        // Check for checksum
        const asteriskIndex = sentence.indexOf('*');
        if (asteriskIndex === -1) {
          this.logger.debug('Missing checksum in NMEA sentence:', sentence);
          return null;
        }
        
        // Check checksum
        if (!this.validateChecksum(sentence)) {
          this.logger.debug('Invalid NMEA checksum:', sentence);
          return null;
        }
        
        // Log raw sentence for debugging
        this.logger.parsedSentence('Valid NMEA sentence:', sentence);
        
        // Split the sentence by commas, removing the '$' and checksum
        let parts = sentence.substring(1, asteriskIndex).split(',');
        if (parts.length < 1) {
          this.logger.debug('Invalid NMEA sentence structure:', sentence);
          return null;
        }
        
        const sentenceType = parts[0];
        if (!sentenceType || sentenceType.length < 3) {
          this.logger.debug('Invalid NMEA sentence type:', sentenceType);
          return null;
        }
        
        // Extract type without prefix (e.g., GPGGA -> GGA)
        const typeWithoutPrefix = sentenceType.substring(2);
        this.logger.parsedSentence(`Parsing NMEA sentence type: ${sentenceType} (${typeWithoutPrefix})`);
        
        // Parse different sentence types
        let result;
        switch (sentenceType) {
          case 'GPGGA':
          case 'GNGGA':
          case 'BDGGA':
          case 'GLGGA':
            result = this.parseGGA(parts);
            break;
          case 'GPGSA':
          case 'GNGSA':
          case 'BDGSA':
          case 'GLGSA':
            result = this.parseGSA(parts);
            break;
          case 'GPGSV':
          case 'GNGSV':
          case 'BDGSV':
          case 'GLGSV':
            result = this.parseGSV(parts);
            break;
          case 'GPRMC':
          case 'GNRMC':
          case 'BDRMC':
          case 'GLRMC':
            result = this.parseRMC(parts);
            break;
          case 'GPGST':
          case 'GNGST':
          case 'BDGST':
          case 'GLGST':
            result = this.parseGST(parts);
            break;
          case 'GPVTG':
          case 'GNVTG':
          case 'BDVTG':
          case 'GLVTG':
            result = this.parseVTG(parts);
            break;
          default: {
            // For unknown sentence types, extract the last part of the type
            // Common prefixes: GP = GPS, GN = GNSS, BD = BeiDou, GL = GLONASS, GA = Galileo
            const match = sentenceType.match(/^(GP|GN|BD|GL|GA)(.+)$/);
            const type = match ? match[2] : typeWithoutPrefix;
            
            result = {
              type,
              raw: sentence
            };
            break;
          }
        }
        
        // Add raw data for reference
        if (result) {
          result.raw = sentence;
          
          // Update sentence statistics
          if (result.type) {
            if (this.sentenceStats.hasOwnProperty(result.type)) {
              this.sentenceStats[result.type]++;
            } else {
              this.sentenceStats.UNKNOWN++;
            }
          }
          
          // Calculate data rate
          const now = Date.now();
          const elapsed = now - this.lastSentenceTime;
          if (elapsed > 0) {
            result.dataRate = parseFloat((1000 / elapsed).toFixed(2)); // sentences per second
          }
          this.lastSentenceTime = now;
        }
        
        return result;
      } catch (error) {
        this.logger.error('Unexpected error parsing NMEA sentence:', error, sentence);
        return null;
      }
    }

    /**
     * Validate NMEA checksum
     * @param {string} sentence - NMEA sentence
     * @returns {boolean} Whether checksum is valid
     */
    validateChecksum(sentence) {
      // Extract checksum from the sentence
      const asteriskIndex = sentence.indexOf('*');
      if (asteriskIndex === -1 || asteriskIndex === sentence.length - 1) {
        return false;
      }
      
      const checksumString = sentence.substring(asteriskIndex + 1);
      const expectedChecksum = parseInt(checksumString, 16);
      
      // Calculate checksum by XORing all bytes between $ and *
      let calculatedChecksum = 0;
      for (let i = 1; i < asteriskIndex; i++) {
        calculatedChecksum ^= sentence.charCodeAt(i);
      }
      
      return calculatedChecksum === expectedChecksum;
    }

    /**
     * Parse GGA sentence (Global Positioning System Fix Data)
     * @param {string[]} parts - Sentence parts
     * @returns {Object} Parsed GGA data
     */
    parseGGA(parts) {
      const latitude = this.parseLatitude(parts[2], parts[3]);
      const longitude = this.parseLongitude(parts[4], parts[5]);
      const fixQuality = parseInt(parts[6] || '0');
      const satellites = parseInt(parts[7] || '0');
      const hdop = parseFloat(parts[8] || '0');
      const altitude = parts[9] ? parseFloat(parts[9]) : null;
      
      // Update the last position if coordinates are valid
      if (latitude !== null && longitude !== null) {
        this.lastPosition = { 
          latitude, 
          longitude,
          fixQuality,
          satellites,
          hdop,
          altitude,
          // Add other position details
          altitudeUnits: parts[10],
          geoidHeight: parts[11] ? parseFloat(parts[11]) : null,
          geoidHeightUnits: parts[12],
          dgpsAge: parts[13] ? parseFloat(parts[13]) : null,
          dgpsStation: parts[14]
        };
      }
      
      return {
        type: 'GGA',
        time: parts[1],
        latitude,
        longitude,
        fixQuality,
        satellites,
        hdop,
        altitude,
        altitudeUnits: parts[10],
        geoidHeight: parts[11] ? parseFloat(parts[11]) : null,
        geoidHeightUnits: parts[12],
        dgpsAge: parts[13] ? parseFloat(parts[13]) : null,
        dgpsStation: parts[14]
      };
    }

    /**
     * Parse GSA sentence (GPS DOP and active satellites)
     * @param {string[]} parts - Sentence parts
     * @returns {Object} Parsed GSA data
     */
    parseGSA(parts) {
      const satellites = [];
      
      // Reset all 'used' flags for tracked satellites
      Object.keys(this.satellitesById).forEach(key => {
        if (this.satellitesById[key]) {
          this.satellitesById[key].used = false;
        }
      });
      
      // Extract satellite IDs (parts 3-14)
      for (let i = 3; i <= 14; i++) {
        if (parts[i] && parts[i].trim() !== '') {
          const prn = parseInt(parts[i]);
          satellites.push(prn);
          
          // Mark this satellite as used in our satellite tracking
          if (this.satellitesById[prn]) {
            this.satellitesById[prn].used = true;
          } else {
            // Create a placeholder entry if the satellite isn't in our list yet
            this.satellitesById[prn] = {
              prn,
              used: true,
              elevation: null,
              azimuth: null,
              snr: null
            };
          }
        }
      }
      
      return {
        type: 'GSA',
        mode: parts[1],
        fixType: parseInt(parts[2] || '1'),
        satellites,
        pdop: parseFloat(parts[15] || '0'),
        hdop: parseFloat(parts[16] || '0'),
        vdop: parseFloat(parts[17] || '0')
      };
    }

    /**
     * Parse GSV sentence (GPS Satellites in view)
     * @param {string[]} parts - Sentence parts
     * @returns {Object} Parsed GSV data
     */
    parseGSV(parts) {
      const currentMessageSatellites = [];
      
      // Total number of messages, message number, total satellites in view
      const totalMessages = parseInt(parts[1] || '1');
      const messageNumber = parseInt(parts[2] || '1');
      const satellitesInView = parseInt(parts[3] || '0');
      
      // Handle first message in set
      if (messageNumber === 1) {
        // Clear existing satellites if this is a new set of messages
        this.satellitesById = {};
      }
      
      // Each satellite block is 4 parts: PRN, elevation, azimuth, SNR
      const numSatellitesInMessage = Math.min(4, Math.floor((parts.length - 4) / 4));
      
      for (let i = 0; i < numSatellitesInMessage; i++) {
        const baseIndex = 4 + (i * 4);
        
        // Some receivers may not send all 4 values for each satellite
        if (baseIndex + 3 < parts.length) {
          const prn = parseInt(parts[baseIndex] || '0');
          if (prn === 0) continue; // Skip invalid PRNs
          
          // Create or update satellite info
          const existingSatellite = this.satellitesById[prn] || {};
          const satellite = {
            prn,
            elevation: parseInt(parts[baseIndex + 1] || '0'),
            azimuth: parseInt(parts[baseIndex + 2] || '0'),
            snr: parts[baseIndex + 3] ? parseInt(parts[baseIndex + 3]) : null,
            // Preserve the 'used' flag if it was set by GSA sentence
            used: existingSatellite.used || false
          };
          
          // Store satellite by PRN in our tracking object
          this.satellitesById[prn] = satellite;
          
          // Add to current message list
          currentMessageSatellites.push(satellite);
        }
      }
      
      // Rebuild full satellite list after processing all messages
      if (messageNumber === totalMessages) {
        this.lastSatellites = Object.values(this.satellitesById);
      }
      
      return {
        type: 'GSV',
        totalMessages,
        messageNumber,
        satellitesInView,
        satellites: currentMessageSatellites
      };
    }

    /**
     * Parse RMC sentence (Recommended Minimum Navigation Information)
     * @param {string[]} parts - Sentence parts
     * @returns {Object} Parsed RMC data
     */
    parseRMC(parts) {
      const latitude = this.parseLatitude(parts[3], parts[4]);
      const longitude = this.parseLongitude(parts[5], parts[6]);
      const speed = parts[7] ? parseFloat(parts[7]) : null; // Speed over ground in knots
      const course = parts[8] ? parseFloat(parts[8]) : null; // Course in degrees
      
      // Extract date components
      let date = null;
      if (parts[9] && parts[9].length === 6) {
        const day = parts[9].substring(0, 2);
        const month = parts[9].substring(2, 4);
        const year = '20' + parts[9].substring(4, 6); // Assuming 20xx years
        date = `${year}-${month}-${day}`;
      }
      
      // Extract time components
      let time = null;
      if (parts[1] && parts[1].length >= 6) {
        const hours = parts[1].substring(0, 2);
        const minutes = parts[1].substring(2, 4);
        const seconds = parts[1].substring(4);
        time = `${hours}:${minutes}:${seconds}`;
      }
      
      // Update the last position if coordinates are valid and status is active
      if (latitude !== null && longitude !== null && parts[2] === 'A') {
        // Preserve the existing data like altitude and fix quality
        // that might have come from GGA sentences
        const currentPosition = this.lastPosition || {};
        
        this.lastPosition = { 
          ...currentPosition,
          latitude, 
          longitude,
          // Add RMC-specific data
          status: parts[2],
          speed,
          course,
          date,
          time,
          // The RMC sentence has a mode indicator too
          mode: parts[12]
        };
      }
      
      return {
        type: 'RMC',
        time,
        status: parts[2], // A=active, V=void
        latitude,
        longitude,
        speed, // Speed over ground in knots
        course, // Course in degrees
        date,
        magneticVariation: parts[10] ? parseFloat(parts[10]) : null,
        magneticVariationDirection: parts[11],
        mode: parts[12] // A=autonomous, D=differential, E=estimated
      };
    }

    /**
     * Parse GST sentence (GPS Pseudorange Noise Statistics)
     * @param {string[]} parts - Sentence parts
     * @returns {Object} Parsed GST data
     */
    parseGST(parts) {
      return {
        type: 'GST',
        time: parts[1],
        rms: parseFloat(parts[2] || '0'), // RMS value of the standard deviation of the range inputs
        semiMajorError: parseFloat(parts[3] || '0'), // Standard deviation of semi-major axis
        semiMinorError: parseFloat(parts[4] || '0'), // Standard deviation of semi-minor axis
        orientationError: parseFloat(parts[5] || '0'), // Orientation of semi-major axis
        latitudeError: parseFloat(parts[6] || '0'), // Standard deviation of latitude error
        longitudeError: parseFloat(parts[7] || '0'), // Standard deviation of longitude error
        heightError: parseFloat(parts[8] || '0') // Standard deviation of height error
      };
    }
    
    /**
     * Parse VTG sentence (Course Over Ground and Ground Speed)
     * @param {string[]} parts - Sentence parts
     * @returns {Object} Parsed VTG data
     */
    parseVTG(parts) {
      return {
        type: 'VTG',
        courseTrue: parts[1] ? parseFloat(parts[1]) : null, // Course over ground (true)
        trueCourseRef: parts[2], // T = True
        courseMagnetic: parts[3] ? parseFloat(parts[3]) : null, // Course over ground (magnetic)
        magneticCourseRef: parts[4], // M = Magnetic
        speedKnots: parts[5] ? parseFloat(parts[5]) : null, // Speed over ground in knots
        knotsRef: parts[6], // N = Knots
        speedKmh: parts[7] ? parseFloat(parts[7]) : null, // Speed over ground in km/h
        kmhRef: parts[8], // K = km/h
        mode: parts[9] // Mode indicator: A=Autonomous, D=Differential, E=Estimated
      };
    }

    /**
     * Parse latitude from NMEA format
     * @param {string} value - Latitude value
     * @param {string} direction - N/S
     * @returns {number|null} Decimal latitude
     */
    parseLatitude(value, direction) {
      if (!value || value === '') {
        return null;
      }
      
      try {
        // NMEA format: DDMM.MMMM
        const degrees = parseInt(value.substring(0, 2));
        const minutes = parseFloat(value.substring(2));
        let latitude = degrees + (minutes / 60);
        
        // Apply direction
        if (direction === 'S') {
          latitude = -latitude;
        }
        
        return parseFloat(latitude.toFixed(6));
      } catch (error) {
        this.logger.error('Error parsing latitude:', error, value, direction);
        return null;
      }
    }

    /**
     * Parse longitude from NMEA format
     * @param {string} value - Longitude value
     * @param {string} direction - E/W
     * @returns {number|null} Decimal longitude
     */
    parseLongitude(value, direction) {
      if (!value || value === '') {
        return null;
      }
      
      try {
        // NMEA format: DDDMM.MMMM
        const degrees = parseInt(value.substring(0, 3));
        const minutes = parseFloat(value.substring(3));
        let longitude = degrees + (minutes / 60);
        
        // Apply direction
        if (direction === 'W') {
          longitude = -longitude;
        }
        
        return parseFloat(longitude.toFixed(6));
      } catch (error) {
        this.logger.error('Error parsing longitude:', error, value, direction);
        return null;
      }
    }

    /**
     * Get the current position
     * @returns {Object|null} Current position with latitude, longitude, altitude, quality, etc.
     */
    getPosition() {
      if (!this.lastPosition) {
        return null;
      }
      
      // Create a complete position object
      return {
        latitude: this.lastPosition.latitude,
        longitude: this.lastPosition.longitude,
        altitude: this.lastPosition.altitude || null,
        // Include fix quality from GGA if available
        quality: this.lastPosition.fixQuality || 0,
        // Include satellite count
        satellites: this.lastPosition.satellites || 0,
        // Include HDOP if available
        hdop: this.lastPosition.hdop || null,
        // Include speed if available (from RMC)
        speed: this.lastPosition.speed || null,
        // Include course if available (from RMC)
        course: this.lastPosition.course || null,
      };
    }

    /**
     * Get current satellite information
     * @returns {Object[]|null} Satellite information
     */
    getSatellites() {
      if (!this.lastSatellites || this.lastSatellites.length === 0) {
        return [];
      }
      
      // Return a clone of the satellites array so external code cannot modify our internal state
      return [...this.lastSatellites];
    }
    
    /**
     * Get sentence statistics
     * @returns {Object} Sentence type counts and rates
     */
    getSentenceStats() {
      return {
        ...this.sentenceStats,
        lastUpdate: this.lastSentenceTime
      };
    }

    /**
     * Clear parsed data
     */
    reset() {
      this.lastPosition = null;
      this.lastSatellites = [];
      this.satellitesById = {};
      this.buffer = '';
      // Reset sentence stats
      Object.keys(this.sentenceStats).forEach(key => {
        this.sentenceStats[key] = 0;
      });
      this.lastSentenceTime = Date.now();
    }
  }

  /**
   * NtripClient - Handles connections to NTRIP casters for RTK corrections
   * with multiple connection approaches (direct, proxy, WebSocket)
   */
  class NtripClient {
    /**
     * Create a new NTRIP client
     * @param {Object} eventEmitter - Event emitter for communication
     * @param {Object} options - Configuration options
     */
    constructor(eventEmitter, options = {}) {
      this.eventEmitter = eventEmitter;
      this.debug = options.debug || {};
      this.isConnected = false;
      this.isConnecting = false;
      this.autoReconnect = true;
      this.reconnectAttempts = 0;
      this.maxReconnectAttempts = 5;
      this.reconnectDelay = 5000; // 5 seconds initial reconnect delay
      
      // Default configuration
      this.config = {
        // Basic NTRIP configuration
        casterHost: 'rtk2go.com',
        casterPort: 2101,
        mountpoint: 'RTCM3_IMAX',
        username: '',
        password: '',
        sendGga: true,
        
        // Connection options
        connectionMode: 'auto', // 'auto', 'direct', 'proxy', 'websocket'
        proxyUrl: 'http://localhost:3000',  // URL to proxy server (relative or absolute)
        websocketUrl: 'ws://localhost:3000/ws', // WebSocket endpoint
        
        // Advanced settings
        ggaUpdateInterval: 10 // Seconds between GGA updates
      };
      
      // Connection handling
      this.abortController = null;  // For direct fetch
      this.reader = null;           // For direct fetch
      this.webSocket = null;        // For WebSocket
      this.activeMode = null;       // Which connection mode is active
      
      // GGA handling
      this.ggaInterval = null;
      this.lastGga = null;  // Last GGA sentence sent
      this.lastPosition = null; // Last position data for generating GGA
      
      // RTCM statistics
      this.rtcmStats = {
        messagesReceived: 0,
        bytesSent: 0,
        bytesReceived: 0,
        lastMessageTime: null,
        correctionAge: null
      };
      
      // Device manager for sending corrections
      this.deviceManager = null;
      this.rtcmQueue = [];
      
      // Bind methods
      this.handleSocketMessage = this.handleSocketMessage.bind(this);
      this.handleSocketClose = this.handleSocketClose.bind(this);
      this.handleSocketError = this.handleSocketError.bind(this);
    }

    /**
     * Set the device manager for sending corrections
     * @param {Object} deviceManager - ConnectionManager or BluetoothManager
     */
    setDeviceManager(deviceManager) {
      this.deviceManager = deviceManager;
      
      // If this is a legacy BluetothManager reference, keep it for backward compatibility
      if (deviceManager && deviceManager.name === 'bluetooth') {
        this.bluetoothManager = deviceManager;
      }
    }

    /**
     * Connect to NTRIP caster using the configured method
     * @param {Object} config - Connection configuration
     * @returns {Promise<boolean>} Whether connection was successful
     */
    async connect(config = {}) {
      if (this.isConnected) {
        console.log('Already connected to NTRIP caster');
        return true;
      }
      
      if (this.isConnecting) {
        console.log('Already connecting to NTRIP caster');
        return false;
      }
      
      // Update configuration with provided options
      this.config = { 
        ...this.config, 
        ...config 
      };
      
      // Validate configuration
      console.log('Validating NTRIP config:', {
        casterHost: this.config.casterHost, 
        mountpoint: this.config.mountpoint,
        connectionMode: this.config.connectionMode
      });
      
      if (!this.config.casterHost || this.config.casterHost === '') {
        console.error('NTRIP caster host is missing or empty');
        this.eventEmitter.emit('ntrip:error', {
          message: 'Invalid NTRIP configuration. Host is required.'
        });
        return false;
      }
      
      if (!this.config.mountpoint || this.config.mountpoint === '') {
        console.error('NTRIP mountpoint is missing or empty');
        this.eventEmitter.emit('ntrip:error', {
          message: 'Invalid NTRIP configuration. Mountpoint is required.'
        });
        return false;
      }
      
      this.isConnecting = true;
      this.eventEmitter.emit('ntrip:connecting', { 
        casterHost: this.config.casterHost,
        mountpoint: this.config.mountpoint
      });
      
      // Determine connection mode
      const connectionMode = this.config.connectionMode;
      
      // Auto mode - try WebSocket first, then direct, then proxy
      if (connectionMode === 'auto') {
        // Try WebSocket first
        try {
          const wsSuccess = await this.connectWebSocket();
          if (wsSuccess) {
            this.activeMode = 'websocket';
            return true;
          }
        } catch (wsError) {
          console.log('WebSocket connection failed, falling back to direct:', wsError);
        }
        
        // Try direct connection
        try {
          const directSuccess = await this.connectDirect();
          if (directSuccess) {
            this.activeMode = 'direct';
            return true;
          }
        } catch (directError) {
          console.log('Direct connection failed, falling back to proxy:', directError);
        }
        
        // Try proxy as last resort
        try {
          const proxySuccess = await this.connectProxy();
          if (proxySuccess) {
            this.activeMode = 'proxy';
            return true;
          }
        } catch (proxyError) {
          this.isConnecting = false;
          this.eventEmitter.emit('ntrip:error', {
            message: 'All connection methods failed',
            error: proxyError
          });
          return false;
        }
      } 
      // Specific connection modes
      else if (connectionMode === 'websocket') {
        try {
          const success = await this.connectWebSocket();
          if (success) {
            this.activeMode = 'websocket';
            return true;
          }
        } catch (error) {
          this.isConnecting = false;
          this.eventEmitter.emit('ntrip:error', {
            message: 'WebSocket connection failed',
            error
          });
          return false;
        }
      }
      else if (connectionMode === 'direct') {
        try {
          const success = await this.connectDirect();
          if (success) {
            this.activeMode = 'direct';
            return true;
          }
        } catch (error) {
          this.isConnecting = false;
          this.eventEmitter.emit('ntrip:error', {
            message: 'Direct connection failed',
            error
          });
          return false;
        }
      }
      else if (connectionMode === 'proxy') {
        try {
          const success = await this.connectProxy();
          if (success) {
            this.activeMode = 'proxy';
            return true;
          }
        } catch (error) {
          this.isConnecting = false;
          this.eventEmitter.emit('ntrip:error', {
            message: 'Proxy connection failed',
            error
          });
          return false;
        }
      }
      
      // If we reach here, all connection attempts failed
      this.isConnecting = false;
      this.eventEmitter.emit('ntrip:error', {
        message: 'All connection methods failed'
      });
      return false;
    }
    
    /**
     * Connect to NTRIP caster using WebSocket to proxy
     * @returns {Promise<boolean>} Whether connection was successful
     */
    async connectWebSocket() {
      return new Promise((resolve, reject) => {
        try {
          // Determine WebSocket URL
          let wsUrl = this.config.websocketUrl;
          
          // If it's a relative URL, make it absolute
          if (wsUrl.startsWith('/')) {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            wsUrl = `${protocol}//${window.location.host}${wsUrl}`;
          }
          
          // Handle mixed content issue - enforce WSS if we're connecting from HTTPS
          if (window.location.protocol === 'https:' && 
              wsUrl.startsWith('ws:') && 
              (wsUrl.includes('192.168.') || 
               wsUrl.includes('127.0.0.1') || 
               wsUrl.includes('localhost'))) {
            console.log('Adjusting WebSocket URL protocol to match page protocol (WSS)');
            wsUrl = wsUrl.replace('ws:', 'wss:');
          }
          
          console.log(`Connecting to NTRIP via WebSocket at ${wsUrl}`, {
            casterHost: this.config.casterHost,
            mountpoint: this.config.mountpoint,
            connectionMode: this.config.connectionMode
          });
          this.webSocket = new WebSocket(wsUrl);
          
          // Set up connection timeout
          const connectionTimeout = setTimeout(() => {
            if (this.webSocket && this.webSocket.readyState !== WebSocket.OPEN) {
              this.webSocket.close();
              reject(new Error('WebSocket connection timeout'));
            }
          }, 10000); // 10 second timeout
          
          // Set up event handlers
          this.webSocket.onopen = () => {
            clearTimeout(connectionTimeout);
            
            console.log('WebSocket connected to proxy, sending NTRIP connection request');
            
            // Send connection request to proxy
            this.webSocket.send(JSON.stringify({
              command: 'connect',
              config: {
                casterHost: this.config.casterHost,
                casterPort: this.config.casterPort,
                mountpoint: this.config.mountpoint,
                username: this.config.username,
                password: this.config.password
              }
            }));
          };
          
          // Connection status handler
          this.webSocket.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              
              // Handle connection status message
              if (data.type === 'status') {
                if (data.connected) {
                  // Successfully connected
                  this.isConnected = true;
                  this.isConnecting = false;
                  this.reconnectAttempts = 0;
                  
                  // Setup regular message handler
                  this.webSocket.onmessage = this.handleSocketMessage;
                  
                  // Setup other event handlers
                  this.webSocket.onclose = this.handleSocketClose;
                  this.webSocket.onerror = this.handleSocketError;
                  
                  // Start GGA updates if enabled
                  if (this.config.sendGga && this.lastGga) {
                    this.startGgaUpdates();
                  }
                  
                  // Emit connected event
                  this.eventEmitter.emit('ntrip:connected', {
                    casterHost: this.config.casterHost,
                    mountpoint: this.config.mountpoint,
                    mode: 'websocket'
                  });
                  
                  resolve(true);
                } else {
                  // Connection failed
                  reject(new Error(data.message || 'WebSocket connection failed'));
                }
              } else if (data.type === 'error') {
                reject(new Error(data.message || 'WebSocket connection error'));
              }
            } catch (e) {
              // Not JSON, unexpected during connection phase
              reject(new Error('Unexpected binary data during WebSocket connection'));
            }
          };
          
          // Initial error handler just for connection phase
          this.webSocket.onerror = (error) => {
            clearTimeout(connectionTimeout);
            reject(new Error('WebSocket connection error'));
          };
          
          // Initial close handler just for connection phase
          this.webSocket.onclose = (event) => {
            clearTimeout(connectionTimeout);
            reject(new Error(`WebSocket closed: ${event.code} - ${event.reason}`));
          };
        } catch (error) {
          reject(error);
        }
      });
    }
    
    /**
     * Connect directly to NTRIP caster
     * @returns {Promise<boolean>} Whether connection was successful
     */
    async connectDirect() {
      try {
        // Determine if we're on an HTTPS page
        const isHttpsPage = typeof window !== 'undefined' && window.location && window.location.protocol === 'https:';
        
        // Create URL for NTRIP connection
        const protocol = this.config.casterPort === 443 ? 'https' : 'http';
        
        // Check for mixed content scenario - HTTPS page trying to access HTTP NTRIP caster
        if (isHttpsPage && protocol === 'http') {
          console.log('Mixed content issue detected:', {
            isHttpsPage,
            protocol,
            casterHost: this.config.casterHost,
            mountpoint: this.config.mountpoint,
            connectionMode: this.config.connectionMode
          });
          
          this.eventEmitter.emit('ntrip:info', { 
            message: 'Mixed content detected - HTTPS page trying to access HTTP NTRIP. Switching to proxy/WebSocket.'
          });
          
          // Try WebSocket first if auto mode
          if (this.config.connectionMode === 'auto' || this.config.connectionMode === 'websocket') {
            try {
              return await this.connectWebSocket();
            } catch (wsError) {
              this.eventEmitter.emit('ntrip:info', { 
                message: 'WebSocket connection failed after mixed content detection, trying proxy'
              });
            }
          }
          
          // Fall back to proxy connection instead of direct
          return await this.connectProxy();
        }
        
        const url = `${protocol}://${this.config.casterHost}:${this.config.casterPort}/${this.config.mountpoint}`;
        
        // Prepare authentication headers if needed
        const headers = new Headers({
          'Accept': 'application/octet-stream',
          'User-Agent': 'NTRIP WebGNSS Client'
        });
        
        if (this.config.username && this.config.password) {
          const auth = btoa(`${this.config.username}:${this.config.password}`);
          headers.append('Authorization', `Basic ${auth}`);
        }
        
        // Create abort controller for clean disconnection
        this.abortController = new AbortController();
        
        // Make the request
        const response = await fetch(url, {
          method: 'GET',
          headers,
          signal: this.abortController.signal
        });
        
        // Check if connection was successful
        if (!response.ok) {
          throw new Error(`NTRIP server error: ${response.status} ${response.statusText}`);
        }
        
        // Get a reader for the response body
        const contentType = response.headers.get('content-type');
        
        // For debugging - log content type
        this.eventEmitter.emit('ntrip:info', { 
          message: `Direct NTRIP connection established, content type: ${contentType}`
        });
        
        // Start reading from the response stream
        this.reader = response.body.getReader();
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        
        // Emit connected event
        this.eventEmitter.emit('ntrip:connected', {
          casterHost: this.config.casterHost,
          mountpoint: this.config.mountpoint,
          mode: 'direct'
        });
        
        // If we have a GGA message or position, start sending it periodically
        if (this.config.sendGga && (this.lastGga || this.lastPosition)) {
          this.startGgaUpdates();
        }
        
        // Start processing the stream
        this.readStream();
        
        return true;
      } catch (error) {
        console.error('Direct connection error:', error);
        throw error;
      }
    }
    
    /**
     * Connect to NTRIP caster via HTTP proxy
     * @returns {Promise<boolean>} Whether connection was successful
     */
    async connectProxy() {
      try {
        // Determine proxy URL
        let proxyUrl = this.config.proxyUrl;
        
        // If it's a relative URL, make it absolute
        if (proxyUrl.startsWith('/')) {
          const protocol = window.location.protocol;
          proxyUrl = `${protocol}//${window.location.host}${proxyUrl}`;
        }
        
        // Handle mixed content issue - enforce HTTP if we're connecting to a local IP
        // This avoids HTTPS to HTTP mixed content blocking
        if (window.location.protocol === 'https:' && 
            proxyUrl.startsWith('http:') && 
            (proxyUrl.includes('192.168.') || 
             proxyUrl.includes('127.0.0.1') || 
             proxyUrl.includes('localhost'))) {
          console.log('Adjusting proxy URL protocol to match page protocol (HTTPS)');
          proxyUrl = proxyUrl.replace('http:', 'https:');
        }
        
        // Add mountpoint and parameters
        proxyUrl = `${proxyUrl}/${this.config.mountpoint}`;
        const params = new URLSearchParams({
          host: this.config.casterHost,
          port: this.config.casterPort.toString()
        });
        
        if (this.config.username && this.config.password) {
          params.append('user', this.config.username);
          params.append('password', this.config.password);
        }
        
        proxyUrl += `?${params.toString()}`;
        
        // Create abort controller for clean disconnection
        this.abortController = new AbortController();
        
        // Make the request to the proxy
        const response = await fetch(proxyUrl, {
          method: 'GET',
          signal: this.abortController.signal
        });
        
        // Check if connection was successful
        if (!response.ok) {
          throw new Error(`Proxy server error: ${response.status} ${response.statusText}`);
        }
        
        // Start reading from the response stream
        this.reader = response.body.getReader();
        this.isConnected = true;
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        
        // Emit connected event
        this.eventEmitter.emit('ntrip:connected', {
          casterHost: this.config.casterHost,
          mountpoint: this.config.mountpoint,
          mode: 'proxy'
        });
        
        // If we have a GGA message, start sending it periodically via proxy
        if (this.config.sendGga && (this.lastGga || this.lastPosition)) {
          this.startGgaUpdates();
        }
        
        // Start processing the stream
        this.readStream();
        
        return true;
      } catch (error) {
        console.error('Proxy connection error:', error);
        throw error;
      }
    }

    /**
     * Read and process the response stream from the NTRIP caster (for direct/proxy mode)
     */
    async readStream() {
      try {
        // Loop until disconnected or error occurs
        while (this.isConnected) {
          const { value, done } = await this.reader.read();
          
          // If stream is closed, exit the loop
          if (done) {
            this.handleDisconnect({ reason: 'Stream closed' });
            break;
          }
          
          // Process the chunk of binary data
          if (value) {
            // Update stats
            this.rtcmStats.messagesReceived++;
            this.rtcmStats.lastMessageTime = new Date();
            this.rtcmStats.bytesReceived += value.length;
            
            // Convert to ArrayBuffer and emit correction event
            this.eventEmitter.emit('ntrip:rtcm', {
              data: value.buffer,
              stats: { ...this.rtcmStats }
            });
            
            // Forward to device if available
            this.forwardRtcmToDevice(value.buffer);
          }
        }
      } catch (error) {
        // Only emit error if it's not an abort error (which happens during normal disconnect)
        if (error.name !== 'AbortError') {
          this.eventEmitter.emit('ntrip:error', {
            message: 'Error reading NTRIP stream',
            error
          });
        }
        this.handleDisconnect({ reason: error.message });
      }
    }

    /**
     * Handle WebSocket message (for WebSocket mode)
     * @param {MessageEvent} event - WebSocket message event
     */
    handleSocketMessage(event) {
      try {
        // Try to parse as JSON first (for control messages)
        const data = JSON.parse(event.data);
        
        // Handle status messages
        if (data.type === 'status') {
          if (!data.connected && this.isConnected) {
            this.handleDisconnect({ reason: data.message || 'Connection closed by server' });
          }
          return;
        }
        
        // Handle error messages
        if (data.type === 'error') {
          this.eventEmitter.emit('ntrip:error', {
            message: data.message || 'Unknown error'
          });
          return;
        }
        
        // Handle info messages
        if (data.type === 'info') {
          this.eventEmitter.emit('ntrip:info', {
            message: data.message
          });
          return;
        }
        
        // Handle ping messages (keep alive)
        if (data.type === 'ping') {
          // Just acknowledge the ping silently, no need to log or emit an event
          // Optionally could respond with a pong message if the server expects it
          return;
        }
        
        // Unknown JSON message
        console.warn('Unknown NTRIP message type:', data.type);
      } catch (e) {
        // Not JSON, treat as binary RTCM data
        this.handleRtcmData(event.data);
      }
    }
    
    /**
     * Handle WebSocket close event
     * @param {CloseEvent} event - WebSocket close event
     */
    handleSocketClose(event) {
      console.log(`WebSocket closed: ${event.code} - ${event.reason}`);
      this.handleDisconnect({
        reason: `WebSocket closed: ${event.code} - ${event.reason}`
      });
    }
    
    /**
     * Handle WebSocket error event
     * @param {Event} event - WebSocket error event
     */
    handleSocketError(event) {
      console.error('WebSocket error:', event);
      this.eventEmitter.emit('ntrip:error', {
        message: 'WebSocket error',
        error: event
      });
    }
    
    /**
     * Handle binary RTCM data from WebSocket
     * @param {ArrayBuffer|Blob} data - RTCM data
     */
    async handleRtcmData(data) {
      try {
        // Convert data to ArrayBuffer if it's a Blob
        let binaryData;
        if (data instanceof Blob) {
          binaryData = await data.arrayBuffer();
        } else if (data instanceof ArrayBuffer) {
          binaryData = data;
        } else {
          console.warn('Received RTCM data in unknown format:', typeof data);
          return;
        }
        
        // Verify if data is really RTCM3 format (should start with 0xD3 preamble)
        const isRtcm = this.isValidRtcmData(binaryData);
        
        // Update stats
        this.rtcmStats.messagesReceived++;
        this.rtcmStats.lastMessageTime = new Date();
        this.rtcmStats.bytesReceived += binaryData.byteLength;
        this.updateCorrectionAge();
        
        // If it's not valid RTCM, check if it might be a sourcetable
        if (!isRtcm) {
          try {
            const textDecoder = new TextDecoder();
            const dataString = textDecoder.decode(binaryData);
            
            // Check if it looks like a sourcetable response
            if (dataString.includes('SOURCETABLE') || dataString.includes('STR;')) {
              // Likely we received a sourcetable instead of RTCM data
              // This often happens when the caster is waiting for a GGA position
              this.eventEmitter.emit('ntrip:info', { 
                message: 'Received sourcetable from NTRIP caster. The mountpoint requires GGA position data.'
              });
              
              // Try to send GGA data immediately
              if (this.config.sendGga && (this.lastGga || this.lastPosition)) {
                if (this.lastGga) {
                  this.sendGGA(this.lastGga);
                } else if (this.lastPosition) {
                  const gga = this.createGgaSentence(this.lastPosition);
                  this.sendGGA(gga);
                }
              }
              
              // Don't forward sourcetable data to the device
              return;
            }
          } catch (err) {
            // Ignore errors in text decoding, it might still be binary data
            // just not valid RTCM3
          }
        }
        
        // Emit RTCM data event regardless of validation
        this.eventEmitter.emit('ntrip:rtcm', {
          data: binaryData,
          isValidRtcm: isRtcm,
          stats: { ...this.rtcmStats }
        });
        
        // Only forward valid RTCM data to the device
        if (isRtcm) {
          this.forwardRtcmToDevice(binaryData);
        }
      } catch (error) {
        console.error('Error handling RTCM data:', error);
      }
    }
    
    /**
     * Validate if the data is in RTCM3 format
     * @param {ArrayBuffer} data - Binary data to validate
     * @returns {boolean} Whether the data appears to be valid RTCM3
     */
    isValidRtcmData(data) {
      if (!data || data.byteLength === 0) {
        return false;
      }
      
      try {
        // RTCM3 messages must start with 0xD3 preamble
        const dataView = new DataView(data);
        const firstByte = dataView.getUint8(0);
        
        if (firstByte !== 0xD3) {
          // Data doesn't start with 0xD3, likely not valid RTCM3
          // Log first few bytes for debugging
          if (this.debug?.errors || this.debug?.rtcmMessages) {
            const bytes = new Uint8Array(data.slice(0, Math.min(10, data.byteLength)));
            console.error('Invalid RTCM data - missing preamble 0xD3, instead got:', 
              Array.from(bytes).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
          }
          return false;
        }
        
        // Optionally decode more of the RTCM3 header for validation
        if (data.byteLength >= 3) {
          // Extract message length from RTCM3 header
          const msgLength = ((dataView.getUint8(1) & 0x03) << 8) + dataView.getUint8(2);
          
          // Basic length validation (should at least be 6 bytes for header + CRC)
          if (msgLength < 3 || msgLength > 1023) {
            if (this.debug?.errors) {
              console.error(`RTCM3 message has invalid length: ${msgLength}`);
            }
            return false;
          }
          
          // If we have enough data, extract the message type
          if (data.byteLength >= 6) {
            const msgType = ((dataView.getUint8(3) & 0xFF) << 4) + ((dataView.getUint8(4) & 0xF0) >> 4);
            
            // Track message type in stats
            if (!this.rtcmStats.messageTypes) {
              this.rtcmStats.messageTypes = {};
            }
            
            const typeStr = msgType.toString();
            this.rtcmStats.messageTypes[typeStr] = (this.rtcmStats.messageTypes[typeStr] || 0) + 1;
            
            if (this.debug?.rtcmMessages) {
              console.log(`RTCM3 message type: ${msgType}, length: ${msgLength}`);
            }
          }
        }
        
        return true;
      } catch (error) {
        console.error('Error validating RTCM data:', error);
        return false;
      }
    }
    
    /**
     * Forward RTCM data to connected device
     * @param {ArrayBuffer} data - RTCM binary data to forward
     */
    forwardRtcmToDevice(data) {
      try {
        // Check if we have a deviceManager property set by the GNSS module
        if ((this.deviceManager && this.deviceManager.isDeviceConnected()) || 
            (this.bluetoothManager && this.bluetoothManager.isConnected)) {
          
          // Verify RTCM data format - RTCM3 messages should start with 0xD3 preamble
          const dataView = new DataView(data);
          const firstByte = dataView.getUint8(0);
          
          // Check for the RTCM3 preamble (0xD3)
          if (firstByte === 0xD3) {
            if (this.debug?.debug || this.debug?.rtcmMessages) {
              const msgLength = ((dataView.getUint8(1) & 0x03) << 8) + dataView.getUint8(2);
              const msgType = ((dataView.getUint8(3) & 0xFF) << 4) + ((dataView.getUint8(4) & 0xF0) >> 4);
              
              console.log(`Forwarding RTCM message type ${msgType}, length ${msgLength} (${data.byteLength} bytes) to device`);
              
              // Log the first 10 bytes for debugging (hex format)
              if (this.debug?.debug) {
                const bytes = new Uint8Array(data.slice(0, Math.min(10, data.byteLength)));
                console.log('RTCM header bytes:', Array.from(bytes).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
              }
            }
            
            // Send the intact binary data to the device - CRITICAL: do not modify the data
            // Use ConnectionManager if available, fall back to BluetoothManager for backward compatibility
            if (this.deviceManager && this.deviceManager.isDeviceConnected()) {
              this.deviceManager.sendData(data);
              return true;
            } else if (this.bluetoothManager && this.bluetoothManager.isConnected) {
              this.bluetoothManager.sendData(data);
              return true;
            }
          } else {
            if (this.debug?.errors) {
              console.error(`Invalid RTCM data - missing preamble 0xD3, instead got 0x${firstByte.toString(16)}`);
              
              // Log the first 10 bytes for debugging (hex format)
              const bytes = new Uint8Array(data.slice(0, Math.min(10, data.byteLength)));
              console.error('Invalid RTCM bytes:', Array.from(bytes).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '));
            }
            return false;
          }
        } else if (this.debug?.debug) {
          console.log('No device connected, cannot forward RTCM data');
        }
        return false;
      } catch (error) {
        console.error('Error forwarding RTCM data to device:', error);
        return false;
      }
    }

    /**
     * Disconnect from NTRIP caster
     */
    disconnect() {
      if (!this.isConnected && !this.isConnecting) {
        return;
      }
      
      try {
        // Stop GGA updates
        this.stopGgaUpdates();
        
        // WebSocket mode
        if (this.activeMode === 'websocket' && this.webSocket) {
          // Send disconnect command to proxy
          if (this.webSocket.readyState === WebSocket.OPEN) {
            this.webSocket.send(JSON.stringify({
              command: 'disconnect'
            }));
          }
          
          // Close WebSocket
          this.webSocket.close();
          this.webSocket = null;
        }
        // Direct or proxy mode
        else if (this.abortController) {
          this.abortController.abort();
          this.abortController = null;
          this.reader = null;
        }
        
        this.handleDisconnect({ reason: 'User disconnected' });
      } catch (error) {
        console.error('Error during disconnect:', error);
        this.isConnected = false;
        this.isConnecting = false;
      }
    }

    /**
     * Handle disconnection (either manual or due to error)
     * @param {Object} event - Disconnection event info
     */
    handleDisconnect(event) {
      const wasConnected = this.isConnected;
      this.isConnected = false;
      this.isConnecting = false;
      
      // Reset connection resources
      this.webSocket = null;
      this.reader = null;
      this.abortController = null;
      
      // Stop GGA updates
      this.stopGgaUpdates();
      
      if (wasConnected) {
        this.eventEmitter.emit('ntrip:disconnected', {
          reason: event.reason || 'Unknown reason'
        });
      }
      
      // Attempt reconnection if enabled
      if (this.autoReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.scheduleReconnect();
      }
    }

    /**
     * Schedule a reconnection attempt
     */
    scheduleReconnect() {
      // Exponential backoff with jitter
      const delay = Math.min(30000, this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts)) 
        * (0.9 + Math.random() * 0.2); // Add 10% jitter
        
      console.log(`Scheduling reconnection attempt in ${Math.round(delay / 1000)} seconds`);
      
      setTimeout(() => {
        if (!this.isConnected && !this.isConnecting) {
          console.log(`Attempting to reconnect (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);
          this.reconnectAttempts++;
          this.connect(this.config);
        }
      }, delay);
    }

    /**
     * Process the queue of RTCM messages
     */
    async processRtcmQueue() {
      while (this.rtcmQueue.length > 0) {
        try {
          const rtcmData = this.rtcmQueue[0];
          
          // Send to device
          if (this.deviceManager.isDeviceConnected()) {
            const result = await this.deviceManager.sendData(rtcmData);
            
            if (result) {
              this.rtcmStats.bytesSent += rtcmData.byteLength;
            } else {
              console.warn('Failed to send RTCM to device');
            }
          }
          
          // Remove from queue regardless of success
          // This prevents getting stuck on a problematic message
          this.rtcmQueue.shift();
          
          // Small delay between messages to avoid overwhelming the device
          await new Promise(resolve => setTimeout(resolve, 50));
        } catch (error) {
          console.error('Error processing RTCM queue:', error);
          
          // Remove problematic message from queue
          this.rtcmQueue.shift();
          
          // Longer delay after error
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }
    }

    /**
     * Start periodically sending GGA updates to the NTRIP caster
     */
    startGgaUpdates() {
      // Stop existing interval if any
      this.stopGgaUpdates();
      
      // Send initial update immediately - this is critical for NTRIP casters
      // that require GGA before sending RTCM data
      let initialGgaSent = false;
      
      if (this.isConnected) {
        if (this.lastGga) {
          initialGgaSent = this.sendGGA(this.lastGga);
        } else if (this.lastPosition) {
          const gga = this.createGgaSentence(this.lastPosition);
          initialGgaSent = this.sendGGA(gga);
        } else {
          // If we don't have a position, generate a default one
          // This is necessary because many casters require a GGA
          // to start streaming data, even if it's not accurate
          try {
            // Create a default position close to the equator (to be in range of most casters)
            const defaultPosition = {
              latitude: 0.1,
              longitude: 0.1,
              quality: 1,
              satellites: 8,
              hdop: 1.0
            };
            
            const gga = this.createGgaSentence(defaultPosition);
            initialGgaSent = this.sendGGA(gga);
            
            // Log that we're using a fallback position
            console.warn('No position available, sending default GGA position to NTRIP caster');
            this.eventEmitter.emit('ntrip:info', { 
              message: 'Using default position for NTRIP. Corrections may not be optimal.'
            });
          } catch (error) {
            console.error('Failed to send default GGA position:', error);
          }
        }
      }
      
      // Start regular interval for updates
      this.ggaInterval = setInterval(() => {
        if (this.isConnected) {
          if (this.lastGga) {
            this.sendGGA(this.lastGga);
          } else if (this.lastPosition) {
            const gga = this.createGgaSentence(this.lastPosition);
            this.sendGGA(gga);
          }
        }
      }, this.config.ggaUpdateInterval * 1000);
      
      // If we didn't send the initial GGA and the caster might be waiting,
      // try sending GGA messages with progressively shorter intervals initially
      if (this.isConnected && !initialGgaSent) {
        // Try again after 1 second
        setTimeout(() => {
          if (this.isConnected && (this.lastGga || this.lastPosition)) {
            const gga = this.lastGga || this.createGgaSentence(this.lastPosition);
            this.sendGGA(gga);
          }
        }, 1000);
        
        // And again after 3 seconds
        setTimeout(() => {
          if (this.isConnected && (this.lastGga || this.lastPosition)) {
            const gga = this.lastGga || this.createGgaSentence(this.lastPosition);
            this.sendGGA(gga);
          }
        }, 3000);
      }
    }

    /**
     * Stop sending GGA updates
     */
    stopGgaUpdates() {
      if (this.ggaInterval) {
        clearInterval(this.ggaInterval);
        this.ggaInterval = null;
      }
    }

    /**
     * Set the GGA update interval
     * @param {number} seconds - Update interval in seconds
     */
    setGgaUpdateInterval(seconds) {
      // Validate input
      const interval = parseInt(seconds);
      if (isNaN(interval) || interval <= 0) {
        console.warn('Invalid GGA update interval, using default:', this.config.ggaUpdateInterval);
        return;
      }
      
      // Update config
      this.config.ggaUpdateInterval = interval;
      console.log(`NTRIP GGA update interval set to ${interval} seconds`);
      
      // Restart interval if already running
      if (this.ggaInterval) {
        this.startGgaUpdates(); // This will stop and restart with new interval
      }
    }

    /**
     * Update the device with the latest position
     * @param {Object} position - Position data
     */
    updatePosition(position) {
      this.lastPosition = position;
      
      // If GGA updates are enabled and we're connected, create and send GGA
      if (this.config.sendGga && this.isConnected && !this.lastGga) {
        const gga = this.createGgaSentence(position);
        this.sendGGA(gga);
      }
    }

    /**
     * Send NMEA GGA sentence to NTRIP caster
     * @param {string} gga - NMEA GGA sentence
     * @returns {Promise<boolean>} Whether message was sent successfully
     */
    async sendGGA(gga) {
      if (!this.isConnected) {
        return false;
      }
      
      try {
        // Store the GGA for periodic updates
        this.lastGga = gga;
        
        // Choose method based on active mode
        if (this.activeMode === 'websocket') {
          return this.sendGGAWebSocket(gga);
        } else if (this.activeMode === 'direct') {
          return this.sendGGADirect(gga);
        } else if (this.activeMode === 'proxy') {
          return this.sendGGAProxy(gga);
        }
        
        return false;
      } catch (error) {
        console.error('Error sending GGA:', error);
        return false;
      }
    }
    
    /**
     * Send GGA via WebSocket
     * @param {string} gga - NMEA GGA sentence
     * @returns {Promise<boolean>} Whether message was sent successfully
     */
    async sendGGAWebSocket(gga) {
      if (!this.webSocket || this.webSocket.readyState !== WebSocket.OPEN) {
        return false;
      }
      
      try {
        this.webSocket.send(JSON.stringify({
          command: 'gga',
          data: gga
        }));
        
        return true;
      } catch (error) {
        console.error('Error sending GGA via WebSocket:', error);
        return false;
      }
    }
    
    /**
     * Send GGA directly to NTRIP caster
     * @param {string} gga - NMEA GGA sentence
     * @returns {Promise<boolean>} Whether message was sent successfully
     */
    async sendGGADirect(gga) {
      try {
        // Create POST request URL
        const protocol = this.config.casterPort === 443 ? 'https' : 'http';
        const url = `${protocol}://${this.config.casterHost}:${this.config.casterPort}/${this.config.mountpoint}`;
        
        // Create headers with authentication if needed
        const headers = new Headers({
          'Content-Type': 'text/plain',
          'User-Agent': 'NTRIP WebGNSS Client'
        });
        
        if (this.config.username && this.config.password) {
          const auth = btoa(`${this.config.username}:${this.config.password}`);
          headers.append('Authorization', `Basic ${auth}`);
        }
        
        // Send request - don't await the response as it's fire-and-forget
        fetch(url, {
          method: 'POST',
          headers,
          body: gga
        }).catch(error => {
          console.warn('Error sending GGA directly:', error);
        });
        
        return true;
      } catch (error) {
        console.error('Error sending GGA directly:', error);
        return false;
      }
    }
    
    /**
     * Send GGA via proxy
     * @param {string} gga - NMEA GGA sentence
     * @returns {Promise<boolean>} Whether message was sent successfully
     */
    async sendGGAProxy(gga) {
      try {
        // Determine proxy URL
        let proxyUrl = this.config.proxyUrl;
        
        // If it's a relative URL, make it absolute
        if (proxyUrl.startsWith('/')) {
          const protocol = window.location.protocol;
          proxyUrl = `${protocol}//${window.location.host}${proxyUrl}`;
        }
        
        // Add GGA endpoint
        proxyUrl = `${proxyUrl}/${this.config.mountpoint}/gga`;
        
        // Add parameters
        const params = new URLSearchParams({
          host: this.config.casterHost,
          port: this.config.casterPort.toString()
        });
        
        if (this.config.username && this.config.password) {
          params.append('user', this.config.username);
          params.append('password', this.config.password);
        }
        
        proxyUrl += `?${params.toString()}`;
        
        // Send request - don't await the response as it's fire-and-forget
        fetch(proxyUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain'
          },
          body: gga
        }).catch(error => {
          console.warn('Error sending GGA via proxy:', error);
        });
        
        return true;
      } catch (error) {
        console.error('Error sending GGA via proxy:', error);
        return false;
      }
    }

    /**
     * Create NMEA GGA sentence from position data
     * @param {Object} position - Position data
     * @returns {string} GGA sentence
     */
    createGgaSentence(position) {
      try {
        // Validate position
        if (!position || typeof position.latitude !== 'number' || typeof position.longitude !== 'number') {
          throw new Error('Invalid position data');
        }
        
        // Get time in UTC
        const now = new Date();
        const hours = now.getUTCHours().toString().padStart(2, '0');
        const minutes = now.getUTCMinutes().toString().padStart(2, '0');
        const seconds = now.getUTCSeconds().toString().padStart(2, '0');
        const milliseconds = now.getUTCMilliseconds().toString().padStart(3, '0');
        const timeStr = `${hours}${minutes}${seconds}.${milliseconds}`;
        
        // Format latitude - IMPORTANT: This must follow NMEA spec exactly
        // Format: DDMM.MMMMM (degrees and decimal minutes)
        const latDeg = Math.floor(Math.abs(position.latitude));
        const latMin = (Math.abs(position.latitude) - latDeg) * 60;
        const latStr = `${latDeg.toString().padStart(2, '0')}${latMin.toFixed(7)}`;
        const latDir = position.latitude >= 0 ? 'N' : 'S';
        
        // Format longitude - IMPORTANT: This must follow NMEA spec exactly
        // Format: DDDMM.MMMMM (degrees and decimal minutes)
        const lonDeg = Math.floor(Math.abs(position.longitude));
        const lonMin = (Math.abs(position.longitude) - lonDeg) * 60;
        const lonStr = `${lonDeg.toString().padStart(3, '0')}${lonMin.toFixed(7)}`;
        const lonDir = position.longitude >= 0 ? 'E' : 'W';
        
        // Quality indicator
        // 0 = No fix, 1 = GPS fix, 2 = DGPS, 4 = RTK fixed, 5 = RTK float
        const quality = position.quality || 1;
        
        // Number of satellites
        const satellites = position.satellites || 8; // Default to 8 satellites to indicate strong signal
        
        // HDOP
        const hdop = position.hdop || 1.0;
        
        // Altitude
        const altitude = position.altitude || 0.0;
        
        // Geoid separation (set to 0 if not available)
        const geoidSep = position.geoidSeparation || 0.0;
        
        // Age of differential corrections (set to empty if not available)
        const diffAge = position.diffAge || '';
        
        // Differential reference station ID (empty if not available)
        const diffStationId = position.diffStationId || '';
        
        // Construct GGA sentence
        const ggaFields = [
          'GPGGA',         // Message ID
          timeStr,         // UTC Time
          latStr,          // Latitude
          latDir,          // N/S indicator
          lonStr,          // Longitude
          lonDir,          // E/W indicator
          quality,         // Quality indicator
          satellites,      // Number of satellites
          hdop.toFixed(1), // HDOP
          altitude.toFixed(1), // Altitude
          'M',             // Altitude units (meters)
          geoidSep.toFixed(1), // Geoid separation
          'M',             // Geoid separation units (meters)
          diffAge,         // Age of differential corrections
          diffStationId    // Differential reference station ID
        ];
        
        // Join fields with commas
        const sentence = '$' + ggaFields.join(',');
        
        // Calculate checksum
        let checksum = 0;
        for (let i = 1; i < sentence.length; i++) {
          checksum ^= sentence.charCodeAt(i);
        }
        
        // Format checksum as 2-digit hex
        const checksumHex = checksum.toString(16).toUpperCase().padStart(2, '0');
        
        // Add checksum and line ending
        const fullSentence = `${sentence}*${checksumHex}\r\n`;
        
        // Validate the created sentence
        if (this.isValidGga(fullSentence)) {
          return fullSentence;
        } else {
          throw new Error('Generated GGA sentence failed validation');
        }
      } catch (error) {
        console.error('Error creating GGA sentence:', error);
        
        // Return a minimal valid GGA sentence with 0,0 coordinates
        // This is a fallback that uses a pre-computed valid GGA with checksum
        return '$GPGGA,000000.000,0000.0000,N,00000.0000,E,1,08,1.0,0.0,M,0.0,M,,*67\r\n';
      }
    }
    
    /**
     * Validate if a GGA sentence is properly formatted
     * @param {string} sentence - GGA sentence to validate
     * @returns {boolean} Whether the sentence is valid
     */
    isValidGga(sentence) {
      // Basic format check
      if (!sentence || typeof sentence !== 'string') {
        return false;
      }
      
      // Must start with $GPGGA or $GNGGA
      if (!sentence.startsWith('$GPGGA') && !sentence.startsWith('$GNGGA')) {
        return false;
      }
      
      // Must have enough fields (minimum 14 comma-separated values)
      const parts = sentence.split(',');
      if (parts.length < 14) {
        return false;
      }
      
      // Must have lat/long data
      if (!parts[2] || !parts[4]) {
        return false;
      }
      
      // Verify checksum if present
      if (sentence.includes('*')) {
        try {
          const checksumIndex = sentence.indexOf('*');
          const providedChecksum = parseInt(sentence.substring(checksumIndex + 1), 16);
          
          // Calculate checksum
          let calculatedChecksum = 0;
          for (let i = 1; i < checksumIndex; i++) {
            calculatedChecksum ^= sentence.charCodeAt(i);
          }
          
          if (providedChecksum !== calculatedChecksum) {
            console.error(`GGA checksum mismatch: provided ${providedChecksum}, calculated ${calculatedChecksum}`);
            return false;
          }
        } catch (e) {
          console.error('Error validating GGA checksum:', e);
          return false;
        }
      }
      
      return true;
    }

    /**
     * Update correction age based on last message time
     */
    updateCorrectionAge() {
      if (this.rtcmStats.lastMessageTime) {
        const now = new Date();
        this.rtcmStats.correctionAge = (now - this.rtcmStats.lastMessageTime) / 1000;
      }
    }

    /**
     * Get RTCM statistics
     * @returns {Object} RTCM statistics
     */
    getRtcmStats() {
      // Update correction age
      this.updateCorrectionAge();
      
      return {
        ...this.rtcmStats,
        connected: this.isConnected,
        mode: this.activeMode,
        reconnectAttempts: this.reconnectAttempts
      };
    }

    /**
     * Reset RTCM statistics
     */
    resetRtcmStats() {
      this.rtcmStats = {
        messagesReceived: 0,
        bytesSent: 0,
        bytesReceived: 0,
        lastMessageTime: null,
        correctionAge: null
      };
    }

    /**
     * Enable/disable auto-reconnect
     * @param {boolean} enabled - Whether auto-reconnect is enabled
     * @param {number} maxAttempts - Maximum reconnection attempts
     */
    setAutoReconnect(enabled, maxAttempts = 5) {
      this.autoReconnect = enabled;
      this.maxReconnectAttempts = maxAttempts;
    }
    
    /**
     * Get connection status information
     * @returns {Object} Connection status
     */
    getConnectionInfo() {
      this.updateCorrectionAge();
      
      return {
        connected: this.isConnected,
        connecting: this.isConnecting,
        casterHost: this.config.casterHost,
        mountpoint: this.config.mountpoint,
        mode: this.activeMode,
        rtcmStats: { ...this.rtcmStats },
        reconnectAttempts: this.reconnectAttempts,
        autoReconnect: this.autoReconnect
      };
    }
  }

  /**
   * Constants - Centralized constants for the GNSS.js library
   * 
   * This module contains all shared constants used throughout the library,
   * eliminating duplication and providing a single source of truth.
   */

  /**
   * Bluetooth LE Service UUIDs
   */
  const BLE_SERVICES = {
    // Nordic UART Service (most common in BLE devices)
    NORDIC_UART: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    
    // Alternative UART Service form
    UART_ALTERNATIVE: '0000ffe0-0000-1000-8000-00805f9b34fb',
    
    // HM-10/HM-16/HM-17 BLE Module Service
    HM_MODULE: '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    
    // HC-08/HC-10 BLE Service
    HC_MODULE: '0000fff0-0000-1000-8000-00805f9b34fb',
    
    // Generic BLE services
    GENERIC_ATTRIBUTE: '00001801-0000-1000-8000-00805f9b34fb',
    GENERIC_ACCESS: '00001800-0000-1000-8000-00805f9b34fb',
    
    // SparkFun RTK-specific custom service
    SPARKFUN_CUSTOM: '0000fe9a-0000-1000-8000-00805f9b34fb',
    
    // Classic Bluetooth SPP (Serial Port Profile)
    SPP: '00001101-0000-1000-8000-00805f9b34fb',
    
    // Testing/fallback services
    HEART_RATE: '0000180d-0000-1000-8000-00805f9b34fb',
    DEVICE_INFO: '0000180a-0000-1000-8000-00805f9b34fb'
  };

  /**
   * Bluetooth LE Characteristic UUIDs
   * Note: TX/RX naming is from the device's perspective
   * - TX: Device → Client (we receive from device)
   * - RX: Client → Device (we send to device)
   */
  const BLE_CHARACTERISTICS = {
    // Nordic UART characteristics
    NORDIC_TX: '6e400002-b5a3-f393-e0a9-e50e24dcca9e', // Device transmits to us (we receive)
    NORDIC_RX: '6e400003-b5a3-f393-e0a9-e50e24dcca9e', // Device receives from us (we transmit)
    
    // Common alternative BLE characteristic UUIDs for transmission (device → client)
    UART_TX: '0000ffe1-0000-1000-8000-00805f9b34fb',
    HC_TX: '0000fff1-0000-1000-8000-00805f9b34fb',
    HM10_TX: '49535343-8841-43f4-a8d4-ecbe34729bb3',
    SPARKFUN_TX: '0000fe9a-0002-1000-8000-00805f9b34fb',
    
    // Common alternative BLE characteristic UUIDs for reception (client → device)
    UART_RX: '0000ffe2-0000-1000-8000-00805f9b34fb',
    HC_RX: '0000fff2-0000-1000-8000-00805f9b34fb',
    HM10_RX: '49535343-1e4d-4bd9-ba61-23c647249616',
    SPARKFUN_RX: '0000fe9a-0003-1000-8000-00805f9b34fb',
    
    // Classic Bluetooth SPP characteristics
    SPP_TX: '00001103-0000-1000-8000-00805f9b34fb',
    SPP_RX: '00001102-0000-1000-8000-00805f9b34fb'
  };

  /**
   * Event Types
   * Standardized event names used throughout the library
   */
  const EVENTS = {
    // Connection events
    CONNECTING: 'device:connecting',
    CONNECTED: 'device:connected',
    DISCONNECTED: 'device:disconnected',
    CONNECTION_ERROR: 'device:connection:error',
    
    // Data events
    DATA_RECEIVED: 'device:data',
    DATA_SENT: 'device:data:sent',
    
    // NMEA parsing events
    NMEA_SENTENCE: 'nmea:sentence',
    POSITION_UPDATE: 'position:update',
    SATELLITES_UPDATE: 'satellites:update',
    
    // Public API events (forwarded versions of internal events)
    POSITION: 'position',
    SATELLITES: 'satellites',
    
    // NTRIP events
    NTRIP_CONNECTING: 'ntrip:connecting',
    NTRIP_CONNECTED: 'ntrip:connected',
    NTRIP_DISCONNECTED: 'ntrip:disconnected',
    NTRIP_ERROR: 'ntrip:error',
    NTRIP_DATA: 'ntrip:rtcm',
    
    // Settings and configuration events
    SETTINGS_CHANGED: 'settings:changed',
    DEVICE_CONFIGURING: 'device:configuring',
    DEVICE_CONFIGURED: 'device:configured'
  };

  /**
   * Default connection settings
   */
  const DEFAULT_CONNECTION_SETTINGS = {
    preferredMethod: 'auto',
    connectionTimeout: 10000, // 10 seconds
    
    // Bluetooth-specific defaults
    bluetooth: {
      preferBLE: true, // Prefer BLE over classic Bluetooth
    },
    
    // Serial-specific defaults
    serial: {
      baudRate: 9600,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none'
    }
  };

  /**
   * Default NTRIP settings
   */
  const DEFAULT_NTRIP_SETTINGS = {
    port: 2101,
    autoConnect: false,
    useProxy: false,
    autoDetectCors: true,
    ggaUpdateInterval: 10, // seconds
    autoSendGga: true
  };

  /**
   * Settings - Manages and persists module settings
   */

  class Settings {
    constructor() {
      this.dbName = 'gnss-module-db';
      this.storeName = 'settings';
      this.db = null;
      this.settings = {
        // Connection settings
        connection: {
          preferredMethod: DEFAULT_CONNECTION_SETTINGS.preferredMethod,
          lastMethod: null,
          autoConnect: false,
          connectionTimeout: DEFAULT_CONNECTION_SETTINGS.connectionTimeout,
          
          // Method-specific settings
          bluetooth: {
            lastDeviceId: null,
            preferBLE: DEFAULT_CONNECTION_SETTINGS.bluetooth.preferBLE,
            filters: []
          },
          serial: {
            baudRate: DEFAULT_CONNECTION_SETTINGS.serial.baudRate,
            dataBits: DEFAULT_CONNECTION_SETTINGS.serial.dataBits,
            stopBits: DEFAULT_CONNECTION_SETTINGS.serial.stopBits,
            parity: DEFAULT_CONNECTION_SETTINGS.serial.parity,
            flowControl: DEFAULT_CONNECTION_SETTINGS.serial.flowControl,
            lastPort: null
          }
        },
        
        // NTRIP settings
        ntrip: {
          host: '',
          port: DEFAULT_NTRIP_SETTINGS.port,
          mountpoint: '',
          username: '',
          password: '',
          autoConnect: DEFAULT_NTRIP_SETTINGS.autoConnect,
          proxyUrl: 'http://localhost:3000',
          useProxy: DEFAULT_NTRIP_SETTINGS.useProxy,
          autoDetectCors: DEFAULT_NTRIP_SETTINGS.autoDetectCors,
          ggaUpdateInterval: DEFAULT_NTRIP_SETTINGS.ggaUpdateInterval,
          autoSendGga: DEFAULT_NTRIP_SETTINGS.autoSendGga,
        },
        
        // UI settings
        ui: {
          showDebugInfo: false,
          unitSystem: 'metric', // or 'imperial'
          coordinateFormat: 'dd', // decimal degrees, 'dms', or 'utm'
        },
        
        // Rover settings
        rover: {
          messageRate: 4, // Hz
          dynamicModel: 'pedestrian', // automotive, pedestrian, etc.
          altitudeOffset: 0, // meters for altitude correction when using pole or tripod
          antennaOffset: 0, // meters for antenna offset (this is specific to the device used)
        }
      };
      
      // Initialize the database
      this.initDb();
    }

    /**
     * Initialize IndexedDB
     */
    async initDb() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(this.dbName, 1);
        
        request.onerror = (event) => {
          console.error('IndexedDB error:', event);
          reject(event);
        };
        
        request.onsuccess = (event) => {
          this.db = event.target.result;
          this.loadSettings().then(resolve);
        };
        
        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          if (!db.objectStoreNames.contains(this.storeName)) {
            db.createObjectStore(this.storeName, { keyPath: 'id' });
          }
        };
      });
    }

    /**
     * Load settings from IndexedDB
     */
    async loadSettings() {
      if (!this.db) {
        return;
      }
      
      return new Promise((resolve) => {
        const transaction = this.db.transaction(this.storeName, 'readonly');
        const store = transaction.objectStore(this.storeName);
        const request = store.get('user-settings');
        
        request.onsuccess = (event) => {
          if (event.target.result) {
            // Merge with defaults for any new settings
            const savedSettings = event.target.result.value;
            
            // Deep merge the settings
            this.deepMerge(this.settings, savedSettings);
          }
          resolve();
        };
        
        request.onerror = () => {
          resolve(); // Use defaults if error
        };
      });
    }

    /**
     * Deep merge objects (helper function)
     * @param {Object} target - Target object
     * @param {Object} source - Source object
     * @returns {Object} Merged object
     */
    deepMerge(target, source) {
      for (const key in source) {
        if (source.hasOwnProperty(key)) {
          // Check if the source value is an object and not null
          if (source[key] !== null && typeof source[key] === 'object' && key in target && target[key] !== null) {
            // Initialize target[key] if it's null but source[key] is an object
            if (target[key] === null) {
              target[key] = Array.isArray(source[key]) ? [] : {};
            }
            this.deepMerge(target[key], source[key]);
          } else {
            target[key] = source[key];
          }
        }
      }
      return target;
    }

    /**
     * Save settings to IndexedDB
     */
    async saveSettings() {
      if (!this.db) {
        return;
      }
      
      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction(this.storeName, 'readwrite');
        const store = transaction.objectStore(this.storeName);
        const request = store.put({
          id: 'user-settings',
          value: this.settings
        });
        
        request.onsuccess = () => resolve();
        request.onerror = (event) => reject(event);
      });
    }

    /**
     * Get a setting value
     * @param {string} section - Settings section (connection, bluetooth, ntrip, ui, rover)
     * @param {string} key - Setting key
     * @returns {*} Setting value
     */
    get(section, key) {
      if (this.settings[section] && key in this.settings[section]) {
        return this.settings[section][key];
      }
      return null;
    }

    /**
     * Set a setting value
     * @param {string} section - Settings section
     * @param {string} key - Setting key
     * @param {*} value - Setting value
     */
    async set(section, key, value) {
      if (!this.settings[section]) {
        this.settings[section] = {};
      }
      
      this.settings[section][key] = value;
      
      await this.saveSettings();
      return value;
    }

    /**
     * Update multiple settings at once
     * @param {string} section - Settings section
     * @param {Object} values - Object with key/value pairs
     */
    async update(section, values) {
      if (!this.settings[section]) {
        this.settings[section] = {};
      }
      
      this.settings[section] = {
        ...this.settings[section],
        ...values
      };
      
      await this.saveSettings();
      return this.settings[section];
    }

    /**
     * Get all settings for a section
     * @param {string} section - Settings section
     * @returns {Object} Section settings
     */
    getSection(section) {
      return this.settings[section] || {};
    }

    /**
     * Get all settings
     * @returns {Object} All settings
     */
    getAll() {
      return this.settings;
    }

    /**
     * Clear all settings and reset to defaults
     */
    async reset() {
      this.settings = {
        connection: {
          preferredMethod: DEFAULT_CONNECTION_SETTINGS.preferredMethod,
          lastMethod: null,
          autoConnect: false,
          connectionTimeout: DEFAULT_CONNECTION_SETTINGS.connectionTimeout,
          
          bluetooth: {
            lastDeviceId: null,
            preferBLE: DEFAULT_CONNECTION_SETTINGS.bluetooth.preferBLE,
            filters: []
          },
          serial: {
            baudRate: DEFAULT_CONNECTION_SETTINGS.serial.baudRate,
            dataBits: DEFAULT_CONNECTION_SETTINGS.serial.dataBits,
            stopBits: DEFAULT_CONNECTION_SETTINGS.serial.stopBits,
            parity: DEFAULT_CONNECTION_SETTINGS.serial.parity,
            flowControl: DEFAULT_CONNECTION_SETTINGS.serial.flowControl,
            lastPort: null
          }
        },
        
        ntrip: {
          host: '',
          port: DEFAULT_NTRIP_SETTINGS.port,
          mountpoint: '',
          username: '',
          password: '',
          autoConnect: DEFAULT_NTRIP_SETTINGS.autoConnect,
          proxyUrl: 'http://localhost:3000',
          useProxy: DEFAULT_NTRIP_SETTINGS.useProxy,
          autoDetectCors: DEFAULT_NTRIP_SETTINGS.autoDetectCors,
          ggaUpdateInterval: DEFAULT_NTRIP_SETTINGS.ggaUpdateInterval,
          autoSendGga: DEFAULT_NTRIP_SETTINGS.autoSendGga,
        },
        
        ui: {
          showDebugInfo: false,
          unitSystem: 'metric',
          coordinateFormat: 'dd',
        },
        
        rover: {
          messageRate: 4,
          dynamicModel: 'pedestrian',
          altitudeOffset: 0,
          antennaOffset: 0,
        }
      };
      
      await this.saveSettings();
    }
  }

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

  /**
   * ConnectionHandler - Base class for implementing different connection methods
   */
  class ConnectionHandler {
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

  /**
   * BluetoothHandler - Implements Web Bluetooth connections
   */

  class BluetoothHandler extends ConnectionHandler {
    constructor(eventEmitter, options = {}) {
      super(eventEmitter, options);
      this.name = 'bluetooth';
      this.device = null;
      this.server = null;
      this.serialService = null;
      this.rxCharacteristic = null;
      this.txCharacteristic = null;
      this.autoReconnect = false;
      this.connectionTimeout = 10000; // 10 seconds
      this.pollingEnabled = false;
      this.pollingInterval = null;
      
      // Use the service UUIDs from the constants module
      this.SERVICE_UUIDS = [
        BLE_SERVICES.NORDIC_UART,
        BLE_SERVICES.UART_ALTERNATIVE,
        BLE_SERVICES.HM_MODULE,
        BLE_SERVICES.HC_MODULE,
        BLE_SERVICES.GENERIC_ATTRIBUTE,
        BLE_SERVICES.GENERIC_ACCESS,
        BLE_SERVICES.SPARKFUN_CUSTOM,
        BLE_SERVICES.SPP,
        BLE_SERVICES.HEART_RATE,
        BLE_SERVICES.DEVICE_INFO
      ];
      
      // Use the characteristic UUIDs from the constants module
      // Device transmit = We receive
      this.NORDIC_RX_UUID = BLE_CHARACTERISTICS.NORDIC_TX;
      // Device receive = We transmit
      this.NORDIC_TX_UUID = BLE_CHARACTERISTICS.NORDIC_RX;
      
      // Characteristics where WE TRANSMIT TO the device
      this.BLE_TX_UUIDS = [
        BLE_CHARACTERISTICS.NORDIC_RX,
        BLE_CHARACTERISTICS.UART_RX,
        BLE_CHARACTERISTICS.HC_RX,
        BLE_CHARACTERISTICS.HM10_RX,
        BLE_CHARACTERISTICS.SPARKFUN_RX
      ];
      
      // Characteristics where WE RECEIVE FROM the device
      this.BLE_RX_UUIDS = [
        BLE_CHARACTERISTICS.NORDIC_TX,
        BLE_CHARACTERISTICS.UART_TX,
        BLE_CHARACTERISTICS.HC_TX,
        BLE_CHARACTERISTICS.HM10_TX,
        BLE_CHARACTERISTICS.SPARKFUN_TX
      ];
      
      // Legacy UUIDs from constants
      this.SPP_SERVICE_UUID = BLE_SERVICES.SPP;
      this.SPP_RX_UUID = BLE_CHARACTERISTICS.SPP_RX;
      this.SPP_TX_UUID = BLE_CHARACTERISTICS.SPP_TX;
      
      // Bind methods
      this.onDisconnected = this.onDisconnected.bind(this);
    }

    /**
     * Check if Web Bluetooth API is available
     * @returns {boolean} - Whether Web Bluetooth is available
     */
    isAvailable() {
      return typeof navigator !== 'undefined' && 
             navigator.bluetooth !== undefined;
    }
    
    /**
     * Get priority level for Bluetooth connections
     * @param {Object} options - Connection options
     * @returns {number} - Priority level
     */
    getPriority(options = {}) {
      // Default priority (1-10 scale, higher = try first)
      let priority = 7; // Bluetooth is generally preferred over Serial as it's more common
      
      // Increase priority if explicitly preferred
      if (options.preferredMethod === 'bluetooth') {
        priority += 3;
      }
      
      // Increase priority if we have a last used device
      if (options.deviceId || (options.bluetooth && options.bluetooth.lastDeviceId)) {
        priority += 2;
      }
      
      // If connecting to a specific device type
      if (options.sparkfun) {
        priority += 1;
      }
      
      // Return final priority value
      return priority;
    }

    /**
     * Connect to a GNSS receiver via Bluetooth
     * @param {Object} options - Connection options
     * @returns {Promise<boolean>} Whether connection was successful
     */
    async connect(options = {}) {
      if (this.isConnected) {
        return true;
      }
      
      if (this.isConnecting) {
        return false;
      }
      
      this.isConnecting = true;
      this.eventEmitter.emit('bluetooth:connecting', {});
      
      try {
        // Browser compatibility check
        if (!navigator.bluetooth) {
          throw new Error('Web Bluetooth API is not supported in this browser');
        }
        
        // Debug logging
        console.log('BluetoothHandler.connect called with options:', JSON.stringify(options));
        
        // List all services we're requesting access to
        console.log('Available service UUIDs:', this.SERVICE_UUIDS);
        
        // Check if this is a SparkFun device connection
        if (options.sparkfun) {
          console.log('Using SparkFun device connection method');
          // Use our special SparkFun connection method
          return this.connectToSparkFunFacet(options);
        }
        
        // Request device with optional filters
        const requestOptions = {
          acceptAllDevices: !options.filters,
          filters: options.filters || [],
          optionalServices: this.SERVICE_UUIDS // Include all possible service UUIDs
        };
        
        console.log('Calling navigator.bluetooth.requestDevice with options:', JSON.stringify(requestOptions));
        
        // Check if a device object was directly passed (from GnssModule.connectBluetooth)
        if (options.deviceObj) {
          console.log('Using device object passed from GnssModule:', options.deviceObj.name || options.deviceObj.id);
          this.device = options.deviceObj;
        }
        // Try to get device ID from options or Bluetooth section (legacy path)
        else if (typeof navigator.bluetooth.getDevices === 'function') {
          const deviceId = options.deviceId || 
                          (options.bluetooth && options.bluetooth.lastDeviceId);
          
          // Allow connecting to last device
          if (deviceId) {
            try {
              this.device = await navigator.bluetooth.getDevices()
                .then(devices => devices.find(d => d.id === deviceId));
                
              if (!this.device) {
                throw new Error('Device not found');
              }
            } catch (error) {
              this.logger.debug('Failed to reconnect to known device:', error);
              // This path should not be reached with the updated flow
              throw new Error('Device selection must happen in GnssModule.connectBluetooth');
            }
          } else {
            // This path should not be reached with the updated flow
            throw new Error('Device selection must happen in GnssModule.connectBluetooth');
          }
        } else {
          // This path should not be reached with the updated flow
          throw new Error('Device selection must happen in GnssModule.connectBluetooth');
        }
        
        if (!this.device) {
          throw new Error('No device selected');
        }
        
        // Set up disconnection listener
        this.device.addEventListener('gattserverdisconnected', this.onDisconnected);
        
        // Connect to GATT server
        this.eventEmitter.emit('bluetooth:connecting', { step: 'gatt' });
        this.server = await this.device.gatt.connect();
        
        // Get a suitable UART/Serial service
        this.eventEmitter.emit('bluetooth:connecting', { step: 'service' });
        
        // First, get all services to see what's available
        const allServices = await this.server.getPrimaryServices();
        this.logger.debug('All available services:', allServices.map(s => s.uuid));
        
        if (allServices.length === 0) {
          throw new Error('No Bluetooth services found on this device');
        }
        
        // Then try to find one of our known UART services
        let foundService = null;
        let serviceUUID = '';
        
        // Try each of our known service UUIDs
        // BLE devices sometimes use shortened 16-bit UUIDs
        for (const uuid of this.SERVICE_UUIDS) {
          try {
            this.logger.debug(`Trying to connect to service: ${uuid}`);
            const service = await this.server.getPrimaryService(uuid);
            if (service) {
              foundService = service;
              serviceUUID = uuid;
              this.logger.debug(`Successfully connected to service: ${uuid}`);
              break;
            }
          } catch (e) {
            this.logger.debug(`Service ${uuid} not found on device`);
            
            // Try to convert to 16-bit UUID if it might be a standard BLE UUID
            try {
              // For standard 16-bit UUIDs, like "180d" for Heart Rate
              // Extract the 16-bit part if it's a full UUID
              if (uuid.includes('-')) {
                const shortUuid = uuid.split('-')[0].replace('0000', '');
                if (shortUuid.length === 4) {
                  this.logger.debug(`Trying 16-bit service UUID: ${shortUuid}`);
                  const service = await this.server.getPrimaryService(shortUuid);
                  if (service) {
                    foundService = service;
                    serviceUUID = shortUuid;
                    this.logger.debug(`Successfully connected to 16-bit service: ${shortUuid}`);
                    break;
                  }
                }
              }
            } catch (e2) {
              this.logger.debug(`16-bit service ID not found either`);
            }
            // Continue to next service UUID
          }
        }
        
        // If we couldn't find a known service, try to use any available service that has characteristics
        if (!foundService) {
          this.logger.warn('Could not find any known UART/Serial services');
          
          // Try each service to find one with suitable characteristics
          for (const service of allServices) {
            try {
              const characteristics = await service.getCharacteristics();
              this.logger.debug(`Service ${service.uuid} has ${characteristics.length} characteristics`);
              
              if (characteristics.length > 0) {
                foundService = service;
                serviceUUID = service.uuid;
                this.logger.debug(`Using service ${service.uuid} with ${characteristics.length} characteristics`);
                break;
              }
            } catch (e) {
              this.logger.debug(`Could not get characteristics for service ${service.uuid}`);
            }
          }
        }
        
        if (!foundService) {
          throw new Error('Could not find a suitable Bluetooth service for communication');
        }
        
        this.serialService = foundService;
        this.logger.debug(`Using service: ${serviceUUID}`);
        this.eventEmitter.emit('bluetooth:connecting', { step: 'service-found', serviceUUID });
        
        // Get characteristics
        this.eventEmitter.emit('bluetooth:connecting', { step: 'characteristics' });
        
        // Try to get TX and RX characteristics using a more flexible approach
        // First, get all characteristics from the service
        this.logger.debug('Getting characteristics from service:', this.serialService.uuid);
        let characteristics = [];
        try {
          characteristics = await this.serialService.getCharacteristics();
          this.logger.debug('All characteristics:', characteristics.map(c => ({
            uuid: c.uuid,
            properties: Object.keys(c.properties).filter(p => c.properties[p])
          })));
        } catch (error) {
          this.logger.error(`Error getting characteristics: ${error.message}`);
          this.eventEmitter.emit('bluetooth:error', {
            message: `Failed to get characteristics: ${error.message}`,
            error
          });
          throw error;
        }
        
        if (characteristics.length === 0) {
          throw new Error('No characteristics found in the selected service');
        }
        
        // Try with known BLE characteristic pairs first
        // Creating all possible combinations of TX and RX characteristics
        const knownCharacteristicPairs = [];
        
        // Nordic UART pair (most common for BLE UART)
        knownCharacteristicPairs.push({ 
          rx: this.NORDIC_TX_UUID, // The TX characteristic from device
          tx: this.NORDIC_RX_UUID  // The RX characteristic to device
        });
        
        // Try all combinations of TX/RX pairs from our lists
        for (const txUuid of this.BLE_TX_UUIDS) {
          for (const rxUuid of this.BLE_RX_UUIDS) {
            // Skip if it's the same as Nordic pair we already added
            if (txUuid === this.NORDIC_TX_UUID && rxUuid === this.NORDIC_RX_UUID) {
              continue;
            }
            knownCharacteristicPairs.push({ rx: txUuid, tx: rxUuid });
          }
        }
        
        // Some devices use the same characteristic for both TX and RX
        for (const txUuid of this.BLE_TX_UUIDS) {
          knownCharacteristicPairs.push({ rx: txUuid, tx: txUuid });
        }
        
        // Add legacy SPP pair at the end
        knownCharacteristicPairs.push({ rx: this.SPP_RX_UUID, tx: this.SPP_TX_UUID });
        
        // Try each known pair
        for (const pair of knownCharacteristicPairs) {
          try {
            this.logger.debug(`Trying RX=${pair.rx}, TX=${pair.tx}`);
            const rx = await this.serialService.getCharacteristic(pair.rx);
            const tx = await this.serialService.getCharacteristic(pair.tx);
            
            if (rx && tx) {
              this.rxCharacteristic = rx;
              this.txCharacteristic = tx;
              this.logger.debug(`Found matching RX/TX pair: RX=${pair.rx}, TX=${pair.tx}`);
              break;
            }
          } catch (e) {
            this.logger.debug(`Characteristic pair not found: ${e.message}`);
            // Continue to next pair
          }
        }
        
        // If we couldn't find a known pair, try to detect based on properties
        if (!this.rxCharacteristic || !this.txCharacteristic) {
          this.logger.debug('No known characteristic pair found, detecting based on properties');
          
          // First log all available characteristics with their properties for debugging
          characteristics.forEach(char => {
            const props = Object.keys(char.properties).filter(p => char.properties[p]).join(', ');
            this.logger.debug(`Characteristic ${char.uuid} has properties: ${props}`);
          });
          
          // Look for characteristics with the right properties for RX/TX
          // RX (from device to us): needs notify or read
          // TX (from us to device): needs write or writeWithoutResponse
          const notifyChars = characteristics.filter(char => char.properties.notify);
          const readChars = characteristics.filter(char => char.properties.read);
          const writeChars = characteristics.filter(char => 
              char.properties.write || char.properties.writeWithoutResponse);
          
          this.logger.debug(`Found ${notifyChars.length} notify, ${readChars.length} read, and ${writeChars.length} write characteristics`);
          
          // Prefer notify characteristics for receiving data (our RX)
          if (notifyChars.length > 0) {
            this.rxCharacteristic = notifyChars[0];
            this.logger.debug(`Using RX characteristic with notify: ${this.rxCharacteristic.uuid}`);
          } 
          // Fall back to read characteristics if no notify is available
          else if (readChars.length > 0) {
            this.rxCharacteristic = readChars[0];
            this.logger.debug(`Using RX characteristic with read: ${this.rxCharacteristic.uuid}`);
          } 
          // Last resort - use any available characteristic
          else if (characteristics.length > 0) {
            this.rxCharacteristic = characteristics[0];
            this.logger.debug(`Using fallback RX characteristic: ${this.rxCharacteristic.uuid}`);
            this.logger.warn('This characteristic may not support notifications or reading');
          }
          
          // For TX, we need a characteristic we can write to
          if (writeChars.length > 0) {
            // Don't use the same characteristic we're using for RX if possible
            const uniqueWriteChars = writeChars.filter(char => 
                this.rxCharacteristic && char.uuid !== this.rxCharacteristic.uuid);
                
            if (uniqueWriteChars.length > 0) {
              this.txCharacteristic = uniqueWriteChars[0];
            } else {
              this.txCharacteristic = writeChars[0];
            }
            
            this.logger.debug(`Using TX characteristic with write: ${this.txCharacteristic.uuid}`);
          } 
          // If we absolutely must, use any other characteristic as a last resort
          else if (characteristics.length > 1) {
            // Try to find a different characteristic than the one used for RX
            const otherChars = characteristics.filter(char => 
                this.rxCharacteristic && char.uuid !== this.rxCharacteristic.uuid);
                
            if (otherChars.length > 0) {
              this.txCharacteristic = otherChars[0];
            } else {
              this.txCharacteristic = characteristics[1] || characteristics[0];
            }
            
            this.logger.debug(`Using fallback TX characteristic: ${this.txCharacteristic.uuid}`);
            this.logger.warn('This characteristic may not support writing');
          } 
          // If only one characteristic is available, use it for both
          else if (characteristics.length === 1) {
            this.txCharacteristic = characteristics[0];
            this.logger.debug(`Using single characteristic for both RX and TX: ${this.txCharacteristic.uuid}`);
            this.logger.warn('Using the same characteristic for both reading and writing');
          }
          
          // Final check to ensure we selected characteristics with the right properties
          if (this.rxCharacteristic) {
            const rxProps = Object.keys(this.rxCharacteristic.properties)
              .filter(p => this.rxCharacteristic.properties[p]).join(', ');
            this.logger.debug(`Selected RX characteristic ${this.rxCharacteristic.uuid} with properties: ${rxProps}`);
          }
          
          if (this.txCharacteristic) {
            const txProps = Object.keys(this.txCharacteristic.properties)
              .filter(p => this.txCharacteristic.properties[p]).join(', ');
            this.logger.debug(`Selected TX characteristic ${this.txCharacteristic.uuid} with properties: ${txProps}`);
          }
        }
        
        // Verify we have both characteristics
        if (!this.rxCharacteristic) {
          throw new Error('Could not find a suitable RX characteristic');
        }
        
        if (!this.txCharacteristic) {
          throw new Error('Could not find a suitable TX characteristic');
        }
        
        // Define a helper method for setting up safe polling
        const setupSafePolling = (interval = 2000) => {
          this.logger.debug(`Setting up safe polling with interval: ${interval}ms`);
          this.pollingEnabled = true;
          
          // Clear any existing polling interval
          if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
          }
          
          // We'll use a timeout-based approach to ensure we don't queue up multiple reads
          let isReading = false;
          
          const pollOnce = async () => {
            if (!this.isConnected || !this.rxCharacteristic || isReading) {
              return;
            }
            
            isReading = true;
            
            try {
              // Wait for GATT to be ready
              // Check if characteristic supports reading first
              if (this.rxCharacteristic.properties.read) {
                const value = await this.rxCharacteristic.readValue();
                
                // Only process if there's actual data
                if (value && value.byteLength > 0) {
                  this.handleIncomingData({ target: { value } });
                }
              }
            } catch (e) {
              // Only log the first few errors to avoid flooding the console
              if (!this.pollingErrorCount) this.pollingErrorCount = 0;
              this.pollingErrorCount++;
              
              if (this.pollingErrorCount < 5) {
                this.logger.warn(`Error polling characteristic (${this.pollingErrorCount}/5): ${e.message}`);
              } else if (this.pollingErrorCount === 5) {
                this.logger.warn(`Reached maximum polling error count. Suppressing further errors.`);
              }
              
              // If too many errors occur, increase the polling interval
              if (this.pollingErrorCount === 10) {
                clearInterval(this.pollingInterval);
                this.pollingInterval = setInterval(pollOnce, interval * 2);
                this.logger.warn(`Increased polling interval to ${interval * 2}ms due to errors`);
              }
            } finally {
              isReading = false;
            }
          };
          
          this.pollingInterval = setInterval(pollOnce, interval);
        };
        
        // Try to start notifications for incoming data
        // But make this optional - some devices might use a polling approach instead
        try {
          this.logger.debug(`Setting up data reception for characteristic: ${this.rxCharacteristic.uuid}`);
          const props = Object.keys(this.rxCharacteristic.properties)
            .filter(p => this.rxCharacteristic.properties[p]);
          this.logger.debug(`Characteristic properties: ${props.join(', ')}`);
          
          // Only attempt to start notifications if the characteristic supports it
          if (this.rxCharacteristic.properties.notify) {
            try {
              await this.rxCharacteristic.startNotifications();
              this.rxCharacteristic.addEventListener('characteristicvaluechanged', 
                (event) => this.handleIncomingData(event));
              this.logger.debug('Notifications started successfully');
            } catch (notifyError) {
              this.logger.warn(`Error starting notifications: ${notifyError.message}`);
              this.eventEmitter.emit('bluetooth:warning', {
                message: `Could not start notifications: ${notifyError.message}`
              });
              
              // Check if read is available as fallback
              if (this.rxCharacteristic.properties.read) {
                this.logger.debug('Falling back to conservative polling');
                setupSafePolling(3000); // Use a longer interval for fallback polling
              }
            }
          } else if (this.rxCharacteristic.properties.read) {
            this.logger.debug('Characteristic supports read but not notify, setting up conservative polling');
            setupSafePolling(2000); // Poll every 2 seconds
          } else {
            this.logger.debug('Characteristic does not support read or notify, will use passive reception only');
            this.eventEmitter.emit('bluetooth:warning', {
              message: 'Device does not support notifications or reading. Data reception may be limited.'
            });
          }
        } catch (error) {
          this.logger.error(`Error setting up data reception: ${error.message}`);
          this.eventEmitter.emit('bluetooth:warning', {
            message: `Could not set up data reception: ${error.message}`,
            error
          });
        }
        
        this.isConnected = true;
        this.isConnecting = false;
        this.autoReconnect = options.autoReconnect || false;
        
        this.eventEmitter.emit('bluetooth:connected', {
          deviceId: this.device.id,
          deviceName: this.device.name
        });
        
        // Also emit generic connection event for the connection manager
        this.eventEmitter.emit('device:connected', {
          method: 'bluetooth',
          deviceId: this.device.id,
          deviceName: this.device.name
        });
        
        return true;
      } catch (error) {
        this.isConnecting = false;
        this.eventEmitter.emit('bluetooth:error', {
          message: error.message,
          error
        });
        
        return false;
      }
    }

    /**
     * Disconnect from the device
     */
    async disconnect() {
      if (!this.isConnected || !this.device) {
        return;
      }
      
      try {
        this.autoReconnect = false;
        
        // Safely clean up notifications if they were started
        if (this.rxCharacteristic) {
          try {
            if (this.rxCharacteristic.properties.notify) {
              await this.rxCharacteristic.stopNotifications().catch(e => {
                this.logger.warn(`Error stopping notifications: ${e.message}`);
              });
            }
          } catch (err) {
            this.logger.warn(`Error cleaning up notifications: ${err.message}`);
          }
        }
        
        // Clear polling interval if it was used
        if (this.pollingInterval) {
          clearInterval(this.pollingInterval);
          this.pollingInterval = null;
        }
        
        // Reset polling state
        this.pollingEnabled = false;
        this.pollingErrorCount = 0;
        
        if (this.device.gatt.connected) {
          await this.device.gatt.disconnect();
        }
        
        this.isConnected = false;
        this.eventEmitter.emit('bluetooth:disconnected', {
          deviceId: this.device.id,
          deviceName: this.device.name
        });
        
        // Also emit generic disconnection event for the connection manager
        this.eventEmitter.emit('device:disconnected', {
          method: 'bluetooth',
          deviceId: this.device.id,
          deviceName: this.device.name
        });
      } catch (error) {
        this.logger.error('Error during disconnect:', error);
        this.eventEmitter.emit('bluetooth:error', {
          message: 'Failed to disconnect properly',
          error
        });
      }
    }

    /**
     * Handle device disconnection
     */
    async onDisconnected() {
      const wasConnected = this.isConnected;
      this.isConnected = false;
      
      // Safe cleanup of polling
      if (this.pollingInterval) {
        clearInterval(this.pollingInterval);
        this.pollingInterval = null;
      }
      
      // Reset all polling related state
      this.pollingEnabled = false;
      this.pollingErrorCount = 0;
      
      this.server = null;
      this.serialService = null;
      this.rxCharacteristic = null;
      this.txCharacteristic = null;
      
      if (wasConnected) {
        this.eventEmitter.emit('bluetooth:disconnected', {
          deviceId: this.device?.id,
          deviceName: this.device?.name
        });
        
        // Also emit generic disconnection event for the connection manager
        this.eventEmitter.emit('device:disconnected', {
          method: 'bluetooth',
          deviceId: this.device?.id,
          deviceName: this.device?.name
        });
        
        // Attempt automatic reconnection if enabled
        if (this.autoReconnect && this.device) {
          setTimeout(() => {
            this.connect({ deviceId: this.device.id, autoReconnect: true });
          }, 1000);
        }
      }
    }

    /**
     * Handle incoming data from the device
     * @param {Event} event - Characteristic value changed event
     */
    handleIncomingData(event) {
      try {
        const value = event.target.value;
        const data = value.buffer;
        
        // Convert ArrayBuffer to string for debugging
        const textDecoder = new TextDecoder('utf-8');
        const dataString = textDecoder.decode(new Uint8Array(data));
        
        // Generate a hex representation for debugging
        const hexValues = Array.from(new Uint8Array(data))
          .map(b => b.toString(16).padStart(2, '0'))
          .join(' ');
        
        // Check for empty or extremely short data
        if (dataString.length < 3) {
          this.logger.debug(`Received very short data (${dataString.length} bytes), likely not NMEA. Skipping.`);
          return;
        }
        
        if (this.debugSettings.debug) {
          this.logger.debug('Received data:', dataString);
          this.logger.debug('Hex representation:', hexValues);
        }
        
        // More comprehensive detection of NMEA data
        const isNmea = dataString.includes('$');
        const containsCrLf = dataString.includes('\r\n');
        const hasNmeaSentence = /\$(GP|GL|GA|GB|GN)[A-Z]{3},/.test(dataString);
        
        // Skip data processing if:
        // 1. This appears to be just the device name repeating
        // 2. The device name has already been reported many times
        if (this.lastDataString === dataString && !isNmea) {
          this.logger.debug('Skipping duplicate data (device name)');
          return;
        }
        
        // Remember the last string to detect repeats
        this.lastDataString = dataString;
        
        // Handle potential configuration messages (responses to our PUBX commands)
        if (dataString.includes('PUBX') && !this.configurationResponded) {
          this.logger.debug('Detected configuration response from device:', dataString);
          this.configurationResponded = true;
          
          // Try to enable GGA messages again immediately after receiving a response
          setTimeout(async () => {
            try {
              await this.sendData('$PUBX,40,GGA,1,1,1,1,1,0*5A\r\n');
              this.logger.debug('Resent GGA enable command after receiving PUBX response');
            } catch (e) {
              this.logger.warn('Failed to send follow-up command:', e);
            }
          }, 300);
          
          // Try to detect if this includes error information
          if (dataString.toLowerCase().includes('error') || dataString.includes('ERR')) {
            this.logger.warn('Device responded with error to configuration commands');
          } else {
            this.logger.debug('Device appears to have accepted configuration');
          }
        }
        
        // Look for UBX binary protocol responses
        if (hexValues.startsWith('b5 62')) {
          this.logger.debug('Detected UBX binary protocol response');
          
          // Parse UBX message class and ID
          if (hexValues.length >= 10) {
            const msgClass = parseInt(hexValues.split(' ')[2], 16);
            const msgId = parseInt(hexValues.split(' ')[3], 16);
            this.logger.debug(`UBX message class: 0x${msgClass.toString(16)}, ID: 0x${msgId.toString(16)}`);
          }
        }
        
        // Sometimes RMC/GGA sentences are actually present but in unusual format
        // Try to extract them even if not perfectly formatted
        if (isNmea && !hasNmeaSentence) {
          // Look for position data with regex pattern matching
          const extractedPosition = dataString.match(/(\d{2})(\d{2}\.\d+),([NS]),(\d{3})(\d{2}\.\d+),([EW])/);
          if (extractedPosition) {
            this.logger.debug('Found position data in non-standard format:', extractedPosition[0]);
            // Consider constructing a valid NMEA sentence here if needed
          }
        }
        
        // Emit a raw data event with the string, before any parsing
        this.eventEmitter.emit('bluetooth:raw-data', dataString);
        
        // Only emit for parsing if this looks like NMEA data
        if (isNmea) {
          // Use standardized events from constants - emit only device:data for consistency
          // This helps consolidate event handling in the GnssModule
          this.eventEmitter.emit(EVENTS.DATA_RECEIVED, data);
        }
      } catch (error) {
        this.logger.error('Error handling incoming data:', error);
      }
    }

    /**
     * Send data to the device
     * @param {string|ArrayBuffer} data - Data to send
     * @returns {Promise<boolean>} Whether send was successful
     */
    async sendData(data) {
      if (!this.isConnected || !this.txCharacteristic) {
        this.logger.error('Cannot send data: device not connected or TX characteristic not available');
        return false;
      }
      
      try {
        // Convert string to ArrayBuffer if needed
        let buffer;
        if (typeof data === 'string') {
          if (this.debugSettings.debug) {
            this.logger.debug('Sending string data:', data);
          }
          buffer = new TextEncoder().encode(data);
        } else if (data instanceof ArrayBuffer) {
          const textDecoder = new TextDecoder('utf-8');
          const dataString = textDecoder.decode(new Uint8Array(data));
          if (this.debugSettings.debug) {
            this.logger.debug('Sending binary data:', dataString);
          }
          buffer = data;
        } else {
          throw new Error('Invalid data type. Expected string or ArrayBuffer');
        }
        
        // When using Nordic UART Service (which is typical for many GNSS devices):
        // The write characteristic might need writeWithoutResponse
        if (this.txCharacteristic.uuid === '6e400002-b5a3-f393-e0a9-e50e24dcca9e') {
          if (this.debugSettings.debug) {
            this.logger.debug('Using writeWithoutResponse for Nordic UART TX');
          }
          
          // Break data into smaller chunks (20 bytes max) to avoid overflow
          const MAX_CHUNK_SIZE = 20;
          const dataArray = new Uint8Array(buffer);
          
          for (let i = 0; i < dataArray.length; i += MAX_CHUNK_SIZE) {
            const chunk = dataArray.slice(i, Math.min(i + MAX_CHUNK_SIZE, dataArray.length));
            // Use writeValueWithoutResponse for Nordic UART
            await this.txCharacteristic.writeValueWithoutResponse(chunk);
            
            // Small delay between chunks
            await new Promise(resolve => setTimeout(resolve, 50));
          }
        } 
        // Otherwise try standard methods
        else {
          // Determine the write type based on the characteristic properties
          let writeOptions = {};
          if (this.txCharacteristic.properties.writeWithoutResponse) {
            if (this.debugSettings.debug) {
              this.logger.debug('Using writeWithoutResponse');
            }
            writeOptions = { type: 'writeWithoutResponse' };
          } else {
            if (this.debugSettings.debug) {
              this.logger.debug('Using standard write');
            }
          }
          
          await this.txCharacteristic.writeValue(buffer, writeOptions);
        }
        
        this.logger.debug('Data sent successfully');
        return true;
      } catch (error) {
        this.logger.error('Failed to send data:', error);
        this.eventEmitter.emit('bluetooth:warning', {
          message: `Failed to send data: ${error.message} - continuing operation`,
          error
        });
        // Return true even if sending fails - we want to continue trying to receive data
        // This helps if the device is in a mode where it's sending but not receiving
        return true; 
      }
    }

    /**
     * Send a command to configure the device
     * @param {string} command - Command string
     * @returns {Promise<boolean>} Whether command was sent successfully
     */
    async sendCommand(command) {
      // Ensure command ends with proper line ending
      if (!command.endsWith('\r\n')) {
        command += '\r\n';
      }
      
      return this.sendData(command);
    }

    /**
     * Special connection method for SparkFun Facet RTK Rover
     * @param {Object} options - Connection options
     * @returns {Promise<boolean>} Whether connection was successful
     */
    async connectToSparkFunFacet(options = {}) {
      if (this.isConnected) {
        return true;
      }
      
      if (this.isConnecting) {
        return false;
      }
      
      this.isConnecting = true;
      this.eventEmitter.emit('bluetooth:connecting', { type: 'sparkfun' });
      
      try {
        // Browser compatibility check
        if (!navigator.bluetooth) {
          throw new Error('Web Bluetooth API is not supported in this browser');
        }
        
        // Create a broader list of optionalServices to improve our chances
        // of finding the correct one for the SparkFun device
        
        // Create a comprehensive list of possible BLE UART services - use only full UUIDs
        const allPossibleServices = [
          // The specific known SparkFun service (this may vary by device model)
          '0000ffe0-0000-1000-8000-00805f9b34fb', // Common for HC-05/06/08 modules
          
          // Common UART services in priority order
          '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART Service
          '49535343-fe7d-4ae5-8fa9-9fafd205e455', // HM-10 Service
          '0000fff0-0000-1000-8000-00805f9b34fb', // Alternative UART Service
          
          // Generic services
          '00001800-0000-1000-8000-00805f9b34fb', // Generic Access
          '00001801-0000-1000-8000-00805f9b34fb', // Generic Attribute
          
          // Add all other service UUIDs we know about
          ...this.SERVICE_UUIDS,
          
          // Try some common UUID patterns with different bases
          '0000180a-0000-1000-8000-00805f9b34fb', // Device Information
          '00001809-0000-1000-8000-00805f9b34fb', // Health Thermometer
          '0000180d-0000-1000-8000-00805f9b34fb', // Heart Rate
          '0000180f-0000-1000-8000-00805f9b34fb', // Battery Service
          '0000181a-0000-1000-8000-00805f9b34fb'  // Environmental Sensing
        ];
        
        // Request device with Facet specific filters
        const requestOptions = {
          filters: [
            { namePrefix: 'Facet' },
            { namePrefix: 'SparkFun' },
            { namePrefix: 'RTK' }
          ],
          optionalServices: allPossibleServices
        };
        
        // Show device picker
        this.logger.debug('Requesting SparkFun Facet RTK device...');
        this.device = await navigator.bluetooth.requestDevice(requestOptions);
        
        if (!this.device) {
          throw new Error('No device selected');
        }
        
        // Set up disconnection listener
        this.device.addEventListener('gattserverdisconnected', this.onDisconnected);
        
        // Connect to GATT server
        this.logger.debug('Connecting to GATT server...');
        this.server = await this.device.gatt.connect();
        
        // Get all available services
        this.logger.debug('Getting all services...');
        const allServices = await this.server.getPrimaryServices();
        
        if (allServices.length === 0) {
          throw new Error('No services found on device');
        }
        
        this.logger.debug('Available services:', allServices.map(s => s.uuid));
        
        // Find a service we can use for communication
        // Create a priority list of services to try - use only full UUIDs
        const priorityServices = [
          // First priority: Known UART/Serial services
          '0000ffe0-0000-1000-8000-00805f9b34fb', // BLE UART (HC-05/06/08)
          '0000ffe5-0000-1000-8000-00805f9b34fb', // BLE Data Service
          '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART
          '49535343-fe7d-4ae5-8fa9-9fafd205e455', // HM-10/16/17
          '0000fff0-0000-1000-8000-00805f9b34fb', // HC-08/10 Alternative
          
          // Generic services - lowest priority
          '00001800-0000-1000-8000-00805f9b34fb', // Generic Access 
          '00001801-0000-1000-8000-00805f9b34fb'  // Generic Attribute
        ];
        
        // Log all available services for debugging
        this.logger.debug('Available services on device:');
        allServices.forEach(service => {
          this.logger.debug(`- ${service.uuid}`);
        });
        
        // Try each service in priority order
        for (const serviceId of priorityServices) {
          const service = allServices.find(s => s.uuid === serviceId);
          if (service) {
            this.logger.debug(`Found priority service: ${serviceId}`);
            this.serialService = service;
            break;
          }
        }
        
        // If we still don't have a service, try all services
        if (!this.serialService) {
          this.logger.debug('No priority service found, trying all services...');
          
          // Try each service and see if it has suitable characteristics
          for (const service of allServices) {
            try {
              const chars = await service.getCharacteristics();
              this.logger.debug(`Service ${service.uuid} has ${chars.length} characteristics`);
              
              // Look for characteristics with read property (needed for data reception)
              const readChar = chars.find(c => c.properties.read);
              if (readChar) {
                this.logger.debug(`Found service with readable characteristic: ${service.uuid}`);
                this.serialService = service;
                break;
              }
            } catch (e) {
              this.logger.warn(`Error checking characteristics for service ${service.uuid}:`, e);
            }
          }
          
          // Last resort: use the first service
          if (!this.serialService && allServices.length > 0) {
            this.logger.debug('Using first available service as last resort');
            this.serialService = allServices[0];
          }
        }
        
        if (!this.serialService) {
          throw new Error('Could not find a suitable service');
        }
        
        this.logger.debug('Using service:', this.serialService.uuid);
        
        // Get all characteristics from this service
        this.logger.debug('Getting characteristics...');
        const characteristics = await this.serialService.getCharacteristics();
        
        if (characteristics.length === 0) {
          throw new Error('No characteristics found');
        }
        
        this.logger.debug('Available characteristics:', characteristics.map(c => ({
          uuid: c.uuid,
          properties: Object.keys(c.properties).filter(p => c.properties[p])
        })));
        
        // For SparkFun devices, we'll prioritize characteristics with read/write permissions
        this.rxCharacteristic = characteristics.find(char => char.properties.read);
        this.txCharacteristic = characteristics.find(char => char.properties.write || char.properties.writeWithoutResponse);
        
        // If we couldn't find a read characteristic, use the first available
        if (!this.rxCharacteristic && characteristics.length > 0) {
          this.rxCharacteristic = characteristics[0];
        }
        
        // If we couldn't find a write characteristic, use the second available or the first one
        if (!this.txCharacteristic && characteristics.length > 1) {
          this.txCharacteristic = characteristics[1];
        } else if (!this.txCharacteristic) {
          this.txCharacteristic = characteristics[0];
        }
        
        this.logger.debug('Using RX characteristic:', this.rxCharacteristic.uuid);
        this.logger.debug('Using TX characteristic:', this.txCharacteristic.uuid);
        
        // Set up enhanced polling for SparkFun device with better error recovery
        this.logger.debug('Setting up enhanced polling for SparkFun device...');
        this.pollingEnabled = true;
        
        // For some devices, we need to try multiple characteristics
        // Get all characteristics from this service
        let allCharacteristics = [];
        try {
          // Get all characteristics for potential polling targets
          allCharacteristics = await this.serialService.getCharacteristics();
          this.logger.debug(`Found ${allCharacteristics.length} characteristics to potentially poll`);
        } catch (e) {
          this.logger.warn('Error getting all characteristics:', e);
        }
        
        // Track failure count to potentially switch characteristics
        let failureCount = 0;
        const MAX_FAILURES = 3;
        let currentCharIndex = 0;
        let dataReceived = false;
        let startupDelay = true;
        
        // Give device time to initialize before starting polling
        setTimeout(() => {
          startupDelay = false;
          this.logger.debug('Starting data polling after initialization delay');
        }, 3000);
        
        // Use a more robust polling approach with two methods
        this.pollingInterval = setInterval(async () => {
          // Skip polling during startup delay
          if (startupDelay) {
            return;
          }
          
          try {
            // Try notification method first (preferred)
            if (this.isConnected && this.rxCharacteristic && this.rxCharacteristic.properties.notify) {
              if (!this.rxCharacteristic._hasStartedNotifications) {
                try {
                  await this.rxCharacteristic.startNotifications();
                  this.rxCharacteristic._hasStartedNotifications = true;
                  this.logger.debug('Successfully started notifications on characteristic');
                  
                  // Add event listener for notifications
                  this.rxCharacteristic.addEventListener('characteristicvaluechanged', 
                    (event) => this.handleIncomingData(event));
                } catch (notifyError) {
                  this.logger.warn('Failed to start notifications, falling back to polling:', notifyError);
                }
              }
            }
            
            // Also use direct readValue as backup or alternative
            if (this.isConnected && this.rxCharacteristic) {
              const value = await this.rxCharacteristic.readValue();
              // Only process if there's actual data
              if (value && value.byteLength > 0) {
                this.handleIncomingData({ target: { value } });
                
                // Track successful data receipt
                if (!dataReceived) {
                  dataReceived = true;
                  this.logger.debug('Successfully receiving data from device');
                }
                
                failureCount = 0; // Reset failure count on success
              } else {
                // Empty value could be a soft failure
                failureCount++;
              }
            }
          } catch (e) {
            this.logger.warn('Error polling primary characteristic:', e);
            failureCount++;
            
            // If we've had multiple failures, try switching to another characteristic
            if (failureCount >= MAX_FAILURES && allCharacteristics.length > 1) {
              failureCount = 0;
              currentCharIndex = (currentCharIndex + 1) % allCharacteristics.length;
              
              // Try using a different characteristic
              const nextChar = allCharacteristics[currentCharIndex];
              if (nextChar && nextChar !== this.rxCharacteristic) {
                this.logger.debug(`Switching to alternative characteristic: ${nextChar.uuid}`);
                this.rxCharacteristic = nextChar;
                
                // Reset notification tracking for this characteristic
                this.rxCharacteristic._hasStartedNotifications = false;
                
                // Try to start notifications for the new characteristic
                try {
                  await this.rxCharacteristic.startNotifications();
                  this.rxCharacteristic._hasStartedNotifications = true;
                  this.logger.debug('Successfully started notifications on new characteristic');
                  
                  // Add event listener for notifications on the new characteristic
                  this.rxCharacteristic.addEventListener('characteristicvaluechanged', 
                    (event) => this.handleIncomingData(event));
                  
                  // Try to enable GGA messages again with the new characteristic
                  setTimeout(async () => {
                    try {
                      // Send specific command with this new characteristic
                      await this.sendData('$PUBX,40,GGA,1,1,1,1,1,0*5A\r\n');
                      this.logger.debug('Resent GGA enable command on new characteristic');
                    } catch (e) {
                      this.logger.warn('Failed to send command on new characteristic:', e);
                    }
                  }, 500);
                } catch (notifyError) {
                  this.logger.warn('Failed to start notifications on new characteristic, continuing with polling');
                }
              }
            }
          }
        }, 250); // Poll more frequently (250ms) for better responsiveness
        
        // Device is now connected
        this.isConnected = true;
        this.isConnecting = false;
        this.autoReconnect = options.autoReconnect || false;
        
        // Nordic UART commands - specifically for SparkFun device
        // Since we know we're already receiving GSA sentences, we'll just try to enable GGA
        setTimeout(async () => {
          try {
            this.logger.debug('Sending NMEA configuration commands for Nordic UART (SparkFun)...');
            
            // First wait a full 2 seconds for the device to stabilize its connection
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            this.logger.debug('Connection stabilized, beginning command sequence');
            
            // First send some line breaks to wake it up - important for some modules
            await this.sendData('\r\n\r\n');
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Send reset command - try to start from a clean state
            // This will revert settings to defaults but ensure consistent behavior
            await this.sendData('$PUBX,40,ZDA,0,0,0,0,0,0*45\r\n');
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Send the configuration commands in the exact order used by other applications
            // GGA sentence - position data (must be first and with higher rate)
            await this.sendData('$PUBX,40,GGA,0,1,0,0,0,0*5A\r\n');
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // GGA sentence again with different parameters - matches working app's sequence
            await this.sendData('$PUBX,40,GGA,1,1,1,1,1,0*5A\r\n');
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // RMC sentence - minimum navigation info
            await this.sendData('$PUBX,40,RMC,1,1,1,1,1,0*47\r\n');
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // GSA sentence - satellite data
            await this.sendData('$PUBX,40,GSA,1,1,1,1,1,0*4E\r\n');
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // GST sentence - error statistics 
            await this.sendData('$PUBX,40,GST,1,1,1,1,1,0*5B\r\n');
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // VTG sentence - course and speed
            await this.sendData('$PUBX,40,VTG,1,1,1,1,1,0*5E\r\n');
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // Save configuration to persist changes
            await this.sendData('$PUBX,00*33\r\n');
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Query current configuration to trigger response
            await this.sendData('$PUBX,00*33\r\n');
            await new Promise(resolve => setTimeout(resolve, 300));
            
            this.logger.debug('Complete NMEA configuration commands sent');
          } catch (e) {
            this.logger.warn('Error sending NMEA configuration - device may be in read-only mode:', e);
            this.logger.debug('Continuing with available data');
          }
        }, 1000);
        
        this.eventEmitter.emit('bluetooth:connected', {
          deviceId: this.device.id,
          deviceName: this.device.name,
          type: 'sparkfun'
        });
        
        // Also emit generic connection event for the connection manager
        this.eventEmitter.emit('device:connected', {
          method: 'bluetooth',
          deviceId: this.device.id,
          deviceName: this.device.name,
          deviceType: 'sparkfun'
        });
        
        return true;
      } catch (error) {
        this.isConnecting = false;
        this.eventEmitter.emit('bluetooth:error', {
          message: error.message,
          error,
          type: 'sparkfun'
        });
        
        return false;
      }
    }

    /**
     * Get information about the connected device
     * @returns {Object} - Device information
     */
    getDeviceInfo() {
      if (!this.isConnected) {
        return null;
      }
      
      return {
        type: 'bluetooth',
        id: this.device?.id,
        name: this.device?.name
      };
    }
  }

  /**
   * SerialHandler - Implements Web Serial API connections
   */

  class SerialHandler extends ConnectionHandler {
    constructor(eventEmitter, options = {}) {
      super(eventEmitter, options);
      this.name = 'serial';
      this.port = null;
      this.reader = null;
      this.writer = null;
      this.readInProgress = false;
      this.writeInProgress = false;
      this.keepReading = false;
      this.dataProcessor = null;
      this.autoReconnect = false;
      this.deviceInfo = {
        usbVendorId: null,
        usbProductId: null,
        portName: null
      };
    }
    
    /**
     * Check if Web Serial API is available
     * @returns {boolean} - Whether Web Serial is available
     */
    isAvailable() {
      return typeof navigator !== 'undefined' && 
             navigator.serial !== undefined;
    }
    
    /**
     * Get priority level for serial connections
     * @param {Object} options - Connection options
     * @returns {number} - Priority level
     */
    getPriority(options = {}) {
      // Default priority (1-10 scale, higher = try first)
      let priority = 5;
      
      // Increase priority if explicitly preferred
      if (options.preferredMethod === 'serial') {
        priority += 5;
      }
      
      // Increase priority if we have a last used port
      if (options.lastPort || (options.serial && options.serial.lastPort)) {
        priority += 2;
      }
      
      // Return final priority value
      return priority;
    }
    
    /**
     * Connect to a serial device
     * @param {Object} options - Connection options
     * @returns {Promise<boolean>} - Whether connection was successful
     */
    async connect(options = {}) {
      if (this.isConnected) {
        return true;
      }
      
      if (this.isConnecting) {
        return false;
      }
      
      this.isConnecting = true;
      this.eventEmitter.emit('serial:connecting', {});
      
      try {
        // Check if Serial API is available
        if (!this.isAvailable()) {
          throw new Error('Web Serial API is not supported in this browser');
        }
        
        // Get last port info from options
        const lastPort = options.lastPort || 
                        (options.serial && options.serial.lastPort);
        
        // Try to get existing port if we have a last one
        if (lastPort) {
          try {
            const ports = await navigator.serial.getPorts();
            this.port = ports.find(port => {
              const info = port.getInfo();
              return info.usbVendorId === lastPort.usbVendorId && 
                     info.usbProductId === lastPort.usbProductId;
            });
            
            if (this.port) {
              this.logger.info('Reconnecting to last used port');
            }
          } catch (e) {
            this.logger.warn('Failed to reuse last port:', e);
          }
        }
        
        // Request a port if we don't have one
        if (!this.port) {
          // Configure filters based on options
          const filters = [];
          
          // Add filters for known GNSS device vendors if available
          if (options.knownDevices) {
            options.knownDevices.forEach(device => {
              if (device.usbVendorId) {
                filters.push({ usbVendorId: device.usbVendorId });
              }
            });
          }
          
          // Add filters for common GNSS vendors
          // u-blox USB vendor ID
          if (!filters.some(f => f.usbVendorId === 0x1546)) {
            filters.push({ usbVendorId: 0x1546 }); // u-blox
          }
          
          // FTDI (commonly used in GPS modules)
          if (!filters.some(f => f.usbVendorId === 0x0403)) {
            filters.push({ usbVendorId: 0x0403 }); // FTDI
          }
          
          // Silicon Labs CP210x (used in many GPS modules)
          if (!filters.some(f => f.usbVendorId === 0x10C4)) {
            filters.push({ usbVendorId: 0x10C4 }); // Silicon Labs
          }
          
          // Prolific (PL2303)
          if (!filters.some(f => f.usbVendorId === 0x067B)) {
            filters.push({ usbVendorId: 0x067B }); // Prolific
          }
          
          // Determine if we should use filters or show all devices
          const useFilters = options.useSerialFilters !== false; // Default to using filters unless explicitly disabled
          
          if (useFilters) {
            this.logger.debug('Requesting serial port with filters:', filters);
          } else {
            this.logger.debug('Requesting serial port with no filters (showing all devices)');
          }
          
          // Show port picker to user
          try {
            this.port = await navigator.serial.requestPort({
              // Only apply filters if useFilters is true and we have filters
              filters: useFilters && filters.length > 0 ? filters : undefined
            });
          } catch (e) {
            if (e.name === 'NotFoundError') {
              throw new Error('No matching serial devices found');
            } else if (e.name === 'SecurityError') {
              throw new Error('Serial port access denied by user or browser');
            } else {
              throw e;
            }
          }
          
          if (!this.port) {
            throw new Error('No port selected');
          }
        }
        
        // Determine port info for later reference
        const portInfo = this.port.getInfo();
        this.deviceInfo = {
          usbVendorId: portInfo.usbVendorId,
          usbProductId: portInfo.usbProductId,
          portName: null // Not provided by the API
        };
        
        // Configure port settings
        const baudRate = options.baudRate || 
                         (options.serial && options.serial.baudRate) || 
                         9600;
        const dataBits = options.dataBits || 
                         (options.serial && options.serial.dataBits) || 
                         8;
        const stopBits = options.stopBits || 
                         (options.serial && options.serial.stopBits) || 
                         1;
        const parity = options.parity || 
                       (options.serial && options.serial.parity) || 
                       'none';
        const flowControl = options.flowControl || 
                            (options.serial && options.serial.flowControl) || 
                            'none';
        
        // Open the port
        this.logger.info(`Opening serial port with baud rate ${baudRate}`);
        await this.port.open({
          baudRate,
          dataBits,
          stopBits,
          parity,
          flowControl
        });
        
        // Start reading from the port
        this.startReading();
        
        // Configure auto-reconnect
        this.autoReconnect = options.autoReconnect || false;
        
        // Update state
        this.isConnected = true;
        this.isConnecting = false;
        
        // Emit connected event
        this.eventEmitter.emit('serial:connected', {
          deviceInfo: this.deviceInfo,
          baudRate
        });
        
        // Also emit generic connection event for the connection manager
        this.eventEmitter.emit('device:connected', {
          method: 'serial',
          deviceInfo: this.deviceInfo
        });
        
        return true;
      } catch (error) {
        this.logger.error('Serial connection error:', error);
        this.isConnecting = false;
        this.eventEmitter.emit('serial:error', {
          message: error.message,
          error
        });
        
        return false;
      }
    }
    
    /**
     * Start reading data from the serial port
     */
    async startReading() {
      if (this.readInProgress || !this.port || !this.port.readable) {
        return;
      }
      
      try {
        this.readInProgress = true;
        this.keepReading = true;
        
        // Create reader
        this.reader = this.port.readable.getReader();
        
        // Read data loop
        while (this.keepReading) {
          const { value, done } = await this.reader.read();
          
          if (done) {
            // Reader has been canceled or closed
            break;
          }
          
          if (value) {
            // Process the received data
            this.processData(value.buffer);
          }
        }
        
        // Release the reader when done
        this.reader.releaseLock();
        this.reader = null;
      } catch (error) {
        this.logger.error('Error reading from serial port:', error);
        this.handleDisconnection(error);
      } finally {
        this.readInProgress = false;
        this.reader = null;
      }
    }
    
    /**
     * Process received data
     * @param {ArrayBuffer} data - Received binary data
     */
    processData(data) {
      // For debugging
      if (this.debugSettings.debug) {
        const textDecoder = new TextDecoder('utf-8');
        const dataString = textDecoder.decode(new Uint8Array(data));
        this.logger.debug('Serial data received:', dataString);
      }
      
      // Emit raw data event
      this.eventEmitter.emit('serial:data', data);
      
      // Also emit generic data event for uniform handling
      this.eventEmitter.emit('device:data', data);
    }
    
    /**
     * Disconnect from the device
     * @returns {Promise<void>}
     */
    async disconnect() {
      if (!this.isConnected || !this.port) {
        return;
      }
      
      try {
        // Stop reading
        this.keepReading = false;
        
        if (this.reader) {
          try {
            await this.reader.cancel();
            this.reader = null;
          } catch (e) {
            this.logger.warn('Error canceling reader:', e);
          }
        }
        
        // Close the port
        try {
          await this.port.close();
        } catch (e) {
          this.logger.warn('Error closing port:', e);
        }
        
        // Update state
        this.isConnected = false;
        this.eventEmitter.emit('serial:disconnected', {
          deviceInfo: this.deviceInfo
        });
        
        // Also emit generic disconnection event for the connection manager
        this.eventEmitter.emit('device:disconnected', {
          method: 'serial',
          deviceInfo: this.deviceInfo
        });
      } catch (error) {
        this.logger.error('Error during disconnect:', error);
        this.eventEmitter.emit('serial:error', {
          message: 'Failed to disconnect properly',
          error
        });
      }
    }
    
    /**
     * Handle unexpected disconnection
     * @param {Error} error - Disconnection error
     */
    handleDisconnection(error) {
      const wasConnected = this.isConnected;
      this.isConnected = false;
      
      // Clean up resources
      this.reader = null;
      this.writer = null;
      
      if (wasConnected) {
        this.eventEmitter.emit('serial:disconnected', {
          deviceInfo: this.deviceInfo,
          error
        });
        
        // Also emit generic disconnection event for the connection manager
        this.eventEmitter.emit('device:disconnected', {
          method: 'serial',
          deviceInfo: this.deviceInfo,
          error
        });
        
        // Attempt to reconnect if enabled
        if (this.autoReconnect) {
          setTimeout(() => {
            this.connect({
              lastPort: this.deviceInfo,
              autoReconnect: true
            });
          }, 2000);
        }
      }
    }
    
    /**
     * Send data to the device
     * @param {string|ArrayBuffer} data - Data to send
     * @returns {Promise<boolean>} - Whether data was sent successfully
     */
    async sendData(data) {
      if (!this.isConnected || !this.port || !this.port.writable) {
        return false;
      }
      
      try {
        // Acquire writer if we don't have one
        if (!this.writer) {
          this.writer = this.port.writable.getWriter();
        }
        
        // Convert string to ArrayBuffer if needed
        let buffer;
        if (typeof data === 'string') {
          buffer = new TextEncoder().encode(data);
        } else if (data instanceof ArrayBuffer) {
          buffer = new Uint8Array(data);
        } else {
          throw new Error('Invalid data type. Expected string or ArrayBuffer');
        }
        
        // Write data
        await this.writer.write(buffer);
        
        // Release writer for other operations
        this.writer.releaseLock();
        this.writer = null;
        
        return true;
      } catch (error) {
        this.logger.error('Error sending data:', error);
        
        // Try to release writer if we have one
        if (this.writer) {
          try {
            this.writer.releaseLock();
          } catch (e) {
            // Ignore errors releasing lock
          }
          this.writer = null;
        }
        
        return false;
      }
    }
    
    /**
     * Get information about the connected device
     * @returns {Object} - Device information
     */
    getDeviceInfo() {
      if (!this.isConnected) {
        return null;
      }
      
      return {
        type: 'serial',
        ...this.deviceInfo
      };
    }
  }

  /**
   * RTK Settings UI Component
   * 
   * This component provides a user interface for configuring NTRIP RTK correction settings
   * and managing connections to NTRIP casters.
   */
  class RtkSettings {
    /**
     * Create an RTK settings component
     * @param {Object} options - Configuration options
     * @param {EventEmitter} options.events - Event emitter for communication
     * @param {Settings} options.settings - Settings manager
     * @param {string} options.selector - CSS selector for the container element
     */
    constructor(options = {}) {
      this.events = options.events;
      this.settings = options.settings;
      this.isConnected = false;
      this.isConnecting = false;
      
      // Find container element if selector provided
      if (options.selector) {
        this.container = document.querySelector(options.selector);
      }
      
      // If no container, don't initialize UI
      if (!this.container) {
        console.warn('RtkSettings: No container element found. UI will not be initialized.');
        return;
      }
      
      // Cache frequently used elements
      this.elements = {};
      
      // Add CSS for proper styling
      this.addStyles();
      
      // Create UI elements
      this.initializeUI();
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Listen for RTK events
      this.registerEventListeners();
      
      // Load saved configuration
      this.loadSavedConfig();
    }

    /**
     * Add required CSS styles to the document
     */
    addStyles() {
      // Check if styles already exist
      if (document.getElementById('rtk-settings-styles')) {
        return;
      }
      
      // Create style element
      const style = document.createElement('style');
      style.id = 'rtk-settings-styles';
      style.textContent = `
      .rtk-settings-container {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
        margin: 0 auto;
        padding: 15px;
        background-color: #f7f7f7;
        border-radius: 5px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      }
      
      .rtk-settings-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 1px solid #e0e0e0;
      }
      
      .rtk-settings-title {
        font-size: 18px;
        font-weight: 500;
        margin: 0;
      }
      
      .rtk-settings-enable {
        display: flex;
        align-items: center;
        margin-bottom: 15px;
      }
      
      .rtk-settings-form {
        display: grid;
        grid-gap: 10px;
      }
      
      .form-group {
        display: flex;
        flex-direction: column;
      }
      
      .form-group label {
        font-size: 14px;
        color: #555;
        margin-bottom: 5px;
      }
      
      .form-group input, .form-group select {
        padding: 8px 10px;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 14px;
      }
      
      .form-group input:focus, .form-group select:focus {
        outline: none;
        border-color: #4285F4;
        box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.25);
      }
      
      .rtk-settings-actions {
        display: flex;
        justify-content: space-between;
        margin-top: 15px;
      }
      
      .rtk-status-display {
        display: flex;
        align-items: center;
        margin-top: 15px;
        padding: 10px;
        background-color: #f0f0f0;
        border-radius: 4px;
      }
      
      .rtk-status-indicator {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        margin-right: 8px;
      }
      
      .rtk-status-indicator.disconnected { background-color: #9e9e9e; }
      .rtk-status-indicator.connecting { background-color: #ff9800; }
      .rtk-status-indicator.connected { background-color: #4caf50; }
      .rtk-status-indicator.error { background-color: #f44336; }
      
      .rtk-button {
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
      }
      
      .rtk-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      .rtk-button.primary {
        background-color: #4285F4;
        color: white;
      }
      
      .rtk-button.secondary {
        background-color: #f1f1f1;
        color: #333;
      }
      
      .rtk-button.danger {
        background-color: #f44336;
        color: white;
      }
      
      .rtk-button.primary:hover { background-color: #3367d6; }
      .rtk-button.secondary:hover { background-color: #e0e0e0; }
      .rtk-button.danger:hover { background-color: #d32f2f; }
      
      .rtk-toggle {
        position: relative;
        display: inline-block;
        width: 40px;
        height: 20px;
        margin-right: 8px;
      }
      
      .rtk-toggle input {
        opacity: 0;
        width: 0;
        height: 0;
      }
      
      .rtk-toggle-slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: #ccc;
        transition: .4s;
        border-radius: 20px;
      }
      
      .rtk-toggle-slider:before {
        position: absolute;
        content: "";
        height: 16px;
        width: 16px;
        left: 2px;
        bottom: 2px;
        background-color: white;
        transition: .4s;
        border-radius: 50%;
      }
      
      .rtk-toggle input:checked + .rtk-toggle-slider {
        background-color: #4285F4;
      }
      
      .rtk-toggle input:focus + .rtk-toggle-slider {
        box-shadow: 0 0 1px #4285F4;
      }
      
      .rtk-toggle input:checked + .rtk-toggle-slider:before {
        transform: translateX(20px);
      }
      
      .rtk-correction-stats {
        margin-top: 10px;
        font-size: 12px;
        color: #666;
      }
      
      .rtk-correction-stats div {
        margin-bottom: 4px;
      }
      
      @media (min-width: 768px) {
        .rtk-settings-form {
          grid-template-columns: 1fr 1fr;
          grid-gap: 15px;
        }
      }
    `;
      
      // Add style to document
      document.head.appendChild(style);
    }

    /**
     * Initialize the UI elements
     */
    initializeUI() {
      if (!this.container) return;
      
      // Clear container
      this.container.innerHTML = '';
      
      // Create main container
      const settingsContainer = document.createElement('div');
      settingsContainer.className = 'rtk-settings-container';
      
      // Create header
      const header = document.createElement('div');
      header.className = 'rtk-settings-header';
      
      const title = document.createElement('h2');
      title.className = 'rtk-settings-title';
      title.textContent = 'RTK Correction Settings';
      
      header.appendChild(title);
      settingsContainer.appendChild(header);
      
      // Create enable toggle
      const enableContainer = document.createElement('div');
      enableContainer.className = 'rtk-settings-enable';
      
      const toggleLabel = document.createElement('label');
      toggleLabel.className = 'rtk-toggle';
      
      const toggleInput = document.createElement('input');
      toggleInput.type = 'checkbox';
      toggleInput.id = 'rtk-enable';
      
      const toggleSlider = document.createElement('span');
      toggleSlider.className = 'rtk-toggle-slider';
      
      toggleLabel.appendChild(toggleInput);
      toggleLabel.appendChild(toggleSlider);
      
      const toggleText = document.createElement('span');
      toggleText.textContent = 'Enable RTK Corrections';
      
      enableContainer.appendChild(toggleLabel);
      enableContainer.appendChild(toggleText);
      
      settingsContainer.appendChild(enableContainer);
      
      // Create form
      const form = document.createElement('form');
      form.className = 'rtk-settings-form';
      
      // Connection method
      const connectionMethodGroup = document.createElement('div');
      connectionMethodGroup.className = 'form-group';
      
      const connectionMethodLabel = document.createElement('label');
      connectionMethodLabel.htmlFor = 'rtk-connection-mode';
      connectionMethodLabel.textContent = 'Connection Method';
      
      const connectionMethodSelect = document.createElement('select');
      connectionMethodSelect.id = 'rtk-connection-mode';
      
      const autoOption = document.createElement('option');
      autoOption.value = 'auto';
      autoOption.textContent = 'Auto (WebSocket preferred)';
      
      const websocketOption = document.createElement('option');
      websocketOption.value = 'websocket';
      websocketOption.textContent = 'WebSocket';
      
      const directOption = document.createElement('option');
      directOption.value = 'direct';
      directOption.textContent = 'Direct';
      
      const proxyOption = document.createElement('option');
      proxyOption.value = 'proxy';
      proxyOption.textContent = 'HTTP Proxy';
      
      connectionMethodSelect.appendChild(autoOption);
      connectionMethodSelect.appendChild(websocketOption);
      connectionMethodSelect.appendChild(directOption);
      connectionMethodSelect.appendChild(proxyOption);
      
      connectionMethodGroup.appendChild(connectionMethodLabel);
      connectionMethodGroup.appendChild(connectionMethodSelect);
      
      form.appendChild(connectionMethodGroup);
      
      // Caster host
      const hostGroup = document.createElement('div');
      hostGroup.className = 'form-group';
      
      const hostLabel = document.createElement('label');
      hostLabel.htmlFor = 'rtk-caster-host';
      hostLabel.textContent = 'NTRIP Caster Host';
      
      const hostInput = document.createElement('input');
      hostInput.type = 'text';
      hostInput.id = 'rtk-caster-host';
      hostInput.placeholder = 'caster.example.com';
      
      hostGroup.appendChild(hostLabel);
      hostGroup.appendChild(hostInput);
      
      form.appendChild(hostGroup);
      
      // Caster port
      const portGroup = document.createElement('div');
      portGroup.className = 'form-group';
      
      const portLabel = document.createElement('label');
      portLabel.htmlFor = 'rtk-caster-port';
      portLabel.textContent = 'NTRIP Caster Port';
      
      const portInput = document.createElement('input');
      portInput.type = 'number';
      portInput.id = 'rtk-caster-port';
      portInput.value = 2101;
      
      portGroup.appendChild(portLabel);
      portGroup.appendChild(portInput);
      
      form.appendChild(portGroup);
      
      // Mountpoint
      const mountpointGroup = document.createElement('div');
      mountpointGroup.className = 'form-group';
      
      const mountpointLabel = document.createElement('label');
      mountpointLabel.htmlFor = 'rtk-mountpoint';
      mountpointLabel.textContent = 'Mountpoint';
      
      const mountpointInput = document.createElement('input');
      mountpointInput.type = 'text';
      mountpointInput.id = 'rtk-mountpoint';
      mountpointInput.placeholder = 'MOUNTPOINT';
      
      mountpointGroup.appendChild(mountpointLabel);
      mountpointGroup.appendChild(mountpointInput);
      
      form.appendChild(mountpointGroup);
      
      // Username
      const usernameGroup = document.createElement('div');
      usernameGroup.className = 'form-group';
      
      const usernameLabel = document.createElement('label');
      usernameLabel.htmlFor = 'rtk-username';
      usernameLabel.textContent = 'Username';
      
      const usernameInput = document.createElement('input');
      usernameInput.type = 'text';
      usernameInput.id = 'rtk-username';
      usernameInput.placeholder = 'username (optional)';
      
      usernameGroup.appendChild(usernameLabel);
      usernameGroup.appendChild(usernameInput);
      
      form.appendChild(usernameGroup);
      
      // Password
      const passwordGroup = document.createElement('div');
      passwordGroup.className = 'form-group';
      
      const passwordLabel = document.createElement('label');
      passwordLabel.htmlFor = 'rtk-password';
      passwordLabel.textContent = 'Password';
      
      const passwordInput = document.createElement('input');
      passwordInput.type = 'password';
      passwordInput.id = 'rtk-password';
      passwordInput.placeholder = 'password (optional)';
      
      passwordGroup.appendChild(passwordLabel);
      passwordGroup.appendChild(passwordInput);
      
      form.appendChild(passwordGroup);
      
      // Send GGA toggle
      const ggaGroup = document.createElement('div');
      ggaGroup.className = 'form-group';
      
      const ggaLabel = document.createElement('label');
      ggaLabel.htmlFor = 'rtk-send-gga';
      ggaLabel.className = 'rtk-toggle';
      
      const ggaInput = document.createElement('input');
      ggaInput.type = 'checkbox';
      ggaInput.id = 'rtk-send-gga';
      ggaInput.checked = true;
      
      const ggaSlider = document.createElement('span');
      ggaSlider.className = 'rtk-toggle-slider';
      
      ggaLabel.appendChild(ggaInput);
      ggaLabel.appendChild(ggaSlider);
      
      const ggaText = document.createElement('span');
      ggaText.textContent = 'Send position to caster (GGA)';
      
      ggaGroup.appendChild(ggaLabel);
      ggaGroup.appendChild(ggaText);
      
      form.appendChild(ggaGroup);
      
      // GGA update interval
      const ggaIntervalGroup = document.createElement('div');
      ggaIntervalGroup.className = 'form-group';
      
      const ggaIntervalLabel = document.createElement('label');
      ggaIntervalLabel.htmlFor = 'rtk-gga-interval';
      ggaIntervalLabel.textContent = 'GGA Update Interval (seconds)';
      
      const ggaIntervalInput = document.createElement('input');
      ggaIntervalInput.type = 'number';
      ggaIntervalInput.id = 'rtk-gga-interval';
      ggaIntervalInput.min = 1;
      ggaIntervalInput.max = 60;
      ggaIntervalInput.value = 10;
      
      ggaIntervalGroup.appendChild(ggaIntervalLabel);
      ggaIntervalGroup.appendChild(ggaIntervalInput);
      
      form.appendChild(ggaIntervalGroup);
      
      // Auto reconnect toggle
      const reconnectGroup = document.createElement('div');
      reconnectGroup.className = 'form-group';
      
      const reconnectLabel = document.createElement('label');
      reconnectLabel.htmlFor = 'rtk-auto-reconnect';
      reconnectLabel.className = 'rtk-toggle';
      
      const reconnectInput = document.createElement('input');
      reconnectInput.type = 'checkbox';
      reconnectInput.id = 'rtk-auto-reconnect';
      reconnectInput.checked = true;
      
      const reconnectSlider = document.createElement('span');
      reconnectSlider.className = 'rtk-toggle-slider';
      
      reconnectLabel.appendChild(reconnectInput);
      reconnectLabel.appendChild(reconnectSlider);
      
      const reconnectText = document.createElement('span');
      reconnectText.textContent = 'Auto reconnect on disconnect';
      
      reconnectGroup.appendChild(reconnectLabel);
      reconnectGroup.appendChild(reconnectText);
      
      form.appendChild(reconnectGroup);
      
      settingsContainer.appendChild(form);
      
      // Create status display
      const statusDisplay = document.createElement('div');
      statusDisplay.className = 'rtk-status-display';
      
      const statusIndicator = document.createElement('div');
      statusIndicator.className = 'rtk-status-indicator disconnected';
      
      const statusText = document.createElement('div');
      statusText.textContent = 'Not connected';
      
      statusDisplay.appendChild(statusIndicator);
      statusDisplay.appendChild(statusText);
      
      // Correction statistics
      const correctionStats = document.createElement('div');
      correctionStats.className = 'rtk-correction-stats';
      correctionStats.style.display = 'none';
      
      const messagesReceived = document.createElement('div');
      messagesReceived.textContent = 'Messages received: 0';
      
      const correctionAge = document.createElement('div');
      correctionAge.textContent = 'Correction age: N/A';
      
      const bytesReceived = document.createElement('div');
      bytesReceived.textContent = 'Bytes received: 0';
      
      correctionStats.appendChild(messagesReceived);
      correctionStats.appendChild(correctionAge);
      correctionStats.appendChild(bytesReceived);
      
      statusDisplay.appendChild(correctionStats);
      
      settingsContainer.appendChild(statusDisplay);
      
      // Create action buttons
      const actions = document.createElement('div');
      actions.className = 'rtk-settings-actions';
      
      const saveButton = document.createElement('button');
      saveButton.type = 'button';
      saveButton.className = 'rtk-button secondary';
      saveButton.textContent = 'Save Settings';
      
      const connectButton = document.createElement('button');
      connectButton.type = 'button';
      connectButton.className = 'rtk-button primary';
      connectButton.textContent = 'Connect';
      
      const disconnectButton = document.createElement('button');
      disconnectButton.type = 'button';
      disconnectButton.className = 'rtk-button danger';
      disconnectButton.textContent = 'Disconnect';
      disconnectButton.style.display = 'none';
      
      actions.appendChild(saveButton);
      actions.appendChild(connectButton);
      actions.appendChild(disconnectButton);
      
      settingsContainer.appendChild(actions);
      
      // Add to container
      this.container.appendChild(settingsContainer);
      
      // Store references to elements
      this.elements = {
        enableToggle: toggleInput,
        connectionMethod: connectionMethodSelect,
        casterHost: hostInput,
        casterPort: portInput,
        mountpoint: mountpointInput,
        username: usernameInput,
        password: passwordInput,
        sendGga: ggaInput,
        ggaInterval: ggaIntervalInput,
        autoReconnect: reconnectInput,
        saveButton,
        connectButton,
        disconnectButton,
        statusIndicator,
        statusText,
        correctionStats,
        messagesReceived,
        correctionAge,
        bytesReceived
      };
      
      // Disable form if RTK is disabled
      this.updateFormState();
    }

    /**
     * Set up UI event listeners
     */
    setupEventListeners() {
      if (!this.elements) {
        console.warn('RtkSettings: No UI elements found. Event listeners not set up.');
        return;
      }
      
      // Safely add event listener to an element if it exists
      const safeAddListener = (elementKey, eventType, handler) => {
        const element = this.elements[elementKey];
        if (element) {
          element.addEventListener(eventType, handler);
        } else {
          console.warn(`RtkSettings: Element ${elementKey} not found`);
        }
      };
      
      // Enable/disable toggle
      safeAddListener('enableToggle', 'change', () => {
        this.updateFormState();
      });
      
      // Connect button
      safeAddListener('connectButton', 'click', () => {
        this.connect();
      });
      
      // Disconnect button
      safeAddListener('disconnectButton', 'click', () => {
        this.disconnect();
      });
      
      // Save settings button
      safeAddListener('saveButton', 'click', () => {
        this.saveConfig();
      });
    }

    /**
     * Register event listeners for GNSS events
     */
    registerEventListeners() {
      if (!this.events) {
        console.warn('RtkSettings: No events emitter provided. Settings will not update.');
        return;
      }
      
      // Connection status change events
      this.events.on('ntrip:connecting', this.handleConnecting.bind(this));
      this.events.on('ntrip:connected', this.handleConnected.bind(this));
      this.events.on('ntrip:disconnected', this.handleDisconnected.bind(this));
      this.events.on('ntrip:error', this.handleError.bind(this));
      
      // Data statistics
      this.events.on('ntrip:rtcm', this.handleRtcmData.bind(this));
      
      // Handle position updates
      this.events.on('position', this.handlePosition.bind(this));
      
      // Update status periodically
      setInterval(() => {
        this.updateStats();
      }, 1000);
    }

    /**
     * Handle connecting event
     * @param {Object} data - Event data
     */
    handleConnecting(data) {
      this.isConnecting = true;
      this.isConnected = false;
      
      this.elements.statusIndicator.className = 'rtk-status-indicator connecting';
      this.elements.statusText.textContent = 'Connecting...';
      
      this.elements.connectButton.disabled = true;
      this.elements.disconnectButton.disabled = true;
      
      this.updateButtonVisibility();
    }

    /**
     * Handle connected event
     * @param {Object} data - Event data
     */
    handleConnected(data) {
      this.isConnecting = false;
      this.isConnected = true;
      
      this.elements.statusIndicator.className = 'rtk-status-indicator connected';
      
      // Check if GGA position is required
      if (data.requiresGga) {
        this.elements.statusText.textContent = `Connected to ${data.mountpoint} (${data.mode}) - GGA position required`;
        
        // Make sure GGA is enabled
        if (!this.elements.sendGga.checked) {
          this.elements.sendGga.checked = true;
          
          // Update the config
          if (this.gnss.ntripClient) {
            this.gnss.ntripClient.config.sendGga = true;
          }
          
          // Show info message
          console.log('GGA position sharing enabled automatically because the NTRIP caster requires it');
        }
        
        // Force a position update if we have one
        if (this.gnss.lastPosition) {
          setTimeout(() => {
            console.log('Sending initial GGA position to NTRIP caster');
            this.gnss.updateNtripPosition(this.gnss.lastPosition);
          }, 500);
        }
      } else {
        this.elements.statusText.textContent = `Connected to ${data.mountpoint} (${data.mode})`;
      }
      
      this.elements.connectButton.disabled = false;
      this.elements.disconnectButton.disabled = false;
      
      this.elements.correctionStats.style.display = 'block';
      
      this.updateButtonVisibility();
    }

    /**
     * Handle disconnected event
     * @param {Object} data - Event data
     */
    handleDisconnected(data) {
      this.isConnecting = false;
      this.isConnected = false;
      
      this.elements.statusIndicator.className = 'rtk-status-indicator disconnected';
      this.elements.statusText.textContent = `Disconnected: ${data.reason || 'Unknown reason'}`;
      
      this.elements.connectButton.disabled = false;
      this.elements.disconnectButton.disabled = true;
      
      this.updateButtonVisibility();
    }

    /**
     * Handle error event
     * @param {Object} data - Event data
     */
    handleError(data) {
      this.elements.statusIndicator.className = 'rtk-status-indicator error';
      this.elements.statusText.textContent = `Error: ${data.message}`;
      
      if (this.isConnecting) {
        this.isConnecting = false;
        this.elements.connectButton.disabled = false;
        this.elements.disconnectButton.disabled = true;
        
        this.updateButtonVisibility();
      }
    }

    /**
     * Handle RTCM data event
     * @param {Object} data - Event data
     */
    handleRtcmData(data) {
      if (!data.stats) return;
      
      const stats = data.stats;
      
      this.elements.messagesReceived.textContent = `Messages received: ${stats.messagesReceived}`;
      this.elements.bytesReceived.textContent = `Bytes received: ${this.formatBytes(stats.bytesReceived)}`;
      
      if (stats.correctionAge !== null) {
        this.elements.correctionAge.textContent = `Correction age: ${stats.correctionAge.toFixed(1)}s`;
      }
    }

    /**
     * Handle position update
     * @param {Object} position - Position data
     */
    handlePosition(position) {
      // Nothing to do for now, but we might want to update something in the UI later
    }

    /**
     * Format bytes to human-readable format
     * @param {number} bytes - Number of bytes
     * @returns {string} Formatted string
     */
    formatBytes(bytes) {
      if (bytes < 1024) {
        return `${bytes} B`;
      } else if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
      } else {
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
      }
    }

    /**
     * Update RTCM statistics
     */
    updateStats() {
      // Only update if connected
      if (!this.isConnected || !this.gnss.ntripClient) return;
      
      const stats = this.gnss.ntripClient.getRtcmStats();
      
      if (stats) {
        // Update correction age if available
        if (stats.correctionAge !== null) {
          this.elements.correctionAge.textContent = `Correction age: ${stats.correctionAge.toFixed(1)}s`;
          
          // Highlight old corrections
          if (stats.correctionAge > 10) {
            this.elements.correctionAge.style.color = '#f44336';
          } else if (stats.correctionAge > 5) {
            this.elements.correctionAge.style.color = '#ff9800';
          } else {
            this.elements.correctionAge.style.color = '#666';
          }
        }
      }
    }

    /**
     * Update form state based on enable toggle
     */
    updateFormState() {
      const enabled = this.elements.enableToggle.checked;
      
      // Enable/disable form elements
      const formElements = [
        this.elements.connectionMethod,
        this.elements.casterHost,
        this.elements.casterPort,
        this.elements.mountpoint,
        this.elements.username,
        this.elements.password,
        this.elements.sendGga,
        this.elements.ggaInterval,
        this.elements.autoReconnect
      ];
      
      formElements.forEach(element => {
        element.disabled = !enabled;
      });
      
      // Enable/disable buttons
      this.elements.saveButton.disabled = !enabled;
      this.elements.connectButton.disabled = !enabled || this.isConnected;
      
      // Update button visibility
      this.updateButtonVisibility();
    }

    /**
     * Update button visibility based on connection state
     */
    updateButtonVisibility() {
      // Show/hide connect/disconnect buttons
      if (this.isConnected) {
        this.elements.connectButton.style.display = 'none';
        this.elements.disconnectButton.style.display = 'block';
      } else {
        this.elements.connectButton.style.display = 'block';
        this.elements.disconnectButton.style.display = 'none';
      }
    }

    /**
     * Load saved configuration from settings
     */
    loadSavedConfig() {
      if (!this.settings || !this.settings.rtk || !this.elements) return;
      
      const rtkSettings = this.settings.rtk;
      
      // Safely set value if the element exists
      const safeSetValue = (elementKey, value) => {
        const element = this.elements[elementKey];
        if (element) {
          if (typeof element.checked !== 'undefined') {
            element.checked = Boolean(value);
          } else {
            element.value = value || '';
          }
        }
      };
      
      // Update UI elements
      safeSetValue('enableToggle', rtkSettings.enabled);
      safeSetValue('connectionMethod', rtkSettings.connectionMode || 'auto');
      safeSetValue('casterHost', rtkSettings.casterHost || '');
      safeSetValue('casterPort', rtkSettings.casterPort || 2101);
      safeSetValue('mountpoint', rtkSettings.mountpoint || '');
      safeSetValue('username', rtkSettings.username || '');
      // We don't restore password for security reasons
      safeSetValue('sendGga', rtkSettings.sendGga !== undefined ? rtkSettings.sendGga : true);
      safeSetValue('ggaInterval', rtkSettings.ggaUpdateInterval || 10);
      safeSetValue('autoReconnect', rtkSettings.autoReconnect !== undefined ? rtkSettings.autoReconnect : true);
      
      // Update form state
      this.updateFormState();
    }

    /**
     * Save configuration to settings
     */
    saveConfig() {
      if (!this.settings || !this.elements) return;
      
      // Safely get value from an element if it exists
      const safeGetValue = (elementKey, defaultValue = '') => {
        const element = this.elements[elementKey];
        if (!element) return defaultValue;
        
        if (typeof element.checked !== 'undefined') {
          return element.checked;
        } else {
          return element.value || defaultValue;
        }
      };
      
      // Get values from form
      const config = {
        enabled: safeGetValue('enableToggle', false),
        connectionMode: safeGetValue('connectionMethod', 'auto'),
        casterHost: safeGetValue('casterHost', ''),
        casterPort: parseInt(safeGetValue('casterPort', '2101')) || 2101,
        mountpoint: safeGetValue('mountpoint', ''),
        username: safeGetValue('username', ''),
        password: safeGetValue('password', ''),
        sendGga: safeGetValue('sendGga', true),
        ggaUpdateInterval: parseInt(safeGetValue('ggaInterval', '10')) || 10,
        autoReconnect: safeGetValue('autoReconnect', true)
      };
      
      // Save to settings
      if (this.settings) {
        this.settings.rtk = config;
        this.settings.save();
      }
      
      // Emit settings update event
      if (this.events) {
        this.events.emit('rtk:settings:update', config);
      }
      
      // If RTK is disabled but we're connected, disconnect
      if (!config.enabled && this.isConnected) {
        this.disconnect();
      }
    }

    /**
     * Connect to NTRIP caster
     */
    async connect() {
      if (this.isConnected || this.isConnecting) return;
      
      // Get config from form
      const config = {
        connectionMode: this.elements.connectionMethod.value,
        casterHost: this.elements.casterHost.value,
        casterPort: parseInt(this.elements.casterPort.value) || 2101,
        mountpoint: this.elements.mountpoint.value,
        username: this.elements.username.value,
        password: this.elements.password.value,
        sendGga: this.elements.sendGga.checked,
        ggaUpdateInterval: parseInt(this.elements.ggaInterval.value) || 10,
        autoReconnect: this.elements.autoReconnect.checked
      };
      
      // Validate config
      if (!config.casterHost) {
        this.handleError({ message: 'Caster host is required' });
        return;
      }
      
      if (!config.mountpoint) {
        this.handleError({ message: 'Mountpoint is required' });
        return;
      }
      
      // Emit connect event
      if (this.events) {
        this.events.emit('rtk:connect', config);
      }
    }

    /**
     * Disconnect from NTRIP caster
     */
    disconnect() {
      if (!this.isConnected) return;
      
      // Emit disconnect event
      if (this.events) {
        this.events.emit('rtk:disconnect');
      }
    }
  }

  /**
   * RTK Status UI Component
   * 
   * This component displays the current RTK fix status, including fix quality,
   * satellite information, and correction data status.
   */
  class RtkStatus {
    /**
     * Create an RTK status component
     * @param {Object} options - Configuration options
     * @param {EventEmitter} options.events - Event emitter for communication
     * @param {string} options.selector - CSS selector for the container element
     */
    constructor(options = {}) {
      this.events = options.events;
      
      // Find container element if selector provided
      if (options.selector) {
        this.container = document.querySelector(options.selector);
      }
      
      // If no container, don't initialize UI
      if (!this.container) {
        console.warn('RtkStatus: No container element found. UI will not be initialized.');
        return;
      }
      
      // Current status information
      this.fixQuality = 0;
      this.satellitesUsed = 0;
      this.rtkMode = 'none'; // 'none', 'float', 'fixed'
      this.correctionAge = null;
      this.messagesReceived = 0;
      this.ggaRequired = false;
      this.ntripConnected = false;
      
      // Add CSS for proper styling
      this.addStyles();
      
      // Initialize UI
      this.initializeUI();
      
      // Register event listeners
      this.registerEventListeners();
      
      // Update status immediately
      this.updateStatus();
    }

    /**
     * Add required CSS styles to the document
     */
    addStyles() {
      // Check if styles already exist
      if (document.getElementById('rtk-status-styles')) {
        return;
      }
      
      // Create style element
      const style = document.createElement('style');
      style.id = 'rtk-status-styles';
      style.textContent = `
      .rtk-status-container {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
        background-color: #f7f7f7;
        border-radius: 5px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        padding: 12px;
        margin-bottom: 15px;
      }
      
      .rtk-status-header {
        display: flex;
        align-items: center;
        margin-bottom: 8px;
      }
      
      .rtk-indicator {
        display: flex;
        align-items: center;
        font-weight: 500;
      }
      
      .rtk-indicator-icon {
        width: 14px;
        height: 14px;
        border-radius: 50%;
        margin-right: 8px;
      }
      
      .rtk-indicator-icon.no-fix { background-color: #9e9e9e; }
      .rtk-indicator-icon.autonomous { background-color: #ffcc00; }
      .rtk-indicator-icon.dgps { background-color: #ff9800; }
      .rtk-indicator-icon.rtk-float { background-color: #2196f3; }
      .rtk-indicator-icon.rtk-fixed { background-color: #4caf50; }
      
      .rtk-status-details {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-top: 10px;
        font-size: 13px;
      }
      
      .rtk-status-detail {
        display: flex;
        align-items: center;
      }
      
      .rtk-status-detail-icon {
        width: 12px;
        height: 12px;
        margin-right: 6px;
        opacity: 0.7;
      }
      
      .rtk-status-detail-label {
        color: #666;
        margin-right: 5px;
      }
      
      .rtk-status-detail-value {
        font-weight: 500;
      }
      
      .rtk-status-correction-age {
        color: #666;
      }
      
      .rtk-status-correction-age.stale {
        color: #ff9800;
      }
      
      .rtk-status-correction-age.old {
        color: #f44336;
      }
      
      .rtk-satellite-indicator {
        margin-top: 5px;
        height: 4px;
        display: flex;
        gap: 2px;
      }
      
      .rtk-satellite-bar {
        flex: 1;
        background-color: #e0e0e0;
        border-radius: 2px;
      }
      
      .rtk-satellite-bar.used {
        background-color: #4caf50;
      }
      
      @media (max-width: 480px) {
        .rtk-status-details {
          grid-template-columns: 1fr;
        }
      }
    `;
      
      // Add style to document
      document.head.appendChild(style);
    }

    /**
     * Initialize the UI elements
     */
    initializeUI() {
      if (!this.container) return;
      
      // Clear container
      this.container.innerHTML = '';
      
      // Create main container
      const statusContainer = document.createElement('div');
      statusContainer.className = 'rtk-status-container';
      
      // Create header with main indicator
      const header = document.createElement('div');
      header.className = 'rtk-status-header';
      
      // Create status indicator
      const indicator = document.createElement('div');
      indicator.className = 'rtk-indicator';
      
      const indicatorIcon = document.createElement('div');
      indicatorIcon.className = 'rtk-indicator-icon no-fix';
      
      const indicatorText = document.createElement('div');
      indicatorText.textContent = 'No Fix';
      
      indicator.appendChild(indicatorIcon);
      indicator.appendChild(indicatorText);
      
      header.appendChild(indicator);
      statusContainer.appendChild(header);
      
      // Create satellite indicator
      const satelliteIndicator = document.createElement('div');
      satelliteIndicator.className = 'rtk-satellite-indicator';
      
      // Create bars for satellites (up to 20)
      for (let i = 0; i < 20; i++) {
        const bar = document.createElement('div');
        bar.className = 'rtk-satellite-bar';
        satelliteIndicator.appendChild(bar);
      }
      
      statusContainer.appendChild(satelliteIndicator);
      
      // Create status details
      const details = document.createElement('div');
      details.className = 'rtk-status-details';
      
      // Satellites
      const satellitesDetail = document.createElement('div');
      satellitesDetail.className = 'rtk-status-detail';
      
      const satellitesIcon = document.createElement('div');
      satellitesIcon.className = 'rtk-status-detail-icon';
      satellitesIcon.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M5,18L8.5,13.5L11,16.5L14.5,12L19,18H5M5,12V10A5,5 0 0,1 10,5H12V3L16,6L12,9V7H10A3,3 0 0,0 7,10V12H5Z" /></svg>`;
      
      const satellitesLabel = document.createElement('div');
      satellitesLabel.className = 'rtk-status-detail-label';
      satellitesLabel.textContent = 'Satellites:';
      
      const satellitesValue = document.createElement('div');
      satellitesValue.className = 'rtk-status-detail-value';
      satellitesValue.textContent = '0';
      
      satellitesDetail.appendChild(satellitesIcon);
      satellitesDetail.appendChild(satellitesLabel);
      satellitesDetail.appendChild(satellitesValue);
      
      details.appendChild(satellitesDetail);
      
      // Mode
      const modeDetail = document.createElement('div');
      modeDetail.className = 'rtk-status-detail';
      
      const modeIcon = document.createElement('div');
      modeIcon.className = 'rtk-status-detail-icon';
      modeIcon.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8M12,10A2,2 0 0,0 10,12A2,2 0 0,0 12,14A2,2 0 0,0 14,12A2,2 0 0,0 12,10M10,22C9.75,22 9.54,21.82 9.5,21.58L9.13,18.93C8.5,18.68 7.96,18.34 7.44,17.94L4.95,18.95C4.73,19.03 4.46,18.95 4.34,18.73L2.34,15.27C2.21,15.05 2.27,14.78 2.46,14.63L4.57,12.97L4.5,12L4.57,11L2.46,9.37C2.27,9.22 2.21,8.95 2.34,8.73L4.34,5.27C4.46,5.05 4.73,4.96 4.95,5.05L7.44,6.05C7.96,5.66 8.5,5.32 9.13,5.07L9.5,2.42C9.54,2.18 9.75,2 10,2H14C14.25,2 14.46,2.18 14.5,2.42L14.87,5.07C15.5,5.32 16.04,5.66 16.56,6.05L19.05,5.05C19.27,4.96 19.54,5.05 19.66,5.27L21.66,8.73C21.79,8.95 21.73,9.22 21.54,9.37L19.43,11L19.5,12L19.43,13L21.54,14.63C21.73,14.78 21.79,15.05 21.66,15.27L19.66,18.73C19.54,18.95 19.27,19.04 19.05,18.95L16.56,17.95C16.04,18.34 15.5,18.68 14.87,18.93L14.5,21.58C14.46,21.82 14.25,22 14,22H10M11.25,4L10.88,6.61C9.68,6.86 8.62,7.5 7.85,8.39L5.44,7.35L4.69,8.65L6.8,10.2C6.4,11.37 6.4,12.64 6.8,13.8L4.68,15.36L5.43,16.66L7.86,15.62C8.63,16.5 9.68,17.14 10.87,17.38L11.24,20H12.76L13.13,17.39C14.32,17.14 15.37,16.5 16.14,15.62L18.57,16.66L19.32,15.36L17.2,13.81C17.6,12.64 17.6,11.37 17.2,10.2L19.31,8.65L18.56,7.35L16.15,8.39C15.38,7.5 14.32,6.86 13.12,6.62L12.75,4H11.25Z" /></svg>`;
      
      const modeLabel = document.createElement('div');
      modeLabel.className = 'rtk-status-detail-label';
      modeLabel.textContent = 'Mode:';
      
      const modeValue = document.createElement('div');
      modeValue.className = 'rtk-status-detail-value';
      modeValue.textContent = 'None';
      
      modeDetail.appendChild(modeIcon);
      modeDetail.appendChild(modeLabel);
      modeDetail.appendChild(modeValue);
      
      details.appendChild(modeDetail);
      
      // Correction age
      const correctionDetail = document.createElement('div');
      correctionDetail.className = 'rtk-status-detail';
      
      const correctionIcon = document.createElement('div');
      correctionIcon.className = 'rtk-status-detail-icon';
      correctionIcon.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M19,22H5V20H19V22M17,10C15.58,10 14.26,10.77 13.55,12H13V7H16V5H13V2H11V5H8V7H11V12H10.45C9.74,10.77 8.42,10 7,10A4,4 0 0,0 3,14A4,4 0 0,0 7,18C8.42,18 9.74,17.23 10.45,16H13.55C14.26,17.23 15.58,18 17,18A4,4 0 0,0 21,14A4,4 0 0,0 17,10M7,16A2,2 0 0,1 5,14A2,2 0 0,1 7,12A2,2 0 0,1 9,14A2,2 0 0,1 7,16M17,16A2,2 0 0,1 15,14A2,2 0 0,1 17,12A2,2 0 0,1 19,14A2,2 0 0,1 17,16Z" /></svg>`;
      
      const correctionLabel = document.createElement('div');
      correctionLabel.className = 'rtk-status-detail-label';
      correctionLabel.textContent = 'Correction:';
      
      const correctionValue = document.createElement('div');
      correctionValue.className = 'rtk-status-detail-value rtk-status-correction-age';
      correctionValue.textContent = 'N/A';
      
      correctionDetail.appendChild(correctionIcon);
      correctionDetail.appendChild(correctionLabel);
      correctionDetail.appendChild(correctionValue);
      
      details.appendChild(correctionDetail);
      
      // Messages
      const messagesDetail = document.createElement('div');
      messagesDetail.className = 'rtk-status-detail';
      
      const messagesIcon = document.createElement('div');
      messagesIcon.className = 'rtk-status-detail-icon';
      messagesIcon.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M17,12V3A1,1 0 0,0 16,2H3A1,1 0 0,0 2,3V17L6,13H16A1,1 0 0,0 17,12M21,6H19V15H6V17A1,1 0 0,0 7,18H18L22,22V7A1,1 0 0,0 21,6Z" /></svg>`;
      
      const messagesLabel = document.createElement('div');
      messagesLabel.className = 'rtk-status-detail-label';
      messagesLabel.textContent = 'Messages:';
      
      const messagesValue = document.createElement('div');
      messagesValue.className = 'rtk-status-detail-value';
      messagesValue.textContent = '0';
      
      messagesDetail.appendChild(messagesIcon);
      messagesDetail.appendChild(messagesLabel);
      messagesDetail.appendChild(messagesValue);
      
      details.appendChild(messagesDetail);
      
      statusContainer.appendChild(details);
      
      // Add to container
      this.container.appendChild(statusContainer);
      
      // Store references to elements
      this.elements = {
        indicatorIcon,
        indicatorText,
        satelliteIndicator,
        satellitesValue,
        modeValue,
        correctionValue,
        messagesValue
      };
    }

    /**
     * Register event listeners for GNSS and NTRIP events
     */
    registerEventListeners() {
      if (!this.events) {
        console.warn('RtkStatus: No events emitter provided. Status will not update.');
        return;
      }
      
      // GNSS position events
      this.events.on('position', this.handlePosition.bind(this));
      
      // NTRIP correction events
      this.events.on('ntrip:rtcm', this.handleRtcmData.bind(this));
      
      // NTRIP status events
      this.events.on('ntrip:connected', this.handleNtripConnected.bind(this));
      this.events.on('ntrip:disconnected', this.handleNtripDisconnected.bind(this));
      
      // Update status periodically
      setInterval(() => {
        this.updateStatus();
      }, 1000);
    }

    /**
     * Handle position update event
     * @param {Object} position - Position data
     */
    handlePosition(position) {
      // Update satellites used
      if (position.satellites !== undefined) {
        this.satellitesUsed = position.satellites;
      }
      
      // Update fix quality
      if (position.quality !== undefined) {
        this.fixQuality = position.quality;
      }
      
      // Update UI
      this.updateStatus();
    }

    /**
     * Handle RTCM data event
     * @param {Object} data - RTCM data and stats
     */
    handleRtcmData(data) {
      if (!data.stats) return;
      
      // Update message count
      this.messagesReceived = data.stats.messagesReceived;
      
      // Update correction age
      if (data.stats.correctionAge !== undefined) {
        this.correctionAge = data.stats.correctionAge;
      }
      
      // Update UI
      this.updateStatus();
    }

    /**
     * Handle NTRIP connected event
     * @param {Object} data - Connection data
     */
    handleNtripConnected(data) {
      // Reset stats
      this.messagesReceived = 0;
      this.correctionAge = null;
      this.ntripConnected = true;
      
      // Check if GGA is required
      if (data.requiresGga) {
        this.ggaRequired = true;
        
        // If we have a position, make sure it's sent to NTRIP
        if (this.gnss.lastPosition && this.gnss.ntripClient) {
          setTimeout(() => {
            this.gnss.updateNtripPosition(this.gnss.lastPosition);
          }, 500);
        }
      }
      
      // Update UI
      this.updateStatus();
    }

    /**
     * Handle NTRIP disconnected event
     * @param {Object} data - Disconnection data
     */
    handleNtripDisconnected(data) {
      // Clear correction age
      this.correctionAge = null;
      this.ntripConnected = false;
      this.ggaRequired = false;
      
      // Update UI
      this.updateStatus();
    }

    /**
     * Update the status display
     */
    updateStatus() {
      if (!this.elements) return;
      
      // Update fix quality indicator
      this.updateFixQualityIndicator();
      
      // Update satellite count
      this.elements.satellitesValue.textContent = this.satellitesUsed.toString();
      
      // Update satellite bars
      this.updateSatelliteBars();
      
      // Update RTK mode
      this.elements.modeValue.textContent = this.getRtkModeName();
      
      // Update correction age
      if (this.correctionAge !== null) {
        this.elements.correctionValue.textContent = `${this.correctionAge.toFixed(1)}s`;
        
        // Highlight old corrections
        if (this.correctionAge > 10) {
          this.elements.correctionValue.className = 'rtk-status-detail-value rtk-status-correction-age old';
        } else if (this.correctionAge > 5) {
          this.elements.correctionValue.className = 'rtk-status-detail-value rtk-status-correction-age stale';
        } else {
          this.elements.correctionValue.className = 'rtk-status-detail-value rtk-status-correction-age';
        }
      } else if (this.ntripConnected && this.ggaRequired) {
        // Special message if connected to NTRIP but no corrections received and GGA is required
        this.elements.correctionValue.textContent = 'Waiting for GGA';
        this.elements.correctionValue.className = 'rtk-status-detail-value rtk-status-correction-age stale';
      } else if (this.ntripConnected) {
        this.elements.correctionValue.textContent = 'Waiting for data';
        this.elements.correctionValue.className = 'rtk-status-detail-value rtk-status-correction-age';
      } else {
        this.elements.correctionValue.textContent = 'N/A';
        this.elements.correctionValue.className = 'rtk-status-detail-value rtk-status-correction-age';
      }
      
      // Update message count
      this.elements.messagesValue.textContent = this.messagesReceived.toString();
    }

    /**
     * Update the fix quality indicator
     */
    updateFixQualityIndicator() {
      let indicatorClass = 'no-fix';
      let indicatorText = 'No Fix';
      
      switch (this.fixQuality) {
        case 1:
          indicatorClass = 'autonomous';
          indicatorText = 'Autonomous Fix';
          this.rtkMode = 'none';
          break;
        case 2:
          indicatorClass = 'dgps';
          indicatorText = 'DGPS';
          this.rtkMode = 'none';
          break;
        case 4:
          indicatorClass = 'rtk-fixed';
          indicatorText = 'RTK Fixed';
          this.rtkMode = 'fixed';
          break;
        case 5:
          indicatorClass = 'rtk-float';
          indicatorText = 'RTK Float';
          this.rtkMode = 'float';
          break;
        default:
          indicatorClass = 'no-fix';
          indicatorText = 'No Fix';
          this.rtkMode = 'none';
          break;
      }
      
      this.elements.indicatorIcon.className = `rtk-indicator-icon ${indicatorClass}`;
      this.elements.indicatorText.textContent = indicatorText;
    }

    /**
     * Update the satellite bars
     */
    updateSatelliteBars() {
      // Get all satellite bars
      const bars = this.elements.satelliteIndicator.children;
      
      // Update up to the available satellites
      for (let i = 0; i < bars.length; i++) {
        if (i < this.satellitesUsed) {
          bars[i].className = 'rtk-satellite-bar used';
        } else {
          bars[i].className = 'rtk-satellite-bar';
        }
      }
    }

    /**
     * Get RTK mode name
     * @returns {string} RTK mode name
     */
    getRtkModeName() {
      switch (this.rtkMode) {
        case 'fixed':
          return 'RTK Fixed';
        case 'float':
          return 'RTK Float';
        default:
          return 'Standalone';
      }
    }
  }

  /**
   * DeviceSettings - UI component for configuring device-specific parameters
   * This component allows users to configure and save parameters specific
   * to their GNSS device.
   */
  class DeviceSettings {
    /**
     * Create a device settings component
     * @param {Object} options - Configuration options
     * @param {EventEmitter} options.events - Event emitter for communication
     * @param {Settings} options.settings - Settings manager
     * @param {string} options.selector - CSS selector for the container element
     */
    constructor(options = {}) {
      this.events = options.events;
      this.settings = options.settings;
      this.deviceConnected = false;
      
      // Find container element if selector provided
      if (options.selector) {
        this.container = document.querySelector(options.selector);
      }
      
      // If no container, don't initialize UI
      if (!this.container) {
        console.warn('DeviceSettings: No container element found. UI will not be initialized.');
        return;
      }
      
      // Cache frequently used elements
      this.elements = {};
      
      // Add CSS for styling
      this.addStyles();
      
      // Create UI elements
      this.initializeUI();
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Listen for connection events
      this.registerEventListeners();
      
      // Load saved configuration
      this.loadSavedConfig();
    }

    /**
     * Add required CSS styles to the document
     */
    addStyles() {
      // Check if styles already exist
      if (document.getElementById('device-settings-styles')) {
        return;
      }
      
      // Create style element
      const style = document.createElement('style');
      style.id = 'device-settings-styles';
      style.textContent = `
      .device-settings-container {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif;
        margin: 0 auto;
        padding: 15px;
        background-color: #f7f7f7;
        border-radius: 5px;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
      }
      
      .device-settings-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
        padding-bottom: 10px;
        border-bottom: 1px solid #e0e0e0;
      }
      
      .device-settings-title {
        font-size: 18px;
        font-weight: 500;
        margin: 0;
      }
      
      .device-settings-form {
        display: grid;
        grid-gap: 10px;
      }
      
      .form-group {
        display: flex;
        flex-direction: column;
        margin-bottom: 10px;
      }
      
      .form-group label {
        font-size: 14px;
        color: #555;
        margin-bottom: 5px;
      }
      
      .form-group input, .form-group select {
        padding: 8px 10px;
        border: 1px solid #ccc;
        border-radius: 4px;
        font-size: 14px;
      }
      
      .form-group input:focus, .form-group select:focus {
        outline: none;
        border-color: #4285F4;
        box-shadow: 0 0 0 2px rgba(66, 133, 244, 0.25);
      }
      
      .device-settings-actions {
        display: flex;
        justify-content: space-between;
        margin-top: 15px;
      }
      
      .device-presets {
        margin-bottom: 15px;
        padding: 10px;
        background-color: #f0f0f0;
        border-radius: 4px;
      }
      
      .device-presets h4 {
        margin-top: 0;
        margin-bottom: 8px;
      }
      
      .device-status {
        display: flex;
        align-items: center;
        margin-top: 15px;
        padding: 10px;
        background-color: #f0f0f0;
        border-radius: 4px;
      }
      
      .device-status-indicator {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        margin-right: 8px;
      }
      
      .device-status-indicator.disconnected { background-color: #9e9e9e; }
      .device-status-indicator.connected { background-color: #4caf50; }
      
      .device-button {
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
      }
      
      .device-button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      
      .device-button.primary {
        background-color: #4285F4;
        color: white;
      }
      
      .device-button.secondary {
        background-color: #f1f1f1;
        color: #333;
      }
      
      .help-text {
        font-size: 12px;
        color: #666;
        margin-top: 3px;
      }
      
      @media (min-width: 768px) {
        .device-settings-form {
          grid-template-columns: 1fr 1fr;
          grid-gap: 15px;
        }
      }
    `;
      
      // Add style to document
      document.head.appendChild(style);
    }

    /**
     * Initialize the UI elements
     */
    initializeUI() {
      if (!this.container) return;
      
      // Clear container
      this.container.innerHTML = '';
      
      // Create main container
      const settingsContainer = document.createElement('div');
      settingsContainer.className = 'device-settings-container';
      
      // Create header
      const header = document.createElement('div');
      header.className = 'device-settings-header';
      
      const title = document.createElement('h2');
      title.className = 'device-settings-title';
      title.textContent = 'Device Settings';
      
      header.appendChild(title);
      settingsContainer.appendChild(header);
      
      // Device presets section
      const presets = document.createElement('div');
      presets.className = 'device-presets';
      
      const presetsTitle = document.createElement('h4');
      presetsTitle.textContent = 'Device Presets';
      
      const presetsDescription = document.createElement('p');
      presetsDescription.textContent = 'Select your device model to load recommended settings:';
      
      const presetsSelect = document.createElement('select');
      presetsSelect.id = 'device-preset';
      
      // Add common device presets
      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = '-- Select Device --';
      presetsSelect.appendChild(defaultOption);
      
      const presetUBloxF9P = document.createElement('option');
      presetUBloxF9P.value = 'ublox-f9p';
      presetUBloxF9P.textContent = 'u-blox ZED-F9P';
      presetsSelect.appendChild(presetUBloxF9P);
      
      const presetUBloxM8P = document.createElement('option');
      presetUBloxM8P.value = 'ublox-m8p';
      presetUBloxM8P.textContent = 'u-blox NEO-M8P';
      presetsSelect.appendChild(presetUBloxM8P);
      
      const presetSimpleRTK = document.createElement('option');
      presetSimpleRTK.value = 'simplertk2b';
      presetSimpleRTK.textContent = 'Ardusimple SimpleRTK2B';
      presetsSelect.appendChild(presetSimpleRTK);
      
      const presetCustom = document.createElement('option');
      presetCustom.value = 'custom';
      presetCustom.textContent = 'Custom Device';
      presetsSelect.appendChild(presetCustom);
      
      // Load preset button
      const loadPresetButton = document.createElement('button');
      loadPresetButton.id = 'load-preset';
      loadPresetButton.className = 'device-button secondary';
      loadPresetButton.textContent = 'Load Preset';
      loadPresetButton.style.marginLeft = '10px';
      
      presets.appendChild(presetsTitle);
      presets.appendChild(presetsDescription);
      
      const presetRow = document.createElement('div');
      presetRow.style.display = 'flex';
      presetRow.style.alignItems = 'center';
      presetRow.appendChild(presetsSelect);
      presetRow.appendChild(loadPresetButton);
      
      presets.appendChild(presetRow);
      settingsContainer.appendChild(presets);
      
      // Create form
      const form = document.createElement('form');
      form.className = 'device-settings-form';
      form.id = 'device-settings-form';
      
      // Device name
      const deviceNameGroup = document.createElement('div');
      deviceNameGroup.className = 'form-group';
      
      const deviceNameLabel = document.createElement('label');
      deviceNameLabel.htmlFor = 'device-name';
      deviceNameLabel.textContent = 'Device Name';
      
      const deviceNameInput = document.createElement('input');
      deviceNameInput.type = 'text';
      deviceNameInput.id = 'device-name';
      deviceNameInput.placeholder = 'My GNSS Receiver';
      
      const deviceNameHelp = document.createElement('p');
      deviceNameHelp.className = 'help-text';
      deviceNameHelp.textContent = 'Custom name for this device';
      
      deviceNameGroup.appendChild(deviceNameLabel);
      deviceNameGroup.appendChild(deviceNameInput);
      deviceNameGroup.appendChild(deviceNameHelp);
      
      form.appendChild(deviceNameGroup);
      
      // GNSS Systems
      const gnssSystemsGroup = document.createElement('div');
      gnssSystemsGroup.className = 'form-group';
      
      const gnssSystemsLabel = document.createElement('label');
      gnssSystemsLabel.htmlFor = 'gnss-systems';
      gnssSystemsLabel.textContent = 'GNSS Systems';
      
      const gnssSystemsSelect = document.createElement('select');
      gnssSystemsSelect.id = 'gnss-systems';
      gnssSystemsSelect.multiple = true;
      gnssSystemsSelect.size = 5;
      gnssSystemsSelect.style.height = 'auto';
      
      const gnssGPS = document.createElement('option');
      gnssGPS.value = 'gps';
      gnssGPS.textContent = 'GPS (USA)';
      gnssSystemsSelect.appendChild(gnssGPS);
      
      const gnssGLONASS = document.createElement('option');
      gnssGLONASS.value = 'glonass';
      gnssGLONASS.textContent = 'GLONASS (Russia)';
      gnssSystemsSelect.appendChild(gnssGLONASS);
      
      const gnssGalileo = document.createElement('option');
      gnssGalileo.value = 'galileo';
      gnssGalileo.textContent = 'Galileo (EU)';
      gnssSystemsSelect.appendChild(gnssGalileo);
      
      const gnssBeiDou = document.createElement('option');
      gnssBeiDou.value = 'beidou';
      gnssBeiDou.textContent = 'BeiDou (China)';
      gnssSystemsSelect.appendChild(gnssBeiDou);
      
      const gnssQZSS = document.createElement('option');
      gnssQZSS.value = 'qzss';
      gnssQZSS.textContent = 'QZSS (Japan)';
      gnssSystemsSelect.appendChild(gnssQZSS);
      
      const gnssHelp = document.createElement('p');
      gnssHelp.className = 'help-text';
      gnssHelp.textContent = 'Hold Ctrl/Cmd to select multiple systems';
      
      gnssSystemsGroup.appendChild(gnssSystemsLabel);
      gnssSystemsGroup.appendChild(gnssSystemsSelect);
      gnssSystemsGroup.appendChild(gnssHelp);
      
      form.appendChild(gnssSystemsGroup);
      
      // Baud Rate
      const baudRateGroup = document.createElement('div');
      baudRateGroup.className = 'form-group';
      
      const baudRateLabel = document.createElement('label');
      baudRateLabel.htmlFor = 'baud-rate';
      baudRateLabel.textContent = 'Baud Rate';
      
      const baudRateSelect = document.createElement('select');
      baudRateSelect.id = 'baud-rate';
      
      const baudRates = [4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600];
      baudRates.forEach(rate => {
        const option = document.createElement('option');
        option.value = rate.toString();
        option.textContent = rate.toString();
        if (rate === 115200) {
          option.selected = true;
        }
        baudRateSelect.appendChild(option);
      });
      
      const baudRateHelp = document.createElement('p');
      baudRateHelp.className = 'help-text';
      baudRateHelp.textContent = 'Serial communication speed';
      
      baudRateGroup.appendChild(baudRateLabel);
      baudRateGroup.appendChild(baudRateSelect);
      baudRateGroup.appendChild(baudRateHelp);
      
      form.appendChild(baudRateGroup);
      
      // Output Rate
      const outputRateGroup = document.createElement('div');
      outputRateGroup.className = 'form-group';
      
      const outputRateLabel = document.createElement('label');
      outputRateLabel.htmlFor = 'output-rate';
      outputRateLabel.textContent = 'Output Rate (Hz)';
      
      const outputRateSelect = document.createElement('select');
      outputRateSelect.id = 'output-rate';
      
      const rates = [1, 2, 5, 10, 20];
      rates.forEach(rate => {
        const option = document.createElement('option');
        option.value = rate.toString();
        option.textContent = rate.toString();
        if (rate === 1) {
          option.selected = true;
        }
        outputRateSelect.appendChild(option);
      });
      
      const outputRateHelp = document.createElement('p');
      outputRateHelp.className = 'help-text';
      outputRateHelp.textContent = 'Positioning output frequency';
      
      outputRateGroup.appendChild(outputRateLabel);
      outputRateGroup.appendChild(outputRateSelect);
      outputRateGroup.appendChild(outputRateHelp);
      
      form.appendChild(outputRateGroup);
      
      // Dynamic Model
      const dynamicModelGroup = document.createElement('div');
      dynamicModelGroup.className = 'form-group';
      
      const dynamicModelLabel = document.createElement('label');
      dynamicModelLabel.htmlFor = 'dynamic-model';
      dynamicModelLabel.textContent = 'Dynamic Model';
      
      const dynamicModelSelect = document.createElement('select');
      dynamicModelSelect.id = 'dynamic-model';
      
      const dynamicModels = [
        { value: 'portable', text: 'Portable' },
        { value: 'stationary', text: 'Stationary' },
        { value: 'pedestrian', text: 'Pedestrian' },
        { value: 'automotive', text: 'Automotive' },
        { value: 'sea', text: 'Sea' },
        { value: 'airborne-1g', text: 'Airborne (<1g)' },
        { value: 'airborne-2g', text: 'Airborne (<2g)' },
        { value: 'airborne-4g', text: 'Airborne (<4g)' },
        { value: 'wrist', text: 'Wrist' },
        { value: 'bike', text: 'Bike' }
      ];
      
      dynamicModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.value;
        option.textContent = model.text;
        if (model.value === 'pedestrian') {
          option.selected = true;
        }
        dynamicModelSelect.appendChild(option);
      });
      
      const dynamicModelHelp = document.createElement('p');
      dynamicModelHelp.className = 'help-text';
      dynamicModelHelp.textContent = 'Optimizes positioning for motion type';
      
      dynamicModelGroup.appendChild(dynamicModelLabel);
      dynamicModelGroup.appendChild(dynamicModelSelect);
      dynamicModelGroup.appendChild(dynamicModelHelp);
      
      form.appendChild(dynamicModelGroup);
      
      // NMEA Sentences
      const nmeaSentencesGroup = document.createElement('div');
      nmeaSentencesGroup.className = 'form-group';
      
      const nmeaSentencesLabel = document.createElement('label');
      nmeaSentencesLabel.htmlFor = 'nmea-sentences';
      nmeaSentencesLabel.textContent = 'NMEA Sentences';
      
      const nmeaSentencesSelect = document.createElement('select');
      nmeaSentencesSelect.id = 'nmea-sentences';
      nmeaSentencesSelect.multiple = true;
      nmeaSentencesSelect.size = 7;
      nmeaSentencesSelect.style.height = 'auto';
      
      const nmeaSentences = [
        { value: 'GGA', text: 'GGA (Position & Fix)' },
        { value: 'RMC', text: 'RMC (Position & Time)' },
        { value: 'GSA', text: 'GSA (DOP & Active Satellites)' },
        { value: 'GSV', text: 'GSV (Satellites in View)' },
        { value: 'VTG', text: 'VTG (Course & Speed)' },
        { value: 'GST', text: 'GST (Position Error)' },
        { value: 'ZDA', text: 'ZDA (Date & Time)' }
      ];
      
      nmeaSentences.forEach(sentence => {
        const option = document.createElement('option');
        option.value = sentence.value;
        option.textContent = sentence.text;
        // Default to GGA, RMC, GSA, and GSV
        if (['GGA', 'RMC', 'GSA', 'GSV'].includes(sentence.value)) {
          option.selected = true;
        }
        nmeaSentencesSelect.appendChild(option);
      });
      
      const nmeaSentencesHelp = document.createElement('p');
      nmeaSentencesHelp.className = 'help-text';
      nmeaSentencesHelp.textContent = 'NMEA messages to output';
      
      nmeaSentencesGroup.appendChild(nmeaSentencesLabel);
      nmeaSentencesGroup.appendChild(nmeaSentencesSelect);
      nmeaSentencesGroup.appendChild(nmeaSentencesHelp);
      
      form.appendChild(nmeaSentencesGroup);
      
      // RTK Settings
      // Elevation mask
      const elevationMaskGroup = document.createElement('div');
      elevationMaskGroup.className = 'form-group';
      
      const elevationMaskLabel = document.createElement('label');
      elevationMaskLabel.htmlFor = 'elevation-mask';
      elevationMaskLabel.textContent = 'Elevation Mask (°)';
      
      const elevationMaskInput = document.createElement('input');
      elevationMaskInput.type = 'number';
      elevationMaskInput.id = 'elevation-mask';
      elevationMaskInput.min = 0;
      elevationMaskInput.max = 60;
      elevationMaskInput.value = 10;
      
      const elevationMaskHelp = document.createElement('p');
      elevationMaskHelp.className = 'help-text';
      elevationMaskHelp.textContent = 'Ignore satellites below this elevation';
      
      elevationMaskGroup.appendChild(elevationMaskLabel);
      elevationMaskGroup.appendChild(elevationMaskInput);
      elevationMaskGroup.appendChild(elevationMaskHelp);
      
      form.appendChild(elevationMaskGroup);
      
      // SNR mask
      const snrMaskGroup = document.createElement('div');
      snrMaskGroup.className = 'form-group';
      
      const snrMaskLabel = document.createElement('label');
      snrMaskLabel.htmlFor = 'snr-mask';
      snrMaskLabel.textContent = 'SNR Mask (dB-Hz)';
      
      const snrMaskInput = document.createElement('input');
      snrMaskInput.type = 'number';
      snrMaskInput.id = 'snr-mask';
      snrMaskInput.min = 0;
      snrMaskInput.max = 50;
      snrMaskInput.value = 35;
      
      const snrMaskHelp = document.createElement('p');
      snrMaskHelp.className = 'help-text';
      snrMaskHelp.textContent = 'Ignore satellites below this signal strength';
      
      snrMaskGroup.appendChild(snrMaskLabel);
      snrMaskGroup.appendChild(snrMaskInput);
      snrMaskGroup.appendChild(snrMaskHelp);
      
      form.appendChild(snrMaskGroup);
      
      settingsContainer.appendChild(form);
      
      // Create device status
      const deviceStatus = document.createElement('div');
      deviceStatus.className = 'device-status';
      
      const deviceStatusIndicator = document.createElement('div');
      deviceStatusIndicator.className = 'device-status-indicator disconnected';
      
      const deviceStatusText = document.createElement('div');
      deviceStatusText.textContent = 'No device connected';
      
      deviceStatus.appendChild(deviceStatusIndicator);
      deviceStatus.appendChild(deviceStatusText);
      
      settingsContainer.appendChild(deviceStatus);
      
      // Create action buttons
      const actions = document.createElement('div');
      actions.className = 'device-settings-actions';
      
      const saveButton = document.createElement('button');
      saveButton.type = 'button';
      saveButton.id = 'save-settings';
      saveButton.className = 'device-button secondary';
      saveButton.textContent = 'Save Settings';
      
      const applyButton = document.createElement('button');
      applyButton.type = 'button';
      applyButton.id = 'apply-settings';
      applyButton.className = 'device-button primary';
      applyButton.textContent = 'Apply to Device';
      applyButton.disabled = true;
      
      actions.appendChild(saveButton);
      actions.appendChild(applyButton);
      
      settingsContainer.appendChild(actions);
      
      // Add to container
      this.container.appendChild(settingsContainer);
      
      // Store references to elements
      this.elements = {
        deviceNameInput,
        presetsSelect,
        loadPresetButton,
        gnssSystemsSelect,
        baudRateSelect,
        outputRateSelect,
        dynamicModelSelect,
        nmeaSentencesSelect,
        elevationMaskInput,
        snrMaskInput,
        saveButton,
        applyButton,
        deviceStatusIndicator,
        deviceStatusText,
        form
      };
    }

    /**
     * Set up UI event listeners
     */
    setupEventListeners() {
      if (!this.elements) {
        console.warn('DeviceSettings: No UI elements found. Event listeners not set up.');
        return;
      }
      
      // Safely add event listener to an element if it exists
      const safeAddListener = (elementKey, eventType, handler) => {
        const element = this.elements[elementKey];
        if (element) {
          element.addEventListener(eventType, handler);
        } else {
          console.warn(`DeviceSettings: Element ${elementKey} not found`);
        }
      };
      
      // Load preset button
      safeAddListener('loadPresetButton', 'click', () => {
        this.loadDevicePreset();
      });
      
      // Save settings button
      safeAddListener('saveButton', 'click', () => {
        this.saveConfig();
      });
      
      // Apply settings button
      safeAddListener('applyButton', 'click', () => {
        this.applySettings();
      });
      
      // Form change event to enable/disable save button
      safeAddListener('form', 'change', () => {
        // Enable save button when any form field changes
        if (this.elements.saveButton) {
          this.elements.saveButton.disabled = false;
        }
      });
    }

    /**
     * Register event listeners for GNSS events
     */
    registerEventListeners() {
      if (!this.events) {
        console.warn('DeviceSettings: No events emitter provided. Settings will not update.');
        return;
      }
      
      // Connection status change events
      this.events.on('connection:connected', this.handleConnected.bind(this));
      this.events.on('connection:disconnected', this.handleDisconnected.bind(this));
    }

    /**
     * Handle connected event
     * @param {Object} data - Event data
     */
    handleConnected(data) {
      this.deviceConnected = true;
      
      this.elements.deviceStatusIndicator.className = 'device-status-indicator connected';
      this.elements.deviceStatusText.textContent = `Connected to ${data.deviceInfo?.name || 'device'}`;
      
      // Enable the apply button
      this.elements.applyButton.disabled = false;
    }

    /**
     * Handle disconnected event
     */
    handleDisconnected() {
      this.deviceConnected = false;
      
      this.elements.deviceStatusIndicator.className = 'device-status-indicator disconnected';
      this.elements.deviceStatusText.textContent = 'No device connected';
      
      // Disable the apply button
      this.elements.applyButton.disabled = true;
    }

    /**
     * Load saved configuration from settings
     */
    loadSavedConfig() {
      if (!this.settings || !this.elements) return;
      
      // Initialize device settings in settings storage if not present
      if (!this.settings.getSection('device')) {
        this.settings.set('device', 'name', '');
        this.settings.set('device', 'gnssSystems', ['gps', 'glonass']);
        this.settings.set('device', 'baudRate', 115200);
        this.settings.set('device', 'outputRate', 1);
        this.settings.set('device', 'dynamicModel', 'pedestrian');
        this.settings.set('device', 'nmeaSentences', ['GGA', 'RMC', 'GSA', 'GSV']);
        this.settings.set('device', 'elevationMask', 10);
        this.settings.set('device', 'snrMask', 35);
        this.settings.set('device', 'preset', '');
      }
      
      const deviceSettings = this.settings.getSection('device');
      
      // Safely set value if the element exists
      const safeSetValue = (elementKey, value, isMultiSelect = false) => {
        const element = this.elements[elementKey];
        if (!element) return;
        
        if (isMultiSelect && Array.isArray(value)) {
          // For multi-select elements, we need to set each option's selected state
          Array.from(element.options).forEach(option => {
            option.selected = value.includes(option.value);
          });
        } else if (element.type === 'checkbox') {
          element.checked = Boolean(value);
        } else {
          element.value = value !== undefined ? value : '';
        }
      };
      
      // Update UI elements
      safeSetValue('deviceNameInput', deviceSettings.name);
      safeSetValue('presetsSelect', deviceSettings.preset);
      safeSetValue('gnssSystemsSelect', deviceSettings.gnssSystems, true);
      safeSetValue('baudRateSelect', deviceSettings.baudRate);
      safeSetValue('outputRateSelect', deviceSettings.outputRate);
      safeSetValue('dynamicModelSelect', deviceSettings.dynamicModel);
      safeSetValue('nmeaSentencesSelect', deviceSettings.nmeaSentences, true);
      safeSetValue('elevationMaskInput', deviceSettings.elevationMask);
      safeSetValue('snrMaskInput', deviceSettings.snrMask);
      
      // Disable save button initially
      if (this.elements.saveButton) {
        this.elements.saveButton.disabled = true;
      }
    }

    /**
     * Save configuration to settings
     */
    saveConfig() {
      if (!this.settings || !this.elements) return;
      
      // Safely get value from an element if it exists
      const safeGetValue = (elementKey, defaultValue = '', isMultiSelect = false) => {
        const element = this.elements[elementKey];
        if (!element) return defaultValue;
        
        if (isMultiSelect) {
          return Array.from(element.selectedOptions).map(option => option.value);
        } else if (element.type === 'checkbox') {
          return element.checked;
        } else if (element.type === 'number') {
          return parseInt(element.value, 10);
        } else {
          return element.value;
        }
      };
      
      // Get values from form
      const config = {
        name: safeGetValue('deviceNameInput', ''),
        preset: safeGetValue('presetsSelect', ''),
        gnssSystems: safeGetValue('gnssSystemsSelect', ['gps'], true),
        baudRate: safeGetValue('baudRateSelect', 115200),
        outputRate: safeGetValue('outputRateSelect', 1),
        dynamicModel: safeGetValue('dynamicModelSelect', 'pedestrian'),
        nmeaSentences: safeGetValue('nmeaSentencesSelect', ['GGA', 'RMC'], true),
        elevationMask: safeGetValue('elevationMaskInput', 10),
        snrMask: safeGetValue('snrMaskInput', 35)
      };
      
      // Save to settings
      for (const [key, value] of Object.entries(config)) {
        this.settings.set('device', key, value);
      }
      
      // Emit settings update event
      if (this.events) {
        this.events.emit('device:settings:update', config);
      }
      
      // Disable save button after saving
      if (this.elements.saveButton) {
        this.elements.saveButton.disabled = true;
      }
      
      // Show confirmation
      alert('Device settings saved successfully!');
    }

    /**
     * Apply settings to the connected device
     */
    async applySettings() {
      if (!this.deviceConnected) {
        alert('No device connected. Please connect a device first.');
        return;
      }
      
      // Get current settings
      const deviceSettings = this.settings.getSection('device');
      
      // Emit event to apply settings to device
      if (this.events) {
        this.events.emit('device:apply:settings', deviceSettings);
      }
      
      // Show confirmation
      alert('Settings are being applied to the device. This may take a moment...');
    }

    /**
     * Load settings from a device preset
     */
    loadDevicePreset() {
      if (!this.elements.presetsSelect) return;
      
      const preset = this.elements.presetsSelect.value;
      if (!preset) {
        alert('Please select a device preset first.');
        return;
      }
      
      let presetSettings = {};
      
      // Define preset configurations
      switch (preset) {
        case 'ublox-f9p':
          presetSettings = {
            name: 'u-blox ZED-F9P',
            gnssSystems: ['gps', 'glonass', 'galileo', 'beidou'],
            baudRate: 115200,
            outputRate: 5,
            dynamicModel: 'pedestrian',
            nmeaSentences: ['GGA', 'RMC', 'GSA', 'GSV', 'VTG', 'GST'],
            elevationMask: 10,
            snrMask: 35
          };
          break;
          
        case 'ublox-m8p':
          presetSettings = {
            name: 'u-blox NEO-M8P',
            gnssSystems: ['gps', 'glonass'],
            baudRate: 115200,
            outputRate: 5,
            dynamicModel: 'pedestrian',
            nmeaSentences: ['GGA', 'RMC', 'GSA', 'GSV', 'VTG'],
            elevationMask: 10,
            snrMask: 35
          };
          break;
          
        case 'simplertk2b':
          presetSettings = {
            name: 'SimpleRTK2B',
            gnssSystems: ['gps', 'glonass', 'galileo', 'beidou'],
            baudRate: 115200,
            outputRate: 5,
            dynamicModel: 'pedestrian',
            nmeaSentences: ['GGA', 'RMC', 'GSA', 'GSV', 'VTG', 'GST'],
            elevationMask: 10,
            snrMask: 35
          };
          break;
          
        case 'custom':
          // Just update the device name field but leave other settings as is
          presetSettings = {
            name: 'Custom GNSS Device'
          };
          break;
          
        default:
          alert('Unknown preset selected.');
          return;
      }
      
      // Apply preset settings to form
      if (this.elements.deviceNameInput && presetSettings.name) {
        this.elements.deviceNameInput.value = presetSettings.name;
      }
      
      // Update GNSS systems
      if (this.elements.gnssSystemsSelect && presetSettings.gnssSystems) {
        const options = this.elements.gnssSystemsSelect.options;
        for (let i = 0; i < options.length; i++) {
          options[i].selected = presetSettings.gnssSystems.includes(options[i].value);
        }
      }
      
      // Update baud rate
      if (this.elements.baudRateSelect && presetSettings.baudRate) {
        this.elements.baudRateSelect.value = presetSettings.baudRate;
      }
      
      // Update output rate
      if (this.elements.outputRateSelect && presetSettings.outputRate) {
        this.elements.outputRateSelect.value = presetSettings.outputRate;
      }
      
      // Update dynamic model
      if (this.elements.dynamicModelSelect && presetSettings.dynamicModel) {
        this.elements.dynamicModelSelect.value = presetSettings.dynamicModel;
      }
      
      // Update NMEA sentences
      if (this.elements.nmeaSentencesSelect && presetSettings.nmeaSentences) {
        const options = this.elements.nmeaSentencesSelect.options;
        for (let i = 0; i < options.length; i++) {
          options[i].selected = presetSettings.nmeaSentences.includes(options[i].value);
        }
      }
      
      // Update elevation mask
      if (this.elements.elevationMaskInput && presetSettings.elevationMask) {
        this.elements.elevationMaskInput.value = presetSettings.elevationMask;
      }
      
      // Update SNR mask
      if (this.elements.snrMaskInput && presetSettings.snrMask) {
        this.elements.snrMaskInput.value = presetSettings.snrMask;
      }
      
      // Enable save button
      if (this.elements.saveButton) {
        this.elements.saveButton.disabled = false;
      }
      
      // Update preset in settings
      this.settings.set('device', 'preset', preset);
      
      // Show confirmation
      alert(`Loaded preset settings for ${presetSettings.name}`);
    }
  }

  /**
   * GNSS Module - Main entry point
   * 
   * This module provides a JavaScript interface for connecting to GNSS RTK rovers
   * via Web Bluetooth or Web Serial, parsing NMEA data, and managing NTRIP correction data.
   */

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
      this.connectionManager = new ConnectionManager(this.events, {
        debug: this.debugSettings,
        settings: this.settings
      });
      
      // Create and register connection handlers
      this.bluetoothHandler = new BluetoothHandler(this.events, {
        debug: this.debugSettings
      });
      this.serialHandler = new SerialHandler(this.events, {
        debug: this.debugSettings
      });
      
      // Register connection handlers with the connection manager
      this.connectionManager.registerConnectionMethod(this.bluetoothHandler);
      this.connectionManager.registerConnectionMethod(this.serialHandler);
      
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
        
        this.deviceSettings = new DeviceSettings({
          events: this.events,
          settings: this.settings,
          selector: options.deviceSettingsSelector
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
      this.events.on(EVENTS.POSITION_UPDATE, (position) => {
        this.currentPosition = position;
        // Forward position update using the public API event name
        this.events.emit(EVENTS.POSITION, position);
      });
      
      // Listen for satellite updates from NMEA parser
      this.events.on(EVENTS.SATELLITES_UPDATE, (satellites) => {
        this.satellites = satellites;
        // Forward satellites update using the public API event name
        this.events.emit(EVENTS.SATELLITES, satellites);
      });
      
      // Forward RTCM data to device when connected
      this.events.on(EVENTS.NTRIP_DATA, (rtcmData) => {
        if (this.connectionManager.isConnected()) {
          this.connectionManager.sendData(rtcmData.data);
        }
      });
      
      // Handle device settings application request
      this.events.on(EVENTS.DEVICE_CONFIGURING, (settings) => {
        this.configureDevice(settings);
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
          // Only listen for the standardized device:data event
          this.events.on(EVENTS.DATA_RECEIVED, (data) => {
            this.nmeaParser.parse(data);
          });
        }
        
        return connected;
      } catch (error) {
        this.events.emit(EVENTS.CONNECTION_ERROR, { message: error.message });
        return false;
      }
    }
    
    /**
     * Connect specifically via Bluetooth
     * @param {Object} options - Bluetooth connection options
     * @returns {Promise<boolean>} Connection success
     */
    async connectBluetooth(options = {}) {
      try {
        // Important: This must be called directly in response to a user gesture
        // Create the options for requestDevice
        const requestOptions = {
          optionalServices: [
            // Use service UUIDs from constants
            BLE_SERVICES.NORDIC_UART,
            BLE_SERVICES.UART_ALTERNATIVE,
            BLE_SERVICES.HM_MODULE,
            BLE_SERVICES.HC_MODULE,
            BLE_SERVICES.GENERIC_ACCESS,
            BLE_SERVICES.GENERIC_ATTRIBUTE,
            BLE_SERVICES.SPARKFUN_CUSTOM,
            BLE_SERVICES.SPP,
            BLE_SERVICES.HEART_RATE,
            BLE_SERVICES.DEVICE_INFO
          ]
        };
        
        // Cannot have both acceptAllDevices and filters
        if (!options.filters) {
          Object.assign(requestOptions, {acceptAllDevices: true});
        } else {
          Object.assign(requestOptions, {filters: options.filters});
        }
        
        // Request device directly (this must happen in direct response to user gesture)
        const device = await navigator.bluetooth.requestDevice(requestOptions);
        
        // Now pass the selected device to the connection manager
        return this.connectDevice({ 
          ...options,
          method: 'bluetooth',
          deviceObj: device // Pass the selected device object
        });
      } catch (error) {
        // Handle the case where user cancels the dialog
        if (error.name === 'NotFoundError') {
          this.events.emit(EVENTS.CONNECTION_ERROR, { message: 'No device selected' });
          return false;
        }
        
        this.events.emit(EVENTS.CONNECTION_ERROR, { message: error.message });
        return false;
      }
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
        this.events.emit(EVENTS.NTRIP_ERROR, { message: error.message });
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
     * Configure the device with specified settings
     * @param {Object} settings - Device settings to apply
     * @returns {Promise<boolean>} Success flag
     */
    async configureDevice(settings = {}) {
      try {
        // Check if connected
        if (!this.connectionManager.isConnected()) {
          this.events.emit('device:error', { message: 'Not connected to any device' });
          return false;
        }
        
        // If no settings provided, use saved device settings
        const deviceSettings = settings.gnssSystems ? 
          settings : 
          this.settings.getSection('device');
        
        // Emit event before applying settings
        this.events.emit('device:configuring', { settings: deviceSettings });
        
        // Currently this is a placeholder - in a real implementation, 
        // you would send configuration commands to the device
        // For example, with u-blox devices, you'd send UBX configuration messages
        
        // For now, we'll just simulate a successful configuration
        setTimeout(() => {
          this.events.emit('device:configured', { 
            settings: deviceSettings,
            success: true
          });
        }, 1000);
        
        return true;
      } catch (error) {
        this.events.emit('device:error', { 
          message: 'Error configuring device',
          error
        });
        return false;
      }
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

  exports.BLE_CHARACTERISTICS = BLE_CHARACTERISTICS;
  exports.BLE_SERVICES = BLE_SERVICES;
  exports.BluetoothHandler = BluetoothHandler;
  exports.ConnectionManager = ConnectionManager;
  exports.DeviceSettings = DeviceSettings;
  exports.EVENTS = EVENTS;
  exports.EventEmitter = EventEmitter;
  exports.GnssModule = GnssModule;
  exports.NmeaParser = NmeaParser;
  exports.NtripClient = NtripClient;
  exports.RtkSettings = RtkSettings;
  exports.RtkStatus = RtkStatus;
  exports.SerialHandler = SerialHandler;
  exports.Settings = Settings;
  exports.default = GnssModule;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
//# sourceMappingURL=gnss.js.map
