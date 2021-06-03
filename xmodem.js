#!/usr/bin/env node

import xmodem from 'xmodem.js'
import SerialPort from 'serialport'
import fs from 'fs'
import { Command, Option } from 'commander/esm.mjs'
import cliProgress from 'cli-progress'
import _colors from 'colors'

const program = new Command();

program
  .arguments('<port> <filename>')
  .addOption(new Option('-b, --baud <baud-rate>', 'the baud rate to use').default(38400))
  .description('Transmit the file over serial port using the xmodem protocol')
  .action((port, filename) => {
    const {baud} = program.opts()
    console.log(`Preparing to send file '${filename}' over port ${port}, baud: ${baud}`)

    const stats = fs.statSync(filename)

    const bar1 = new cliProgress.SingleBar({
      format: '{message} |' + _colors.cyan('{bar}') + '| {percentage}% || {value}/{total} bytes',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true,
    });

    bar1.start(stats.size, 0, {message: 'Sending'});

    const connection = new SerialPort(port, {
      baudRate: baud,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      rtscts: true
    })

    xmodem
      .on('status', (x) => {
        if (x.block)
          bar1.update(x.block * xmodem.block_size);
      })
      .on('stop', () => {
        bar1.update(stats.size, {message: 'Sent'})
        bar1.stop()

        setTimeout(() => process.exit(), 1)
      })
      .send(connection, fs.readFileSync(filename))
  })

program.parse(process.argv);
