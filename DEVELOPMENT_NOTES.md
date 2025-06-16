# Content Migration Tool Development Notes

## Core Patterns and Best Practices

### Site Configuration Format

The `sites.json` file is the central configuration file for managing source and destination sites. It follows this structure:

```json
{
  "sites": [
    {
      "name": "Example Corp",
      "source": "example2020index",
      "destination": "example2025snprd"
    },
    {
      "name": "Another Corp",
      "source": "another2020index",
      "destination": "another2025snprd"
    }
  ]
}
```

Each site entry contains:
- `name`: Display name of the company
- `source`: Source site identifier (typically ends with 'index' or 'rd')
- `destination`: Destination site identifier (typically ends with 'snprd')

The tool uses these identifiers to:
- Track migration progress per site
- Maintain separate data directories
- Handle concurrent operations
- Generate appropriate logs and reports

### Page Type Handling & Navigation

#### ASPX Pages (Server-Side)
- **Key Characteristics:**
  - Server-side rendering
  - Complete content on initial load
  - No dynamic updates
  - Postback behavior for form submissions
- **Implementation Pattern:**
  ```typescript
  // Simple, reliable pattern for ASPX
  await page.goto(url);
  await waitTillHTMLRendered(page);
  // Direct DOM queries work immediately
  ```
- **Example:** DeleteDownloads Operation
  - Select specific types first (e.g., governance documents)
  - Single verification step
  - Direct table queries
  - Handle postback navigation (waitForNavigation)
  ```typescript
  // Efficient item collection with type selection
  await page.select('#_ctrl0_ctl19_ddlReportType', typeId);
  await waitTillHTMLRendered(page);
  const items = await page.evaluate(() => {
      const rows = document.querySelectorAll('#_ctrl0_ctl19_UCReports2_dataGrid tr:not(.DataGridHeader)');
      return Array.from(rows).map(row => ({
          title: row.querySelector('td.DataGridItemBorder:nth-child(3)')?.textContent?.trim(),
          // ... other fields
      })).filter(item => !item.status.includes('For Approval'));
  });
  ```

#### Angular Pages (SPA)
- **Key Characteristics:**
  - Client-side rendering
  - Dynamic content updates
  - State-dependent UI
  - Complex button interactions
- **Implementation Pattern:**
  ```typescript
  // Reliable pattern for Angular
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000); // Stabilization
  await page.waitForSelector(uniqueIdentifier);
  ```
- **Example:** DeleteAnalyst Operation
  - State tracking (landing, analystGroups, list, edit)
  - Button interaction handling:
    ```typescript
    // Button click with retry
    const maxAttempts = 3;
    for (let i = 0; i < maxAttempts; i++) {
        try {
            await page.waitForSelector(button, { visible: true });
            await page.waitForTimeout(500); // Ensure interactivity
            await page.click(button);
            break;
        } catch (error) {
            if (i === maxAttempts - 1) throw error;
            await page.waitForTimeout(1000);
        }
    }
    ```
  - Modal handling:
    - Wait for modal visibility
    - Fill required fields
    - Handle confirmation
    - Wait for modal closure

### Error Handling & Recovery
1. **Global Strategy:**
   - Log all failures with stack traces
   - Continue processing when possible
   - Maintain operation state
   - Implement retry mechanisms (3 attempts standard; for dynamic/iframe content, use a post-processing retry loop as described in the FAQ Scraping & Migration section below)
   - Standard timeouts:
     - Navigation: 30 seconds
     - Element visibility: 5 seconds
     - Angular stabilization: 1 second
   - Graceful degradation:
     - Skip problematic items rather than fail entire operation
     - Log skipped items for manual review
     - Continue with remaining queue
   - DeleteAll Operation Strategy:
     - Continue through all operations even if some fail
     - Track individual operation results
     - Consider partial success as overall success
     - Provide detailed failure summaries for manual review
     - Maintain shared login session across operations

2. **Page-Specific Recovery:**
   - ASPX: 
     - Retry DOM queries
     - Handle postback timeouts (10 seconds)
   - Angular: 
     - State recovery and re-navigation
     - Button interactions: Check interactivity
     - Modal recovery: Re-open if closed unexpectedly

### Performance Optimization
1. **Page-Specific:**
   - ASPX: Minimal verification
   - Angular: Consistent stabilization waits
   - Both: Direct selectors
   - Static waits:
     - After modal confirmations: 1000ms
     - After delete button clicks: 500ms
     - After page transitions: 1000ms

