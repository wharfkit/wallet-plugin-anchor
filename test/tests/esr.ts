import {expect, assert} from 'chai'
import {extractSignaturesFromCallback} from 'src/esr'
import {Signature} from '@wharfkit/session'
import {mockCallbackPayload} from '$test/utils/mock-esr'

suite('esr', () => {
    suite('extractSignaturesFromCallback', () => {
        test('should extract signatures from the callback payload', () => {
            const payload = {
                ...mockCallbackPayload,
                sig0: 'SIG_K1_KdHDFseJF6paedvSbfHFZzhbtBDVAM8LxeDJsrG33sENRbUQMFHX8CvtT9wRLo4fE4QGYtbp1rF6BqNQ6Pv5XgSocXwM67',
                sig1: 'SIG_K1_K6PhJrD6wvjzVQRwTUd82fk3Z4jznnUszjeBH7xGCAsfByCunzSN2KQ2A9ALetFwLTqnK4xvES6Bstt6NNSvGgjgM1Tcxn',
                sig2: 'SIG_K1_KBub1qmdiPpWA2XKKEZEG3EfKJBf38GETHzbd4t3CBdWLgdvFRLCqbcUsBbbYga6jmxfdSFfodMdhMYraKLhEzjSCsiuMs',
            }
            const actualSignatures = extractSignaturesFromCallback(payload)

            expect(String(actualSignatures[0])).to.equal(payload['sig'])
            expect(String(actualSignatures[1])).to.equal(payload['sig0'])
            expect(String(actualSignatures[2])).to.equal(payload['sig1'])
            expect(String(actualSignatures[3])).to.equal(payload['sig2'])
            expect(actualSignatures.length).to.equal(4)
        })
    })
})
