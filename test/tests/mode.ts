import {assert} from 'chai'
import {ChainDefinition, LoginContext} from '@wharfkit/session'
import {APIClient, PermissionLevel} from '@wharfkit/antelope'

import {
    AnchorMode,
    ledgerTransportAvailable,
    promptForMode,
    readLoginOptions,
    readMode,
    writeMode,
} from '$lib/mode'
import {makeMockUI} from '$test/utils/mock-ui'

const chain = ChainDefinition.from({
    id: '73e4385a2708e6d7048834fbc1079f2fabb17b3c125b146af438971e90716c4d',
    url: 'https://jungle4.greymass.com',
})

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

suite('mode', function () {
    test('reads a stored mode', function () {
        assert.equal(readMode({mode: 'web'}), 'web')
        assert.equal(readMode({mode: 'app'}), 'app')
    })

    test('returns undefined for empty storage', function () {
        assert.isUndefined(readMode({}))
    })

    test('ignores a garbage stored mode', function () {
        assert.isUndefined(readMode({mode: 'sideways'}))
    })

    test('infers app mode from a v1.x native session', function () {
        // Sessions serialized before 2.0 have no `mode`, but always carry a buoy channel.
        assert.equal(readMode({channelUrl: 'https://cb.anchor.link/abc', channelName: 'laptop'}), 'app')
    })

    test('infers web mode from web transport keys', function () {
        assert.equal(readMode({encryptionKey: 'PVT_K1_x', messageKey: 'PUB_K1_y'}), 'web')
    })

    test('an explicit mode beats inference', function () {
        assert.equal(readMode({mode: 'web', channelUrl: 'https://cb.anchor.link/abc'}), 'web')
    })

    test('writes a mode into storage', function () {
        const data: Record<string, any> = {}
        writeMode(data, 'web')
        assert.equal(data.mode, 'web')
        writeMode(data, 'app')
        assert.equal(data.mode, 'app')
    })

    test('rejects an invalid mode on write', function () {
        assert.throws(() => writeMode({}, 'sideways' as AnchorMode), /Invalid Anchor mode/)
    })

    test('detects Ledger transport support from navigator', function () {
        const nav = global.navigator as any
        assert.isFalse(ledgerTransportAvailable(), 'no hid/usb in the harness navigator')
        nav.hid = {}
        assert.isTrue(ledgerTransportAvailable())
        delete nav.hid
        nav.usb = {}
        assert.isTrue(ledgerTransportAvailable())
        delete nav.usb
    })
})

