import { writeToFile } from '../../lib/helpers/FileSystem';
import path from 'path';
import fs from 'fs';

interface DateObject {
    _day: { _day: number };
    _month: { month: number };
    _year: { _year: number };
}

interface DownloadItem {
    _description?: string;
    _title: string;
    _date: DateObject;
    [key: string]: any;
}

function formatDateFromObject(date: DateObject): string {
    return `${date._year._year}-${String(date._month.month).padStart(2, '0')}-${String(date._day._day).padStart(2, '0')}`;
}

async function main() {
    console.log('🔄 Starting title transformation...');
    
    // Read the JSON file
    const filePath = path.join(__dirname, 'scraperMetadata', '02-download-details.json');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as DownloadItem[];
    
    console.log(`📚 Found ${data.length} items to process`);
    
    let matchingDates = 0;
    let mismatchedDates = 0;
    let missingDates = 0;
    
    // Process each item
    for (const item of data) {
        if (item._description) {
            try {
                // Parse the description - it's in CSV format with quotes
                const parts = item._description
                    .split(',')
                    .map((part: string) => part.trim().replace(/^"|"$/g, '')); // Remove quotes
                
                if (parts.length >= 3) {
                    const [name, code, dateStr] = parts;
                    
                    // Update title
                    item._title = `${name} (${code})`;
                    
                    // Compare dates
                    const objectDate = formatDateFromObject(item._date);
                    const descriptionDate = dateStr;
                    
                    if (objectDate === descriptionDate) {
                        matchingDates++;
                        console.log(`✅ Date match for "${item._title}": ${objectDate}`);
                    } else {
                        mismatchedDates++;
                        console.log(`❌ Date mismatch for "${item._title}":`);
                        console.log(`   Object date: ${objectDate}`);
                        console.log(`   Description date: ${descriptionDate}`);
                    }
                } else {
                    missingDates++;
                    console.log(`⚠️ Missing date in description for "${item._title}"`);
                }
            } catch (error) {
                console.log(`⚠️ Error processing description: ${item._description}`);
            }
        }
    }
    
    // Write back to a new file to be safe
    writeToFile({
        filename: '02-download-details-transformed.json',
        directory: path.join(__dirname, 'scraperMetadata'),
        data: JSON.stringify(data, null, 4)
    });
    
    console.log('\n📊 Date Validation Summary:');
    console.log(`   Matching dates: ${matchingDates}`);
    console.log(`   Mismatched dates: ${mismatchedDates}`);
    console.log(`   Missing dates: ${missingDates}`);
    console.log(`   Total items: ${data.length}`);
    
    console.log('\n✨ Transformation complete!');
    console.log('📄 Results written to 02-download-details-transformed.json');
}

main().catch(error => {
    console.error('❌ Error:', (error as Error).message);
    process.exit(1);
}); 