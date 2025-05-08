/**
 * NmeaParser - Parses NMEA sentences from the GNSS receiver
 */
export class NmeaParser {
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
   * Process the current buffer for complete NMEA sentences
   * @returns {Object[]} Array of parsed NMEA objects
   */
  processBuffer() {
    const sentences = this.buffer.split('\r\n');
    // Keep the last potentially incomplete sentence in the buffer
    this.buffer = sentences.pop();
    
    const results = [];
    
    for (const sentence of sentences) {
      if (sentence.trim() === '') continue;
      
      try {
        const parsed = this.parseSentence(sentence);
        if (parsed) {
          results.push(parsed);
        }
      } catch (error) {
        this.logger.error('Error parsing NMEA sentence:', error, sentence);
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
    // Basic validation
    if (!sentence.startsWith('$') || sentence.length < 9) {
      this.logger.debug('Invalid NMEA sentence format:', sentence);
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
    let parts = sentence.substring(1, sentence.indexOf('*')).split(',');
    const sentenceType = parts[0];
    
    // Extract type without prefix (e.g., GPGGA -> GGA)
    const typeWithoutPrefix = sentenceType.substring(2);
    this.logger.parsedSentence(`Parsing NMEA sentence type: ${sentenceType} (${typeWithoutPrefix})`);
    
    // Parse different sentence types
    let result;
    switch (sentenceType) {
      case 'GPGGA':
      case 'GNGGA':
        result = this.parseGGA(parts);
        break;
      case 'GPGSA':
      case 'GNGSA':
        result = this.parseGSA(parts);
        break;
      case 'GPGSV':
      case 'GNGSV':
        result = this.parseGSV(parts);
        break;
      case 'GPRMC':
      case 'GNRMC':
        result = this.parseRMC(parts);
        break;
      case 'GPGST':
      case 'GNGST':
        result = this.parseGST(parts);
        break;
      case 'GPVTG':
      case 'GNVTG':
        result = this.parseVTG(parts);
        break;
      default:
        result = {
          type: typeWithoutPrefix,
          raw: sentence
        };
        break;
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
        result.dataRate = 1000 / elapsed; // sentences per second
      }
      this.lastSentenceTime = now;
    }
    
    return result;
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
    
    // Update the last position if valid
    if (latitude !== null && longitude !== null) {
      this.lastPosition = { latitude, longitude };
    }
    
    return {
      type: 'GGA',
      time: parts[1],
      latitude,
      longitude,
      fixQuality: parseInt(parts[6] || '0'),
      satellites: parseInt(parts[7] || '0'),
      hdop: parseFloat(parts[8] || '0'),
      altitude: parts[9] ? parseFloat(parts[9]) : null,
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
    
    // Extract satellite IDs (parts 3-14)
    for (let i = 3; i <= 14; i++) {
      if (parts[i] && parts[i].trim() !== '') {
        satellites.push(parseInt(parts[i]));
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
        
        const satellite = {
          prn,
          elevation: parseInt(parts[baseIndex + 1] || '0'),
          azimuth: parseInt(parts[baseIndex + 2] || '0'),
          snr: parts[baseIndex + 3] ? parseInt(parts[baseIndex + 3]) : null
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
    
    // Update the last position if valid
    if (latitude !== null && longitude !== null) {
      this.lastPosition = { latitude, longitude };
    }
    
    return {
      type: 'RMC',
      time,
      status: parts[2], // A=active, V=void
      latitude,
      longitude,
      speed: parts[7] ? parseFloat(parts[7]) : null, // Speed over ground in knots
      course: parts[8] ? parseFloat(parts[8]) : null, // Course in degrees
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
    
    // NMEA format: DDMM.MMMM
    const degrees = parseInt(value.substring(0, 2));
    const minutes = parseFloat(value.substring(2));
    let latitude = degrees + (minutes / 60);
    
    // Apply direction
    if (direction === 'S') {
      latitude = -latitude;
    }
    
    return latitude;
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
    
    // NMEA format: DDDMM.MMMM
    const degrees = parseInt(value.substring(0, 3));
    const minutes = parseFloat(value.substring(3));
    let longitude = degrees + (minutes / 60);
    
    // Apply direction
    if (direction === 'W') {
      longitude = -longitude;
    }
    
    return longitude;
  }

  /**
   * Get the current position
   * @returns {Object|null} Current position
   */
  getPosition() {
    return this.lastPosition;
  }

  /**
   * Get current satellite information
   * @returns {Object[]|null} Satellite information
   */
  getSatellites() {
    return this.lastSatellites;
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
  }
}

export default NmeaParser;