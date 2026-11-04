declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

export interface IdGenerator {
  next(): string;
}

export interface Clock {
  now(): Date;
}
