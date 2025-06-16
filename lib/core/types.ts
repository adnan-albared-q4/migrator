export interface SiteConfig {
    name: string;
    source: string;
    destination: string;
}

export type OperationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'not-started';
export type LoginStatus = 'logged-out' | 'logging-in' | 'logged-in' | 'login-failed';

export interface SiteState {
    config: SiteConfig;
    loginStatus: LoginStatus;
    currentOperation: string | null;
    operationStatus: OperationStatus;
    lastError?: string;
    lastUpdated: number; // timestamp
    dashboardVerified: boolean;
    llmComplete?: boolean;
    llmJsonPath?: string;
    rawDataPath?: string;
    hasAnalystsList?: boolean;
    hasCommitteeComposition?: boolean;
}

export interface GlobalState {
    activeSites: number;
    maxConcurrentSites: number;
    lastUpdated: number; // timestamp
}

export interface MigratorState {
    global: GlobalState;
    sites: Record<string, SiteState>; // key is site.source
} 