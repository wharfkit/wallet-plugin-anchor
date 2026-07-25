import {assert} from 'chai'
import {ChainDefinition, LoginContext} from '@wharfkit/session'
import {ResolvedSigningRequest} from '@wharfkit/signing-request'
import {APIClient, PermissionLevel, PrivateKey} from '@wharfkit/antelope'
import * as buoy from '@greymass/buoy'
import sinon from 'sinon'
import zlib from 'pako'

import {WalletPluginAnchor} from '$lib'
import {mockCallbackPayload} from '$test/utils/mock-esr'
import {makeMockUI} from '$test/utils/mock-ui'

const jungle4 = ChainDefinition.from({
    id: '73e4385a2708e6d7048834fbc1079f2fabb17b3c125b146af438971e90716c4d',
    url: 'https://jungle4.greymass.com',
})

const wax = ChainDefinition.from({
    id: '1064487b3cd1a897ce03ae5b6a865651747e2e152090f99c1d19d44e01aea5a4',
    url: 'https://wax.greymass.com',
})

function makeLoginContext(ui: any, chain: ChainDefinition): LoginContext {
    return {
        chain,
        chains: [chain],
        ui,
        fetch: global.fetch,
        hooks: {},
        appName: 'unittest',
        permissionLevel: PermissionLevel.from('wharfkit1131@test'),
        walletPlugins: [],
        arbitrary: {},
        uiRequirements: {},
        addHook: () => {},
        getClient: () => new APIClient({url: chain.url}),
        esrOptions: {zlib},
    } as unknown as LoginContext
}

/** A resolved request whose only job is to carry an expiration into the transports. */
async function makeMockResolvedSigningRequest(): Promise<ResolvedSigningRequest> {
    const expiration = new Date(Date.now() + 60 * 60 * 1000)
    return {
        transaction: {
            expiration: {toDate: () => expiration},
        },
    } as unknown as ResolvedSigningRequest
}

function makeTransactContext(ui: any, chain: ChainDefinition) {
    return {
        chain,
        ui,
        fetch: global.fetch,
        hooks: {},
        appName: 'unittest',
        accountName: 'wharfkit1131',
        permissionName: 'test',
        walletPlugins: [],
        arbitrary: {},
        uiRequirements: {},
        addHook: () => {},
        getClient: () => new APIClient({url: chain.url}),
        createRequest: async () => ({
            setInfoKey: () => undefined,
            setCallback: () => undefined,
            clone: () => ({
                setInfoKey: () => undefined,
                setCallback: () => undefined,
                encode: () => 'esr-same-device',
            }),
            encode: () => 'esr-encoded-request',
        }),
        esrOptions: {zlib},
    } as any
}

const sessionKey = PrivateKey.generate('K1')
const walletKey = PrivateKey.generate('K1')

/** Let the router's `await createIdentityRequest(...)` settle before asserting. */
function settle() {
    return new Promise((resolve) => setTimeout(resolve, 200))
}