2. **Concurrent Processing:**
   - Standard operations: 6 sites max
   - Delete-all: 2 sites max (resource intensive)
   - Resource cleanup
   - State tracking
   - Queue management:
     - Process items sequentially within each site
     - Parallel processing across sites
     - Maintain operation state per site

### Element Selection
1. **Selector Priority:**
   - ID-based selectors (most reliable)
   - Element type + attributes
   - Class combinations (least reliable)

2. **Common Patterns:**
   ```typescript
   // ASPX specific selectors
   '#_ctrl0_ctl19_UCReports2_dataGrid tr:not(.DataGridHeader)'
   
   // Angular specific selectors
   '[id*="AnalystGroupsTable"]'
   ```

## Project Implementation

### Structure
```
lib/
├── core/                       # Core functionality
│   ├── BrowserConfig.ts       # Browser setup
│   ├── LoginManager.ts        # Auth handling
│   ├── StateManager.ts        # State tracking
│   └── types.ts              # Type definitions
├── operations/                # Operation implementations
│   ├── Base.ts
│   ├── DeleteAnalyst.ts      # Angular implementation
│   ├── DeleteDownloads.ts    # ASPX implementation
│   └── [Other].ts
└── services/
    └── CMS.ts               # CMS interaction
```

### State Management
- Site-specific state tracking
- Operation status monitoring
- Concurrent operation handling
- Resource cleanup
- Operation Result Tracking:
  ```typescript
  interface OperationResult {
      name: string;
      success: boolean;
      error?: Error;
  }
  ```
- Comprehensive logging:
  - Operation progress (e.g., "1/4")
  - Success/failure status
  - Error details for failed operations
  - Summary statistics
  - Manual review requirements

### Debug & Testing
1. **Debug Mode Features:**
   - Step-by-step validation
   - State transition logging
   - Element interaction verification
   - Interactive pauses:
     - Before critical actions
     - After state transitions
     - During error recovery
   - Detailed element state logging
   - Operation sequence tracking:
     - Progress indicators
     - Success/failure counts
     - Error message collection

2. **Testing Strategy:**
   - Headless execution
   - Detailed logging
   - Performance monitoring
   - Environment considerations:
     - Test with both headless and headful modes
     - Verify across different site configurations
     - Monitor memory and CPU usage

### Output Structure & Migration Compatibility
- All scrape operations should output JSON in a format compatible with their corresponding migration scripts.
- For example, FAQ scraping outputs `{ faqLists: [...] }` in `faq.json` (see FAQ Scraping & Migration section below for details).
- Use clear, predictable filenames and top-level keys for all scrape/migrate operations.

### Edge Case Handling
- All operations should log and gracefully handle "no data found" or "unexpected data shape" cases.
- If only one FAQ list is found, its name is set to "Frequently Asked Questions" for consistency (see FAQ Scraping & Migration).
- If two or more lists are found, original names are preserved.
- If no FAQ lists are found, the script logs this and skips migration for that site.

### Reference: FAQ Scraping & Migration Patterns
- For the most robust scraping and migration patterns, see the FAQ Scraping & Migration section below. The retry, logging, and session handling patterns there are now considered best practice for all new operations.

## Key Development Learnings
1. **Simplify Where Possible:**
   - Remove unnecessary verification
   - Use direct selectors
   - Match implementation to page type
   - Understand page behavior (ASPX vs Angular)
   - Avoid over-engineering:
     - Use static waits when appropriate
     - Don't over-complicate navigation checks
   - Error handling philosophy:
     - Prefer continuation over stopping
     - Log failures for manual review
     - Maximize automated work completion

2. **Reliable Patterns:**
   - ASPX: Direct DOM interaction
   - Angular: State management
   - Both: Proper error handling
   - Standard timeouts and retry counts
   - Content type handling:
     - Filter items before processing (e.g., "For Approval" status)
     - Use consistent deletion comments
     - Follow established patterns per content type
   - Operation sequencing:
     - Shared login session management
     - Inter-operation delays (2000ms)
     - Result tracking and reporting
     - Graceful continuation after failures

3. **Performance Focus:**
   - Minimize waits
   - Optimize selectors
   - Handle resources properly
   - Balance between reliability and speed
   - Resource management:
     - Close unused pages
     - Reuse login sessions when possible
     - Implement proper cleanup
   - Operation efficiency:
     - Continue on failures to maximize work done
     - Track and report failures for later handling
     - Maintain shared resources across operations

