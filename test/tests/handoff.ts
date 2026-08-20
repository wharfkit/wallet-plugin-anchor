import {assert} from 'chai'
import {ChainDefinition} from '@wharfkit/session'
import {ResolvedSigningRequest} from '@wharfkit/signing-request'
import {APIClient, PermissionLevel, PrivateKey} from '@wharfkit/antelope'
import * as buoy from '@greymass/buoy'
import * as protocol from '@wharfkit/protocol-esr'
import sinon from 'sinon'
import zlib from 'pako'

import {NativeTransport} from '$lib/transports/native'
import {mockCallbackPayload} from '$test/utils/mock-esr'
import {makeMockUI} from '$test/utils/mock-ui'

const jungle4 = ChainDefinition.from({
    id: '73e4385a2708e6d7048834fbc1079f2fabb17b3c125b146af438971e90716c4d',
    url: 'https://jungle4.greymass.com',
})

const sessionKey = PrivateKey.generate('K1')
const walletKey = PrivateKey.generate('K1')

const HANDOFF_KEY = 'wharfkit:anchor-transaction-handoff'
const PAGE_URL = 'http://localhost/page'
const RETURN_URL = `${PAGE_URL}#RETURN01`
const TXID = 'f0e5f6f0a4d5c9c8e7b6a5948382716059483726150493827160594837261504'

function makeSameDeviceData() {
    return {
        sameDevice: true,
        launchUrl: 'anchor://launch',
        channelUrl: 'https://cb.anchor.link/channel-test',
        channelName: 'phone',
        privateKey: String(sessionKey),
        signerKey: String(walletKey.toPublic()),
    }
}

function makeTransport(data: Record<string, unknown>) {
    return new NativeTransport({id: 'anchor', data, buoyUrl: 'https://cb.anchor.link'})
}

function makeResolved(): ResolvedSigningRequest {
    const expiration = new Date(Date.now() + 60 * 60 * 1000)
    return {
        transaction: {
            expiration: {toDate: () => expiration},
            id: TXID,
        },
    } as unknown as ResolvedSigningRequest
}

