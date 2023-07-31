import {expect} from 'chai'
import {CallbackPayload, LoginContext, PrivateKey, SigningRequest, UInt64} from '@wharfkit/session'
import {
    createIdentityRequest,
    sealMessage,
    setTransactionCallback,
    verifyLoginCallbackResponse,
} from 'src/anchor'

import {zlib} from 'pako'

import {mockLoginContext} from '../utils/mock-context'
import {makeMockResolvedSigningRequest, mockCallbackPayload} from '$test/utils/mock-esr'
import {mockChainId2, mockPrivateKey, mockSignature1} from '$test/utils/mock-config'

suite('anchor', () => {
    suite('createIdentityRequest', () => {
        const mockBuoyUrl = 'https://mock-buoy-url.com'

        test('returns an object with request, callback, requestKey and privateKey properties', async () => {
            const result = await createIdentityRequest(mockLoginContext, mockBuoyUrl)

            expect(result).to.have.all.keys('request', 'callback', 'requestKey', 'privateKey')
        })

        test('returns a SigningRequest instance with the correct values', async () => {
            const {request} = await createIdentityRequest(mockLoginContext, mockBuoyUrl)

            expect(request).to.be.instanceOf(SigningRequest)
            expect(String(request.getIdentityScope())).to.equal('mock')
            expect(request.getInfoKey('link')).to.not.be.null
        })
    })

    suite('setTransactionCallback', () => {
        test('sets the callback on the request and returns the callback data', async () => {
            const resolved = await makeMockResolvedSigningRequest()
            const buoyUrl = 'https://example.com/buoy'
            const {service, channel} = setTransactionCallback(resolved, buoyUrl)

            const resolvedCallback = resolved.getCallback([mockSignature1])

            expect(service).to.equal('https://example.com/buoy')
            expect(channel).to.be.length(36)
            expect(resolvedCallback?.url).to.include('https://example.com/buoy')
        })
    })

    suite('sealMessage', () => {
        test('seals the given message with the given private and public keys', () => {
            const privateKey = PrivateKey.from(mockPrivateKey)
            const publicKey = privateKey.toPublic()
            const message = 'hello world'
            const nonce = UInt64.from(1234)
            const result = sealMessage(message, privateKey, publicKey, nonce)
            expect(result).to.have.property('from')
            expect(result).to.have.property('nonce', nonce)
            expect(result).to.have.property('ciphertext')
            expect(result).to.have.property('checksum')
        })
    })

    suite('verifyLoginCallbackResponse', () => {
        test('throws an error if there are no signatures in the response', () => {
            const context: LoginContext = mockLoginContext
            const callbackResponse = {}

            try {
                verifyLoginCallbackResponse(callbackResponse, context)
            } catch (error) {
                expect((error as Error).message).to.equal(
                    'Invalid response, must have at least one signature'
                )
            }
        })

        test('throws an error if the response is for the wrong chain id', () => {
            const context: LoginContext = mockLoginContext
            const callbackResponse: CallbackPayload = mockCallbackPayload
            try {
                verifyLoginCallbackResponse(
                    {
                        ...callbackResponse,
                        cid: mockChainId2,
                    },
                    context
                )
            } catch (error) {
                expect((error as Error).message).to.equal('Got response for wrong chain id')
            }
        })
    })
})
