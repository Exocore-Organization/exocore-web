/* Loads TypeScript lib.*.d.ts files into an in-memory map so the in-browser
 * compiler can resolve `console`, `Date`, `Promise`, DOM types, etc. — giving
 * Monaco-class diagnostics from inside CodeMirror / SimpleCodeEditor.
 *
 * Files are pulled with Vite's `?raw` glob, so each lib becomes its own lazy
 * chunk. We preload them once on first use and cache forever.
 */

const libGlob = import.meta.glob(
    [
        '../../../node_modules/typescript/lib/lib.es5.d.ts',
        '../../../node_modules/typescript/lib/lib.es6.d.ts',
        '../../../node_modules/typescript/lib/lib.es20*.d.ts',
        '../../../node_modules/typescript/lib/lib.es20*.*.d.ts',
        '../../../node_modules/typescript/lib/lib.esnext.d.ts',
        '../../../node_modules/typescript/lib/lib.esnext.*.d.ts',
        '../../../node_modules/typescript/lib/lib.dom.d.ts',
        '../../../node_modules/typescript/lib/lib.dom.*.d.ts',
        '../../../node_modules/typescript/lib/lib.webworker.d.ts',
        '../../../node_modules/typescript/lib/lib.webworker.*.d.ts',
        '../../../node_modules/typescript/lib/lib.scripthost.d.ts',
        '../../../node_modules/typescript/lib/lib.decorators.d.ts',
        '../../../node_modules/typescript/lib/lib.decorators.*.d.ts',
    ],
    { query: '?raw', import: 'default' },
) as Record<string, () => Promise<string>>;

const libCache = new Map<string, string>();
let preloadPromise: Promise<void> | null = null;

function basename(path: string): string {
    return path.substring(path.lastIndexOf('/') + 1);
}

export function preloadLibs(): Promise<void> {
    if (preloadPromise) return preloadPromise;
    preloadPromise = Promise.all(
        Object.entries(libGlob).map(async ([path, loader]) => {
            const name = basename(path);
            const text = await loader();
            libCache.set(name, text);
        }),
    ).then(() => undefined);
    return preloadPromise;
}

export function getLib(name: string): string | undefined {
    return libCache.get(basename(name));
}

export function hasLib(name: string): boolean {
    return libCache.has(basename(name));
}

export function libCount(): number {
    return libCache.size;
}