suite('router login', function () {
    this.timeout(10 * 1000)

    test('keeps the picker identity stable', function () {
        const plugin = new WalletPluginAnchor()
        assert.equal(plugin.id, 'anchor')
        assert.equal(plugin.metadata.name, 'Anchor')
    })

    test('does not restrict supported chains', function () {
        const plugin = new WalletPluginAnchor()
        assert.isUndefined(
            plugin.config.supportedChains,
            'the native transport works on every chain, so the router must not filter'
        )
    })

    test('skips the choice screen on a chain with no web support', async function () {
        const ui = makeMockUI()
        const plugin = new WalletPluginAnchor()
        plugin.login(makeLoginContext(ui, wax)).catch(() => undefined)
        await settle()
        assert.equal(ui.lastPrompt()!.title, 'Connect with Anchor', 'straight to the native flow')
    })

    test('shows the choice screen on a dual-mode chain with no stored mode', async function () {
        const ui = makeMockUI()
        const plugin = new WalletPluginAnchor()
        plugin.login(makeLoginContext(ui, jungle4)).catch(() => undefined)
        await settle()
        assert.equal(ui.lastPrompt()!.title, 'How do you use Anchor?')
    })

    test('skips the choice screen for an explicit mode override', async function () {
        const ui = makeMockUI()
        const plugin = new WalletPluginAnchor()
        plugin.setMode('app')
        plugin.login(makeLoginContext(ui, jungle4)).catch(() => undefined)
        await settle()
        assert.equal(ui.lastPrompt()!.title, 'Connect with Anchor')
    })

    test('choosing the browser opens the popup inside the click', async function () {
        ;(window.open as any).calls.length = 0
        const ui = makeMockUI()
        const plugin = new WalletPluginAnchor()
        plugin.login(makeLoginContext(ui, jungle4)).catch(() => undefined)
        await settle()

        assert.equal((window.open as any).calls.length, 0, 'nothing opens before the click')
        ui.clickButton(0)
        assert.equal(
            (window.open as any).calls.length,
            1,
            'the popup opens synchronously in the click handler, not after an await'
        )
        assert.include((window.open as any).calls[0], 'https://jungle4.anchorwallet.io/sign?')
    })

    test('choosing the browser records web mode for the resulting session', async function () {
        const ui = makeMockUI()
        const plugin = new WalletPluginAnchor()
        plugin.login(makeLoginContext(ui, jungle4)).catch(() => undefined)
        await settle()
        ui.clickButton(0)
        await settle()
        assert.equal(plugin.getMode(), 'web')
    })

    test('asks again after a browser login was selected but did not complete', async function () {
        const firstUI = makeMockUI()
        const plugin = new WalletPluginAnchor()
        plugin.login(makeLoginContext(firstUI, jungle4)).catch(() => undefined)
        await settle()
        firstUI.clickButton(0)
        await settle()
        assert.equal(firstUI.lastPrompt()!.title, 'Approve in Anchor')

        const retryUI = makeMockUI()
        plugin.login(makeLoginContext(retryUI, jungle4)).catch(() => undefined)
        await settle()

        assert.equal(retryUI.lastPrompt()!.title, 'How do you use Anchor?')
    })

    test('choosing the app records app mode and shows the native flow', async function () {
        const ui = makeMockUI()
        const plugin = new WalletPluginAnchor()
        plugin.login(makeLoginContext(ui, jungle4)).catch(() => undefined)
        await settle()
        ui.clickButton(1)
        await settle()
        assert.equal(plugin.getMode(), 'app')
        assert.equal(ui.lastPrompt()!.title, 'Connect with Anchor')
    })

    test('a constructor override makes a chain dual-mode', async function () {
        const ui = makeMockUI()
        const plugin = new WalletPluginAnchor({
            webAuthenticatorUrls: {[String(wax.id)]: 'https://wax.example.com'},
        })
        plugin.login(makeLoginContext(ui, wax)).catch(() => undefined)
        await settle()
        assert.equal(ui.lastPrompt()!.title, 'How do you use Anchor?')
    })

    test('setMode(undefined) clears the stored mode', function () {
        const plugin = new WalletPluginAnchor()
        plugin.setMode('web')
        assert.equal(plugin.getMode(), 'web')
        plugin.setMode(undefined)
        assert.isUndefined(plugin.getMode())
    })

    test('setMode rejects garbage', function () {
        const plugin = new WalletPluginAnchor()
        assert.throws(() => plugin.setMode('sideways' as any), /Invalid Anchor mode/)
    })
})

