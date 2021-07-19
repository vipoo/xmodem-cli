import SerialPort from 'serialport'
import { Command, Option } from 'commander/esm.mjs'
import _colors from 'colors'

const program = new Command();

let i = 1;
program
  .arguments('<port>')
  .addOption(new Option('-b, --baud <baud-rate>', 'the baud rate to use').default(19200))
  .description('Echo back all chars received')
  .action((port) => {
    const {baud} = program.opts()

    const connection = new SerialPort(port, {
      baudRate: parseInt(baud),
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      rtscts: true
    })

    connection.pause();

    console.log('Connection opened....')

    setInterval(() => {
      connection.get((err, s) => console.log(s, err))
      connection.set({rts: true, dtr: true, cts:true,  dsr: true})
    }, 1000)

    // setTimeout(() => connection.resume(), 10000)

    connection.on('data', data => {
      console.log(`-${data.toString()}-`)
      // connection.write(data)
      // connection.write("abcdefghijklmnopqrstuvwxyz")
    })

    // setInterval(() => {
    //   connection.get((err, s) => console.log(s, err))
    // }, 1000)

    setInterval(() => {
      // const data = "1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
      // const data = "1234567890abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
      const data = "1234567890123456789012345678901234567890123456789012345678901234567890123456789\r\n"
      console.log(data)
      connection.write(data)
    }, 2000)
  })

program.parse(process.argv);