## Development Notes

### Page Type Handling

#### ASPX Pages
- Use `waitTillHTMLRendered` after navigation
- Handle postback behavior for form submissions
- Select specific types first (e.g., governance documents) before querying
- Wait for postback navigation to complete
- Use specific timeout values for different operations

#### Angular Pages
- Avoid `waitForNavigation` for SPAs
- Wait for Angular to stabilize after actions
- Use button click retry pattern
- Handle modal interactions carefully
- Implement recovery strategies for failed interactions

### Error Handling

#### Standard Retry Pattern
- 3 attempts for most operations
- 5000ms timeout for navigation
- 10000ms timeout for element visibility
- Exponential backoff between retries

#### Recovery Strategies
- For ASPX pages: Reload page and retry
- For Angular pages: Wait for stabilization and retry
- Log detailed error information
- Save operation state for recovery

### Performance Optimization

#### Static Wait Times
- 500ms after button clicks
- 1000ms after modal confirmations
- 2000ms for Angular stabilization
- 3000ms for complex page loads

#### Queue Management
- Process items in batches
- Skip inactive items
- Handle errors gracefully
- Continue processing after failures

### Debugging

#### Logging
- Log key operation steps
- Include timing information
- Record success/failure status
- Track retry attempts

#### Screenshots
- Capture error states
- Save to debug directory
- Include timestamp
- Add context information

### FAQ Scraping & Migration: Patterns, Lessons Learned, and Best Practices (2024)

### Overview
This section documents the robust workflow and patterns established for scraping and migrating FAQs from legacy CMS systems, ensuring reliability, maintainability, and compatibility with downstream migration scripts.

---

### 1. Session Handling & Login
- **Always use the same Puppeteer `Page` instance** for all navigation and scraping after login.
- **LoginManager** is configured to use the source site as the destination for scraping operations (e.g., `destination = source`).
- **Never create a new browser or page instance** after login; always use the one returned by `getPage()` from `Base`.

### 2. Navigation Patterns
- Use `page.goto(url, { waitUntil: 'domcontentloaded' })` and `waitTillHTMLRendered(page)` for reliable navigation.
- Wait for a specific selector (e.g., FAQ lists table) to confirm the page is ready before scraping.
- All navigation and scraping actions use the same logged-in page instance.

### 3. Scraping Data
- Use `page.evaluate` to extract data from tables (lists, questions) and return structured arrays of objects.
- For each FAQ list, scrape all questions and their IDs.
- For each question, navigate to the edit/details page and extract the answer from the appropriate iframe or field.

### 4. Retry Logic for Answers
- **Initial pass:** Attempt to retrieve all answers as usual.
- **Post-processing loop:** For any questions with empty answers:
  - Retry up to 3 times, each time:
    - Clicking the edit button again.
    - Waiting longer (e.g., 7 seconds for the form, plus 2 seconds for iframe content).
    - Attempting to extract the answer.
    - Logging each attempt and its result.
  - If an answer is found, log a success; if not, log a final failure for manual review.
- This approach ensures minimal data loss due to slow iframe/content loading.

### 5. Logging & QA
- Log the initial number of questions found for each list.
- Log the number of questions in the final JSON for each list compared to the initial count.
- Log the number of empty answers in the JSON for each list.
- Log each retry attempt for empty answers, including success or final failure.
- Log when only one FAQ list is found and renamed to "Frequently Asked Questions".
- Log all errors and continue processing other sites/lists/questions.

### 6. Output Format & Migration Compatibility
- Output JSON is structured as `{ faqLists: [ ... ] }` and saved as `faq.json` in the site's data directory.
- This format is fully compatible with the migration script, which expects a `faqLists` array.
- The migration script reads the JSON, compares/creates lists, and creates all FAQs as needed.

### 7. Naming & Edge Cases
- If only one FAQ list is found, its name is set to "Frequently Asked Questions" for consistency.
- If two or more lists are found, original names are preserved.
- If no FAQ lists are found, the script logs this and skips migration for that site.

### 8. Error Handling & Robustness
- All errors (navigation, missing data, etc.) are logged clearly.
- The script continues processing other sites/lists/questions even if some fail.
- At the end, a summary of any questions still missing answers is logged for manual review.

