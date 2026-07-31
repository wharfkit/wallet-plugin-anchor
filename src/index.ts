import {
    AbstractWalletPlugin,
    ChainDefinition,
    Checksum256,
    LoginContext,
    Logo,
    PermissionLevel,
    PrivateKey,
    PublicKey,
    ResolvedSigningRequest,
    TransactContext,
    WalletPluginConfig,
    WalletPluginLoginResponse,
    WalletPluginMetadata,
    WalletPluginSignResponse,
} from '@wharfkit/session'
import {Checksum256Type} from '@wharfkit/antelope'
import {createIdentityRequest} from '@wharfkit/protocol-esr'

import WebSocket from 'isomorphic-ws'

import defaultTranslations from './translations'
import {resolveWebAuthenticatorUrl} from './chains'
import {
    AnchorMode,
    promptForMode,
    promptForRecovery,
    readLoginOptions,
    readMode,
    writeMode,
} from './mode'
import {AnchorRequestCancelledError} from './transports/errors'
import {NativeTransport} from './transports/native'
import {openAuthenticatorWindow, WebTransport} from './transports/web'
import {IdentityRequestBundle, Translator, TransportOptions} from './transports/types'

/** Options controlling Anchor's native and browser transports. */
export interface WalletPluginAnchorOptions {
    /** Buoy callback service URL. */
    buoyUrl?: string
    /** WebSocket override forwarded to Buoy callback handling. */
    buoyWs?: WebSocket
    /** Extra or replacement web-authenticator URLs keyed by chain ID. */
    webAuthenticatorUrls?: Record<string, string>
    /** Delay in milliseconds before app login offers the browser fallback. */
    webFallbackDelayMs?: number
    /** Explicit login route; omit it to ask on each supported-chain login. */
    mode?: AnchorMode
}

