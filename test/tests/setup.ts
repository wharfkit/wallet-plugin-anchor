import {assert} from 'chai'

suite('test harness', function () {
    test('provides browser globals', function () {
        assert.isObject(global.window, 'window should be defined')
        assert.isObject(global.document, 'document should be defined')
        assert.isString(navigator.userAgent, 'navigator.userAgent should be a string')
    })

    test('window.open records calls and returns a popup handle', function () {
        ;(window.open as any).calls.length = 0
        const popup = window.open('https://example.com/sign?esr=abc', 'anchor', 'width=450')
        assert.deepEqual((window.open as any).calls, ['https://example.com/sign?esr=abc'])
        assert.isNotNull(popup)
        assert.isFalse(popup!.closed)
        popup!.close()
        assert.isTrue(popup!.closed)
    })
})
