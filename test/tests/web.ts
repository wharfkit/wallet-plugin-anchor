import {assert} from 'chai'
import {ChainDefinition, LoginContext} from '@wharfkit/session'
import {APIClient, Bytes, PermissionLevel, PrivateKey, UInt64} from '@wharfkit/antelope'
import {unsealMessage} from '@wharfkit/sealed-messages'
import * as buoy from '@greymass/buoy'
import sinon from 'sinon'

import {mockCallbackPayload} from '$test/utils/mock-esr'

import {WebTransport} from '$lib/transports/web'
import {makeMockUI} from '$test/utils/mock-ui'

const chain = ChainDefinition.from({
    id: '73e4385a2708e6d7048834fbc1079f2fabb17b3c125b146af438971e90716c4d',
    url: 'https://jungle4.greymass.com',
})

function makeBundle() {
    return {
        callback: {service: 'https://cb.anchor.link', channel: 'test'},
        request: {encode: () => 'esr-encoded-request'},
        sameDeviceRequest: {encode: () => 'esr-same-device'},
        requestKey: 'PUB_K1_requestkey',
        privateKey: 'PVT_K1_privatekey',
    } as any
}

function makeLoginContext(ui: any): LoginContext {
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
        esrOptions: {},
    } as unknown as LoginContext
}

suite('web transport', function () {
    test('builds a login URL against the given base', function () {
        const ui = makeMockUI()
        const transport = new WebTransport({
            id: 'anchor',
            data: {},
            buoyUrl: 'https://cb.anchor.link',
        })
        const url = transport.loginUrl(
            makeLoginContext(ui),
            makeBundle(),
            'https://jungle4.anchorwallet.io'
        )
        assert.include(url, 'https://jungle4.anchorwallet.io/sign?')
        assert.include(url, 'esr=esr-encoded-request')
        assert.include(url, `chain=${chain.id}`)
        assert.include(url, 'requestKey=PUB_K1_requestkey')
    })

    test('openWindow opens a popup and reports the handle', function () {
        ;(window.open as any).calls.length = 0
        const transport = new WebTransport({
            id: 'anchor',
            data: {},
            buoyUrl: 'https://cb.anchor.link',
        })
        const popup = transport.openWindow('https://jungle4.anchorwallet.io/sign?esr=x')
        assert.isNotNull(popup)
        assert.deepEqual((window.open as any).calls, ['https://jungle4.anchorwallet.io/sign?esr=x'])
    })

    test('login reuses a popup opened by the caller', async function () {
        ;(window.open as any).calls.length = 0
        const ui = makeMockUI()
        const transport = new WebTransport({
            id: 'anchor',
            data: {},
            buoyUrl: 'https://cb.anchor.link',
        })
        const preOpened = transport.openWindow('https://jungle4.anchorwallet.io/sign?esr=x')
        assert.equal((window.open as any).calls.length, 1)

        transport
            .login(makeLoginContext(ui), makeBundle(), 'https://jungle4.anchorwallet.io', preOpened)
            .catch(() => undefined)
        await new Promise((resolve) => setTimeout(resolve, 10))

        assert.equal(
            (window.open as any).calls.length,
            1,
            'login must not open a second popup when handed one'
        )
    })

    test('shows the manual prompt when the popup is blocked', async function () {
        const ui = makeMockUI()
        const transport = new WebTransport({
            id: 'anchor',
            data: {},
            buoyUrl: 'https://cb.anchor.link',
        })
        // A blocked popup is `null`, which is exactly what openWindow returns on failure.
        const originalOpen = window.open
        ;(window as any).open = () => null
        try {
            transport
                .login(makeLoginContext(ui), makeBundle(), 'https://jungle4.anchorwallet.io')
                .catch(() => undefined)
            await new Promise((resolve) => setTimeout(resolve, 10))
            const args = ui.lastPrompt()!
            assert.equal(args.title, 'Pop-up blocked')
            const element = (args.elements as any[])[0]
            assert.equal(element.type, 'link', 'a real link click is never popup-blocked')
            assert.include(element.data.href, 'https://jungle4.anchorwallet.io/sign?')
            assert.include(element.data.href, 'esr=esr-encoded-request')
            assert.notEqual(element.data.button, false, 'rendered as a button, not a text link')
        } finally {
            ;(window as any).open = originalOpen
        }
    })

    test('a blocked login still completes once the callback arrives', async function () {
        const receive = sinon.stub(buoy, 'receive').resolves(JSON.stringify(mockCallbackPayload))
        const originalOpen = window.open
        ;(window as any).open = () => null
        try {
            const ui = makeMockUI()
            const transport = new WebTransport({
                id: 'anchor',
                data: {},
                buoyUrl: 'https://cb.anchor.link',
            })
            const response = await transport.login(
                makeLoginContext(ui),
                makeBundle(),
                'https://jungle4.anchorwallet.io'
            )
            assert.equal(String(response.permissionLevel), 'wharfkit1115@test')
        } finally {
            ;(window as any).open = originalOpen
            receive.restore()
        }
    })

    test('seals the request as bare ciphertext the authenticator can unseal', async function () {
        ;(window.open as any).calls.length = 0
        const dappKey = PrivateKey.generate('K1')
        const walletKey = PrivateKey.generate('K1')
        const transport = new WebTransport({
            id: 'anchor',
            data: {
                encryptionKey: String(dappKey),
                messageKey: String(walletKey.toPublic()),
            },
            buoyUrl: 'https://cb.anchor.link',
        })

        const resolved = {
            transaction: {expiration: {toDate: () => new Date(Date.now() + 60 * 60 * 1000)}},
        } as any
        const context = {
            chain: chain,
            ui: makeMockUI(),
            accountName: 'wharfkit1131',
            permissionName: 'test',
            appName: 'unittest',
            createRequest: async () => ({
                setInfoKey: () => undefined,
                setCallback: () => undefined,
                encode: () => 'esr-encoded-request',
            }),
        } as any

        let signError: any
        transport.sign(resolved, context, 'https://jungle4.anchorwallet.io').catch((e) => {
            signError = e
        })
        await new Promise((resolve) => setTimeout(resolve, 20))
        assert.isUndefined(signError && signError.message, 'sign should reach the popup')

        const signUrl = new URL((window.open as any).calls[0])
        const sealed = signUrl.searchParams.get('sealed')!
        const nonce = signUrl.searchParams.get('nonce')!
        const unsealed = await unsealMessage(
            Bytes.from(sealed, 'hex'),
            walletKey,
            dappKey.toPublic(),
            UInt64.from(nonce)
        )
        assert.equal(unsealed, 'esr-encoded-request')
    })

    test('sign refuses to run before a web login has stored keys', async function () {
        const transport = new WebTransport({
            id: 'anchor',
            data: {},
            buoyUrl: 'https://cb.anchor.link',
        })
        let message = ''
        try {
            await transport.sign({} as any, {} as any, 'https://jungle4.anchorwallet.io')
        } catch (error: any) {
            message = error.message
        }
        assert.include(message, 'please login first')
    })
})
