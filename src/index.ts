import {receive, send} from '@greymass/buoy'
import {
    AbstractWalletPlugin,
    CallbackPayload,
    Cancelable,
    Canceled,
    Checksum256,
    LoginContext,
    PermissionLevel,
    PrivateKey,
    PromptResponse,
    PublicKey,
    ResolvedSigningRequest,
    Serializer,
    TransactContext,
    WalletPluginConfig,
    WalletPluginLoginResponse,
    WalletPluginMetadata,
    WalletPluginSignResponse,
} from '@wharfkit/session'

import WebSocket from 'isomorphic-ws'

import {
    createIdentityRequest,
    sealMessage,
    setTransactionCallback,
    verifyLoginCallbackResponse,
} from './anchor'
import {LinkInfo} from './anchor-types'

import {extractSignaturesFromCallback, isCallback} from './esr'

import defaultTranslations from './translations'

interface WalletPluginOptions {
    buoyUrl?: string
    buoyWs?: WebSocket
}
export class WalletPluginAnchor extends AbstractWalletPlugin {
    chain: Checksum256 | undefined
    auth: PermissionLevel | undefined
    requestKey: PublicKey | undefined
    privateKey: PrivateKey | undefined
    signerKey: PublicKey | undefined
    channelUrl: string | undefined
    channelName: string | undefined
    buoyUrl: string
    buoyWs: WebSocket | undefined

    /**
     * The unique identifier for the wallet plugin.
     */
    id = 'anchor'

    /**
     * The translations for this plugin
     */
    translations = defaultTranslations

    constructor(options?: WalletPluginOptions) {
        super()

        this.buoyUrl = options?.buoyUrl || 'https://cb.anchor.link'
        this.buoyWs = options?.buoyWs
    }

    /**
     * The logic configuration for the wallet plugin.
     */
    readonly config: WalletPluginConfig = {
        // Should the user interface display a chain selector?
        requiresChainSelect: false,
        // Should the user interface display a permission selector?
        requiresPermissionSelect: false,
    }
    /**
     * The metadata for the wallet plugin to be displayed in the user interface.
     */
    readonly metadata: WalletPluginMetadata = {
        name: 'Anchor',
        description: '',
        logo: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYwIiBoZWlnaHQ9IjE2MCIgdmlld0JveD0iMCAwIDE2MCAxNjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxjaXJjbGUgY3g9IjgwIiBjeT0iODAiIHI9IjgwIiBmaWxsPSIjMzY1MEEyIi8+CjxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNODAuMDA2MyAzMEM4Mi4zMDUxIDMwIDg0LjQwMTkgMzEuMzEzNCA4NS40MDUgMzMuMzgxOEwxMDkuNDExIDgyLjg4MjJMMTA5Ljk1MyA4NEg5Ni42MTYzTDkyLjczNjYgNzZINjcuMjc1OUw2My4zOTYxIDg0SDUwLjA1OTRMNTAuNjAxNyA4Mi44ODE4TDc0LjYwNzcgMzMuMzgxOEM3NS42MTA4IDMxLjMxMzQgNzcuNzA3NSAzMCA4MC4wMDYzIDMwWk03Mi4xMjU2IDY2SDg3Ljg4N0w4MC4wMDYzIDQ5Ljc1MDFMNzIuMTI1NiA2NlpNOTcuOTk5NSAxMDFIMTEwLjAwNUMxMDkuNjQ0IDExNy4xNTIgOTYuMjczOCAxMzAgODAuMDA2MyAxMzBDNjMuNzM4OCAxMzAgNTAuMzY4NiAxMTcuMTUyIDUwLjAwNzggMTAxSDYyLjAxMzFDNjIuMjk0MSAxMDguMzU0IDY3LjE4MDQgMTE0LjYzMSA3NC4wMDAzIDExNi45OTZWOTNDNzQuMDAwMyA4OS42ODYzIDc2LjY4NjYgODcgODAuMDAwMyA4N0M4My4zMTQgODcgODYuMDAwMyA4OS42ODYzIDg2LjAwMDMgOTNWMTE3QzkyLjgyNjUgMTE0LjYzOCA5Ny43MTgzIDEwOC4zNTkgOTcuOTk5NSAxMDFaIiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4K',
        homepage: 'https://greymass.com/anchor',
        download: 'https://greymass.com/anchor/download',
    }
    /**
     * Performs the wallet logic required to login and return the chain and permission level to use.
     *
     * @param options WalletPluginLoginOptions
     * @returns Promise<WalletPluginLoginResponse>
     */
    login(context: LoginContext): Promise<WalletPluginLoginResponse> {
        return new Promise((resolve, reject) => {
            this.handleLogin(context)
                .then((response) => {
                    resolve(response)
                })
                .catch((error) => {
                    reject(error)
                })
        })
    }

