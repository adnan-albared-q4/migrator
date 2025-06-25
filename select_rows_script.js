// Script to select multiple rows in the data grid
// Usage: Copy and paste this into Chrome DevTools Console

function selectRows(numberOfRows = 5) {
    // Find all workflow checkboxes in the data grid
    const checkboxes = document.querySelectorAll('input[id*="_chkWorkflow"]');
    
    console.log(`Found ${checkboxes.length} total checkboxes`);
    
    // Select the specified number of rows (or all if fewer than requested)
    const rowsToSelect = Math.min(numberOfRows, checkboxes.length);
    
    for (let i = 0; i < rowsToSelect; i++) {
        const checkbox = checkboxes[i];
        if (checkbox && !checkbox.checked) {
            checkbox.checked = true;
            // Trigger change event if needed
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`Selected row ${i + 1}`);
        }
    }
    
    console.log(`Successfully selected ${rowsToSelect} rows`);
    return rowsToSelect;
}

// Alternative function to select rows by specific criteria
function selectRowsByCriteria(criteria = {}) {
    const {
        status = null,        // e.g., "For Approval"
        dateFrom = null,      // e.g., "05/01/2025"
        dateTo = null,        // e.g., "05/03/2025"
        author = null,        // e.g., "adnan.albared"
        maxRows = 10
    } = criteria;
    
    const rows = document.querySelectorAll('tr[onclick*="rowClickCheckSortStatus"]');
    let selectedCount = 0;
    
    for (let i = 0; i < rows.length && selectedCount < maxRows; i++) {
        const row = rows[i];
        const cells = row.querySelectorAll('td');
        
        // Check if row matches criteria
        let shouldSelect = true;
        
        if (status) {
            const statusCell = cells[4]; // Status is in 5th column (index 4)
            if (statusCell && !statusCell.textContent.includes(status)) {
                shouldSelect = false;
            }
        }
        
        if (dateFrom || dateTo) {
            const dateCell = cells[1]; // Date is in 2nd column (index 1)
            if (dateCell) {
                const dateText = dateCell.textContent.trim();
                const rowDate = new Date(dateText);
                
                if (dateFrom) {
                    const fromDate = new Date(dateFrom);
                    if (rowDate < fromDate) shouldSelect = false;
                }
                
                if (dateTo) {
                    const toDate = new Date(dateTo);
                    if (rowDate > toDate) shouldSelect = false;
                }
            }
        }
        
        if (author) {
            const authorCell = cells[3]; // Author is in 4th column (index 3)
            if (authorCell && !authorCell.textContent.includes(author)) {
                shouldSelect = false;
            }
        }
        
        // Select the row if it matches criteria
        if (shouldSelect) {
            const checkbox = row.querySelector('input[id*="_chkWorkflow"]');
            if (checkbox && !checkbox.checked) {
                checkbox.checked = true;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                selectedCount++;
                console.log(`Selected row ${i + 1} with criteria match`);
            }
        }
    }
    
    console.log(`Selected ${selectedCount} rows matching criteria`);
    return selectedCount;
}

// Quick selection functions
function selectFirst5() { return selectRows(5); }
function selectFirst10() { return selectRows(10); }
function selectAll() { return selectRows(1000); } // Large number to select all

// Select rows with "For Approval" status
function selectForApproval() {
    return selectRowsByCriteria({ status: "For Approval", maxRows: 20 });
}

// Select rows from specific date range
function selectByDateRange(fromDate, toDate) {
    return selectRowsByCriteria({ dateFrom: fromDate, dateTo: toDate, maxRows: 50 });
}

// Usage examples:
// selectRows(5)           - Select first 5 rows
// selectFirst5()          - Select first 5 rows
// selectForApproval()     - Select up to 20 rows with "For Approval" status
// selectByDateRange("05/01/2025", "05/03/2025") - Select rows in date range
// selectRowsByCriteria({ status: "For Approval", author: "adnan.albared", maxRows: 10 })

console.log("Row selection functions loaded. Use selectRows(n) to select n rows, or other helper functions."); 