suite('router signing', function () {
    this.timeout(10 * 1000)

    test('cancels the native prompt after a successful wallet callback', async function () {
        const receive = sinon.stub(buoy, 'receive').resolves(JSON.stringify(mockCallbackPayload))
        try {
            const ui = makeMockUI()
            const originalPrompt = ui.prompt.bind(ui)
            let cancelCount = 0
            ui.prompt = ((args: any) => {
                const pending = originalPrompt(args)
                const originalCancel = pending.cancel.bind(pending)
                pending.cancel = ((reason?: string, silent?: boolean) => {
                    cancelCount += 1
                    return originalCancel(reason, silent)
                }) as typeof pending.cancel
                return pending
            }) as typeof ui.prompt

            const plugin = new WalletPluginAnchor()
            const resolved = await makeMockResolvedSigningRequest()
            await plugin.sign(resolved, makeTransactContext(ui, jungle4)).catch(() => undefined)

            assert.equal(cancelCount, 1, 'the completed prompt is settled exactly once')
        } finally {
            receive.restore()
        }
    })

    test('a v1.x session with no stored mode signs natively', async function () {
        const plugin = new WalletPluginAnchor()
        // Exactly the keys wallet-plugin-anchor v1.6.2 wrote on login.
        plugin.data.channelUrl = 'https://cb.anchor.link/abc'
        plugin.data.channelName = 'laptop'
        plugin.data.privateKey = String(sessionKey)
        plugin.data.signerKey = String(walletKey.toPublic())

        assert.equal(plugin.getMode(), 'app', 'inferred, not prompted')
        assert.isUndefined(plugin.data.mode, 'inference must not mutate stored data')
    })

    test('a stored web session signs through the popup', async function () {
        ;(window.open as any).calls.length = 0
        const ui = makeMockUI()
        const plugin = new WalletPluginAnchor()
        plugin.setMode('web')
        plugin.data.encryptionKey = String(sessionKey)
        plugin.data.messageKey = String(walletKey.toPublic())

        const resolved = await makeMockResolvedSigningRequest()
        plugin.sign(resolved, makeTransactContext(ui, jungle4)).catch(() => undefined)
        await settle()

        assert.equal((window.open as any).calls.length, 1, 'popup, not a QR prompt')
        assert.include(
            (window.open as any).calls[0],
            'https://jungle4.anchorwallet.io/sign?sealed='
        )
    })

    test('signing never shows the choice screen', async function () {
        const ui = makeMockUI()
        const plugin = new WalletPluginAnchor()
        const resolved = await makeMockResolvedSigningRequest()
        plugin.sign(resolved, makeTransactContext(ui, jungle4)).catch(() => undefined)
        await settle()
        for (const prompt of ui.prompts) {
            assert.notEqual(prompt.title, 'How do you use Anchor?')
        }
    })

    test('web signing on a chain with no authenticator is a clear error', async function () {
        const ui = makeMockUI()
        const plugin = new WalletPluginAnchor()
        plugin.setMode('web')
        plugin.data.encryptionKey = String(sessionKey)
        plugin.data.messageKey = String(walletKey.toPublic())

        const resolved = await makeMockResolvedSigningRequest()
        let message = ''
        try {
            await plugin.sign(resolved, makeTransactContext(ui, wax))
        } catch (error: any) {
            message = error.message
        }
        assert.include(message, 'no Anchor web authenticator')
    })
})

/** Must comfortably exceed `settle()`, so the native prompt can be asserted before the timer. */
const FALLBACK_MS = 500

/** Wait past the fallback timer, measured from the moment login was called. */
function pastFallback() {
    return new Promise((resolve) => setTimeout(resolve, FALLBACK_MS))
}

suite('web fallback', function () {
    this.timeout(20 * 1000)

    test('offers the browser after the app fails to respond', async function () {
        const ui = makeMockUI()
        const plugin = new WalletPluginAnchor({webFallbackDelayMs: FALLBACK_MS})
        plugin.setMode('app')
        plugin.login(makeLoginContext(ui, jungle4)).catch(() => undefined)
        await settle()
        assert.equal(ui.lastPrompt()!.title, 'Connect with Anchor', 'native prompt first')

        await pastFallback()
        const args = ui.lastPrompt()!
        assert.equal(args.body, "Don't have the app?")
        const buttons = (args.elements as any[]).filter((e) => e.type === 'button')
        assert.equal(buttons.length, 1)
        assert.include(buttons[0].data.label, 'Continue in this browser')
    })

    test('the fallback keeps the QR on screen', async function () {
        const ui = makeMockUI()
        const plugin = new WalletPluginAnchor({webFallbackDelayMs: FALLBACK_MS})
        plugin.setMode('app')
        plugin.login(makeLoginContext(ui, jungle4)).catch(() => undefined)
        await settle()
        await pastFallback()
        const types = (ui.lastPrompt()!.elements as any[]).map((e) => e.type)
        assert.deepEqual(types, ['qr', 'link', 'button'])
    })

    test('taking the fallback opens the popup and switches the stored mode', async function () {
        ;(window.open as any).calls.length = 0
        const ui = makeMockUI()
        const plugin = new WalletPluginAnchor({webFallbackDelayMs: FALLBACK_MS})
        plugin.setMode('app')
        plugin.login(makeLoginContext(ui, jungle4)).catch(() => undefined)
        await settle()
        await pastFallback()

        ui.clickButton(0)
        assert.equal((window.open as any).calls.length, 1, 'popup opens inside the click')
        await settle()
        assert.equal(plugin.getMode(), 'web')
    })

    test('no fallback is offered on a chain without web support', async function () {
        const ui = makeMockUI()
        const plugin = new WalletPluginAnchor({webFallbackDelayMs: FALLBACK_MS})
        plugin.login(makeLoginContext(ui, wax)).catch(() => undefined)
        await settle()
        await pastFallback()
        assert.equal(ui.prompts.length, 1, 'the native prompt is never replaced')
    })
})

