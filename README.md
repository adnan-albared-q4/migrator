# Content Migration Tool

A tool for migrating content between CMS instances.

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up environment variables:
   - Copy `.env.example` to `.env`
   - Fill in your CMS credentials in `.env`
   ```bash
   cp .env.example .env
   ```
4. Configure sites.json:
   - Copy `sites.json.example` to `sites.json`
   - Fill in the site configurations in `sites.json` with your source and destination sites
   ```bash
   cp sites.json.example sites.json
   ```
5. Generate data:
   - The `data/` directory is gitignored as it contains site-specific data
   - Run the appropriate scraping operations to generate data for your sites
   - Data will be stored in `data/{siteName}/` directories

## Environment Variables

The following environment variables are required:

- `CMS_USER`: Your CMS username
- `CMS_PASSWORD`: Your CMS password

Optional:
- `PORT`: Server port (defaults to 3000)

## Architecture

### Site Configuration

The tool is designed to handle migrations between multiple source and destination sites. Site configurations are stored in a JSON format:

```json
{
  "sites": [
    {
      "name": "Example Corp",
      "source": "example2020index",
      "destination": "example2025snprd"
    }
  ]
}
```

### File Structure

```
├── lib/                    # Core library files
│   ├── data/              # Data models and types
│   ├── helpers/           # Utility functions
│   ├── scraper/          # Web scraping utilities
│   └── services/         # Service layer (CMS, etc.)
├── modules/               # Feature modules
│   ├── analyst-manager/   # Analyst management
│   ├── cleanup-manager/   # Cleanup operations
│   ├── downloads-manager/ # Downloads management
│   ├── faq-manager/      # FAQ management
│   └── person-list-manager/ # Person list management
├── public/               # Frontend assets
│   ├── css/             # Stylesheets
│   ├── js/              # Client-side JavaScript
│   └── index.html       # Main HTML file
├── main.ts              # Main application entry
├── server.js            # Backend server
└── sites.json          # Site configuration
```

#### Key Files

- **main.ts**: Application entry point, handles operations and site management
- **server.js**: Express server for the web interface
- **sites.json**: Centralized site configuration
- **public/js/main.js**: Frontend application logic
- **public/css/styles.css**: Application styling
- **lib/services/CMS.ts**: CMS service integration
- **lib/scraper/PuppeteerHelper.ts**: Browser automation utilities

### Operations

The tool supports multiple operations, each handling different types of content:

#### Delete Operations
- `delete-all`: Delete all content types
- `delete-persons`: Delete person entries
- `delete-faqs`: Delete FAQ entries
- `delete-analysts`: Delete analyst entries
- `delete-downloads`: Delete download entries
- `delete-financials`: Delete financial entries
- `delete-presentations`: Delete presentation entries
- `delete-events`: Delete event entries
- `delete-prs`: Delete press release entries

#### Scrape Operations
- `scrape-document-categories`: Scrape document categories from source site
- `scrape-faqs`: Scrape FAQs from source site

#### Migrate Operations
- `migrate-document-categories`: Migrate document categories to destination site

### FAQ Scraping

The FAQ scraping operation (`scrape-faqs`) extracts FAQ content from the source site and saves it to a JSON file. The operation:

1. Navigates to the FAQ list page
2. Identifies all active FAQ lists
3. For each list:
   - Extracts the list name, status, and last modifier
   - Processes each question in the list
   - Captures the question text and answer content
   - Records the last modified date
4. Saves the results to `output/{site-name}/faq-scrape.json`

The output JSON structure:
```json
{
  "siteName": "Example Corp",
  "faqLists": [
    {
      "name": "General FAQs",
      "lastModifiedBy": "John Doe",
      "status": "Active",
      "questions": [
        {
          "question": "What is your company?",
          "answer": "<p>We are a leading provider...</p>",
          "lastModified": "2024-03-20T10:00:00Z"
        }
      ]
    }
  ],
  "metadata": {
    "scrapeDate": "2024-03-20T10:00:00Z",
    "totalLists": 1,
    "totalQuestions": 1,
    "emptyAnswers": []
  }
}
```

### Error Handling

The tool implements robust error handling:
- Retries failed operations with exponential backoff
- Logs errors with detailed context
- Saves operation state for recovery
- Provides detailed error messages in the UI

### Performance Optimization

- Concurrent processing of multiple sites
- Efficient resource management
- Caching of frequently accessed data
- Optimized network requests

### Development Notes

See [DEVELOPMENT_NOTES.md](DEVELOPMENT_NOTES.md) for detailed information about:
- Page type handling
- Error handling strategies
- Performance optimization
- Debugging techniques

## Implementation Status

- [x] Core Framework
- [x] Site Configuration
- [x] Cleanup Operation
- [x] Document Category Scraping
- [x] Document Category Migration
- [ ] Analyst Migration
- [ ] Downloads Migration
- [ ] FAQ Migration
- [ ] Person List Migration

## Site Details Page Implementation Plan

The site details page will provide comprehensive information about each site's content and migration status:

### Phase 1: Basic Information
- Site configuration details
- Quick status overview for each content type
- Basic scraping statistics
- Recent activity log

