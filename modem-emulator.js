import SerialPort from 'serialport'
import { Command, Option } from 'commander/esm.mjs'
import _colors from 'colors'
import Telnet from 'telnet-client'
import blessed from 'blessed'
import contrib from 'blessed-contrib'
import myTable from './blessed/table.js'
import net from 'net'

const Readline = SerialPort.parsers.Readline

const program = new Command();


let commandParser
let connection
let readLine
let telnetSession

const WINDOW_SIZE = 10;
const INTERVAL=1
// let receivedQueue = []
let totalReceived = 0
let previousReceived = 0

// let sentQueue = []
let totalSent = 0
let previousSent = 0

const xSeries = Array(60).fill().map(x => ' ')
const receivedYSeries = Array(60).fill().map(x => 0)
const sentYSeries = Array(60).fill().map(x => 0)

const receivedSeries = {
  title: 'Received',
  x: xSeries,
  y: receivedYSeries,
  style: {
    line: 'red'
   }
}
const sentSeries = {
  title: 'Sent',
  x: xSeries,
  y: sentYSeries,
  style: {
    line: 'blue'
   }}

let disp = {
  serialConnectionSettings: undefined,
  screen: undefined
}

// function updateQueue(queue, newValue) {
//     queue.push(newValue);
//     if (queue.length > WINDOW_SIZE)
//         queue.shift();
// }

// function getAverageValue(queue) {
//     if (queue.length < WINDOW_SIZE)
//         return "";

//     var sum = 0;
//     for (var i = 0; i < queue.length; i++) {
//         sum += queue[i];
//     }
//     return sum / queue.length / INTERVAL
// }

setInterval(() => {
  const avgReceived = (totalReceived-previousReceived)/INTERVAL
  const avgSent = (totalSent-previousSent)/INTERVAL

  previousReceived = totalReceived
  previousSent = totalSent

  receivedYSeries.push(avgReceived)
  sentYSeries.push(avgSent)

  receivedYSeries.shift()
  sentYSeries.shift()

  disp.telnetSession.setData({
    data: [
      ["host:", ""],
      ["status:", "closed"],
      ["Rcvd:", totalReceived],
      ["Sent:", totalSent],
    ]
  })

  disp.transferRate.setData([sentSeries, receivedSeries])

  disp.screen.render();

}, INTERVAL*1000)




function nullFunction() {

}

function monitorConnectionClose(data) {
  if(data.toString() === '+++') {
    disp.log.log('+++ Closing....')

    totalReceived = 0
    previousReceived = 0
    totalSent = 0
    previousSent = 0
  }
}

async function processCommand(cmd) {
  disp.log.log('COMMAND: ', cmd.toString())
  if(cmd === 'ATZ') {
      connection.write("OK\r\n");
      return;
  }

  if(cmd.startsWith("ATD")) {
    telnetSession = new net.Socket()

    //sotanomsxbbs.org
    //''
    try {
      await new Promise((res, rej) => telnetSession.connect(8888, '172.20.241.222', res))

      disp.telnetSession.setData({
        data: [
          ["host", "bbs.hispamsx.org"]
        ]
      })

      disp.screen.render();

      disp.log.log('Connected.')
      disp.log.log("OK")
      connection.write("OK\r\n");

      telnetSession.on('data', data => {
        totalReceived += data.length
        connection.write(data)
      })

      telnetSession.on('connect', d => disp.log.log('connect', d))
      telnetSession.on('error', d => disp.log.log('error', d))
      telnetSession.on('ready', d => disp.log.log('ready', d))
      telnetSession.on('drain', d => disp.log.log('drain', d))
      telnetSession.on('timeout', d => disp.log.log('timeout', d))
      telnetSession.on('lookup', d => disp.log.log('lookup', d))
      telnetSession.on('end', d => disp.log.log('end', d))
      telnetSession.on('close', d => disp.log.log('close', d))

      telnetSession.write("\r\n");

    } catch(err) {
      telnetSession = undefined
      disp.log.log(`ERR ${err.message}`)
      connection.write(`ERR ${err.message}\r\n`);
    }
  }
}

