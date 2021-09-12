import fs from 'fs'
import crc from 'crc'
import {EventEmitter} from 'events'
import debug from 'debug'

const SOH = 0x01
const STX = 0x02
const EOT = 0x04
const ACK = 0x06
const NAK = 0x15
// const CAN = 0x18 // not implemented
const FILLER = 0x1A
const CRC_MODE = 0x43 // 'C'

export const PROTOCOLS = {
  XMODEM: 1,
  XMODEM1K: 2
}

const debugLog = debug('xmodem')

export default class Xmodem extends EventEmitter {
  constructor(options = {}) {
    super()
    this.receive_interval_timer = false

    this.PROTOCOL = options.PROTOCOL || PROTOCOLS.XMODEM

    /**
  * how many timeouts in a row before the sender gives up?
  * @constant
  * @type {integer}
  * @default
  */
    this.XMODEM_MAX_TIMEOUTS = options.XMODEM_MAX_TIMEOUTS || 5

    /**
  * how many errors on a single block before the receiver gives up?
  * @constant
  * @type {integer}
  * @default
  */
    this.XMODEM_MAX_ERRORS = options.XMODEM_MAX_ERRORS || 10

    /**
  * how many times should receiver attempt to use CRC?
  * @constant
  * @type {integer}
  * @default
  */
    this.XMODEM_CRC_ATTEMPTS = options.XMODEM_CRC_ATTEMPTS || 3

    /**
  * Try to use XMODEM-CRC extension or not? Valid options: 'crc' or 'normal'
  * @constant
  * @type {string}
  * @default
  */
    this.XMODEM_OP_MODE = options.XMODEM_OP_MODE || 'crc'

    /**
  * First block number. Don't change this unless you have need for non-standard
  * implementation.
  * @constant
  * @type {integer}
  * @default
  */
    this.XMODEM_START_BLOCK = options.XMODEM_START_BLOCK || 1

    /**
  * default timeout period in seconds
  * @constant
  * @type {integer}
  * @default
  */
    this.timeout_seconds = options.timeout_seconds || 10

    /**
  * how many bytes (excluding header & checksum) in each block? Don't change this
  * unless you have need for non-standard implementation.
  * @constant
  * @type {integer}
  * @default
  */
    this.block_size = options.block_size || (this.PROTOCOL === PROTOCOLS.XMODEM1K ? 1024 : 128)

    this.packet_request_signal = this.PROTOCOL === PROTOCOLS.XMODEM1K ? STX : SOH
    this.packet_request_signal_name = this.PROTOCOL === PROTOCOLS.XMODEM1K ? 'STX' : this.packet_request_signal_name
  }

