import {assert} from 'chai'

import {WalletPluginAnchor, WalletPluginAnchorOptions} from '../../src'

suite('public API', function () {
    test('exports the Anchor constructor options', function () {
        const options: WalletPluginAnchorOptions = {
            buoyUrl: 'https://cb.test',
            webFallbackDelayMs: 1234,
            mode: 'web',
            webAuthenticatorUrls: {'test-chain': 'https://anchor.test'},
        }
        const plugin = new WalletPluginAnchor(options)

        assert.equal(plugin.buoyUrl, options.buoyUrl)
        assert.equal(plugin.webFallbackDelayMs, options.webFallbackDelayMs)
        assert.equal(plugin.getMode(), options.mode)
    })
})