function makeTransactContext(ui: any) {
    return {
        chain: jungle4,
        ui,
        fetch: global.fetch,
        hooks: {},
        appName: 'unittest',
        accountName: 'wharfkit1131',
        permissionName: 'test',
        permissionLevel: PermissionLevel.from('wharfkit1131@test'),
        walletPlugins: [],
        arbitrary: {},
        uiRequirements: {},
        addHook: () => {},
        getClient: () => new APIClient({url: jungle4.url}),
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

function settle(ms = 50) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function simulatePageReturn() {
    window.dispatchEvent(new (window as any).Event('pagehide'))
    window.dispatchEvent(new (window as any).Event('pageshow'))
}

suite('native signing handoff', function () {
    this.timeout(10 * 1000)

    setup(function () {
        window.localStorage.removeItem(HANDOFF_KEY)
        window.location.href = PAGE_URL
    })

    teardown(function () {
        sinon.restore()
        window.localStorage.removeItem(HANDOFF_KEY)
    })

    test('same-device delivery reaches buoy before the app is launched', async function () {
        let resolveSend: () => void = () => undefined
        const sendStub = sinon.stub(buoy, 'send').returns(
            new Promise((resolve) => {
                resolveSend = () => resolve(undefined as any)
            })
        )
        const transport = makeTransport(makeSameDeviceData())
        transport.sign(makeResolved(), makeTransactContext(makeMockUI())).catch(() => undefined)
        await settle()

        assert.equal(sendStub.callCount, 1, 'the sealed request was sent')
        assert.equal(window.location.href, PAGE_URL, 'no launch until delivery settles')

        resolveSend()
        await settle(10)
        assert.equal(window.location.href, 'anchor://launch', 'launched after delivery')
    })

    test('a same-page return defers the callback connection and stores a handoff', async function () {
        sinon.stub(buoy, 'send').resolves(undefined as any)
        sinon.stub(protocol, 'generateReturnUrl').returns(RETURN_URL)
        let resolveCallback: (payload: any) => void = () => undefined
        const callbackStub = sinon.stub(protocol, 'waitForCallback').returns(
            new Promise((resolve) => {
                resolveCallback = resolve
            })
        )

        const transport = makeTransport(makeSameDeviceData())
        const signing = transport
            .sign(makeResolved(), makeTransactContext(makeMockUI()))
            .catch(() => undefined)
        await settle()

        assert.equal(callbackStub.callCount, 0, 'no websocket while the page is handed off')
        const stored = JSON.parse(window.localStorage.getItem(HANDOFF_KEY)!)
        assert.equal(stored.version, 1)
        assert.equal(stored.returnUrl, RETURN_URL)
        assert.equal(stored.transactionId, TXID)
        assert.equal(stored.chainId, String(jungle4.id))
        assert.equal(stored.actor, 'wharfkit1131')
        assert.equal(stored.permission, 'test')
        assert.isString(stored.expiresAt)
        assert.equal(stored.callback.service, 'https://cb.anchor.link')
        assert.isString(stored.callback.channel)

        simulatePageReturn()
        await settle(10)
        assert.equal(callbackStub.callCount, 1, 'connected once the page returned')

        resolveCallback(mockCallbackPayload)
        await signing
        assert.isNull(window.localStorage.getItem(HANDOFF_KEY), 'cleared after completion')
    })

    test('a cross-page return keeps the immediate callback connection', async function () {
        sinon.stub(buoy, 'send').resolves(undefined as any)
        sinon.stub(protocol, 'generateReturnUrl').returns('googlechrome://')
        const callbackStub = sinon.stub(protocol, 'waitForCallback').returns(new Promise(() => {}))

        const transport = makeTransport(makeSameDeviceData())
        transport.sign(makeResolved(), makeTransactContext(makeMockUI())).catch(() => undefined)
        await settle()

        assert.equal(callbackStub.callCount, 1, 'connects right away')
        assert.isNull(window.localStorage.getItem(HANDOFF_KEY), 'no handoff record')
    })

    test('a cross-device session keeps the immediate callback connection', async function () {
        sinon.stub(buoy, 'send').resolves(undefined as any)
        sinon.stub(protocol, 'generateReturnUrl').returns(RETURN_URL)
        const callbackStub = sinon.stub(protocol, 'waitForCallback').returns(new Promise(() => {}))

        const transport = makeTransport({...makeSameDeviceData(), sameDevice: false})
        transport.sign(makeResolved(), makeTransactContext(makeMockUI())).catch(() => undefined)
        await settle()

        assert.equal(callbackStub.callCount, 1, 'connects right away')
        assert.isNull(window.localStorage.getItem(HANDOFF_KEY), 'no handoff record')
        assert.equal(window.location.href, PAGE_URL, 'no launch attempt')
    })

    test('a delivery failure cancels the prompt and rethrows', async function () {
        sinon.stub(buoy, 'send').rejects(new Error('buoy unavailable'))
        const ui = makeMockUI()
        let cancelCount = 0
        const originalPrompt = ui.prompt.bind(ui)
        ui.prompt = ((args: any) => {
            const pending = originalPrompt(args)
            const originalCancel = pending.cancel.bind(pending)
            pending.cancel = ((reason?: string) => {
                cancelCount += 1
                return originalCancel(reason)
            }) as typeof pending.cancel
            return pending
        }) as typeof ui.prompt

        const transport = makeTransport(makeSameDeviceData())
        let message = ''
        await transport.sign(makeResolved(), makeTransactContext(ui)).catch((error) => {
            message = error.message
        })

        assert.equal(message, 'buoy unavailable', 'the delivery error surfaces')
        assert.equal(cancelCount, 1, 'the prompt was cancelled')
        assert.equal(window.location.href, PAGE_URL, 'the app was never launched')
    })
})