### Phase 2: Content Type Details
- Detailed status for each content type:
  - Analysts
  - Downloads
  - FAQ
  - Person List
- Content count and last update timestamps
- Success/failure rates for migrations

### Phase 3: Active Operations
- Real-time status of running operations
- Progress indicators for ongoing scrapes
- Cancelation capability for running operations
- Resource usage statistics

### Phase 4: Historical Data
- Complete migration history
- Detailed logs per content type
- Performance metrics and trends
- Export capabilities for logs and statistics

Each phase will include proper error handling, loading states, and real-time updates via WebSocket.

## Delete Functionality Implementation Plan

The delete functionality will be implemented in phases, from basic functionality to advanced features:

### Phase 1: Basic Delete
- Remove existing delete-related code
- Implement simple delete button on each site
- Basic API endpoint for deletion
- Direct deletion without confirmation
- Simple success/error feedback
- Basic UI refresh after deletion

### Phase 2: Enhanced Delete with Modal
- Add delete confirmation modal
- Improve error handling
- Add loading states
- Enhance success/error feedback
- Implement proper UI state management
- WebSocket updates for real-time UI updates

### Phase 3: Advanced Features
- Batch delete functionality
- Delete history logging
- Undo delete capability (30-second window)
- Delete preview (show associated data)
- Keyboard shortcuts (Esc to cancel, Enter to confirm)
- Accessibility improvements

### Phase 4: Enterprise Features
- Delete scheduling
- Soft delete with recovery period
- Delete audit logs
- Permission-based delete access
- Automated backup before delete
- Bulk restore functionality

Each phase will be implemented with comprehensive testing and documentation updates.

## Scrape Functionality Implementation

### Document Categories

The tool can scrape document categories from source sites. This is useful for understanding the categorization system before migration and for ensuring categories are properly recreated in destination sites.

#### How it Works
1. Connects to the source site (not the destination site)
2. Navigates to the document category admin page
3. Scrapes "Lookup Text" and "Lookup Value" for each category
4. Saves the results to a JSON file in `data/{siteName}/lookup_list.json`

#### Data Structure
```json
[
  {
    "lookupText": "DocumentCategory",
    "lookupValue": "online"
  },
  {
    "lookupText": "DocumentCategory",
    "lookupValue": "mdna"
  },
  ...
]
```

#### Usage
Select "Scrape Operations" from the main menu, then choose "Scrape document categories from source site". The tool will process the selected sites and save category data for each one.

## Migration Functionality Implementation

### Document Categories Migration

The tool can migrate document categories from source to destination sites. This ensures that the categorization system is properly recreated in the new site.

#### How it Works
1. Loads previously scraped document category data from `data/{siteName}/lookup_list.json`
2. Connects to the destination site and scrapes its existing document categories
3. Compares the two sets to identify categories that exist in the source but not in the destination
4. For each missing category:
   - Navigates to the document category creation form
   - Fills in the form fields using the source data:
     - Lookup Type: "DocumentCategory"
     - Lookup Text: From source data
     - Lookup Value: From source data
   - Submits the form to create the category on the destination site

#### Prerequisites
This operation requires that the "Scrape document categories" operation has already been run to collect data from the source site.

#### Usage
Select "Migration Operations" from the main menu, then choose "Migrate document categories from source to destination site". The tool will process the selected sites, comparing and creating categories as needed.

## Style Guidelines

### Colors

```css
/* Primary Colors */
--primary-blue: #0f5ca3;      /* Headers, Primary buttons */
--primary-hover: #256eb0;     /* Primary button hover */
--secondary-yellow: #f1af0f;  /* Secondary buttons, Highlights */
--secondary-hover: #dc9e27;   /* Secondary button hover */

/* Neutral Colors */
--text-primary: #2a3035;      /* Main text color */
--text-secondary: #777;       /* Labels, Captions */
--background-light: #f4f4f4;  /* Page background */
--background-white: #fff;     /* Component background */
```

### Typography

```css
/* Font Family */
font-family: 'Open Sans', sans-serif;

/* Text Colors */
color: var(--text-primary);    /* Main text */
color: var(--text-secondary);  /* Secondary text */
```

### Components

#### Headers

```css
/* Page Headers */
h2 {
    background-color: var(--primary-blue);
    color: var(--background-white);
    padding: 1rem;
}

/* Table Captions */
caption {
    background: var(--secondary-yellow);
    color: var(--text-primary);
    padding: 0.5rem;
}
```

#### Buttons

```css
/* Common Button Styles */
.button {
    border-radius: 3px;
    padding: 0.5rem 1rem;
    transition: background-color 0.2s;
}

/* Primary Button */
.button--primary {
    background-color: var(--primary-blue);
    color: var(--background-white);
}
.button--primary:hover,
.button--primary:focus {
    background-color: var(--primary-hover);
}

/* Secondary Button */
.button--secondary {
    background-color: var(--secondary-yellow);
    color: var(--text-primary);
}
.button--secondary:hover,
.button--secondary:focus {
    background-color: var(--secondary-hover);
}

/* Delete Button */
.button--delete {
    background-color: #ec6a4c;    /* Danger/Delete action */
    color: #fff;
}
.button--delete:hover,
.button--delete:focus {
    background-color: #d85a3d;    /* Darker shade for hover */
}
```

