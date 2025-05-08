/**
 * DeviceSettings - UI component for configuring device-specific parameters
 * This component allows users to configure and save parameters specific
 * to their GNSS device.
 */
export class DeviceSettings {
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

export default DeviceSettings;