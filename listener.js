import SerialPort from 'serialport'

function main() {
  const connection = new SerialPort('COM6', {
    // baudRate: 55930,
    // baudRate: 19200,
    baudRate: 57600/1.5,
    dataBits: 8,
    stopBits: 1,
    parity: 'none',
    rtscts: true
  })

  connection.on('data', x => console.log(x.toString()))

  // connection.write("DEAN");
}

main()