### Layout

```css
/* Page Layout */
body {
    font-family: 'Open Sans', sans-serif;
    background-color: var(--background-light);
    color: var(--text-primary);
}

/* Component Containers */
.panel {
    background-color: var(--background-white);
    border-radius: 3px;
    padding: 1rem;
}

/* Dark Sections & Footer */
.section--dark,
footer {
    color: #929292;
    background-color: rgba(18,21,23,.91);
}

/* Use for sections that need the dark theme */
.section--dark {
    padding: 2rem 0;
}

footer {
    padding: 1.5rem;
    margin-top: auto;  /* Push footer to bottom */
}
```

## Development Guidelines

1. Follow the established color scheme and typography
2. Use consistent spacing (multiples of 0.5rem)
3. Maintain 3px border radius for interactive elements
4. Ensure sufficient color contrast for accessibility
5. Use semantic HTML elements
6. Include hover/focus states for interactive elements

## Usage

The Content Migration Tool is operated via a command-line interface:

```
npm run cli
```

### CLI Interface

#### Site Selection

The CLI provides an interactive multi-select interface for site selection. When you run the CLI, you'll see:

- A numbered list of available sites
- A checkbox selection menu where you can select multiple sites

**Keyboard controls:**
- Use **arrow keys** to navigate the list of sites
- Press **space** to select/deselect an individual site
- Press **a** to select/deselect all sites at once
- Press **i** to invert your current selection

This makes it easy to select multiple sites, either by selecting all sites and then deselecting a few, or by selecting specific sites individually.

#### Operations

After selecting sites, you'll be prompted to choose an operation category:
- Delete Operations (content deletion)
- Scrape Operations (extract data from sites)
- Migration Operations (transfer content between sites)

From there, you can select a specific operation to perform:

Under **Delete Operations**:
- Delete all entries (comprehensive cleanup)
- Delete all person entries
- Delete all FAQ entries
- Delete all analyst entries
- etc.

Under **Scrape Operations**:
- Scrape document categories from source site

Under **Migration Operations**:
- Migrate document categories from source to destination site

The operation will be executed on all selected sites, with a summary report at the end.

#### Concurrent Processing

The tool supports concurrent processing of multiple sites:
- Up to 6 sites can be processed simultaneously
- For Delete All operations, all 6 concurrent slots can be used
- Progress is tracked for all sites in real-time
- The browser runs in headless mode for efficiency

## Debug Mode

The following operations have debug mode turned off by default:
- DeleteFinancials
- DeletePresentations
- DeleteEvents
- DeletePRs
- ScrapeDocumentCategories
- MigrateDocumentCategories

Debug mode can be re-enabled by uncommenting the `this.enableDebugMode()` line in each operation's constructor. When debug mode is enabled, the operations will pause at each step and wait for user input before proceeding (for delete operations) or will show additional logging information (for scrape and migration operations).

## Content Deletion Features

All content deletion operations include the following features:

1. **For Approval Status Skip**: Items with "For Approval" status are automatically skipped during deletion.

2. **Bucket Selection Clearing**: Any inputs with IDs containing "BucketSelection" are automatically cleared before form submission to prevent unwanted bucket assignments.

3. **Standardized Comment**: All deletions include the comment "Deleted as part of content cleanup".

4. **Robust Dialog Handling**: Dialog confirmations are handled with a resilient approach that prevents "already handled" errors and race conditions.

## Delete All Operation

The `DeleteAll` operation sequentially executes all deletion operations for a site:

1. Delete Persons
2. Delete FAQs
3. Delete Analysts
4. Delete Downloads
5. Delete Financials
6. Delete Presentations  
7. Delete Events
8. Delete Press Releases

The operation continues even if some deletions fail, with a summary report at the end showing successful and failed operations. Failed operations are logged for manual review.

## Unified Site Directory Naming and LLM Workflow

### Site Directory Naming
- All scripts and operations that output site data use a shared helper (`getSafeSiteDirName`) to create directories under `data/<siteName>/`.
- This ensures no duplicate or mismatched directories, even if site names contain special characters or spaces.

### LLM Input/Output Workflow
- Each site has its own JSON file at `data/<siteName>/analyst-committee-llm.json`.
- The JSON includes:
  - `llmComplete` flag (set to `false` initially, `true` after LLM processing)
  - Clear instructions for the LLM to fill in the `analysts`, `committees`, and `committeeMembers` arrays directly in the file, with no feedback or extra output.
  - Example objects for LLM reference.
- LLMs are instructed to only fill in the arrays for the site, set `llmComplete` to `true` when done, and not alter any other part of the file.

### Migration Readiness and Validation
- After LLM processing, the JSON is reviewed to ensure all analysts, committees, and committee members are present and correctly mapped.
- Migration scripts should only consume JSONs with `llmComplete: true` and validated data.
- This workflow ensures reliable, accurate migration with no missing or incorrect results. 