    async handleLogin(context: LoginContext): Promise<WalletPluginLoginResponse> {
        if (!context.ui) {
            throw new Error('No UI available')
        }

        // Retrieve translation helper from the UI, passing the app ID
        const t = context.ui.getTranslate(this.id)

        // Create the identity request to be presented to the user
        const {callback, request, requestKey, privateKey} = await createIdentityRequest(
            context,
            this.buoyUrl
        )
        // Tell Wharf we need to prompt the user with a QR code and a button
        const promptResponse = context.ui?.prompt({
            title: t('login.title', {default: 'Connect with Anchor'}),
            body: t('login.body', {
                default:
                    'Scan with Anchor on your mobile device or click the button below to open on this device.',
            }),
            elements: [
                {
                    type: 'qr',
                    data: request.encode(true, false, 'esr:'),
                },
                {
                    type: 'link',
                    label: t('login.link', {default: 'Launch Anchor'}),
                    data: {
                        href: request.encode(true, false, 'esr:'),
                        label: t('login.link', {default: 'Launch Anchor'}),
                        variant: 'primary',
                    },
                },
            ],
        })

        promptResponse.catch((error) => {
            // Throw if what we caught was a cancelation
            if (error instanceof Canceled) {
                throw error
            }
        })

        // Await a promise race to wait for either the wallet response or the cancel
        const callbackResponse: CallbackPayload = await waitForCallback(callback, this.buoyWs, t)

        if (
            callbackResponse.link_ch &&
            callbackResponse.link_key &&
            callbackResponse.link_name &&
            callbackResponse.cid
        ) {
            verifyLoginCallbackResponse(callbackResponse, context)

            this.data.requestKey = requestKey
            this.data.privateKey = privateKey
            this.data.signerKey =
                callbackResponse.link_key && PublicKey.from(callbackResponse.link_key)
            this.data.channelUrl = callbackResponse.link_ch
            this.data.channelName = callbackResponse.link_name

            return {
                chain: Checksum256.from(callbackResponse.cid),
                permissionLevel: PermissionLevel.from({
                    actor: callbackResponse.sa,
                    permission: callbackResponse.sp,
                }),
            }
        } else {
            // Close the prompt
            promptResponse.cancel('Invalid response from Anchor.')

            throw new Error(
                t('error.invalid_response', {
                    default:
                        'Invalid response from Anchor, must contain link_ch, link_key, link_name and cid flags.',
                })
            )
        }
    }

