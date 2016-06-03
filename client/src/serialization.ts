export interface NativeObject {
  [ key: string ]: Native
}

function isNativeObject(value: any): value is NativeObject {
  for (const key of Object.keys(value)) {
    if (typeof key !== 'string' || !isNative(value[key])) {
      return false
    }
  }
  return true
}

export interface NativeArray extends Array<Native> {}

function isNativeArray(value: any): value is NativeArray {
  if (!Array.isArray(value)) {
    return false
  } else {
    for (const val of value) {
      if (!isNative(val)) {
        return false
      }
    }
    return true
  }
}

export type Native =
  null |
  string |
  number |
  boolean |
  Date |
// Uint8Array |
  NativeArray |
  NativeObject

function isNative(value: any): value is Native {
  return value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    value instanceof Date ||
//    value instanceof Uint8Array ||
    isNativeArray(value) ||
    isNativeObject(value)
}

export interface RawObject {
  [ key: string ]: Raw
}

export function isRawObject(value: any): value is RawObject {
  for (const key of Object.keys(value)) {
    if (typeof key !== 'string' || !isRaw(value[key])) {
      return false
    }
  }
  return true
}

export interface RawArray extends Array<Raw> {}

function isRawArray(value: any): value is RawArray {
  if (!Array.isArray(value)) {
    return false
  } else {
    for (const val of value) {
      if (!isRaw(val)) {
        return false
      }
    }
    return true
  }
}

export type Raw =
  null |
  string |
  number |
  boolean |
  PseudoTypeDate |
// PseudoTypeBinary |
  RawArray |
  RawObject

function isRaw(value: any): value is Raw {
  return value === null ||
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    isPseudoTypeDate(value) ||
//      isPseudoTypeBinary(value) ||
    isRawArray(value) ||
    isRawObject(value)
}

interface PseudoTypeDate {
  $reql_type$: 'TIME'
  epoch_time: number
  timezone: string
}

function isPseudoTypeDate(value: any): value is PseudoTypeDate {
  return (value as PseudoTypeDate).$reql_type$ === 'TIME'
}

function toDate(value: PseudoTypeDate): Date {
  const date = new Date()
  date.setTime(value.epoch_time * 1000)
  return date
}

function toPseudoTypeDate(value: Date): PseudoTypeDate {
  return {
    $reql_type$: 'TIME',
    epoch_time: value.getTime() / 1000,
    // Rethink will serialize this as "+00:00", but accepts Z
    timezone: 'Z',
  }
}

// interface PseudoTypeBinary {
//   $reql_type$: 'BINARY',
//   data: string,
// }

// function isPseudoTypeBinary(value: any): value is PseudoTypeBinary {
//   return (value as PseudoTypeBinary).$reql_type$ === 'BINARY'
// }

// TODO: implement these two functions in an isomorphic way and
// uncomment all binary stuff in this module

// function toUint8Array(value: PseudoTypeBinary): Uint8Array {
//   throw new Error('toUint8Array not implemented')
// }

// function toPseudoTypeBinary(value: Uint8Array): PseudoTypeBinary {
//   throw new Error('toPseudoTypeBinary not implemented')
// }

function toNativeObject(raw: RawObject): NativeObject {
  const native: NativeObject = {}
  Object.keys(raw).forEach((key: string) => {
    native[key] = deserialize(raw[key])
  })
  return native
}

export function deserialize(value: null): null
export function deserialize(value: string): string
export function deserialize(value: boolean): boolean
export function deserialize(value: number): number
export function deserialize(value: PseudoTypeDate): Date
// export function deserialize(value: PseudoTypeBinary): Uint8Array
export function deserialize(value: RawArray): NativeArray
export function deserialize(value: RawObject): NativeObject
export function deserialize(value: any): Native {
  if (value === null) {
    return value
  } else if (typeof value === 'string') {
    return value
  } else if (typeof value === 'boolean') {
    return value
  } else if (typeof value === 'number') {
    return value
  } else if (isPseudoTypeDate(value)) {
    return toDate(value)
//  } else if (isPseudoTypeBinary(value)) {
//    return toUint8Array(value)
  } else if (isRawArray(value)) {
    return value.map(deserialize)
  } else if (isRawObject(value)) {
    return toNativeObject(value)
  } else {
    throw new Error('Not deserializable')
  }
}

function toRawObject(native: NativeObject): RawObject {
  const raw: RawObject = {}
  Object.keys(native).forEach((key: string) => {
    raw[key] = serialize(native[key])
  })
  return raw
}

export function serialize(value: null): null
export function serialize(value: string): string
export function serialize(value: boolean): boolean
export function serialize(value: number): number
export function serialize(value: Date): PseudoTypeDate
// export function serialize(value: Uint8Array): PseudoTypeBinary
export function serialize(value: NativeArray): RawArray
export function serialize(value: NativeObject): RawObject
export function serialize(value: any): Raw {
  if (value == undefined) {
    return value
  } else if (typeof value === 'string') {
    return value
  } else if (typeof value === 'boolean') {
    return value
  } else if (typeof value === 'number') {
    return value
  } else if (isNativeArray(value)) {
    return value.map(serialize)
  } else if (value instanceof Date) {
    return toPseudoTypeDate(value)
// } else if (value instanceof Uint8Array) {
//    return toPseudoTypeBinary(value)
  } else if (isNativeObject(value)) {
    return toRawObject(value)
  } else {
    throw new Error('Not serializable')
  }
}
