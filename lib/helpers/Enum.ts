export function stringToEnumValue<T extends Record<string, string>, K extends keyof T>(
  enumObj: T,
  value: string,
): T[keyof T] | undefined {
  return enumObj[
    Object.keys(enumObj).filter(
      (k) => enumObj[k as K].toString() === value,
    )[0] as keyof typeof enumObj
  ];
}