### 9. Patterns Used (Summary Table)
| Step                | Pattern/Method Used                |
|---------------------|------------------------------------|
| Session Handling    | getPage(), LoginManager config      |
| Navigation          | page.goto, waitTillHTMLRendered     |
| Scraping            | page.evaluate, structured objects   |
| Retry Logic         | Post-processing loop, longer waits  |
| Logging             | chalk, detailed per-step logs       |
| Output Format       | { faqLists: [...] }, faq.json       |
| Migration           | Compatible with MigrateFAQ script   |
| Error Handling      | try/catch, continue on error        |

### 10. Lessons Learned
- **Session continuity is critical:** Always use the same page instance after login.
- **Dynamic content requires patience:** Use longer waits and retries for iframe/editor content.
- **Logging is invaluable:** Detailed logs make QA and troubleshooting much easier.
- **Output format must match migration needs:** Always check downstream compatibility.
- **Graceful degradation:** Log and skip errors, but never halt the entire process for one failure.

---

This section should be referenced for any future FAQ scraping or migration work, or when onboarding new developers to the project. 

## Lessons Learned (Unified)
- **Session continuity is critical:** Always use the same page instance after login.
- **Dynamic content requires patience:** Use longer waits and retries for iframe/editor content (see FAQ Scraping & Migration for the post-processing retry loop pattern).
- **Logging is invaluable:** Detailed logs make QA and troubleshooting much easier.
- **Output format must match migration needs:** Always check downstream compatibility and document output structure.
- **Graceful degradation:** Log and skip errors, but never halt the entire process for one failure.
- **Reference patterns:** The FAQ Scraping & Migration section is a model for future documentation and implementation.

## Unified Site Directory Naming and LLM Workflow (2024)

### Site Directory Naming
- All scripts and operations that output site data must use the shared `getSafeSiteDirName` helper (in `lib/helpers/siteName.ts`) to create directories under `data/<siteName>/`.
- This prevents duplicate or mismatched directories, even if site names contain special characters or spaces.

### LLM JSON Workflow
- Each site has its own JSON file at `data/<siteName>/analyst-committee-llm.json`.
- The JSON includes:
  - `llmComplete` flag (set to `false` initially, `true` after LLM processing)
  - Explicit instructions for the LLM to fill in the `analysts`, `committees`, and `committeeMembers` arrays directly in the file, with no feedback, analysis, or extra output.
  - Example objects for LLM reference.
- LLMs are instructed to only fill in the arrays for the site, set `llmComplete` to `true` when done, and not alter any other part of the file.

### Validation and Migration Readiness
- After LLM processing, the JSON is reviewed to ensure all analysts, committees, and committee members are present and correctly mapped.
- Migration scripts should only consume JSONs with `llmComplete: true` and validated data.
- This approach ensures reliable, accurate migration with no missing or incorrect results, and keeps the codebase maintainable and robust.

## Recent Important Changes (2024)

- **Committee Attachments Support:**
  - The LLM JSON workflow now supports committee-level attachments (e.g., charters, PDFs). Each committee object in the JSON includes an `attachments` array, with objects containing `attachmentName`, `attachmentURL`, and `attachmentType`.
  - LLM instructions and the `committeesExample` have been updated to reflect this new field, ensuring the LLM extracts and fills attachments for each committee when present in the HTML.

- **Unified Site Directory Naming:**
  - All scripts that output site data now use the `getSafeSiteDirName` helper for consistent, non-duplicated directory naming under `data/<siteName>/`.
  - The CLI, ScrapeFAQ, and ScrapeDocumentCategories scripts have all been updated to use this approach.

- **LLM Workflow and Migration Readiness:**
  - The LLM workflow, including per-site JSONs, the `llmComplete` flag, and strict editing requirements, is now fully documented in both the README and these notes.
  - Migration scripts should only consume JSONs with `llmComplete: true` and validated data, ensuring reliable and accurate migration.

This section should be referenced for any future FAQ scraping or migration work, or when onboarding new developers to the project. 

## Analyst Migration Automation: Progress & Learnings (2024)

### Key Improvements & Features

#### 1. Idempotent and Robust Analyst Addition
- The migration script now checks for existing analysts in the table before adding new ones, preventing duplicates.
- Analysts are only added if not already present, making the process safe to re-run.

#### 2. Order Preservation
- Analysts are added strictly in the order they appear in the JSON.
- For each analyst, the script checks if they are present at the correct position in the table.
- If not, it attempts to add them, retrying up to 5 times before moving on.
- After all adds, the script verifies that the table order matches the JSON order and logs a warning if not.

