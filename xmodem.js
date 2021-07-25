#!/usr/bin/env node

import XModem, {PROTOCOLS} from './protocols/xmodem.js'
import SerialPort from 'serialport'
import fs from 'fs'
import { Command, Option } from 'commander'
import cliProgress from 'cli-progress'
import _colors from 'colors'

const program = new Command()

program
  .arguments('<port> <filename>')
  .addOption(new Option('-b, --baud <baud-rate>', 'the baud rate to use').default(19200))
  .addOption(new Option('-p, --protocol <protocol>', 'the protocol to use').choices(['xmodem', 'xmodem1k']).default('xmodem'))
  .description('Transmit the file over serial port using the xmodem protocol')
  .action((port, filename) => {
    const {baud, protocol} = program.opts()
    console.log(`Preparing to send file '${filename}' over port ${port}, baud: ${baud}`)

    const stats = fs.statSync(filename)

    let bar1
    let previousSent = 0
    let totalSent = 0
    let avgSent = '--'
    let startTime

    process.on('unhandledRejection', error => {
      if (bar1)
        bar1.stop()
      console.log('unhandledRejection', error)
      process.exit(1)
    })

    const connection = new SerialPort(port, {
      baudRate: parseInt(baud),
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      rtscts: true
    })

    process.on('SIGINT', () => {
      connection.close()
      process.exit()
    })

    const xmodem = new XModem({
      PROTOCOL: protocol === 'xmodem' ? PROTOCOLS.XMODEM : PROTOCOLS.XMODEM1K
    })

    xmodem
      .on('start', mode => {
        bar1 = new cliProgress.SingleBar({
          format: '{message} |' + _colors.cyan('{bar}') + '| {percentage}% || {value}/{total} bytes || {avgSent} b/s',
          barCompleteChar: '\u2588',
          barIncompleteChar: '\u2591',
          hideCursor: true,
        })

        startTime = Date.now()

        bar1.start(stats.size, 0, {message: `Sending with ${mode}`, avgSent})

        setInterval(() => {
          avgSent = (totalSent-previousSent)

          previousSent = totalSent
        }, 1000)

      })
      .on('status', (x) => {
        if (x.block) {
          totalSent = x.block * xmodem.block_size
          bar1.update(totalSent, {avgSent})
        }
      })
      .on('stop', () => {
        const totalTime = (Date.now() - startTime)/1000
        avgSent = Math.round(totalSent/totalTime)
        bar1.update(stats.size, {message: 'Sent', avgSent})
        bar1.stop()

        setTimeout(() => process.exit(), 1)
      })
      .on('error', x => {
        console.log(x)
        process.exit(1)
      })
      .send(connection, fs.readFileSync(filename))
  })

program.parse(process.argv)
