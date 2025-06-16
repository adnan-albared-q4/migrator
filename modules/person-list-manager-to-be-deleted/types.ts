import { PersonData, PersonImage } from './_settings';

export type { PersonData, PersonImage };

export interface CommitteeMembership {
    committeeName: string;
    role: 'Member' | 'Chair' | 'ViceChair' | 'Non-Member';
} 