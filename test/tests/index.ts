import chai, { expect } from 'chai';
import sinon from 'sinon';
import sinonChai from 'sinon-chai';
import { Server as MockServer } from 'mock-socket';
import * as buoy from '@greymass/buoy';
import { SessionKit, IdentityProof, PermissionLevel, Cancelable, ResolvedSigningRequest, PrivateKey } from '@wharfkit/session';

chai.use(sinonChai);

import { mockSessionKitArgs, mockSessionKitOptions } from '@wharfkit/mock-data';
import { SigningRequest } from '@wharfkit/session';
import { mockChainId, mockPrivateKey as mockPrivateKeyString } from '$test/utils/mock-config';
import { WalletPluginAnchor } from '$lib';
import { mockCallbackPayload as v2MockCallbackPayload } from '$test/utils/mock-esr';

const fakeURL = 'ws://localhost:8080';

const mockPermissionLevel = PermissionLevel.from('@test');

// We need to add the link_* values here:
const mockRequest = SigningRequest.identity({
    callback: fakeURL,
    account: mockPermissionLevel.actor,
    permission: mockPermissionLevel.permission,
});

const mockResolvedRequest: ResolvedSigningRequest = mockRequest.resolve(new Map(), mockPermissionLevel);

const mockPrivateKey = PrivateKey.from(mockPrivateKeyString)

const signature = mockPrivateKey.signDigest(mockResolvedRequest.signingDigest);

const mockCallbackPayload = mockResolvedRequest.getCallback([signature])?.payload

suite('wallet plugin', function () {
    this.timeout(120 * 1000);
    this.slow(5 * 1000);

    let mockServer;

    setup(() => {
        // Setup mock WebSocket server
        mockServer = new MockServer(fakeURL);

        // Replace the global WebSocket with the mock-socket's WebSocket
        global.WebSocket = WebSocket;

        console.log({mockCallbackPayload})

        // Mock buoy's receive and send to simulate WebSocket interactions
        sinon.stub(buoy, 'receive').resolves(JSON.stringify(mockCallbackPayload));
        sinon.stub(buoy, 'send');
    });

    test('login and sign', async function () {
        const kit = new SessionKit({
            ...mockSessionKitArgs,
            walletPlugins: [new WalletPluginAnchor({ buoyWs: new WebSocket(fakeURL), buoyUrl: fakeURL })],
            ui: {
                ...mockSessionKitArgs.ui,
                translate: (error) => error,
                getTranslate: () => (error) => error,
                onError: async () => {},
                onLogin: async () => {},
                onLoginComplete: async () => {},
                onTransact: async () => {},
                onTransactComplete: async () => {},
                prompt: () => new Promise(() => {}) as Cancelable<any>,
            },
        }, mockSessionKitOptions);

        // Simulate WebSocket message from the server
        mockServer.on('connection', socket => {
            socket.on('message', () => {
                // Respond with a mocked callback payload when a message is received
                socket.send(JSON.stringify(mockCallbackPayload));
            });
        });

        const { session, response } = await kit.login({
            chain: mockChainId,
            permissionLevel: mockPermissionLevel,
        });

        expect(String(session.chain.id)).to.equal(mockChainId);
        expect(String(session.actor)).to.equal(String(mockPermissionLevel.actor));
        expect(String(session.permission)).to.equal(String(mockPermissionLevel.permission));
        expect(response.identityProof).to.be.instanceOf(IdentityProof);
        // Add additional assertions as needed

        // Simulate a transact request
        const result = await session.transact(
            {
                action: {
                    authorization: [mockPermissionLevel],
                    account: 'eosio.token',
                    name: 'transfer',
                    data: {
                        from: mockPermissionLevel.actor,
                        to: 'wharfkittest',
                        quantity: '0.0001 EOS',
                        memo: 'wharfkit/session wallet plugin template',
                    },
                },
            },
            {
                broadcast: false,
            }
        );

        // Add assertions to validate the result of the transact request
        expect(String(result.signer.actor)).to.equal(String(mockPermissionLevel.actor));
        expect(String(result.signer.permission)).to.equal(String(mockPermissionLevel.permission));
        expect(result.signatures).to.be.length(1);
    });

    teardown(() => {
        mockServer.stop(); // Stop the mock WebSocket server
        sinon.restore(); // Restore original functions
    });
});
