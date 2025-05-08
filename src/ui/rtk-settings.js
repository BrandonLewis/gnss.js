/**
 * RTK Settings UI Component
 * 
 * This component provides a user interface for configuring NTRIP RTK correction settings
 * and managing connections to NTRIP casters.
 */
export class RtkSettings {
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

export default RtkSettings;