import {JSDOM} from 'jsdom'

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost',
    pretendToBeVisual: true,
})

const jsdomWindow = dom.window as any

global.document = new Proxy(jsdomWindow.document, {
    get(target, prop, receiver) {
        if (prop === Symbol.toStringTag) return undefined
        return Reflect.get(target, prop, receiver)
    },
})
global.HTMLElement = jsdomWindow.HTMLElement
global.Blob = jsdomWindow.Blob
global.URL = jsdomWindow.URL
global.DOMParser = jsdomWindow.DOMParser

// Deterministic UA: desktop Chrome, so isKnownMobile() is false unless a test overrides it.
Object.defineProperty(global, 'navigator', {
    value: {
        userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        platform: 'MacIntel',
        language: 'en-US',
    },
    writable: true,
    configurable: true,
})

// Never connects and never errors, so waitForCallback stays pending as it does in a browser.
class MockWebSocket {
    static CONNECTING = 0
    static OPEN = 1
    static CLOSING = 2
    static CLOSED = 3
    readyState = 0
    onopen: any = null
    onmessage: any = null
    onerror: any = null
    onclose: any = null
    url: string
    constructor(url: string) {
        this.url = url
    }
    addEventListener() {}
    removeEventListener() {}
    send() {}
    close() {
        this.readyState = 3
    }
}

global.WebSocket = MockWebSocket as any
jsdomWindow.WebSocket = MockWebSocket

export interface MockPopup {
    closed: boolean
    close(): void
    location: {href: string}
}

const openCalls: string[] = []
const openPopups: MockPopup[] = []

function mockOpen(url?: string): MockPopup {
    openCalls.push(String(url))
    const popup: MockPopup = {
        closed: false,
        close() {
            popup.closed = true
        },
        location: {href: String(url)},
    }
    openPopups.push(popup)
    return popup
}

;(mockOpen as any).calls = openCalls
;(mockOpen as any).popups = openPopups
jsdomWindow.open = mockOpen

// jsdom 26's window.location is non-configurable; proxy global.window and substitute location there.
let hrefValue = 'http://localhost/'
const mockLocation = {
    get href() {
        return hrefValue
    },
    set href(value: string) {
        hrefValue = value
    },
    origin: 'http://localhost',
    pathname: '/',
}

global.window = new Proxy(jsdomWindow, {
    get(target, prop, receiver) {
        if (prop === 'location') return mockLocation
        if (prop === Symbol.toStringTag) return undefined
        return Reflect.get(target, prop, receiver)
    },
})
