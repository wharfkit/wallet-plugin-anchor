import {ReceiveOptions} from '@greymass/buoy'
import {
    CallbackPayload,
    Checksum256,
    LoginContext,
    PermissionLevel,
    PromptElement,
    ResolvedSigningRequest,
    TransactContext,
    UserInterface,
    WalletPluginLoginResponse,
    WalletPluginSignResponse,
} from '@wharfkit/session'
import {PrivateKey, PublicKey, UInt64} from '@wharfkit/antelope'
import {
    extractSignaturesFromCallback,
    isCallback,
    LinkInfo,
    sealMessage,
    setTransactionCallback,
    waitForCallback,
} from '@wharfkit/protocol-esr'

import {AnchorRequestCancelledError} from './errors'
import {switchButton} from './prompt'
import {IdentityRequestBundle, TransportOptions} from './types'

const POPUP_WIDTH = 450
const POPUP_HEIGHT = 750

// Raw concatenation, not URLSearchParams: the deployed authenticator decodes the values unescaped.
function signPageUrl(baseUrl: string, params: Record<string, string>): string {
    const query = Object.entries(params)
        .map(([key, value]) => `${key}=${value}`)
        .join('&')
    return `${baseUrl}/sign?${query}`
}

/** Open the authenticator popup. Synchronous: browsers only honour it inside a user gesture. */
export function openAuthenticatorWindow(url: string): Window | null {
    const left = Math.round(window.screenX + (window.outerWidth - POPUP_WIDTH) / 2)
    const top = Math.round(window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2)
    return window.open(
        url,
        'anchor-web',
        `width=${POPUP_WIDTH},height=${POPUP_HEIGHT},left=${left},top=${top}`
    )
}

/** Drives the Anchor web authenticator in a popup window, over buoy. */
export class WebTransport {
    constructor(private options: TransportOptions) {}

    openWindow(url: string): Window | null {
        return openAuthenticatorWindow(url)
    }

    /** Build the login URL for a prepared identity request. Synchronous. */
    loginUrl(context: LoginContext, bundle: IdentityRequestBundle, baseUrl: string): string {
        return signPageUrl(baseUrl, {
            esr: String(bundle.request.encode()),
            chain: String(context.chain?.id),
            requestKey: String(bundle.requestKey),
        })
    }

    async login(
        context: LoginContext,
        bundle: IdentityRequestBundle,
        baseUrl: string,
        popup?: Window | null,
        switchOffer?: {onSelect: () => void}
    ): Promise<WalletPluginLoginResponse> {
        context.appName = context.appName || 'Unknown App'

        const url = this.loginUrl(context, bundle, baseUrl)
        const {payload} = await this.awaitPopup(
            url,
            bundle.callback,
            context.ui,
            popup === undefined ? this.openWindow(url) : popup,
            switchOffer
        )

        this.options.data.encryptionKey = String(bundle.privateKey)
        this.options.data.messageKey = payload.link_key

        if (!payload.cid) {
            throw new Error('Login failed: No chain ID returned')
        }

        const loginResponse: WalletPluginLoginResponse = {
            chain: Checksum256.from(payload.cid),
            permissionLevel: PermissionLevel.from({
                actor: payload.sa,
                permission: payload.sp,
            }),
        }

        if (payload.sig) {
            Object.assign(loginResponse, {
                identityProof: {
                    signature: payload.sig,
                    signedRequest: bundle.request.encode(),
                },
            })
        }

        return loginResponse
    }

