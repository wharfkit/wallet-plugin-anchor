import {send} from '@greymass/buoy'
import {
    CallbackPayload,
    Cancelable,
    Checksum256,
    LoginContext,
    PermissionLevel,
    PrivateKey,
    PromptElement,
    PromptResponse,
    PublicKey,
    ResolvedSigningRequest,
    Serializer,
    TransactContext,
    WalletPluginLoginResponse,
    WalletPluginSignResponse,
} from '@wharfkit/session'
import {
    clearTransactionHandoff,
    extractSignaturesFromCallback,
    generateReturnUrl,
    isAppleHandheld,
    isCallback,
    isKnownMobile,
    isSamePageReturn,
    LinkInfo,
    sealMessage,
    setTransactionCallback,
    storeTransactionHandoff,
    TransactionHandoff,
    verifyLoginCallbackResponse,
    waitForCallback,
    waitForPageReturn,
} from '@wharfkit/protocol-esr'

import {AnchorRequestCancelledError} from './errors'
import {switchButton} from './prompt'
import {IdentityRequestBundle, Translator, TransportOptions, WebFallback} from './types'

/** Drives the native Anchor apps over an `esr:` deep link, a QR code, and buoy. */
export class NativeTransport {
    constructor(private options: TransportOptions) {}

    async login(
        context: LoginContext,
        bundle: IdentityRequestBundle,
        t: Translator,
        fallback?: WebFallback
    ): Promise<WalletPluginLoginResponse> {
        if (!context.ui) {
            throw new Error('No UI available')
        }

        const {callback, request, sameDeviceRequest, requestKey, privateKey} = bundle

        const elements: PromptElement[] = [
            {
                type: 'link',
                label: t('login.link', {default: 'Launch Anchor'}),
                data: {
                    href: sameDeviceRequest.encode(true, false, 'esr:'),
                    label: t('login.link', {default: 'Launch Anchor'}),
                    variant: 'primary',
                },
            },
        ]

        // If we know this is NOT a mobile device, show the QR code
        if (!isKnownMobile()) {
            elements.unshift({
                type: 'qr',
                data: request.encode(true, false, 'esr:'),
            })
        }

        // An explicitly routed login carries the correction path from the start.
        if (fallback?.immediate) {
            elements.push(
                switchButton(
                    t('mode.switch.to_web', {default: 'Use Anchor in this browser instead'}),
                    'text',
                    () => fallback.onSelect()
                )
            )
        }

        // Automatically try to open the link
        window.location.href = sameDeviceRequest.encode(true, false, 'esr:')

        const promptResponse = context.ui.prompt({
            title: t('login.title', {default: 'Connect with Anchor'}),
            body: t('login.body', {
                default:
                    'Scan with Anchor on your mobile device or click the button below to open on this device.',
            }),
            elements,
        })

        promptResponse.catch(() => {
            // eslint-disable-next-line no-console
            console.info('Modal closed')
        })

        const fallbackTimer = fallback
            ? setTimeout(() => {
                  const offer = context.ui!.prompt({
                      title: t('login.title', {default: 'Connect with Anchor'}),
                      body: t('fallback.body', {
                          default: "Don't have the app?",
                      }),
                      elements: [
                          ...elements.filter((element) => element.type !== 'button'),
                          switchButton(
                              t('fallback.label', {default: 'Continue in this browser instead'}),
                              'secondary',
                              () => fallback.onSelect()
                          ),
                      ],
                  })
                  offer.catch(() => undefined)
              }, fallback.delayMs)
            : undefined

        const cancelledMessage = t('error.cancelled', {
            default: 'The request was cancelled from Anchor.',
        })
        try {
            const callbackResponse: CallbackPayload = await waitForCallback(
                callback,
                this.options.buoyWs,
                t
            )
            verifyLoginCallbackResponse(callbackResponse, context)

            if (!callbackResponse.cid || !callbackResponse.sa || !callbackResponse.sp) {
                throw new Error('Invalid callback response')
            }

            if (
                callbackResponse.link_ch &&
                callbackResponse.link_key &&
                callbackResponse.link_name
            ) {
                this.options.data.requestKey = requestKey
                this.options.data.privateKey = privateKey
                this.options.data.signerKey = PublicKey.from(callbackResponse.link_key)
                this.options.data.channelUrl = callbackResponse.link_ch
                this.options.data.channelName = callbackResponse.link_name

                try {
                    if (callbackResponse.link_meta) {
                        const metadata = JSON.parse(callbackResponse.link_meta)
                        this.options.data.sameDevice = metadata.sameDevice
                        this.options.data.launchUrl = metadata.launchUrl
                        this.options.data.triggerUrl = metadata.triggerUrl
                    }
                } catch (e) {
                    // link_meta is advisory; a malformed value must not fail the login
                }
            }

            const resolvedResponse = await ResolvedSigningRequest.fromPayload(
                callbackResponse,
                context.esrOptions
            )

            return {
                chain: Checksum256.from(callbackResponse.cid),
                permissionLevel: PermissionLevel.from({
                    actor: callbackResponse.sa,
                    permission: callbackResponse.sp,
                }),
                identityProof: resolvedResponse.getIdentityProof(callbackResponse.sig),
            }
        } catch (error) {
            if (error instanceof Error && error.message === cancelledMessage) {
                throw new AnchorRequestCancelledError(error.message)
            }
            throw error
        } finally {
            if (fallbackTimer) {
                clearTimeout(fallbackTimer)
            }
        }
    }

