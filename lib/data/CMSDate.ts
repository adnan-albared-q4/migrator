const MIN_MONTH = 1;
const MAX_MONTH = 12;

const MIN_DAY = 1;
const MAX_DAY = 31;

const MIN_YEAR = 1950;
const MAX_YEAR = 3000;

interface DateValue {
  validate(a: string | number | DateValue): number;
  get(): number;
}

type DateInput = number | string | DateValue;

export class CMSDate {
  private _day: Day;
  private _month: Month;
  private _year: Year;
  constructor(date: string);
  constructor(date: CMSDate);
  constructor(month: DateInput, day: DateInput, year: DateInput);
  constructor(dateOrMonth: DateInput | string | CMSDate, day?: DateInput, year?: DateInput) {
    if (typeof dateOrMonth === 'string') {
      try {
        const [m, d, y] = dateOrMonth.split('/');
        this._day = new Day(d);
        this._month = new Month(m);
        this._year = new Year(y);
      } catch(e) {
        throw new Error(`${dateOrMonth} is not in a proper format, must be mm/dd/yyyy`);
      }
    } else if (dateOrMonth instanceof CMSDate) {
      this._day = dateOrMonth.day;
      this._month = dateOrMonth.month;
      this._year = dateOrMonth.year;
    } else {
      if (!day || !year) {
        throw new Error('When using separate date components, all values must be provided');
      }
      this._day = new Day(day);
      this._month = new Month(dateOrMonth);
      this._year = new Year(year);
    }    
  }
  to_string(): string {
    return `${this.printMonth()}/${this.printDay()}/${this.printYear()}`;
  }
  public printDay(): string {
    return String(this._day.get()).padStart(2, '0');
  }
  public get day(): Day {
    return this._day;
  }  
  public printMonth(): string {
    return String(this._month.get()).padStart(2, '0');
  }
  public get month(): Month {
    return this._month;
  }
  public printYear(): string {
    return String(this._year.get());
  }
  public get year(): Year {
    return this._year;
  }
}

export class Month implements DateValue {
  month: number;
  constructor(m: DateInput){
    this.month = this.validate(m);
  }
  get(): number {
    return this.month;
  }
  validate(a: DateInput): number {
    if (typeof a === 'string'){
      a = parseInt(a);
    }
    else if (typeof a !== 'number') {
      a = a.get();
    }
    if (a >= MIN_MONTH && a <= MAX_MONTH){
      return a;
    }
    throw new Error(`${a} is not a valid month.`);
  }
}

export class Day implements DateValue {
  private _day: number;

  constructor(day: DateInput) {
    this._day = this.validate(day);
  }

  validate(day: DateInput): number {
    if (day === undefined) {
      throw new Error('Day value cannot be undefined');
    }
    if (day instanceof Day) {
      return day.get();
    }
    const d = Number(day);
    if (isNaN(d) || d < 1 || d > 31) {
      throw new Error(`${day} is not a valid day`);
    }
    return d;
  }

  get(): number {
    return this._day;
  }
}

export class Year implements DateValue {
  private _year: number;

  constructor(year: DateInput) {
    this._year = this.validate(year);
  }

  validate(year: DateInput): number {
    if (year === undefined) {
      throw new Error('Year value cannot be undefined');
    }
    if (year instanceof Year) {
      return year.get();
    }
    const y = Number(year);
    if (isNaN(y) || y < 1900 || y > 2100) {
      throw new Error(`${year} is not a valid year`);
    }
    return y;
  }

  get(): number {
    return this._year;
  }
}