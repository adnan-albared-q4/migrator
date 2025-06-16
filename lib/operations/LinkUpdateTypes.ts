export interface LinkUpdate {
    oldPath: string;
    newPath: string;
    selector?: string;
}

export interface SavedLinkUpdates {
    name: string;
    updates: LinkUpdate[];
    createdAt: string;
} 