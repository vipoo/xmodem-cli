## Xmodem cli tool

A simple tool to transmit a file over a COM/Serial Port using the XMODEM protocol

### Dependencies

* Requires node 16.3.0 or higher

### Download Release

You can download pre-build binaries for your OS within project's github releases.

### Installing via git clone

```
git clone git@github.com:vipoo/xmodem-cli.git

npm ci
```


### Usage:

```
Usage: xmodem [options] <port> <filename>

Transmit the file over serial port using the xmodem protocol

Options:
  -b, --baud <baud-rate>     the baud rate to use (default: 19200)
  -p, --protocol <protocol>  the protocol to use (choices: "xmodem", "xmodem1k", default: "xmodem")
  -h, --help                 display help for command
```
