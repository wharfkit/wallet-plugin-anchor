import {assert} from 'chai'
import {ChainDefinition, LoginContext} from '@wharfkit/session'
import {APIClient, PermissionLevel} from '@wharfkit/antelope'

import {NativeTransport} from '$lib/transports/native'
import {makeMockUI} from '$test/utils/mock-ui'

const chain = ChainDefinition.from({
    id: '73e4385a2708e6d7048834fbc1079f2fabb17b3c125b146af438971e90716c4d',
    url: 'https://jungle4.greymass.com',
})

function makeBundle() {
    return {
        callback: {service: 'https://cb.anchor.link', channel: 'test'},
        request: {encode: () => 'esr://request'},
        sameDeviceRequest: {encode: () => 'esr://same-device'},
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

suite('native transport', function () {
    test('prompts with a QR code and a launch link on desktop', function () {
        const ui = makeMockUI()
        const transport = new NativeTransport({
            id: 'anchor',
            data: {},
            buoyUrl: 'https://cb.anchor.link',
        })
        // Never resolves in this test — we only assert on what was rendered.
        transport.login(makeLoginContext(ui), makeBundle(), ui.getTranslate()).catch(() => undefined)

        const args = ui.lastPrompt()
        assert.exists(args)
        assert.equal(args!.title, 'Connect with Anchor')
        const types = (args!.elements as any[]).map((e) => e.type)
        assert.deepEqual(types, ['qr', 'link'], 'desktop shows QR above the launch link')
    })

    test('fires the same-device deep link immediately', function () {
        const ui = makeMockUI()
        const transport = new NativeTransport({
            id: 'anchor',
            data: {},
            buoyUrl: 'https://cb.anchor.link',
        })
        transport.login(makeLoginContext(ui), makeBundle(), ui.getTranslate()).catch(() => undefined)
        assert.equal(window.location.href, 'esr://same-device')
    })

    test('offers the web fallback after the configured delay', async function () {
        const ui = makeMockUI()
        let selected = false
        const transport = new NativeTransport({
            id: 'anchor',
            data: {},
            buoyUrl: 'https://cb.anchor.link',
        })
        transport
            .login(makeLoginContext(ui), makeBundle(), ui.getTranslate(), {
                delayMs: 10,
                onSelect: () => (selected = true),
            })
            .catch(() => undefined)

        assert.equal(ui.prompts.length, 1, 'only the standard prompt at first')
        await new Promise((resolve) => setTimeout(resolve, 30))
        assert.equal(ui.prompts.length, 2, 're-prompted with the fallback offer')

        const args = ui.lastPrompt()!
        const types = (args.elements as any[]).map((e) => e.type)
        assert.deepEqual(types, ['qr', 'link', 'button'], 'fallback button appended, QR retained')

        ui.clickButton(0)
        assert.isTrue(selected, 'clicking the fallback calls onSelect')
    })

    test('does not offer a fallback when none is configured', async function () {
        const ui = makeMockUI()
        const transport = new NativeTransport({
            id: 'anchor',
            data: {},
            buoyUrl: 'https://cb.anchor.link',
        })
        transport.login(makeLoginContext(ui), makeBundle(), ui.getTranslate()).catch(() => undefined)
        await new Promise((resolve) => setTimeout(resolve, 30))
        assert.equal(ui.prompts.length, 1)
    })
})
