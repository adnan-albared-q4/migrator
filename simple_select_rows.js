// Simple script to select n number of rows by clicking checkboxes
// Copy and paste this into Chrome DevTools Console

function selectRows(n = 5) {
    // Target only data row checkboxes, exclude the header "select all" checkbox
    const checkboxes = document.querySelectorAll('tr:not(:first-child) input[id*="_chkWorkflow"]:not([id*="_chkWorkflowAll"])');
    
    let selectedCount = 0;
    
    function selectNext() {
        if (selectedCount < n && selectedCount < checkboxes.length) {
            const checkbox = checkboxes[selectedCount];
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            checkbox.dispatchEvent(new Event('click', { bubbles: true }));
            checkbox.dispatchEvent(new Event('input', { bubbles: true }));
            
            selectedCount++;
            console.log(`Selected row ${selectedCount}`);
            
            // Wait 1 second before selecting the next checkbox
            setTimeout(selectNext, 1000);
        } else {
            console.log(`Finished selecting ${selectedCount} rows`);
        }
    }
    
    selectNext();
}

// Usage: selectRows(10) - selects first 10 rows (excluding header) 