import { Base } from './Base';
import { readFileSync } from 'fs';
import { join } from 'path';
import { levenshteinDistance } from '../utils/string';
import { getSafeSiteDirName } from '../helpers/siteName';
import { existsSync, mkdirSync } from 'fs';

interface Department {
    name: string;
    persons: Person[];
}

interface Person {
    firstName: string;
    lastName: string;
    title?: string;
    description?: string;
    suffix?: string;
    department: string;
    committeeMemberships?: CommitteeMembership[];
    specialRoles?: string[];
}

interface CommitteeMembership {
    name: string;
    role: string;
}

interface LLMPerson {
    name: string;
    committees: Array<{
        committee: string;
        membershipRole: string;
    }>;
    specialRoles: string[];
}

interface MatchResult {
    person: Person;
    llmPerson: LLMPerson;
    matchType: 'exact' | 'normalized' | 'fuzzy-high' | 'fuzzy-low' | 'ordered';
    confidence: number;
}

export class MergePersonData extends Base {
    private persons: Person[] = [];
    private llmPersons: LLMPerson[] = [];
    private matchedPairs: MatchResult[] = [];
    private unmatchedPersons: Person[] = [];
    private unmatchedLLM: LLMPerson[] = [];

    constructor(site: any, loginManager?: any) {
        super(site, loginManager);
    }

    private normalizeName(name: string): string {
        return name
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .replace(/\b(jr|sr|ii|iii|iv)\b/g, '')
            .trim();
    }

    private getFullName(person: Person): string {
        return `${person.firstName} ${person.lastName}`.trim();
    }

    private findExactMatches(persons: Person[], llmPersons: LLMPerson[]): MatchResult[] {
        const matches: MatchResult[] = [];
        const remainingPersons = [...persons];
        const remainingLLM = [...llmPersons];

        for (let i = remainingPersons.length - 1; i >= 0; i--) {
            const person = remainingPersons[i];
            const personFullName = this.getFullName(person);

            for (let j = remainingLLM.length - 1; j >= 0; j--) {
                const llmPerson = remainingLLM[j];
                if (personFullName === llmPerson.name) {
                    console.log(`matched "${personFullName}" from person with "${llmPerson.name}" from llm (matchType: exact, confidence: 1)`);
                    matches.push({
                        person,
                        llmPerson,
                        matchType: 'exact',
                        confidence: 1
                    });
                    remainingPersons.splice(i, 1);
                    remainingLLM.splice(j, 1);
                    break;
                }
            }
        }

        return matches;
    }

    private findNormalizedMatches(persons: Person[], llmPersons: LLMPerson[]): MatchResult[] {
        const matches: MatchResult[] = [];
        const remainingPersons = [...persons];
        const remainingLLM = [...llmPersons];

        for (let i = remainingPersons.length - 1; i >= 0; i--) {
            const person = remainingPersons[i];
            const personNormalized = this.normalizeName(this.getFullName(person));

            for (let j = remainingLLM.length - 1; j >= 0; j--) {
                const llmPerson = remainingLLM[j];
                const llmNormalized = this.normalizeName(llmPerson.name);

                if (personNormalized === llmNormalized) {
                    console.log(`matched "${this.getFullName(person)}" from person with "${llmPerson.name}" from llm (matchType: normalized, confidence: 0.95)`);
                    matches.push({
                        person,
                        llmPerson,
                        matchType: 'normalized',
                        confidence: 0.95
                    });
                    remainingPersons.splice(i, 1);
                    remainingLLM.splice(j, 1);
                    break;
                }
            }
        }

        return matches;
    }

    private findFuzzyMatches(persons: Person[], llmPersons: LLMPerson[], threshold: number): MatchResult[] {
        const matches: MatchResult[] = [];
        const remainingPersons = [...persons];
        const remainingLLM = [...llmPersons];

        for (let i = remainingPersons.length - 1; i >= 0; i--) {
            const person = remainingPersons[i];
            const personNormalized = this.normalizeName(this.getFullName(person));
            let bestMatch: { llmPerson: LLMPerson; similarity: number } | null = null;

            for (let j = remainingLLM.length - 1; j >= 0; j--) {
                const llmPerson = remainingLLM[j];
                const llmNormalized = this.normalizeName(llmPerson.name);
                const distance = levenshteinDistance(personNormalized, llmNormalized);
                const maxLength = Math.max(personNormalized.length, llmNormalized.length);
                const similarity = 1 - distance / maxLength;

                if (similarity >= threshold && (!bestMatch || similarity > bestMatch.similarity)) {
                    bestMatch = { llmPerson, similarity };
                }
            }

            if (bestMatch) {
                const matchType = threshold >= 0.85 ? 'fuzzy-high' : 'fuzzy-low';
                console.log(`matched "${this.getFullName(person)}" from person with "${bestMatch.llmPerson.name}" from llm (matchType: ${matchType}, confidence: ${bestMatch.similarity.toFixed(2)})`);
                matches.push({
                    person,
                    llmPerson: bestMatch.llmPerson,
                    matchType: matchType as any,
                    confidence: bestMatch.similarity
                });
                remainingPersons.splice(i, 1);
                const llmIndex = remainingLLM.findIndex(p => p === bestMatch!.llmPerson);
                if (llmIndex !== -1) {
                    remainingLLM.splice(llmIndex, 1);
                }
            }
        }

        return matches;
    }