/** Default delay before app login offers the browser fallback, in milliseconds. */
export const DEFAULT_WEB_FALLBACK_DELAY_MS = 8000
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

    webAuthenticatorUrls: Record<string, string>
    webFallbackDelayMs: number

    private native: NativeTransport
    private web: WebTransport
    private loginModeOverride: AnchorMode | undefined

    /**
     * The unique identifier for the wallet plugin.
     */
    id = 'anchor'

    /**
     * The translations for this plugin
     */
    translations = defaultTranslations

    constructor(options?: WalletPluginAnchorOptions) {
        super()

        this.buoyUrl = options?.buoyUrl || 'https://cb.anchor.link'
        this.buoyWs = options?.buoyWs
        this.webAuthenticatorUrls = options?.webAuthenticatorUrls || {}
        this.webFallbackDelayMs = options?.webFallbackDelayMs ?? DEFAULT_WEB_FALLBACK_DELAY_MS

        // SessionKit.restore() reassigns `this.data`, so transports must read it live.
        const currentData = () => this.data
        const transportOptions: TransportOptions = {
            id: this.id,
            get data() {
                return currentData()
            },
            buoyUrl: this.buoyUrl,
            buoyWs: this.buoyWs,
        }
        this.native = new NativeTransport(transportOptions)
        this.web = new WebTransport(transportOptions)

        this.setMode(options?.mode)
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
    readonly metadata: WalletPluginMetadata = WalletPluginMetadata.from({
        name: 'Anchor',
        description: '',
        logo: Logo.from({
            dark: 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0idXRmLTgiPz4KPHN2ZyB3aWR0aD0iMTYwIiBoZWlnaHQ9IjE2MCIgdmlld0JveD0iMCAwIDI1NiAyNTYiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CiAgPGcgdHJhbnNmb3JtPSJtYXRyaXgoMS40NCwgMCwgMCwgMS40NCwgLTguNTAxOTI1LCAtNTcuMDc0NTcpIiBzdHlsZT0iIj4KICAgIDx0aXRsZT5XaGl0ZTwvdGl0bGU+CiAgICA8Y2lyY2xlIGN4PSI5NC43OTMiIGN5PSIxMjguNTI0IiByPSI4MCIgZmlsbD0iI0ZCRkRGRiIvPgogICAgPHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik0gOTQuNzk5IDc4LjUyNCBDIDk3LjA5OCA3OC41MjQgOTkuMTk1IDc5LjgzNyAxMDAuMTk4IDgxLjkwNiBMIDEyNC4yMDQgMTMxLjQwNiBMIDEyNC43NDYgMTMyLjUyNCBMIDExMS40MDkgMTMyLjUyNCBMIDEwNy41MyAxMjQuNTI0IEwgODIuMDY5IDEyNC41MjQgTCA3OC4xODkgMTMyLjUyNCBMIDY0Ljg1MyAxMzIuNTI0IEwgNjUuMzk1IDEzMS40MDYgTCA4OS40MDEgODEuOTA2IEMgOTAuNDA0IDc5LjgzNyA5Mi41MDEgNzguNTI0IDk0Ljc5OSA3OC41MjQgWiBNIDg2LjkxOSAxMTQuNTI0IEwgMTAyLjY4IDExNC41MjQgTCA5NC43OTkgOTguMjc0IEwgODYuOTE5IDExNC41MjQgWiBNIDExMi43OTMgMTQ5LjUyNCBMIDEyNC43OTggMTQ5LjUyNCBDIDEyNC40MzcgMTY1LjY3NiAxMTEuMDY3IDE3OC41MjQgOTQuNzk5IDE3OC41MjQgQyA3OC41MzIgMTc4LjUyNCA2NS4xNjIgMTY1LjY3NiA2NC44MDEgMTQ5LjUyNCBMIDc2LjgwNiAxNDkuNTI0IEMgNzcuMDg3IDE1Ni44NzggODEuOTc0IDE2My4xNTUgODguNzkzIDE2NS41MiBMIDg4Ljc5MyAxNDEuNTI0IEMgODguNzkzIDEzOC4yMSA5MS40OCAxMzUuNTI0IDk0Ljc5MyAxMzUuNTI0IEMgOTguMTA3IDEzNS41MjQgMTAwLjc5MyAxMzguMjEgMTAwLjc5MyAxNDEuNTI0IEwgMTAwLjc5MyAxNjUuNTI0IEMgMTA3LjYyIDE2My4xNjIgMTEyLjUxMSAxNTYuODgzIDExMi43OTMgMTQ5LjUyNCBaIiBmaWxsPSIjMzY1MEEyIi8+CiAgPC9nPgo8L3N2Zz4=',
            light: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYwIiBoZWlnaHQ9IjE2MCIgdmlld0JveD0iMCAwIDE2MCAxNjAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxjaXJjbGUgY3g9IjgwIiBjeT0iODAiIHI9IjgwIiBmaWxsPSIjMzY1MEEyIi8+CjxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNODAuMDA2MyAzMEM4Mi4zMDUxIDMwIDg0LjQwMTkgMzEuMzEzNCA4NS40MDUgMzMuMzgxOEwxMDkuNDExIDgyLjg4MjJMMTA5Ljk1MyA4NEg5Ni42MTYzTDkyLjczNjYgNzZINjcuMjc1OUw2My4zOTYxIDg0SDUwLjA1OTRMNTAuNjAxNyA4Mi44ODE4TDc0LjYwNzcgMzMuMzgxOEM3NS42MTA4IDMxLjMxMzQgNzcuNzA3NSAzMCA4MC4wMDYzIDMwWk03Mi4xMjU2IDY2SDg3Ljg4N0w4MC4wMDYzIDQ5Ljc1MDFMNzIuMTI1NiA2NlpNOTcuOTk5NSAxMDFIMTEwLjAwNUMxMDkuNjQ0IDExNy4xNTIgOTYuMjczOCAxMzAgODAuMDA2MyAxMzBDNjMuNzM4OCAxMzAgNTAuMzY4NiAxMTcuMTUyIDUwLjAwNzggMTAxSDYyLjAxMzFDNjIuMjk0MSAxMDguMzU0IDY3LjE4MDQgMTE0LjYzMSA3NC4wMDAzIDExNi45OTZWOTNDNzQuMDAwMyA4OS42ODYzIDc2LjY4NjYgODcgODAuMDAwMyA4N0M4My4zMTQgODcgODYuMDAwMyA4OS42ODYzIDg2LjAwMDMgOTNWMTE3QzkyLjgyNjUgMTE0LjYzOCA5Ny43MTgzIDEwOC4zNTkgOTcuOTk5NSAxMDFaIiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4K',
        }),
        homepage: 'https://greymass.com/anchor',
        download: 'https://greymass.com/anchor/download',
    })

    login(context: LoginContext): Promise<WalletPluginLoginResponse> {
        return this.handleLogin(context)
    }

    /** Override login routing until cleared; pass `undefined` to restore the chooser. */
    setMode(mode: AnchorMode | undefined) {
        if (mode === undefined) {
            this.loginModeOverride = undefined
            delete this.data.mode
            return
        }
        writeMode(this.data, mode)
        this.loginModeOverride = mode
    }

    /** Return the mode stored or inferred for signing; this does not imply a login override. */
    getMode(): AnchorMode | undefined {
        return readMode(this.data)
    }

    /** Open the chain's web authenticator in a user gesture; unsupported chains return `null`. */
    openWallet(chain?: ChainDefinition | Checksum256Type): Window | null {
        return WalletPluginAnchor.openWallet(chain, this.webAuthenticatorUrls)
    }

    /** Open a chain's web authenticator with URL overrides; unsupported chains return `null`. */
    static openWallet(
        chain?: ChainDefinition | Checksum256Type,
        webAuthenticatorUrls?: Record<string, string>
    ): Window | null {
        const chainId = chain && typeof chain === 'object' && 'id' in chain ? chain.id : chain
        const url = resolveWebAuthenticatorUrl(
            chainId as Checksum256Type | undefined,
            webAuthenticatorUrls
        )
        if (!url) {
            return null
        }
        return openAuthenticatorWindow(url)
    }

    async handleLogin(context: LoginContext): Promise<WalletPluginLoginResponse> {
        if (!context.ui) {
            throw new Error('No UI available')
        }

        const perCall = readLoginOptions(this.id, context.arbitrary)
        const t = context.ui.getTranslate(this.id)
        const webUrl = resolveWebAuthenticatorUrl(context.chain?.id, this.webAuthenticatorUrls)
        try {
            const bundle = (await createIdentityRequest(
                context,
                this.buoyUrl
            )) as IdentityRequestBundle

            // Native-only chain: the question has no second answer, so never ask it.
            if (!webUrl) {
                return await this.native.login(context, bundle, t)
            }

            const forcedMode = perCall.mode ?? this.loginModeOverride
            if (forcedMode) {
                writeMode(this.data, forcedMode)
                return await this.loginWithSwitch(context, bundle, t, webUrl, forcedMode, true)
            }

            const {mode, popup} = await this.chooseMode(context, bundle, t, webUrl)
            writeMode(this.data, mode)

            if (mode === 'web') {
                return await this.web.login(context, bundle, webUrl, popup)
            }
            // Freshly chosen: no immediate switch link, but still recover from a silent deep link.
            return await this.loginWithSwitch(context, bundle, t, webUrl, 'app', false)
        } catch (error) {
            if (!(error instanceof AnchorRequestCancelledError)) {
                throw error
            }
            return this.recoverLogin(context, t, webUrl)
        }
    }

    private async recoverLogin(
        context: LoginContext,
        t: Translator,
        webUrl?: string
    ): Promise<WalletPluginLoginResponse> {
        for (;;) {
            const bundle = (await createIdentityRequest(
                context,
                this.buoyUrl
            )) as IdentityRequestBundle
            const {mode, popup} = await this.chooseRecoveryMode(context, bundle, t, webUrl)
            writeMode(this.data, mode)

            try {
                return mode === 'web' && webUrl
                    ? await this.web.login(context, bundle, webUrl, popup)
                    : await this.native.login(context, bundle, t)
            } catch (error) {
                if (!(error instanceof AnchorRequestCancelledError)) {
                    throw error
                }
            }
        }
    }

    // The alternate transport needs its own identity request: two receivers on one channel race.
    private async loginWithSwitch(
        context: LoginContext,
        bundle: IdentityRequestBundle,
        t: Translator,
        webUrl: string,
        mode: AnchorMode,
        immediate: boolean
    ): Promise<WalletPluginLoginResponse> {
        const alternateBundle = (await createIdentityRequest(
            context,
            this.buoyUrl
        )) as IdentityRequestBundle
        const alternateUrl = this.web.loginUrl(context, alternateBundle, webUrl)

        let popup: Window | null = null
        let switchTo: () => void = () => undefined
        const switched = new Promise<'switched'>((resolve) => {
            switchTo = () => {
                if (mode === 'app') {
                    // Must happen inside the click, before any await.
                    popup = this.web.openWindow(alternateUrl)
                }
                resolve('switched')
            }
        })

        const primary =
            mode === 'app'
                ? this.native.login(context, bundle, t, {
                      immediate,
                      delayMs: this.webFallbackDelayMs,
                      onSelect: () => switchTo(),
                  })
                : this.web.login(context, bundle, webUrl, undefined, {onSelect: () => switchTo()})

        // The loser of the race is abandoned; swallow its eventual rejection.
        primary.catch(() => undefined)

        const winner = await Promise.race([primary.then(() => 'primary' as const), switched])
        if (winner === 'primary') {
            return primary
        }

        const next: AnchorMode = mode === 'app' ? 'web' : 'app'
        writeMode(this.data, next)
        return next === 'web'
            ? this.web.login(context, alternateBundle, webUrl, popup)
            : this.native.login(context, alternateBundle, t)
    }

    /** The browser popup opens inside the click handler, before this promise resolves. */
    private chooseMode(
        context: LoginContext,
        bundle: IdentityRequestBundle,
        t: Translator,
        webUrl: string
    ): Promise<{mode: AnchorMode; popup?: Window | null}> {
        return new Promise((resolve, reject) => {
            const url = this.web.loginUrl(context, bundle, webUrl)
            const prompt = promptForMode(context, t, (mode) => {
                if (mode === 'web') {
                    resolve({mode, popup: this.web.openWindow(url)})
                } else {
                    resolve({mode})
                }
            })
            prompt.catch(reject)
        })
    }

    private chooseRecoveryMode(
        context: LoginContext,
        bundle: IdentityRequestBundle,
        t: Translator,
        webUrl?: string
    ): Promise<{mode: AnchorMode; popup?: Window | null}> {
        return new Promise((resolve, reject) => {
            const prompt = promptForRecovery(context, t, Boolean(webUrl), (mode) => {
                if (mode === 'web' && webUrl) {
                    const url = this.web.loginUrl(context, bundle, webUrl)
                    resolve({mode, popup: this.web.openWindow(url)})
                } else {
                    resolve({mode})
                }
            })
            prompt.catch(reject)
        })
    }

    sign(
        resolved: ResolvedSigningRequest,
        context: TransactContext
    ): Promise<WalletPluginSignResponse> {
        return this.handleSign(resolved, context)
    }

    private async handleSign(
        resolved: ResolvedSigningRequest,
        context: TransactContext
    ): Promise<WalletPluginSignResponse> {
        // Never asks a question; v1.x sessions predate the concept and are always native.
        const mode = readMode(this.data) || 'app'

        if (mode === 'web') {
            const webUrl = resolveWebAuthenticatorUrl(context.chain?.id, this.webAuthenticatorUrls)
            if (!webUrl) {
                throw new Error(
                    `This session signs in the browser, but there is no Anchor web authenticator for chain ${context.chain?.id}.`
                )
            }
            return this.web.sign(resolved, context, webUrl)
        }

        return this.native.sign(resolved, context)
    }
}

export {DEFAULT_WEB_AUTHENTICATOR_URLS} from './chains'
export type {AnchorLoginOptions, AnchorMode} from './mode'
