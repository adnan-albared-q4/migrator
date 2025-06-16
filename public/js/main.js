// State management
const state = {
    sites: [],
    operations: {},
    selectedSites: new Set(),
    currentOperation: null,
    selectedModules: new Set(),
    siteStatus: new Map(), // Track login status per site
    ws: null,
    logs: [] // Store logs in memory
};

// Constants
const MAX_LOGS = 100; // Maximum number of logs to keep

let elements = {};

// Initialize the application
document.addEventListener('DOMContentLoaded', async () => {
    try {
        logMessage('info', 'Initializing application...');
        
        // Load saved logs
        loadSavedLogs();
        
        // DOM Elements
        elements = {
            statusIndicator: document.getElementById('status-indicator'),
            sitesList: document.getElementById('sites-list'),
            operationsList: document.getElementById('operations-list'),
            startButton: document.getElementById('start-button'),
            logPanel: document.getElementById('log-panel'),
            addSiteBtn: document.getElementById('addSiteBtn'),
            sitesPanel: document.getElementById('sitesPanel'),
            operationsPanel: document.getElementById('operationsPanel'),
            siteItemTemplate: document.getElementById('siteItemTemplate'),
            operationItemTemplate: document.getElementById('operationItemTemplate')
        };

        // Add event listeners
        if (elements.addSiteBtn) {
            elements.addSiteBtn.addEventListener('click', () => {
                // TODO: Implement new site form handling
                console.log('Add site button clicked');
            });
        }

        if (elements.startButton) {
            elements.startButton.addEventListener('click', () => {
                // TODO: Implement new start operation handling
                console.log('Start button clicked');
            });
        }

        // Initialize the application
        await init();
        logMessage('info', 'Setup complete');
    } catch (error) {
        logMessage('error', `Initialization error: ${error.message}`);
    }
});

// Load saved logs from localStorage
function loadSavedLogs() {
    try {
        const savedLogs = localStorage.getItem('migrationToolLogs');
        if (savedLogs) {
            state.logs = JSON.parse(savedLogs);
            // Render saved logs
            const logPanel = document.getElementById('log-panel');
            if (logPanel) {
                state.logs.forEach(log => {
                    const logEntry = document.createElement('div');
                    logEntry.className = `log-entry log-${log.type}`;
                    logEntry.textContent = `[${log.timestamp}] ${log.message}`;
                    logPanel.appendChild(logEntry);
                });
                logPanel.scrollTop = logPanel.scrollHeight;
            }
        }
    } catch (error) {
        console.error('Error loading saved logs:', error);
    }
}

// Save logs to localStorage
function saveLogs() {
    try {
        localStorage.setItem('migrationToolLogs', JSON.stringify(state.logs));
    } catch (error) {
        console.error('Error saving logs:', error);
    }
}

// WebSocket setup
function setupWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    state.ws = new WebSocket(wsUrl);
    
    state.ws.onopen = () => {
        console.log('WebSocket connected');
        logMessage('info', 'Connected to server');
    };
    
    state.ws.onclose = () => {
        console.log('WebSocket disconnected');
        logMessage('warning', 'Disconnected from server. Retrying...');
        setTimeout(setupWebSocket, 5000);
    };
    
    state.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        logMessage('error', 'Connection error');
    };
    
    state.ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            handleWebSocketMessage(message);
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    };
}

// WebSocket message handler
function handleWebSocketMessage(message) {
    switch (message.type) {
        case 'INIT_SITES':
        case 'SITES_DATA':
            state.sites = message.data;
            renderSites();
            break;
            
        case 'SITE_ADDED':
            state.sites.push(message.data);
            renderSites();
            break;
            
        case 'SITE_UPDATED':
            const updateIndex = state.sites.findIndex(site => site.name === message.data.name);
            if (updateIndex !== -1) {
                state.sites[updateIndex] = message.data;
                renderSites();
            }
            break;
            
        case 'SITE_DELETED':
            const deleteIndex = state.sites.findIndex(site => site.name === message.data.name);
            if (deleteIndex !== -1) {
                state.sites.splice(deleteIndex, 1);
                renderSites();
            }
            break;
            
        default:
            console.log('Unknown message type:', message.type);
    }
}