    private findOrderedNameMatches(persons: Person[], llmPersons: LLMPerson[]): MatchResult[] {
        const matches: MatchResult[] = [];
        const remainingPersons = [...persons];
        const remainingLLM = [...llmPersons];

        for (let i = remainingPersons.length - 1; i >= 0; i--) {
            const person = remainingPersons[i];
            // Construct full name from firstName + lastName
            const personFullName = `${person.firstName} ${person.lastName}`.toLowerCase();
            const personNameParts = personFullName.split(/\s+/);

            for (let j = remainingLLM.length - 1; j >= 0; j--) {
                const llmPerson = remainingLLM[j];
                const llmNameParts = llmPerson.name.toLowerCase().split(/\s+/);

                // Count matching names in order
                let matchCount = 0;
                let personIndex = 0;
                let llmIndex = 0;

                while (personIndex < personNameParts.length && llmIndex < llmNameParts.length) {
                    if (personNameParts[personIndex] === llmNameParts[llmIndex]) {
                        matchCount++;
                        personIndex++;
                        llmIndex++;
                    } else {
                        // Skip middle initials and suffixes in both names
                        if (personNameParts[personIndex].match(/^[a-z]\.$/) || 
                            personNameParts[personIndex].match(/^(jr\.|sr\.|ii|iii|iv)$/i)) {
                            personIndex++;
                        } else if (llmNameParts[llmIndex].match(/^[a-z]\.$/) || 
                                 llmNameParts[llmIndex].match(/^(jr\.|sr\.|ii|iii|iv)$/i)) {
                            llmIndex++;
                        } else {
                            personIndex++;
                        }
                    }
                }

                // If we found at least 2 matching names in order, consider it a match
                if (matchCount >= 2) {
                    console.log(`matched "${person.firstName} ${person.lastName}" from person with "${llmPerson.name}" from llm (matchType: ordered, confidence: 0.9)`);
                    matches.push({
                        person,
                        llmPerson,
                        matchType: 'ordered',
                        confidence: 0.9
                    });
                    remainingPersons.splice(i, 1);
                    remainingLLM.splice(j, 1);
                    break;
                }
            }
        }

        return matches;
    }

    private mergeData(): void {
        // Load data
        const safeSiteName = getSafeSiteDirName(this.site.name);
        const personsData = JSON.parse(readFileSync(join(process.cwd(), 'data', safeSiteName, 'persons', 'persons.json'), 'utf-8'));
        const llmData = JSON.parse(readFileSync(join(process.cwd(), 'data', safeSiteName, 'analyst-committee-llm.json'), 'utf-8'));

        // Extract persons from departments
        this.persons = personsData.departments.flatMap((dept: Department) =>
            dept.persons.map((person: Person) => ({
                ...person,
                department: dept.name
            }))
        );

        // Extract LLM persons - fix the data structure access
        this.llmPersons = llmData.committeeMembers;

        // Find matches in order of strictness
        const exactMatches = this.findExactMatches(this.persons, this.llmPersons);
        this.matchedPairs.push(...exactMatches);

        const normalizedMatches = this.findNormalizedMatches(
            this.persons.filter(p => !exactMatches.some(m => m.person === p)),
            this.llmPersons.filter(p => !exactMatches.some(m => m.llmPerson === p))
        );
        this.matchedPairs.push(...normalizedMatches);

        const fuzzyMatchesHigh = this.findFuzzyMatches(
            this.persons.filter(p => !this.matchedPairs.some(m => m.person === p)),
            this.llmPersons.filter(p => !this.matchedPairs.some(m => m.llmPerson === p)),
            0.85
        );
        this.matchedPairs.push(...fuzzyMatchesHigh);

        const fuzzyMatchesLow = this.findFuzzyMatches(
            this.persons.filter(p => !this.matchedPairs.some(m => m.person === p)),
            this.llmPersons.filter(p => !this.matchedPairs.some(m => m.llmPerson === p)),
            0.75
        );
        this.matchedPairs.push(...fuzzyMatchesLow);

        // Add ordered name matching as the final step
        const orderedMatches = this.findOrderedNameMatches(
            this.persons.filter(p => !this.matchedPairs.some(m => m.person === p)),
            this.llmPersons.filter(p => !this.matchedPairs.some(m => m.llmPerson === p))
        );
        this.matchedPairs.push(...orderedMatches);

        // Update persons with committee data
        this.matchedPairs.forEach(match => {
            const person = match.person;
            const llmPerson = match.llmPerson;

            // Map committee data using the correct field names
            person.committeeMemberships = llmPerson.committees.map(committee => ({
                name: committee.committee,  // Changed from committeeId to committee
                role: committee.membershipRole
            }));
            person.specialRoles = llmPerson.specialRoles;
        });

        // Keep track of unmatched entries
        this.unmatchedPersons = this.persons.filter(p => !this.matchedPairs.some(m => m.person === p));
        this.unmatchedLLM = this.llmPersons.filter(p => !this.matchedPairs.some(m => m.llmPerson === p));
    }

