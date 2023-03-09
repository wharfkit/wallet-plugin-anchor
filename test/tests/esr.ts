import {assert, expect} from 'chai'
import {extractSignaturesFromCallback} from 'src/esr'
import {Signature} from '@wharfkit/session'
import {mockCallbackPayload} from '$test/utils/mock-esr'

suite('esr', () => {
    suite('extractSignaturesFromCallback', () => {
        test('should extract signatures from the callback payload', () => {
            const payload = mockCallbackPayload

            const expectedSignatures = [Signature.from(mockCallbackPayload.sig)]

            const actualSignatures = extractSignaturesFromCallback(payload)

            expect(actualSignatures).to.deep.equal(expectedSignatures)
        })
        test('should loop over signatures', () => {
            const payload = {
                ...mockCallbackPayload,
                sig0: 'SIG_K1_KdHDFseJF6paedvSbfHFZzhbtBDVAM8LxeDJsrG33sENRbUQMFHX8CvtT9wRLo4fE4QGYtbp1rF6BqNQ6Pv5XgSocXwM67',
                sig1: 'SIG_K1_K6PhJrD6wvjzVQRwTUd82fk3Z4jznnUszjeBH7xGCAsfByCunzSN2KQ2A9ALetFwLTqnK4xvES6Bstt6NNSvGgjgM1Tcxn',
                sig2: 'SIG_K1_KBub1qmdiPpWA2XKKEZEG3EfKJBf38GETHzbd4t3CBdWLgdvFRLCqbcUsBbbYga6jmxfdSFfodMdhMYraKLhEzjSCsiuMs',
            }
            const actualSignatures = extractSignaturesFromCallback(payload)
            expect(actualSignatures[0]).to.equal(Signature.from(mockCallbackPayload['sig']))
            if (
                !mockCallbackPayload['sig0'] ||
                !mockCallbackPayload['sig1'] ||
                !mockCallbackPayload['sig2']
            ) {
                assert.fail('Not all signatures exist.')
            }
            expect(actualSignatures[1]).to.equal(Signature.from(mockCallbackPayload['sig0']))
            expect(actualSignatures[2]).to.equal(Signature.from(mockCallbackPayload['sig1']))
            expect(actualSignatures[3]).to.equal(Signature.from(mockCallbackPayload['sig2']))
            expect(actualSignatures.length).to.equal(4)
        })
    })
})
