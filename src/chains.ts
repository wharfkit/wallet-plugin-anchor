import {Checksum256Type} from '@wharfkit/antelope'

/** Built-in web-authenticator URLs keyed by Antelope chain ID. */
export const DEFAULT_WEB_AUTHENTICATOR_URLS: Record<string, string> = {
    // Vaulta
    aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906:
        'https://vaulta.anchorwallet.io',
    // Jungle 4
    '73e4385a2708e6d7048834fbc1079f2fabb17b3c125b146af438971e90716c4d':
        'https://jungle4.anchorwallet.io',
}

function findUrl(urls: Record<string, string>, chainId: string): string | undefined {
    const match = Object.keys(urls).find((key) => key.toLowerCase() === chainId)
    return match ? urls[match].replace(/\/+$/, '') : undefined
}

export function resolveWebAuthenticatorUrl(
    chainId: Checksum256Type | undefined,
    overrides: Record<string, string> = {}
): string | undefined {
    if (!chainId) {
        return undefined
    }
    const key = String(chainId).toLowerCase()
    return findUrl(overrides, key) ?? findUrl(DEFAULT_WEB_AUTHENTICATOR_URLS, key)
}