  /**
  * Send a file using XMODEM protocol
  * @method
  * @name Xmodem#send
  * @param {socket} socket - net.Socket() or Serialport socket for transport
  * @param {buffer} dataBuffer - Buffer() to be sent
  */
  send(socket, dataBuffer) {
    let blockNumber = this.XMODEM_START_BLOCK
    const packagedBuffer = new Array()
    let current_block = Buffer.alloc(this.block_size)
    let sent_eof = false

    // FILLER
    for(let i=0; i < this.XMODEM_START_BLOCK; i++) {
      packagedBuffer.push('')
    }

    while (dataBuffer.length > 0) {
      for(let i=0; i < this.block_size; i++) {
        current_block[i] = dataBuffer[i] === undefined ? FILLER : dataBuffer[i]
      }
      dataBuffer = dataBuffer.slice(this.block_size)
      packagedBuffer.push(current_block)
      current_block = Buffer.alloc(this.block_size)
    }

    /**
    * Ready to send event, buffer has been broken into individual blocks to be sent.
    * @event Xmodem#ready
    * @property {integer} - Indicates how many blocks are ready for transmission
    */
    this.emit('ready', packagedBuffer.length - 1) // We don't count the filler

    socket.on('data', data => {
      /*
      * Here we handle the beginning of the transmission
      * The receiver initiates the transfer by either calling
      * checksum mode or CRC mode.
      */
      if(data[0] === CRC_MODE && blockNumber === this.XMODEM_START_BLOCK) {
        debugLog('[SEND] - received C byte for CRC transfer!')
        this.XMODEM_OP_MODE = 'crc'
        if(packagedBuffer.length > blockNumber) {
          /**
      * Transmission Start event. A successful start of transmission.
      * @event Xmodem#start
      * @property {string} - Indicates transmission mode 'crc' or 'normal'
      */
          this.emit('start', this.XMODEM_OP_MODE)
          this._sendBlock(socket, blockNumber, packagedBuffer[blockNumber])
          this.emit('status', { action: 'send', signal: this.packet_request_signal_name, block: blockNumber })
          blockNumber++
        }
      }
      else if(data[0] === NAK && blockNumber === this.XMODEM_START_BLOCK) {
        debugLog('[SEND] - received NAK byte for standard checksum transfer!')
        this.XMODEM_OP_MODE = 'normal'
        if(packagedBuffer.length > blockNumber) {
          this.emit('start', this.XMODEM_OP_MODE)
          this._sendBlock(socket, blockNumber, packagedBuffer[blockNumber])
          this.emit('status', { action: 'send', signal: this.packet_request_signal_name, block: blockNumber })
          blockNumber++
        }
      }
      /*
  * Here we handle the actual transmission of data and
  * retransmission in case the block was not accepted.
  */
      else if(data[0] === ACK && blockNumber > this.XMODEM_START_BLOCK) {
        // Woohooo we are ready to send the next block! :)
        debugLog('ACK RECEIVED')
        this.emit('status', { action: 'recv', signal: 'ACK' })
        if(packagedBuffer.length > blockNumber) {
          this._sendBlock(socket, blockNumber, packagedBuffer[blockNumber])
          this.emit('status', { action: 'send', signal: this.packet_request_signal_name, block: blockNumber })
          blockNumber++
        }
        else if(packagedBuffer.length === blockNumber) {
          // We are EOT
          if(sent_eof === false) {
            sent_eof = true
            debugLog('WE HAVE RUN OUT OF STUFF TO SEND, EOT EOT!')
            this.emit('status', { action: 'send', signal: 'EOT' })
            socket.write(Buffer.from([EOT]))
          }
          else {
            // We are finished!
            debugLog('[SEND] - Finished!')
            this.emit('stop', 0)
          }
        }
      }
      else if(data[0] === NAK && blockNumber > this.XMODEM_START_BLOCK) {
        if (blockNumber === packagedBuffer.length && sent_eof) {
          debugLog('[SEND] - Resending EOT, because receiver responded with NAK.')
          this.emit('status', { action: 'send', signal: 'EOT' })
          socket.write(Buffer.from([EOT]))
        } else {
          debugLog('[SEND] - Packet corruption detected, resending previous block.')
          this.emit('status', { action: 'recv', signal: 'NAK' })
          blockNumber--
          if(packagedBuffer.length > blockNumber) {
            this._sendBlock(socket, blockNumber, packagedBuffer[blockNumber])
            this.emit('status', { action: 'send', signal: this.packet_request_signal_name, block: blockNumber })
            blockNumber++
          }
        }
      }
      else {
        debugLog('GOT SOME UNEXPECTED DATA which was not handled properly!')
        debugLog('===>')
        debugLog(data)
        debugLog('<===')
        debugLog('blockNumber: ' + blockNumber)
      }
    })

  }

  /**
  * Receive a file using XMODEM protocol
  * @method
  * @name Xmodem#receive
  * @param {socket} socket - net.Socket() or Serialport socket for transport
  * @param {string} filename - pathname where to save the transferred file
  */
  receive(socket, filename) {
    let blockNumber = this.XMODEM_START_BLOCK
    const packagedBuffer = new Array()
    let nak_tick = this.XMODEM_MAX_ERRORS * this.timeout_seconds * 3
    let crc_tick = this.XMODEM_CRC_ATTEMPTS
    let transfer_initiated = false
    let tryCounter = 0

    // FILLER
    for(let i=0; i < this.XMODEM_START_BLOCK; i++) {
      packagedBuffer.push('')
    }

    // Let's try to initate transfer with XMODEM-CRC
    if(this.XMODEM_OP_MODE === 'crc') {
      debugLog('CRC init sent')
      socket.write(Buffer.from([CRC_MODE]))
      this.receive_interval_timer = this._setIntervalX(() => {
        if (transfer_initiated === false) {
          debugLog('CRC init sent')
          socket.write(Buffer.from([CRC_MODE]))
        }
        else {
          clearInterval(this.receive_interval_timer)
          this.receive_interval_timer = false
        }
        // Fallback to standard XMODEM
        if (this.receive_interval_timer === false && transfer_initiated === false) {
          this.receive_interval_timer = this._setIntervalX(() => {
            debugLog('NAK init sent')
            socket.write(Buffer.from([NAK]))
            this.XMODEM_OP_MODE = 'normal'
          }, 3000, nak_tick)
        }
      }, 3000, (crc_tick - 1))
    }
    else {
      this.receive_interval_timer = this._setIntervalX(() => {
        debugLog('NAK init sent')
        socket.write(Buffer.from([NAK]))
        this.XMODEM_OP_MODE = 'normal'
      }, 3000, nak_tick)
    }

    socket.on('data', data => {

      tryCounter++
      debugLog('[RECV] - Received: ' + data.toString('utf-8'))
      debugLog(data)
      if(data[0] === NAK && blockNumber === this.XMODEM_START_BLOCK) {
        debugLog('[RECV] - received NAK byte!')
      }
      else if(data[0] === SOH && tryCounter <= this.XMODEM_MAX_ERRORS) {
        if(transfer_initiated === false) {
        // Initial byte received
          transfer_initiated = true
          clearInterval(this.receive_interval_timer)
          this.receive_interval_timer = false
        }

        receiveBlock(socket, blockNumber, data, this.block_size, this.XMODEM_OP_MODE, current_block => {
          debugLog(current_block)
          packagedBuffer.push(current_block)
          tryCounter = 0
          blockNumber++
        })
      }
      else if(data[0] === EOT) {
        debugLog('Received EOT')
        socket.write(Buffer.from([ACK]))
        blockNumber--
        for(let i = packagedBuffer[blockNumber].length - 1; i >= 0; i--) {
          if(packagedBuffer[blockNumber][i] === FILLER) {
            continue
          }
          else {
            packagedBuffer[blockNumber] = packagedBuffer[blockNumber].slice(0, i + 1)
            break
          }
        }
        // At this stage the packaged buffer should be ready for writing
        writeFile(packagedBuffer, filename, () => {
          if(socket.constructor.name === 'Socket') {
            socket.destroy()
          }
          else if(socket.constructor.name === 'SerialPort') {
            socket.close()
          }
        })
      }
      else {
        debugLog('GOT SOME UNEXPECTED DATA which was not handled properly!')
        debugLog('===>')
        debugLog(data)
        debugLog('<===')
        debugLog('blockNumber: ' + blockNumber)
      }
    })
  }