    /**
     * Performs the wallet logic required to sign a transaction and return the signature.
     *
     * @param chain ChainDefinition
     * @param resolved ResolvedSigningRequest
     * @returns Promise<Signature>
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    sign(
        resolved: ResolvedSigningRequest,
        context: TransactContext
    ): Promise<WalletPluginSignResponse> {
        return this.handleSigningRequest(resolved, context)
    }

    private async handleSigningRequest(
        resolved: ResolvedSigningRequest,
        context: TransactContext
    ): Promise<WalletPluginSignResponse> {
        if (!context.ui) {
            throw new Error('No UI available')
        }

        // Retrieve translation helper from the UI, passing the app ID
        const t = context.ui.getTranslate(this.id)

        // Set expiration time frames for the request
        const expiration = resolved.transaction.expiration.toDate()
        const now = new Date()
        const expiresIn = Math.floor(expiration.getTime() - now.getTime())

        // Create a new signing request based on the existing resolved request
        const modifiedRequest = await context.createRequest({transaction: resolved.transaction})

        // Add the callback to the request
        const callback = setTransactionCallback(modifiedRequest, this.buoyUrl)

        const request = modifiedRequest.encode(true, false)

        const signManually = () => {
            context.ui?.prompt({
                title: t('transact.sign_manually.title', { default: 'Sign manually' }),
                body: t('transact.sign_manually.body', { default: 'Scan the QR-code with Anchor on another device or use the button to open it here.' }),
                elements: [
                    {
                        type: 'qr',
                        data: String(request),
                    },
                    {
                        type: 'link',
                        label: t('transact.sign_manually.link.title', { default: 'Open Anchor' }),
                        data: {
                            href: String(request),
                            label: t('transact.sign_manually.link.title', { default: 'Open Anchor' }),
                        },
                    },
                ],
            })
        }

        // Tell Wharf we need to prompt the user with a QR code and a button
        const promptPromise: Cancelable<PromptResponse> = context.ui.prompt({
            title: t('transact.title', {default: 'Complete using Anchor'}),
            body: t('transact.body', {
                channelName: this.data.channelName,
                default: `Please open your Anchor Wallet on "${this.data.channelName}" to review and approve this transaction.`,
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
                        href: modifiedRequest.encode(true, false, 'esr:'),
                        onClick: signManually,
                        label: t('transact.label', {
                            default: 'Sign manually or with another device',
                        }),
                    },
                },
            ],
        })

        // Create a timer to test the external cancelation of the prompt, if defined
        const timer = setTimeout(() => {
            if (!context.ui) {
                throw new Error('No UI available')
            }
            promptPromise.cancel(
                t('error.expired', {default: 'The request expired, please try again.'})
            )
        }, expiresIn)

        // Clear the timeout if the UI throws (which generally means it closed)
        promptPromise.catch(() => clearTimeout(timer))

        // Set the expiration on the request LinkInfo
        modifiedRequest.setInfoKey(
            'link',
            LinkInfo.from({
                expiration,
            })
        )

        // Wait for the callback from the wallet
        const callbackPromise = waitForCallback(callback, this.buoyWs, t)

        // Assemble and send the payload to the wallet
        const service = new URL(this.data.channelUrl).origin
        const channel = new URL(this.data.channelUrl).pathname.substring(1)
        const sealedMessage = sealMessage(
            modifiedRequest.encode(true, false, 'esr:'),
            PrivateKey.from(this.data.privateKey),
            PublicKey.from(this.data.signerKey)
        )

        send(Serializer.encode({object: sealedMessage}).array, {
            service,
            channel,
        })

        // Wait for either the callback or the prompt to resolve
        const callbackResponse = await Promise.race([callbackPromise, promptPromise]).finally(
            () => {
                // Clear the automatic timeout once the race resolves
                clearTimeout(timer)
            }
        )

        const wasSuccessful =
            isCallback(callbackResponse) &&
            extractSignaturesFromCallback(callbackResponse).length > 0

        if (wasSuccessful) {
            // If the callback was resolved, create a new request from the response
            const resolvedRequest = await ResolvedSigningRequest.fromPayload(
                callbackResponse,
                context.esrOptions
            )

            // Return the new request and the signatures from the wallet
            return {
                signatures: extractSignaturesFromCallback(callbackResponse),
                request: resolvedRequest.request,
            }
        }

        const errorString = t('error.not_completed', {default: 'The request was not completed.'})

        promptPromise.cancel(errorString)

        // This shouldn't ever trigger, but just in case
        throw new Error(errorString)
    }
}

async function waitForCallback(callbackArgs, buoyWs, t): Promise<CallbackPayload> {
    // Use the buoy-client to create a promise and wait for a response to the identity request
    const callbackResponse = await receive({...callbackArgs, WebSocket: buoyWs || WebSocket})

    if (!callbackResponse) {
        // If the promise was rejected, throw an error
        throw new Error(callbackResponse.rejected)
    }

    // If the promise was rejected, throw an error
    if (typeof callbackResponse.rejected === 'string') {
        throw new Error(callbackResponse.rejected)
    }

    // Process the identity request callback payload
    const payload = JSON.parse(callbackResponse) as CallbackPayload

    if (payload.sa === undefined || payload.sp === undefined || payload.cid === undefined) {
        throw new Error(t('error.cancelled', {default: 'The request was cancelled from Anchor.'}))
    }

    return payload
}
