import {Cancelable, LoginContext, PromptResponse} from '@wharfkit/session'

import {Translator} from './transports/types'

/** Anchor transport used for login and signing: browser authenticator or native app. */
export type AnchorMode = 'web' | 'app'

function isValidMode(value: unknown): value is AnchorMode {
    return value === 'web' || value === 'app'
}

export function readMode(data: Record<string, any>): AnchorMode | undefined {
    if (isValidMode(data.mode)) {
        return data.mode
    }
    if (data.channelUrl || data.signerKey) {
        return 'app'
    }
    if (data.encryptionKey && data.messageKey) {
        return 'web'
    }
    return undefined
}

export function writeMode(data: Record<string, any>, mode: AnchorMode) {
    if (!isValidMode(mode)) {
        throw new Error(`Invalid Anchor mode: ${mode}`)
    }
    data.mode = mode
}

/** Per-call options from `login({arbitrary: {anchor: {...}}})`. */
export interface AnchorLoginOptions {
    mode?: AnchorMode
    /** Window the caller opened inside its own click, for the web transport to navigate. */
    popup?: Window
}

/** Read one plugin's entry out of the shared arbitrary bag. Throws on a bad value. */
export function readLoginOptions(id: string, arbitrary?: Record<string, any>): AnchorLoginOptions {
    const options = arbitrary?.[id]
    if (options === undefined || options === null) {
        return {}
    }
    if (typeof options !== 'object') {
        throw new Error(`Invalid Anchor login options: ${options}`)
    }
    const result: AnchorLoginOptions = {}
    if (options.mode !== undefined) {
        if (!isValidMode(options.mode)) {
            throw new Error(`Invalid Anchor mode: ${options.mode}`)
        }
        result.mode = options.mode
    }
    if (options.popup) {
        result.popup = options.popup
    }
    return result
}

export function ledgerTransportAvailable(): boolean {
    if (typeof navigator === 'undefined') {
        return false
    }
    const nav = navigator as any
    return Boolean(nav.hid) || Boolean(nav.usb)
}

function modeElements(t: Translator, onChoice: (mode: AnchorMode) => void, includeWeb: boolean) {
    const webLabel = t('mode.web.label', {
        default: 'In this browser using anchorwallet.io',
    })
    const webDetail = ledgerTransportAvailable()
        ? t('mode.web.detail', {default: 'with a passkey or Ledger'})
        : t('mode.web.detail_no_ledger', {default: 'with a passkey'})
    const appLabel = t('mode.app.label', {default: 'With the Anchor app'})
    const appDetail = t('mode.app.detail', {default: 'on this or another device'})

    const elements: any[] = []
    if (includeWeb) {
        elements.push({
            type: 'button',
            label: webLabel,
            data: {
                label: `${webLabel}\n${webDetail}`,
                variant: 'primary',
                onClick: () => onChoice('web'),
            },
        })
    }
    elements.push({
        type: 'button',
        label: appLabel,
        data: {
            label: `${appLabel}\n${appDetail}`,
            variant: includeWeb ? 'secondary' : 'primary',
            onClick: () => onChoice('app'),
        },
    })
    return elements
}

/** Two buttons, no QR, no sub-product logos. `onChoice` fires synchronously inside the click. */
export function promptForMode(
    context: LoginContext,
    t: Translator,
    onChoice: (mode: AnchorMode) => void
): Cancelable<PromptResponse> {
    if (!context.ui) {
        throw new Error('No UI available')
    }

    return context.ui.prompt({
        title: t('mode.title', {default: 'How do you use Anchor?'}),
        body: t('mode.body', {
            default:
                'Choose where to approve requests. You can choose differently the next time you log in.',
        }),
        elements: modeElements(t, onChoice, true),
    })
}

export function promptForRecovery(
    context: LoginContext,
    t: Translator,
    includeWeb: boolean,
    onChoice: (mode: AnchorMode) => void
): Cancelable<PromptResponse> {
    if (!context.ui) {
        throw new Error('No UI available')
    }

    return context.ui.prompt({
        title: t('recovery.title', {default: 'Request cancelled'}),
        body: t('recovery.body', {default: 'Choose how you want to try again.'}),
        elements: modeElements(t, onChoice, includeWeb),
    })
}
