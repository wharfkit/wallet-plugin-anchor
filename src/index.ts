import {
    ChainDefinition,
    Checksum256,
    PermissionLevel,
    ResolvedSigningRequest,
    Signature,
    WalletPlugin,
    WalletPluginConfig,
    WalletPluginLoginOptions,
    WalletPluginLoginResponse,
    WalletPluginMetadata,
} from '@wharfkit/session'

export class WalletPluginTEMPLATE implements WalletPlugin {
    /**
     * The logic configuration for the wallet plugin.
     */
    readonly config: WalletPluginConfig = {
        // Should the user interface display a chain selector?
        requiresChainSelect: true,
        // Should the user interface display a permission selector?
        requiresPermissionSelect: false,
    }
    /**
     * The metadata for the wallet plugin to be displayed in the user interface.
     */
    readonly metadata: WalletPluginMetadata = {
        name: 'Wallet Plugin Template',
        description: 'A template that can be used to build wallet plugins!',
        logo: 'base_64_encoded_image',
        homepage: 'https://someplace.com',
        download: 'https://someplace.com/download',
    }
    /**
     * Performs the wallet logic required to login and return the chain and permission level to use.
     *
     * @param options WalletPluginLoginOptions
     * @returns Promise<WalletPluginLoginResponse>
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async login(options: WalletPluginLoginOptions): Promise<WalletPluginLoginResponse> {
        // Example response...
        return {
            chain: Checksum256.from(
                '73e4385a2708e6d7048834fbc1079f2fabb17b3c125b146af438971e90716c4d'
            ),
            permissionLevel: PermissionLevel.from('wharfkit1115@test'),
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
    async sign(chain: ChainDefinition, resolved: ResolvedSigningRequest): Promise<Signature> {
        // Example response...
        return Signature.from(
            'SIG_K1_KfqBXGdSRnVgZbAXyL9hEYbAvrZjcaxUCenD7Z3aX6yzf6MEyc4Cy3ywToD4j3SKkzSg7L1uvRUirEPHwAwrbg5c9z27Z3'
        )
    }
}