// Fetch site configurations from sites.json
async function fetchSites() {
    try {
        const response = await fetch('/api/sites');
        if (!response.ok) throw new Error('Failed to fetch sites');
        const data = await response.json();
        state.sites = data.sites;
        renderSites();
    } catch (error) {
        logMessage('error', `Failed to fetch sites: ${error.message}`);
    }
}

// Fetch available operations
async function fetchOperations() {
    try {
        const response = await fetch('/api/operations');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        state.operations = data;
        renderOperations();
    } catch (error) {
        logMessage('error', `Error loading operations: ${error.message}`);
    }
}

// Site Management Functions
async function addSite() {
    try {
        showModal('modalTemplate');
    } catch (error) {
        logMessage('error', `Failed to show modal: ${error.message}`);
    }
}

async function editSite(site) {
    const modal = showModal('modalTemplate');
    if (!modal) return;

    const form = modal.querySelector('#siteForm');
    const nameInput = form.querySelector('#siteName');
    const sourceInput = form.querySelector('#siteSource');
    const destinationInput = form.querySelector('#siteDestination');

    // Pre-fill the form
    nameInput.value = site.name;
    sourceInput.value = site.source;
    destinationInput.value = site.destination;

    return new Promise((resolve) => {
        const closeModal = () => {
            modal.remove();
            resolve(null);
        };

        form.onsubmit = async (e) => {
            e.preventDefault();
            
            const updatedSite = {
                name: nameInput.value.trim(),
                source: sourceInput.value.trim(),
                destination: destinationInput.value.trim()
            };

            try {
                const response = await fetch(`/api/sites/${encodeURIComponent(site.name)}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(updatedSite)
                });

                if (!response.ok) {
                    throw new Error('Failed to update site');
                }

                modal.remove();
                resolve(updatedSite);
            } catch (error) {
                console.error('Error updating site:', error);
                resolve(null);
            }
        };

        // Add event listeners for closing the modal
        const closeButtons = modal.querySelectorAll('.close-modal');
        closeButtons.forEach(button => {
            button.onclick = closeModal;
        });
    });
}

async function cloneSite(site) {
    try {
        const modalTemplate = document.getElementById('modalTemplate');
        if (!modalTemplate) {
            throw new Error('Modal template not found');
        }

        const clone = modalTemplate.content.cloneNode(true);
        const form = clone.querySelector('form');
        if (!form) {
            throw new Error('Form not found in modal template');
        }

        // Update modal title
        const title = clone.querySelector('.modal-header h3');
        if (title) {
            title.textContent = 'Clone Site';
        }

        // Pre-fill form fields with modified values
        const nameInput = form.querySelector('#siteName');
        const sourceInput = form.querySelector('#siteSource');
        const destInput = form.querySelector('#siteDestination');

        if (nameInput && sourceInput && destInput) {
            nameInput.value = `${site.name} (Copy)`;
            sourceInput.value = site.source;
            destInput.value = site.destination;
        }

        document.body.appendChild(clone);
        document.body.style.overflow = 'hidden';

        // Add event listeners and form handling
        const modalOverlay = document.querySelector('.modal-overlay');
        if (!modalOverlay) return;

        const closeButtons = modalOverlay.querySelectorAll('.close-modal');
        const modalForm = modalOverlay.querySelector('form');

        const closeModal = () => {
            modalOverlay.remove();
            document.body.style.overflow = '';
        };

        closeButtons.forEach(button => {
            button.addEventListener('click', closeModal);
        });

        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                closeModal();
            }
        });

        if (modalForm) {
            modalForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const formData = new FormData(modalForm);
                const siteData = {
                    name: formData.get('siteName'),
                    source: formData.get('siteSource'),
                    destination: formData.get('siteDestination')
                };

                try {
                    const response = await fetch('/api/sites', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(siteData)
                    });

                    if (!response.ok) {
                        const errorData = await response.json();
                        throw new Error(errorData.error || 'Failed to clone site');
                    }

                    await fetchSites();
                    closeModal();
                    logMessage('success', `Site "${siteData.name}" cloned successfully`);
                } catch (error) {
                    logMessage('error', `Failed to clone site: ${error.message}`);
                }
            });
        }
    } catch (error) {
        logMessage('error', `Failed to show clone modal: ${error.message}`);
    }
}

// UI Event Handlers
function handleAddSiteClick() {
    showModal('modalTemplate');
}

function handleEditSiteClick(event) {
    const siteItem = event.target.closest('.site-item');
    const siteName = siteItem.dataset.siteName;
    const site = state.sites.find(s => s.name === siteName);
    
    if (site) {
        editSite(site).then(updatedSite => {
            if (updatedSite) {
                // Update the sites array
                const index = state.sites.findIndex(s => s.name === siteName);
                if (index !== -1) {
                    state.sites[index] = updatedSite;
                }
                renderSites();
            }
        });
    }
}

// Rendering Functions
async function renderSites() {
    const sitesList = document.getElementById('sites-list');
    const template = document.getElementById('siteItemTemplate');
    
    if (!sitesList || !template) {
        console.error('Required elements not found');
        return;
    }

    sitesList.innerHTML = '';

    state.sites.forEach(site => {
        const clone = template.content.cloneNode(true);
        const siteItem = clone.querySelector('.site-item');
        
        // Set data attribute for site identification
        siteItem.dataset.siteName = site.name;
        
        siteItem.querySelector('.site-name').textContent = site.name;
        siteItem.querySelector('.site-source').textContent = site.source;
        siteItem.querySelector('.site-destination').textContent = site.destination;
        
        // Add click handlers for site selection
        const checkbox = siteItem.querySelector('.site-checkbox');
        const siteName = siteItem.querySelector('.site-name');
        
        // Update checkbox state if site is already selected
        checkbox.checked = state.selectedSites.has(site.name);
        siteItem.classList.toggle('selected', state.selectedSites.has(site.name));

        // Handle checkbox click
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            toggleSiteSelection(site, siteItem);
        });

        // Handle site name click
        siteName.addEventListener('click', (e) => {
            e.stopPropagation();
            checkbox.checked = !checkbox.checked;
            toggleSiteSelection(site, siteItem);
        });
        
        // Remove the click handler from the entire site item
        siteItem.addEventListener('click', (e) => {
            // Only prevent propagation if clicking inside site-actions
            if (e.target.closest('.site-actions')) {
                e.stopPropagation();
            }
        });
        
        const editButton = siteItem.querySelector('.edit-site');
        editButton.addEventListener('click', handleEditSiteClick);
        
        // Add delete button handler
        const deleteButton = siteItem.querySelector('.delete-site');
        deleteButton.addEventListener('click', async (e) => {
            e.stopPropagation();
            await deleteSite(site);
        });

        // Add details button handler
        const detailsButton = siteItem.querySelector('.view-site-details');
        detailsButton.addEventListener('click', (e) => {
            e.stopPropagation();
            window.location.href = `pages/site-details.html?site=${encodeURIComponent(site.name)}`;
        });
        
        sitesList.appendChild(clone);
    });
}

// Render operations list
function renderOperations() {
    if (!state.operations || !elements.operationsList) return;

    elements.operationsList.innerHTML = '';

    // Iterate through each operation category
    Object.entries(state.operations).forEach(([key, operation]) => {
        const operationItem = document.createElement('div');
        operationItem.className = 'operation-item';
        operationItem.innerHTML = `
            <h3>${operation.name}</h3>
            <div class="modules">
                <div class="module-item select-all">
                    <input type="checkbox" id="${key}-all" data-operation="${key}" data-module="all">
                    <label for="${key}-all">Select All</label>
                </div>
                ${Object.entries(operation.modules).map(([moduleKey, module]) => `
                    <div class="module-item">
                        <input type="checkbox" id="${key}-${moduleKey}" 
                            data-operation="${key}" 
                            data-module="${moduleKey}">
                        <label for="${key}-${moduleKey}">${module.name}</label>
                    </div>
                `).join('')}
            </div>
        `;

        // Add event listeners for checkboxes
        operationItem.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const operation = e.target.dataset.operation;
                const module = e.target.dataset.module;
                const moduleItem = e.target.closest('.module-item');
                
                // Toggle selected class based on checkbox state
                moduleItem.classList.toggle('selected', e.target.checked);
                
                if (module === 'all') {
                    // Handle "Select All" checkbox
                    const isChecked = e.target.checked;
                    const moduleCheckboxes = operationItem.querySelectorAll(`input[data-operation="${operation}"]:not([data-module="all"])`);
                    moduleCheckboxes.forEach(cb => {
                        cb.checked = isChecked;
                        cb.closest('.module-item').classList.toggle('selected', isChecked);
                    });
                } else {
                    // Update "Select All" checkbox state
                    const allCheckbox = operationItem.querySelector(`input[data-operation="${operation}"][data-module="all"]`);
                    const moduleCheckboxes = operationItem.querySelectorAll(`input[data-operation="${operation}"]:not([data-module="all"])`);
                    const allChecked = Array.from(moduleCheckboxes).every(cb => cb.checked);
                    allCheckbox.checked = allChecked;
                    allCheckbox.closest('.module-item').classList.toggle('selected', allChecked);
                }
                
                updateStartButton();
            });
        });

        // Add click handlers for module items
        operationItem.querySelectorAll('.module-item').forEach(moduleItem => {
            moduleItem.addEventListener('click', (e) => {
                // Don't handle click if it was directly on the checkbox
                if (e.target.type === 'checkbox') return;
                
                const checkbox = moduleItem.querySelector('input[type="checkbox"]');
                if (checkbox && e.target.tagName !== 'LABEL') {
                    checkbox.checked = !checkbox.checked;
                    moduleItem.classList.toggle('selected', checkbox.checked);
                    checkbox.dispatchEvent(new Event('change'));
                }
            });
        });

        elements.operationsList.appendChild(operationItem);
    });
}

// Toggle site selection
function toggleSiteSelection(site, element) {
    const siteId = site.name;
    const checkbox = element.querySelector('.site-checkbox');
    
    if (state.selectedSites.has(siteId)) {
        state.selectedSites.delete(siteId);
        element.classList.remove('selected');
        checkbox.checked = false;
    } else {
        state.selectedSites.add(siteId);
        element.classList.add('selected');
        checkbox.checked = true;
    }
    updateStartButton();
}

// Select operation
function selectOperation(operationKey) {
    state.currentOperation = operationKey;
    document.querySelectorAll('.operation-item').forEach(item => {
        item.classList.toggle('selected', 
            item.querySelector('strong').textContent === state.operations[operationKey].name);
    });
    updateStartButton();
}

// Update start button state
function updateStartButton() {
    const startButton = document.getElementById('start-button');
    if (!startButton) return;

    const hasSelectedSites = state.selectedSites.size > 0;
    const hasSelectedOperation = state.currentOperation !== null;
    const hasSelectedModules = state.selectedModules.size > 0;

    startButton.disabled = !(hasSelectedSites && hasSelectedOperation && hasSelectedModules);
}

// Log message to the log panel
function logMessage(type, message) {
    const logPanel = document.getElementById('log-panel');
    if (!logPanel) {
        console.error('Log panel not found:', message);
        return;
    }

    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${type}`;
    logEntry.textContent = `[${timestamp}] ${message}`;
    logPanel.appendChild(logEntry);
    logPanel.scrollTop = logPanel.scrollHeight;

    // Store in state
    state.logs.push({
        type,
        message,
        timestamp
    });

    // Trim logs if exceeding maximum
    if (state.logs.length > MAX_LOGS) {
        state.logs = state.logs.slice(-MAX_LOGS);
    }

    // Save to localStorage
    saveLogs();
}

// Update site status
function updateSiteStatus(siteName, status) {
    state.siteStatus.set(siteName, status);
    renderSites();
}

// Start migration
async function startMigration() {
    if (state.isRunning) return;

    state.isRunning = true;
    updateStartButton();

    try {
        const selectedSites = Array.from(state.selectedSites);
        
        // Update status for selected sites
        selectedSites.forEach(siteName => {
            updateSiteStatus(siteName, 'Running...');
        });

        const response = await fetch('/api/migrate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sites: selectedSites,
                operation: state.currentOperation,
                modules: Array.from(state.selectedModules)
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Set up Server-Sent Events for progress updates
        const eventSource = new EventSource('/api/progress');
        
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            logMessage(data.type, data.message);
            
            if (data.siteName) {
                updateSiteStatus(data.siteName, data.status);
            }
            
            if (data.type === 'success' && data.complete) {
                eventSource.close();
                state.isRunning = false;
                selectedSites.forEach(siteName => {
                    updateSiteStatus(siteName, 'Complete');
                });
                updateStartButton();
            }
        };

        eventSource.onerror = () => {
            eventSource.close();
            state.isRunning = false;
            selectedSites.forEach(siteName => {
                updateSiteStatus(siteName, 'Error');
            });
            updateStartButton();
            logMessage('error', 'Lost connection to server');
        };

    } catch (error) {
        state.isRunning = false;
        selectedSites.forEach(siteName => {
            updateSiteStatus(siteName, 'Error');
        });
        updateStartButton();
        logMessage('error', 'Error starting migration: ' + error.message);
    }
}

// Initialize the application
async function init() {
    try {
        console.log('Initializing...');
        setupWebSocket();
        await Promise.all([
            fetchSites(),
            fetchOperations()
        ]);
        
        // Set up event listeners
        const addSiteBtn = document.getElementById('addSiteBtn');
        if (addSiteBtn) {
            addSiteBtn.addEventListener('click', () => showModal('modalTemplate'));
        }
        
        console.log('Initialization complete');
    } catch (error) {
        console.error('Initialization error:', error);
        logMessage('error', `Initialization failed: ${error.message}`);
    }
}

function updateStatus(status) {
    elements.statusIndicator.textContent = status;
}

function showModal(templateId) {
    const template = document.getElementById(templateId);
    if (!template) {
        logMessage('error', `Template not found: ${templateId}`);
        return;
    }
    
    const modalElement = template.content.cloneNode(true);
    
    // Remove any existing modals
    const existingModal = document.querySelector('.modal-overlay');
    if (existingModal) {
        existingModal.remove();
    }
    
    document.body.appendChild(modalElement);
    document.body.style.overflow = 'hidden'; // Prevent background scrolling

    // Add event listeners
    const modal = document.querySelector('.modal-overlay');
    const closeButtons = modal.querySelectorAll('.close-modal');
    const form = modal.querySelector('form');

    if (!form) {
        logMessage('error', 'Form element not found in modal');
        return;
    }

    const closeModal = () => {
        modal.remove();
        document.body.style.overflow = '';
    };

    closeButtons.forEach(button => {
        button.addEventListener('click', closeModal);
    });

    // Close on overlay click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
        }
    });

    // Handle form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(form);
        const siteData = {
            name: formData.get('siteName'),
            source: formData.get('siteSource'),
            destination: formData.get('siteDestination')
        };

        // Validate form data
        if (!siteData.name || !siteData.source || !siteData.destination) {
            logMessage('error', 'Please fill in all fields');
            return;
        }

        // Close modal immediately for better UX
        closeModal();
        
        // Show creating message
        logMessage('info', `Creating site: ${siteData.name}...`);

        // Handle server communication asynchronously
        fetch('/api/sites', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(siteData)
        })
        .then(async response => {
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Failed to add site');
            }

            // Refresh the sites list
            await fetchSites();
            logMessage('success', `Site "${siteData.name}" added successfully`);
        })
        .catch(error => {
            logMessage('error', `Failed to add site: ${error.message}`);
            console.error('Detailed error:', error);
        });
    });

    return modal;
}

// Delete site function
async function deleteSite(site) {
    try {
        const response = await fetch(`/api/sites/${encodeURIComponent(site.name)}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Failed to delete site');
        }

        // Remove from local state
        const index = state.sites.findIndex(s => s.name === site.name);
        if (index !== -1) {
            state.sites.splice(index, 1);
        }
        
        // Remove from selected sites if present
        state.selectedSites.delete(site.name);
        
        // Update UI
        renderSites();
        logMessage('success', `Site "${site.name}" deleted successfully`);
    } catch (error) {
        logMessage('error', `Failed to delete site: ${error.message}`);
    }
} 