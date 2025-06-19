export interface Objectifiable {
  objectify();
}

export function objectify(o: Objectifiable){
  return o.objectify();
}

export function objectifyArray<T>(arr: Array<Objectifiable>): Array<T> {
  return arr.map((entry) => entry.objectify());
}