export enum Meridiem {
  AM = 'AM',
  PM = 'PM'
}

export class MeridiemUtil {
  public static parse(m: Meridiem){
    if (Meridiem[m]){
      return Meridiem[m];
    }
    else {
      throw new Error(`${m} is a not a valid Meridiem.`);
    }
  }
}

const CMSDefaultValues = {
  hour: '12',
  minute: '00',
  meridiem: Meridiem.AM,
}

interface TimeValue {
  validator(x: TimeInput): number;
  get(): number;
}

type TimeInput = number | string | TimeValue | null;

export type ScraperTime = {
  hour: string,
  minute: string,
  meridiem: string,
}

export class CMSTime {
  private _hour: Hour;
  private _minute: Minute;
  private _meridiem: Meridiem;
  constructor(h: TimeInput = CMSDefaultValues.hour, m: TimeInput = CMSDefaultValues.minute, meridiem: Meridiem | string = CMSDefaultValues.meridiem){
    this._hour = new Hour(h);
    this._minute = new Minute(m);
    this._meridiem = typeof meridiem === 'string' ? MeridiemUtil.parse(meridiem as Meridiem) : meridiem;
  }
  public get minute(): string {
    return String(this._minute.get()).padStart(2, '0');
  }
  public set minute(m: string){
    this._minute = new Minute(m);
  }
  public get hour(): string {
    return String(this._hour.get());
  }
  public get meridiem(): string {
    return this._meridiem;
  }
  public objectify(): ScraperTime {
    const hour = String(this._hour.get());
    const minute = String(this._minute.get()).padStart(2, '0');
    return {
      hour,
      minute,
      meridiem: this._meridiem,
    }
  }
  public equals(other: CMSTime){
    return this._minute.get().toString() === other.minute && this._hour.get().toString() === other.hour && this._meridiem === other.meridiem;
  }
  public static convertStringToCMSTime(str: string): CMSTime {
    const upper = str.toUpperCase();
    
    let meridiem, hour, minute;
    let match = upper.match(/(AM|PM|A\.M\.|P\.M\.)/);
    if (match !== null){
      meridiem = MeridiemUtil.parse(match[0].replace(/\./g, '') as Meridiem);
    } else {
      console.log('No meridiem provided. Defaulting to AM');
      meridiem = Meridiem.AM;
    }

    match = upper.match(/(\d{1,2}\:\d{2}|\d{1,2}\.\d{2})/);
    if (match !== null){
      let nums = match[0].replace(/\./g, ':').split(':');
      hour = nums[0];
      minute = nums[1];
    } else {
      throw new Error(`Unable to parse time: ${str}`);
    }

    return new CMSTime(hour, minute, meridiem);
  }
}

class Minute implements TimeValue {
  m: number;
  constructor(m: TimeInput) {
    this.m = this.validator(m);
  }
  validator(x: TimeInput): number {
    if (x === null) {
      throw new Error('Minute value cannot be null');
    }
    if (typeof x === 'string') {
      x = parseInt(x);
    } else if (typeof x !== 'number' && x !== null) {
      x = x.get();
    }
    if (isNaN(x) || x < 0 || x > 59) {
      throw new Error(`${x} is not a valid Minute.`);
    }
    return x;
  }
  get(): number {
    return this.m;
  }
}

class Hour implements TimeValue {
  h: number;
  constructor(m: TimeInput) {
    this.h = this.validator(m);
  }
  validator(x: TimeInput): number {
    if (x === null) {
      throw new Error('Hour value cannot be null');
    }
    if (typeof x === 'string') {
      x = parseInt(x);
    } else if (typeof x !== 'number' && x !== null) {
      x = x.get();
    }
    if (isNaN(x) || x < 1 || x > 12) {
      throw new Error(`${x} is not a valid Hour.`);
    }
    return x;
  }
  get(): number {
    return this.h;
  }
}

export function convert24HourTimeToCMSTime(str: string){
  let [h, m] = str.split(':').map((s) => parseInt(s));
  let meridiem = Meridiem.AM;
  if (h >= 12){
    meridiem = Meridiem.PM;
    if (h > 12){
      h -= 12;
    }
  }
  return new CMSTime(h, m, meridiem);
}