function processData(data) {
  totalSent += data.length
  telnetSession.write(data);
}

function reinitialiseSerialConnection() {
  readLine = new Readline({ delimiter: '\r\n' })
  commandParser = connection.pipe(readLine)
  commandParser.on('data', d => !telnetSession ? processCommand(d) : nullFunction())
  connection.on('data', monitorConnectionClose)
  connection.on('data', d => telnetSession ? processData(d) : nullFunction())
}

program
  .arguments('<port>')
  .addOption(new Option('-b, --baud <baud-rate>', 'the baud rate to use').default(38400))
  .description('Process AT commands and connect to internet hosted telnet/BBS servers')
  .action((port) => {

    setupBlessed()

    const {baud} = program.opts()

    connection = new SerialPort(port, {
      baudRate: parseInt(baud),
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      rtscts: true
    })
    disp.log.log('Serial port opened.')
    reinitialiseSerialConnection()

    disp.serialConnectionSettings.setData(
    { data: [
      [ 'port:',   port.toString() ],
      [ 'baud:', baud.toString()  ],
      [ 'data bits:', '8'],
      [ 'stop bits:', '1'],
      [ 'parity:', 'none'],
      [ 'flow ctrl:', 'hardward']
    ]});

    disp.screen.render();

  })


function setupBlessed() {

  disp.screen = blessed.screen({smartCSR: true});

  disp.screen.on('resize', () => {
    disp.serialConnectionSettings.height = `${11/disp.screen.height * 100}%`
    disp.telnetSession.height = `${11/disp.screen.height * 100}%`
    disp.screen.render();

  })

  disp.screen.key(['escape', 'C-c'], () => process.exit(0));

  disp.screen.title = 'Serial to telnet';

  disp.serialConnectionSettings = myTable(
    {
      left: "0%",
      keys: false
    , fg: 'white'
    , selectedFg: 'white'
    , selectedBg: 'blue'
    , interactive: false
    , label: 'Serial Connection Settings'
    , width: '25%'
    , height: '40%'
    , border: {type: "line", fg: "cyan"}
    , columnSpacing: 3 //in chars
    , columnWidth: [10, 10] /*in chars*/
  })

  disp.telnetSession = myTable(
    {
      left: "25%",
      keys: false
    , fg: 'white'
    , selectedFg: 'white'
    , selectedBg: 'blue'
    , interactive: false
    , label: 'Telnet Session'
    , width: '35%'
    , height: '40%'
    , border: {type: "line", fg: "cyan"}
    , columnSpacing: 3 //in chars
    , columnWidth: [7, 10] /*in chars*/
  })


  disp.telnetSession.setData({
    data: [
      ["host:", ""],
      ["status:", "closed"],
      ["Rcvd:", "0"],
      ["Sent:", "0"],
    ]
  })

  disp.log = contrib.log(
    {
      left: "60%",
      width: "40%",
      fg: "green"
    , selectedFg: "green"
    , border: {type: "line", fg: "cyan"}
    , label: 'Comms Log'
  })


  disp.transferRate = contrib.line(
    {
      top: '40%',
      width: "60%",
      height: "60%",
     border: {type: "line", fg: "cyan"},
     numYLabels: 20,
      style:
      { line: "yellow"
      , text: "green"
      , baseline: "black"}
    , xLabelPadding: 3
    , xPadding: 5
    , showLegend: true
    , wholeNumbersOnly: false,
    // maxY: 300,
    numYLabels: 4,
    //true=do not show fraction in y axis
     label: 'Bytes Sent/Reveived Rate'})

  disp.screen.append(disp.serialConnectionSettings);
  disp.screen.append(disp.telnetSession);
  disp.screen.append(disp.log);
  disp.screen.append(disp.transferRate);


  disp.serialConnectionSettings.focus();

  disp.screen.render();
}

program.parse(process.argv);


process.on('unhandledRejection', (reason, promise) => {
  disp.screen.destroy()
  console.log(reason, promise);
  setTimeout(() => process.exit())
});