  /**
  * Internal helper function for scoped intervals
  * @private
  */
  _setIntervalX(callback, delay, repetitions) {
    let x = 0
    const intervalID = setInterval(() => {
      if (++x === repetitions) {
        clearInterval(intervalID)
        this.receive_interval_timer = false
      }
      callback()
    }, delay)

    return intervalID
  }


  _sendBlock(socket, blockNr, blockData) {
    let crcCalc = 0
    let sendBuffer = Buffer.concat([Buffer.from([this.packet_request_signal]),
      Buffer.from([blockNr]),
      Buffer.from([(0xFF - blockNr)]),
      blockData
    ])
    debugLog('SENDBLOCK! Data length: ' + blockData.length)
    debugLog(sendBuffer)
    if(this.XMODEM_OP_MODE === 'crc') {
      var crcString = crc.crc16xmodem(blockData).toString(16)
      // Need to avoid odd string for Buffer creation
      if(crcString.length % 2 == 1) {
        crcString = '0'.concat(crcString)
      }
      // CRC must be 2 bytes of length
      if(crcString.length === 2) {
        crcString = '00'.concat(crcString)
      }
      sendBuffer = Buffer.concat([sendBuffer, Buffer.from(crcString, 'hex')])
    }
    else {
    // Count only the blockData into the checksum
      for(let i = 3; i < sendBuffer.length; i++) {
        crcCalc = crcCalc + sendBuffer.readUInt8(i)
      }
      crcCalc = crcCalc % 256
      crcCalc = crcCalc.toString(16)
      if((crcCalc.length % 2) != 0) {
      // Add padding for the string to be even
        crcCalc = '0' + crcCalc
      }
      sendBuffer = Buffer.concat([sendBuffer, Buffer.from(crcCalc, 'hex')])
    }
    debugLog('Sending buffer with total length: ' + sendBuffer.length)
    socket.write(sendBuffer)
  }
}



function receiveBlock(socket, blockNr, blockData, block_size, mode, callback) {
  const cmd = blockData[0]
  const block = parseInt(blockData[1])
  const block_check = parseInt(blockData[2])
  let current_block
  const checksum_length = mode === 'crc' ? 2 : 1

  if(cmd === SOH) {
    if((block + block_check) === 0xFF) {
      // Are we expecting this block?
      if(block === (blockNr % 0x100)) {
        current_block = blockData.slice(3, blockData.length-checksum_length)
      }
      else {
        debugLog('ERROR: Synch issue! Received: ' + block + ' Expected: ' + blockNr)
        return
      }
    }
    else {
      debugLog('ERROR: Block integrity check failed!')
      socket.write(Buffer.from([NAK]))
      return
    }

    if(current_block.length === block_size) {
      socket.write(Buffer.from([ACK]))
      callback(current_block)
    }
    else {
      debugLog('ERROR: Received block size did not match the expected size. Received: ' + current_block.length + ' | Expected: ' + block_size)
      socket.write(Buffer.from([NAK]))
      return
    }
  }
  else {
    debugLog('ERROR!')
    return
  }
}

function writeFile(buffer, filename, callback) {
  debugLog('writeFile called')
  const fileStream = fs.createWriteStream(filename)
  fileStream.once('open', () => {
    debugLog('File stream opened, buffer length: ' + buffer.length)
    for(let i = 0; i < buffer.length; i++) {
      fileStream.write(buffer[i])
    }
    fileStream.end()
    debugLog('File written')
    callback()
  })
}

