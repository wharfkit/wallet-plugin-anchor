import {assert} from 'chai'
import {Checksum256} from '@wharfkit/antelope'

import {DEFAULT_WEB_AUTHENTICATOR_URLS, resolveWebAuthenticatorUrl} from '$lib/chains'

const vaulta = 'aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906'
const jungle4 = '73e4385a2708e6d7048834fbc1079f2fabb17b3c125b146af438971e90716c4d'
const wax = '1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01aea5a4'

suite('chains', function () {
    test('resolves the built-in defaults', function () {
        assert.equal(resolveWebAuthenticatorUrl(vaulta), 'https://vaulta.anchorwallet.io')
        assert.equal(resolveWebAuthenticatorUrl(jungle4), 'https://jungle4.anchorwallet.io')
    })

    test('accepts a Checksum256 as well as a string', function () {
        assert.equal(
            resolveWebAuthenticatorUrl(Checksum256.from(vaulta)),
            'https://vaulta.anchorwallet.io'
        )
    })

    test('returns undefined for chains without web support', function () {
        assert.isUndefined(resolveWebAuthenticatorUrl(wax))
    })

    test('returns undefined when no chain is given', function () {
        assert.isUndefined(resolveWebAuthenticatorUrl(undefined))
    })

    test('overrides win over defaults', function () {
        const url = resolveWebAuthenticatorUrl(vaulta, {[vaulta]: 'http://localhost:5173'})
        assert.equal(url, 'http://localhost:5173')
    })

    test('overrides add chains that have no default', function () {
        assert.equal(resolveWebAuthenticatorUrl(wax, {[wax]: 'https://wax.example.com'}), 'https://wax.example.com')
    })

    test('chain id matching is case insensitive', function () {
        assert.equal(resolveWebAuthenticatorUrl(vaulta.toUpperCase()), 'https://vaulta.anchorwallet.io')
    })

    test('strips trailing slashes so callers can append paths', function () {
        assert.equal(
            resolveWebAuthenticatorUrl(vaulta, {[vaulta]: 'https://example.com/'}),
            'https://example.com'
        )
    })

    test('exposes exactly the two supported chains by default', function () {
        assert.deepEqual(Object.keys(DEFAULT_WEB_AUTHENTICATOR_URLS).sort(), [jungle4, vaulta].sort())
    })
})
