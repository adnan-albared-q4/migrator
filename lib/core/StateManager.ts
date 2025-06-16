import { SiteConfig, MigratorState, SiteState, GlobalState, LoginStatus, OperationStatus } from './types';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';

export class StateManager {
    private static instance: StateManager;
    private state: MigratorState;
    private stateFilePath: string;
    
    private constructor() {
        // Initialize with default state
        this.state = {
            global: {
                activeSites: 0,
                maxConcurrentSites: 6,
                lastUpdated: Date.now()
            },
            sites: {}
        };
        
        // Set up state file path in data/state directory
        const stateDir = join(process.cwd(), 'data', 'state');
        this.stateFilePath = join(stateDir, 'site_status.json');
        
        // Create state directory if it doesn't exist
        if (!existsSync(stateDir)) {
            mkdirSync(stateDir, { recursive: true });
        }
        
        // Load existing state if available
        this.loadState();
    }
    
    public static getInstance(): StateManager {
        if (!StateManager.instance) {
            StateManager.instance = new StateManager();
        }
        return StateManager.instance;
    }
    
    private loadState(): void {
        try {
            if (existsSync(this.stateFilePath)) {
                const fileContent = readFileSync(this.stateFilePath, 'utf8');
                this.state = JSON.parse(fileContent);
                console.log(chalk.green('State loaded successfully'));
            }
        } catch (error) {
            console.error(chalk.red('Error loading state:'), error);
            // Keep using default state if load fails
        }
    }
    
    private saveState(): void {
        try {
            writeFileSync(this.stateFilePath, JSON.stringify(this.state, null, 2));
        } catch (error) {
            console.error(chalk.red('Error saving state:'), error);
        }
    }
    
    // Global state methods
    public getGlobalState(): GlobalState {
        return { ...this.state.global };
    }
    
    public updateGlobalState(update: Partial<GlobalState>): void {
        this.state.global = {
            ...this.state.global,
            ...update,
            lastUpdated: Date.now()
        };
        this.saveState();
    }
    
    // Site state methods
    public initializeSite(site: SiteConfig): void {
        if (!this.state.sites[site.destination]) {
            this.state.sites[site.destination] = {
                config: site,
                loginStatus: 'logged-out',
                currentOperation: null,
                operationStatus: 'not-started',
                lastUpdated: Date.now(),
                dashboardVerified: false,
                llmComplete: false
            };
            this.saveState();
        }
    }
    
    public getSiteState(siteDestination: string): SiteState | null {
        return this.state.sites[siteDestination] ? { ...this.state.sites[siteDestination] } : null;
    }
    
    public updateSiteState(siteDestination: string, update: Partial<SiteState>): void {
        if (this.state.sites[siteDestination]) {
            this.state.sites[siteDestination] = {
                ...this.state.sites[siteDestination],
                ...update,
                llmComplete: (update.llmComplete !== undefined)
                  ? update.llmComplete
                  : this.state.sites[siteDestination].llmComplete,
                lastUpdated: Date.now()
            };
            this.saveState();
        }
    }
    
    public updateSiteLoginStatus(siteDestination: string, status: LoginStatus): void {
        this.updateSiteState(siteDestination, { 
            loginStatus: status,
            dashboardVerified: status === 'logged-in'
        });
    }
    
    public updateSiteOperation(siteDestination: string, operation: string | null, status: OperationStatus): void {
        this.updateSiteState(siteDestination, {
            currentOperation: operation,
            operationStatus: status
        });
    }
    
    public setError(siteDestination: string, error: string): void {
        this.updateSiteState(siteDestination, {
            lastError: error,
            operationStatus: 'failed'
        });
    }
    
    // Utility methods
    public getActiveSites(): string[] {
        return Object.keys(this.state.sites).filter(
            destination => this.state.sites[destination].operationStatus === 'running'
        );
    }
    
    public canStartNewSite(): boolean {
        return this.state.global.activeSites < this.state.global.maxConcurrentSites;
    }
    
    public clearSiteState(siteDestination: string): void {
        delete this.state.sites[siteDestination];
        this.saveState();
    }
    
    public clearAllState(): void {
        this.state = {
            global: {
                activeSites: 0,
                maxConcurrentSites: 6,
                lastUpdated: Date.now()
            },
            sites: {}
        };
        this.saveState();
    }
} 