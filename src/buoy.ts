import {Bytes, Name, PublicKey, Struct, TimePointSec, UInt32, UInt64} from '@wharfkit/session'

@Struct.type('buoy_message')
export class BuoyMessage extends Struct {
    @Struct.field('public_key') from!: PublicKey
    @Struct.field('uint64') nonce!: UInt64
    @Struct.field('bytes') ciphertext!: Bytes
    @Struct.field('uint32') checksum!: UInt32
}

@Struct.type('buoy_session')
export class BuoySession extends Struct {
    @Struct.field('name') session_name!: Name
    @Struct.field('public_key') request_key!: PublicKey
    @Struct.field('string', {extension: true}) user_agent?: string
}

@Struct.type('buoy_info')
export class BuoyInfo extends Struct {
    @Struct.field('time_point_sec') expiration!: TimePointSec
}