suite('choice screen', function () {
    test('asks the relationship question with exactly two buttons and no QR', function () {
        const ui = makeMockUI()
        promptForMode(makeLoginContext(ui), ui.getTranslate(), () => undefined).catch(
            () => undefined
        )
        const args = ui.lastPrompt()!
        assert.equal(args.title, 'How do you use Anchor?')
        assert.equal(
            args.body,
            'Choose where to approve requests. You can choose differently the next time you log in.'
        )
        const elements = args.elements as any[]
        assert.equal(elements.length, 2, 'exactly two options')
        assert.deepEqual(
            elements.map((e) => e.type),
            ['button', 'button'],
            'no QR code, no links, no logos'
        )
    })

    test('labels are situations, not product names', function () {
        const ui = makeMockUI()
        promptForMode(makeLoginContext(ui), ui.getTranslate(), () => undefined).catch(
            () => undefined
        )
        const labels = (ui.lastPrompt()!.elements as any[]).map((e) => e.data.label)
        assert.include(labels[0], 'In this browser')
        assert.include(labels[1], 'With the Anchor app')
        for (const label of labels) {
            assert.notInclude(label, 'Anchor Web', 'never expose the internal SKU')
            assert.notInclude(label, 'Desktop')
        }
    })

    test('separates each label and detail without dash punctuation', function () {
        const ui = makeMockUI()
        promptForMode(makeLoginContext(ui), ui.getTranslate(), () => undefined).catch(
            () => undefined
        )
        const labels = (ui.lastPrompt()!.elements as any[]).map((e) => e.data.label)
        assert.equal(labels[0], 'In this browser using anchorwallet.io\nwith a passkey')
        assert.equal(labels[1], 'With the Anchor app\non this or another device')
        for (const label of labels) {
            assert.notMatch(label, /[—–]/)
        }
    })

    test('mentions Ledger only when a transport for it exists', function () {
        const nav = global.navigator as any
        const ui = makeMockUI()
        promptForMode(makeLoginContext(ui), ui.getTranslate(), () => undefined).catch(
            () => undefined
        )
        assert.notInclude((ui.lastPrompt()!.elements as any[])[0].data.label, 'Ledger')

        nav.hid = {}
        const ledgerUI = makeMockUI()
        promptForMode(makeLoginContext(ledgerUI), ledgerUI.getTranslate(), () => undefined).catch(
            () => undefined
        )
        assert.include((ledgerUI.lastPrompt()!.elements as any[])[0].data.label, 'Ledger')
        delete nav.hid
    })

    test('reports the choice synchronously from the click', function () {
        const ui = makeMockUI()
        const seen: AnchorMode[] = []
        promptForMode(makeLoginContext(ui), ui.getTranslate(), (mode) => seen.push(mode)).catch(
            () => undefined
        )
        ui.clickButton(0)
        assert.deepEqual(seen, ['web'])

        const appUI = makeMockUI()
        const appSeen: AnchorMode[] = []
        promptForMode(makeLoginContext(appUI), appUI.getTranslate(), (mode) =>
            appSeen.push(mode)
        ).catch(() => undefined)
        appUI.clickButton(1)
        assert.deepEqual(appSeen, ['app'])
    })
})

suite('login options', function () {
    test('reads a namespaced per-call mode', function () {
        assert.deepEqual(readLoginOptions('anchor', {anchor: {mode: 'web'}}), {mode: 'web'})
        assert.deepEqual(readLoginOptions('anchor', {anchor: {mode: 'app'}}), {mode: 'app'})
    })

    test('an absent bag is not an error', function () {
        assert.deepEqual(readLoginOptions('anchor'), {})
        assert.deepEqual(readLoginOptions('anchor', {}), {})
    })

    test('an entry with no mode is not an error', function () {
        assert.deepEqual(readLoginOptions('anchor', {anchor: {}}), {})
        assert.deepEqual(readLoginOptions('anchor', {anchor: {mode: undefined}}), {})
    })

    test('reads a caller-opened popup alongside the mode', function () {
        const popup = {closed: false} as unknown as Window
        assert.equal(readLoginOptions('anchor', {anchor: {popup}}).popup, popup)
        assert.equal(readLoginOptions('anchor', {anchor: {mode: 'web', popup}}).popup, popup)
        assert.equal(readLoginOptions('anchor', {anchor: {mode: 'web', popup}}).mode, 'web')
    })

    test('a null popup is dropped rather than forwarded', function () {
        assert.isUndefined(readLoginOptions('anchor', {anchor: {popup: null}}).popup)
    })

    test('another plugin\'s options are ignored', function () {
        assert.deepEqual(readLoginOptions('anchor', {other: {mode: 'web'}}), {})
    })

    test('the id decides which entry is read', function () {
        assert.deepEqual(readLoginOptions('other', {anchor: {mode: 'web'}, other: {mode: 'app'}}), {
            mode: 'app',
        })
    })

    test('a bad mode throws like setMode does', function () {
        assert.throws(
            () => readLoginOptions('anchor', {anchor: {mode: 'sideways'}}),
            /Invalid Anchor mode: sideways/
        )
    })

    test('an un-nested value throws rather than being ignored', function () {
        assert.throws(
            () => readLoginOptions('anchor', {anchor: 'web'}),
            /Invalid Anchor login options: web/
        )
    })
})