    private mergeDuplicatePersonData(): void {
        // Create a map of normalized names to person instances
        const personMap = new Map<string, Person[]>();
        
        // Group persons by their normalized full name
        this.persons.forEach(person => {
            const normalizedName = this.normalizeName(this.getFullName(person));
            const existing = personMap.get(normalizedName) || [];
            existing.push(person);
            personMap.set(normalizedName, existing);
        });

        // For each group of persons with the same name
        personMap.forEach((instances, normalizedName) => {
            if (instances.length > 1) { // Only process if there are duplicates
                // Find the first instance with committee data
                const sourceInstance = instances.find(p => 
                    (p.committeeMemberships && p.committeeMemberships.length > 0) || 
                    (p.specialRoles && p.specialRoles.length > 0)
                );
                
                if (sourceInstance) {
                    // Copy the data to all other instances
                    instances.forEach(targetInstance => {
                        if (targetInstance !== sourceInstance) {
                            targetInstance.committeeMemberships = sourceInstance.committeeMemberships;
                            targetInstance.specialRoles = sourceInstance.specialRoles;
                        }
                    });
                }
            }
        });
    }

    // Helper to normalize committee membership roles
    private normalizeCommitteeRole(role: string): string {
        const r = role.trim().toLowerCase().replace(/[-_ ]/g, '');
        if (r.includes('chair') && !r.includes('vice')) return 'Committee Chair';
        if (r.includes('vicechair')) return 'Vice Chair';
        if (r.includes('nonmember')) return 'Non-Member';
        return 'Committee Member';
    }

    public async execute(): Promise<boolean> {
        try {
            this.mergeData();

            // Merge committee data for duplicate persons across departments
            this.mergeDuplicatePersonData();

            // Log results
            console.log('\nMatching Results:');
            console.log('----------------');
            console.log(`Total persons: ${this.persons.length}`);
            console.log(`Total LLM entries: ${this.llmPersons.length}`);
            console.log(`\nMatches found: ${this.matchedPairs.length}`);
            console.log('By match type:');
            const matchTypes = this.matchedPairs.reduce((acc, match) => {
                acc[match.matchType] = (acc[match.matchType] || 0) + 1;
                return acc;
            }, {} as Record<string, number>);
            Object.entries(matchTypes).forEach(([type, count]) => {
                console.log(`- ${type}: ${count}`);
            });

            console.log(`\nUnmatched persons: ${this.unmatchedPersons.length}`);
            if (this.unmatchedPersons.length > 0) {
                console.log('Unmatched persons:');
                this.unmatchedPersons.forEach(p => console.log(`- ${this.getFullName(p)}`));
            }

            console.log(`\nUnmatched LLM entries: ${this.unmatchedLLM.length}`);
            if (this.unmatchedLLM.length > 0) {
                console.log('Unmatched LLM entries:');
                this.unmatchedLLM.forEach(p => console.log(`- ${p.name}`));
            }

            // Save merged data
            const outputData = {
                departments: this.persons.reduce((acc: Array<{ name: string; persons: Person[] }>, person) => {
                    // Normalize committeeMemberships roles before output
                    if (person.committeeMemberships && Array.isArray(person.committeeMemberships)) {
                        person.committeeMemberships = person.committeeMemberships.map(m => ({
                            ...m,
                            role: this.normalizeCommitteeRole(m.role)
                        }));
                    }
                    // Remove specialRoles and committeeMemberships for management departments
                    if (person.department && person.department.toLowerCase().includes('management')) {
                        delete person.specialRoles;
                        delete person.committeeMemberships;
                    }
                    const dept = acc.find(d => d.name === person.department);
                    if (dept) {
                        dept.persons.push(person);
                    } else {
                        acc.push({
                            name: person.department,
                            persons: [person]
                        });
                    }
                    return acc;
                }, [])
            };

            // Write to site-specific file
            const safeSiteName = getSafeSiteDirName(this.site.name);
            const personsDir = join(process.cwd(), 'data', safeSiteName, 'persons');
            if (!existsSync(personsDir)) {
                mkdirSync(personsDir, { recursive: true });
            }
            const outputPath = join(personsDir, 'persons-merged.json');
            console.log(`\nSaving merged data to: ${outputPath}`);
            require('fs').writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
            console.log('Merged data saved successfully.');
            console.log('MergePersonData script completed.');

            return true;
        } catch (error) {
            console.error('Error merging person data:', error);
            return false;
        }
    }
} 