suite('mode switch', function () {
    this.timeout(20 * 1000)

    test('an explicit app override offers the switch straight away', async function () {
        const ui = makeMockUI()
        const plugin = new WalletPluginAnchor({webFallbackDelayMs: FALLBACK_MS})
        plugin.setMode('app')
        plugin.login(makeLoginContext(ui, jungle4)).catch(() => undefined)
        await settle()

        const args = ui.lastPrompt()!
        assert.equal(args.title, 'Connect with Anchor', 'still the native flow')
        const buttons = (args.elements as any[]).filter((e) => e.type === 'button')
        assert.equal(buttons.length, 1, 'the switch link, without waiting for the timeout')
        assert.include(buttons[0].data.label, 'Use Anchor in this browser')
        assert.equal(buttons[0].data.variant, 'text', 'quiet, not competing with Launch')
    })

    test('a first-time app choice does NOT get an immediate switch link', async function () {
        const ui = makeMockUI()
        const plugin = new WalletPluginAnchor({webFallbackDelayMs: FALLBACK_MS})
        plugin.login(makeLoginContext(ui, jungle4)).catch(() => undefined)
        await settle()
        ui.clickButton(1) // "With the Anchor app"
        await settle()

        const buttons = (ui.lastPrompt()!.elements as any[]).filter((e) => e.type === 'button')
        assert.equal(buttons.length, 0, 'they just answered the question; do not second-guess them')
    })

    test('switching from app to web opens the popup and rewrites the stored mode', async function () {
        ;(window.open as any).calls.length = 0
        const ui = makeMockUI()
        const plugin = new WalletPluginAnchor({webFallbackDelayMs: FALLBACK_MS})
        plugin.setMode('app')
        plugin.login(makeLoginContext(ui, jungle4)).catch(() => undefined)
        await settle()

        ui.clickButton(0)
        assert.equal((window.open as any).calls.length, 1, 'popup opens inside the click')
        await settle()
        assert.equal(plugin.getMode(), 'web')
    })

    test('an explicit web override offers the switch in its waiting prompt', async function () {
        const ui = makeMockUI()
        const plugin = new WalletPluginAnchor()
        plugin.setMode('web')
        plugin.login(makeLoginContext(ui, jungle4)).catch(() => undefined)
        await settle()

        const args = ui.lastPrompt()!
        assert.equal(args.title, 'Approve in Anchor')
        const buttons = (args.elements as any[]).filter((e) => e.type === 'button')
        assert.equal(buttons.length, 1)
        assert.include(buttons[0].data.label, 'Use the Anchor app')
        assert.equal(buttons[0].data.variant, 'text')
    })

    test('switching from web to app shows the native flow and rewrites the mode', async function () {
        const ui = makeMockUI()
        const plugin = new WalletPluginAnchor()
        plugin.setMode('web')
        plugin.login(makeLoginContext(ui, jungle4)).catch(() => undefined)
        await settle()

        ui.clickButton(0)
        await settle()
        assert.equal(ui.lastPrompt()!.title, 'Connect with Anchor')
        assert.equal(plugin.getMode(), 'app')
    })

    test('a native-only chain never offers a switch', async function () {
        const ui = makeMockUI()
        const plugin = new WalletPluginAnchor()
        plugin.setMode('app')
        plugin.login(makeLoginContext(ui, wax)).catch(() => undefined)
        await settle()
        const buttons = (ui.lastPrompt()!.elements as any[]).filter((e) => e.type === 'button')
        assert.equal(buttons.length, 0, 'there is nowhere to switch to')
    })
})