    async sign(
        resolved: ResolvedSigningRequest,
        context: TransactContext,
        baseUrl: string
    ): Promise<WalletPluginSignResponse> {
        const data = this.options.data
        if (!data.encryptionKey || !data.messageKey) {
            throw new Error('No request keys available - please login first')
        }

        const expiration = resolved.transaction.expiration.toDate()

        const modifiedRequest = await context.createRequest({transaction: resolved.transaction})
        modifiedRequest.setInfoKey('link', LinkInfo.from({expiration}))

        const callback = setTransactionCallback(modifiedRequest, this.options.buoyUrl)

        const nonce = UInt64.from(Math.floor(Math.random() * Number.MAX_SAFE_INTEGER))
        const sealedRequest = await sealMessage(
            modifiedRequest.encode(),
            PrivateKey.from(data.encryptionKey),
            PublicKey.from(data.messageKey),
            nonce
        )

        // Bare ciphertext, not the serialized SealedMessage — that is the format the authenticator decodes.
        const signUrl = signPageUrl(baseUrl, {
            sealed: sealedRequest.ciphertext.toString('hex'),
            nonce: nonce.toString(),
            chain: String(context.chain?.id),
            accountName: String(context.accountName),
            permissionName: String(context.permissionName),
            appName: String(context.appName),
            requestKey: String(PrivateKey.from(data.encryptionKey).toPublic()),
        })

        const response = await this.awaitPopup(
            signUrl,
            callback,
            context.ui,
            this.openWindow(signUrl)
        )

        const signatures = extractSignaturesFromCallback(response.payload)
        if (!isCallback(response.payload) || signatures.length === 0) {
            throw new Error('Signing failed: No signatures returned')
        }

        return {signatures, resolved}
    }

    private awaitPopup(
        url: string,
        receiveOptions: ReceiveOptions,
        ui: UserInterface | undefined,
        popup: Window | null,
        switchOffer?: {onSelect: () => void}
    ): Promise<{payload: CallbackPayload}> {
        return new Promise((resolve, reject) => {
            const t = ui?.getTranslate(this.options.id)
            const translate = (key: string, fallbackText: string) =>
                t ? t(key, {default: fallbackText}) : fallbackText
            const cancelledMessage = translate(
                'error.cancelled',
                'The request was cancelled from Anchor.'
            )

            if (!popup) {
                return this.promptManualOpen(url, receiveOptions, ui).then(resolve, reject)
            }

            const elements: PromptElement[] = []
            if (switchOffer) {
                const label = translate('mode.switch.to_app', 'Use the Anchor app instead')
                elements.push(switchButton(label, 'text', () => switchOffer.onSelect()))
            }

            ui?.prompt({
                title: translate('web.waiting.title', 'Approve in Anchor'),
                body: translate('web.waiting.body', 'Please approve this in the Anchor window.'),
                elements,
            }).catch(() => undefined)

            const checkClosedInterval = setInterval(() => {
                if (popup.closed) {
                    clearInterval(checkClosedInterval)
                    reject(new AnchorRequestCancelledError())
                }
            }, 1000)

            waitForCallback(receiveOptions, this.options.buoyWs, t)
                .then((response) => {
                    popup.close()
                    resolve({payload: response})
                })
                .catch((error) => {
                    popup.close()
                    if (error instanceof Error && error.message === cancelledMessage) {
                        reject(new AnchorRequestCancelledError(error.message))
                    } else {
                        reject(error)
                    }
                })
                .finally(() => {
                    clearInterval(checkClosedInterval)
                })
        })
    }

    /** Popup blocked: offer a real link, which no popup blocker touches, and listen for the callback. */
    private promptManualOpen(
        url: string,
        receiveOptions: ReceiveOptions,
        ui: UserInterface | undefined
    ): Promise<{payload: CallbackPayload}> {
        return new Promise((resolve, reject) => {
            const t = ui?.getTranslate(this.options.id)
            const translate = (key: string, fallbackText: string) =>
                t ? t(key, {default: fallbackText}) : fallbackText
            const cancelledMessage = translate(
                'error.cancelled',
                'The request was cancelled from Anchor.'
            )
            const openLabel = translate('web.blocked.label', 'Open Anchor')
            ui?.prompt({
                title: translate('web.blocked.title', 'Pop-up blocked'),
                body: translate(
                    'web.blocked.body',
                    'Pop-up blocked by your browser. Open the Anchor window manually.'
                ),
                elements: [
                    {
                        type: 'link',
                        label: openLabel,
                        data: {
                            href: url,
                            label: openLabel,
                            variant: 'primary',
                        },
                    },
                ],
            }).catch(reject)

            waitForCallback(receiveOptions, this.options.buoyWs, t)
                .then((response) => resolve({payload: response}))
                .catch((error) => {
                    if (error instanceof Error && error.message === cancelledMessage) {
                        reject(new AnchorRequestCancelledError(error.message))
                    } else {
                        reject(error)
                    }
                })
        })
    }
}
