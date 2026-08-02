/**
 * Narrow, hand-written ambient declaration for `jsfive@0.4.0`.
 *
 * The package ships NO type definitions (`main`/`module`/`exports` are present, `types` is not —
 * verified against the INSTALLED package, not just the registry metadata), so without this file
 * the import is an implicit `any` and the repo's `strict` promise would be a lie at the one place
 * it matters most: the boundary where third-party bytes enter.
 *
 * ## What this file deliberately does NOT do
 * It does not describe `jsfive` accurately or completely. It describes the SMALLEST surface we
 * call, with the WEAKEST honest types — `unknown` wherever the library's real return type depends
 * on the file's contents. `value`, `shape`, `attrs`, `dtype` and `fillvalue` are all `unknown` on
 * purpose: the library genuinely can return a number array, a string array, a nested dtype tuple
 * or `undefined` depending on bytes we do not control, and typing them as `number[]` here would
 * launder a runtime assumption into a compile-time guarantee. Every one of them is validated at
 * runtime in `jsfive.adapter.ts`, which is the only file allowed to import this module.
 *
 * There is no `any` in this file, and none is needed.
 */
declare module 'jsfive' {
  export class Group {
    /** Names of the child datasets/groups at this level. */
    readonly keys: unknown;
    /** Attribute bag; values depend entirely on the file. */
    readonly attrs: unknown;
    get(name: string): unknown;
  }

  export class Dataset {
    /** Flat, C-ordered data. Element type depends on the HDF5 datatype. */
    readonly value: unknown;
    /** Dimension sizes, outermost first. */
    readonly shape: unknown;
    readonly attrs: unknown;
    /** numpy-style dtype string (e.g. `'<f4'`) OR a tuple-ish array for compound/VLEN types. */
    readonly dtype: unknown;
    readonly fillvalue: unknown;
  }

  export class File extends Group {
    constructor(buffer: ArrayBuffer, filename?: string);
  }
}