    async sign(
        resolved: ResolvedSigningRequest,
        context: TransactContext
    ): Promise<WalletPluginSignResponse> {
        if (!context.ui) {
            throw new Error('No UI available')
        }

        const data = this.options.data
        const t = context.ui.getTranslate(this.options.id)

        const expiration = resolved.transaction.expiration.toDate()
        const now = new Date()
        const expiresIn = Math.floor(expiration.getTime() - now.getTime())

        const modifiedRequest = await context.createRequest({transaction: resolved.transaction})

        modifiedRequest.setInfoKey('link', LinkInfo.from({expiration}))

        const callback = setTransactionCallback(modifiedRequest, this.options.buoyUrl)

        const request = modifiedRequest.encode(true, false)

        // Mobile will return true or false, desktop will return undefined
        const isSameDevice = data.sameDevice !== false

        const sameDeviceRequest = modifiedRequest.clone()
        const returnUrl = generateReturnUrl()
        sameDeviceRequest.setInfoKey('same_device', true)
        if (returnUrl) {
            sameDeviceRequest.setInfoKey('return_path', returnUrl)
        }

        const signManually = () => {
            context.ui?.prompt({
                title: t('transact.sign_manually.title', {default: 'Sign manually'}),
                body: t('transact.sign_manually.body', {
                    default:
                        'Scan the QR-code with Anchor on another device or use the button to open it here.',
                }),
                elements: [
                    {
                        type: 'qr',
                        data: String(request),
                    },
                    {
                        type: 'link',
                        label: t('transact.sign_manually.link.title', {default: 'Open Anchor'}),
                        data: {
                            href: String(sameDeviceRequest),
                            label: t('transact.sign_manually.link.title', {default: 'Open Anchor'}),
                        },
                    },
                ],
            })
        }

        const promptPromise: Cancelable<PromptResponse> = context.ui.prompt({
            title: t('transact.title', {default: 'Complete using Anchor'}),
            body: t('transact.body', {
                channelName: data.channelName,
                default: `Please open your Anchor Wallet on "${data.channelName}" to review and approve this transaction.`,
            }),
            elements: [
                {
                    type: 'countdown',
                    data: {
                        label: t('transact.await', {default: 'Waiting for response from Anchor'}),
                        end: expiration.toISOString(),
                    },
                },
                {
                    type: 'button',
                    label: t('transact.label', {default: 'Sign manually or with another device'}),
                    data: {
                        onClick: isSameDevice
                            ? () => (window.location.href = sameDeviceRequest.encode())
                            : signManually,
                        label: t('transact.label', {
                            default: 'Sign manually or with another device',
                        }),
                    },
                },
            ],
        })

        const timer = setTimeout(() => {
            promptPromise.cancel(
                t('error.expired', {default: 'The request expired, please try again.'})
            )
        }, expiresIn)

        promptPromise.catch(() => clearTimeout(timer))

        const callbackController = new AbortController()
        const deferCallbackUntilReturn = data.sameDevice && returnUrl && isSamePageReturn(returnUrl)
        const transactionHandoff: TransactionHandoff | null =
            deferCallbackUntilReturn && returnUrl
                ? {
                      version: 1,
                      returnUrl,
                      callback,
                      transactionId: String(resolved.transaction.id),
                      chainId: String(context.chain.id),
                      actor: String(context.permissionLevel.actor),
                      permission: String(context.permissionLevel.permission),
                      expiresAt: expiration.toISOString(),
                  }
                : null

        // iOS Safari can open the return_path in a fresh tab; persist enough for it to finish the ceremony.
        if (transactionHandoff) {
            storeTransactionHandoff(transactionHandoff)
        }

        // A WebSocket left open while Safari suspends this page can swallow the signature; connect after return.
        const callbackPromise = deferCallbackUntilReturn
            ? waitForPageReturn(returnUrl!, callbackController.signal).then(() =>
                  waitForCallback(callback, this.options.buoyWs, t)
              )
            : waitForCallback(callback, this.options.buoyWs, t)

        try {
            if (data.channelUrl) {
                const service = new URL(data.channelUrl).origin
                const channel = new URL(data.channelUrl).pathname.substring(1)
                const sealedMessage = await sealMessage(
                    (data.sameDevice ? sameDeviceRequest : modifiedRequest).encode(
                        true,
                        false,
                        'esr:'
                    ),
                    PrivateKey.from(data.privateKey),
                    PublicKey.from(data.signerKey)
                )
                const payload = Serializer.encode({object: sealedMessage}).array

                if (data.sameDevice) {
                    // Safari suspends this page the instant Anchor opens; the request must reach buoy first.
                    await send(payload, {service, channel})
                    if (data.launchUrl) {
                        window.location.href = data.launchUrl
                    } else if (isAppleHandheld()) {
                        window.location.href = 'anchor://link'
                    }
                } else {
                    send(payload, {service, channel})
                }
            } else {
                // If no channel is defined, fallback to the same device request and trigger immediately
                window.location.href = sameDeviceRequest.encode()
            }
        } catch (error) {
            clearTimeout(timer)
            // The abandoned page-return wait rejects on abort; swallow it.
            callbackPromise.catch(() => undefined)
            callbackController.abort()
            promptPromise.cancel()
            throw error
        }

        const callbackResponse = await Promise.race([callbackPromise, promptPromise]).finally(
            () => {
                clearTimeout(timer)
                callbackController.abort()
                promptPromise.cancel()
                if (transactionHandoff) {
                    clearTransactionHandoff(transactionHandoff)
                }
            }
        )

        const wasSuccessful =
            isCallback(callbackResponse) &&
            extractSignaturesFromCallback(callbackResponse).length > 0

        if (wasSuccessful) {
            const resolvedRequest = await ResolvedSigningRequest.fromPayload(
                callbackResponse,
                context.esrOptions
            )

            return {
                signatures: extractSignaturesFromCallback(callbackResponse),
                resolved: resolvedRequest,
            }
        }

        const errorString = t('error.not_completed', {default: 'The request was not completed.'})

        promptPromise.cancel(errorString)

        // This shouldn't ever trigger, but just in case
        throw new Error(errorString)
    }
}