suite('cancelled login recovery', function () {
    this.timeout(20 * 1000)

    test('closing the browser popup offers both Anchor routes again', async function () {
        ;(window.open as any).calls.length = 0
        ;(window.open as any).popups.length = 0
        const ui = makeMockUI()
        const plugin = new WalletPluginAnchor({mode: 'web'})
        plugin.login(makeLoginContext(ui, jungle4)).catch(() => undefined)
        await settle()

        const popup = (window.open as any).popups[0]
        popup.close()
        await new Promise((resolve) => setTimeout(resolve, 1100))

        const args = ui.lastPrompt()!
        assert.equal(args.title, 'Request cancelled')
        assert.equal(args.body, 'Choose how you want to try again.')
        const buttons = (args.elements as any[]).filter((element) => element.type === 'button')
        assert.equal(buttons.length, 2)
        assert.include(buttons[0].data.label, 'In this browser')
        assert.include(buttons[1].data.label, 'With the Anchor app')
    })

    test('retrying in the browser opens a fresh request inside the click', async function () {
        ;(window.open as any).calls.length = 0
        ;(window.open as any).popups.length = 0
        const ui = makeMockUI()
        const plugin = new WalletPluginAnchor({mode: 'web'})
        plugin.login(makeLoginContext(ui, jungle4)).catch(() => undefined)
        await settle()

        ;(window.open as any).popups[0].close()
        await new Promise((resolve) => setTimeout(resolve, 1100))
        const firstUrl = (window.open as any).calls[0]

        ui.clickButton(0)
        assert.equal((window.open as any).calls.length, 2)
        assert.notEqual((window.open as any).calls[1], firstUrl, 'the cancelled ESR is not reused')
    })

    test('retrying with the app shows a fresh native request', async function () {
        ;(window.open as any).calls.length = 0
        ;(window.open as any).popups.length = 0
        const ui = makeMockUI()
        const plugin = new WalletPluginAnchor({mode: 'web'})
        plugin.login(makeLoginContext(ui, jungle4)).catch(() => undefined)
        await settle()

        ;(window.open as any).popups[0].close()
        await new Promise((resolve) => setTimeout(resolve, 1100))
        ui.clickButton(1)
        await settle()

        assert.equal(ui.lastPrompt()!.title, 'Connect with Anchor')
        assert.equal(plugin.getMode(), 'app')
    })

    test('an Anchor app rejection offers both routes again', async function () {
        ;(window.open as any).calls.length = 0
        const receive = sinon.stub(buoy, 'receive')
        receive.onFirstCall().resolves(JSON.stringify({}))
        receive.onSecondCall().returns(new Promise(() => undefined))
        try {
            const ui = makeMockUI()
            const plugin = new WalletPluginAnchor({mode: 'app'})
            plugin.login(makeLoginContext(ui, jungle4)).catch(() => undefined)
            await settle()

            assert.equal(ui.lastPrompt()!.title, 'Request cancelled')
            const buttons = (ui.lastPrompt()!.elements as any[]).filter(
                (element) => element.type === 'button'
            )
            assert.equal(buttons.length, 2)

            ui.clickButton(0)
            assert.equal((window.open as any).calls.length > 0, true)
        } finally {
            receive.restore()
        }
    })
})

suite('mode option', function () {
    this.timeout(20 * 1000)

    test('the constructor option sets the mode', function () {
        assert.equal(new WalletPluginAnchor({mode: 'web'}).getMode(), 'web')
        assert.equal(new WalletPluginAnchor({mode: 'app'}).getMode(), 'app')
    })

    test('no option leaves the mode unset', function () {
        assert.isUndefined(new WalletPluginAnchor().getMode())
    })

    test('the constructor option rejects garbage', function () {
        assert.throws(() => new WalletPluginAnchor({mode: 'sideways' as any}), /Invalid Anchor mode/)
    })

    test('the constructor option skips the choice screen', async function () {
        const ui = makeMockUI()
        const plugin = new WalletPluginAnchor({mode: 'web', webFallbackDelayMs: FALLBACK_MS})
        plugin.login(makeLoginContext(ui, jungle4)).catch(() => undefined)
        await settle()
        assert.equal(ui.lastPrompt()!.title, 'Approve in Anchor', 'straight to the popup')
    })

    test('setMode still overrides the constructor option', function () {
        const plugin = new WalletPluginAnchor({mode: 'web'})
        plugin.setMode('app')
        assert.equal(plugin.getMode(), 'app')
        plugin.setMode(undefined)
        assert.isUndefined(plugin.getMode())
    })
})

