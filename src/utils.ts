/**
 * Return PascalCase version of snake_case string.
 * @internal
 */
export function snakeToPascal(name: string): string {
    return name
        .split('_')
        .map((v) => (v[0] ? v[0].toUpperCase() : '') + v.slice(1))
        .join('')
}

/**
 * Return camelCase version of snake_case string.
 * @internal
 */
export function snakeToCamel(name: string): string {
    const pascal = snakeToPascal(name)

    return (pascal[0] ? pascal[0].toLowerCase() : '') + pascal.slice(1)
}

/**
 * Print a warning message to console.
 * @internal
 **/
export function logWarn(...args: any[]) {
    // eslint-disable-next-line no-console
    console.warn('[anchor-link]', ...args)
}

/**
 * Generate a UUID.
 *  @internal
 * */

export function uuid(): string {
    let uuid = '',
        ii
    const chars = '0123456789abcdef'
    for (ii = 0; ii < 36; ii += 1) {
        switch (ii) {
            case 8:
            case 13:
            case 18:
            case 23:
                uuid += '-'
                break
            case 14:
                uuid += '4'
                break
            case 19:
                uuid += chars[(Math.random() * 4) | (0 + 8)]
                break
            default:
                uuid += chars[(Math.random() * 16) | 0]
        }
    }
    return uuid
}