#### 3. Per-Entry Retry Logic
- If an analyst fails to be added (e.g., due to UI timeouts), the script retries up to 5 times before logging an error.
- Only after a successful add (verified in the table) does it move to the next analyst.

#### 4. Field Mapping & Data Normalization
- Both `address` and `location` fields in the JSON are mapped to the UI "Location" field.
- The script always fills the Location field with either value, preferring `location` if both exist.
- This ensures analysts with only an `address` (or only a `location`) are handled correctly.

#### 5. JSON Cleanup Operation
- A CLI-accessible operation (`cleanAnalystCommitteeJson`) was created to remove unnecessary fields (`html`, `instructions`, `analystsExample`, `committeesExample`, `committeeMembersExample`, `llmComplete`) from the analyst-committee-llm.json files.
- This produces minimal, production-ready JSON for downstream use.

#### 6. LLM Instruction Update
- The LLM instruction for JSON setup was updated to explicitly require extraction of analyst URLs if available.
- This ensures all relevant data is captured for each analyst.

#### 7. CLI Integration
- All operations, including migration and cleanup, are accessible from the CLI with clear menu options and logging.
- The workflow supports site selection, operation selection, and robust error handling.

### Key Learnings
- **Idempotency is critical** for safe, repeatable migrations.
- **Order matters**: UI tables may not preserve order unless enforced by the script.
- **Field aliasing** (address/location) is essential for data consistency.
- **Retries and verification** are necessary to handle UI flakiness and ensure completeness.
- **Automated cleanup** of intermediate fields keeps the data pipeline clean and maintainable.
- **Clear logging and final verification** make it easy to audit and trust the migration process.

### Next Steps / Recommendations
- Consider adding stricter error handling or notifications for persistent failures.
- Optionally, implement a "strict mode" to halt on any order mismatch or missing analyst.
- Continue to refine field mapping as new data sources or requirements emerge.

---

*This documentation reflects the state and learnings of the analyst migration automation as of mid-2024. For future contributors: review this section before making major changes to the migration or cleanup logic.* 

## Committee Migration Implementation Learnings

### Page State Management
1. **Angular Navigation Handling**
   - Angular applications require careful state management
   - Page refreshes don't work the same way as traditional web apps
   - Need to verify page state after navigation/redirects
   - Use `domcontentloaded` instead of `networkidle0` for faster initial load

2. **State Verification**
   - Always verify we're on the correct page before actions
   - Check for presence/absence of key elements
   - Example: Verify list page by checking for create button and absence of edit form
   ```typescript
   const isListPage = await this.verifyListPage(page);
   if (!isListPage) {
       // Handle incorrect state
   }
   ```

### Error Recovery
1. **Recovery Strategy**
   - Implement automatic recovery from error states
   - Refresh page when in incorrect state
   - Wait for Angular to initialize
   - Verify recovery was successful
   ```typescript
   private async recoverFromError(page: Page): Promise<boolean> {
       await page.reload({ waitUntil: 'domcontentloaded' });
       await page.waitForTimeout(5000);
       return await this.verifyListPage(page);
   }
   ```

2. **Input Handling**
   - Angular input fields require proper event triggering
   - Direct value setting doesn't work reliably
   - Use keyboard events for reliable input:
   ```typescript
   await page.click(inputSelector, { clickCount: 3 }); // Select all
   await page.keyboard.press('Backspace'); // Clear
   await page.keyboard.type(value); // Type new value
   ```

### Best Practices
1. **Page Load Strategy**
   - Use appropriate wait conditions
   - Wait for Angular initialization
   - Check for loading indicators
   - Verify page state after load

2. **Error Handling**
   - Implement retry logic with exponential backoff
   - Log detailed error information
   - Provide clear error messages
   - Handle specific error cases

3. **State Management**
   - Track success/failure counts
   - Maintain list of pending items
   - Verify state after each operation
   - Implement maximum retry limits

4. **Performance Optimization**
   - Avoid unnecessary page refreshes
   - Use efficient input methods
   - Implement proper wait times
   - Handle loading states appropriately

### Key Takeaways
1. Angular applications require special handling for:
   - Page navigation
   - State management
   - Input handling
   - Error recovery

2. Always verify page state before actions
3. Implement proper error recovery
4. Use appropriate wait conditions
5. Handle loading states
6. Provide detailed logging 