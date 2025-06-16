// Sites page specific functionality
document.addEventListener('DOMContentLoaded', () => {
    // Initialize sites page
    initSitesPage();
});

async function initSitesPage() {
    try {
        // Fetch and render all sites
        await fetchSites();
        
        // Add event listener for add site button
        const addSiteBtn = document.getElementById('addSiteBtn');
        if (addSiteBtn) {
            addSiteBtn.addEventListener('click', () => showModal('modalTemplate'));
        }
    } catch (error) {
        logMessage('error', `Failed to initialize sites page: ${error.message}`);
    }
} 