/**
 * RTK Status UI Component
 * 
 * This component displays the current RTK fix status, including fix quality,
 * satellite information, and correction data status.
 */
export class RtkStatus {
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

export default RtkStatus;