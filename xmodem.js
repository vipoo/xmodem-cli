#!/usr/bin/env node

import XModem, {PROTOCOLS} from './protocols/xmodem.js'
import SerialPort from 'serialport'
import fs from 'fs'
import { Command, Option } from 'commander'
import cliProgress from 'cli-progress'
import _colors from 'colors'
import net from 'net'

const program = new Command()

const isDigitsOnly = val => /^\d+$/.test(val)

function transmitFile({connection, filename, protocol}) {

  const stats = fs.statSync(filename)

  let previousSent = 0
  let totalSent = 0
  let avgSent = '--'
  let startTime
  let progressBar

  process.on('unhandledRejection', error => {
    if (progressBar)
      progressBar.stop()
    console.log('unhandledRejection', error)
    process.exit(1)
  })

  process.on('SIGINT', () => {
    if (connection.close)
      connection.close()

    process.exit()
  })

  const xmodem = new XModem({
    PROTOCOL: protocol === 'xmodem' ? PROTOCOLS.XMODEM : PROTOCOLS.XMODEM1K
  })

  xmodem
    .on('start', mode => {
      progressBar = new cliProgress.SingleBar({
        format: '{message} |' + _colors.cyan('{bar}') + '| {percentage}% || {value}/{total} bytes || {avgSent} b/s',
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        hideCursor: true,
      })

      startTime = Date.now()

      progressBar.start(stats.size, 0, {message: `Sending with ${mode}`, avgSent})

      setInterval(() => {
        avgSent = (totalSent-previousSent)

        previousSent = totalSent
      }, 1000)

    })
    .on('status', (x) => {
      if (x.block) {
        totalSent = x.block * xmodem.block_size
        progressBar.update(totalSent, {avgSent})
      }
    })
    .on('stop', () => {
      const totalTime = (Date.now() - startTime)/1000
      avgSent = Math.round(totalSent/totalTime)
      progressBar.update(stats.size, {message: 'Sent', avgSent})
      progressBar.stop()

      setTimeout(() => process.exit(), 1)
    })
    .on('error', x => {
      console.log(x)
      process.exit(1)
    })
    .send(connection, fs.readFileSync(filename))
}
program
  .argument('<port>', 'Serial or TCP port.  eg: COM3 for serial, or 2000 for TCP socket')
  .argument('<filename>', 'The file to be sent')
  .addOption(new Option('-b, --baud <baud-rate>', 'the baud rate to use, for serial ports only').default(19200))
  .addOption(new Option('-p, --protocol <protocol>', 'the protocol to use').choices(['xmodem', 'xmodem1k']).default('xmodem'))
  .description('Transmit the file over serial port using the xmodem protocol')
  .action((port, filename) => {
    const {baud, protocol} = program.opts()
    console.log(`Preparing to send file '${filename}' over port ${port}, baud: ${baud}`)

    if (isDigitsOnly(port)) {
      net.createServer(function (socket) {
        socket.on('close', () => setTimeout(() => process.exit(), 1))

        transmitFile({connection: socket, filename, protocol})

      }).listen(parseInt(port))

    } else {
      const connection = new SerialPort(port, {
        baudRate: parseInt(baud),
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        rtscts: true
      })

      transmitFile({connection, filename, protocol})
    }
  })

program.parse(process.argv)
