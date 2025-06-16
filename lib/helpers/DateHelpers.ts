
const MONTHS_IN_YEAR = 12;
let DEFAULT_LOCALE = 'en-US';

let monthsShortform = getFullMonthName(DEFAULT_LOCALE, 'short');
let monthsLongform = getFullMonthName(DEFAULT_LOCALE, 'long');

// Builds a lookup table, like: { january: 1, february: 2 }
function getFullMonthName(locale: string, monthFormat) {
  const int = new Intl.DateTimeFormat(locale, { month: monthFormat });
  const out = {};
  for (let month = 0; month < MONTHS_IN_YEAR; ++month) {
    const monthAsString = int.format(new Date(2020, month, 1)).toLowerCase().replace('.', '');
    out[monthAsString] = month + 1;
  }
  return out;
}

// Converts a string like "January" into a month number 1
// Use locale if you need to pass in string in a different language
export function monthAsStringToNumber(str: string, locale = 'en-US') {

  str = str.replace(/[\.\,]/g, '');
  
  // Override default lookup table if locale is not 'en-US'
  if (locale !== DEFAULT_LOCALE){
    DEFAULT_LOCALE = locale;
    monthsShortform = getFullMonthName(DEFAULT_LOCALE, 'short');
    monthsLongform = getFullMonthName(DEFAULT_LOCALE, 'long');
  }

  const lowercaseMonth = str.toLowerCase();
  if (monthsShortform[lowercaseMonth]) return monthsShortform[lowercaseMonth];
  if (monthsLongform[lowercaseMonth]) return monthsLongform[lowercaseMonth];
  return -1;
}

export function extractDayAsNumberFromString(str: string): string {
  if (str.length > 2) {
    throw new Error('Days cannot be larger than two characters.');
  }
  return str.match(/[0-9]{1,2}/)[0].replace(/^0+/, '');
}

const NOON = 12;
const MIDNIGHT_IN_24HOUR_CLOCK = 0;
const MIDNIGHT_IN_12HOUR_CLOCK = 12;


export function convert24HourTo12Hour(hour: string): string {
  let h = parseInt(hour);
  if (h === NaN){
    return ''
  } else if (h >= NOON) {
    h = h - NOON;
  } 
  return h === MIDNIGHT_IN_24HOUR_CLOCK ? `${MIDNIGHT_IN_12HOUR_CLOCK}` : h.toString();
}