suite('restored session', function () {
    this.timeout(20 * 1000)

    test('reassigning data reaches the transports', async function () {
        ;(window.open as any).calls.length = 0
        const ui = makeMockUI()
        const plugin = new WalletPluginAnchor()
        // Exactly what SessionKit.restore() does: it replaces the object, it does not merge.
        plugin.data = {
            mode: 'web',
            encryptionKey: String(sessionKey),
            messageKey: String(walletKey.toPublic()),
        }

        const resolved = await makeMockResolvedSigningRequest()
        plugin.sign(resolved, makeTransactContext(ui, jungle4)).catch(() => undefined)
        await settle()

        assert.equal((window.open as any).calls.length, 1, 'the web transport saw the restored keys')
    })

    test('a reassigned v1.x session still signs natively', async function () {
        ;(window.open as any).calls.length = 0
        const ui = makeMockUI()
        const plugin = new WalletPluginAnchor()
        plugin.data = {
            channelUrl: 'https://cb.anchor.link/abc',
            channelName: 'laptop',
            privateKey: String(sessionKey),
            signerKey: String(walletKey.toPublic()),
        }

        const resolved = await makeMockResolvedSigningRequest()
        plugin.sign(resolved, makeTransactContext(ui, jungle4)).catch(() => undefined)
        await settle()

        assert.equal((window.open as any).calls.length, 0, 'no popup on the native path')
        assert.equal(ui.lastPrompt()!.title, 'Complete using Anchor')
    })
})

suite('openWallet', function () {
    test('opens the authenticator for a dual-mode chain', function () {
        ;(window.open as any).calls.length = 0
        const plugin = new WalletPluginAnchor()
        const popup = plugin.openWallet(jungle4)
        assert.isNotNull(popup)
        assert.deepEqual((window.open as any).calls, ['https://jungle4.anchorwallet.io'])
    })

    test('accepts a bare chain id', function () {
        ;(window.open as any).calls.length = 0
        const plugin = new WalletPluginAnchor()
        plugin.openWallet(String(jungle4.id))
        assert.deepEqual((window.open as any).calls, ['https://jungle4.anchorwallet.io'])
    })

    test('opens nothing on a native-only chain', function () {
        ;(window.open as any).calls.length = 0
        const plugin = new WalletPluginAnchor()
        assert.isNull(plugin.openWallet(wax), 'there is no wallet page to open')
        assert.equal((window.open as any).calls.length, 0)
    })

    test('opens nothing when no chain is given', function () {
        ;(window.open as any).calls.length = 0
        const plugin = new WalletPluginAnchor()
        assert.isNull(plugin.openWallet())
        assert.equal((window.open as any).calls.length, 0)
    })

    test('honours a constructor URL override', function () {
        ;(window.open as any).calls.length = 0
        const plugin = new WalletPluginAnchor({
            webAuthenticatorUrls: {[String(wax.id)]: 'https://wax.example.com'},
        })
        plugin.openWallet(wax)
        assert.deepEqual((window.open as any).calls, ['https://wax.example.com'])
    })
})

suite('WalletPluginAnchor.openWallet (static)', function () {
    test('opens the authenticator for a dual-mode chain without an instance', function () {
        ;(window.open as any).calls.length = 0
        const popup = WalletPluginAnchor.openWallet(jungle4)
        assert.isNotNull(popup)
        assert.deepEqual((window.open as any).calls, ['https://jungle4.anchorwallet.io'])
    })

    test('accepts a bare chain id', function () {
        ;(window.open as any).calls.length = 0
        WalletPluginAnchor.openWallet(String(jungle4.id))
        assert.deepEqual((window.open as any).calls, ['https://jungle4.anchorwallet.io'])
    })

    test('opens nothing on a native-only chain', function () {
        ;(window.open as any).calls.length = 0
        assert.isNull(WalletPluginAnchor.openWallet(wax))
        assert.equal((window.open as any).calls.length, 0)
    })

    test('opens nothing when no chain is given', function () {
        ;(window.open as any).calls.length = 0
        assert.isNull(WalletPluginAnchor.openWallet())
        assert.equal((window.open as any).calls.length, 0)
    })

    test('accepts URL overrides as a second argument', function () {
        ;(window.open as any).calls.length = 0
        WalletPluginAnchor.openWallet(wax, {[String(wax.id)]: 'https://wax.example.com'})
        assert.deepEqual((window.open as any).calls, ['https://wax.example.com'])
    })
})
